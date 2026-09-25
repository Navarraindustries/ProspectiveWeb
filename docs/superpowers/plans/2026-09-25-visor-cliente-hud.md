# Visor 2D/3D en el cliente + estética HUD — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cortes, el oblicuo y un MIP progresivo se rendericen en el navegador desde una copia del volumen, en una distribución 1+3+MIP sincronizada por un punto común, con maniquí de orientación y una superposición estilo HUD de caza.

**Architecture:** El backend sirve el volumen por bloques `int16` gzip (más el `uint8` grueso ya existente) y añade orientación del paciente a la meta; el frontend guarda una copia en memoria y en la Cache API, la envuelve en un único `vtkImageData` y lo renderiza con `vtkImageMapper` (planos), `vtkImageResliceMapper` (oblicuo) y `vtkVolumeMapper` en MIP con planos de recorte (MIP progresivo). Un `focusPoint` en el store mueve crosshair y cámaras. Toda la superposición se hace con componentes HUD en React sobre el canvas.

**Tech Stack:** FastAPI + NumPy (backend), React 19 + TypeScript + vtk.js 36.2.1 (frontend), vitest + Testing Library, pytest.

**Spec:** `docs/superpowers/specs/2026-09-25-visor-segmentacion-clip-design.md` (secciones 3 y 6 bis).

## Global Constraints

- Backend en Lightsail 1 vCPU / 2 GB: ninguna ruta nueva carga el volumen entero en memoria; se lee del memmap `_volume.npy` por lonchas.
- Bloques `full` de **32 cortes** en z, `int16` little-endian, gzip. Volúmenes de más de **150 M vóxeles** se sirven con `stride 2` en el plano (cabecera `X-Level-Stride: 2`).
- El volumen se cachea en el navegador con clave `sid + cache_key` (mtime del `.npy`).
- Color de acento HUD `--hud: #8CFF9E`; ámbar `#FFC857`; contraste ≥ 4,5:1 sobre negro; el color nunca es el único canal de un aviso.
- Tipografía monoespaciada (`--font-mono`, JetBrains Mono) para toda lectura de instrumento; rótulos en mayúsculas con `letter-spacing: 0.08em`.
- Nada de scanlines, ruido ni parpadeo sobre el área de la imagen.
- Orientación de pantalla de los cortes idéntica a los PNG actuales: axial fila 0 arriba y x a la derecha; coronal y sagital con z máximo arriba.
- Textos de interfaz en español, como el resto de la app. Mensajes de commit en español, como el historial.
- `tsc -b`, `vitest run` y `pytest` en verde en cada commit.

## Review Focus

1. Volumen `full` que no cabe (TC 512×512×1030, 270 M vóxeles): debe servirse con stride 2 y el visor debe decir «resolución reducida», nunca intentar 540 MB. → test en Task 2 (`test_full_chunk_uses_stride_for_large_volume`).
2. Sesión cambiada a mitad de descarga: los bloques de la sesión anterior no deben escribirse en el buffer de la nueva. → test en Task 4 (`aborts previous download when session changes`).
3. Volumen sin etiquetas de orientación (3DRA de Case 3): etiquetas entre corchetes y maniquí en gris; nunca etiquetas «seguras» inventadas. → test en Task 3 (`labels are bracketed when orientation is assumed`).
4. Valores fuera de `int16` (XA en crudo puede superar 32 767): recorte, no desbordamiento con envoltura. → test en Task 2 (`test_full_chunk_clamps_to_int16`).
5. Doble clic para maximizar el panel que ya es el principal: no debe romper la distribución ni duplicar paneles. → test en Task 8 (`maximizing the main pane is a no-op`).

## Estructura de archivos

Backend (modificar):
- `backend/services/dicom_loader.py` — `direction` (9 floats) y `orientation_known` en `DicomLoadResult`.
- `backend/services/mpr.py` — meta ampliada (`direction`, `orientation_known`, `origin_mm`, `intensity_range`, `cache_key`, `full_stride`), `volume_chunk_int16()`.
- `backend/routers/mpr.py` — `GET /api/volume/{sid}/chunk/{level}/{z0}-{z1}`, `PUT /api/volume/{sid}/orientation`.
- `backend/main.py` — `GZipMiddleware`.
- Crear `backend/test_volume_chunks.py`, `backend/scripts/make_manikin.py`.

Frontend (crear):
- `src/vtk/geometry.ts` (+ `.test.ts`) — mm↔vóxel, cámaras de plano, etiquetas de orientación, orientación manual, rumbo de cámara.
- `src/vtk/volume/volumeLoader.ts` (+ `.test.ts`) — orden de bloques, descarga con caché y abort, buffer.
- `src/vtk/volume/useClientVolume.ts` — hook que construye el `vtkImageData`.
- `src/vtk/hud/hud.css`, `HudFrame.tsx`, `HudReadout.tsx`, `HudToggleGroup.tsx`, `HudReticle.tsx`, `HudLadder.tsx` (+ `ladder.ts`, `ladder.test.ts`), `HudHeadingTape.tsx`.
- `src/vtk/SliceView.tsx` — plano ortogonal con vtk.js (sustituye a `MprView` cuando hay WebGL2).
- `src/vtk/MipView.tsx`, `src/vtk/ObliqueView.tsx`, `src/vtk/OrientationInset.ts`, `src/vtk/webgl.ts`.
- `src/vtk/layout.ts` (+ `.test.ts`) — distribución 1+3+MIP y maximizar.
- `public/models/maniqui.vtp` — generado por el script.

Frontend (modificar): `src/store/planning.tsx` (+ test), `src/vtk/Viewer.tsx`, `src/vtk/MeshView.tsx`, `src/vtk/MprView.tsx` → `MprViewLegacy.tsx`, `src/api/client.ts`, `src/api/types.ts`, `src/styles/tokens/colors.css`, `src/components/planning/DetectPanel.tsx`, `src/components/morphometry/MorphometryPanel.tsx`, `.gitignore`, `README.md`.

---

### Task 1: Orientación e intensidad en la meta del volumen

**Files:**
- Modify: `backend/services/dicom_loader.py` (dataclass `DicomLoadResult`, `_image_to_result`)
- Modify: `backend/services/mpr.py` (`ensure_volume_cached`)
- Test: `backend/test_volume_chunks.py`

**Interfaces:**
- Produces: `DicomLoadResult.direction: tuple[float, ...]` (9 valores, fila mayor, cosenos LPS de los ejes i, j, k) y `DicomLoadResult.orientation_known: bool`.
- Produces: meta JSON con claves nuevas `direction: list[float] | None`, `orientation_known: bool`, `origin_mm: [x, y, z]`, `intensity_range: [p0.5, p99.9]`, `cache_key: str`, `full_stride: int`.

- [ ] **Step 1: Escribir los tests que fallan**

```python
# backend/test_volume_chunks.py
"""Volumen para el visor en el cliente: meta con orientación, bloques int16."""
from __future__ import annotations

import json
import numpy as np
from fastapi.testclient import TestClient

from main import app
from services.sessions import create_session, session_subdir
from services.mpr import ensure_volume_cached, volume_chunk_int16, _downsampled_volume

client = TestClient(app, raise_server_exceptions=True)


def _session_with_volume(nz=40, ny=60, nx=50, values=None) -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    if values is None:
        zz, yy, xx = np.mgrid[0:nz, 0:ny, 0:nx]
        values = (zz * 10 + yy + xx).astype(np.float32)
    np.save(meshes / "_volume.npy", values.astype(np.float32))
    (meshes / "_volume_meta.json").write_text(json.dumps({
        "shape": [nz, ny, nx], "spacing": [1.0, 0.8, 0.8],
        "wc": 100.0, "ww": 400.0, "modality": "CT",
    }))
    _downsampled_volume.cache_clear()
    return sid


class TestMeta:
    def test_meta_fills_missing_orientation_fields_from_cache(self):
        # Una sesión cacheada antes de este cambio no tiene las claves nuevas:
        # la meta las completa en vez de romper el visor.
        sid = _session_with_volume()
        meta = ensure_volume_cached(sid)
        assert meta["direction"] is None
        assert meta["orientation_known"] is False
        assert meta["origin_mm"] == [0.0, 0.0, 0.0]
        lo, hi = meta["intensity_range"]
        assert lo < hi
        assert isinstance(meta["cache_key"], str) and meta["cache_key"]
        assert meta["full_stride"] == 1

    def test_meta_endpoint_exposes_new_fields(self):
        sid = _session_with_volume()
        r = client.get(f"/api/volume/{sid}/meta")
        assert r.status_code == 200
        body = r.json()
        for key in ("direction", "orientation_known", "origin_mm", "intensity_range", "cache_key", "full_stride"):
            assert key in body
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && .venv\Scripts\python -m pytest test_volume_chunks.py -v`
Expected: FAIL con `ImportError: cannot import name 'volume_chunk_int16'` (se define en Task 2; de momento quita esa importación del test para ver el fallo de `KeyError: 'direction'`, y vuelve a ponerla en Task 2).

- [ ] **Step 3: Dirección y orientación conocida en el loader**

En `backend/services/dicom_loader.py`, añade a `DicomLoadResult` (tras `projection_warning`):

```python
    # Cosenos de dirección de los ejes i, j, k en LPS (9 valores, fila mayor),
    # tal como los da SimpleITK. La identidad cuando el DICOM no los trae.
    direction:          tuple[float, ...] = (1, 0, 0, 0, 1, 0, 0, 0, 1)
    # Si el DICOM traía ImageOrientationPatient (clásico) o
    # PlaneOrientationSequence (Enhanced). Sin ellos la dirección es asumida y
    # el visor lo tiene que decir: un 3DRA XA típico no los trae.
    orientation_known:  bool = False
```

Añade el helper (junto a `_extract_metadata`):

```python
def _orientation_known(ref_file: Path) -> bool:
    """Whether the file carries any patient-orientation tag."""
    try:
        import pydicom
        ds = pydicom.dcmread(str(ref_file), stop_before_pixels=True)
    except Exception:  # noqa: BLE001 — la orientación es informativa
        return False
    if ds.get("ImageOrientationPatient") is not None:
        return True
    for seq_name in ("SharedFunctionalGroupsSequence", "PerFrameFunctionalGroupsSequence"):
        seq = ds.get(seq_name)
        if seq:
            for item in seq[:1]:
                if item.get("PlaneOrientationSequence") is not None:
                    return True
    return False
```

En `_image_to_result`, antes del `return DicomLoadResult(`:

```python
    direction = tuple(float(v) for v in image.GetDirection()) if image.GetDimension() == 3 else (1, 0, 0, 0, 1, 0, 0, 0, 1)
    known = _orientation_known(ref_file)
```

y en el constructor: `direction=direction, orientation_known=known,`.

- [ ] **Step 4: Meta ampliada en `services/mpr.py`**

Sustituye `ensure_volume_cached` por:

```python
_FULL_STRIDE_VOXELS = 150_000_000   # por encima, el bloque full va con stride 2


def _full_stride(shape: list[int]) -> int:
    return 2 if int(np.prod(shape)) > _FULL_STRIDE_VOXELS else 1


def _intensity_range(vol: np.ndarray) -> list[float]:
    flat = vol.reshape(-1)
    if flat.size > 4_000_000:
        flat = flat[:: int(flat.size // 4_000_000) + 1]
    return [float(np.percentile(flat, 0.5)), float(np.percentile(flat, 99.9))]


def _complete_meta(meta: dict, npy_path: Path) -> dict:
    """Sesiones cacheadas antes de la orientación: completar sin recargar."""
    changed = False
    if "direction" not in meta:
        meta["direction"] = None
        meta["orientation_known"] = False
        changed = True
    if "origin_mm" not in meta:
        meta["origin_mm"] = [0.0, 0.0, 0.0]
        changed = True
    if "intensity_range" not in meta:
        meta["intensity_range"] = _intensity_range(np.load(npy_path, mmap_mode="r"))
        changed = True
    if "full_stride" not in meta:
        meta["full_stride"] = _full_stride(meta["shape"])
        changed = True
    meta["cache_key"] = str(int(npy_path.stat().st_mtime))
    return meta if not changed else meta


def ensure_volume_cached(session_id: str) -> dict:
    """Load the primary DICOM series volume (if not already cached) and return meta.

    Meta = {shape:[z,y,x], spacing:[sz,sy,sx], wc, ww, modality, direction,
    orientation_known, origin_mm, intensity_range, cache_key, full_stride}.
    """
    npy_path, meta_path = _cache_paths(session_id)
    if npy_path.exists() and meta_path.exists():
        meta = _complete_meta(json.loads(meta_path.read_text()), npy_path)
        meta_path.write_text(json.dumps(meta))
        return meta

    series_id = read_state(session_id, "dicom.series_id") or ""
    dicom_dir = session_dir(session_id) / "dicom"
    logger.info("MPR: loading volume for session %s (series %s)", session_id, series_id)
    dcm = load_series(series_id, dicom_dir)

    vol = np.ascontiguousarray(dcm.volume, dtype=np.float32)
    np.save(npy_path, vol)

    wc, ww = _display_window(vol, dcm.window_center, dcm.window_width)
    meta = {
        "shape": [int(x) for x in vol.shape],
        "spacing": [float(s) for s in dcm.spacing],
        "wc": wc,
        "ww": ww,
        "modality": dcm.modality,
        "direction": [float(v) for v in dcm.direction] if dcm.orientation_known else None,
        "orientation_known": bool(dcm.orientation_known),
        "origin_mm": [float(v) for v in dcm.origin],
        "intensity_range": _intensity_range(vol),
        "full_stride": _full_stride([int(x) for x in vol.shape]),
        "cache_key": str(int(npy_path.stat().st_mtime)),
    }
    meta_path.write_text(json.dumps(meta))
    logger.info("MPR: cached volume %s shape=%s", session_id, meta["shape"])
    return meta
```

- [ ] **Step 5: Ejecutar los tests de meta**

Run: `cd backend && .venv\Scripts\python -m pytest test_volume_chunks.py -k Meta -v`
Expected: 2 PASS. Ejecuta también `pytest test_mpr_advanced.py test_segment_preview.py -q` para comprobar que la meta ampliada no rompe nada.

- [ ] **Step 6: Commit**

```bash
git add backend/services/dicom_loader.py backend/services/mpr.py backend/test_volume_chunks.py
git commit -m "La meta del volumen dice si la orientación del paciente es real o asumida"
```

---

### Task 2: Bloques `int16` del volumen y gzip

**Files:**
- Modify: `backend/services/mpr.py`
- Modify: `backend/routers/mpr.py`
- Modify: `backend/main.py`
- Test: `backend/test_volume_chunks.py`

**Interfaces:**
- Produces: `volume_chunk_int16(session_id, z0, z1) -> tuple[bytes, list[int], int]` → (bytes, dims `[nz_chunk, ny, nx]` ya con stride aplicado, stride).
- Produces: `GET /api/volume/{sid}/chunk/full/{z0}-{z1}` → `application/octet-stream`, cabeceras `X-Dims`, `X-Level-Stride`, `X-Dtype: int16`. `GET /api/volume/{sid}/chunk/coarse/0-0` → el mismo cuerpo que `/raw` (uint8) con `X-Dtype: uint8`.

- [ ] **Step 1: Tests que fallan**

Añade a `backend/test_volume_chunks.py`:

```python
class TestChunks:
    def test_full_chunk_bytes_match_volume(self):
        sid = _session_with_volume(nz=40, ny=60, nx=50)
        data, dims, stride = volume_chunk_int16(sid, 8, 16)
        assert dims == [8, 60, 50] and stride == 1
        arr = np.frombuffer(data, dtype="<i2").reshape(dims)
        vol = np.load(session_subdir(sid, "meshes") / "_volume.npy", mmap_mode="r")
        np.testing.assert_array_equal(arr, np.rint(vol[8:16]).astype(np.int16))

    def test_full_chunk_clamps_to_int16(self):
        vol = np.full((4, 4, 4), 70000.0, dtype=np.float32)
        vol[0, 0, 0] = -70000.0
        sid = _session_with_volume(4, 4, 4, values=vol)
        data, dims, _ = volume_chunk_int16(sid, 0, 4)
        arr = np.frombuffer(data, dtype="<i2").reshape(dims)
        assert arr.max() == 32767 and arr.min() == -32768

    def test_full_chunk_uses_stride_for_large_volume(self, monkeypatch):
        from services import mpr
        monkeypatch.setattr(mpr, "_FULL_STRIDE_VOXELS", 1000)
        sid = _session_with_volume(nz=8, ny=40, nx=40)
        # 12 800 vóxeles > 1000 → stride 2 en el plano, nunca en z.
        data, dims, stride = volume_chunk_int16(sid, 0, 8)
        assert stride == 2 and dims == [8, 20, 20]
        assert len(data) == 8 * 20 * 20 * 2

    def test_chunk_endpoint_headers_and_gzip(self):
        sid = _session_with_volume(nz=40, ny=60, nx=50)
        r = client.get(f"/api/volume/{sid}/chunk/full/0-32", headers={"Accept-Encoding": "gzip"})
        assert r.status_code == 200
        assert r.headers["x-dtype"] == "int16"
        assert r.headers["x-dims"] == "32,60,50"
        assert r.headers["x-level-stride"] == "1"
        assert len(r.content) == 32 * 60 * 50 * 2   # TestClient descomprime
        assert r.headers.get("content-encoding") == "gzip"

    def test_chunk_endpoint_rejects_bad_range(self):
        sid = _session_with_volume(nz=40)
        assert client.get(f"/api/volume/{sid}/chunk/full/30-20").status_code == 422
        assert client.get(f"/api/volume/{sid}/chunk/full/0-999").status_code == 422
        assert client.get(f"/api/volume/{sid}/chunk/nivel/0-8").status_code == 422

    def test_coarse_chunk_is_the_raw_volume(self):
        sid = _session_with_volume()
        raw = client.get(f"/api/volume/{sid}/raw")
        coarse = client.get(f"/api/volume/{sid}/chunk/coarse/0-0")
        assert coarse.headers["x-dtype"] == "uint8"
        assert coarse.content == raw.content
        assert coarse.headers["x-dims"] == raw.headers["x-dims"]
```

