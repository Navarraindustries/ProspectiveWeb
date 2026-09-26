"""Segmentation router — auto-thresholds and full VTK marching-cubes pipeline."""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException

from models import AutoThresholdResult, SegmentRequest, SegmentResult
from models.detection import Position3D
from models.segmentation import (CeilingCompareRequest, CeilingCompareResult,
                                 ComparedCandidate, PreviewRequest,
                                 PreviewResult, SuggestedBand)
from services              import mesh_backup, progress
from services.sessions     import read_state, session_exists, session_subdir, write_state, mesh_url
from services.thresholds   import compute_auto_thresholds, strategy_hint
from services.dicom_loader import DicomLoadResult, load_series
from services.segmentation import (
    SegmentationPipeline, SegmentationResult, write_vtp,
    voxel_fraction as seg_voxel_fraction,
    level_to_smooth_iters, level_to_cleanup_mm3,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["segmentation"])

# Thread-pool for CPU-bound DICOM + VTK work (keeps the event loop free)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="seg-worker")

# Una sola segmentación tubular a la vez, en todo el proceso. La guarda de
# memoria (_tubular_guard) mide UN trabajo: dos de Case 3 a la vez (dos
# pestañas, un doble clic) necesitan 2,6–3,8 GB (1,3 GB cada uno a media
# resolución, sobre todo por load_series; 1,9 GB a resolución nativa), y la
# máquina de producción tiene 2 GB. El segundo recibe un 409 en vez de esperar
# en cola: así sabe que el suyo no ha empezado. El umbral clásico no la ocupa.
_TUBULAR_SLOT = threading.Semaphore(1)

# Cap the largest volume axis fed to Marching Cubes. Larger volumes are
# integer-downsampled so segmentation stays responsive (a 384³ 3DRA drops from
# ~5 min / 2.7M verts to ~30 s / 460k verts). The MPR viewer keeps the full-res
# volume — only the mesh is coarsened, mirroring the desktop's preview downsample.
_SEG_MAX_AXIS = 256

# Ceiling for full_resolution. Marching cubes holds several float32 copies of the
# volume at once, so a 1030×512×512 CT (270 M voxels, ~1.1 GB per copy) would take
# the process down. The angiographic studies this option exists for are 50–60 M.
_FULL_RES_MAX_VOXELS = 120_000_000

# Tope de vóxeles del método tubular a resolución nativa (1 vCPU / 2 GB). Por
# encima se fuerza media resolución en vez de rechazar la petición.
_TUBULAR_MAX_VOXELS = 90_000_000

# Bytes por vóxel que reserva el método tubular en su pico, con margen. Por qué
# una guarda de memoria además del tope de vóxeles: medido en Case 3 (56,6 M
# vóxeles) el pico fue 1,86 GB, ≈ 33 B/vóxel — el volumen float32, las dos
# medidas de Frangi, etiquetas int32 y las máscaras a la vez —, y eso no cabe
# en la máquina de producción de 2 GB aunque el volumen esté muy por debajo de
# 90 M. El presupuesto lo da `_memory_budget_bytes()`.
_TUBULAR_BYTES_PER_VOXEL = 40

#: Fracción de la RAM disponible que puede tomar una segmentación, y el
#: presupuesto de respaldo si no se puede leer cuánta hay.
_MEM_BUDGET_FRACTION = 0.70
_MEM_BUDGET_FALLBACK_MB = 1400


def _available_memory_bytes() -> int | None:
    """RAM disponible ahora mismo según el sistema, o None si no se sabe.

    Linux: `MemAvailable` de /proc/meminfo (lo que se puede reservar sin
    paginar, cachés incluidas). Windows: `ullAvailPhys` de
    GlobalMemoryStatusEx vía ctypes. Nada más: sin dependencias nuevas.
    """
    try:
        with open("/proc/meminfo", encoding="ascii") as fh:
            for line in fh:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        pass
    if os.name == "nt":
        try:
            import ctypes

            class _MemoryStatusEx(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong),
                            ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong),
                            ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong),
                            ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

            st = _MemoryStatusEx()
            st.dwLength = ctypes.sizeof(_MemoryStatusEx)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
                return int(st.ullAvailPhys)
        except Exception:  # noqa: BLE001 — sin cifra queda el respaldo
            pass
    return None


def _memory_budget_bytes() -> int:
    """Presupuesto de memoria para una segmentación, leído en cada llamada.

    Orden: PROSPECTIVE_MEM_BUDGET_MB si está definida; si no, el 70 % de la RAM
    disponible detectada; si no se puede detectar, 1400 MB.

    Por qué detectarla: con 1400 MB fijos, el equipo de desarrollo (con memoria
    de sobra) forzaba media resolución en Case 3 —pide ≈ 2,1 GB a 40 B/vóxel—
    y escondía el resultado nativo, que es el que se validó. En un Lightsail
    de 2 GB la detección da ≈ 1,2–1,4 GB disponibles y el 70 % sigue forzando
    media resolución, que allí es lo correcto. El 30 % restante es el margen
    para el resto del proceso y lo que la guarda de 40 B/vóxel no ve.
    """
    env = os.environ.get("PROSPECTIVE_MEM_BUDGET_MB")
    if env:
        return int(env) * 1024 ** 2
    avail = _available_memory_bytes()
    if avail:
        return int(_MEM_BUDGET_FRACTION * avail)
    return _MEM_BUDGET_FALLBACK_MB * 1024 ** 2


