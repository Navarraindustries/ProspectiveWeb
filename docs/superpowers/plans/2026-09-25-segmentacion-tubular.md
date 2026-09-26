# Segmentación tubular y render pulido — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la segmentación produzca una vasculatura maciza, sin hueso pegado y sin huecos —tubos que se puedan medir y clipar— con progreso real durante el cálculo, y que el visor la pinte con luz y translucidez limpias.

**Architecture:** Una máscara vascular nueva en el backend: núcleo relleno (el techo ya no vacía los vasos), tubularidad de Frangi calculada por lonchas para acotar memoria, semillas en los troncos gruesos, crecimiento por histéresis, recuperación de pared y sacos a 3 mm con veto de láminas (hueso) y superficie sub-vóxel estanca. La detección decima en memoria por encima de 40 000 vértices para recuperar sus canales de calibre. Un módulo de progreso en memoria alimenta un WebSocket y un GET de respaldo. El frontend añade el método, los parámetros y el progreso al panel de segmentación y pule materiales, luces y translucidez en el visor 3D.

**Tech Stack:** FastAPI, NumPy, SciPy, SimpleITK 2.5 (`ObjectnessMeasureImageFilter`), VTK 9.7 (backend); React 19 + TypeScript + vtk.js 36.2.1 (frontend); pytest, vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-visor-segmentacion-clip-design.md` (sección 4 y punto 6 «plano de cuello» y «rango de intensidad»).

## Global Constraints

- Servidor de 1 vCPU / 2 GB: la tubularidad se calcula por **lonchas de 64 cortes con 12 de solape**, nunca sobre el volumen entero; ninguna fase mantiene más de ~4 copias de una loncha. Guarda: si el volumen supera **90 M vóxeles** se segmenta a media resolución y se dice por qué.
- Escalas de Frangi **σ = {0,4; 0,7; 1,2; 2,0} mm**, α = 0,5, β = 0,5, γ = 0,1 × (p99,9 − p50 de la intensidad), objeto brillante, `ScaleObjectnessMeasure` activo, tubularidad = máximo entre escalas. Lámina (veto de hueso) con el mismo filtro y `ObjectDimension = 2`. Medido en Case 3 (384³, 16 núcleos): 2,4–2,9 s por escala sobre el volumen entero.
- Máscara: relleno 3D del núcleo ANTES del techo; puerta tubular en el **percentil 60** de la tubularidad dentro de la máscara de umbral, que **solo mide** (`stats.core_vox` y `thresholds.gate`, la cifra de núcleo que se publica) y no filtra nada: lo que recorta la máscara son las semillas y el crecimiento, que umbralizan la tubularidad por su cuenta; `gate_pctl` se conserva como parámetro de esa cifra, y por eso moverlo no cambia la máscara (Task 11); semillas en el **percentil 90** con **≥ 50 mm³**; crecimiento en el **percentil 40**; recuperación geodésica a **3 mm** con veto de lámina; cierre de 1 vóxel y relleno final.
- Superficie: la máscara se rodea de un vóxel vacío (tapa las salidas por el borde del volumen, origen corrido un espaciado), gaussiana σ = 0,7 vóxel sobre la máscara en float, marching cubes en 0,5, `vtkWindowedSincPolyDataFilter` 40 iteraciones / pass band 0,05 / `BoundarySmoothingOff` / `NormalizeCoordinatesOn`, `vtkFillHolesFilter` hasta 4 mm, `vtkDecimatePro` 45 % con `PreserveTopologyOn` / `SplittingOff` / `BoundaryVertexDeletionOff` (solo en `mask_to_surface`; el pipeline clásico y `decimate_to` siguen con `vtkQuadricDecimation`), normales sin splitting (60°), islas < 2 mm³ fuera. Criterio: **0 aristas de borde** y relación de aspecto mediana **< 1,45**. Validado en Task 11 (`backend/scripts/validate_case3.py`): la decimación cuadrática al 60 % abría la malla (Case 3: 25 aristas de borde, 20 no-variedad, aspecto 1,58, cuando antes de decimar había 0 y 1,20); ninguno de los mandos permitidos (`fill_holes_mm` 6, `min_island_mm3` 5, `reclaim_mm` 2,5 / 3,5, `gate_pctl` 55 / 65) lo arreglaba, y por decisión del controlador se cambió a `vtkDecimatePro` 45 %. Valores finales: `decimation` 0,45, `fill_holes_mm` 4, `min_island_mm3` 2, `reclaim_mm` 3, `gate_pctl` 60, `PLATE_RATIO` 300, `WALL_MM` 0,75. Case 3: 0 aristas de borde (2 no-variedad, aceptadas; `surface_quality` las cuenta en `non_manifold_edges`), aspecto 1,43, 107 176 vértices, 0 piezas de hueso, máscara + superficie 9,0 s (34,1 s con Frangi).
- Un solo fichero de malla (`vessel_tree.vtp`, completa); la detección decima EN MEMORIA: calibre y cociente sobre ≤ 40 000 vértices y la curvatura sobre ≤ 80 000 (Task 11 bis); morfometría, saco y dispositivos usan la completa.
- Resolución completa por defecto; la casilla pasa a ser «Segmentar a media resolución (más rápido)».
- Progreso: `GET /api/progress/{sid}` siempre; `WS /ws/progress/{sid}?token=` cuando el proxy lo permite; fases con porcentaje.
- Render: ambient 0,15 · diffuse 0,85 · specular 0,25 · specular power 24; dos luces (key 100 %, fill 35 % opuesta) que siguen la cámara; `setUseDepthPeeling(true)` con 4 pasadas; contorno del saco con un casco invertido (la misma malla un 4 % mayor, caras delanteras descartadas).
- Copia de interfaz y mensajes de commit en español. `tsc -b`, `vitest run` y `pytest` (sin fallos NUEVOS respecto a la lista base del repositorio: 26 preexistentes) en verde en cada commit.
- La lesión confirmada de Case 3 (cand-002, x 62 · y 64 · z 63 mm) debe seguir en la lista corta de detección en el puesto ≤ 3. **Tras la Task 11 no se cumplía** (malla tubular nativa: puesto 13, 12 con «solo el árbol») y fue el objetivo de la Task 11 bis. Resultado de la Task 11 bis, con la curvatura sobre una copia de 80 000 vértices, el orden por mejor puesto y las regiones de curvatura que tocan una cara de la caja de la malla (las tapas del borde del volumen, tolerancia 1 mm) al final: **2.º con «solo el árbol», 2.º con la malla completa**, y 3.º en la malla de umbral de 12 800 vértices (el mismo que antes de la tarea); detección 9,6–9,9 s (antes 18,6–19,3 s).

## Review Focus

1. Un volumen donde la banda no captura ninguna semilla ≥ 50 mm³ (contraste pobre): la app debe decirlo y caer a la máscara de umbral, no devolver una malla vacía sin explicación. → test en Task 3 (`test_sin_semillas_cae_al_umbral_y_lo_dice`).
2. Un aneurisma sacular (bulto no tubular) pegado a un vaso: el crecimiento por tubularidad lo recorta y la recuperación de 3 mm lo devuelve entero. → test en Task 3 (`test_un_saco_pegado_al_tubo_se_conserva`).
3. Una lámina de hueso en contacto con el vaso: la recuperación no la vuelve a meter (veto de lámina). → test en Task 3 (`test_una_lamina_en_contacto_no_vuelve_con_la_recuperacion`).
4. Progreso cuando el WebSocket no llega (proxy, Amplify): el panel debe seguir mostrando fase y porcentaje por GET. → test en Task 8 (`vuelve al GET cuando el WebSocket falla`).
5. Una segmentación que tarda minutos en 1 vCPU no puede bloquear las demás peticiones: cada fase corre en el executor y publica progreso. → test en Task 6 (`test_el_progreso_avanza_por_fases_durante_la_segmentacion`).

## Estructura de archivos

Backend (crear): `services/progress.py`, `routers/progress.py`, `services/vesselness.py`, `services/vascular_mask.py`, `test_progress.py`, `test_vesselness.py`, `test_vascular_mask.py`, `test_surface.py`, `test_segment_tubular.py`.
Backend (modificar): `services/segmentation.py` (superficie y decimación), `routers/segment.py` (método tubular, fases, guardas, resultado), `models/segmentation.py`, `routers/detect.py` (decimación para detección, reintento del plano de cuello), `routers/preprocess.py` (meta recalculada), `main.py` (router de progreso).
Frontend (crear): `src/api/progress.ts` (+ test), `src/components/segmentation/SegmentProgress.tsx`, `src/components/segmentation/TubularControls.tsx` (+ test).
Frontend (modificar): `src/api/types.ts`, `src/api/client.ts`, `src/components/segmentation/SegmentPanel.tsx` (+ test), `src/vtk/MeshView.tsx`, `vite.config.ts` (proxy WS), `README.md`.

---

### Task 1: Progreso por sesión: servicio, GET y WebSocket

**Files:**
- Create: `backend/services/progress.py`, `backend/routers/progress.py`, `backend/test_progress.py`
- Modify: `backend/main.py` (registrar el router; el WS no pasa por la dependencia de auth de los routers privados y valida el token él mismo)

**Interfaces:**
- Produces: `progress.start(session_id: str) -> None`, `progress.update(session_id, phase: str, pct: float) -> None`, `progress.finish(session_id, ok: bool, message: str = "") -> None`, `progress.get(session_id) -> dict | None` con `{"phase": str, "pct": float, "running": bool, "ok": bool | None, "message": str, "updated_at": float}`.
- Produces: `GET /api/progress/{sid}` → ese dict (404 si la sesión no existe; `{"running": false, "phase": "", "pct": 0}` si nunca se lanzó nada). `WS /ws/progress/{sid}?token=<jwt>` → un JSON por cambio (poll interno cada 250 ms), cierra al terminar; 4401 si el token no vale.

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_progress.py
"""Progreso por sesión: memoria del proceso, GET y WebSocket."""
from __future__ import annotations

import time
from fastapi.testclient import TestClient

from main import app
from services import progress
from services.sessions import create_session
from services.auth_service import create_access_token

client = TestClient(app, raise_server_exceptions=True)


class TestServicio:
    def test_empieza_vacio_y_avanza_por_fases(self):
        sid = create_session()
        assert progress.get(sid) is None
        progress.start(sid)
        p = progress.get(sid)
        assert p["running"] is True and p["pct"] == 0.0 and p["phase"] == ""
        progress.update(sid, "tubularidad 2/4", 35.0)
        p = progress.get(sid)
        assert p["phase"] == "tubularidad 2/4" and p["pct"] == 35.0
        progress.finish(sid, ok=True)
        p = progress.get(sid)
        assert p["running"] is False and p["ok"] is True and p["pct"] == 100.0

    def test_finish_con_error_guarda_el_mensaje(self):
        sid = create_session()
        progress.start(sid)
        progress.finish(sid, ok=False, message="sin memoria")
        p = progress.get(sid)
        assert p["ok"] is False and p["message"] == "sin memoria"

    def test_el_porcentaje_se_acota_a_0_100(self):
        sid = create_session()
        progress.start(sid)
        progress.update(sid, "x", 140.0)
        assert progress.get(sid)["pct"] == 100.0
        progress.update(sid, "x", -3.0)
        assert progress.get(sid)["pct"] == 0.0


class TestGet:
    def test_sin_progreso_devuelve_parado(self):
        sid = create_session()
        r = client.get(f"/api/progress/{sid}")
        assert r.status_code == 200
        assert r.json()["running"] is False and r.json()["pct"] == 0

    def test_sesion_inexistente_404(self):
        assert client.get("/api/progress/no-existe").status_code == 404

    def test_refleja_el_servicio(self):
        sid = create_session()
        progress.start(sid); progress.update(sid, "superficie", 80.0)
        r = client.get(f"/api/progress/{sid}")
        assert r.json()["phase"] == "superficie" and r.json()["pct"] == 80.0


class TestWebSocket:
    def test_emite_cambios_y_cierra_al_terminar(self):
        sid = create_session()
        token = create_access_token(subject="admin")
        progress.start(sid)
        with client.websocket_connect(f"/ws/progress/{sid}?token={token}") as ws:
            first = ws.receive_json()
            assert first["running"] is True
            progress.update(sid, "máscara", 50.0)
            msg = ws.receive_json()
            assert msg["phase"] == "máscara" and msg["pct"] == 50.0
            progress.finish(sid, ok=True)
            last = ws.receive_json()
            assert last["running"] is False and last["ok"] is True

    def test_token_invalido_cierra_con_4401(self):
        sid = create_session()
        from starlette.websockets import WebSocketDisconnect
        try:
            with client.websocket_connect(f"/ws/progress/{sid}?token=malo") as ws:
                ws.receive_json()
            assert False, "debía cerrar"
        except WebSocketDisconnect as exc:
            assert exc.code == 4401
```