- [ ] **Step 2: Ver que fallan**

Run: `cd backend && .venv\Scripts\python -m pytest test_volume_chunks.py -k Chunks -v`
Expected: FAIL (`ImportError` de `volume_chunk_int16`).

- [ ] **Step 3: Servicio**

Añade a `backend/services/mpr.py`, tras `get_volume_raw_uint8`:

```python
CHUNK_SLICES = 32


def volume_chunk_int16(session_id: str, z0: int, z1: int) -> tuple[bytes, list[int], int]:
    """Cortes [z0, z1) del volumen como int16 little-endian, para el visor.

    Se lee del memmap: en 1 vCPU / 2 GB no cabe el volumen entero en memoria
    ni falta hace. Valores fuera de int16 (un XA en crudo los tiene) se
    recortan, porque un desbordamiento con envoltura pintaría hueso negro.
    Con `full_stride` 2 se submuestrea en el plano, nunca en z, para que el
    índice de corte signifique lo mismo en todos los niveles.
    """
    meta = ensure_volume_cached(session_id)
    nz = int(meta["shape"][0])
    if not (0 <= z0 < z1 <= nz):
        raise ValueError(f"Rango de cortes inválido {z0}-{z1} (el volumen tiene {nz})")
    stride = int(meta.get("full_stride", 1))
    vol = _get_volume(session_id)
    slab = np.asarray(vol[z0:z1, ::stride, ::stride], dtype=np.float32)
    clipped = np.clip(np.rint(slab), -32768, 32767).astype("<i2")
    return clipped.tobytes(order="C"), [int(d) for d in clipped.shape], stride
```

- [ ] **Step 4: Ruta y gzip**

En `backend/main.py`, junto al `CORSMiddleware`:

```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1024)
```

En `backend/routers/mpr.py`, importa `volume_chunk_int16` y añade:

```python
@router.get(
    "/volume/{session_id}/chunk/{level}/{z0}-{z1}",
    summary="Un bloque del volumen para el visor en el cliente",
    description=(
        "`full`: cortes [z0, z1) en int16 little-endian, con stride en el plano "
        "(`X-Level-Stride`) cuando el volumen es muy grande. `coarse`: el volumen "
        "uint8 de ≤192³ entero (z0-z1 se ignoran). Cuerpo gzip cuando el cliente "
        "lo acepta. Cabeceras: `X-Dims` (z,y,x), `X-Spacing`, `X-Dtype`."
    ),
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}}},
)
async def get_volume_chunk(session_id: str, level: str, z0: int, z1: int) -> Response:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    if level not in ("full", "coarse"):
        raise HTTPException(status_code=422, detail="level debe ser 'full' o 'coarse'")
    loop = asyncio.get_event_loop()
    try:
        if level == "coarse":
            data, dims, spacing = await loop.run_in_executor(
                _executor, partial(get_volume_raw_uint8, session_id))
            dtype, stride = "uint8", 1
        else:
            data, dims, stride = await loop.run_in_executor(
                _executor, partial(volume_chunk_int16, session_id, z0, z1))
            meta = ensure_volume_cached(session_id)
            spacing = [float(s) for s in meta["spacing"]]
            spacing = [spacing[0], spacing[1] * stride, spacing[2] * stride]
            dtype = "int16"
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Volume chunk failed for %s: %s", session_id, exc, exc_info=True)
        raise HTTPException(status_code=422, detail=f"No se pudo leer el bloque: {exc}") from exc
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            "X-Dims": ",".join(str(d) for d in dims),
            "X-Spacing": ",".join(f"{s:.5f}" for s in spacing),
            "X-Dtype": dtype,
            "X-Level-Stride": str(stride),
            "Access-Control-Expose-Headers": "X-Dims, X-Spacing, X-Dtype, X-Level-Stride",
            "Cache-Control": "private, max-age=86400",
        },
    )
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd backend && .venv\Scripts\python -m pytest test_volume_chunks.py -v`
Expected: todos PASS. Si `content-encoding` no aparece, comprueba que el `add_middleware` de gzip está **antes** del de CORS en `main.py` (Starlette aplica el último añadido primero).

- [ ] **Step 6: Commit**

```bash
git add backend/services/mpr.py backend/routers/mpr.py backend/main.py backend/test_volume_chunks.py
git commit -m "El volumen se sirve por bloques int16 comprimidos para renderizar los cortes en el navegador"
```

---

### Task 3: Geometría pura del visor (mm↔vóxel, cámaras, etiquetas, rumbo)

**Files:**
- Create: `frontend/src/vtk/geometry.ts`
- Test: `frontend/src/vtk/geometry.test.ts`

**Interfaces:**
- Produces:
  - `type Plane = "axial" | "coronal" | "sagital"`
  - `mmToVoxel(mm: Vec3, meta: VolumeMeta): {x,y,z}` y `voxelToMm(v, meta): Vec3` (las mallas están en vóxel·spacing con origen 0).
  - `sliceCamera(plane): { direction: Vec3; viewUp: Vec3 }` — dirección de proyección y up que reproducen la orientación de los PNG.
  - `screenAxes(plane): { right: Vec3; down: Vec3 }` en ejes del volumen.
  - `type Orientation = { direction: number[] | null; manual: ManualOrientation | null }`; `type ManualOrientation = { anteriorEdge: "top"|"right"|"bottom"|"left"; firstSliceSuperior: boolean }`.
  - `effectiveDirection(o: Orientation): { d: number[]; known: boolean } | null`.
  - `manualToDirection(m: ManualOrientation): number[]`.
  - `edgeLabels(plane, o): { top, bottom, left, right: string }` — `"ANT"`, `"POST"`, `"SUP"`, `"INF"`, `"IZQ"`, `"DER"`, o `"[ANT]"` si asumida, `"?"` si no hay orientación.
  - `cameraHeading(directionOfProjection: Vec3, viewUp: Vec3, o): { azimuthDeg: number; elevationDeg: number; known: boolean } | null`.

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/geometry.test.ts
import { describe, expect, it } from "vitest";
import {
  cameraHeading, edgeLabels, manualToDirection, mmToVoxel, screenAxes, sliceCamera, voxelToMm,
} from "./geometry";
import type { VolumeMeta } from "../api/types";

const meta = {
  shape: [100, 200, 300], spacing: [0.5, 0.25, 0.25], wc: 0, ww: 1, modality: "XA",
  direction: null, orientation_known: false, origin_mm: [0, 0, 0],
  intensity_range: [0, 1], cache_key: "1", full_stride: 1,
} as VolumeMeta;

const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

describe("mm ↔ vóxel", () => {
  it("round-trips a voxel through mm using the (z,y,x) spacing", () => {
    const v = { x: 30, y: 40, z: 7 };
    const mm = voxelToMm(v, meta);
    expect(mm).toEqual([7.5, 10, 3.5]);
    expect(mmToVoxel(mm, meta)).toEqual(v);
  });
  it("clamps out-of-volume points to the last voxel", () => {
    expect(mmToVoxel([1000, -5, 3], meta)).toEqual({ x: 299, y: 0, z: 6 });
  });
});

describe("cámaras de plano (misma orientación que los PNG)", () => {
  it("axial: x a la derecha, y hacia abajo", () => {
    const { direction, viewUp } = sliceCamera("axial");
    expect(cross(direction, viewUp)).toEqual([1, 0, 0]);
    expect(viewUp).toEqual([0, -1, 0]);
  });
  it("coronal: x a la derecha, z arriba", () => {
    const { direction, viewUp } = sliceCamera("coronal");
    expect(cross(direction, viewUp)).toEqual([1, 0, 0]);
    expect(viewUp).toEqual([0, 0, 1]);
  });
  it("sagital: y a la derecha, z arriba", () => {
    const { direction, viewUp } = sliceCamera("sagital");
    expect(cross(direction, viewUp)).toEqual([0, 1, 0]);
    expect(viewUp).toEqual([0, 0, 1]);
  });
  it("screenAxes agrees with the camera", () => {
    expect(screenAxes("axial")).toEqual({ right: [1, 0, 0], down: [0, 1, 0] });
    expect(screenAxes("sagital")).toEqual({ right: [0, 1, 0], down: [0, 0, -1] });
  });
});

describe("etiquetas de orientación", () => {
  const known = { direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], manual: null };
  it("uses the DICOM direction when known (LPS identity)", () => {
    expect(edgeLabels("axial", known)).toEqual({ left: "DER", right: "IZQ", top: "ANT", bottom: "POST" });
    expect(edgeLabels("coronal", known)).toEqual({ left: "DER", right: "IZQ", top: "SUP", bottom: "INF" });
    expect(edgeLabels("sagital", known)).toEqual({ left: "ANT", right: "POST", top: "SUP", bottom: "INF" });
  });
  it("labels are bracketed when orientation is assumed (manual)", () => {
    const o = { direction: null, manual: { anteriorEdge: "top" as const, firstSliceSuperior: false } };
    expect(edgeLabels("axial", o)).toEqual({ left: "[DER]", right: "[IZQ]", top: "[ANT]", bottom: "[POST]" });
  });
  it("shows ? with no orientation at all", () => {
    expect(edgeLabels("axial", { direction: null, manual: null })).toEqual({ left: "?", right: "?", top: "?", bottom: "?" });
  });
  it("manual anterior-at-right rotates the axial labels", () => {
    const o = { direction: null, manual: { anteriorEdge: "right" as const, firstSliceSuperior: true } };
    expect(edgeLabels("axial", o)).toEqual({ left: "[POST]", right: "[ANT]", top: "[DER]", bottom: "[IZQ]" });
    // El primer corte superior invierte el eje z.
    expect(edgeLabels("coronal", o).top).toBe("[INF]");
  });
  it("manualToDirection is orthonormal", () => {
    const d = manualToDirection({ anteriorEdge: "left", firstSliceSuperior: false });
    const col = (k: number) => [d[k], d[3 + k], d[6 + k]];
    for (let i = 0; i < 3; i++) {
      expect(Math.hypot(...col(i))).toBeCloseTo(1);
      for (let j = i + 1; j < 3; j++) {
        expect(col(i)[0] * col(j)[0] + col(i)[1] * col(j)[1] + col(i)[2] * col(j)[2]).toBeCloseTo(0);
      }
    }
  });
});