def _tubular_guard(n_voxels: int) -> str:
    """Por qué el método tubular no puede ir a resolución nativa, o "" si puede."""
    if n_voxels > _TUBULAR_MAX_VOXELS:
        return (f"Volumen de {n_voxels / 1e6:.0f} millones de vóxeles (el tope son "
                f"{_TUBULAR_MAX_VOXELS / 1e6:.0f} millones): se segmenta a media "
                f"resolución para no agotar la memoria del servidor.")
    need = n_voxels * _TUBULAR_BYTES_PER_VOXEL
    budget = _memory_budget_bytes()
    if need > budget:
        return (f"Volumen de {n_voxels / 1e6:.1f} millones de vóxeles: a resolución nativa "
                f"necesitaría unos {need / 1024 ** 3:.1f} GB y el presupuesto de memoria "
                f"del servidor es de {budget / 1024 ** 3:.1f} GB, así que se segmenta a "
                f"media resolución.")
    return ""


# Voxels sampled when deriving auto-thresholds. Percentiles are stable well
# below this, and it keeps a 1 GB CT from being read whole just to get p90/p99.
_THRESHOLD_SAMPLE = 8_000_000


def _threshold_volume(session_id: str) -> "np.ndarray | None":
    """Subsampled copy of the session volume for threshold statistics.

    Reads the .npy the MPR service caches on upload (memmap → only the sampled
    voxels are actually read). Returns None if no volume is available yet, in
    which case the caller falls back to WC/WW.
    """
    try:
        from services.mpr import _cache_paths, ensure_volume_cached, _get_volume

        npy_path, _ = _cache_paths(session_id)
        if not npy_path.exists():
            ensure_volume_cached(session_id)  # idempotent; MPR needs it anyway
        vol = _get_volume(session_id)
        flat = vol.ravel()
        if flat.size > _THRESHOLD_SAMPLE:
            stride = int(np.ceil(flat.size / _THRESHOLD_SAMPLE))
            return np.asarray(flat[::stride], dtype=np.float32)
        return np.asarray(flat, dtype=np.float32)
    except Exception as exc:  # noqa: BLE001 — thresholds must never 500
        logger.warning("Threshold volume unavailable for %s (%s); using WC/WW", session_id, exc)
        return None


def _maybe_downsample(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    max_axis: int = _SEG_MAX_AXIS,
) -> tuple[np.ndarray, tuple[float, float, float], int]:
    """Integer-downsample the volume if its largest axis exceeds *max_axis*.

    Returns (volume, spacing, factor). factor == 1 means no change.
    """
    factor = max(1, math.ceil(max(volume.shape) / max_axis))
    if factor <= 1:
        return volume, spacing, 1
    return _downsample_by(volume, spacing, factor)


def _half_factor(shape: tuple[int, ...]) -> int:
    """Factor de «media resolución»: al menos 2, y el eje mayor a ≤ 256.

    Por qué no basta la regla de 256 de _maybe_downsample: en un volumen que ya
    cabe en 256 no haría nada, y quien pide (o recibe forzada) media resolución
    tiene que obtenerla de verdad.
    """
    return max(2, math.ceil(max(shape) / _SEG_MAX_AXIS))


def _downsample_by(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    factor: int,
) -> tuple[np.ndarray, tuple[float, float, float], int]:
    """Integer-downsample *volume* by *factor* on every axis."""
    ds = np.ascontiguousarray(volume[::factor, ::factor, ::factor])
    sp = (spacing[0] * factor, spacing[1] * factor, spacing[2] * factor)
    logger.info(
        "Downsampling volume %s -> %s (factor %d) for segmentation",
        volume.shape, ds.shape, factor,
    )
    return ds, sp, factor


# ── Helpers ────────────────────────────────────────────────────────────────── #

def _load_float(session_id: str, key: str, default: float) -> float:
    try:
        raw = read_state(session_id, key, "")
        return float(raw) if raw else default
    except (ValueError, Exception):
        return default


# ── GET /thresholds/{session_id} ───────────────────────────────────────────── #

@router.get(
    "/thresholds/{session_id}",
    response_model=AutoThresholdResult,
    summary="Get auto-computed thresholds",
    description=(
        "Returns the automatically computed lower/upper HU thresholds for the "
        "DICOM series loaded in this session, along with the strategy key and a "
        "Spanish clinical hint string.\n\n"
        "Thresholds are derived from the **actual voxel distribution** (which is "
        "what detects DSA subtraction, display-preset windows, etc.). The volume "
        "is read from the MPR cache and subsampled, so the call stays fast; if no "
        "volume is available yet it falls back to WindowCenter/WindowWidth.\n\n"
        "Strategies: `ct_stats`, `ct_wc_ww`, `xa_band_pass`, `xa_wc_ww`, "
        "`xa_window_mismatch`, `xa_raw16`, `dsa`, `mr_percentile`, `wc_ww`."
    ),
)
async def get_thresholds(session_id: str) -> AutoThresholdResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    # Read DICOM metadata persisted by upload router
    modality      = read_state(session_id, "dicom.modality",       "CT")
    window_center = _load_float(session_id, "dicom.window_center", 400.0)
    window_width  = _load_float(session_id, "dicom.window_width",  1500.0)

    # Thresholds MUST see the voxel distribution: the WC/WW header is often a
    # display preset (e.g. a DSA reading 0/1000, or a 3DRA reading 0/200) and
    # deriving the band from it alone segments background instead of vessels.
    loop = asyncio.get_event_loop()
    volume = await loop.run_in_executor(_executor, partial(_threshold_volume, session_id))

    lower, upper, strategy = compute_auto_thresholds(
        volume=volume,
        modality=modality,
        window_center=window_center,
        window_width=window_width,
    )

    is_dsa = strategy == "dsa"
    hint   = strategy_hint(strategy, lower, upper, is_dsa)

    # Best-effort: if a previous segmentation stored the voxel fraction, use it
    vf_str = read_state(session_id, "seg.voxel_fraction", "")
    vf     = float(vf_str) if vf_str else None

    return AutoThresholdResult(
        lower=lower,
        upper=upper,
        strategy=strategy,
        is_dsa=is_dsa,
        hint=hint,
        voxel_fraction=vf,
    )