- [ ] **Step 2: Ver que falla**

Run: `cd backend && .venv\Scripts\python -m pytest test_progress.py -q`
Expected: FAIL (`ImportError: cannot import name 'progress'`).

- [ ] **Step 3: Servicio**

```python
# backend/services/progress.py
"""Progreso de trabajos largos, por sesión, en memoria del proceso.

Una segmentación tubular en 1 vCPU tarda minutos, y una barra indeterminada no
dice si el servidor sigue vivo. Esto guarda fase y porcentaje para que el GET
y el WebSocket los enseñen. Vive en memoria: con un solo proceso uvicorn es
exacto, y si el proceso se reinicia el progreso desaparece con el trabajo.
"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_state: dict[str, dict] = {}


def start(session_id: str) -> None:
    with _lock:
        _state[session_id] = {
            "phase": "", "pct": 0.0, "running": True, "ok": None,
            "message": "", "updated_at": time.time(),
        }


def update(session_id: str, phase: str, pct: float) -> None:
    with _lock:
        s = _state.get(session_id)
        if s is None or not s["running"]:
            return
        s["phase"] = phase
        s["pct"] = float(min(100.0, max(0.0, pct)))
        s["updated_at"] = time.time()


def finish(session_id: str, ok: bool, message: str = "") -> None:
    with _lock:
        s = _state.get(session_id)
        if s is None:
            return
        s.update(running=False, ok=bool(ok), message=message,
                 pct=100.0 if ok else s["pct"], updated_at=time.time())


def get(session_id: str) -> dict | None:
    with _lock:
        s = _state.get(session_id)
        return dict(s) if s is not None else None
```

- [ ] **Step 4: Router**

```python
# backend/routers/progress.py
"""Progreso de la sesión: GET siempre, WebSocket cuando el proxy lo deja pasar."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from services import progress
from services.auth_service import user_for_token
from services.database import SessionLocal
from services.sessions import session_exists

router = APIRouter(prefix="/api", tags=["progress"])
ws_router = APIRouter(tags=["progress"])

_IDLE = {"phase": "", "pct": 0.0, "running": False, "ok": None, "message": "", "updated_at": 0.0}


@router.get("/progress/{session_id}", summary="Fase y porcentaje del trabajo en curso")
async def get_progress(session_id: str) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return progress.get(session_id) or dict(_IDLE)


@ws_router.websocket("/ws/progress/{session_id}")
async def ws_progress(websocket: WebSocket, session_id: str, token: str = "") -> None:
    # El navegador no puede mandar Authorization en un WebSocket: el JWT va en
    # la query y se valida igual que en el guard de /data.
    db = SessionLocal()
    try:
        user = user_for_token(db, token)
    finally:
        db.close()
    if user is None or not session_exists(session_id):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    last: dict | None = None
    try:
        while True:
            cur = progress.get(session_id) or dict(_IDLE)
            if cur != last:
                await websocket.send_json(cur)
                last = cur
                if not cur["running"] and cur["ok"] is not None:
                    break
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return
    await websocket.close()
```

En `backend/main.py`, junto a los demás routers privados, incluye `progress.router` con la misma dependencia de auth que los otros, y `progress.ws_router` SIN esa dependencia (`app.include_router(progress.ws_router)`), con un comentario que diga por qué (el WS valida el token en la query). Comprueba en `main.py` cómo se llama la dependencia de guardia (búscala con `grep -n "include_router" main.py`).

- [ ] **Step 5: Ejecutar**

Run: `cd backend && .venv\Scripts\python -m pytest test_progress.py -v`
Expected: 8 PASS. Si `test_token_invalido_cierra_con_4401` recibe `WebSocketDisconnect` con otro código, comprueba que el `close(code=4401)` se llama ANTES de `accept()` (Starlette lo permite: responde 403 en el handshake; en ese caso el test debe aceptar `exc.code in (4401, 1000)` y decirlo en un comentario).

- [ ] **Step 6: Commit**

```bash
git add backend/services/progress.py backend/routers/progress.py backend/test_progress.py backend/main.py
git commit -m "El progreso de un trabajo largo se puede leer por GET y por WebSocket"
```

---

### Task 2: Tubularidad y laminaridad por lonchas

**Files:**
- Create: `backend/services/vesselness.py`, `backend/test_vesselness.py`

**Interfaces:**
- Produces: `objectness_max(volume: np.ndarray, spacing: tuple[float, float, float], *, dimension: int, scales_mm: tuple[float, ...] = SCALES_MM, gamma: float | None = None, slab: int = 64, overlap: int = 12, on_progress: Callable[[int, int], None] | None = None) -> np.ndarray` (float32, misma forma que `volume`; `dimension` 1 = tubo, 2 = lámina, 0 = blob).
- Produces: `SCALES_MM = (0.4, 0.7, 1.2, 2.0)`, `auto_gamma(volume) -> float` (= 0,1 × (p99,9 − p50), mínimo 1,0).
- Produces: `synthetic_tube(shape, spacing, radius_mm, value) -> np.ndarray` y `synthetic_plate(...)` en `test_vesselness.py` (los reutiliza Task 3).

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_vesselness.py
"""Frangi por lonchas: tubos altos, láminas bajas, y la loncha no cambia el resultado."""
from __future__ import annotations

import numpy as np
import pytest

from services.vesselness import SCALES_MM, auto_gamma, objectness_max

SP = (0.5, 0.5, 0.5)


def synthetic_tube(shape=(48, 48, 48), spacing=SP, radius_mm=1.5, value=1000.0, axis=0):
    """Un cilindro brillante a lo largo de `axis` sobre fondo 0."""
    z, y, x = np.mgrid[0:shape[0], 0:shape[1], 0:shape[2]].astype(np.float32)
    c = [s / 2 for s in shape]
    coords = [z, y, x]
    del coords[axis]
    cc = [c[i] for i in range(3) if i != axis]
    sp = [spacing[i] for i in range(3) if i != axis]
    d2 = ((coords[0] - cc[0]) * sp[0]) ** 2 + ((coords[1] - cc[1]) * sp[1]) ** 2
    return np.where(d2 <= radius_mm ** 2, value, 0.0).astype(np.float32)


def synthetic_plate(shape=(48, 48, 48), spacing=SP, thickness_mm=0.5, value=1000.0):
    """Una lámina brillante en el plano z = centro."""
    vol = np.zeros(shape, dtype=np.float32)
    half = max(1, int(round(thickness_mm / spacing[0] / 2)))
    zc = shape[0] // 2
    vol[zc - half:zc + half + 1] = value
    return vol


class TestFormas:
    def test_un_tubo_tiene_tubularidad_alta_en_su_eje_y_baja_fuera(self):
        vol = synthetic_tube()
        v = objectness_max(vol, SP, dimension=1)
        assert v.shape == vol.shape and v.dtype == np.float32
        centro = v[24, 24, 24]
        fuera = v[24, 4, 4]
        assert centro > 0 and fuera < centro * 0.05

    def test_una_lamina_puntua_como_lamina_y_no_como_tubo(self):
        vol = synthetic_plate()
        tubo = objectness_max(vol, SP, dimension=1)
        lamina = objectness_max(vol, SP, dimension=2)
        assert lamina[24, 24, 24] > 5 * tubo[24, 24, 24]

    def test_gamma_automatica_sale_de_la_intensidad(self):
        vol = synthetic_tube(value=2000.0)
        assert auto_gamma(vol) == pytest.approx(0.1 * (np.percentile(vol, 99.9) - np.percentile(vol, 50)), rel=1e-3)
        assert auto_gamma(np.zeros((4, 4, 4), np.float32)) == 1.0


class TestLonchas:
    def test_las_lonchas_no_dejan_costuras(self):
        vol = synthetic_tube(shape=(80, 40, 40), axis=0)
        entero = objectness_max(vol, SP, dimension=1, slab=1000, overlap=0)
        por_lonchas = objectness_max(vol, SP, dimension=1, slab=20, overlap=8)
        np.testing.assert_allclose(por_lonchas, entero, rtol=1e-3, atol=1e-3)

    def test_informa_del_progreso_por_loncha(self):
        vol = synthetic_tube(shape=(60, 32, 32))
        seen: list[tuple[int, int]] = []
        objectness_max(vol, SP, dimension=1, slab=20, overlap=4, on_progress=lambda i, n: seen.append((i, n)))
        assert seen[0] == (1, 3) and seen[-1] == (3, 3)

    def test_las_escalas_por_defecto_son_las_del_diseno(self):
        assert SCALES_MM == (0.4, 0.7, 1.2, 2.0)
```

- [ ] **Step 2: Ver que falla**

Run: `cd backend && .venv\Scripts\python -m pytest test_vesselness.py -q`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```python
# backend/services/vesselness.py
"""Tubularidad (y laminaridad) de Frangi, calculada por lonchas.

Por qué existe: el umbral no separa el hueso del contraste —comparten brillo—,
pero un vaso es un tubo y el peñasco es una lámina o un bloque. El Hessiano lo
distingue. SimpleITK trae el filtro (ObjectnessMeasureImageFilter), que espera
la imagen ya suavizada a cada escala y calcula el Hessiano por diferencias.

Por qué por lonchas: sobre 384³ en float32 cada copia son 226 MB y el filtro
hace varias; en el servidor de 2 GB eso no cabe. Con lonchas de 64 cortes y 12
de solape (σ máx 2 mm ≈ 6 vóxeles a 0,32 mm) la memoria queda acotada y el
resultado es el mismo que entero — hay un test que lo comprueba.
"""
from __future__ import annotations

from typing import Callable

import numpy as np

SCALES_MM: tuple[float, ...] = (0.4, 0.7, 1.2, 2.0)
ALPHA, BETA = 0.5, 0.5