describe("rumbo de cámara", () => {
  const known = { direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], manual: null };
  it("looking from anterior gives azimuth 0, elevation 0", () => {
    const h = cameraHeading([0, 1, 0], [0, 0, 1], known)!;
    expect(h.azimuthDeg).toBeCloseTo(0);
    expect(h.elevationDeg).toBeCloseTo(0);
    expect(h.known).toBe(true);
  });
  it("looking from the patient's left gives azimuth 90", () => {
    expect(cameraHeading([-1, 0, 0], [0, 0, 1], known)!.azimuthDeg).toBeCloseTo(90);
  });
  it("looking from above gives elevation 90", () => {
    expect(cameraHeading([0, 0, -1], [0, -1, 0], known)!.elevationDeg).toBeCloseTo(90);
  });
  it("returns null without any orientation", () => {
    expect(cameraHeading([0, 1, 0], [0, 0, 1], { direction: null, manual: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `cd frontend && npx vitest run src/vtk/geometry.test.ts`
Expected: FAIL (`Cannot find module './geometry'`).

- [ ] **Step 3: Implementación**

Primero amplía `VolumeMeta` en `frontend/src/api/types.ts`:

```ts
export interface VolumeMeta {
  /** [z, y, x] */
  shape: [number, number, number];
  /** [sz, sy, sx] mm */
  spacing: [number, number, number];
  wc: number;
  ww: number;
  modality: string;
  /** Cosenos de dirección LPS de los ejes i, j, k (9 valores, fila mayor), o
   *  null cuando el DICOM no los trae y la orientación es asumida. */
  direction: number[] | null;
  orientation_known: boolean;
  origin_mm: [number, number, number];
  /** Rango robusto [p0.5, p99.9] para inicializar ventana y MIP. */
  intensity_range: [number, number];
  /** Cambia cuando cambia el .npy: clave de la caché del navegador. */
  cache_key: string;
  /** 2 cuando el bloque «full» viene submuestreado en el plano. */
  full_stride: number;
}
```

Luego `frontend/src/vtk/geometry.ts`:

```ts
/* Geometría pura del visor: sin vtk.js, sin DOM, para poder probarla.
   Convención: el volumen es (z, y, x); las mallas están en mm = vóxel·spacing
   con origen 0; la pantalla de cada plano reproduce los PNG del servidor. */

import type { VolumeMeta } from "../api/types";

export type Vec3 = [number, number, number];
export type Plane = "axial" | "coronal" | "sagital";
export interface ManualOrientation {
  anteriorEdge: "top" | "right" | "bottom" | "left";
  firstSliceSuperior: boolean;
}
export interface Orientation {
  direction: number[] | null;
  manual: ManualOrientation | null;
}

const clampIdx = (n: number, i: number) => Math.max(0, Math.min(n - 1, Math.round(i)));

export function voxelToMm(v: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3 {
  const [sz, sy, sx] = meta.spacing;
  return [v.x * sx, v.y * sy, v.z * sz];
}

export function mmToVoxel(mm: Vec3, meta: VolumeMeta): { x: number; y: number; z: number } {
  const [nz, ny, nx] = meta.shape;
  const [sz, sy, sx] = meta.spacing;
  return { x: clampIdx(nx, mm[0] / sx), y: clampIdx(ny, mm[1] / sy), z: clampIdx(nz, mm[2] / sz) };
}

/* Dirección de proyección (hacia dónde mira) y up que reproducen los PNG:
   axial fila 0 arriba y x a la derecha; coronal/sagital con z arriba. */
export function sliceCamera(plane: Plane): { direction: Vec3; viewUp: Vec3 } {
  if (plane === "axial") return { direction: [0, 0, 1], viewUp: [0, -1, 0] };
  if (plane === "coronal") return { direction: [0, 1, 0], viewUp: [0, 0, 1] };
  return { direction: [-1, 0, 0], viewUp: [0, 0, 1] };
}

export function screenAxes(plane: Plane): { right: Vec3; down: Vec3 } {
  const { direction: d, viewUp: u } = sliceCamera(plane);
  const right: Vec3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  return { right, down: [-u[0], -u[1], -u[2]] as Vec3 };
}

/* Orientación manual → matriz de dirección (columnas = ejes i, j, k en LPS).
   En el axial la pantalla tiene +x a la derecha y +y abajo. Con anterior
   arriba, la derecha de pantalla es la izquierda del paciente (convención
   radiológica) y abajo es posterior; cada borde siguiente gira 90°. */
const AXIAL_BY_EDGE: Record<ManualOrientation["anteriorEdge"], { right: Vec3; down: Vec3 }> = {
  top:    { right: [1, 0, 0],  down: [0, 1, 0] },    // L, P
  right:  { right: [0, -1, 0], down: [1, 0, 0] },    // A, L
  bottom: { right: [-1, 0, 0], down: [0, -1, 0] },   // R, A
  left:   { right: [0, 1, 0],  down: [-1, 0, 0] },   // P, R
};

export function manualToDirection(m: ManualOrientation): number[] {
  const { right: i, down: j } = AXIAL_BY_EDGE[m.anteriorEdge];
  const k: Vec3 = m.firstSliceSuperior ? [0, 0, -1] : [0, 0, 1];
  return [i[0], j[0], k[0], i[1], j[1], k[1], i[2], j[2], k[2]];
}

export function effectiveDirection(o: Orientation): { d: number[]; known: boolean } | null {
  if (o.direction && o.direction.length === 9) return { d: o.direction, known: true };
  if (o.manual) return { d: manualToDirection(o.manual), known: false };
  return null;
}

/* Un eje del volumen (i, j o k, con signo) → vector LPS. */
function toLps(d: number[], v: Vec3): Vec3 {
  return [
    d[0] * v[0] + d[1] * v[1] + d[2] * v[2],
    d[3] * v[0] + d[4] * v[1] + d[5] * v[2],
    d[6] * v[0] + d[7] * v[1] + d[8] * v[2],
  ];
}

function lpsLabel(v: Vec3): string {
  const ax = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const k = ax.indexOf(Math.max(...ax));
  if (k === 0) return v[0] > 0 ? "IZQ" : "DER";
  if (k === 1) return v[1] > 0 ? "POST" : "ANT";
  return v[2] > 0 ? "SUP" : "INF";
}

export function edgeLabels(plane: Plane, o: Orientation): { top: string; bottom: string; left: string; right: string } {
  const eff = effectiveDirection(o);
  if (!eff) return { top: "?", bottom: "?", left: "?", right: "?" };
  const wrap = (s: string) => (eff.known ? s : `[${s}]`);
  const { right, down } = screenAxes(plane);
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  return {
    right: wrap(lpsLabel(toLps(eff.d, right))),
    left: wrap(lpsLabel(toLps(eff.d, neg(right)))),
    bottom: wrap(lpsLabel(toLps(eff.d, down))),
    top: wrap(lpsLabel(toLps(eff.d, neg(down)))),
  };
}

/* Rumbo de la cámara respecto al paciente: azimut 0 = mirando desde anterior,
   90 = desde la izquierda del paciente; elevación 90 = desde arriba. */
export function cameraHeading(directionOfProjection: Vec3, viewUp: Vec3, o: Orientation) {
  const eff = effectiveDirection(o);
  if (!eff) return null;
  const d = toLps(eff.d, directionOfProjection);            // hacia dónde mira, en LPS
  const from: Vec3 = [-d[0], -d[1], -d[2]];                  // desde dónde mira
  const elevationDeg = (Math.asin(Math.max(-1, Math.min(1, from[2]))) * 180) / Math.PI;
  // Anterior es −P (LPS y negativo); la izquierda es +L.
  const azimuthDeg = (Math.atan2(from[0], -from[1]) * 180) / Math.PI;
  void viewUp;
  return { azimuthDeg, elevationDeg, known: eff.known };
}
```

- [ ] **Step 4: Ejecutar**

Run: `cd frontend && npx vitest run src/vtk/geometry.test.ts && npx tsc -b`
Expected: PASS y `tsc` limpio. Si `tsc` se queja de que `VolumeMeta` ahora exige campos que los tests antiguos no dan, busca con `grep -rn "modality: \"" src --include=*.test.*` y completa esos objetos con los campos nuevos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/geometry.ts frontend/src/vtk/geometry.test.ts frontend/src/api/types.ts
git commit -m "Geometría del visor probada sin WebGL: mm a vóxel, cámaras de plano, etiquetas y rumbo"
```

---

### Task 4: Descarga del volumen por bloques con caché y cancelación

**Files:**
- Create: `frontend/src/vtk/volume/volumeLoader.ts`
- Test: `frontend/src/vtk/volume/volumeLoader.test.ts`
- Modify: `frontend/src/api/client.ts` (exporta `authHeaders()` y `api.chunkUrl`)

**Interfaces:**
- Consumes: `VolumeMeta` (Task 3), `getToken()` de `api/client.ts`.
- Produces:
  - `chunkOrder(nz: number, chunkSize: number, currentZ: number): Array<[number, number]>` — rangos `[z0, z1)` ordenados por proximidad al corte actual.
  - `interface ClientVolume { dims: [nz, ny, nx]; spacing: [sz, sy, sx]; data: Int16Array | Uint8Array; level: "coarse" | "full"; stride: number }`
  - `loadCoarse(sid, meta, signal): Promise<ClientVolume>`
  - `loadFull(sid, meta, currentZ, signal, onProgress: (done: number, total: number) => void): Promise<ClientVolume>`
  - `fetchChunk(url, signal): Promise<{ bytes: ArrayBuffer; dims: number[]; spacing: number[]; dtype: string; stride: number }>` — usa la Cache API si existe.
  - `api.chunkUrl(sid, level, z0, z1, cacheKey)`.

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/volume/volumeLoader.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkOrder, fetchChunk, loadFull } from "./volumeLoader";
import type { VolumeMeta } from "../../api/types";

const meta = {
  shape: [70, 4, 3], spacing: [1, 1, 1], wc: 0, ww: 1, modality: "XA",
  direction: null, orientation_known: false, origin_mm: [0, 0, 0],
  intensity_range: [0, 1], cache_key: "k1", full_stride: 1,
} as VolumeMeta;

describe("chunkOrder", () => {
  it("covers the volume exactly once, nearest chunk first", () => {
    const order = chunkOrder(70, 32, 40);
    expect(order[0]).toEqual([32, 64]);            // contiene el corte 40
    expect(order).toHaveLength(3);
    const covered = order.flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i));
    expect(covered.sort((a, b) => a - b)).toEqual(Array.from({ length: 70 }, (_, i) => i));
  });
  it("orders by distance to the current slice on both sides", () => {
    expect(chunkOrder(96, 32, 5)).toEqual([[0, 32], [32, 64], [64, 96]]);
    expect(chunkOrder(96, 32, 90)).toEqual([[64, 96], [32, 64], [0, 32]]);
  });
});

function chunkResponse(z0: number, z1: number, value: number, dims = [z1 - z0, 4, 3]) {
  const n = dims[0] * dims[1] * dims[2];
  const body = new Int16Array(n).fill(value);
  return new Response(body.buffer, {
    status: 200,
    headers: {
      "X-Dims": dims.join(","), "X-Spacing": "1,1,1", "X-Dtype": "int16", "X-Level-Stride": "1",
    },
  });
}

describe("loadFull", () => {
  beforeEach(() => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const m = /chunk\/full\/(\d+)-(\d+)/.exec(url)!;
      const z0 = Number(m[1]), z1 = Number(m[2]);
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return chunkResponse(z0, z1, z0);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("assembles the chunks into one int16 buffer in z order", async () => {
    const progress: number[] = [];
    const vol = await loadFull("sid", meta, 40, new AbortController().signal, (d) => progress.push(d));
    expect(vol.level).toBe("full");
    expect(vol.dims).toEqual([70, 4, 3]);
    const data = vol.data as Int16Array;
    expect(data[0]).toBe(0);                 // corte 0 viene del bloque [0,32) → valor 0
    expect(data[40 * 12]).toBe(32);          // corte 40 del bloque [32,64)
    expect(data[69 * 12]).toBe(64);
    expect(progress).toEqual([1, 2, 3]);
  });

  it("aborts previous download when session changes", async () => {
    const ctrl = new AbortController();
    const p = loadFull("sid-old", meta, 0, ctrl.signal, () => {});
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails loudly when a chunk has unexpected dims", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chunkResponse(0, 32, 1, [32, 9, 9])));
    await expect(loadFull("sid", meta, 0, new AbortController().signal, () => {}))
      .rejects.toThrow(/dimensiones/);
  });
});

describe("fetchChunk cache", () => {
  it("reads from the Cache API when present and stores a miss", async () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (url: string) => stored.get(url)?.clone()),
      put: vi.fn(async (url: string, res: Response) => { stored.set(url, res); }),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    const fetchMock = vi.fn(async () => chunkResponse(0, 32, 7));
    vi.stubGlobal("fetch", fetchMock);
    const a = await fetchChunk("/api/volume/s/chunk/full/0-32?v=k1", new AbortController().signal);
    const b = await fetchChunk("/api/volume/s/chunk/full/0-32?v=k1", new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Int16Array(a.bytes)[0]).toBe(7);
    expect(new Int16Array(b.bytes)[0]).toBe(7);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `cd frontend && npx vitest run src/vtk/volume/volumeLoader.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: `api/client.ts`**

Exporta las cabeceras de autenticación (hoy están duplicadas dentro de `request` y `getBlob`) y la URL del bloque. Junto a `getBlob`:

```ts
/** Cabeceras con el JWT para fetch() fuera del cliente (bloques del volumen). */
export function authHeaders(): Headers {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
```

y en el objeto `api`, tras `volumeRawUrl`:

```ts
  /** Un bloque del volumen para el visor en el cliente. `cacheKey` cambia con
   *  el .npy, así que una resegmentación o un preproceso invalidan la caché. */
  chunkUrl: (sessionId: string, level: "full" | "coarse", z0: number, z1: number, cacheKey: string) =>
    `/api/volume/${sessionId}/chunk/${level}/${z0}-${z1}?v=${encodeURIComponent(cacheKey)}`,
```

- [ ] **Step 4: `volumeLoader.ts`**

```ts
/* Descarga del volumen para el visor en el cliente.

   Primero el grueso (≤192³ uint8, 7 MB), que se usa en cuanto llega; después
   el completo en bloques de 32 cortes int16, por orden de cercanía al corte
   que se está mirando. Los bloques se guardan en la Cache API del navegador,
   de modo que reanudar o recargar no vuelve a bajar 100 MB. Todo se cancela
   con el AbortSignal de la sesión: un bloque de la sesión anterior nunca
   entra en el buffer de la nueva. */

import { api, authHeaders } from "../../api/client";
import type { VolumeMeta } from "../../api/types";

export const CHUNK_SLICES = 32;
const CACHE_NAME = "prospective-volume-v1";

export interface ClientVolume {
  dims: [number, number, number];
  spacing: [number, number, number];
  data: Int16Array | Uint8Array;
  level: "coarse" | "full";
  stride: number;
}

export function chunkOrder(nz: number, chunkSize: number, currentZ: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let z0 = 0; z0 < nz; z0 += chunkSize) ranges.push([z0, Math.min(nz, z0 + chunkSize)]);
  const dist = ([a, b]: [number, number]) =>
    currentZ < a ? a - currentZ : currentZ >= b ? currentZ - (b - 1) : 0;
  return ranges.sort((r1, r2) => dist(r1) - dist(r2) || r1[0] - r2[0]);
}

async function cacheStorage(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined" || !caches) return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;   // contexto inseguro o almacenamiento bloqueado
  }
}

export async function fetchChunk(url: string, signal: AbortSignal) {
  const cache = await cacheStorage();
  let res = cache ? await cache.match(url) : undefined;
  if (!res) {
    res = await fetch(url, { headers: authHeaders(), signal });
    if (!res.ok) throw new Error(`Bloque ${url}: HTTP ${res.status}`);
    if (cache) {
      try { await cache.put(url, res.clone()); } catch { /* cuota llena: seguir sin caché */ }
    }
  }
  const dims = (res.headers.get("X-Dims") ?? "").split(",").map(Number);
  const spacing = (res.headers.get("X-Spacing") ?? "1,1,1").split(",").map(Number);
  return {
    bytes: await res.arrayBuffer(),
    dims,
    spacing,
    dtype: res.headers.get("X-Dtype") ?? "int16",
    stride: Number(res.headers.get("X-Level-Stride") ?? "1"),
  };
}

export async function loadCoarse(sid: string, meta: VolumeMeta, signal: AbortSignal): Promise<ClientVolume> {
  const c = await fetchChunk(api.chunkUrl(sid, "coarse", 0, 0, meta.cache_key), signal);
  if (c.dims.length !== 3) throw new Error("El bloque grueso no trae dimensiones válidas");
  return {
    dims: [c.dims[0], c.dims[1], c.dims[2]],
    spacing: [c.spacing[0], c.spacing[1], c.spacing[2]],
    data: new Uint8Array(c.bytes),
    level: "coarse",
    stride: Math.round(c.spacing[2] / meta.spacing[2]) || 1,
  };
}

export async function loadFull(
  sid: string,
  meta: VolumeMeta,
  currentZ: number,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<ClientVolume> {
  const [nz, nyFull, nxFull] = meta.shape;
  const stride = Math.max(1, meta.full_stride || 1);
  const ny = Math.ceil(nyFull / stride), nx = Math.ceil(nxFull / stride);
  const data = new Int16Array(nz * ny * nx);
  const order = chunkOrder(nz, CHUNK_SLICES, currentZ);
  let done = 0;
  for (const [z0, z1] of order) {
    if (signal.aborted) throw new DOMException("Descarga cancelada", "AbortError");
    const c = await fetchChunk(api.chunkUrl(sid, "full", z0, z1, meta.cache_key), signal);
    if (c.dims[0] !== z1 - z0 || c.dims[1] !== ny || c.dims[2] !== nx) {
      throw new Error(`El bloque ${z0}-${z1} trae dimensiones ${c.dims.join("×")}, se esperaban ${z1 - z0}×${ny}×${nx}`);
    }
    data.set(new Int16Array(c.bytes), z0 * ny * nx);
    onProgress(++done, order.length);
  }
  return {
    dims: [nz, ny, nx],
    spacing: [meta.spacing[0], meta.spacing[1] * stride, meta.spacing[2] * stride],
    data,
    level: "full",
    stride,
  };
}
```

- [ ] **Step 5: Ejecutar**

Run: `cd frontend && npx vitest run src/vtk/volume && npx tsc -b`
Expected: PASS. Si `Response` con `ArrayBuffer` no está en jsdom, la prueba corre igual porque vitest expone el `Response` de Node.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/vtk/volume/volumeLoader.ts frontend/src/vtk/volume/volumeLoader.test.ts frontend/src/api/client.ts
git commit -m "El volumen baja por bloques, del corte que se mira hacia fuera, y se queda en la caché del navegador"
```

---

### Task 5: `useClientVolume` — el `vtkImageData` compartido

**Files:**
- Create: `frontend/src/vtk/volume/useClientVolume.ts`
- Create: `frontend/src/vtk/webgl.ts`

**Interfaces:**
- Consumes: `loadCoarse`, `loadFull` (Task 4), `VolumeMeta`.
- Produces:
  - `hasWebGL2(): boolean`.
  - `useClientVolume(sid: string | null, meta: VolumeMeta | null, currentZ: number): { image: vtkImageData | null; level: "coarse" | "full" | null; progress: { done: number; total: number } | null; error: string | null }`.
  - El `vtkImageData` tiene `spacing` y `dimensions` del nivel activo y origen 0; sus escalares se llaman `"scalars"`. **Un solo objeto por sesión y nivel**: todos los paneles lo comparten.

- [ ] **Step 1: `webgl.ts`**

```ts
/* El visor en el cliente necesita WebGL2 (texturas 3D). Sin él se vuelve al
   modo antiguo de PNG del servidor, con un aviso. Se comprueba una vez. */
let cached: boolean | null = null;
export function hasWebGL2(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement("canvas");
    cached = !!c.getContext("webgl2");
  } catch {
    cached = false;
  }
  return cached;
}
```

- [ ] **Step 2: El hook**

```ts
/* useClientVolume — una copia del volumen en el navegador, como vtkImageData.

   Dos niveles y un solo objeto visible a la vez: el grueso llega en ~2 s y
   permite navegar; el completo se construye cuando han llegado TODOS sus
   bloques y sustituye al grueso de golpe. Reemplazar el vtkImageData por
   bloques obligaría a resubir la textura entera (226 MB para 384³) doce
   veces; un solo cambio es lo que no da tirones. */

import { useEffect, useRef, useState } from "react";
import vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import type { VolumeMeta } from "../../api/types";
import { loadCoarse, loadFull, type ClientVolume } from "./volumeLoader";

function toImageData(v: ClientVolume): vtkImageData {
  const img = vtkImageData.newInstance();
  img.setDimensions([v.dims[2], v.dims[1], v.dims[0]]);   // vtk: (x, y, z)
  img.setSpacing([v.spacing[2], v.spacing[1], v.spacing[0]]);
  img.setOrigin([0, 0, 0]);
  img.getPointData().setScalars(
    vtkDataArray.newInstance({ name: "scalars", numberOfComponents: 1, values: v.data }),
  );
  return img;
}

export function useClientVolume(sid: string | null, meta: VolumeMeta | null, currentZ: number) {
  const [image, setImage] = useState<vtkImageData | null>(null);
  const [level, setLevel] = useState<"coarse" | "full" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El corte actual solo decide el ORDEN de los bloques al empezar; cambiar
  // de corte no reinicia la descarga.
  const startZ = useRef(currentZ);
  startZ.current = currentZ;

  useEffect(() => {
    setImage(null); setLevel(null); setProgress(null); setError(null);
    if (!sid || !meta) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const coarse = await loadCoarse(sid, meta, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setImage(toImageData(coarse)); setLevel("coarse");
        const full = await loadFull(sid, meta, startZ.current, ctrl.signal, (done, total) => {
          if (!ctrl.signal.aborted) setProgress({ done, total });
        });
        if (ctrl.signal.aborted) return;
        setImage(toImageData(full)); setLevel("full"); setProgress(null);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        // Sin el completo se sigue con el grueso; el rótulo lo dirá.
        setError(err instanceof Error ? err.message : "No se pudo descargar el volumen");
        setProgress(null);
      }
    })();
    return () => { ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, meta?.cache_key]);

  return { image, level, progress, error };
}
```

- [ ] **Step 3: Compilar**

Run: `cd frontend && npx tsc -b`
Expected: limpio. (No hay test unitario: crea WebGL; se prueba en Task 7 en el navegador.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/vtk/volume/useClientVolume.ts frontend/src/vtk/webgl.ts
git commit -m "Un vtkImageData por sesión: primero el grueso, luego el completo de golpe"
```

---

### Task 6: Componentes HUD (tokens, marco, lecturas, grupo de botones, retícula, escalera, cinta de rumbo)

**Files:**
- Modify: `frontend/src/styles/tokens/colors.css`
- Create: `frontend/src/vtk/hud/hud.css`, `HudFrame.tsx`, `HudReadout.tsx`, `HudToggleGroup.tsx`, `HudReticle.tsx`, `HudLadder.tsx`, `ladder.ts`, `HudHeadingTape.tsx`
- Test: `frontend/src/vtk/hud/ladder.test.ts`, `frontend/src/vtk/hud/HudToggleGroup.test.tsx`

**Interfaces:**
- Produces:
  - Tokens CSS: `--hud`, `--hud-dim`, `--hud-amber`, `--hud-red`, `--hud-line` (1px).
  - `<HudFrame active?: boolean; label?: string; corner?: ReactNode; children>` — marco con marcas de esquina; ocupa `position:absolute; inset:0; pointer-events:none`, sus hijos con `pointer-events:auto` cuando lo pidan.
  - `<HudReadout at="tl"|"tr"|"bl"|"br" lines: string[]>`.
  - `<HudToggleGroup options: {key, label, title?}[]; value; onChange(key)>` — `[ ACTIVO ]  OTRO  OTRO`.
  - `<HudReticle cx: number; cy: number; mmPerPx: number; label?: string>` — en px del contenedor.
  - `ladderTicks(count: number, index: number, heightPx: number, pxPerTick = 8): { y: number; index: number; major: boolean }[]` y `<HudLadder count index heightPx onIndexChange?>`.
  - `<HudHeadingTape azimuthDeg elevationDeg known>`.

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/hud/ladder.test.ts
import { describe, expect, it } from "vitest";
import { ladderTicks } from "./ladder";

describe("ladderTicks", () => {
  it("puts the current index at the vertical centre", () => {
    const t = ladderTicks(384, 100, 200, 8);
    const cur = t.find((x) => x.index === 100)!;
    expect(cur.y).toBe(100);
  });
  it("marks every tenth slice as major and spaces ticks by pxPerTick", () => {
    const t = ladderTicks(384, 100, 200, 8);
    const i100 = t.find((x) => x.index === 100)!, i101 = t.find((x) => x.index === 101)!;
    expect(i101.y - i100.y).toBe(-8);        // índices mayores, más arriba
    expect(t.find((x) => x.index === 110)!.major).toBe(true);
    expect(i101.major).toBe(false);
  });
  it("never emits indices outside [0, count)", () => {
    const t = ladderTicks(20, 2, 400, 8);
    expect(Math.min(...t.map((x) => x.index))).toBe(0);
    expect(Math.max(...t.map((x) => x.index))).toBe(19);
  });
});
```

```tsx
// frontend/src/vtk/hud/HudToggleGroup.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HudToggleGroup } from "./HudToggleGroup";

describe("HudToggleGroup", () => {
  const opts = [{ key: "3d", label: "3D" }, { key: "vol", label: "VOLUMEN" }];
  it("brackets the active option and exposes it as pressed", () => {
    render(<HudToggleGroup options={opts} value="vol" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /VOLUMEN/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /VOLUMEN/ }).textContent).toBe("[ VOLUMEN ]");
    expect(screen.getByRole("button", { name: /3D/ }).textContent).toBe("3D");
  });
  it("calls onChange with the key", () => {
    const on = vi.fn();
    render(<HudToggleGroup options={opts} value="3d" onChange={on} />);
    fireEvent.click(screen.getByRole("button", { name: /VOLUMEN/ }));
    expect(on).toHaveBeenCalledWith("vol");
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `cd frontend && npx vitest run src/vtk/hud`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Tokens y CSS**

Añade a `frontend/src/styles/tokens/colors.css`, dentro del bloque `:root` (y NO lo cambies en `[data-theme]`: el visor es siempre negro):

```css
  /* HUD del visor: un solo acento fosforescente sobre negro. */
  --hud:        #8CFF9E;
  --hud-dim:    rgba(140, 255, 158, 0.55);
  --hud-amber:  #FFC857;
  --hud-red:    #FF5A5A;
  --hud-line:   1px;
```

`frontend/src/vtk/hud/hud.css` (impórtalo desde `styles/index.css`):

```css
/* Capa HUD del visor. Trazo fino, mono, sin rellenos; nada toca la imagen. */
.hud { position: absolute; inset: 0; pointer-events: none; font-family: var(--font-mono); color: var(--hud); }
.hud * { box-sizing: border-box; }
.hud-corner { position: absolute; width: 12px; height: 12px; border-color: var(--hud-dim); border-style: solid; border-width: 0; }
.hud-corner.tl { top: 6px; left: 6px; border-top-width: var(--hud-line); border-left-width: var(--hud-line); }
.hud-corner.tr { top: 6px; right: 6px; border-top-width: var(--hud-line); border-right-width: var(--hud-line); }
.hud-corner.bl { bottom: 6px; left: 6px; border-bottom-width: var(--hud-line); border-left-width: var(--hud-line); }
.hud-corner.br { bottom: 6px; right: 6px; border-bottom-width: var(--hud-line); border-right-width: var(--hud-line); }
.hud.active .hud-corner { border-color: var(--hud); }
.hud-label { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--hud-dim); }
.hud-readout { position: absolute; font-size: 10.5px; line-height: 1.5; letter-spacing: .04em; white-space: pre; }
.hud-readout.tl { top: 22px; left: 14px; } .hud-readout.tr { top: 22px; right: 14px; text-align: right; }
.hud-readout.bl { bottom: 22px; left: 14px; } .hud-readout.br { bottom: 22px; right: 14px; text-align: right; }
.hud-toggle { display: inline-flex; gap: 10px; pointer-events: auto; }
.hud-toggle button { background: none; border: none; padding: 2px 0; font: inherit; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--hud-dim); cursor: pointer; }
.hud-toggle button[aria-pressed="true"] { color: var(--hud); border-bottom: var(--hud-line) solid var(--hud); }
.hud-toggle button:focus-visible { outline: var(--hud-line) dashed var(--hud); outline-offset: 2px; }
.hud-edge { position: absolute; font-size: 10px; letter-spacing: .08em; color: var(--hud-dim); }
.hud-edge.top { top: 8px; left: 50%; transform: translateX(-50%); } .hud-edge.bottom { bottom: 8px; left: 50%; transform: translateX(-50%); }
.hud-edge.left { left: 8px; top: 50%; transform: translateY(-50%); } .hud-edge.right { right: 8px; top: 50%; transform: translateY(-50%); }
.hud-warn { color: var(--hud-amber); } .hud-err { color: var(--hud-red); }
.hud-hint { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); font-size: 10.5px; letter-spacing: .06em; color: var(--hud-dim); animation: hud-hint-fade 3s forwards; }
@keyframes hud-hint-fade { 0%, 75% { opacity: 1; } 100% { opacity: 0; } }
```

- [ ] **Step 4: Componentes**

`HudFrame.tsx`:

```tsx
import type { ReactNode } from "react";

/** Marco HUD: cuatro marcas de esquina, rótulo arriba y lo que se le meta dentro. */
export function HudFrame({ active = false, label, children }: { active?: boolean; label?: string; children?: ReactNode }) {
  return (
    <div className={`hud${active ? " active" : ""}`} aria-hidden={label ? undefined : true}>
      <span className="hud-corner tl" /><span className="hud-corner tr" />
      <span className="hud-corner bl" /><span className="hud-corner br" />
      {label && <span className="hud-label">{label}</span>}
      {children}
    </div>
  );
}
```

`HudReadout.tsx`:

```tsx
export function HudReadout({ at, lines, tone }: { at: "tl" | "tr" | "bl" | "br"; lines: string[]; tone?: "warn" | "err" }) {
  return (
    <div className={`hud-readout ${at}${tone ? ` hud-${tone}` : ""}`}>{lines.join("\n")}</div>
  );
}
```

`HudToggleGroup.tsx`:

```tsx
export interface HudOption { key: string; label: string; title?: string }

/** `[ ACTIVO ]  OTRO  OTRO` — el grupo de botones del HUD, sin píldoras. */
export function HudToggleGroup({ options, value, onChange, style }: {
  options: HudOption[]; value: string; onChange: (key: string) => void; style?: React.CSSProperties;
}) {
  return (
    <div className="hud-toggle" role="group" style={style}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" aria-pressed={on} title={o.title} onClick={() => onChange(o.key)}>
            {on ? `[ ${o.label} ]` : o.label}
          </button>
        );
      })}
    </div>
  );
}
```

`HudReticle.tsx` (dos ejes con hueco central y marcas cada 10 mm):

```tsx
/** Retícula HUD en px del contenedor. `mmPerPx` da las marcas cada 10 mm. */
export function HudReticle({ cx, cy, mmPerPx, label }: { cx: number; cy: number; mmPerPx: number; label?: string }) {
  const gap = 7;                                   // medio hueco central
  const tick = mmPerPx > 0 ? 10 / mmPerPx : 0;     // px por 10 mm
  const marks: number[] = [];
  if (tick >= 6) for (let d = tick; d < 2000; d += tick) marks.push(d);
  const line = { position: "absolute" as const, background: "var(--hud-dim)" };
  return (
    <>
      <div style={{ ...line, left: 0, width: `calc(${cx}px - ${gap}px)`, top: cy, height: 1 }} />
      <div style={{ ...line, left: cx + gap, right: 0, top: cy, height: 1 }} />
      <div style={{ ...line, top: 0, height: `calc(${cy}px - ${gap}px)`, left: cx, width: 1 }} />
      <div style={{ ...line, top: cy + gap, bottom: 0, left: cx, width: 1 }} />
      {marks.slice(0, 40).map((d) => (
        <span key={d}>
          <span style={{ ...line, left: cx + d, top: cy - 3, width: 1, height: 7 }} />
          <span style={{ ...line, left: cx - d, top: cy - 3, width: 1, height: 7 }} />
          <span style={{ ...line, top: cy + d, left: cx - 3, height: 1, width: 7 }} />
          <span style={{ ...line, top: cy - d, left: cx - 3, height: 1, width: 7 }} />
        </span>
      ))}
      {label && (
        <span style={{ position: "absolute", left: cx + 10, top: cy + 6, fontSize: 10, color: "var(--hud)" }}>{label}</span>
      )}
    </>
  );
}
```

`ladder.ts`:

```ts
/** Marcas de la escalera de cortes: el índice actual en el centro, una marca
 *  por corte cada `pxPerTick`, mayores cada 10. Índices mayores quedan arriba. */
export function ladderTicks(count: number, index: number, heightPx: number, pxPerTick = 8) {
  const out: { y: number; index: number; major: boolean }[] = [];
  const half = Math.ceil(heightPx / 2 / pxPerTick) + 1;
  for (let k = -half; k <= half; k++) {
    const i = index + k;
    if (i < 0 || i >= count) continue;
    out.push({ y: heightPx / 2 - k * pxPerTick, index: i, major: i % 10 === 0 });
  }
  return out;
}
```

`HudLadder.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { ladderTicks } from "./ladder";

/** Cinta vertical de cortes en el borde derecho, como la escalera de altitud. */
export function HudLadder({ count, index }: { count: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el); setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const ticks = h > 0 ? ladderTicks(count, index, h) : [];
  return (
    <div ref={ref} style={{ position: "absolute", right: 0, top: 24, bottom: 24, width: 44, overflow: "hidden" }}>
      {ticks.map((t) => (
        <span key={t.index} style={{ position: "absolute", right: 0, top: t.y, width: t.major ? 14 : 7, height: 1, background: "var(--hud-dim)" }}>
          {t.major && <span style={{ position: "absolute", right: 16, top: -6, fontSize: 9, color: "var(--hud-dim)" }}>{t.index + 1}</span>}
        </span>
      ))}
      <span style={{ position: "absolute", right: 4, top: h / 2 - 8, padding: "1px 4px", fontSize: 10, color: "var(--hud)", border: "var(--hud-line) solid var(--hud)", background: "#000" }}>
        {index + 1}
      </span>
    </div>
  );
}
```

`HudHeadingTape.tsx`:

```tsx
/** Cinta de rumbo: azimut y elevación de la cámara respecto al paciente. */
const POINTS: [number, string][] = [[0, "ANT"], [90, "IZQ"], [180, "POST"], [-90, "DER"]];

export function HudHeadingTape({ azimuthDeg, elevationDeg, known }: { azimuthDeg: number; elevationDeg: number; known: boolean }) {
  const wrap = (s: string) => (known ? s : `[${s}]`);
  const norm = (a: number) => ((a + 540) % 360) - 180;
  const pxPerDeg = 2;
  return (
    <div style={{ position: "absolute", top: 6, left: "20%", right: "20%", height: 22, overflow: "hidden", borderBottom: "var(--hud-line) solid var(--hud-dim)" }}>
      {POINTS.map(([deg, name]) => {
        const off = norm(deg - azimuthDeg) * pxPerDeg;
        return (
          <span key={name} style={{ position: "absolute", left: `calc(50% + ${off}px)`, transform: "translateX(-50%)", top: 2, fontSize: 10, letterSpacing: ".08em", color: Math.abs(off) < 8 ? "var(--hud)" : "var(--hud-dim)" }}>
            {wrap(name)}
          </span>
        );
      })}
      <span style={{ position: "absolute", left: "50%", top: 0, width: 1, height: 22, background: "var(--hud)" }} />
      <span style={{ position: "absolute", right: 0, top: 3, fontSize: 10, color: "var(--hud-dim)" }}>
        AZ {Math.round(norm(azimuthDeg))}° · EL {Math.round(elevationDeg)}°
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Ejecutar**

Run: `cd frontend && npx vitest run src/vtk/hud && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/tokens/colors.css frontend/src/styles/index.css frontend/src/vtk/hud
git commit -m "Componentes HUD del visor: marco, lecturas, retícula, escalera de cortes y cinta de rumbo"
```

---

### Task 7: `SliceView` — un plano ortogonal renderizado con vtk.js

**Files:**
- Create: `frontend/src/vtk/SliceView.tsx`
- Modify: `frontend/src/vtk/MprView.tsx` → renombrar a `MprViewLegacy.tsx` (git mv) y exportar `MprViewLegacy`.

**Interfaces:**
- Consumes: `vtkImageData` de Task 5, `sliceCamera`, `screenAxes`, `edgeLabels`, `Plane` (Task 3), HUD (Task 6).
- Produces:

```ts
export interface SliceViewProps {
  image: vtkImageData;                 // compartido
  meta: VolumeMeta;                    // shape/spacing NATIVOS (para índices)
  plane: Plane;
  index: number;                       // índice de corte nativo (0..n-1)
  onIndexChange: (i: number) => void;
  wc: number; ww: number;
  onWindowLevel: (wc: number, ww: number) => void;
  crosshair: { u: number; v: number } | null;      // fracción 0–1 como hoy
  onPlaneClick: (u: number, v: number) => void;
  referenceLines?: { u: number | null; v: number | null } | null;  // dónde cortan los otros planos
  band?: [number, number] | null;      // tinte de la banda de umbral
  orientation: Orientation;
  levelNote?: string | null;           // «resolución reducida · 4/12»
  active?: boolean;
  compact?: boolean;
}
export function SliceView(props: SliceViewProps): JSX.Element;
```

- [ ] **Step 1: Renombrar el visor antiguo**

```bash
cd frontend && git mv src/vtk/MprView.tsx src/vtk/MprViewLegacy.tsx
```

En `MprViewLegacy.tsx` cambia `export function MprView` por `export function MprViewLegacy` y en `Viewer.tsx` actualiza la importación (`import { MprViewLegacy as MprView } from "./MprViewLegacy";`) para que todo siga compilando hasta Task 10.

- [ ] **Step 2: `SliceView.tsx`**

```tsx
/* SliceView — un plano ortogonal del volumen, renderizado en el navegador.

   El vtkImageData llega ya construido y compartido; aquí solo hay un
   vtkImageMapper con su modo de corte y una cámara paralela fija en la
   orientación de siempre (la de los PNG). Ventana/nivel es una propiedad
   del actor, así que arrastrar no toca la red. El HUD va encima en HTML. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageMapper from "@kitware/vtk.js/Rendering/Core/ImageMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";
import { SlicingMode } from "@kitware/vtk.js/Rendering/Core/ImageMapper/Constants";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { edgeLabels, screenAxes, sliceCamera, type Orientation, type Plane } from "./geometry";
import { HudFrame } from "./hud/HudFrame";
import { HudLadder } from "./hud/HudLadder";
import { HudReadout } from "./hud/HudReadout";
import { HudReticle } from "./hud/HudReticle";

const MODE: Record<Plane, SlicingMode> = { axial: SlicingMode.K, coronal: SlicingMode.J, sagital: SlicingMode.I };
const LABEL: Record<Plane, string> = { axial: "AXIAL", coronal: "CORONAL", sagital: "SAGITAL" };

/** Número de cortes del plano en índices NATIVOS. */
function planeCount(meta: VolumeMeta, plane: Plane) {
  const [z, y, x] = meta.shape;
  return plane === "axial" ? z : plane === "coronal" ? y : x;
}

export interface SliceViewProps {
  image: vtkImageData;
  meta: VolumeMeta;
  plane: Plane;
  index: number;
  onIndexChange: (i: number) => void;
  wc: number; ww: number;
  onWindowLevel: (wc: number, ww: number) => void;
  crosshair: { u: number; v: number } | null;
  onPlaneClick: (u: number, v: number) => void;
  referenceLines?: { u: number | null; v: number | null } | null;
  band?: [number, number] | null;
  orientation: Orientation;
  levelNote?: string | null;
  active?: boolean;
  compact?: boolean;
}

interface Scene {
  grw: vtkGenericRenderWindow;
  mapper: vtkImageMapper;
  actor: vtkImageSlice;
  bandMapper: vtkImageMapper;
  bandActor: vtkImageSlice;
}

export function SliceView(p: SliceViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  // Rectángulo de la imagen en px del contenedor, para retícula y clics.
  const [box, setBox] = useState<{ left: number; top: number; w: number; h: number; mmPerPx: number } | null>(null);
  const count = planeCount(p.meta, p.plane);
  // Índice del vtkImageData (puede ir con stride en el plano): el índice de
  // corte del plano axial no cambia; los de coronal/sagital se dividen.
  const dims = p.image.getDimensions();
  const nativeAlong = p.plane === "axial" ? p.meta.shape[0] : p.plane === "coronal" ? p.meta.shape[1] : p.meta.shape[2];
  const imgAlong = p.plane === "axial" ? dims[2] : p.plane === "coronal" ? dims[1] : dims[0];
  const imgIndex = Math.round((p.index / Math.max(1, nativeAlong - 1)) * Math.max(0, imgAlong - 1));

  // ── Escena: una vez por imagen/plano ─────────────────────────────────── #
  useEffect(() => {
    const container = containerRef.current; if (!container) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(container);
    const renderer = grw.getRenderer();
    const rw = grw.getRenderWindow();
    // Sin interacción de vtk: rueda, arrastre y clic los gestiona el HUD.
    grw.getInteractor().unbindEvents();

    const mapper = vtkImageMapper.newInstance();
    mapper.setInputData(p.image);
    mapper.setSlicingMode(MODE[p.plane]);
    const actor = vtkImageSlice.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationTypeToLinear();
    renderer.addActor(actor);

    // Capa del tinte de banda: mismo corte, opaca solo dentro de [lo, hi].
    const bandMapper = vtkImageMapper.newInstance();
    bandMapper.setInputData(p.image);
    bandMapper.setSlicingMode(MODE[p.plane]);
    const bandActor = vtkImageSlice.newInstance();
    bandActor.setMapper(bandMapper);
    bandActor.setVisibility(false);
    renderer.addActor(bandActor);

    const cam = renderer.getActiveCamera();
    cam.setParallelProjection(true);
    const { direction, viewUp } = sliceCamera(p.plane);
    const b = p.image.getBounds();
    const c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
    cam.setFocalPoint(c[0], c[1], c[2]);
    cam.setPosition(c[0] - direction[0] * 1000, c[1] - direction[1] * 1000, c[2] - direction[2] * 1000);
    cam.setViewUp(viewUp[0], viewUp[1], viewUp[2]);
    renderer.resetCamera(mapper.getBounds());
    scene.current = { grw, mapper, actor, bandMapper, bandActor };

    const ro = new ResizeObserver(() => { grw.resize(); measure(); rw.render(); });
    ro.observe(container);
    const measure = () => {
      // Proyecta las esquinas del corte a px: con cámara paralela basta la
      // escala (parallelScale = media altura visible en mm).
      const [w, h] = rw.getViews()[0].getSize();
      const scale = cam.getParallelScale();
      const mmPerPx = (2 * scale) / h;
      const bounds = mapper.getBoundsForSlice();
      const { right, down } = screenAxes(p.plane);
      const ext = (v: number[]) => Math.abs(v[0]) * (bounds[1] - bounds[0]) + Math.abs(v[1]) * (bounds[3] - bounds[2]) + Math.abs(v[2]) * (bounds[5] - bounds[4]);
      const wPx = ext(right) / mmPerPx, hPx = ext(down) / mmPerPx;
      setBox({ left: (w - wPx) / 2, top: (h - hPx) / 2, w: wPx, h: hPx, mmPerPx });
    };
    measure();
    rw.render();
    return () => {
      ro.disconnect();
      scene.current = null;
      grw.delete();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.image, p.plane]);

  // ── Corte, ventana/nivel, banda: sin reconstruir ─────────────────────── #
  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.mapper.setSlice(imgIndex);
    s.bandMapper.setSlice(imgIndex);
    s.grw.getRenderer().resetCameraClippingRange();
    s.grw.getRenderWindow().render();
  }, [imgIndex]);

  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.actor.getProperty().setColorWindow(Math.max(1, p.ww));
    s.actor.getProperty().setColorLevel(p.wc);
    s.grw.getRenderWindow().render();
  }, [p.wc, p.ww]);

  useEffect(() => {
    const s = scene.current; if (!s) return;
    if (!p.band) { s.bandActor.setVisibility(false); s.grw.getRenderWindow().render(); return; }
    const [lo, hi] = p.band;
    const ctf = vtkColorTransferFunction.newInstance();
    ctf.addRGBPoint(lo, 0.21, 0.84, 0.66); ctf.addRGBPoint(hi, 0.21, 0.84, 0.66);
    const otf = vtkPiecewiseFunction.newInstance();
    otf.addPoint(lo - 1, 0); otf.addPoint(lo, 0.55); otf.addPoint(Math.min(hi, 1e9), 0.55); otf.addPoint(Math.min(hi, 1e9) + 1, 0);
    const prop = s.bandActor.getProperty();
    prop.setRGBTransferFunction(0, ctf);
    prop.setScalarOpacity(0, otf);
    prop.setUseLookupTableScalarRange(true);
    s.bandActor.setVisibility(true);
    s.grw.getRenderWindow().render();
  }, [p.band]);

  // ── Interacción (en el HUD, no en vtk) ───────────────────────────────── #
  const drag = useRef<{ x: number; y: number; wc: number; ww: number; moved: boolean; pan: boolean } | null>(null);
  const frac = (e: React.MouseEvent) => {
    const el = containerRef.current; if (!el || !box) return null;
    const r = el.getBoundingClientRect();
    const u = (e.clientX - r.left - box.left) / box.w, v = (e.clientY - r.top - box.top) / box.h;
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
  };
  // Zoom y desplazamiento son de la cámara paralela: parallelScale es la
  // media altura visible en mm, y mover el foco desplaza la imagen.
  const zoomBy = (factor: number) => {
    const s = scene.current; if (!s) return;
    const cam = s.grw.getRenderer().getActiveCamera();
    cam.setParallelScale(Math.max(1, cam.getParallelScale() * factor));
    s.grw.getRenderWindow().render();
    setBox((b) => (b ? { ...b, mmPerPx: b.mmPerPx * factor, w: b.w / factor, h: b.h / factor } : b));
  };
  const panBy = (dxPx: number, dyPx: number) => {
    const s = scene.current; if (!s || !box) return;
    const cam = s.grw.getRenderer().getActiveCamera();
    const { right, down } = screenAxes(p.plane);
    const mm = box.mmPerPx;
    const f = cam.getFocalPoint(), pos = cam.getPosition();
    const d = [-(right[0] * dxPx + down[0] * dyPx) * mm, -(right[1] * dxPx + down[1] * dyPx) * mm, -(right[2] * dxPx + down[2] * dyPx) * mm];
    cam.setFocalPoint(f[0] + d[0], f[1] + d[1], f[2] + d[2]);
    cam.setPosition(pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]);
    s.grw.getRenderWindow().render();
    setBox((b) => (b ? { ...b, left: b.left + dxPx, top: b.top + dyPx } : b));
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) { zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); return; }
    p.onIndexChange(Math.max(0, Math.min(count - 1, p.index + (e.deltaY > 0 ? 1 : -1))));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, wc: p.wc, ww: p.ww, moved: false, pan: e.button === 1 || e.shiftKey };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.pan) { panBy(dx, dy); d.x = e.clientX; d.y = e.clientY; return; }
    const span = p.meta.intensity_range[1] - p.meta.intensity_range[0];
    const k = span / 400;   // arrastrar 400 px recorre todo el rango
    p.onWindowLevel(d.wc - dy * k, Math.max(1, d.ww + dx * k));
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) { const f = frac(e); if (f) p.onPlaneClick(f.u, f.v); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); p.onIndexChange(Math.min(count - 1, p.index + 1)); }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); p.onIndexChange(Math.max(0, p.index - 1)); }
    if (e.key === "Home") p.onIndexChange(0);
    if (e.key === "End") p.onIndexChange(count - 1);
  };

  const labels = edgeLabels(p.plane, p.orientation);
  const fs = p.compact ? 9.5 : 10.5;
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      onMouseLeave={() => { drag.current = null; }} onKeyDown={onKey}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000", overflow: "hidden", cursor: "crosshair", outline: "none" }}
      title="Rueda o flechas: corte · Ctrl+rueda: zoom · Arrastrar: ventana/nivel · Shift o botón central: desplazar · Clic: centrar"
    >
      <HudFrame active={p.active} label={LABEL[p.plane]}>
        <span className="hud-edge top">{labels.top}</span>
        <span className="hud-edge bottom">{labels.bottom}</span>
        <span className="hud-edge left">{labels.left}</span>
        <span className="hud-edge right">{labels.right}</span>
        {box && p.crosshair && (
          <HudReticle cx={box.left + p.crosshair.u * box.w} cy={box.top + p.crosshair.v * box.h} mmPerPx={box.mmPerPx} />
        )}
        {box && p.referenceLines?.u != null && (
          <div style={{ position: "absolute", left: box.left + p.referenceLines.u * box.w, top: box.top, width: 1, height: box.h, background: "var(--hud-amber)", opacity: 0.5 }} />
        )}
        {box && p.referenceLines?.v != null && (
          <div style={{ position: "absolute", top: box.top + p.referenceLines.v * box.h, left: box.left, height: 1, width: box.w, background: "var(--hud-amber)", opacity: 0.5 }} />
        )}
        <HudLadder count={count} index={p.index} />
        <HudReadout at="bl" lines={[`${String(p.index + 1).padStart(3, " ")}/${count}`]} />
        <HudReadout at="br" lines={[`W ${Math.round(p.ww)}  L ${Math.round(p.wc)}`]} />
        {p.levelNote && <HudReadout at="tr" lines={[p.levelNote]} tone="warn" />}
        {box && box.mmPerPx > 0 && (
          <div style={{ position: "absolute", right: 60, bottom: 24, width: 10 / box.mmPerPx, height: 1, background: "var(--hud-dim)" }}>
            <span style={{ position: "absolute", right: 0, top: -12, fontSize: fs - 1, color: "var(--hud-dim)" }}>10 mm</span>
          </div>
        )}
      </HudFrame>
    </div>
  );
}
```

- [ ] **Step 3: Compilar y probar en el navegador**

Run: `cd frontend && npx tsc -b`. Luego, para verlo antes de integrarlo en Task 10, monta provisionalmente en `Viewer.tsx` (solo en el panel principal cuando no hay malla) un `SliceView` con `useClientVolume(sessionId, meta, mprVoxel.z)`:

```tsx
const clientVol = useClientVolume(sessionId, meta, mprVoxel.z);
// …en la rama que hoy renderiza <MprView plane="axial" …>:
clientVol.image && hasWebGL2() ? (
  <SliceView image={clientVol.image} meta={meta} plane="axial" index={mprVoxel.z}
    onIndexChange={(z) => setMprVoxel({ ...mprVoxel, z })}
    wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww}
    onWindowLevel={(wc, ww) => setMprWl({ wc, ww })}
    crosshair={mprCrosshair}
    onPlaneClick={(u, v) => setMprVoxel({ ...mprVoxel, x: clampIdx(meta.shape[2], u), y: clampIdx(meta.shape[1], v) })}
    orientation={{ direction: meta.direction, manual: null }}
    levelNote={clientVol.level === "coarse" ? `RESOLUCIÓN REDUCIDA${clientVol.progress ? ` · ${clientVol.progress.done}/${clientVol.progress.total}` : ""}` : null}
    band={previewActive ? previewBand : null} />
) : ( /* MprView legacy como hasta ahora */ )
```

Abre Case 3 en el paso Carga DICOM y comprueba: la imagen aparece en < 3 s (grueso), el rótulo pasa de «RESOLUCIÓN REDUCIDA · n/12» a nada cuando llega el completo, la rueda cambia de corte sin retraso perceptible, arrastrar cambia W/L en vivo, el clic mueve la retícula, la orientación axial coincide con la del PNG de la franja (misma imagen, mismo lado). Ejecuta en la consola el script de la revisión (15 `WheelEvent` en 600 ms contando cambios del texto `/384` del HUD): deben verse ≥ 12 cambios.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/vtk/SliceView.tsx frontend/src/vtk/MprViewLegacy.tsx frontend/src/vtk/Viewer.tsx
git commit -m "Los cortes se renderizan en el navegador desde el volumen: la rueda ya no espera a la red"
```