# ── POST /segment ──────────────────────────────────────────────────────────── #

@router.post(
    "/segment",
    response_model=SegmentResult,
    summary="Run segmentation pipeline",
    description=(
        "Loads the DICOM volume from disk, applies the requested lower/upper thresholds, "
        "and runs the full VTK Marching-Cubes pipeline (smoothing + decimation + normals). "
        "Returns the mesh URL (.vtp) ready for vtk.js rendering.\n\n"
        "**Processing time:** 5–60 s depending on volume size and smoothing level. "
        "Use the WebSocket `/ws/progress/{session_id}` endpoint to stream progress updates."
    ),
)
async def segment(req: SegmentRequest) -> SegmentResult:
    if not session_exists(req.session_id):
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")

    dicom_dir  = session_subdir(req.session_id, "dicom")
    meshes_dir = session_subdir(req.session_id, "meshes")

    if not any(dicom_dir.iterdir()):
        raise HTTPException(
            status_code=422,
            detail="No DICOM files found in session. Did you upload files first?",
        )

    # Map API levels (0–10) to pipeline parameters
    smooth_iters = level_to_smooth_iters(req.smoothing)
    min_mm3, top_n, closing_mm = level_to_cleanup_mm3(req.cleanup)

    # full_resolution es el campo antiguo, con el significado inverso; si llega,
    # manda, para que el frontend que aún lo envía siga obteniendo lo que pide.
    if req.full_resolution is not None:
        half = not req.full_resolution
    elif req.method == "threshold" and "half_resolution" not in req.model_fields_set:
        # El umbral clásico sin ninguna de las dos banderas se comporta como
        # siempre: regla de 256 (_maybe_downsample). Un script o cliente que
        # nunca mandó la bandera no pasa de repente a resolución nativa, ni a
        # un 422 por tamaño en un volumen que antes segmentaba.
        half = True
    else:
        half = req.half_resolution

    work = partial(
        _run_segmentation_sync,
        session_id=   req.session_id,
        series_id=    req.series_id,
        dicom_dir=    dicom_dir,
        meshes_dir=   meshes_dir,
        lower=        req.lower,
        upper=        req.upper,
        smooth_iters= smooth_iters,
        min_mm3=      min_mm3,
        top_n=        top_n,
        closing_mm=   closing_mm,
        main_tree_only= req.main_tree_only,
        method=       req.method,
        reclaim_mm=   req.reclaim_mm,
        half_resolution= half,
    )

    tubular = req.method == "tubular"
    # La plaza se pide ANTES de abrir el progreso: si la misma sesión reintenta
    # mientras su trabajo corre, el rechazo no debe pisar el progreso del que
    # sigue en marcha (ni abrir uno en otra sesión que nunca empezó).
    if tubular and not _TUBULAR_SLOT.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail="Ya hay una segmentación tubular en curso; espera a que termine",
        )

    def job() -> SegmentResult:
        # La plaza se suelta en el hilo que hace el trabajo, cuando acaba de
        # verdad: si el cliente se va, la corrutina se cancela pero el hilo
        # sigue ocupando memoria, y otro trabajo no debe empezar hasta entonces.
        try:
            return work()
        finally:
            if tubular:
                _TUBULAR_SLOT.release()

    # Run heavy CPU work off the event loop. El progreso se abre aquí y se cierra
    # en TODAS las salidas: el WebSocket sólo se cierra cuando ve running=False.
    progress.start(req.session_id)
    loop = asyncio.get_event_loop()
    try:
        try:
            fut = loop.run_in_executor(_executor, job)
        except BaseException:
            if tubular:            # nunca llegó al hilo: nadie más la soltaría
                _TUBULAR_SLOT.release()
            raise
        result = await fut
    except ValueError as exc:
        progress.finish(req.session_id, ok=False, message=str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        progress.finish(req.session_id, ok=False, message=str(exc))
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BaseException as exc:
        # BaseException también: una cancelación (el cliente se va) no debe
        # dejar la barra en «running» para siempre. El hilo NO se detiene con
        # la cancelación: seguirá, escribirá la malla y limpiará la detección,
        # así que el progreso dirá «falló» aunque el disco acabe con la malla
        # nueva. Se acepta: el cliente que se fue no lo va a leer.
        progress.finish(req.session_id, ok=False, message=str(exc) or type(exc).__name__)
        if not isinstance(exc, Exception):
            raise
        logger.error("Segmentation failed for session %s: %s", req.session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Segmentation error: {exc}") from exc

    progress.finish(req.session_id, ok=True)
    return result


# ── GET /segment/suggested-band/{session_id} ───────────────────────────────── #

@router.get(
    "/segment/suggested-band/{session_id}",
    response_model=SuggestedBand,
    summary="Adaptive starting band from the volume histogram",
    description=(
        "Starting band + a robust value range for the sliders, derived from THIS "
        "volume's own intensity distribution via the SAME modality-aware logic the "
        "segmentation uses (compute_auto_thresholds). One source of truth: the live "
        "preview reflects the real result, and non-subtracted 3DRA/CTA start on the "
        "bright vasculature (~1%) instead of a generic p94 that grabbed ~6% of tissue."
    ),
)
async def suggested_band(session_id: str) -> SuggestedBand:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    loop = asyncio.get_event_loop()
    sample = await loop.run_in_executor(_executor, partial(_threshold_volume, session_id))
    if sample is None or sample.size == 0:
        # No volume cached yet → sensible CT-HU fallback.
        return SuggestedBand(lower=150.0, upper=500.0, vmin=-500.0, vmax=1500.0)
    s = np.asarray(sample, dtype=np.float32)
    vmin = float(np.percentile(s, 0.5))
    vmax = float(np.percentile(s, 99.9))
    # Start the sliders (and the live preview) at the SAME modality-aware band
    # the segmentation actually uses — one source of truth, no drift. A flat p94
    # ignored the modality and, on non-subtracted 3DRA/CTA, captured ~6% of
    # voxels (a solid tissue+skull blob) before the user even placed a seed.
    modality      = read_state(session_id, "dicom.modality", "CT")
    window_center = _load_float(session_id, "dicom.window_center", 400.0)
    window_width  = _load_float(session_id, "dicom.window_width", 1500.0)
    try:
        lower, upper, _strategy = compute_auto_thresholds(
            volume=s, modality=modality,
            window_center=window_center, window_width=window_width,
        )
    except Exception as exc:  # noqa: BLE001 — the slider band must never 500
        logger.warning("Auto-band failed for %s (%s); using p94 fallback", session_id, exc)
        lower, upper = float(np.percentile(s, 94.0)), vmax
    # Let the slider's top reach the computed band's upper: on subtracted DSA the
    # band's upper (≈ the bright vessel max) sits ABOVE p99.9, and clamping it down
    # to p99.9 would silently narrow the band, dropping the dense vessel cores.
    vmax = max(vmax, upper)
    # Bound to the robust slider range so the handles can always reach the band.
    lower = float(np.clip(lower, vmin, vmax))
    upper = float(np.clip(upper, lower, vmax))
    if upper <= lower:
        upper = lower + max(1.0, (vmax - vmin) * 0.05)
    return SuggestedBand(
        lower=round(lower, 1), upper=round(upper, 1),
        vmin=round(vmin, 1), vmax=round(vmax, 1),
    )


# ── POST /segment/preview/{session_id} ─────────────────────────────────────── #

@router.post(
    "/segment/preview/{session_id}",
    response_model=PreviewResult,
    summary="Fast coarse-mesh preview for interactive threshold tuning",
    description=(
        "Runs a downsampled marching-cubes pass (no full smoothing/decimation) with "
        "top-N component isolation, so the clinician sees the 3D vascular tree form "
        "in near-real-time as they move the sliders — like the desktop app."
    ),
)
async def segment_preview(session_id: str, req: PreviewRequest) -> PreviewResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    meshes_dir = session_subdir(session_id, "meshes")
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor, partial(_run_preview_sync, session_id, meshes_dir, req)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=409, detail="No hay volumen en la sesión. Sube un DICOM primero.")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Segment preview failed")
        raise HTTPException(status_code=500, detail=f"Error en la vista previa: {exc}")
    return result


def _run_preview_sync(session_id: str, meshes_dir: Path, req: PreviewRequest) -> PreviewResult:
    """Coarse preview mesh from the cached full-res volume (downsampled)."""
    from services.mpr import _get_volume, ensure_volume_cached

    meta = ensure_volume_cached(session_id)
    volume = np.asarray(_get_volume(session_id))
    spacing = tuple(float(s) for s in meta["spacing"])  # (sz, sy, sx)

    # The preview must filter exactly like the real run, or the mesh the user
    # tunes the sliders against is not the mesh they get.
    min_mm3, top_n, _closing = level_to_cleanup_mm3(req.cleanup)
    pipeline = SegmentationPipeline(
        threshold_hu=req.lower,
        threshold_max_hu=req.upper if req.upper > req.lower else 0.0,
        min_component_mm3=min_mm3,
        keep_top_n=top_n,
        min_component_verts=0,
    )
    seg = pipeline.run_fast_preview(volume, spacing, downsample=req.downsample)

    vtp_path = meshes_dir / "preview_mesh.vtp"
    write_vtp(seg.poly_data, vtp_path)
    vf = seg_voxel_fraction(volume, req.lower, req.upper)
    url = f"{mesh_url(session_id, 'preview_mesh.vtp')}?v={int(time.time() * 1000)}"
    return PreviewResult(mesh_url=url, vertices=seg.n_vertices, voxel_fraction=round(float(vf), 6))


# ── Synchronous worker (runs in thread-pool) ───────────────────────────────── #

_STEP_SUFFIX = re.compile(r" \d+/\d+$")


class _PhaseClock:
    """Publica cada fase en el progreso y cronometra cuánto dura.

    Una fase dura desde que se anuncia hasta que se anuncia la siguiente; los
    pasos «tubularidad 2/6» se acumulan bajo «tubularidad». Así phase_seconds
    cuenta exactamente lo que la interfaz enseñó, sin cronómetros aparte que
    puedan desalinearse de las fases.
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.seconds: dict[str, float] = {}
        self._t0 = self._t = time.perf_counter()
        self._cur: str | None = None

    def _close_current(self) -> None:
        now = time.perf_counter()
        if self._cur is not None:
            self.seconds[self._cur] = self.seconds.get(self._cur, 0.0) + (now - self._t)
        self._t = now

    def say(self, phase: str, pct: float) -> None:
        self._close_current()
        self._cur = _STEP_SUFFIX.sub("", phase)
        progress.update(self.session_id, phase, pct)

    def result(self) -> dict[str, float]:
        self._close_current()
        self._cur = None
        out = {k: round(v, 2) for k, v in self.seconds.items()}
        out["total"] = round(time.perf_counter() - self._t0, 2)
        return out


def _preprocessed_source(session_id: str, series_id: str) -> "DicomLoadResult | None":
    """El volumen preprocesado de la sesión, si es el que toca segmentar.

    «Aplicar preprocesamiento» reescribe la caché del volumen (`_volume.npy` y
    su meta) y dice «Vuelve a segmentar para usar el volumen preprocesado»,
    pero la segmentación releía el DICOM y el preprocesado no llegaba nunca a
    la malla. Devuelve la caché con la forma y el espaciado de su meta (el
    remuestreo los cambia) y sin leer el DICOM: en el servidor de 2 GB la
    carga del DICOM es el pico de memoria, y aquí se tiraría entera.

    None —y se segmenta el DICOM tal cual— si la sesión no está preprocesada,
    si falta la caché, o si se pide otra serie que la que construyó la caché
    (la del estado `dicom.series_id`): segmentarla con el volumen de la
    anterior sería medir otro estudio.
    """
    ops = read_state(session_id, "preprocess.ops", "") or ""
    if not ops:
        return None
    if (read_state(session_id, "dicom.series_id", "") or "") != (series_id or ""):
        return None
    from services.mpr import _cache_paths

    npy_path, meta_path = _cache_paths(session_id)
    if not (npy_path.exists() and meta_path.exists()):
        return None
    meta = json.loads(meta_path.read_text())
    vol = np.load(npy_path)

    def _state_float(key: str, default: float) -> float:
        try:
            return float(read_state(session_id, key, "") or default)
        except ValueError:
            return default

    logger.info("Segmenting the preprocessed volume of %s (%s), DICOM not read", session_id, ops)
    # Lo que la segmentación usa además del volumen: la modalidad (meta) y la
    # ventana del DICOM, que upload deja en el estado al activar la serie.
    return DicomLoadResult(
        volume=vol,
        spacing=tuple(float(v) for v in meta["spacing"]),
        origin=tuple(float(v) for v in meta.get("origin_mm") or (0.0, 0.0, 0.0)),
        modality=str(meta.get("modality") or read_state(session_id, "dicom.modality", "") or ""),
        series_uid=series_id,
        series_description=read_state(session_id, "dicom.description", "") or "",
        patient_name="",
        patient_id="",
        study_date="",
        window_center=_state_float("dicom.window_center", float(meta.get("wc", 0.0))),
        window_width=_state_float("dicom.window_width", float(meta.get("ww", 0.0))),
        n_slices=int(vol.shape[0]),
        is_projection=False,
        projection_warning=None,
        direction=tuple(meta.get("direction") or (1, 0, 0, 0, 1, 0, 0, 0, 1)),
        orientation_known=bool(meta.get("orientation_known", False)),
    )


def _run_segmentation_sync(
    session_id:    str,
    series_id:     str,
    dicom_dir:     Path,
    meshes_dir:    Path,
    lower:         float,
    upper:         float,
    smooth_iters:  int,
    min_mm3:       float,
    top_n:         int,
    closing_mm:    float,
    main_tree_only: bool = False,
    method:        str = "threshold",
    reclaim_mm:    float = 3.0,
    half_resolution: bool = False,
) -> SegmentResult:
    """Load DICOM → run VTK pipeline → write .vtp → update session state.

    Runs in a thread-pool worker to avoid blocking the asyncio event loop.
    `method` vale "threshold" por defecto aquí para quien llama directamente
    (tests, scripts); el endpoint siempre lo pasa explícito ("tubular" por
    defecto en la API).
    """
    clock = _PhaseClock(session_id)
    clock.say("carga", 0)
    # ── Load DICOM volume ──────────────────────────────────────────────────── #
    logger.info(
        "Loading DICOM series '%s' for session '%s' ...", series_id, session_id
    )
    dcm = _preprocessed_source(session_id, series_id) or load_series(series_id, dicom_dir)

    # ── Guard: reject non-volumetric series with an actionable message ─────── #
    # Localizers, scouts and 2D projections have one (or two) slices; marching
    # cubes yields an empty surface and the old "lower the threshold" hint was
    # misleading — the real problem is that there is no 3D volume to segment.
    if dcm.volume.ndim != 3 or min(dcm.volume.shape) < 3:
        raise ValueError(
            f"La serie tiene forma {tuple(dcm.volume.shape)}: es un localizador o "
            "proyección 2D, no un volumen 3D, y no puede segmentarse en una malla "
            "vascular. Selecciona la serie principal del estudio (la de mayor número "
            "de cortes)."
        )

    # Re-compute thresholds with the real volume (upgrades WC/WW estimate to p90/p99)
    # then override with what the user explicitly requested via req.lower/upper
    # (the user already saw the auto-thresholds and may have adjusted sliders)
    modality = dcm.modality
    _, _, strategy = compute_auto_thresholds(
        volume=dcm.volume,
        modality=modality,
        window_center=dcm.window_center,
        window_width=dcm.window_width,
    )
    is_dsa = strategy == "dsa"

    # Sin techo en el método tubular, pida lo que pida la petición. El techo es
    # una herramienta del umbral clásico para dejar fuera el hueso; aquí el
    # hueso lo quitan la puerta de tubularidad y el veto de lámina, y con el
    # techo automático el tubo de Case 3 perdía un tercio de sus vóxeles y se
    # partía en piezas (el centro de los vasos más llenos lo supera). Se fija
    # aquí, antes de la fracción de vóxeles, para que voxel_fraction y
    # seg.threshold_upper describan la misma banda que hizo la malla.
    if method == "tubular":
        upper = 0.0

    # Compute what fraction of voxels falls in the user-requested threshold band
    vf = seg_voxel_fraction(dcm.volume, lower, upper)

    # ── Build pipeline parameters ─────────────────────────────────────────── #
    # Cleanup discards connected components below a physical volume. See
    # _CLEANUP_MM3 for why this replaced "keep the N largest".
    pipeline = SegmentationPipeline(
        threshold_hu=        lower,
        threshold_max_hu=    upper if upper > lower else 0.0,
        smooth_iterations=   smooth_iters,
        smooth_pass_band=    0.06,
        target_reduction=    0.70,
        gaussian_sigma=      0.5,
        morpho_closing_mm=   closing_mm,
        min_component_mm3=   min_mm3,
        keep_top_n=          top_n,
        # One of min_component_mm3 / keep_top_n is active per level; the pipeline
        # default of 100 vertices must not filter on top of them (nor at level 0).
        min_component_verts= 0,
    )

    # ── Resolución ─────────────────────────────────────────────────────────── #
    fallback_note = ""
    n_voxels = int(np.prod(dcm.volume.shape))
    if method == "tubular":
        # El método tubular no rechaza un volumen grande: lo baja a media
        # resolución y lo dice, porque una malla algo más tosca sirve y un
        # proceso muerto por falta de memoria no (ver _tubular_guard).
        if not half_resolution:
            fallback_note = _tubular_guard(n_voxels)
            half_resolution = bool(fallback_note)
        if half_resolution:
            seg_volume, seg_spacing, ds_factor = _downsample_by(
                dcm.volume, dcm.spacing, _half_factor(dcm.volume.shape))
        else:
            seg_volume = np.ascontiguousarray(dcm.volume, dtype=np.float32)
            seg_spacing, ds_factor = tuple(dcm.spacing), 1
    elif not half_resolution:
        # Umbral clásico a resolución nativa: el antiguo full_resolution=True.
        if n_voxels > _FULL_RES_MAX_VOXELS:
            raise ValueError(
                f"Este volumen tiene {n_voxels / 1e6:.0f} millones de vóxeles; a "
                f"resolución completa la segmentación agotaría la memoria del "
                f"servidor (el límite son {_FULL_RES_MAX_VOXELS / 1e6:.0f} millones). "
                f"Segmenta a media resolución, o recorta el volumen antes."
            )
        seg_volume = np.ascontiguousarray(dcm.volume, dtype=np.float32)
        seg_spacing, ds_factor = tuple(dcm.spacing), 1
    else:
        # Umbral clásico a media resolución: la regla de 256 de siempre.
        seg_volume, seg_spacing, ds_factor = _maybe_downsample(dcm.volume, dcm.spacing)

    logger.info(
        "Segmenting (%s): lower=%.0f upper=%.0f smooth=%d min_mm3=%.1f top_n=%d shape=%s (ds=%d)",
        method, lower, upper, smooth_iters, min_mm3, top_n, seg_volume.shape, ds_factor,
    )

    if method == "tubular":
        from services.vascular_mask import MaskParams, build_vascular_mask
        from services.segmentation import mask_to_surface, surface_quality
        params = MaskParams(lower=lower, upper=0.0, reclaim_mm=reclaim_mm)   # sin techo: ver arriba
        # «hecho» y «superficie lista» son finales internos de cada etapa, no
        # fases de la interfaz: la fase siguiente ya los sustituye.
        mr = build_vascular_mask(
            seg_volume, seg_spacing, params,
            on_progress=lambda f, p: None if f == "hecho" else clock.say(f, 5 + 0.8 * p))
        if mr.stats.get("m0_vox", 1) == 0:
            # Lo mismo que dice el umbral clásico: «la máscara no contiene
            # ninguna superficie» no le decía al usuario qué tocar.
            raise ValueError(
                f"Ningún vóxel supera el umbral inferior de {lower:.0f} HU "
                f"(intensidad máxima del volumen = {float(seg_volume.max()):.0f}). "
                "Baja el umbral inferior."
            )
        del seg_volume
        if mr.fallback:
            fallback_note = (fallback_note + " " if fallback_note else "") + (
                "No se encontró ninguna semilla vascular ≥ 50 mm³ con este umbral: se usó la máscara de umbral "
                "rellena, sin filtrar por tubularidad. Baja el umbral inferior si falta contraste.")
        # Al menos 40 iteraciones con banda 0,05 (lo que fija el diseño): con
        # las 20 del nivel 3 del umbral clásico, Case 3 salía con 9 piezas y 39
        # aristas de borde en vez de 6 y 65 (Task 4), porque el suavizado corto
        # deja piezas pequeñas por encima del umbral de islas.
        poly = mask_to_surface(
            mr.mask, seg_spacing, smooth_iters=max(40, smooth_iters), pass_band=0.05,
            on_progress=lambda f, p: None if f == "superficie lista" else clock.say(f, 85 + 0.12 * p))
        mr.mask = None      # la máscara ya no hace falta; que no ocupe durante el guardado
        vox_mm3 = float(np.prod(seg_spacing))
        q = surface_quality(poly)
        seg_result = SegmentationResult(
            poly_data=poly, n_vertices=q["n_vertices"], n_triangles=q["n_triangles"],
            threshold_hu=lower, reduction_pct=45.0, n_fragments_removed=0,   # decimación nominal de mask_to_surface
            kept_fraction=float(mr.stats.get("kept_fraction", 1.0)), largest_removed_mm3=0.0)
        extra = dict(method="tubular",
                     reclaimed_mm3=round(mr.stats.get("reclaimed_vox", 0) * vox_mm3, 1),
                     vetoed_mm3=round(mr.stats.get("vetoed_vox", 0) * vox_mm3, 1),
                     boundary_edges=q["boundary_edges"], components=q["components"],
                     seeds=int(mr.stats.get("seeds", 0)))
        logger.info("Máscara tubular: %s", {k: v for k, v in mr.stats.items() if k != "thresholds"})
    else:
        clock.say("marching cubes", 20)
        seg_result = pipeline.run(seg_volume, seg_spacing)
        extra = dict(method="threshold")

    # ── Quedarse solo con el árbol, si se ha pedido ───────────────────────── #
    #
    # Va DESPUÉS de marching cubes y ANTES de escribir el .vtp, para que el
    # barrido de ramas de más abajo trabaje sobre el árbol y no cuente como
    # rama un trozo de cráneo.
    main_applied, main_warning, main_removed = False, "", 0
    if main_tree_only:
        from services.mesh_components import keep_main_tree
        mt = keep_main_tree(seg_result.poly_data)
        main_applied, main_warning, main_removed = mt.applied, mt.warning, len(mt.removed)
        if mt.applied:
            seg_result.poly_data = mt.poly
            seg_result.n_vertices = mt.poly.GetNumberOfPoints()
            seg_result.n_triangles = mt.poly.GetNumberOfPolys()
            if extra["method"] == "tubular":
                # Las cifras de calidad tienen que describir la malla que se
                # guarda, no la de antes del filtro (Case 3: 9 piezas → 1).
                from services.segmentation import surface_quality
                q = surface_quality(mt.poly)
                extra.update(boundary_edges=q["boundary_edges"], components=q["components"])
            logger.info("Árbol principal: %d → %d verts, %d piezas fuera",
                        mt.n_before, mt.n_after, main_removed)
        else:
            logger.info("Árbol principal no aplicado: %s", mt.warning)

    # ── Write VTP mesh ────────────────────────────────────────────────────── #
    clock.say("guardado", 98)
    vtp_name = "vessel_tree.vtp"
    vtp_path = meshes_dir / vtp_name
    # Re-segmenting used to wipe the history, so twenty minutes of cropping and
    # growing vanished the moment someone tried another threshold band. It is an
    # edit like any other: snapshot first, and it can be undone.
    mesh_backup.snapshot(session_id, "segment")
    write_vtp(seg_result.poly_data, vtp_path)

    # Las ramas se buscan AQUÍ, sobre el árbol entero, porque es el único
    # momento en que están todas. Recortar a una caja o una esfera sobrescribe
    # este mismo fichero —«re-run segmentation to restore»— y lo que quede fuera
    # deja de existir para cualquier análisis posterior. Congelado en
    # coordenadas de mundo, el resultado sigue cayendo donde debe sobre la malla
    # recortada, que es lo que permite seguir viendo dónde estaban.
    try:
        from services.branch_origins import scan_and_freeze
        scan_and_freeze(session_id, seg_result.poly_data)
    except Exception as exc:  # noqa: BLE001 — nunca hundir una segmentación por esto
        logger.warning("Branch scan skipped for session %s: %s", session_id, exc)

    url = mesh_url(session_id, vtp_name)
    # The .vtp filename is reused on every re-segmentation, so append a
    # generation token to the URL returned to the client — otherwise the
    # browser/vtk.js serves the previous mesh from cache (304 Not Modified).
    url_versioned = f"{url}?v={int(time.time() * 1000)}"

    # ── Lo medido sobre la malla ANTERIOR ya no describe nada ─────────────── #
    #
    # El recorte y el borrado ya invalidaban los candidatos, la morfometría y la
    # recomendación; segmentar de nuevo —que sustituye la malla ENTERA, no un
    # trozo— no lo hacía. Encontrado en vivo: el usuario resegmentó quitando el
    # techo del umbral, volvió a Detección y siguió viendo los cinco candidatos
    # de la malla vieja, con sus .vtp de cinco minutos antes. Conclusión
    # razonable y equivocada: «no detecta el aneurisma».
    from routers.detect import _clear_detection_state
    _clear_detection_state(session_id, meshes_dir, morphometry=True)

    # ── Persist metadata to session state ─────────────────────────────────── #
    write_state(session_id, "seg.mesh_url",       url)
    write_state(session_id, "seg.n_vertices",     str(seg_result.n_vertices))
    write_state(session_id, "seg.n_faces",        str(seg_result.n_triangles))
    write_state(session_id, "seg.voxel_fraction", f"{vf:.6f}")
    write_state(session_id, "seg.threshold_lower",str(lower))
    # El techo EFECTIVO (0 = sin techo en el método tubular): la detección
    # rehace el saco con esta banda, y tiene que ser la misma que hizo la malla.
    write_state(session_id, "seg.threshold_upper",str(upper))
    write_state(session_id, "seg.method",         method)
    # Para «Reanudar»: sin esto la malla a media resolución volvía etiquetada
    # «Nativa», y en un equipo de 2 GB Case 3 siempre va a media resolución.
    write_state(session_id, "seg.downsample_factor", str(ds_factor))
    write_state(session_id, "seg.fallback_note",  fallback_note)
    write_state(session_id, "seg.strategy",       strategy)
    # Volume geometry — needed by Session C (morphometry + aneurysm detection)
    # Geometría del volumen SEGMENTADO: el preprocesado (remuestreado) cuando lo
    # está, no la del DICOM original, aunque las claves digan «dicom.».
    write_state(session_id, "dicom.volume_z",     str(dcm.volume.shape[0]))
    write_state(session_id, "dicom.volume_y",     str(dcm.volume.shape[1]))
    write_state(session_id, "dicom.volume_x",     str(dcm.volume.shape[2]))
    write_state(session_id, "dicom.spacing_z",    str(dcm.spacing[0]))
    write_state(session_id, "dicom.spacing_y",    str(dcm.spacing[1]))
    write_state(session_id, "dicom.spacing_x",    str(dcm.spacing[2]))

    logger.info(
        "Segmentation complete — session=%s  verts=%d  tris=%d  vf=%.3f  url=%s",
        session_id, seg_result.n_vertices, seg_result.n_triangles, vf, url,
    )

    return SegmentResult(
        mesh_url=       url_versioned,
        voxel_fraction= vf,
        strategy=       strategy,
        is_dsa=         is_dsa,
        vertices=       seg_result.n_vertices,
        faces=          seg_result.n_triangles,
        downsample_factor=   ds_factor,
        kept_fraction=       seg_result.kept_fraction,
        fragments_removed=   seg_result.n_fragments_removed,
        largest_removed_mm3= round(seg_result.largest_removed_mm3, 1),
        main_tree_applied=   main_applied,
        main_tree_warning=   main_warning,
        main_tree_removed=   main_removed,
        threshold_lower=     lower,
        fallback_note=       fallback_note,
        phase_seconds=       clock.result(),
        **extra,
    )


# ── POST /segment/compare-ceiling/{session_id} ──────────────────────────────── #

@router.post(
    "/segment/compare-ceiling/{session_id}",
    response_model=CeilingCompareResult,
    summary="Detect with and without the band's upper limit, and contrast both",
    description=(
        "Segments and detects TWICE — with the ceiling and without it — and "
        "returns both candidate lists merged, saying which configuration each "
        "site comes from.\n\n"
        "Why it exists: the XA band is [p99, p99.9], and that ceiling drops the "
        "brightest voxels, which in a contrast 3DRA are the cores of the "
        "fullest vessels. The two annotated cases want OPPOSITE settings — in "
        "one, the lesion only appears without the ceiling; in the other, "
        "removing it pushes the lesion from rank 3 to rank 9, off the list. So "
        "the checkbox cannot have a global default.\n\n"
        "And it cannot be decided automatically: the obvious rule — drop the "
        "ceiling when it is cutting the tree — was measured and does not "
        "separate them (88% of what it removes are bridges in one case, 89% in "
        "the other). What actually decides is WHAT makes each lesion stand out, "
        "which is the thing nobody knows beforehand.\n\n"
        "Costs two segmentations and two detections. `full_resolution` must "
        "match what the segment button will use, or the ranks describe a mesh "
        "the user never gets. Both runs use the THRESHOLD method: the segment "
        "button now defaults to the tubular method, which has no ceiling and "
        "its own resolution factor, so against that default the ranks describe "
        "the threshold meshes, not the one the button produces. It does NOT "
        "touch the session: no mesh and no "
        "state are written, so choosing a configuration afterwards is a "
        "separate, explicit step."
    ),
)
async def compare_ceiling(
    session_id: str, req: CeilingCompareRequest
) -> CeilingCompareResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    from services.ceiling_compare import comparar_techo
    from services.mpr import _get_volume, ensure_volume_cached

    try:
        meta = ensure_volume_cached(session_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=409,
            detail="No hay volumen en la sesión. Sube un DICOM primero.")

    volume = np.asarray(_get_volume(session_id))
    spacing = tuple(float(s) for s in meta["spacing"])
    modality = read_state(session_id, "dicom.modality", "XA")

    # La comparación tiene que correr sobre el MISMO volumen que va a usar el
    # botón de segmentar. Si aquí se midiera a resolución completa y luego se
    # segmentara diezmado —o al revés—, los puestos que enseña la comparación
    # serían de una malla que el usuario no llega a ver nunca. Ojo: esto sólo
    # se cumple si el botón usa el método clásico («threshold»). Con el método
    # tubular (por defecto) no hay techo que comparar y la resolución sigue
    # otra regla, así que esta comparación describe las mallas del umbral.
    if req.full_resolution:
        n_voxels = int(np.prod(volume.shape))
        if n_voxels > _FULL_RES_MAX_VOXELS:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Este volumen tiene {n_voxels / 1e6:.0f} millones de vóxeles y "
                    f"la comparación segmenta DOS veces; a resolución completa "
                    f"agotaría la memoria del servidor (el límite son "
                    f"{_FULL_RES_MAX_VOXELS / 1e6:.0f} millones). Compara sin esa "
                    f"opción, o recorta el volumen antes."
                ),
            )
        seg_volume = np.ascontiguousarray(volume, dtype=np.float32)
        seg_spacing = spacing
    else:
        seg_volume, seg_spacing, _ = _maybe_downsample(volume, spacing)

    cmp_ = await asyncio.to_thread(
        comparar_techo, seg_volume, seg_spacing, modality,
        req.lower, req.upper, req.smoothing, req.cleanup, req.main_tree_only,
    )

    return CeilingCompareResult(
        candidates=[
            ComparedCandidate(
                position=Position3D(x=c.position[0], y=c.position[1], z=c.position[2]),
                diameter_mm=round(c.diameter_mm, 2),
                channels=c.channels,
                rank_con_techo=c.rank_con_techo,
                rank_sin_techo=c.rank_sin_techo,
                en_ambas=c.en_ambas,
            )
            for c in cmp_.candidatos
        ],
        vertices_con_techo=cmp_.vertices_con_techo,
        vertices_sin_techo=cmp_.vertices_sin_techo,
        n_con_techo=cmp_.n_con_techo,
        n_sin_techo=cmp_.n_sin_techo,
        note=cmp_.nota,
    )