def auto_gamma(volume: np.ndarray) -> float:
    """γ de Frangi a partir del rango de intensidad: 0,1 × (p99,9 − p50).

    Medido en Case 3 (rango ≈ 5 100): γ ≈ 510 separa vasos de ruido; el 5,0 de
    ITK está pensado para imágenes normalizadas y aquí lo saturaba todo.
    """
    flat = volume.reshape(-1)
    if flat.size > 4_000_000:
        flat = flat[:: int(flat.size // 4_000_000) + 1]
    span = float(np.percentile(flat, 99.9) - np.percentile(flat, 50.0))
    return max(1.0, 0.1 * span)


def _objectness_slab(slab: np.ndarray, spacing_xyz: tuple[float, float, float],
                     dimension: int, scales_mm: tuple[float, ...], gamma: float) -> np.ndarray:
    import SimpleITK as sitk

    img = sitk.GetImageFromArray(np.ascontiguousarray(slab, dtype=np.float32))
    img.SetSpacing(spacing_xyz)
    best: np.ndarray | None = None
    for sigma in scales_mm:
        smooth = sitk.SmoothingRecursiveGaussian(img, float(sigma))
        f = sitk.ObjectnessMeasureImageFilter()
        f.SetObjectDimension(int(dimension))
        f.SetBrightObject(True)
        f.SetAlpha(ALPHA)
        f.SetBeta(BETA)
        f.SetGamma(float(gamma))
        f.SetScaleObjectnessMeasure(True)
        v = sitk.GetArrayFromImage(f.Execute(smooth)).astype(np.float32, copy=False)
        best = v if best is None else np.maximum(best, v, out=best)
        del smooth, v
    assert best is not None
    return best


def objectness_max(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    *,
    dimension: int,
    scales_mm: tuple[float, ...] = SCALES_MM,
    gamma: float | None = None,
    slab: int = 64,
    overlap: int = 12,
    on_progress: Callable[[int, int], None] | None = None,
) -> np.ndarray:
    """Máximo entre escalas de la medida de objeto `dimension`, por lonchas en z.

    `spacing` es (sz, sy, sx) como en el resto del backend; SimpleITK quiere
    (sx, sy, sz).
    """
    if gamma is None:
        gamma = auto_gamma(volume)
    nz = int(volume.shape[0])
    out = np.zeros(volume.shape, dtype=np.float32)
    starts = list(range(0, nz, slab))
    n = len(starts)
    spacing_xyz = (float(spacing[2]), float(spacing[1]), float(spacing[0]))
    for i, z0 in enumerate(starts, start=1):
        z1 = min(nz, z0 + slab)
        a, b = max(0, z0 - overlap), min(nz, z1 + overlap)
        v = _objectness_slab(np.asarray(volume[a:b]), spacing_xyz, dimension, scales_mm, gamma)
        out[z0:z1] = v[z0 - a:z1 - a]
        del v
        if on_progress:
            on_progress(i, n)
    return out
```

- [ ] **Step 4: Ejecutar y medir**

Run: `cd backend && .venv\Scripts\python -m pytest test_vesselness.py -v`
Expected: PASS. Si `test_las_lonchas_no_dejan_costuras` falla en los bordes por la respuesta del suavizado recursivo cerca del límite de la loncha, sube el `overlap` del test a 12 y comprueba que con solape ≥ 3σ máximo (6 vóxeles a 0,5 mm) la diferencia queda por debajo de `atol=1e-3`; anota en el informe el solape mínimo que lo cumple.

Mide además sobre Case 3 (sesión `c80edc28-f42d-40f6-b2e2-a882c84fbe02`, `meshes/_volume.npy`) el tiempo de `objectness_max(vol, spacing, dimension=1)` con lonchas de 64 y anótalo en el informe (referencia: 10,7 s entero, 16 núcleos).

- [ ] **Step 5: Commit**

```bash
git add backend/services/vesselness.py backend/test_vesselness.py
git commit -m "Tubularidad de Frangi por lonchas: la memoria queda acotada y el resultado no cambia"
```

---

### Task 3: La máscara vascular

**Files:**
- Create: `backend/services/vascular_mask.py`, `backend/test_vascular_mask.py`

**Interfaces:**
- Consumes: `objectness_max`, `auto_gamma` (Task 2); `synthetic_tube`/`synthetic_plate` de `test_vesselness.py`.
- Produces:

```python
@dataclass
class MaskParams:
    lower: float
    upper: float = 0.0            # 0 = sin techo
    gate_pctl: float = 60.0       # solo mide core_vox (la puerta no filtra)
    seed_pctl: float = 90.0
    grow_pctl: float = 40.0
    seed_min_mm3: float = 50.0
    reclaim_mm: float = 3.0
    plate_veto: bool = True
    closing_iter: int = 1

@dataclass
class MaskResult:
    mask: np.ndarray              # bool (z, y, x)
    stats: dict                   # ver abajo
    fallback: bool                # True cuando no hubo semillas y se devolvió el umbral

def build_vascular_mask(volume, spacing, params, *, vesselness=None, plateness=None, on_progress=None) -> MaskResult
```

`stats` lleva: `m0_vox`, `core_vox` (vóxeles de M0 sobre la puerta: solo una cifra, no filtra), `seeds`, `grow_components`, `kept_components`, `reclaimed_vox`, `vetoed_vox`, `final_vox`, `kept_fraction` (final/m0), `thresholds` (`gate`, `seed`, `grow`).

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_vascular_mask.py
"""La máscara vascular: núcleo relleno, hueso fuera, sacos dentro."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from services.vascular_mask import MaskParams, build_vascular_mask
from test_vesselness import SP, synthetic_plate, synthetic_tube


def _sphere(shape, spacing, center, radius_mm, value):
    z, y, x = np.mgrid[0:shape[0], 0:shape[1], 0:shape[2]].astype(np.float32)
    d2 = ((z - center[0]) * spacing[0]) ** 2 + ((y - center[1]) * spacing[1]) ** 2 + ((x - center[2]) * spacing[2]) ** 2
    return np.where(d2 <= radius_mm ** 2, value, 0.0).astype(np.float32)


class TestNucleo:
    def test_un_tubo_con_el_centro_por_encima_del_techo_sale_macizo(self):
        vol = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0, value=1000.0)
        core = synthetic_tube(shape=(64, 48, 48), radius_mm=0.8, value=3000.0)
        vol = np.maximum(vol, core)
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, upper=2000.0))
        # Con el techo aplicado ANTES del relleno el centro quedaría hueco.
        assert r.mask[32, 24, 24]
        assert not r.fallback
        assert r.stats["final_vox"] >= 0.95 * (vol >= 500).sum()


class TestHueso:
    def test_una_lamina_suelta_no_entra(self):
        vol = np.maximum(synthetic_tube(shape=(64, 64, 64), radius_mm=2.0), 0)
        vol[8:11, :, :] = 1000.0          # lámina lejos del tubo
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0))
        assert not r.mask[9, 32, 32]
        assert r.mask[32, 32, 32]

    def test_una_lamina_en_contacto_no_vuelve_con_la_recuperacion(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0)
        vol[31:33, 20:64, 34:64] = 1000.0  # lámina que toca el tubo por un lado
        con = build_vascular_mask(vol, SP, MaskParams(lower=500.0, plate_veto=True))
        sin = build_vascular_mask(vol, SP, MaskParams(lower=500.0, plate_veto=False))
        lamina = np.zeros_like(vol, dtype=bool); lamina[31:33, 20:64, 44:64] = True
        assert con.mask[lamina].mean() < 0.15
        assert sin.mask[lamina].mean() > con.mask[lamina].mean()
        assert con.mask[32, 32, 32]


class TestSaco:
    def test_un_saco_pegado_al_tubo_se_conserva(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=1.5)
        saco = _sphere((64, 64, 64), SP, (32, 32 + 6, 32), 3.0, 1000.0)   # bola pegada al lado
        vol = np.maximum(vol, saco)
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, reclaim_mm=3.0))
        assert r.mask[saco > 0].mean() > 0.9
        r0 = build_vascular_mask(vol, SP, MaskParams(lower=500.0, reclaim_mm=0.0))
        assert r0.mask[saco > 0].mean() < r.mask[saco > 0].mean()


class TestSemillas:
    def test_sin_semillas_cae_al_umbral_y_lo_dice(self):
        vol = synthetic_tube(shape=(32, 32, 32), radius_mm=0.6, value=1000.0)  # demasiado fino para 50 mm³
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=50.0))
        assert r.fallback is True
        assert r.stats["seeds"] == 0
        np.testing.assert_array_equal(r.mask, ndimage.binary_fill_holes(vol >= 500.0))

    def test_una_rama_suelta_sin_semilla_se_descarta(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0)
        rama = synthetic_tube(shape=(64, 64, 64), radius_mm=0.9, axis=2)
        rama[:, :, :] = np.roll(rama, 20, axis=1)      # tubo fino separado del grueso
        vol = np.maximum(vol, rama)
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0))
        assert r.mask[32, 32, 32] and not r.mask[32, 52, 32]
        assert r.stats["kept_components"] == 1
```

- [ ] **Step 2: Ver que falla**

Run: `cd backend && .venv\Scripts\python -m pytest test_vascular_mask.py -q`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```python
# backend/services/vascular_mask.py
"""De un volumen a una máscara de vasos: macizos, sin hueso, con sus sacos.

Medido en Case 3 (384³ 3DRA, umbral 1470):
  · umbral solo: 568 017 vóxeles, 9 924 componentes a media resolución, láminas
    del peñasco pegadas a la vasculatura, y vasos huecos cuando hay techo;
  · esta máscara: 149 208 vóxeles tubulares + 53 801 recuperados a 3 mm,
    1 componente, y la lesión confirmada conserva el 99 % de sus vóxeles.

Fases (cada una publica progreso):
  1 núcleo    M0 = vol ≥ lower, relleno 3D; el techo (si lo hay) se aplica
              DESPUÉS del relleno, así que un vaso cuyo centro lo supera sigue
              macizo. Antes el techo vaciaba los vasos más llenos.
  2 tubular   V = Frangi(1) máximo entre escalas; se MIDE core_vox =
              |M0 ∧ V ≥ p60(V | M0)| (la puerta no filtra: es la cifra de núcleo).
  3 semillas  componentes de M0 ∧ V ≥ p90 con ≥ 50 mm³: los troncos gruesos.
  4 crecer    lo conectado a una semilla dentro de M0 ∧ V ≥ p40 (histéresis).
  5 recuperar M0 a ≤ 3 mm geodésicos del tubo (pared que el crecimiento adelgazó,
              y los sacos, que no son tubos), vetando lo que es lámina.
  6 cerrar    cierre de 1 vóxel y relleno final.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy import ndimage

from services.vesselness import objectness_max


@dataclass
class MaskParams:
    lower: float
    upper: float = 0.0
    gate_pctl: float = 60.0       # solo mide core_vox (la puerta no filtra)
    seed_pctl: float = 90.0
    grow_pctl: float = 40.0
    seed_min_mm3: float = 50.0
    reclaim_mm: float = 3.0
    plate_veto: bool = True
    closing_iter: int = 1


@dataclass
class MaskResult:
    mask: np.ndarray
    stats: dict = field(default_factory=dict)
    fallback: bool = False


def _say(on_progress: Callable[[str, float], None] | None, phase: str, pct: float) -> None:
    if on_progress:
        on_progress(phase, pct)


def build_vascular_mask(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    params: MaskParams,
    *,
    vesselness: np.ndarray | None = None,
    plateness: np.ndarray | None = None,
    on_progress: Callable[[str, float], None] | None = None,
) -> MaskResult:
    vox_mm3 = float(np.prod(spacing))
    stats: dict = {}

    # 1 · núcleo relleno, techo después
    _say(on_progress, "núcleo", 2)
    m0 = ndimage.binary_fill_holes(np.asarray(volume) >= params.lower)
    if params.upper > params.lower:
        m0 &= np.asarray(volume) <= params.upper
        m0 = ndimage.binary_fill_holes(m0)
    stats["m0_vox"] = int(m0.sum())
    if stats["m0_vox"] == 0:
        return MaskResult(m0, stats | {"seeds": 0, "final_vox": 0, "kept_fraction": 0.0}, fallback=True)

    # 2 · tubularidad
    if vesselness is None:
        vesselness = objectness_max(volume, spacing, dimension=1,
                                    on_progress=lambda i, n: _say(on_progress, f"tubularidad {i}/{n}", 5 + 40 * i / n))
    vin = vesselness[m0]
    t_gate = float(np.percentile(vin, params.gate_pctl))
    t_seed = float(np.percentile(vin, params.seed_pctl))
    t_grow = float(np.percentile(vin, params.grow_pctl))
    stats["thresholds"] = {"gate": t_gate, "seed": t_seed, "grow": t_grow}
    core = m0 & (vesselness >= t_gate)
    stats["core_vox"] = int(core.sum())

    # 3 · semillas: los troncos
    _say(on_progress, "semillas", 50)
    lab_s, _ = ndimage.label(m0 & (vesselness >= t_seed))
    sizes = np.bincount(lab_s.ravel()); sizes[0] = 0
    big = np.flatnonzero(sizes * vox_mm3 >= params.seed_min_mm3)
    stats["seeds"] = int(len(big))
    if len(big) == 0:
        stats.update(final_vox=int(m0.sum()), kept_fraction=1.0, grow_components=0,
                     kept_components=0, reclaimed_vox=0, vetoed_vox=0)
        return MaskResult(m0, stats, fallback=True)
    seed_mask = np.isin(lab_s, big)
    del lab_s

    # 4 · crecer por histéresis
    _say(on_progress, "crecimiento", 58)
    lab_g, n_g = ndimage.label(m0 & (vesselness >= t_grow))
    keep = np.unique(lab_g[seed_mask]); keep = keep[keep > 0]
    tube = np.isin(lab_g, keep)
    stats["grow_components"], stats["kept_components"] = int(n_g), int(len(keep))
    del lab_g

    # 5 · recuperar pared y sacos, vetando láminas
    reclaimed = np.zeros_like(tube)
    vetoed = 0
    if params.reclaim_mm > 0:
        _say(on_progress, "recuperación", 66)
        dist = ndimage.distance_transform_edt(~tube, sampling=spacing)
        near = m0 & (dist <= params.reclaim_mm) & ~tube
        del dist
        if params.plate_veto and near.any():
            if plateness is None:
                plateness = objectness_max(volume, spacing, dimension=2,
                                           on_progress=lambda i, n: _say(on_progress, f"laminaridad {i}/{n}", 66 + 20 * i / n))
            # Es lámina lo que puntúa más como lámina que como tubo.
            plate = plateness > vesselness
            vetoed = int((near & plate).sum())
            near &= ~plate
        lab_r, _ = ndimage.label(near | tube)
        keep = np.unique(lab_r[tube]); keep = keep[keep > 0]
        reclaimed = np.isin(lab_r, keep) & ~tube
        del lab_r
    stats["reclaimed_vox"], stats["vetoed_vox"] = int(reclaimed.sum()), vetoed

    # 6 · cerrar y rellenar
    _say(on_progress, "cierre", 90)
    final = tube | reclaimed
    if params.closing_iter > 0:
        final = ndimage.binary_closing(final, iterations=params.closing_iter) | final
    final = ndimage.binary_fill_holes(final)
    stats["final_vox"] = int(final.sum())
    stats["kept_fraction"] = float(final.sum() / max(1, m0.sum()))
    return MaskResult(final, stats, fallback=False)
```

- [ ] **Step 4: Ejecutar**

Run: `cd backend && .venv\Scripts\python -m pytest test_vascular_mask.py -v`
Expected: PASS. Si `test_una_lamina_en_contacto_no_vuelve_con_la_recuperacion` no baja del 15 %, ajusta el criterio de lámina a `plateness > 1.5 * vesselness` y anota en el informe el valor con el que pasa Y con el que el test del saco sigue pasando; si `test_una_rama_suelta_sin_semilla_se_descarta` falla porque el tubo fino sí genera semilla, baja su radio a 0,7 mm en el test.

- [ ] **Step 5: Commit**

```bash
git add backend/services/vascular_mask.py backend/test_vascular_mask.py
git commit -m "La máscara vascular: vasos macizos, hueso fuera por tubularidad y sacos recuperados a 3 mm"
```

---

### Task 4: Superficie estanca y decimación para detección

**Files:**
- Modify: `backend/services/segmentation.py` (añadir `mask_to_surface`, `decimate_to`, `surface_quality`)
- Create: `backend/test_surface.py`

**Interfaces:**
- Produces: `mask_to_surface(mask: np.ndarray, spacing, *, smooth_iters: int = 40, pass_band: float = 0.05, decimation: float = 0.6, fill_holes_mm: float = 4.0, min_island_mm3: float = 2.0, gauss_sigma_vox: float = 0.7, on_progress=None) -> vtk.vtkPolyData`.
- Produces: `decimate_to(poly: vtk.vtkPolyData, max_vertices: int) -> vtk.vtkPolyData` (devuelve el mismo objeto si ya cabe).
- Produces: `surface_quality(poly) -> dict` con `boundary_edges`, `components`, `aspect_ratio_median`, `n_vertices`, `n_triangles`.

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_surface.py
"""Superficie estanca a partir de una máscara, y decimación acotada."""
from __future__ import annotations

import numpy as np
import vtk

from services.segmentation import decimate_to, mask_to_surface, surface_quality
from test_vesselness import SP, synthetic_tube


class TestEstanca:
    def test_un_tubo_da_una_superficie_sin_bordes_ni_islas(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        poly = mask_to_surface(mask, SP)
        q = surface_quality(poly)
        assert q["boundary_edges"] == 0
        assert q["components"] == 1
        assert q["aspect_ratio_median"] < 1.45
        assert q["n_vertices"] > 100

    def test_el_volumen_encerrado_se_parece_al_de_la_mascara(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        poly = mask_to_surface(mask, SP)
        mp = vtk.vtkMassProperties(); mp.SetInputData(poly); mp.Update()
        esperado = float(mask.sum()) * float(np.prod(SP))
        assert abs(mp.GetVolume() - esperado) / esperado < 0.12

    def test_un_agujero_pequeno_en_la_pared_se_cierra(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        mask[30:33, 24, 26:29] = False          # un pinchazo de ~1 mm en la pared
        poly = mask_to_surface(mask, SP)
        assert surface_quality(poly)["boundary_edges"] == 0

    def test_las_islas_diminutas_desaparecen(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        mask[5, 5, 5] = True                    # una mota de 0,125 mm³
        poly = mask_to_surface(mask, SP)
        assert surface_quality(poly)["components"] == 1

    def test_informa_del_progreso(self):
        mask = synthetic_tube(shape=(32, 32, 32), radius_mm=2.0) > 0
        fases: list[str] = []
        mask_to_surface(mask, SP, on_progress=lambda f, p: fases.append(f))
        assert fases[0] == "superficie" and "decimación" in fases


class TestDecimacion:
    def test_reduce_hasta_el_tope_y_no_toca_lo_que_ya_cabe(self):
        mask = synthetic_tube(shape=(96, 64, 64), radius_mm=3.0) > 0
        poly = mask_to_surface(mask, SP, decimation=0.0)
        n = poly.GetNumberOfPoints()
        small = decimate_to(poly, max_vertices=n // 3)
        assert small.GetNumberOfPoints() <= n // 3 * 1.05
        assert decimate_to(poly, max_vertices=n + 1) is poly
```

- [ ] **Step 2: Ver que falla**

Run: `cd backend && .venv\Scripts\python -m pytest test_surface.py -q`
Expected: FAIL (`ImportError`).

- [ ] **Step 3: Implementación** (añade al final de `services/segmentation.py`, tras `write_vtp`/`read_vtp`)

```python
# ── Superficie estanca a partir de una máscara ─────────────────────────────── #
#
# La malla antigua salía de marching cubes sobre un binario: escalones, 67
# aristas de borde y triángulos alargados. Aquí la máscara se suaviza a float
# antes (superficie sub-vóxel), se cierra lo que quede abierto y se decima con
# normales. Criterio del diseño: 0 aristas de borde, aspecto mediano < 1,45.

def mask_to_surface(
    mask: np.ndarray,
    spacing: tuple[float, float, float],
    *,
    smooth_iters: int = 40,
    pass_band: float = 0.05,
    decimation: float = 0.6,
    fill_holes_mm: float = 4.0,
    min_island_mm3: float = 2.0,
    gauss_sigma_vox: float = 0.7,
    on_progress=None,
) -> vtk.vtkPolyData:
    from scipy import ndimage

    def say(phase: str, pct: float) -> None:
        if on_progress:
            on_progress(phase, pct)

    say("superficie", 0)
    field = ndimage.gaussian_filter(mask.astype(np.float32), gauss_sigma_vox)
    img = SegmentationPipeline._to_vtk_image(field, spacing)
    mc = vtk.vtkMarchingCubes()
    mc.SetInputData(img); mc.SetValue(0, 0.5)
    mc.ComputeNormalsOff(); mc.ComputeGradientsOff(); mc.Update()
    if mc.GetOutput().GetNumberOfPolys() == 0:
        raise ValueError("La máscara no contiene ninguna superficie.")

    say("suavizado", 25)
    prev = mc.GetOutputPort()
    if smooth_iters > 0:
        sm = vtk.vtkWindowedSincPolyDataFilter()
        sm.SetInputConnection(prev); sm.SetNumberOfIterations(smooth_iters); sm.SetPassBand(pass_band)
        sm.BoundarySmoothingOff(); sm.FeatureEdgeSmoothingOff(); sm.NonManifoldSmoothingOn(); sm.NormalizeCoordinatesOn()
        sm.Update(); prev = sm.GetOutputPort()

    if fill_holes_mm > 0:
        fh = vtk.vtkFillHolesFilter()
        fh.SetInputConnection(prev); fh.SetHoleSize(fill_holes_mm); fh.Update(); prev = fh.GetOutputPort()

    say("decimación", 55)
    if decimation > 0:
        dec = vtk.vtkQuadricDecimation()
        dec.SetInputConnection(prev); dec.SetTargetReduction(decimation); dec.Update(); prev = dec.GetOutputPort()

    say("normales", 75)
    nrm = vtk.vtkPolyDataNormals()
    nrm.SetInputConnection(prev); nrm.ComputePointNormalsOn(); nrm.ComputeCellNormalsOff()
    nrm.SplittingOff(); nrm.SetFeatureAngle(60.0); nrm.ConsistencyOn(); nrm.AutoOrientNormalsOn(); nrm.Update()
    poly = nrm.GetOutput()

    say("islas", 90)
    if min_island_mm3 > 0:
        poly = _drop_small_islands(poly, min_island_mm3)
    say("superficie lista", 100)
    return poly


def _drop_small_islands(poly: vtk.vtkPolyData, min_mm3: float) -> vtk.vtkPolyData:
    """Quita las piezas conexas con menos de `min_mm3` de volumen encerrado."""
    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(poly); cf.SetExtractionModeToAllRegions(); cf.ColorRegionsOn(); cf.Update()
    n = cf.GetNumberOfExtractedRegions()
    if n <= 1:
        return poly
    keep = vtk.vtkPolyDataConnectivityFilter()
    keep.SetInputData(poly); keep.SetExtractionModeToSpecifiedRegions()
    kept = 0
    for r in range(n):
        one = vtk.vtkPolyDataConnectivityFilter()
        one.SetInputData(poly); one.SetExtractionModeToSpecifiedRegions(); one.AddSpecifiedRegion(r); one.Update()
        tri = vtk.vtkTriangleFilter(); tri.SetInputConnection(one.GetOutputPort()); tri.Update()
        mp = vtk.vtkMassProperties(); mp.SetInputConnection(tri.GetOutputPort()); mp.Update()
        if abs(mp.GetVolume()) >= min_mm3:
            keep.AddSpecifiedRegion(r); kept += 1
    if kept == 0:
        return poly
    keep.Update()
    cl = vtk.vtkCleanPolyData(); cl.SetInputConnection(keep.GetOutputPort()); cl.Update()
    return cl.GetOutput()


def decimate_to(poly: vtk.vtkPolyData, max_vertices: int) -> vtk.vtkPolyData:
    """La malla con como mucho `max_vertices` puntos, o la misma si ya cabe.

    La detección desactiva sus canales de calibre por encima de 40 000 vértices
    (medido: 52 s en 79 000). Decimar EN MEMORIA para detectar deja la malla
    completa en disco para medir.
    """
    n = poly.GetNumberOfPoints()
    if n <= max_vertices:
        return poly
    dec = vtk.vtkQuadricDecimation()
    dec.SetInputData(poly); dec.SetTargetReduction(1.0 - max_vertices / float(n)); dec.Update()
    nrm = vtk.vtkPolyDataNormals()
    nrm.SetInputConnection(dec.GetOutputPort()); nrm.SplittingOff(); nrm.ConsistencyOn(); nrm.AutoOrientNormalsOn(); nrm.Update()
    return nrm.GetOutput()


def surface_quality(poly: vtk.vtkPolyData) -> dict:
    fe = vtk.vtkFeatureEdges()
    fe.SetInputData(poly); fe.BoundaryEdgesOn(); fe.FeatureEdgesOff(); fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff(); fe.Update()
    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(poly); cf.SetExtractionModeToAllRegions(); cf.Update()
    q = vtk.vtkMeshQuality()
    q.SetInputData(poly); q.SetTriangleQualityMeasureToAspectRatio(); q.Update()
    ar = ns.vtk_to_numpy(q.GetOutput().GetCellData().GetArray("Quality"))
    return {
        "boundary_edges": int(fe.GetOutput().GetNumberOfLines()),
        "components": int(cf.GetNumberOfExtractedRegions()),
        "aspect_ratio_median": float(np.median(ar)) if ar.size else 0.0,
        "n_vertices": int(poly.GetNumberOfPoints()),
        "n_triangles": int(poly.GetNumberOfPolys()),
    }
```

- [ ] **Step 4: Ejecutar**

Run: `cd backend && .venv\Scripts\python -m pytest test_surface.py -v`
Expected: PASS. Si `test_un_agujero_pequeno_en_la_pared_se_cierra` deja aristas, comprueba que el pinchazo es menor que `fill_holes_mm` (perímetro ≈ 3 mm) y que `vtkFillHolesFilter` recibe triángulos (añade un `vtkTriangleFilter` antes si el suavizado devuelve polígonos); anota en el informe.

- [ ] **Step 5: Commit**

```bash
git add backend/services/segmentation.py backend/test_surface.py
git commit -m "La superficie sale de la máscara suavizada, sin huecos ni islas, y se puede decimar para detectar"
```

---

### Task 5: El método tubular en el router de segmentación, con fases y guardas

**Files:**
- Modify: `backend/models/segmentation.py` (`SegmentRequest.method`, `SegmentRequest.reclaim_mm`, `SegmentRequest.half_resolution`; `SegmentResult.method`, `.kept_fraction`, `.reclaimed_mm3`, `.vetoed_mm3`, `.boundary_edges`, `.components`, `.seeds`, `.fallback_note`, `.phase_seconds`)
- Modify: `backend/routers/segment.py` (`_run_segmentation_sync`)
- Create: `backend/test_segment_tubular.py`

**Interfaces:**
- Consumes: `progress` (Task 1), `objectness_max`/`auto_gamma` (Task 2), `MaskParams`/`build_vascular_mask` (Task 3), `mask_to_surface`/`surface_quality` (Task 4).
- Produces: `POST /api/segment` acepta `method: "tubular" | "threshold"` (por defecto `"tubular"`), `reclaim_mm: float = 3.0` (0–5), `half_resolution: bool = False` (sustituye a `full_resolution`, que se mantiene aceptado y con el significado inverso mientras el frontend migra: si llega `full_resolution`, `half_resolution = not full_resolution`). `SegmentResult` añade `method`, `reclaimed_mm3`, `vetoed_mm3`, `boundary_edges`, `components`, `seeds`, `fallback_note: str`, `phase_seconds: dict[str, float]`; `kept_fraction` pasa a ser final/M0 en el método tubular.
- Fases publicadas (en este orden, con estos nombres): `carga`, `núcleo`, `tubularidad i/n`, `semillas`, `crecimiento`, `recuperación`, `laminaridad i/n`, `cierre`, `superficie`, `suavizado`, `decimación`, `normales`, `islas`, `guardado`.

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_segment_tubular.py
"""El método tubular por la API: fases, guardas y resultado."""
from __future__ import annotations

import time
import threading

import numpy as np
from fastapi.testclient import TestClient

from main import app
from services import progress
from services.segmentation import read_vtp, surface_quality
from services.sessions import create_session, session_subdir
from test_volume_chunks import _write_classic_ct_series

client = TestClient(app, raise_server_exceptions=True)


def _tube_series(sid: str, nz=40, size=48, radius_mm=3.0, core=0.0):
    """Un tubo brillante a lo largo de z en una serie clásica de `nz` cortes."""
    z, y, x = np.mgrid[0:nz, 0:size, 0:size].astype(np.float32)
    d2 = (y - size / 2) ** 2 + (x - size / 2) ** 2         # spacing 1 mm en el helper
    vol = np.where(d2 <= radius_mm ** 2, 800.0, 0.0)
    if core:
        vol = np.where(d2 <= (radius_mm / 3) ** 2, core, vol)
    _write_classic_ct_series(sid, nz=nz, size=size, values=vol.astype(np.int16))


def _segment(sid: str, **over):
    body = {"session_id": sid, "series_id": "", "lower": 300.0, "upper": 0.0,
            "smoothing": 3, "cleanup": 0, "main_tree_only": False, "method": "tubular"}
    body.update(over)
    return client.post("/api/segment", json=body)


class TestTubular:
    def test_devuelve_una_malla_estanca_y_sus_cifras(self):
        sid = create_session(); _tube_series(sid)
        r = _segment(sid)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["method"] == "tubular"
        assert j["boundary_edges"] == 0 and j["components"] == 1
        assert j["seeds"] >= 1 and j["fallback_note"] == ""
        assert set(j["phase_seconds"]) >= {"tubularidad", "superficie", "guardado"}
        poly = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        assert surface_quality(poly)["boundary_edges"] == 0

    def test_el_techo_ya_no_vacia_el_vaso(self):
        sid = create_session(); _tube_series(sid, core=3000.0)
        j = _segment(sid, upper=2000.0).json()
        assert j["components"] == 1 and j["boundary_edges"] == 0
        # Con el método antiguo el mismo techo dejaba una cáscara doble.
        j2 = _segment(sid, upper=2000.0, method="threshold").json()
        assert j2["method"] == "threshold"

    def test_sin_semillas_lo_dice_y_no_falla(self):
        sid = create_session(); _tube_series(sid, radius_mm=0.8)
        j = _segment(sid).json()
        assert "semilla" in j["fallback_note"].lower()

    def test_el_progreso_avanza_por_fases_durante_la_segmentacion(self):
        sid = create_session(); _tube_series(sid, nz=64, size=64)
        seen: list[str] = []
        stop = threading.Event()
        def watch():
            while not stop.is_set():
                p = progress.get(sid)
                if p and p["phase"] and (not seen or seen[-1] != p["phase"]):
                    seen.append(p["phase"])
                time.sleep(0.01)
        t = threading.Thread(target=watch); t.start()
        try:
            assert _segment(sid).status_code == 200
        finally:
            stop.set(); t.join()
        assert "superficie" in seen and any(s.startswith("tubularidad") for s in seen)
        assert progress.get(sid)["running"] is False and progress.get(sid)["ok"] is True

    def test_media_resolucion_se_fuerza_por_encima_del_tope(self, monkeypatch):
        from routers import segment as seg
        monkeypatch.setattr(seg, "_TUBULAR_MAX_VOXELS", 1000)
        sid = create_session(); _tube_series(sid, nz=40, size=48)      # 92 160 vóxeles
        j = _segment(sid).json()
        assert j["downsample_factor"] == 2
        assert "media resolución" in j["fallback_note"].lower()

    def test_full_resolution_sigue_aceptandose_con_el_significado_inverso(self):
        sid = create_session(); _tube_series(sid)
        j = _segment(sid, full_resolution=False).json()
        assert j["downsample_factor"] == 2
```

- [ ] **Step 2: Ver que falla**

Run: `cd backend && .venv\Scripts\python -m pytest test_segment_tubular.py -q`
Expected: FAIL (422 por `method` desconocido, o `KeyError: 'method'`). Si `_write_classic_ct_series` no acepta `values`, amplíala en `test_volume_chunks.py` con un parámetro opcional `values: np.ndarray | None` (int16, forma `(nz, size, size)`) que sustituye al cubo brillante; los tests existentes no cambian.

- [ ] **Step 3: Modelos**

En `backend/models/segmentation.py`, `SegmentRequest` añade:

```python
    method: Literal["tubular", "threshold"] = Field(
        "tubular",
        description=(
            "«tubular»: máscara por tubularidad (Frangi) con núcleo relleno, "
            "hueso vetado y sacos recuperados; «threshold»: el umbral clásico."
        ),
    )
    reclaim_mm: float = Field(3.0, ge=0.0, le=5.0, description="Radio de recuperación de pared y sacos (mm), método tubular")
    half_resolution: bool = Field(
        False,
        description="Segmentar con el eje mayor a 256 en vez de a resolución nativa (más rápido, vasos finos rotos).",
    )
```

y `full_resolution` pasa a `bool | None = Field(None, description="Obsoleto: inverso de half_resolution")`. `SegmentResult` añade:

```python
    method: str = "threshold"
    reclaimed_mm3: float = 0.0
    vetoed_mm3: float = 0.0
    boundary_edges: int = 0
    components: int = 0
    seeds: int = 0
    fallback_note: str = ""
    phase_seconds: dict[str, float] = Field(default_factory=dict)
```

(importa `Literal` de `typing`).

- [ ] **Step 4: Router**

En `backend/routers/segment.py`:

```python
_TUBULAR_MAX_VOXELS = 90_000_000   # por encima, media resolución forzada (1 vCPU / 2 GB)
```

En `segment()`: resuelve `half = req.half_resolution if req.full_resolution is None else (not req.full_resolution)` y pasa `method=req.method, reclaim_mm=req.reclaim_mm, half_resolution=half` a `_run_segmentation_sync`; elimina el parámetro `full_resolution` de la firma síncrona. Envuelve la llamada al executor con `progress.start(req.session_id)` antes y `progress.finish(req.session_id, ok=True)` / `progress.finish(req.session_id, ok=False, message=str(exc))` en cada rama de error.

En `_run_segmentation_sync`, tras cargar el DICOM y calcular `strategy`/`vf` (déjalo como está), sustituye el bloque «Downsample very large volumes» + «Run marching cubes» por:

```python
    phase_seconds: dict[str, float] = {}
    fallback_note = ""
    say = lambda phase, pct: progress.update(session_id, phase, pct)   # noqa: E731

    def timed(name, fn):
        t = time.perf_counter()
        out = fn()
        phase_seconds[name] = round(time.perf_counter() - t, 2)
        return out

    n_voxels = int(np.prod(dcm.volume.shape))
    if method == "tubular" and not half_resolution and n_voxels > _TUBULAR_MAX_VOXELS:
        half_resolution = True
        fallback_note = (f"Volumen de {n_voxels / 1e6:.0f} millones de vóxeles: se segmenta a "
                         f"media resolución para no agotar la memoria del servidor.")
    if half_resolution:
        seg_volume, seg_spacing, ds_factor = _maybe_downsample(dcm.volume, dcm.spacing)
    else:
        seg_volume, seg_spacing, ds_factor = np.ascontiguousarray(dcm.volume, dtype=np.float32), tuple(dcm.spacing), 1

    if method == "tubular":
        from services.vascular_mask import MaskParams, build_vascular_mask
        from services.segmentation import mask_to_surface, surface_quality
        say("núcleo", 2)
        params = MaskParams(lower=lower, upper=upper if upper > lower else 0.0, reclaim_mm=reclaim_mm)
        mr = timed("máscara", lambda: build_vascular_mask(seg_volume, seg_spacing, params, on_progress=say))
        if mr.fallback:
            fallback_note = (fallback_note + " " if fallback_note else "") + (
                "No se encontró ninguna semilla vascular ≥ 50 mm³ con este umbral: se usó la máscara de umbral "
                "rellena, sin filtrar por tubularidad. Baja el umbral inferior si falta contraste.")
        poly = timed("superficie", lambda: mask_to_surface(
            mr.mask, seg_spacing, smooth_iters=smooth_iters,
            on_progress=lambda f, p: say(f, 90 + p / 10)))
        vox_mm3 = float(np.prod(seg_spacing))
        q = surface_quality(poly)
        seg_result = SegmentationResult(
            poly_data=poly, n_vertices=q["n_vertices"], n_triangles=q["n_triangles"],
            threshold_hu=lower, reduction_pct=60.0, n_fragments_removed=0,
            kept_fraction=mr.stats.get("kept_fraction", 1.0), largest_removed_mm3=0.0)
        extra = dict(method="tubular", reclaimed_mm3=round(mr.stats.get("reclaimed_vox", 0) * vox_mm3, 1),
                     vetoed_mm3=round(mr.stats.get("vetoed_vox", 0) * vox_mm3, 1),
                     boundary_edges=q["boundary_edges"], components=q["components"],
                     seeds=int(mr.stats.get("seeds", 0)))
        # Separa el tiempo de tubularidad del de máscara para la interfaz.
        phase_seconds["tubularidad"] = phase_seconds.get("máscara", 0.0)
    else:
        say("marching cubes", 20)
        seg_result = timed("marching cubes", lambda: pipeline.run(seg_volume, seg_spacing))
        extra = dict(method="threshold")
```

El resto (árbol principal, `write_vtp`, `scan_and_freeze`, limpieza de detección, estado) queda igual, envuelto en `timed("guardado", ...)` para la escritura; `seg.method` se escribe en el estado (`write_state(session_id, "seg.method", method)`). El `SegmentResult` devuelto añade `**extra`, `fallback_note=fallback_note`, `phase_seconds=phase_seconds`. `main_tree_only` con el método tubular sigue funcionando (la máscara ya es un componente, así que normalmente no quita nada).

- [ ] **Step 5: Ejecutar**

Run: `cd backend && .venv\Scripts\python -m pytest test_segment_tubular.py test_segment_preview.py test_comparar_techo.py -q`
Expected: PASS. `test_comparar_techo.py` usa el pipeline antiguo por `comparar_techo`; no debe cambiar.

- [ ] **Step 6: Commit**

```bash
git add backend/models/segmentation.py backend/routers/segment.py backend/test_segment_tubular.py backend/test_volume_chunks.py
git commit -m "Segmentar por tubularidad es el método por defecto, con fases de progreso y guarda de memoria"
```

---

### Task 6: Detección sobre la malla decimada y reintento del plano de cuello

**Files:**
- Modify: `backend/routers/detect.py` (`_run_detection_sync`, `_run_morphometry_sync`)
- Modify: `backend/test_detector_case3.py` (nuevo test), `backend/test_neck_plane_feedback.py` (nuevo test)

**Interfaces:**
- Consumes: `decimate_to` (Task 4), `isolate_closed_sac`/`isolate_sac_volumetric` existentes.
- Produces: `_DETECT_MAX_VERTS = 40_000`; la detección corre sobre `decimate_to(poly, _DETECT_MAX_VERTS)` y los parches de candidato se recortan de la malla COMPLETA (`hit_patch(poly_full, hit)`), así que el `.vtp` de cada candidato sigue siendo a resolución completa. `_run_morphometry_sync` prueba desplazamientos `(0, +1, −1, +2, −2)` mm del origen a lo largo de la normal antes de rendirse, y guarda en `morpho.neck_shift_mm` el que usó.

- [ ] **Step 1: Tests que fallan**

Añade a `backend/test_detector_case3.py` (usa el fixture `malla` existente del archivo):

```python
class TestDetectarSobreLaMallaCompleta:
    def test_una_malla_de_mas_de_40k_vertices_no_pierde_los_canales_de_calibre(self, malla):
        # Se sube la malla artificialmente por encima del tope subdividiéndola.
        import vtk
        from routers.detect import _detect_hits
        sub = vtk.vtkLinearSubdivisionFilter(); sub.SetInputData(malla); sub.SetNumberOfSubdivisions(2); sub.Update()
        grande = sub.GetOutput()
        assert grande.GetNumberOfPoints() > 40_000
        hits = _detect_hits(grande, "XA")
        assert any(("calibre" in h.channels) or ("cociente" in h.channels) for h in hits)
```

Añade a `backend/test_neck_plane_feedback.py`:

```python
class TestReintentoDelPlano:
    def test_un_origen_un_milimetro_fuera_del_cuello_se_corrige_solo(self, sesion_con_saco):
        # `sesion_con_saco` es el fixture del archivo que deja un tubo con un saco y
        # un plano que SÍ aísla; aquí se desplaza el origen 1 mm hacia el vaso.
        sid, origin, normal = sesion_con_saco
        malo = [origin[i] - 1.0 * normal[i] for i in range(3)]
        r = client.post(f"/api/morphometry/{sid}/neck-plane",
                        json={"origin": {"x": malo[0], "y": malo[1], "z": malo[2]}, "normal": list(normal)})
        assert r.status_code == 200, r.text
        from services.sessions import read_state
        assert abs(float(read_state(sid, "morpho.neck_shift_mm", "0"))) == 1.0
```

Si `test_neck_plane_feedback.py` no tiene un fixture equivalente a `sesion_con_saco`, créalo en ese archivo a partir de lo que ya usa para probar el plano de cuello (un tubo con una esfera pegada segmentado por `/api/segment` con `method="threshold"`), y dilo en el informe.

- [ ] **Step 2: Ver que fallan**

Run: `cd backend && .venv\Scripts\python -m pytest test_detector_case3.py test_neck_plane_feedback.py -q`
Expected: FAIL (`_detect_hits` no existe; el reintento no existe).

- [ ] **Step 3: Implementación**

En `routers/detect.py` extrae de `_run_detection_sync` la parte que construye el detector y llama a `consensus` a:

```python
_DETECT_MAX_VERTS = 40_000


def _detect_hits(poly: "vtk.vtkPolyData", modality: str):
    """Los candidatos, calculados sobre una copia decimada si la malla es grande.

    La malla completa (124 000 vértices en Case 3 a resolución nativa) hace que
    `consensus` apague sus canales de calibre por encima de 40 000; decimarla
    solo para buscar devuelve esos canales, y los parches se recortan luego de
    la malla completa.
    """
    from services.segmentation import decimate_to
    detector = _detector_for_modality(modality)
    small = decimate_to(poly, _DETECT_MAX_VERTS)
    return consensus(small, detector, top=_MAX_CANDIDATES)
```

y en `_run_detection_sync` usa `hits = _detect_hits(poly, modality)` manteniendo `hit_patch(poly, hit)` sobre la malla completa; el `det_result = detector.detect(...)` que alimenta los diagnósticos de la respuesta corre también sobre la copia decimada (devuélvelo desde `_detect_hits` como segundo valor si el router lo necesita). Registra en el log el número de vértices antes y después.

En `_run_morphometry_sync`, envuelve el bloque que aísla el saco (volumétrico + superficie) en un bucle:

```python
        shifts = (0.0, 1.0, -1.0, 2.0, -2.0)
        last_error: Exception | None = None
        for shift in shifts:
            o = tuple(origin[i] + shift * normal[i] for i in range(3))
            try:
                sac_mesh, neck_diam = _isolate_sac(session_id, vtp_path, o, normal, seed, bound_r, crop_half)
            except ValueError as exc:
                last_error = exc
                continue
            if sac_mesh is not None and sac_mesh.GetNumberOfPoints() >= 50 and neck_diam > 0.3:
                origin = o
                write_state(session_id, "morpho.neck_shift_mm", str(shift))
                if shift:
                    logger.info("Neck plane shifted %.0f mm along the normal to isolate the sac", shift)
                break
        else:
            raise ValueError(
                "No se aísla un saco válido con este plano ni desplazándolo ±2 mm. "
                "Verifica que el punto de cuello esté sobre el cuello y el ápice sobre la cúpula del domo."
            ) from last_error
```

donde `_isolate_sac(...)` es el código actual (volumétrico con fallback a superficie) movido a una función que devuelve `(sac_mesh, neck_diam)` o lanza `ValueError`.

- [ ] **Step 4: Ejecutar**

Run: `cd backend && .venv\Scripts\python -m pytest test_detector_case3.py test_neck_plane_feedback.py test_morphometry_sac.py test_consensus_and_plane.py -q`
Expected: PASS (los tests del Case 3 que fijan la posición de la lesión deben seguir pasando: la decimación se hace sobre una copia).

- [ ] **Step 5: Commit**

```bash
git add backend/routers/detect.py backend/test_detector_case3.py backend/test_neck_plane_feedback.py
git commit -m "La detección busca sobre una copia decimada y el plano de cuello se reintenta a ±2 mm"
```

---

### Task 7: La meta del volumen deja de guardar copias obsoletas tras preprocesar

**Files:**
- Modify: `backend/routers/preprocess.py`
- Modify: `backend/test_preprocess.py`

**Interfaces:**
- Produces: tras `POST /api/preprocess/{sid}`, `_volume_meta.json` contiene `full_stride` e `intensity_range` recalculados sobre el volumen nuevo, y NO contiene `cache_key` ni `orientation_manual` (que son por llamada).

- [ ] **Step 1: Test que falla**

Añade a `backend/test_preprocess.py` (sigue el patrón de sesión sintética que ya usa el archivo):

```python
def test_preprocesar_recalcula_el_rango_y_no_persiste_claves_por_llamada(session_with_ct_volume):
    sid = session_with_ct_volume
    from services.mpr import _cache_paths
    import json
    r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": True, "resample_isotropic": False, "smooth": False})
    assert r.status_code == 200, r.text
    meta = json.loads(_cache_paths(sid)[1].read_text())
    assert "cache_key" not in meta and "orientation_manual" not in meta
    assert meta["intensity_range"][1] <= 3000.0          # recortado a HU_MAX
    assert meta["full_stride"] == 1
```

Si el archivo no tiene un fixture `session_with_ct_volume`, créalo con un volumen CT sintético cuya intensidad llegue a 5000 (para que el recorte a 3000 sea observable) escribiendo `_volume.npy` y `_volume_meta.json` con `modality: "CT"`.

- [ ] **Step 2: Ver que falla** — `pytest test_preprocess.py -q -k recalcula` → FAIL.

- [ ] **Step 3: Implementación**

En `routers/preprocess.py::_run`, sustituye la construcción de `new_meta` por:

```python
    from services.mpr import _full_stride, _intensity_range, new_volume_id
    new_meta = {k: v for k, v in meta.items() if k not in ("cache_key", "orientation_manual")}
    new_meta["shape"] = [int(x) for x in new_vol.shape]
    new_meta["spacing"] = [float(s) for s in new_spacing]
    new_meta["intensity_range"] = _intensity_range(new_vol)
    new_meta["full_stride"] = _full_stride(new_meta["shape"])
    new_meta["volume_id"] = new_volume_id()
```

- [ ] **Step 4: Ejecutar** — `pytest test_preprocess.py test_volume_chunks.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/preprocess.py backend/test_preprocess.py
git commit -m "Preprocesar recalcula el rango de intensidad y no guarda claves que son por llamada"
```

---

### Task 8: Progreso en el navegador: WebSocket con respaldo por GET

**Files:**
- Create: `frontend/src/api/progress.ts`, `frontend/src/api/progress.test.ts`, `frontend/src/components/segmentation/SegmentProgress.tsx`
- Modify: `frontend/vite.config.ts` (proxy WS), `frontend/src/api/client.ts` (`api.progress(sid)`), `frontend/src/api/types.ts` (`ProgressState`)

**Interfaces:**
- Produces: `interface ProgressState { phase: string; pct: number; running: boolean; ok: boolean | null; message: string }`.
- Produces: `watchProgress(sessionId: string, onState: (s: ProgressState) => void, opts?: { pollMs?: number; wsFactory?: (url: string) => WebSocket; fetchState?: (sid: string) => Promise<ProgressState> }): () => void` — abre `ws(s)://<host>/ws/progress/{sid}?token=<jwt>`; si el WS falla o se cierra sin haber terminado, hace polling del GET cada `pollMs` (500 ms); devuelve una función para parar. Termina sola cuando `running === false && ok !== null`.
- Produces: `useProgress(sessionId: string | null, active: boolean): ProgressState | null` (hook sobre `watchProgress`, en el mismo archivo).
- Produces: `<SegmentProgress state={ProgressState} />` — fase en mayúsculas mono, `ProgressBar` determinada, texto «Tarda varios minutos en el servidor» cuando `pct < 5` tras 10 s.

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/api/progress.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchProgress, type ProgressState } from "./progress";

class FakeWs {
  static instances: FakeWs[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeWs.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  emit(s: ProgressState) { this.onmessage?.({ data: JSON.stringify(s) }); }
}

const running = (phase: string, pct: number): ProgressState => ({ phase, pct, running: true, ok: null, message: "" });
const done: ProgressState = { phase: "guardado", pct: 100, running: false, ok: true, message: "" };

describe("watchProgress", () => {
  beforeEach(() => { FakeWs.instances = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("relays WebSocket states and stops when the job finishes", () => {
    const seen: ProgressState[] = [];
    const stop = watchProgress("sid", (s) => seen.push(s), { wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState: async () => done });
    const ws = FakeWs.instances[0];
    expect(ws.url).toMatch(/\/ws\/progress\/sid\?token=/);
    ws.emit(running("tubularidad 2/6", 20));
    ws.emit(done);
    expect(seen.map((s) => s.phase)).toEqual(["tubularidad 2/6", "guardado"]);
    expect(ws.closed).toBe(true);
    stop();
  });

  it("vuelve al GET cuando el WebSocket falla", async () => {
    const states = [running("núcleo", 2), running("superficie", 90), done];
    const fetchState = vi.fn(async () => states.shift() ?? done);
    const seen: ProgressState[] = [];
    watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(350);
    expect(fetchState).toHaveBeenCalled();
    expect(seen.map((s) => s.phase)).toEqual(["núcleo", "superficie", "guardado"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchState).toHaveBeenCalledTimes(3);   // se detiene al terminar
  });

  it("stop() cierra el socket y para el polling", async () => {
    const fetchState = vi.fn(async () => running("x", 1));
    const stop = watchProgress("sid", () => {}, { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(150);
    stop();
    const n = fetchState.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchState.mock.calls.length).toBe(n);
  });
});
```

- [ ] **Step 2: Ver que falla** — `cd frontend && npx vitest run src/api/progress.test.ts` → FAIL.

- [ ] **Step 3: Implementación**

`frontend/src/api/types.ts`:

```ts
/* ── progreso ───────────────────────────────────────────────────────────── */
export interface ProgressState {
  phase: string;
  pct: number;
  running: boolean;
  ok: boolean | null;
  message: string;
}
```

`frontend/src/api/client.ts`, en el objeto `api`: `progress: (sessionId: string) => get<ProgressState>(`/api/progress/${sessionId}`),`.

`frontend/src/api/progress.ts`:

```ts
/* Progreso de un trabajo largo: WebSocket cuando el proxy lo deja pasar, GET
   cada medio segundo cuando no (Amplify y algunos proxies no reenvían WS). El
   panel no distingue una vía de otra. */

import { useEffect, useState } from "react";
import { api, getToken } from "./client";
import type { ProgressState } from "./types";
export type { ProgressState };

const finished = (s: ProgressState) => !s.running && s.ok !== null;

function wsUrl(sessionId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/progress/${sessionId}?token=${encodeURIComponent(getToken() ?? "")}`;
}

export function watchProgress(
  sessionId: string,
  onState: (s: ProgressState) => void,
  opts: { pollMs?: number; wsFactory?: (url: string) => WebSocket; fetchState?: (sid: string) => Promise<ProgressState> } = {},
): () => void {
  const pollMs = opts.pollMs ?? 500;
  const make = opts.wsFactory ?? ((u: string) => new WebSocket(u));
  const fetchState = opts.fetchState ?? ((sid: string) => api.progress(sid));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ws: WebSocket | null = null;

  const poll = async () => {
    if (stopped) return;
    try {
      const s = await fetchState(sessionId);
      if (stopped) return;
      onState(s);
      if (finished(s)) { stopped = true; return; }
    } catch { /* el siguiente intento lo dirá */ }
    if (!stopped) timer = setTimeout(poll, pollMs);
  };
  const fallback = () => { if (!stopped && timer === null) void poll(); };

  try {
    ws = make(wsUrl(sessionId));
    ws.onmessage = (e) => {
      if (stopped) return;
      const s = JSON.parse(String(e.data)) as ProgressState;
      onState(s);
      if (finished(s)) { stopped = true; ws?.close(); }
    };
    ws.onerror = () => { ws = null; fallback(); };
    ws.onclose = () => { if (!stopped) { ws = null; fallback(); } };
  } catch {
    fallback();
  }
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try { ws?.close(); } catch { /* ya cerrado */ }
  };
}

export function useProgress(sessionId: string | null, active: boolean): ProgressState | null {
  const [state, setState] = useState<ProgressState | null>(null);
  useEffect(() => {
    if (!sessionId || !active) { setState(null); return; }
    return watchProgress(sessionId, setState);
  }, [sessionId, active]);
  return state;
}
```

`frontend/src/components/segmentation/SegmentProgress.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ProgressState } from "../../api/types";
import { ProgressBar } from "../ProgressBar";

/** Fase y porcentaje de la segmentación, con aviso cuando el servidor va lento. */
export function SegmentProgress({ state }: { state: ProgressState | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [state?.phase]);
  const pct = state ? Math.round(state.pct) : 0;
  return (
    <div style={{ marginTop: 18 }} aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", marginBottom: 6, letterSpacing: ".06em", textTransform: "uppercase" }}>
        <span>{state?.phase || "preparando"}</span>
        <span>{pct} %</span>
      </div>
      <ProgressBar value={state ? state.pct : undefined} />
      {slow && pct < 5 && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
          Tarda varios minutos en el servidor: la tubularidad se calcula por lonchas.
        </div>
      )}
    </div>
  );
}
```

`frontend/vite.config.ts`: el proxy de `/api` queda igual y se añade `"/ws": { target: backend, ws: true }`.

- [ ] **Step 4: Ejecutar** — `npx vitest run src/api/progress.test.ts && npx tsc -b` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/progress.ts frontend/src/api/progress.test.ts frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/components/segmentation/SegmentProgress.tsx frontend/vite.config.ts
git commit -m "El progreso llega por WebSocket y, si no pasa, por GET cada medio segundo"
```

---

### Task 9: El panel de segmentación: método, parámetros, progreso y cifras

**Files:**
- Create: `frontend/src/components/segmentation/TubularControls.tsx`, `frontend/src/components/segmentation/TubularControls.test.tsx`
- Modify: `frontend/src/components/segmentation/SegmentPanel.tsx`, `frontend/src/components/segmentation/SegmentPanel.test.tsx`, `frontend/src/api/types.ts` (`SegmentRequest`, `SegmentResult`)

**Interfaces:**
- Consumes: `useProgress`, `SegmentProgress` (Task 8); backend Task 5.
- Produces: `SegmentRequest` gana `method: "tubular" | "threshold"`, `reclaim_mm: number`, `half_resolution: boolean`; `full_resolution` se elimina del tipo y del panel. `SegmentResult` gana `method`, `reclaimed_mm3`, `vetoed_mm3`, `boundary_edges`, `components`, `seeds`, `fallback_note`, `phase_seconds`.
- `<TubularControls method reclaimMm onMethod onReclaim />`: grupo de dos opciones («Tubular (recomendado)», «Umbral clásico») y, solo en tubular, el deslizador «Recuperar pared y sacos» 0–5 mm (paso 0,5, por defecto 3) con su explicación.

- [ ] **Step 1: Tests que fallan**

```tsx
// frontend/src/components/segmentation/TubularControls.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TubularControls } from "./TubularControls";

describe("TubularControls", () => {
  it("muestra el deslizador solo en el método tubular", () => {
    const { rerender } = render(<TubularControls method="tubular" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.getByLabelText(/Recuperar pared y sacos/)).toBeInTheDocument();
    rerender(<TubularControls method="threshold" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.queryByLabelText(/Recuperar pared y sacos/)).toBeNull();
  });
  it("cambia de método y de radio", () => {
    const onMethod = vi.fn(); const onReclaim = vi.fn();
    render(<TubularControls method="tubular" reclaimMm={3} onMethod={onMethod} onReclaim={onReclaim} />);
    fireEvent.click(screen.getByRole("radio", { name: /Umbral clásico/ }));
    expect(onMethod).toHaveBeenCalledWith("threshold");
    fireEvent.change(screen.getByLabelText(/Recuperar pared y sacos/), { target: { value: "2" } });
    expect(onReclaim).toHaveBeenCalledWith(2);
  });
});
```

Añade a `SegmentPanel.test.tsx` (sigue el patrón del archivo, que mockea `api`):

```tsx
it("envía el método tubular por defecto y muestra las cifras de la malla", async () => {
  mockApi.segment.mockResolvedValue({
    mesh_url: "/data/sessions/s/meshes/vessel_tree.vtp?v=1", voxel_fraction: 0.01, strategy: "xa_band_pass", is_dsa: false,
    vertices: 70000, faces: 140000, downsample_factor: 1, kept_fraction: 0.36, fragments_removed: 0, largest_removed_mm3: 0,
    main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0, threshold_lower: 1470,
    method: "tubular", reclaimed_mm3: 1800.5, vetoed_mm3: 120.2, boundary_edges: 0, components: 1, seeds: 8,
    fallback_note: "", phase_seconds: { "tubularidad": 12.1, "superficie": 3.4, "guardado": 0.4 },
  });
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: /^Segmentar$/ }));
  await waitFor(() => expect(mockApi.segment).toHaveBeenCalled());
  expect(mockApi.segment.mock.calls[0][0]).toMatchObject({ method: "tubular", reclaim_mm: 3, half_resolution: false });
  expect(await screen.findByText(/Estanca/)).toBeInTheDocument();
  expect(screen.getByText(/1 pieza/)).toBeInTheDocument();
  expect(screen.getByText(/8 semillas/)).toBeInTheDocument();
});

it("enseña la nota cuando el método cae al umbral", async () => {
  mockApi.segment.mockResolvedValue({ ...baseResult, method: "tubular", fallback_note: "No se encontró ninguna semilla vascular ≥ 50 mm³ con este umbral: se usó la máscara de umbral rellena." });
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: /^Segmentar$/ }));
  expect(await screen.findByText(/ninguna semilla/)).toBeInTheDocument();
});
```

(`baseResult` es el objeto completo del test anterior; extráelo a una constante del archivo.)

- [ ] **Step 2: Ver que fallan** — `npx vitest run src/components/segmentation` → FAIL.

- [ ] **Step 3: Implementación**

`TubularControls.tsx`:

```tsx
import { useId } from "react";
import { Slider } from "../Slider";

export type SegmentMethod = "tubular" | "threshold";

/** Qué método segmenta, y cuánta pared y saco se recupera alrededor del tubo. */
export function TubularControls({ method, reclaimMm, onMethod, onReclaim }: {
  method: SegmentMethod; reclaimMm: number; onMethod: (m: SegmentMethod) => void; onReclaim: (mm: number) => void;
}) {
  const name = useId();
  const opt = (value: SegmentMethod, label: string, hint: string) => (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: method === value ? "var(--brand-subtle)" : "var(--card)", cursor: "pointer", flex: 1 }}>
      <input type="radio" name={name} value={value} checked={method === value} onChange={() => onMethod(value)} style={{ marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{hint}</span>
      </span>
    </label>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {opt("tubular", "Tubular (recomendado)", "Vasos macizos, hueso fuera por forma, sacos recuperados.")}
        {opt("threshold", "Umbral clásico", "Solo la banda de intensidad; deja láminas y cáscaras.")}
      </div>
      {method === "tubular" && (
        <div style={{ marginTop: 10 }}>
          <Slider label="Recuperar pared y sacos" min={0} max={5} step={0.5} value={reclaimMm} onChange={onReclaim} unit=" mm" />
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: -2, lineHeight: 1.45 }}>
            El filtro de tubularidad adelgaza la pared y no ve los sacos, que no son tubos. Este radio devuelve
            lo que queda a esa distancia del vaso; el hueso en forma de lámina no vuelve.
          </div>
        </div>
      )}
    </div>
  );
}
```

`SegmentPanel.tsx`:
- Estado: `method` (`"tubular"`), `reclaimMm` (3), `halfRes` (false; sustituye a `fullRes` y a su casilla, cuyo texto pasa a «Segmentar a media resolución (más rápido)» con la explicación invertida: «Rompe los vasos finos; úsalo solo si el servidor tarda demasiado»).
- `run()` envía `method, reclaim_mm: reclaimMm, half_resolution: halfRes` y ya no `full_resolution`; `compararTecho` envía `half_resolution` en vez de `full_resolution` (ajusta `CeilingCompareRequest` en `types.ts` y el backend acepta ambos como en Task 5; si `compare_ceiling` solo conoce `full_resolution`, manda `full_resolution: !halfRes` y dilo en el informe).
- Mientras `busy`, sustituye el bloque «Ejecutando Marching Cubes…» por `<SegmentProgress state={useProgress(sessionId, busy)} />`.
- En la tarjeta de resultado, cuando `segmentation.method === "tubular"`: `Metric` «Estanqueidad» con badge `boundary_edges === 0 ? ["Estanca", "success"] : ["Con bordes", "warning"]` y valor `${boundary_edges} aristas`; línea «`{components} pieza(s)` · `{seeds} semillas` · recuperados `{reclaimed_mm3}` mm³ · hueso vetado `{vetoed_mm3}` mm³»; «Volumen conservado» muestra `kept_fraction` con la etiqueta «del umbral»; `fallback_note` se muestra en una nota con borde `--warning` cuando no está vacía; `phase_seconds` se resume en una línea mono («tubularidad 12 s · superficie 3 s»).
- El deslizador «Limpieza» solo se muestra con el método `threshold` (la máscara tubular ya es un componente); «Suavizado» se mantiene para ambos.
- Copia: el texto de ayuda de arriba pasa a «Mueve los umbrales y observa la vista previa; el método tubular decide luego qué es vaso por su forma, no solo por su brillo.»

- [ ] **Step 4: Ejecutar** — `npx vitest run src/components/segmentation && npx tsc -b` → PASS.

- [ ] **Step 5: Comprobar en el navegador**

Con los servidores en marcha, entra en la sesión «Case 3 revision» (patients → Reanudar), ve a Segmentación, pulsa «Descartar malla y volver a los umbrales» y luego «Segmentar» con el método tubular: el progreso debe mostrar fases (`núcleo`, `tubularidad n/6`, `semillas`, …, `superficie`, `guardado`) y porcentaje; al terminar, la tarjeta dice «Estanca», `1 pieza`, y la malla del visor son tubos sin láminas. Guarda `segment-panel-tubular.png` en el directorio de trabajo del plan.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/segmentation frontend/src/api/types.ts
git commit -m "El panel elige el método tubular, enseña el progreso por fases y dice si la malla es estanca"
```

---

### Task 10: Render pulido en el visor 3D

**Files:**
- Modify: `frontend/src/vtk/MeshView.tsx`
- Modify: `frontend/src/vtk/Viewer.tsx` (la capa del saco pide contorno)

**Interfaces:**
- Produces: `MeshLayer` gana `silhouette?: boolean` (dibuja un segundo actor, casco invertido de la misma malla, en el color de la capa). `MeshView` aplica material y luces del diseño a todas las capas, activa depth peeling y conserva el resalte del candidato enfocado.

- [ ] **Step 1: Material y luces**

En `MeshView.tsx`, en el efecto de escena, tras crear el renderer:

```ts
// Dos luces que siguen la cámara: una principal y un relleno opuesto al 35 %.
// Con la única luz de cabeza de vtk.js el lado en sombra del vaso era negro y
// las bifurcaciones no se leían.
renderer.removeAllLights();
const key = vtkLight.newInstance({ lightType: "CameraLight", intensity: 1.0, position: [1, 1, 1] as never });
const fill = vtkLight.newInstance({ lightType: "CameraLight", intensity: 0.35, position: [-1, -0.5, -1] as never });
renderer.addLight(key); renderer.addLight(fill);
// Translucidez sin artefactos de orden al bajar la opacidad del árbol.
renderer.setUseDepthPeeling(true);
renderer.setMaximumNumberOfPeels(4);
renderer.setOcclusionRatio(0.0);
```

(`import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";`). Para cada capa, tras `prop.setInterpolationToPhong()`:

```ts
prop.setAmbient(0.15); prop.setDiffuse(0.85); prop.setSpecular(0.25); prop.setSpecularPower(24);
```

y el bloque de resalte del candidato enfocado se mantiene (sobrescribe ambient/diffuse/specular). Si `layer.silhouette`, crea un segundo `vtkActor` con el mismo mapper como casco invertido: `actor.setOrigin(centro de los bounds de la malla)`, `actor.setScale(1.04, 1.04, 1.04)`, `prop.setFrontfaceCulling(true)`, `setLighting(false)`, mismo color, opacidad `0.6 × opacidad de la capa`, `setPickable(false)`; guárdalo por id de capa para que el efecto de apariencia le cambie color y opacidad, y añádelo a `handles.current.actors` para que se limpie con la escena. Solo se ven sus caras traseras, y de ellas solo el anillo que sobresale del perfil: un borde fino. (La primera versión usaba un actor wireframe al 15 %, pero dibuja todas las aristas de todos los triángulos y en un saco de miles de puntos se apilaban en una red verde casi opaca. La opacidad sigue a la capa porque, con el saco translúcido, las caras traseras del casco se ven a través de él.)

En `Viewer.tsx`, la capa del saco (`id: "sac"`) pasa `silhouette: true`.

- [ ] **Step 2: Comprobar en el navegador**

Sesión «Case 3 revision», Morfometría con anotaciones: el árbol al 45 % no muestra caras que aparecen y desaparecen al rotar (depth peeling); el saco verde tiene un contorno fino; las bifurcaciones se leen en el lado en sombra. Captura `render-polish.png` en el directorio de trabajo del plan. `npx tsc -b` limpio; la consola sin errores nuevos. Si `setUseDepthPeeling` no existe en el renderer de vtk.js instalado, comprueba `node_modules/@kitware/vtk.js/Rendering/Core/Renderer.d.ts` (está en la versión 36.2.1) y, si el WebGL de la máquina no lo soporta, vtk.js lo ignora: dilo en el informe.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx
git commit -m "Dos luces, material sobrio, translucidez por depth peeling y contorno del saco"
```

---

### Task 11: Validación sobre Case 3 y ajuste acotado

**Files:**
- Create: `backend/scripts/validate_case3.py`
- Modify: `README.md` (sección «Segmentación»)

**Interfaces:**
- Produces: un script que, dada la ruta de un `_volume.npy` + `_volume_meta.json` y una banda, ejecuta `build_vascular_mask` + `mask_to_surface` + `_detect_hits` y escribe `validate_case3.json` con la tabla de la especificación (§4.5) y la posición/puesto de la lesión.

- [ ] **Step 1: Script**

```python
"""Valida la segmentación tubular sobre Case 3 y escribe las cifras del diseño.

Uso: python scripts/validate_case3.py <dir_meshes_con__volume.npy> <lower> [upper]
Escribe validate_case3.json al lado y lo imprime.
"""
import json, sys, time
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.vascular_mask import MaskParams, build_vascular_mask
from services.segmentation import mask_to_surface, surface_quality, decimate_to
from services.mesh_components import describe_components
from services.aneurysm_consensus import consensus
from routers.detect import _detector_for_modality

LESION = np.array([62.1, 63.7, 62.9])   # cand-002, confirmado por el usuario (aneurisma.png)

d = Path(sys.argv[1]); lower = float(sys.argv[2]); upper = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
meta = json.loads((d / "_volume_meta.json").read_text())
vol = np.load(d / "_volume.npy", mmap_mode="r"); sp = tuple(float(s) for s in meta["spacing"])
t = time.perf_counter()
mr = build_vascular_mask(np.asarray(vol, dtype=np.float32), sp, MaskParams(lower=lower, upper=upper))
t_mask = time.perf_counter() - t
t = time.perf_counter(); poly = mask_to_surface(mr.mask, sp); t_surf = time.perf_counter() - t
q = surface_quality(poly)
comps = describe_components(poly)
bone = [c for c in comps if c.thickness_mm > 3.0]
hits = consensus(decimate_to(poly, 40_000), _detector_for_modality(meta.get("modality", "XA")), top=5)
ranks = [i + 1 for i, h in enumerate(hits) if np.linalg.norm(np.array(h.position) - LESION) < 8.0]
out = {
  "boundary_edges": q["boundary_edges"], "aspect_ratio_median": q["aspect_ratio_median"],
  "components": q["components"], "bone_like_pieces": len(bone), "vertices": q["n_vertices"],
  "kept_fraction_of_threshold": mr.stats["kept_fraction"], "seeds": mr.stats["seeds"],
  "reclaimed_vox": mr.stats["reclaimed_vox"], "vetoed_vox": mr.stats["vetoed_vox"],
  "lesion_rank": ranks[0] if ranks else None, "candidates": [list(map(float, h.position)) for h in hits],
  "seconds": {"mask": round(t_mask, 1), "surface": round(t_surf, 1)},
}
(d / "validate_case3.json").write_text(json.dumps(out, indent=1)); print(json.dumps(out, indent=1))
```

- [ ] **Step 2: Ejecutar sobre Case 3**

Run: `cd backend && .venv\Scripts\python scripts\validate_case3.py data\sessions\c80edc28-f42d-40f6-b2e2-a882c84fbe02\meshes 1470`

Objetivos (spec §4.5): `boundary_edges == 0`, `bone_like_pieces == 0`, `aspect_ratio_median < 1.45`, `lesion_rank ≤ 3`, `seconds.mask + seconds.surface < 40` en el equipo de desarrollo. Referencia del prototipo: 40 aristas antes del cierre de huecos, 152 piezas antes de quitar islas, 1 semilla-componente, lesión conservada al 99 %.

Si un objetivo no se cumple, el ajuste permitido es SOLO sobre estos mandos, uno cada vez, anotando cada intento en el informe: `fill_holes_mm` (4 → 6), `min_island_mm3` (2 → 5), `reclaim_mm` (3 → 2,5 o 3,5), `gate_pctl` (60 → 55 o 65). Los valores finales se escriben como valores por defecto en `MaskParams` / `mask_to_surface` y en la sección Global Constraints de este plan (edita el plan y dilo en el commit).

- [ ] **Step 3: README**

En `README.md`, tras la tabla de servicios, añade una sección «Segmentación tubular» de un párrafo: qué hace (núcleo relleno, tubularidad, semillas, recuperación con veto de lámina, superficie estanca), qué mide (aristas de borde, piezas, semillas) y la cifra de Case 3 obtenida (aristas, piezas, tiempo).

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/validate_case3.py README.md docs/superpowers/plans/2026-09-25-segmentacion-tubular.md
git commit -m "Validación de la segmentación tubular sobre Case 3, con las cifras en el README"
```

---

### Task 11 bis: Ranking del detector sobre mallas tubulares y presupuesto de memoria autodetectado

(Añadida por el controlador durante la ejecución; ver ledger. Sustituye la parte de «detección» de los objetivos §4.5 que la Task 11 midió pero no ajustó.)

**Files:**
- Modify: `backend/services/aneurysm_consensus.py` (orden de la lista corta) y/o `backend/routers/detect.py` (`_detect_hits`) — solo lo necesario para el ranking.
- Modify: `backend/routers/segment.py` (presupuesto de memoria por defecto).
- Modify: `backend/test_detector_case3.py`, `backend/test_consensus_and_plane.py`, `backend/test_segment_tubular.py` (tests nuevos).
- Modify: `docs/superpowers/plans/2026-09-25-segmentacion-tubular.md` (añadir esta tarea tras la Task 11, con este texto), `README.md` (una línea sobre el presupuesto autodetectado).

**Interfaces:**
- Consumes: `scripts/validate_case3.py` (Task 11) y su JSON con `lesion_rank`, puestos por canal y top-5; `_detect_hits(poly, modality, ...)` (Task 6: curvatura sobre la malla completa, calibre/cociente sobre la copia decimada); `consensus(...)` con sus dos kwargs opcionales.
- Produces: sobre la malla tubular nativa de Case 3 con «solo el árbol», la lesión confirmada (62.1, 63.7, 62.9) mm queda en `lesion_rank ≤ 3`; sobre la malla de umbral antigua (12,8 k vértices) el resultado no empeora (5 hits, lesión ≤ 2.º, canales `calibre`/`cociente` presentes). `PROSPECTIVE_MEM_BUDGET_MB` sigue mandando si está definida; si no, el presupuesto es el 70 % de la RAM disponible detectada (Linux `/proc/meminfo` MemAvailable; Windows `GlobalMemoryStatusEx` vía `ctypes`; si nada funciona, 1400 MB).

**Punto de partida (Task 11, malla tubular nativa con relleno de borde y DecimatePro 0,45, ≈107 k vértices):** con DecimatePro 0,45 la lesión cae al puesto 13 en la lista fusionada (12 con «solo el árbol»; por canal curvatura 6.ª y cociente 6.ª) (con quadric 0,6 era 9.ª / 8.ª con «solo el árbol»; por canal, curvatura 4.ª y cociente 5.ª, el calibre no la encuentra), y la detección tarda 19 s porque la curvatura corre sobre los 107 k vértices completos. `consensus` ordena por el mejor puesto en cualquier canal, y los hits de calibre/cociente de los puestos 1–3 son placas o troncos, no sacos. Cifras completas y top-10 en el `validate_case3.json` que la Task 11 dejó en el scratchpad (`C:\Users\segur\AppData\Local\Temp\claude\C--Users-segur-Documents-WORKS-Uninavarra-ProspectiveWeb\aaa564b8-bcfc-4386-9c86-ac33e528fc0a\scratchpad\`) y en `task-11-report.md`.

- [ ] **Step 1: Test que falla** — en `test_detector_case3.py`, usando el fixture de Case 3 y la malla tubular nativa que produce `build_vascular_mask` + `mask_to_surface` (o la guardada por `validate_case3.py` en el scratchpad si existe), asserta `lesion_rank ≤ 3` con `main_tree_only`. En `test_consensus_and_plane.py`, un test sintético que reproduzca la situación (hit de curvatura en puesto 4 de su canal frente a tres hits geométricos sin apoyo de curvatura) y asserta el nuevo orden. El test de la malla antigua ya existe: debe seguir verde.

- [ ] **Step 2: Diagnóstico antes de tocar nada** — con `validate_case3.py`, anotar para cada hit del top-10: posición, canales, puesto por canal, y si coincide con la lesión (< 8 mm). Escribirlo en el informe.

- [ ] **Step 3: Cambio de ranking** — elegir UNA de estas estrategias, justificando con las cifras del paso 2, y aplicarla con un comentario WHY en español:
  a) acuerdo entre canales: un hit apoyado por ≥ 2 canales (dentro de un radio de fusión) sube por delante de los apoyados por uno solo; entre iguales, mejor puesto;
  b) cuota por canal: la lista corta reserva los k mejores de cada canal (k = 2) antes de rellenar por puesto global;
  c) veto geométrico de los hits de calibre/cociente cuya vecindad en la malla es plana (relación de aspecto del parche o curvatura media baja).
  Además (obligatorio, independiente de la estrategia): en `_detect_hits`, cuando la malla supera 80 000 vértices la curvatura corre sobre una copia `decimate_to(poly, 80_000)` (quadric) y los parches de región se recortan de la malla completa por proximidad o se dejan como están si la transferencia es imprecisa — anotar cuál; objetivo: detección ≈ 7–8 s como en la Task 6.
  Prohibido: reentrenar o cambiar los parámetros del detector de curvatura, o tocar la segmentación.

- [ ] **Step 4: Verificar** — `validate_case3.py` sobre Case 3 (nativa, árbol principal y completa): `lesion_rank ≤ 3` en la de árbol principal; informar las tres. La malla antigua de 12,8 k no empeora. `pytest test_detector_case3.py test_consensus_and_plane.py test_detect_diagnostics.py test_morphometry_sac.py test_neck_plane_feedback.py` verde.

- [ ] **Step 5: Presupuesto de memoria autodetectado** — en `routers/segment.py`, función `_memory_budget_bytes()` con la regla de arriba (env → detección → 1400 MB), comentario WHY (en el equipo del usuario, 1400 MB fijos forzaban media resolución en Case 3 y escondían el resultado nativo; en Lightsail de 2 GB la detección da ≈1,2–1,4 GB disponibles y el 70 % sigue forzando media resolución, que es lo correcto allí). Tests en `test_segment_tubular.py`: env manda; sin env y con detección monkeypatched a 8 GB → no se fuerza; a 1,5 GB → se fuerza; detección que falla → 1400 MB.

- [ ] **Step 6: Plan, README y commit** — añadir esta tarea al plan tras la Task 11; una línea en el README. Commit: «La lista corta prioriza los candidatos con apoyo de varios canales, y el presupuesto de memoria se detecta en el equipo».

---

### Task 12: Cierre: comprobación completa y lista manual

- [ ] **Step 1: Comprobación completa**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q -rf --no-header -p no:cacheprovider
```

Expected: frontend en verde y chunk de entrada sin vtk.js; backend sin fallos NUEVOS respecto a la lista base (26 preexistentes: catálogo de clips vacío, fotos de usuario, lista blanca de auth, corredor/oclusión del trabajo remoto). Lista cualquier id nuevo.

- [ ] **Step 2: Lista manual con Case 3 (anótala en el mensaje del commit de cierre)**

1. Segmentar (tubular, resolución completa): progreso por fases visible; al acabar, «Estanca», 1 pieza; la malla son tubos macizos sin láminas; el tiempo total en el equipo.
2. Detección: la lesión (x 62 · y 64 · z 63 mm) aparece en la lista corta con puesto ≤ 3 y los canales `calibre`/`cociente` presentes.
3. Morfometría: marcar cuello y ápice sobre el saco y «Medir saco cerrado» funciona a la primera; si el punto queda 1 mm fuera, el reintento lo corrige (revisar `morpho.neck_shift_mm` en `state.txt`).
4. Umbral clásico: sigue funcionando y enseña «Limpieza».
5. Media resolución: la casilla acelera y el resultado dice `1/2`.
6. Preprocesar (suavizado σ 0,5) y volver a segmentar: la malla cambia y el rango de intensidad de la meta no conserva valores viejos.
7. Render: sin caras parpadeantes al rotar el árbol translúcido; contorno del saco visible.
8. Sin WebSocket (bloquea `/ws` en DevTools → Network → Block request URL): el progreso sigue avanzando por GET.

- [ ] **Step 3: Commit de cierre** (solo si algún archivo cambió en la comprobación; si no, el mensaje de la lista va en el commit de Task 11)