---

### Task 8: Estado del visor en el store: distribución, punto de foco, sincronización y orientación manual

**Files:**
- Create: `frontend/src/vtk/layout.ts`
- Test: `frontend/src/vtk/layout.test.ts`
- Modify: `frontend/src/store/planning.tsx`
- Test: `frontend/src/store/planning.test.tsx`

**Interfaces:**
- Produces (`layout.ts`):
  - `type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip"`
  - `interface ViewerLayout { main: PaneId; strip: PaneId[] }`
  - `DEFAULT_LAYOUT = { main: "scene", strip: ["axial", "coronal", "sagital", "mip"] }`
  - `swapPane(layout, id: PaneId): ViewerLayout` — `id` pasa al principal y el principal ocupa su hueco en la franja; si `id` ya es el principal, devuelve el mismo objeto.
  - `loadLayout(): ViewerLayout` / `saveLayout(l)` en `localStorage["ws.viewer.layout"]`, validando que contenga los cinco paneles una sola vez.
- Produces (store): `viewerLayout`, `setViewerLayout`, `focusPoint: Vec3 | null`, `setFocusMm(mm: Vec3, meta: VolumeMeta)` (fija `focusPoint` **y** `mprVoxel`), `syncViews: boolean`, `setSyncViews`, `orientationManual: ManualOrientation | null`, `setOrientationManual`, `mipMode: "acumulado" | "lamina"`, `setMipMode`, `mipSlabMm: number`, `setMipSlabMm`.

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/layout.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, swapPane } from "./layout";

describe("swapPane", () => {
  it("moves a strip pane to main and the old main into its slot", () => {
    const l = swapPane(DEFAULT_LAYOUT, "mip");
    expect(l.main).toBe("mip");
    expect(l.strip).toEqual(["axial", "coronal", "sagital", "scene"]);
  });
  it("maximizing the main pane is a no-op", () => {
    expect(swapPane(DEFAULT_LAYOUT, "scene")).toBe(DEFAULT_LAYOUT);
  });
  it("swapping twice restores the layout", () => {
    expect(swapPane(swapPane(DEFAULT_LAYOUT, "axial"), "scene")).toEqual(DEFAULT_LAYOUT);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips through localStorage", () => {
    saveLayout(swapPane(DEFAULT_LAYOUT, "coronal"));
    expect(loadLayout()).toEqual({ main: "coronal", strip: ["axial", "scene", "sagital", "mip"] });
  });
  it("falls back to the default on garbage or missing panes", () => {
    localStorage.setItem("ws.viewer.layout", JSON.stringify({ main: "axial", strip: ["axial", "mip"] }));
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    localStorage.setItem("ws.viewer.layout", "{not json");
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });
});
```

Añade a `frontend/src/store/planning.test.tsx` (sigue el patrón de los tests existentes en ese archivo, que montan `PlanningProvider` y leen el store con `renderHook`):

```tsx
import { act, renderHook } from "@testing-library/react";
import { PlanningProvider, usePlanning } from "./planning";
import type { VolumeMeta } from "../api/types";

const meta = {
  shape: [100, 200, 300], spacing: [0.5, 0.25, 0.25], wc: 0, ww: 1, modality: "XA",
  direction: null, orientation_known: false, origin_mm: [0, 0, 0],
  intensity_range: [0, 1], cache_key: "1", full_stride: 1,
} as VolumeMeta;

describe("foco compartido del visor", () => {
  it("setFocusMm sets both the focus point and the crosshair voxel", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    act(() => result.current.setFocusMm([7.5, 10, 3.5], meta));
    expect(result.current.focusPoint).toEqual([7.5, 10, 3.5]);
    expect(result.current.mprVoxel).toEqual({ x: 30, y: 40, z: 7 });
  });
  it("syncViews defaults to on and resetDownstream keeps it", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    expect(result.current.syncViews).toBe(true);
    act(() => result.current.resetDownstream());
    expect(result.current.syncViews).toBe(true);
    expect(result.current.focusPoint).toBeNull();
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `cd frontend && npx vitest run src/vtk/layout.test.ts src/store/planning.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `layout.ts`**

```ts
/* Distribución del visor: un panel principal y una franja de cuatro. Doble
   clic en una celda la sube al principal y el principal baja a su hueco. */

export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
export interface ViewerLayout { main: PaneId; strip: PaneId[] }

export const ALL_PANES: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
export const DEFAULT_LAYOUT: ViewerLayout = { main: "scene", strip: ["axial", "coronal", "sagital", "mip"] };
const KEY = "ws.viewer.layout";

export function swapPane(layout: ViewerLayout, id: PaneId): ViewerLayout {
  if (layout.main === id) return layout;
  const i = layout.strip.indexOf(id);
  if (i < 0) return layout;
  const strip = [...layout.strip];
  strip[i] = layout.main;
  return { main: id, strip };
}

function valid(l: unknown): l is ViewerLayout {
  if (!l || typeof l !== "object") return false;
  const { main, strip } = l as ViewerLayout;
  if (!Array.isArray(strip) || strip.length !== 4) return false;
  const all = [main, ...strip];
  return ALL_PANES.every((p) => all.filter((x) => x === p).length === 1);
}

export function loadLayout(): ViewerLayout {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return valid(parsed) ? parsed : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: ViewerLayout): void {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* almacenamiento bloqueado */ }
}
```

- [ ] **Step 4: Store**

En `frontend/src/store/planning.tsx`:

Importa `import { DEFAULT_LAYOUT, loadLayout, saveLayout, type ViewerLayout } from "../vtk/layout";`, `import { mmToVoxel, type ManualOrientation } from "../vtk/geometry";` y `import type { VolumeMeta } from "../api/types";`.

En `PlanningState` añade:

```ts
  /** Distribución del visor: panel principal + franja de cuatro. */
  viewerLayout: ViewerLayout;
  setViewerLayout: (l: ViewerLayout) => void;
  /** Punto (mm de mundo) en el que se centran todas las vistas cuando
   *  `syncViews` está activo. El crosshair (`mprVoxel`) se deriva de él. */
  focusPoint: Vec3 | null;
  setFocusMm: (mm: Vec3, meta: VolumeMeta) => void;
  syncViews: boolean;
  setSyncViews: (v: boolean) => void;
  /** Orientación fijada a mano para volúmenes sin etiquetas (3DRA). */
  orientationManual: ManualOrientation | null;
  setOrientationManual: (m: ManualOrientation | null) => void;
  mipMode: "acumulado" | "lamina";
  setMipMode: (m: "acumulado" | "lamina") => void;
  mipSlabMm: number;
  setMipSlabMm: (mm: number) => void;
```

En el provider:

```ts
  const [viewerLayout, _setViewerLayout] = useState<ViewerLayout>(() => loadLayout());
  const setViewerLayout = (l: ViewerLayout) => { _setViewerLayout(l); saveLayout(l); };
  const [focusPoint, setFocusPoint] = useState<Vec3 | null>(null);
  const [syncViews, setSyncViews] = useState(true);
  const [orientationManual, setOrientationManual] = useState<ManualOrientation | null>(null);
  const [mipMode, setMipMode] = useState<"acumulado" | "lamina">("acumulado");
  const [mipSlabMm, setMipSlabMm] = useState(10);
  const setFocusMm = useCallback((mm: Vec3, meta: VolumeMeta) => {
    setFocusPoint(mm);
    setMprVoxel(mmToVoxel(mm, meta));
  }, []);
```

En `resetDownstream` añade `setFocusPoint(null); setOrientationManual(null);` (la distribución, la sincronización y el modo MIP son preferencias y se conservan). Expón todo en el `value` del provider. `DEFAULT_LAYOUT` queda importado para el test de `layout.test.ts`; no hace falta usarlo aquí.

- [ ] **Step 5: Ejecutar**

Run: `cd frontend && npx vitest run src/vtk/layout.test.ts src/store/planning.test.tsx && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/vtk/layout.ts frontend/src/vtk/layout.test.ts frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx
git commit -m "El visor guarda su distribución, un punto de foco común y la orientación fijada a mano"
```

---

### Task 9: `Viewer` en 1+3+MIP con maximizar y cromo HUD

**Files:**
- Modify: `frontend/src/vtk/Viewer.tsx` (componentes `Viewer` y `MprStrip`)
- Modify: `frontend/src/pages/Workspace.tsx` (la franja recibe el mismo volumen)

**Interfaces:**
- Consumes: `useClientVolume` (Task 5), `SliceView` (Task 7), HUD (Task 6), store de Task 8, `MipView` (Task 10, se importa perezosamente; hasta que exista, el panel `mip` muestra un `HudReadout` «MIP · pendiente»).
- Produces: `Viewer` deja de recibir la franja aparte: exporta `<ViewerWorkspace step>` que renderiza principal + franja y sustituye a `<Viewer/> + <MprStrip/>` en `Workspace.tsx`. Internamente `renderPane(id: PaneId, slot: "main" | "strip")` decide qué va en cada celda.

- [ ] **Step 1: Un solo volumen para todas las celdas**

Al principio de `ViewerWorkspace`:

```tsx
const meta = useVolumeMeta(sessionId);
const clientVol = useClientVolume(hasWebGL2() ? sessionId : null, meta, mprVoxel.z);
const legacy = !hasWebGL2() || !clientVol.image;
const orientation: Orientation = { direction: meta?.direction ?? null, manual: orientationManual };
const levelNote = clientVol.level === "coarse"
  ? `RESOLUCIÓN REDUCIDA${clientVol.progress ? ` · ${clientVol.progress.done}/${clientVol.progress.total}` : ""}`
  : clientVol.error ? "SIN VOLUMEN COMPLETO" : null;
```

`useVolumeMeta` se conserva tal cual. Elimina la segunda llamada a `useVolumeMeta` que hacía `MprStrip` (la franja pasa a ser parte de `ViewerWorkspace`).

- [ ] **Step 2: Configuración por plano (la que tenía `MprStrip.cfg`), ampliada con líneas de referencia**

```tsx
const f = (n: number, i: number) => (n > 1 ? i / (n - 1) : 0.5);
const [nz, ny, nx] = meta?.shape ?? [1, 1, 1];
const planeCfg = (plane: Plane) => {
  const vox = mprVoxel;
  const set = (v: Partial<typeof vox>) => setMprVoxel({ ...vox, ...v });
  if (plane === "axial") return {
    index: vox.z, crosshair: { u: f(nx, vox.x), v: f(ny, vox.y) },
    referenceLines: { u: f(nx, vox.x), v: f(ny, vox.y) },      // sagital vertical, coronal horizontal
    onIndexChange: (i: number) => set({ z: i }),
    onPlaneClick: (u: number, v: number) => set({ x: clampIdx(nx, u), y: clampIdx(ny, v) }),
  };
  if (plane === "coronal") return {
    index: vox.y, crosshair: { u: f(nx, vox.x), v: 1 - f(nz, vox.z) },
    referenceLines: { u: f(nx, vox.x), v: 1 - f(nz, vox.z) },
    onIndexChange: (i: number) => set({ y: i }),
    onPlaneClick: (u: number, v: number) => set({ x: clampIdx(nx, u), z: clampIdx(nz, 1 - v) }),
  };
  return {
    index: vox.x, crosshair: { u: f(ny, vox.y), v: 1 - f(nz, vox.z) },
    referenceLines: { u: f(ny, vox.y), v: 1 - f(nz, vox.z) },
    onIndexChange: (i: number) => set({ x: i }),
    onPlaneClick: (u: number, v: number) => set({ y: clampIdx(ny, u), z: clampIdx(nz, 1 - v) }),
  };
};
```

- [ ] **Step 3: `renderPane`**

```tsx
const renderPane = (id: PaneId, slot: "main" | "strip") => {
  const compact = slot === "strip";
  if (id === "scene") return renderScene(compact);     // lo que hoy hace Viewer (3D / volumen / oblicuo / axial legacy)
  if (id === "mip") {
    return meta && clientVol.image
      ? <Suspense fallback={<ViewerLoading label="MIP…" />}><MipView image={clientVol.image} meta={meta} orientation={orientation} compact={compact} /></Suspense>
      : <HudFrame label="MIP"><HudReadout at="bl" lines={["SIN VOLUMEN"]} /></HudFrame>;
  }
  if (!meta || !sessionId) return <HudFrame label={id.toUpperCase()}><HudReadout at="bl" lines={[series ? "CARGANDO…" : "SIN VOLUMEN"]} /></HudFrame>;
  const c = planeCfg(id);
  if (legacy) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <MprView sessionId={sessionId} meta={meta} plane={id} compact={compact} wc={mprWl?.wc} ww={mprWl?.ww} band={previewBand}
          index={c.index} onIndexChange={c.onIndexChange} crosshair={c.crosshair} onPlaneClick={c.onPlaneClick} onWindowLevel={(wc, ww) => setMprWl({ wc, ww })} />
        {!hasWebGL2() && <HudFrame><HudReadout at="tr" lines={["SIN WEBGL2 · VISOR REDUCIDO"]} tone="warn" /></HudFrame>}
      </div>
    );
  }
  return <SliceView image={clientVol.image!} meta={meta} plane={id} index={c.index} onIndexChange={c.onIndexChange}
    wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww} onWindowLevel={(wc, ww) => setMprWl({ wc, ww })}
    crosshair={c.crosshair} onPlaneClick={c.onPlaneClick} referenceLines={c.referenceLines}
    band={step === "segment" ? previewBand : null} orientation={orientation} levelNote={levelNote}
    active={viewerLayout.main === id} compact={compact} />;
};
```

`renderScene(compact)` es el cuerpo actual del `return` de `Viewer` (la rama `viewMode`), con la rama «sin malla» usando `renderPane("axial", "main")` cuando `legacy` es falso. La barra de modos (`3D · Volumen · Oblicuo`), los botones de cámara y el resto de píldoras se sustituyen por `HudToggleGroup` dentro de un `HudFrame` con `HudReadout at="tl"` para `STEP_SCENE[step]` (en mayúsculas) y `at="tr"` para el modo y el nivel de volumen. Las leyendas de morfometría, dispositivos y perforantes pasan a `HudReadout at="bl"/"br"` con sus líneas en mono (`Ø CUELLO 1.7 mm`, `H DOMO 6.1 mm`, …), sin fondos. La pista «arrastra para rotar · rueda para zoom» se convierte en `<div className="hud-hint">` que se muestra 3 s al montar la escena y cuando se pulsa `?` (estado `showHint` con `setTimeout` de 3000 ms; el `keydown` de `?` se registra en `Workspace.tsx` junto al de `Escape`).

- [ ] **Step 4: Distribución con maximizar**

```tsx
return (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
    <div style={{ flex: 1, position: "relative", background: "#000", minHeight: 0 }}
         onDoubleClick={() => { /* el principal no se maximiza: no-op */ }}>
      {renderPane(viewerLayout.main, "main")}
      <div style={{ position: "absolute", top: 8, right: 14, zIndex: 6 }}>
        <HudToggleGroup options={[{ key: "sync", label: syncViews ? "SINCRO ●" : "SINCRO ○", title: "Centrar todas las vistas en el punto" }]}
          value={syncViews ? "sync" : ""} onChange={() => setSyncViews(!syncViews)} />
      </div>
    </div>
    <div className="mpr-strip" style={{ height: "clamp(160px, 26vh, 240px)", flexShrink: 0, display: "flex", gap: 1, background: "var(--hud-dim)" }}>
      {viewerLayout.strip.map((id) => (
        <div key={id} style={{ flex: 1, position: "relative", minWidth: 0, background: "#000" }}
             onDoubleClick={() => setViewerLayout(swapPane(viewerLayout, id))}
             title="Doble clic: maximizar">
          {renderPane(id, "strip")}
        </div>
      ))}
    </div>
  </div>
);
```

El selector de preajustes de ventana que hoy flota sobre la franja pasa al `HudReadout` de W/L del panel activo como un `<select>` con la clase `hud-toggle` (misma tipografía); su contenido se decide en Task 14.

- [ ] **Step 5: `Workspace.tsx`**

Sustituye

```tsx
<Viewer step={step} />
<MprStrip />
```

por `<ViewerWorkspace step={step} />` y borra la importación de `MprStrip`.

- [ ] **Step 6: Comprobar**

Run: `cd frontend && npx tsc -b && npx vitest run`. En el navegador con Case 3: la franja tiene cuatro celdas (la cuarta dice «MIP · SIN VOLUMEN» hasta Task 10); doble clic en «coronal» la sube al principal y el 3D baja a su hueco; doble clic en la celda del 3D lo devuelve; recargar conserva la distribución; el crosshair y las líneas ámbar se mueven en las tres a la vez; `Ax/Cor/Sag/Ajustar` siguen funcionando como grupo HUD.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/vtk/Viewer.tsx frontend/src/pages/Workspace.tsx
git commit -m "Un panel principal y cuatro celdas con doble clic para maximizar, y el cromo del visor pasa a HUD"
```

---

### Task 10: `MipView` — MIP progresivo sincronizado con los cortes

**Files:**
- Create: `frontend/src/vtk/MipView.tsx`
- Modify: `frontend/src/vtk/Viewer.tsx` (importación perezosa de `MipView` y control de modo)

**Interfaces:**
- Consumes: `vtkImageData` compartido, `mprVoxel`, `mipMode`, `mipSlabMm`, `previewBand`/`segmentation` (umbral inferior), `sliceCamera`, `cameraHeading`, `HudHeadingTape`, `HudLadder`.
- Produces: `<MipView image meta orientation compact? mainPlane?: Plane>`; `mainPlane` es el plano cuyo índice recorta (por defecto `axial`).

- [ ] **Step 1: Componente**

```tsx
/* MipView — proyección de máxima intensidad que crece con el corte.

   Es el mismo vtkImageData de los planos con un vtkVolumeMapper en modo MIP.
   «Acumulado»: un plano de recorte en el corte actual deja ver solo lo que ya
   se ha recorrido, así que al avanzar el volumen aparece y al retroceder
   desaparece. «Lámina»: dos planos a ±N mm. La función de transferencia
   «Vasos» arranca en el umbral inferior de la banda, no en HU fijos. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkVolume from "@kitware/vtk.js/Rendering/Core/Volume";
import vtkVolumeMapper from "@kitware/vtk.js/Rendering/Core/VolumeMapper";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { usePlanning } from "../store/planning";
import { cameraHeading, sliceCamera, type Orientation, type Plane } from "./geometry";
import { HudFrame } from "./hud/HudFrame";
import { HudHeadingTape } from "./hud/HudHeadingTape";
import { HudLadder } from "./hud/HudLadder";
import { HudReadout } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";

const AXIS_OF: Record<Plane, 0 | 1 | 2> = { sagital: 0, coronal: 1, axial: 2 };   // eje vtk (x,y,z)

export function MipView({ image, meta, orientation, compact = false, mainPlane = "axial" }: {
  image: vtkImageData; meta: VolumeMeta; orientation: Orientation; compact?: boolean; mainPlane?: Plane;
}) {
  const { mprVoxel, mipMode, setMipMode, mipSlabMm, setMipSlabMm, previewBand, segmentation } = usePlanning();
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<{ grw: vtkGenericRenderWindow; mapper: vtkVolumeMapper; actor: vtkVolume } | null>(null);
  const [heading, setHeading] = useState<ReturnType<typeof cameraHeading>>(null);
  const [reverse, setReverse] = useState(false);

  const axis = AXIS_OF[mainPlane];
  const index = mainPlane === "axial" ? mprVoxel.z : mainPlane === "coronal" ? mprVoxel.y : mprVoxel.x;
  const count = mainPlane === "axial" ? meta.shape[0] : mainPlane === "coronal" ? meta.shape[1] : meta.shape[2];
  const spacingAlong = mainPlane === "axial" ? meta.spacing[0] : mainPlane === "coronal" ? meta.spacing[1] : meta.spacing[2];
  const posMm = index * spacingAlong;
  // Umbral inferior de la banda: lo que se está segmentando o lo segmentado.
  const lower = previewBand?.[0] ?? (segmentation ? Number(segmentation.threshold_lower ?? NaN) : NaN);
  const lo = Number.isFinite(lower) ? lower : meta.intensity_range[0] + 0.6 * (meta.intensity_range[1] - meta.intensity_range[0]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(el);
    const renderer = grw.getRenderer();
    const mapper = vtkVolumeMapper.newInstance();
    mapper.setInputData(image);
    mapper.setBlendModeToMaximumIntensity();
    mapper.setSampleDistance(Math.min(...image.getSpacing()) * 1.2);
    const actor = vtkVolume.newInstance();
    actor.setMapper(mapper);
    renderer.addVolume(actor);
    const cam = renderer.getActiveCamera();
    const { direction, viewUp } = sliceCamera(mainPlane);
    const b = image.getBounds();
    const c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
    cam.setFocalPoint(c[0], c[1], c[2]);
    cam.setPosition(c[0] - direction[0] * 1000, c[1] - direction[1] * 1000, c[2] - direction[2] * 1000);
    cam.setViewUp(viewUp[0], viewUp[1], viewUp[2]);
    renderer.resetCamera();
    const sub = cam.onModified(() => setHeading(cameraHeading(cam.getDirectionOfProjection() as [number, number, number], cam.getViewUp() as [number, number, number], orientation)));
    setHeading(cameraHeading(cam.getDirectionOfProjection() as [number, number, number], cam.getViewUp() as [number, number, number], orientation));
    const ro = new ResizeObserver(() => { grw.resize(); grw.getRenderWindow().render(); });
    ro.observe(el);
    scene.current = { grw, mapper, actor };
    grw.getRenderWindow().render();
    return () => { sub.unsubscribe(); ro.disconnect(); scene.current = null; grw.delete(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, mainPlane]);

  // Función de transferencia «Vasos»: gris, opaca desde el umbral inferior.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const [rlo, rhi] = meta.intensity_range;
    const ctf = vtkColorTransferFunction.newInstance();
    ctf.addRGBPoint(rlo, 0, 0, 0); ctf.addRGBPoint(lo, 0.25, 0.25, 0.25); ctf.addRGBPoint(rhi, 1, 1, 1);
    const otf = vtkPiecewiseFunction.newInstance();
    otf.addPoint(rlo, 0); otf.addPoint(lo, 0); otf.addPoint(lo + (rhi - lo) * 0.15, 0.9); otf.addPoint(rhi, 1);
    const prop = s.actor.getProperty();
    prop.setRGBTransferFunction(0, ctf); prop.setScalarOpacity(0, otf);
    prop.setInterpolationTypeToLinear(); prop.setShade(false);
    s.grw.getRenderWindow().render();
  }, [lo, meta.intensity_range]);

  // Planos de recorte: es lo que hace que el MIP «avance» con el corte.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.mapper.removeAllClippingPlanes();
    const n = (sign: 1 | -1): [number, number, number] => { const v: [number, number, number] = [0, 0, 0]; v[axis] = sign; return v; };
    const o = (mm: number): [number, number, number] => { const v: [number, number, number] = [0, 0, 0]; v[axis] = mm; return v; };
    if (mipMode === "acumulado") {
      const pl = vtkPlane.newInstance(); pl.setOrigin(...o(posMm)); pl.setNormal(...n(reverse ? 1 : -1));
      s.mapper.addClippingPlane(pl);           // conserva el lado ya recorrido
    } else {
      const a = vtkPlane.newInstance(); a.setOrigin(...o(posMm - mipSlabMm)); a.setNormal(...n(1));
      const b = vtkPlane.newInstance(); b.setOrigin(...o(posMm + mipSlabMm)); b.setNormal(...n(-1));
      s.mapper.addClippingPlane(a); s.mapper.addClippingPlane(b);
    }
    s.grw.getRenderWindow().render();
  }, [axis, posMm, mipMode, mipSlabMm, reverse]);

  const fit = () => { const s = scene.current; if (!s) return; s.grw.getRenderer().resetCamera(); s.grw.getRenderWindow().render(); };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} title="Arrastrar: rotar · Rueda: zoom" />
      <HudFrame label="MIP">
        {heading && <HudHeadingTape azimuthDeg={heading.azimuthDeg} elevationDeg={heading.elevationDeg} known={heading.known} />}
        <HudLadder count={count} index={index} />
        <HudReadout at="bl" lines={[mipMode === "acumulado" ? `ACUMULADO HASTA ${index + 1}/${count}` : `LÁMINA ±${mipSlabMm} mm`, `UMBRAL ${Math.round(lo)}`]} />
        {!compact && (
          <div style={{ position: "absolute", bottom: 22, right: 14, display: "flex", gap: 14, alignItems: "center", pointerEvents: "auto" }}>
            <HudToggleGroup options={[{ key: "acumulado", label: "ACUMULADO" }, { key: "lamina", label: "LÁMINA" }]} value={mipMode} onChange={(k) => setMipMode(k as "acumulado" | "lamina")} />
            {mipMode === "acumulado"
              ? <HudToggleGroup options={[{ key: "rev", label: reverse ? "DESDE EL FINAL" : "DESDE EL INICIO" }]} value="rev" onChange={() => setReverse(!reverse)} />
              : <input type="range" min={2} max={40} value={mipSlabMm} onChange={(e) => setMipSlabMm(Number(e.target.value))} style={{ width: 90, accentColor: "var(--hud)" }} title="Grosor de la lámina" />}
            <HudToggleGroup options={[{ key: "fit", label: "AJUSTAR" }]} value="" onChange={fit} />
          </div>
        )}
      </HudFrame>
    </div>
  );
}
```

`SegmentResult` no tiene `threshold_lower` en el tipo del frontend; añádelo como opcional en `frontend/src/api/types.ts` (`threshold_lower?: number;`) y devuélvelo en `SegmentResult` del backend (`models/segmentation.py`: `threshold_lower: float = 0.0`, rellenado en `_run_segmentation_sync` con `threshold_lower=lower`).

- [ ] **Step 2: Integrar**

En `Viewer.tsx`: `const MipView = lazy(() => import("./MipView").then((m) => ({ default: m.MipView })));` y en `renderPane("mip")` pásale `mainPlane={viewerLayout.main === "coronal" || viewerLayout.main === "sagital" ? viewerLayout.main : "axial"}`.

- [ ] **Step 3: Comprobar**

Run: `cd frontend && npx tsc -b`. Con Case 3: en la cuarta celda el MIP muestra solo los vasos (nada de piel); al subir cortes en el axial el MIP crece y al bajar se encoge; «LÁMINA» muestra ±10 mm alrededor del corte; maximizar el MIP con doble clic da los controles de modo; la cinta de rumbo cambia al rotar y aparece entre corchetes (orientación asumida en Case 3).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/vtk/MipView.tsx frontend/src/vtk/Viewer.tsx frontend/src/api/types.ts backend/models/segmentation.py backend/routers/segment.py
git commit -m "Un MIP que aparece según se avanza por los cortes, en su propia celda"
```

---

### Task 11: `ObliqueView` en el cliente

**Files:**
- Create: `frontend/src/vtk/ObliqueView.tsx`
- Modify: `frontend/src/vtk/Viewer.tsx` (la rama `viewMode === "oblique"`), `frontend/src/vtk/ObliqueMprView.tsx` (se conserva como respaldo legacy)

**Interfaces:**
- Consumes: `vtkImageData`, `mprWl`, `mprVoxel`, `HudToggleGroup`, `HudReadout`.
- Produces: `<ObliqueView image meta wc ww onWindowLevel>` con los mismos controles (inclinación −80…80°, posición 0–1, eje X/Y) que `ObliqueMprView`, resuelto con `vtkImageResliceMapper` y centrado en el vóxel del crosshair en vez de en el centro del volumen.

- [ ] **Step 1: Componente**

```tsx
/* ObliqueView — corte inclinado, resuelto en el navegador con
   vtkImageResliceMapper. El plano pasa por el crosshair (no por el centro
   del volumen, como el oblicuo del servidor), así que lo que se inclina es
   lo que se está mirando. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageResliceMapper from "@kitware/vtk.js/Rendering/Core/ImageResliceMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { usePlanning } from "../store/planning";
import { voxelToMm } from "./geometry";
import { HudFrame } from "./hud/HudFrame";
import { HudReadout } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";

export function ObliqueView({ image, meta, wc, ww, onWindowLevel }: {
  image: vtkImageData; meta: VolumeMeta; wc: number; ww: number; onWindowLevel: (wc: number, ww: number) => void;
}) {
  const { mprVoxel } = usePlanning();
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<{ grw: vtkGenericRenderWindow; mapper: vtkImageResliceMapper; actor: vtkImageSlice; plane: vtkPlane } | null>(null);
  const [tilt, setTilt] = useState(20);
  const [pos, setPos] = useState(0);        // mm a lo largo de la normal, desde el crosshair
  const [axis, setAxis] = useState<"x" | "y">("x");

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(el);
    const renderer = grw.getRenderer();
    const plane = vtkPlane.newInstance();
    const mapper = vtkImageResliceMapper.newInstance();
    mapper.setInputData(image);
    mapper.setSlicePlane(plane);
    const actor = vtkImageSlice.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationTypeToLinear();
    renderer.addActor(actor);
    renderer.getActiveCamera().setParallelProjection(true);
    const ro = new ResizeObserver(() => { grw.resize(); grw.getRenderWindow().render(); });
    ro.observe(el);
    scene.current = { grw, mapper, actor, plane };
    return () => { ro.disconnect(); scene.current = null; grw.delete(); };
  }, [image]);

  useEffect(() => {
    const s = scene.current; if (!s) return;
    const th = (tilt * Math.PI) / 180;
    // Plano axial inclinado hacia y (eje X de giro) o hacia x (eje Y).
    const n: [number, number, number] = axis === "x" ? [0, Math.sin(th), Math.cos(th)] : [Math.sin(th), 0, Math.cos(th)];
    const c = voxelToMm(mprVoxel, meta);
    s.plane.setNormal(...n);
    s.plane.setOrigin(c[0] + n[0] * pos, c[1] + n[1] * pos, c[2] + n[2] * pos);
    const cam = s.grw.getRenderer().getActiveCamera();
    cam.setFocalPoint(c[0], c[1], c[2]);
    cam.setPosition(c[0] - n[0] * 1000, c[1] - n[1] * 1000, c[2] - n[2] * 1000);
    cam.setViewUp(axis === "x" ? 0 : -Math.cos(th), axis === "x" ? -Math.cos(th) : 0, axis === "x" ? Math.sin(th) : Math.sin(th));
    s.grw.getRenderer().resetCamera();
    s.actor.getProperty().setColorWindow(Math.max(1, ww)); s.actor.getProperty().setColorLevel(wc);
    s.grw.getRenderWindow().render();
  }, [tilt, pos, axis, mprVoxel, meta, wc, ww]);

  const drag = useRef<{ x: number; y: number; wc: number; ww: number } | null>(null);
  const k = (meta.intensity_range[1] - meta.intensity_range[0]) / 400;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#000" }}>
      <div ref={ref} style={{ flex: 1, position: "relative", minHeight: 0 }}
        onMouseDown={(e) => { if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY, wc, ww }; }}
        onMouseMove={(e) => { const d = drag.current; if (!d) return; onWindowLevel(d.wc - (e.clientY - d.y) * k, Math.max(1, d.ww + (e.clientX - d.x) * k)); }}
        onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
        onWheel={(e) => { e.preventDefault(); setPos((p) => p + (e.deltaY > 0 ? 1 : -1) * meta.spacing[0]); }}>
        <HudFrame label="OBLICUO">
          <HudReadout at="bl" lines={[`INCL ${tilt}°  EJE ${axis.toUpperCase()}`, `DESPL ${pos.toFixed(1)} mm`]} />
          <HudReadout at="br" lines={[`W ${Math.round(ww)}  L ${Math.round(wc)}`]} />
        </HudFrame>
      </div>
      <div style={{ flexShrink: 0, padding: "8px 16px", display: "flex", gap: 16, alignItems: "center", borderTop: "var(--hud-line) solid var(--hud-dim)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--hud-dim)" }}>
        <span>INCLINACIÓN</span>
        <input type="range" min={-80} max={80} value={tilt} onChange={(e) => setTilt(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--hud)" }} />
        <HudToggleGroup options={[{ key: "x", label: "EJE X" }, { key: "y", label: "EJE Y" }]} value={axis} onChange={(v) => setAxis(v as "x" | "y")} />
        <HudToggleGroup options={[{ key: "reset", label: "CENTRAR" }]} value="" onChange={() => setPos(0)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrar**

En `Viewer.tsx`, la rama `viewMode === "oblique"` usa `ObliqueView` cuando `!legacy` y `ObliqueMprView` en caso contrario. Compila con `npx tsc -b` y comprueba en Case 3 que el oblicuo pasa por el crosshair (mueve el crosshair en el axial y el oblicuo cambia), que la rueda desplaza el plano y que W/L se comparte con los otros paneles.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/vtk/ObliqueView.tsx frontend/src/vtk/Viewer.tsx
git commit -m "El oblicuo se resuelve en el navegador y pasa por el punto que se está mirando"
```

---

### Task 12: Maniquí de orientación, cinta de rumbo en el 3D y «Fijar orientación»

**Files:**
- Create: `backend/scripts/make_manikin.py`, `frontend/public/models/maniqui.vtp` (generado)
- Create: `frontend/src/vtk/OrientationInset.ts`
- Modify: `backend/routers/mpr.py` (`PUT /api/volume/{sid}/orientation`), `backend/services/mpr.py`
- Modify: `frontend/src/api/client.ts`, `frontend/src/vtk/MeshView.tsx`, `frontend/src/vtk/MipView.tsx`, `frontend/src/vtk/Viewer.tsx`
- Test: `backend/test_volume_chunks.py`

**Interfaces:**
- Produces (backend): `PUT /api/volume/{sid}/orientation` con cuerpo `{"anterior_edge": "top|right|bottom|left", "first_slice_superior": bool}` → guarda `dicom.orientation_manual` (JSON) en el estado de sesión y devuelve la meta. `GET /meta` añade `orientation_manual: {...} | null`.
- Produces (frontend): `createOrientationInset(renderWindow, mainRenderer, orientation): { setOrientation(o): void; dispose(): void }` — un segundo renderer en capa 1 con el cubo anotado y el maniquí, que copia la orientación de la cámara principal en cada render.
- `MeshView` acepta `orientation: Orientation` y `onCameraChange?: (dir: Vec3, up: Vec3) => void`.
- `api.setOrientation(sid, manual)`.

- [ ] **Step 1: Test del endpoint**

Añade a `backend/test_volume_chunks.py`:

```python
class TestManualOrientation:
    def test_put_orientation_persists_and_meta_returns_it(self):
        sid = _session_with_volume()
        r = client.put(f"/api/volume/{sid}/orientation",
                       json={"anterior_edge": "right", "first_slice_superior": True})
        assert r.status_code == 200
        assert r.json()["orientation_manual"] == {"anterior_edge": "right", "first_slice_superior": True}
        assert client.get(f"/api/volume/{sid}/meta").json()["orientation_manual"]["anterior_edge"] == "right"

    def test_put_orientation_rejects_bad_edge(self):
        sid = _session_with_volume()
        r = client.put(f"/api/volume/{sid}/orientation",
                       json={"anterior_edge": "diagonal", "first_slice_superior": False})
        assert r.status_code == 422
```

Run: `cd backend && .venv\Scripts\python -m pytest test_volume_chunks.py -k Manual -v` → FAIL (404/405).

- [ ] **Step 2: Backend**

En `services/mpr.py`, en `_complete_meta` y en la construcción de la meta nueva, añade la lectura del estado:

```python
def _manual_orientation(session_id: str) -> dict | None:
    raw = read_state(session_id, "dicom.orientation_manual", "")
    try:
        return json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return None
```

y en `ensure_volume_cached`, justo antes de cada `return meta`: `meta["orientation_manual"] = _manual_orientation(session_id)` (no se escribe en `_volume_meta.json`; vive en el estado de sesión, que es lo que se guarda y restaura).

En `routers/mpr.py`:

```python
from pydantic import BaseModel, Field
from typing import Literal
from services.sessions import write_state

class ManualOrientation(BaseModel):
    anterior_edge: Literal["top", "right", "bottom", "left"] = Field(..., description="Borde del axial que es anterior")
    first_slice_superior: bool = Field(..., description="Si el primer corte es el más superior")


@router.put(
    "/volume/{session_id}/orientation",
    summary="Fijar a mano la orientación de un volumen sin etiquetas",
    description=(
        "Para 3DRA/XA sin ImageOrientationPatient. Guarda cómo está orientado el "
        "axial tal como se ve (qué borde es anterior, si el primer corte es "
        "superior). No modifica los datos; solo las etiquetas y el maniquí."
    ),
)
async def put_orientation(session_id: str, body: ManualOrientation) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    write_state(session_id, "dicom.orientation_manual", body.model_dump_json())
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, partial(ensure_volume_cached, session_id))
```

Run: `pytest test_volume_chunks.py -v` → PASS. Commit: `git commit -am "Un volumen sin etiquetas admite que el usuario diga dónde está anterior y superior"`.

- [ ] **Step 3: El maniquí**

`backend/scripts/make_manikin.py` (se ejecuta una vez; el `.vtp` resultante se versiona):

```python
"""Genera frontend/public/models/maniqui.vtp: figura humana de baja resolución
en LPS (x = izquierda del paciente, y = posterior, z = superior), ~1 unidad de
alto, con la cara marcada por una muesca para que se distinga anterior."""
from pathlib import Path
import vtk

def part(src, tx=0.0, ty=0.0, tz=0.0, rx=0.0):
    t = vtk.vtkTransform(); t.Translate(tx, ty, tz); t.RotateX(rx)
    f = vtk.vtkTransformPolyDataFilter(); f.SetInputConnection(src.GetOutputPort()); f.SetTransform(t); f.Update()
    return f.GetOutput()

app = vtk.vtkAppendPolyData()
head = vtk.vtkSphereSource(); head.SetRadius(0.11); head.SetThetaResolution(16); head.SetPhiResolution(12)
app.AddInputData(part(head, tz=0.82))
nose = vtk.vtkConeSource(); nose.SetRadius(0.03); nose.SetHeight(0.08); nose.SetResolution(8); nose.SetDirection(0, -1, 0)
app.AddInputData(part(nose, ty=-0.12, tz=0.82))                 # anterior = −y
torso = vtk.vtkCylinderSource(); torso.SetRadius(0.16); torso.SetHeight(0.42); torso.SetResolution(14)
app.AddInputData(part(torso, tz=0.48, rx=90))                   # eje del cilindro a z
for sx in (-1, 1):
    arm = vtk.vtkCylinderSource(); arm.SetRadius(0.05); arm.SetHeight(0.38); arm.SetResolution(8)
    app.AddInputData(part(arm, tx=sx * 0.24, tz=0.5, rx=90))
    leg = vtk.vtkCylinderSource(); leg.SetRadius(0.07); leg.SetHeight(0.42); leg.SetResolution(8)
    app.AddInputData(part(leg, tx=sx * 0.08, tz=0.06, rx=90))
app.Update()
normals = vtk.vtkPolyDataNormals(); normals.SetInputConnection(app.GetOutputPort()); normals.Update()
out = Path(__file__).resolve().parents[2] / "frontend" / "public" / "models" / "maniqui.vtp"
out.parent.mkdir(parents=True, exist_ok=True)
w = vtk.vtkXMLPolyDataWriter(); w.SetFileName(str(out)); w.SetInputData(normals.GetOutput()); w.SetDataModeToBinary(); w.Write()
print("wrote", out, normals.GetOutput().GetNumberOfPolys(), "triangles")
```

Run: `cd backend && .venv\Scripts\python scripts\make_manikin.py` → imprime el número de triángulos (< 2000).

- [ ] **Step 4: `OrientationInset.ts`**

```ts
/* Recuadro de orientación: cubo anotado + maniquí en una esquina del 3D/MIP.

   No usa vtkOrientationMarkerWidget porque admite un solo actor y aquí hay
   dos. Se hace lo mismo que hace él: un renderer propio en la capa 1 con su
   viewport, cuya cámara copia la orientación de la principal en cada render.
   Los actores viven en LPS; la matriz de dirección del volumen (real o
   manual) los lleva al espacio del volumen, que es el de la cámara. */

import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkAnnotatedCubeActor from "@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor";
import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import { effectiveDirection, type Orientation } from "./geometry";

const HUD = "#8CFF9E";

export function createOrientationInset(rw: vtkRenderWindow, main: vtkRenderer, orientation: Orientation) {
  rw.setNumberOfLayers(2);
  const inset = vtkRenderer.newInstance({ background: [0, 0, 0] });
  inset.setLayer(1);
  inset.setInteractive(false);
  inset.setViewport(0.8, 0.0, 1.0, 0.24);
  rw.addRenderer(inset);

  const cube = vtkAnnotatedCubeActor.newInstance();
  cube.setDefaultStyle({ fontStyle: "bold", fontFamily: "JetBrains Mono, monospace", fontColor: HUD, faceColor: "#000", edgeThickness: 0.08, edgeColor: HUD, resolution: 400 } as never);
  cube.setXPlusFaceProperty({ text: "IZQ" }); cube.setXMinusFaceProperty({ text: "DER" });
  cube.setYPlusFaceProperty({ text: "POST" }); cube.setYMinusFaceProperty({ text: "ANT" });
  cube.setZPlusFaceProperty({ text: "SUP" }); cube.setZMinusFaceProperty({ text: "INF" });
  cube.setScale(0.55, 0.55, 0.55);
  inset.addActor(cube);

  const figure = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();
  figure.setMapper(mapper);
  figure.getProperty().setColor(0.55, 1, 0.62);
  figure.setPosition(0, 0, -0.5);
  figure.setScale(0.9, 0.9, 0.9);
  const reader = vtkXMLPolyDataReader.newInstance();
  void reader.setUrl("/models/maniqui.vtp", { binary: true }).then(() => {
    mapper.setInputData(reader.getOutputData());
    inset.addActor(figure);
    rw.render();
  });

  // LPS → volumen: user matrix con la dirección (o su transpuesta si es
  // asumida se pinta igual pero en gris).
  const apply = (o: Orientation) => {
    const eff = effectiveDirection(o);
    const d = eff?.d ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    // La dirección lleva índices → LPS; el maniquí está en LPS y hay que
    // llevarlo a índices: la inversa de una matriz ortonormal es su transpuesta.
    const m = [d[0], d[3], d[6], 0, d[1], d[4], d[7], 0, d[2], d[5], d[8], 0, 0, 0, 0, 1];
    for (const a of [cube, figure]) a.setUserMatrix(m as never);
    const grey = !eff || !eff.known;
    figure.getProperty().setColor(grey ? 0.5 : 0.55, grey ? 0.5 : 1, grey ? 0.5 : 0.62);
    cube.setVisibility(!!eff);
  };
  apply(orientation);

  const syncCamera = () => {
    const src = main.getActiveCamera(), dst = inset.getActiveCamera();
    dst.setPosition(...src.getPosition()); dst.setFocalPoint(0, 0, 0);
    const p = src.getPosition(), f = src.getFocalPoint();
    const d = [p[0] - f[0], p[1] - f[1], p[2] - f[2]]; const n = Math.hypot(...d) || 1;
    dst.setPosition((d[0] / n) * 4, (d[1] / n) * 4, (d[2] / n) * 4);
    dst.setViewUp(...src.getViewUp());
    inset.resetCameraClippingRange();
  };
  const camSub = main.getActiveCamera().onModified(syncCamera);
  syncCamera();

  return {
    setOrientation: (o: Orientation) => { apply(o); rw.render(); },
    dispose: () => { camSub.unsubscribe(); rw.removeRenderer(inset); inset.delete(); },
  };
}
```

Si `setUserMatrix` no existe en `vtkAnnotatedCubeActor` en tu versión, usa `cube.setOrientation(...)` con los ángulos de Euler derivados de la matriz; comprueba antes con `grep -n setUserMatrix node_modules/@kitware/vtk.js/Rendering/Core/Prop3D.d.ts` (está en `Prop3D`, del que heredan ambos).

- [ ] **Step 5: `MeshView` y `MipView`**

`MeshView` recibe dos props nuevas, `orientation: Orientation` y `onCameraChange?: (dir: Vec3, up: Vec3) => void`. Tras crear el renderer en el efecto de escena:

```ts
const inset = createOrientationInset(renderWindow, renderer, orientationRef.current);
const camSub = renderer.getActiveCamera().onModified((cam) => {
  onCameraChangeRef.current?.(cam.getDirectionOfProjection() as Vec3, cam.getViewUp() as Vec3);
});
```

y en la limpieza `camSub.unsubscribe(); inset.dispose();`. Un efecto aparte llama a `inset.setOrientation(orientation)` cuando cambia (guarda `inset` en un ref). `MipView` hace lo mismo con su renderer.

En `Viewer.tsx`, `renderScene` guarda `heading` en estado desde `onCameraChange` (`cameraHeading(dir, up, orientation)`) y dibuja `<HudHeadingTape …/>` sobre el 3D. Cuando `!meta.orientation_known` aparece en la esquina superior izquierda, bajo la lectura de escena, un `HudToggleGroup` con la opción `FIJAR ORIENTACIÓN` que abre un `Sheet` (el componente existente en `components/Sheet.tsx`) con dos preguntas:

```tsx
<Select label="En el axial, el borde anterior está…" options={[{value:"top",label:"Arriba"},{value:"right",label:"A la derecha"},{value:"bottom",label:"Abajo"},{value:"left",label:"A la izquierda"}]} … />
<Select label="El primer corte es…" options={[{value:"inf",label:"El más inferior"},{value:"sup",label:"El más superior"}]} … />
<Button onClick={async () => { const m = { anteriorEdge, firstSliceSuperior }; setOrientationManual(m); await api.setOrientation(sessionId, { anterior_edge: anteriorEdge, first_slice_superior: firstSliceSuperior }); }}>Aplicar</Button>
```

`api.setOrientation` es `request(`/api/volume/${sid}/orientation`, { method: "PUT", body: JSON.stringify(m) })`. Al cargar la meta, si trae `orientation_manual`, `ViewerWorkspace` hace `setOrientationManual({ anteriorEdge: m.anterior_edge, firstSliceSuperior: m.first_slice_superior })` una vez.

- [ ] **Step 6: Comprobar y commit**

`npx tsc -b`; en Case 3: el maniquí gris aparece abajo a la derecha del 3D y del MIP y gira con la cámara; las etiquetas van entre corchetes; «FIJAR ORIENTACIÓN» → «Arriba» + «El más inferior» → maniquí verde, etiquetas sin corchetes, y tras recargar y reanudar la sesión se conserva.

```bash
git add backend/scripts/make_manikin.py frontend/public/models/maniqui.vtp frontend/src/vtk/OrientationInset.ts frontend/src/vtk/MeshView.tsx frontend/src/vtk/MipView.tsx frontend/src/vtk/Viewer.tsx frontend/src/api/client.ts
git commit -m "Un maniquí que gira con la cámara, gris cuando la orientación es asumida"
```

---

### Task 13: Sincronizar todas las vistas al punto y «Centrar en la lesión»

**Files:**
- Modify: `frontend/src/vtk/MeshView.tsx` (`registerCamera` gana `focus` y `frame`)
- Modify: `frontend/src/vtk/Viewer.tsx`, `frontend/src/components/planning/DetectPanel.tsx`, `frontend/src/components/morphometry/MorphometryPanel.tsx`, `frontend/src/components/planning/DevicesPanel.tsx`
- Test: `frontend/src/vtk/geometry.test.ts` (ya cubre mm↔vóxel); `frontend/src/store/planning.test.tsx` (Task 8)

**Interfaces:**
- `MeshView.registerCamera` publica ahora `{ setView(v: CameraView): void; focus(p: Vec3): void; frame(p: Vec3, radiusMm: number): void }` en vez de una función. `focus` mueve el punto focal conservando distancia y orientación; `frame` además encuadra a `radiusMm`.
- `Viewer` expone en la barra HUD `CENTRAR EN LA LESIÓN` cuando hay `morphometry.neck_origin` o candidato seleccionado.

- [ ] **Step 1: `MeshView`**

Sustituye el `setView` registrado por:

```ts
const controller = {
  setView,
  focus: (p: [number, number, number]) => {
    const h = handles.current; if (!h) return;
    const cam = h.renderer.getActiveCamera();
    const f = cam.getFocalPoint(), pos = cam.getPosition();
    cam.setFocalPoint(p[0], p[1], p[2]);
    cam.setPosition(pos[0] + (p[0] - f[0]), pos[1] + (p[1] - f[1]), pos[2] + (p[2] - f[2]));
    h.renderer.resetCameraClippingRange();
    h.renderWindow.render();
  },
  frame: (p: [number, number, number], r: number) => {
    const h = handles.current; if (!h) return;
    h.renderer.resetCamera([p[0] - r, p[0] + r, p[1] - r, p[1] + r, p[2] - r, p[2] + r]);
    h.renderWindow.render();
  },
};
registerCameraRef.current?.(controller);
```

Actualiza el tipo de `registerCamera` a `(c: CameraController | null) => void` con `export interface CameraController { setView(v: CameraView): void; focus(p: Vec3): void; frame(p: Vec3, radiusMm: number): void }`, y en `Viewer.tsx` los botones `Ax/Cor/Sag/Ajustar` llaman a `camera.setView(...)`.

- [ ] **Step 2: Fuentes del foco en `Viewer.tsx`**

```tsx
// Con la sincronización activa, un pick 3D o un clic en un corte mueven el foco.
const focusFromMm = useCallback((mm: Vec3) => { if (meta && syncViews) setFocusMm(mm, meta); }, [meta, syncViews, setFocusMm]);
// onPick: al principio de la función, antes del switch por pickMode:
//   focusFromMm(xyz);
// Clics en los cortes: planeCfg.onPlaneClick ya escribe mprVoxel; además, si
// syncViews, setFocusPoint(voxelToMm(nuevoVoxel, meta)) — hazlo dentro de
// planeCfg con `setFocusMm(voxelToMm({...vox, ...v}, meta), meta)` cuando syncViews.

// Cámaras 3D/MIP siguen al foco:
useEffect(() => { if (focusPoint && syncViews) camera?.focus(focusPoint); }, [focusPoint, syncViews, camera]);

// Candidato seleccionado → foco.
useEffect(() => {
  const c = candidates[selectedCandidate];
  if (c && syncViews && meta && step === "detect") setFocusMm([c.center_mm.x, c.center_mm.y, c.center_mm.z], meta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedCandidate, candidates, step]);

// Entrar en morfometría/dispositivos con cuello medido → foco.
useEffect(() => {
  const n = morphometry?.neck_origin;
  if (n && syncViews && meta && (step === "morpho" || step === "devices")) setFocusMm([n.x, n.y, n.z], meta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [step, morphometry?.neck_origin]);

const lesion: Vec3 | null = morphometry?.neck_origin
  ? [morphometry.neck_origin.x, morphometry.neck_origin.y, morphometry.neck_origin.z]
  : candidate ? [candidate.center_mm.x, candidate.center_mm.y, candidate.center_mm.z] : null;
const centerOnLesion = () => { if (!lesion || !meta) return; setFocusMm(lesion, meta); camera?.frame(lesion, 30); };
```

En el `MipView`, el foco no cambia la cámara (el MIP mira siempre según el plano principal), pero sí el corte, que ya viene de `mprVoxel`.

`CENTRAR EN LA LESIÓN` se añade al `HudToggleGroup` de cámara (`options=[…, { key: "lesion", label: "LESIÓN" }]`, visible solo cuando `lesion !== null`); los paneles de Morfometría y Dispositivos añaden un `Button variant="ghost"` «Centrar en la lesión» que llama a la misma función a través del store: añade a `PlanningState` un `centerOnLesion: (() => void) | null` que `Viewer` registra con `setCenterOnLesion` en un efecto (patrón idéntico a `setCaptureViewport`).

- [ ] **Step 3: Comprobar y commit**

`npx tsc -b && npx vitest run`. En Case 3: con SINCRO ● activo, marcar un candidato en Detección lleva las tres celdas y el 3D al punto (sin cambiar el zoom del 3D); clic en el axial mueve el foco del 3D; SINCRO ○ desacopla el 3D pero los tres cortes siguen enlazados; «LESIÓN» encuadra a 30 mm; en Morfometría el botón del panel hace lo mismo.

```bash
git add frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx frontend/src/store/planning.tsx frontend/src/components/planning/DetectPanel.tsx frontend/src/components/morphometry/MorphometryPanel.tsx frontend/src/components/planning/DevicesPanel.tsx
git commit -m "Todas las vistas se centran en el mismo punto, y hay un botón para ir a la lesión"
```

---

### Task 14: Preajustes de ventana por modalidad, pistas efímeras y tecla `?`

**Files:**
- Create: `frontend/src/vtk/windowPresets.ts` (+ `.test.ts`)
- Modify: `frontend/src/vtk/Viewer.tsx`, `frontend/src/pages/Workspace.tsx`

**Interfaces:**
- `windowPresets(meta: VolumeMeta, band: [number, number] | null): { name: string; wc: number; ww: number }[]` — con `modality === "CT"` devuelve los nueve presets HU actuales; en otro caso `Auto` (wc/ww de la meta), `Vasos` (centro y anchura de la banda, si hay) y `Todo` (p0.5–p99.9).

- [ ] **Step 1: Test que falla**

```ts
// frontend/src/vtk/windowPresets.test.ts
import { describe, expect, it } from "vitest";
import { windowPresets } from "./windowPresets";
import type { VolumeMeta } from "../api/types";

const base = { shape: [1, 1, 1], spacing: [1, 1, 1], wc: 100, ww: 400, direction: null, orientation_known: false,
  origin_mm: [0, 0, 0], intensity_range: [-500, 5000], cache_key: "k", full_stride: 1 } as Omit<VolumeMeta, "modality">;

describe("windowPresets", () => {
  it("keeps the HU presets for CT", () => {
    const p = windowPresets({ ...base, modality: "CT" } as VolumeMeta, null);
    expect(p.map((x) => x.name)).toContain("Cerebro");
    expect(p.find((x) => x.name === "CTA")).toEqual({ name: "CTA", wc: 170, ww: 600 });
  });
  it("derives data-driven presets for XA", () => {
    const p = windowPresets({ ...base, modality: "XA" } as VolumeMeta, [1470, 4717]);
    expect(p.map((x) => x.name)).toEqual(["Auto", "Vasos", "Todo"]);
    expect(p[1]).toEqual({ name: "Vasos", wc: 3093.5, ww: 3247 });
    expect(p[2]).toEqual({ name: "Todo", wc: 2250, ww: 5500 });
  });
  it("omits Vasos without a band", () => {
    expect(windowPresets({ ...base, modality: "XA" } as VolumeMeta, null).map((x) => x.name)).toEqual(["Auto", "Todo"]);
  });
});
```

- [ ] **Step 2: Implementación**

```ts
import type { VolumeMeta } from "../api/types";

/* Presets HU (port de utils/window_presets.py). Solo tienen sentido en TC. */
export const HU_PRESETS = [
  { name: "Cerebro", wc: 40, ww: 80 }, { name: "Hemorragia", wc: 55, ww: 100 }, { name: "Subdural", wc: 75, ww: 215 },
  { name: "CTA", wc: 170, ww: 600 }, { name: "Hueso", wc: 400, ww: 1000 }, { name: "Pulmón", wc: -600, ww: 1500 },
  { name: "Mediastino", wc: 50, ww: 350 }, { name: "Abdomen", wc: 40, ww: 350 }, { name: "Hígado", wc: 70, ww: 170 },
];

export function windowPresets(meta: VolumeMeta, band: [number, number] | null) {
  if ((meta.modality || "").toUpperCase() === "CT") return HU_PRESETS;
  const [lo, hi] = meta.intensity_range;
  const out = [{ name: "Auto", wc: meta.wc, ww: meta.ww }];
  if (band && Number.isFinite(band[1]) && band[1] > band[0] && band[1] < 1e12) {
    out.push({ name: "Vasos", wc: (band[0] + band[1]) / 2, ww: band[1] - band[0] });
  }
  out.push({ name: "Todo", wc: (lo + hi) / 2, ww: hi - lo });
  return out;
}
```

Mueve `WL_PRESETS` de `Viewer.tsx` a este módulo (`HU_PRESETS`) y haz que el `<select>` del panel activo use `windowPresets(meta, previewBand ?? (segmentation ? [segmentation.threshold_lower ?? NaN, NaN] : null))`. Con la banda «sin techo» (`Number.MAX_SAFE_INTEGER`) el guard `< 1e12` omite «Vasos».

Pistas efímeras: en `Viewer.tsx`, estado `hint: string | null`; al montar la escena 3D o el MIP se pone `"ARRASTRAR ROTA · RUEDA ZOOM · DOBLE CLIC EN UNA CELDA LA MAXIMIZA"` y un `setTimeout` de 3000 ms lo borra; se pinta como `<div className="hud-hint">` (Task 6). En `Workspace.tsx`, en el `onKey` existente, `if (e.key === "?") { window.dispatchEvent(new CustomEvent("viewer:hint")); }` y `Viewer` escucha `viewer:hint` para volver a mostrarlo.

- [ ] **Step 3: Ejecutar y commit**

`npx vitest run src/vtk/windowPresets.test.ts && npx tsc -b`.

```bash
git add frontend/src/vtk/windowPresets.ts frontend/src/vtk/windowPresets.test.ts frontend/src/vtk/Viewer.tsx frontend/src/pages/Workspace.tsx
git commit -m "Preajustes de ventana que dependen de la modalidad, y pistas que se van solas"
```

---

### Task 15: Cierre: `.gitignore`, README, comprobación completa y lista manual

**Files:**
- Modify: `.gitignore`, `README.md`

- [ ] **Step 1: El estudio de prueba fuera del repositorio**

Añade a `.gitignore`:

```
# Estudios DICOM de prueba (109 MB): quedan en local
frontend/Estudios/
```

En `README.md`, sección «Running Tests» o una nueva «Test study», añade:

```markdown
### Estudio de prueba

`frontend/Estudios/Case 3/Unknown Study/XA/XA000000.dcm` (no versionado): 3DRA
XA 384³ a 0,32 mm, sin etiquetas de orientación. Al cargarlo, el visor marca
la orientación como asumida hasta que se fija con «Fijar orientación».
```

Y en «Tech Stack», la fila de visores pasa a decir `@kitware/vtk.js 36 (meshes, MPR, oblique reslice and MIP rendered client-side from a chunked int16 copy of the volume)`.

- [ ] **Step 2: Comprobación completa**

Run:

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q
```

Expected: todo en verde; el `build` sin avisos nuevos de tamaño de chunk más allá del ya conocido de vtk.js.

- [ ] **Step 3: Lista manual con Case 3 (anótala en el mensaje del último commit)**

1. Carga DICOM: la imagen aparece en < 3 s; el rótulo «RESOLUCIÓN REDUCIDA · n/12» desaparece al completarse; recargar la página y reanudar no vuelve a descargar (pestaña Red: bloques desde `(disk cache)` o sin peticiones `chunk`).
2. Scroll: el script de la revisión (15 ruedas en 600 ms) produce ≥ 12 cambios del índice en el HUD.
3. Distribución: doble clic en cada celda la maximiza y vuelve; se conserva al recargar.
4. MIP: acumulado crece y decrece con el corte; lámina ±10 mm; «DESDE EL FINAL» invierte.
5. Orientación: maniquí gris y etiquetas entre corchetes; tras fijar, verde y sin corchetes; cinta de rumbo coherente con `Ax/Cor/Sag` (AZ 0 mirando desde anterior).
6. Sincro: candidato → todas las vistas; «LESIÓN» encuadra; SINCRO ○ desacopla el 3D.
7. Sin WebGL2 (Chrome con `--disable-webgl2`): vuelve el visor PNG con «SIN WEBGL2 · VISOR REDUCIDO» en el HUD.
8. Nada parpadea ni se superpone a la imagen salvo la retícula, las líneas ámbar y los textos de esquina.

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "El estudio de prueba queda fuera del repositorio y el README dice cómo se usa"
```
