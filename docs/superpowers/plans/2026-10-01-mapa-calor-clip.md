# Mapa de calor del clip — plan de implementación (subproyecto C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al colocar un clip, pintar el saco y el anillo de cuello según lo que el clip cubre y la presión estimada que ejerce, y decir si la hoja, la apertura y la fuerza bastan, siempre etiquetado como estimación geométrica.

**Architecture:** Un servicio nuevo `backend/services/clip_field.py` toma el saco cerrado, un anillo de vaso alrededor del cuello y la geometría real de cada clip en su pose; clasifica cada vértice (cubierto · cuello residual · no alcanzado · fuera de evaluación) leyendo el marco de las hojas de la propia malla del clip con `clip_animation.jaw_geometry`, calcula la presión `F_mín / A_contacto` y la compara con `clip_selection.force_window(neck_mm)`, y escribe UN `.vtp` con tres arrays de puntos: `coverage` (uint8), `pressure_g_mm2` (float32) y `colors` (uint8 RGB). Un endpoint `POST /api/clips/field/{sid}` devuelve la URL y un resumen con veredicto y criterios (`clip_selection.evaluate_clip`). En el frontend, `MeshLayer` gana `scalars` (color directo por vértice), el visor sustituye la capa del saco por el campo cuando hay resultado, dibuja la leyenda y ofrece el interruptor «CALOR»; el panel de clips pide el campo tras colocar (y con debounce de 250 ms al mover) y enseña la tarjeta de idoneidad.

**Tech Stack:** FastAPI + VTK 9.7 + NumPy (backend, pytest); React 19 + vtk.js 36.2.1 + vitest (frontend). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-25-visor-segmentacion-clip-design.md`, sección 5 («Subproyecto C — Mapa de calor del clip»). Desviaciones argumentadas aquí: (a) los colores se calculan en el servidor y viajan en el `.vtp` (§5.3 ponía el mapa de color en `MeshView`): el frontend solo activa el color por escalares y la leyenda sale del resumen, y la asignación de colores se prueba en pytest; (b) «gris rayado» pasa a gris plano, un rayado no es representable sobre una malla; (c) el marco de las hojas se lee de la malla con `jaw_geometry` en vez de asumir los paralelepípedos de `make_clip_shaped`, porque las piezas NAVARRO™ tienen la bisagra en el centro; (d) un clip importado sin ficha (`custom:`) no tiene fuerza y el resumen lo dice, en lugar de tomar la del clip a fabricar (§5.2): el clip a fabricar ya entra con ficha por su id NAVARRO™.

## Global Constraints

- Categorías (`coverage`, uint8): 0 = fuera de evaluación, 1 = cubierto, 2 = cuello residual, 3 = no alcanzado. Colores RGB 0–255: cubierto según presión (insuficiente `[59,130,246]` azul · óptima `[34,197,94]` verde · aceptable `[245,158,11]` ámbar · exceso `[239,68,68]` rojo · sin área o sin fuerza `[148,163,184]`), residual `[217,70,239]` magenta, no alcanzado `[107,114,128]` gris, fuera de evaluación `[120,112,124]`.
- Anillo de vaso: puntos del árbol a menos de `1.5 × neck_mm` del origen del cuello y del lado del vaso respecto al plano de cuello; radio acotado a [3, 12] mm.
- Marco de las hojas (leído de la malla): `l` a lo largo de la hoja desde la bisagra, `g` a través de la mordaza, `d` profundidad (orientada hacia el domo con el eje del cuello). Banda de cuello: |d| ≤ `H/2 + 0.6` mm (H = alto de hoja). Anchura de cierre `close_half = max(jaw/2 + w + 0.3, neck_mm/2 + 0.3)`: las hojas pinzan todo el cuello que queda a su alcance, no solo la ranura entre ellas. Dentro de la banda y con |g| ≤ close_half: `0 ≤ l ≤ L` → cubierto (anillo de vaso incluido: es lo que pinzan las hojas y lo que cuenta el área de presión); `l < 0` (detrás de la bisagra) → residual y `l > L` → no alcanzado, ambos SOLO dentro del disco del cuello: distancia en su plano `|rel − (rel·n) n| ≤ neck_mm/2 + 0.6` con `rel = p − neck_origin` y `n` el eje del cuello unitario (fuera del disco la banda corta la arteria madre, que no es cuello). Fuera de la banda nada se evalúa: con el cuello pinzado en todo su ancho la cúpula queda excluida entera. Todo lo demás → fuera de evaluación.
- Fuerza: el MÍNIMO de la banda de catálogo (`ClipSpec.force_band[0]`, una propiedad); si el clip no tiene ficha (importado), fuerza 0 y el resumen lo dice. `force_provisional` se propaga. Presión en g/mm² = `Σ F_mín / A_contacto`, con `A_contacto` = suma de áreas de los triángulos cuyos tres vértices son cubiertos. Ventana = `force_window(neck_mm) / A_contacto`.
- Veredicto de presión: `sin_contacto` (A = 0) · `sin_fuerza` (A > 0 pero fuerza 0: clip importado sin ficha) · `insuficiente` (< acceptable_lo) · `optima` · `aceptable` · `exceso` (> acceptable_hi). Veredicto global `ok|warn|fail`: `fail` si algún criterio falla, si la presión es `insuficiente`/`exceso`/`sin_contacto` o si `covered_pct < 50`; `warn` si algún criterio avisa, presión `aceptable`/`sin_fuerza` (lo desconocido no es malo) o `residual_pct > 10`; si no, `ok`. Los criterios son los del primer clip colocado CON ficha. Si hay clips con y sin ficha, la nota dice que la presión solo cuenta la fuerza de los que tienen ficha.
- Texto fijo en el resumen y en la tarjeta: «Estimación geométrica: fuerza de catálogo repartida sobre el área de contacto; no modela pared, deformación ni deslizamiento».
- Endpoint `POST /api/clips/field/{sid}` con cuerpo `ClipPlanRequest`; 404 sin sesión; 409 sin saco aislado («Marca el plano del cuello en Morfometría…»), sin cuello medido (`neck_mm ≤ 0.1`) o sin colocaciones. Escribe `meshes/clip_field.vtp`; URL con `?v=<ms>`.
- Frontend: la capa del campo sustituye a la del saco mientras `showClipField` (por defecto `true`) y hay resultado; al limpiar clips o cambiar de sesión el campo se retira; debounce de 250 ms al cambiar posición/giro con un plan vigente.
- Copia y comentarios WHY en español; `pytest test_clip_field.py` y vitest en verde; `tsc` limpio; sin fallos nuevos frente a la línea base (37 ids en el ledger de ejecución); sin dependencias nuevas; nunca se commitea `frontend/package-lock.json`.

## Review Focus

1. Sesión con candidato pero sin saco aislado (solo cúpula del detector): el endpoint responde 409 con la indicación de marcar el cuello, nunca un 500 → test en Task 3.
2. Clip colocado lejos del cuello (ningún vértice cubierto): área 0, presión «sin contacto», sin división por cero, campo pintado residual/no alcanzado → test en Task 2.
3. Clip NAVARRO™ con bisagra en el centro de la pieza: el marco se lee de la malla, la cobertura sale igual que con el sintético equivalente → test en Task 1 (malla con bisagra centrada).
4. Cuello ancho (neck_mm 12) → el anillo no se traga medio árbol: radio acotado a 12 mm; tiempo < 1 s sobre la malla de Case 3 → test de cota en Task 1, medición en Task 7.
5. Limpiar clips o reanudar otra sesión con un campo en pantalla: la capa desaparece y la leyenda también → test en Task 4 (store) y Task 5 (visor).

---

### Task 1: Geometría del campo: anillo, marco de hojas y clasificación por vértice

**Files:**
- Create: `backend/services/clip_field.py`, `backend/test_clip_field.py`

**Interfaces:**
- Consumes: `services.devices.pose_transform(position, normal, rotation_deg) -> vtkTransform`, `services.devices.make_clip_shaped(...)`, `services.devices.apply_transform`, `services.clip_animation.jaw_geometry(poly) -> {"open_axis", "long_axis", "hinge", "jaw_direction", ...}`.
- Produces:

```python
RING_RATIO = 1.5; RING_MIN_MM = 3.0; RING_MAX_MM = 12.0
DEPTH_TOL_MM = 0.6; GAP_TOL_MM = 0.3
COV_NONE, COV_COVERED, COV_RESIDUAL, COV_UNREACHED = 0, 1, 2, 3

@dataclass(frozen=True)
class BladeFrame:
    hinge: np.ndarray        # punto (3,) en coordenadas de mundo
    long_axis: np.ndarray    # unitario, de la bisagra a la punta
    open_axis: np.ndarray    # unitario, de una hoja a la otra
    depth_axis: np.ndarray   # unitario = long × open
    length_mm: float; half_gap_mm: float; half_height_mm: float; close_half_mm: float

def vessel_ring(vessel: vtk.vtkPolyData, neck_origin, neck_axis, neck_mm: float) -> vtk.vtkPolyData
def blade_frame(clip_world: vtk.vtkPolyData, *, length_mm: float, blade_width_mm: float, blade_height_mm: float, neck_mm: float, neck_axis, pose: vtk.vtkTransform, jaw_mm: float = 1.2) -> BladeFrame   # pose OBLIGATORIA (el marco se lee en el sistema local del clip); depth_axis orientado hacia el domo (dot con neck_axis > 0)
def classify(points: np.ndarray, frame: BladeFrame, *, neck_origin, neck_axis, neck_mm: float) -> np.ndarray   # (N,) uint8 por vértice para UN clip; residual/no alcanzado solo en el disco del cuello
def combine_coverage(per_clip: list[np.ndarray]) -> np.ndarray      # cubierto gana a residual gana a no alcanzado gana a 0
def field_mesh(sac: vtk.vtkPolyData, ring: vtk.vtkPolyData) -> vtk.vtkPolyData   # append + limpieza, conserva triángulos
```

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_clip_field.py
"""Mapa de calor del clip: anillo, marco de hojas y clasificación."""
from __future__ import annotations

import numpy as np
import vtk
from vtkmodules.util import numpy_support as ns

from services import devices
from services.clip_field import (
    COV_COVERED, COV_NONE, COV_RESIDUAL, COV_UNREACHED, RING_MAX_MM, BladeFrame,
    blade_frame, classify, combine_coverage, field_mesh, vessel_ring,
)

RADIO = 5.0   # saco esférico de 10 mm centrado en (0,0,RADIO): el cuello está en z = 0


def _esfera(r: float, centro=(0.0, 0.0, 0.0), res: int = 48) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetRadius(r); s.SetCenter(*centro)
    s.SetThetaResolution(res); s.SetPhiResolution(res); s.Update()
    return s.GetOutput()


def _saco() -> vtk.vtkPolyData:
    return _esfera(RADIO, (0.0, 0.0, RADIO))


def _tubo(radio: float = 2.0, largo: float = 40.0) -> vtk.vtkPolyData:
    """Vaso padre a lo largo de X, pegado al cuello por debajo (z < 0)."""
    c = vtk.vtkCylinderSource(); c.SetRadius(radio); c.SetHeight(largo); c.SetResolution(48); c.Update()
    t = vtk.vtkTransform(); t.Translate(0.0, 0.0, -radio); t.RotateZ(90.0)   # eje del cilindro (Y) → X
    return devices.apply_transform(c.GetOutput(), t)


def _puntos(poly: vtk.vtkPolyData) -> np.ndarray:
    return ns.vtk_to_numpy(poly.GetPoints().GetData()).astype(float)


def _clip_en_cuello(largo_hoja: float, rot_deg: float = 0.0, desplaza=(0.0, 0.0, 0.0)) -> vtk.vtkPolyData:
    """Clip recto cerrado sobre el cuello (plano z = 0): hojas en el plano, +Z normal."""
    local = devices.make_clip_shaped(largo_hoja, 0.5, 1.4, "STRAIGHT")
    t = devices.pose_transform((desplaza[0], desplaza[1], desplaza[2]), (0.0, 0.0, 1.0), rot_deg)
    return devices.apply_transform(local, t)


def _marco(clip_world: vtk.vtkPolyData, largo_hoja: float, neck_mm: float = 6.0) -> BladeFrame:
    return blade_frame(clip_world, length_mm=largo_hoja, blade_width_mm=0.5, blade_height_mm=1.4,
                       neck_mm=neck_mm, neck_axis=(0.0, 0.0, 1.0))


class TestAnillo:
    def test_el_anillo_queda_cerca_del_cuello_y_del_lado_del_vaso(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        p = _puntos(ring)
        assert len(p) > 50
        assert np.all(np.linalg.norm(p, axis=1) <= 1.5 * 6.0 + 1e-6)
        assert np.all(p[:, 2] <= 1e-6)               # nada del lado del saco

    def test_el_radio_se_acota_en_cuellos_anchos(self):
        ring = vessel_ring(_tubo(largo=80.0), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 12.0)
        p = _puntos(ring)
        assert np.all(np.linalg.norm(p, axis=1) <= RING_MAX_MM + 1e-6)


class TestMarco:
    def test_el_marco_se_lee_de_la_malla_del_clip(self):
        f = _marco(_clip_en_cuello(10.0), 10.0)
        assert abs(abs(f.long_axis[0]) - 1.0) < 1e-6          # hojas a lo largo de X
        assert abs(abs(f.open_axis[1]) - 1.0) < 1e-6          # se abren en Y
        assert f.depth_axis[2] > 0.99                          # profundidad = normal, hacia el domo (+Z)
        assert f.length_mm == 10.0 and abs(f.half_height_mm - 0.7) < 1e-9
        assert abs(f.half_gap_mm - (0.6 + 0.5)) < 1e-9        # jaw/2 + width
        # Las hojas cerradas colapsan todo el ancho del cuello que alcanzan: medio cuello
        # más la holgura, no una fracción menor que dejaría fuera el borde del contorno.
        assert abs(f.close_half_mm - (6.0 / 2 + 0.3)) < 1e-9   # manda medio cuello sobre la ranura

    def test_girar_el_clip_gira_el_marco(self):
        f = _marco(_clip_en_cuello(10.0, rot_deg=90.0), 10.0)
        assert abs(abs(f.long_axis[1]) - 1.0) < 1e-6

    def test_una_pieza_con_bisagra_en_el_centro_da_el_mismo_marco(self):
        # Las piezas NAVARRO™ llevan el cuerpo detrás de la bisagra: el marco debe
        # leer la bisagra donde empieza el pasillo entre hojas, no en el borde de la malla.
        clip = _clip_en_cuello(10.0)
        cuerpo = vtk.vtkCubeSource(); cuerpo.SetXLength(8.0); cuerpo.SetYLength(3.0); cuerpo.SetZLength(1.4)
        cuerpo.SetCenter(-5.0 - 4.0, 0.0, 0.0); cuerpo.Update()     # pegado detrás de la bisagra (x = −5)
        con_cuerpo = devices.combine([clip, cuerpo.GetOutput()])
        f = _marco(con_cuerpo, 10.0)
        assert abs(f.hinge[0] - (-5.0)) < 0.6
        assert f.long_axis[0] > 0.99                           # apunta a la punta (+X)


class TestClasificacion:
    def _anillo_cuello(self) -> np.ndarray:
        """Puntos del contorno del cuello: círculo de radio 3 en z = 0, más la cúpula."""
        ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
        cuello = np.stack([3.0 * np.cos(ang), 3.0 * np.sin(ang), np.zeros_like(ang)], axis=1)
        cupula = np.array([[0.0, 0.0, 8.0], [1.0, 1.0, 9.0]])
        return np.vstack([cuello, cupula])

    def test_hoja_larga_cubre_todo_el_contorno(self):
        # Hoja de 12 mm centrada sobre un cuello de 6: ≥ cuello + 1 mm → 100 % (spec §5.4).
        cov = classify(self._anillo_cuello(), _marco(_clip_en_cuello(12.0), 12.0))
        assert np.all(cov[:72] == COV_COVERED)
        assert np.all(cov[72:] == COV_NONE)                       # la cúpula sobre la hoja no se evalúa

    def test_hoja_corta_deja_cuello_no_alcanzado_mas_alla_de_la_punta(self):
        # Hoja de 4 mm con la bisagra en x = −3: la punta llega a x = +1.
        cov = classify(self._anillo_cuello(), _marco(_clip_en_cuello(4.0, desplaza=(-1.0, 0.0, 0.0)), 4.0))
        pts = self._anillo_cuello()[:72]
        assert np.all(cov[:72][pts[:, 0] > 1.3] == COV_UNREACHED)
        assert np.all(cov[:72][(pts[:, 0] > -2.7) & (pts[:, 0] < 0.7)] == COV_COVERED)

    def test_lo_que_queda_detras_de_la_bisagra_es_cuello_residual(self):
        # Bisagra en x = −1: el contorno con x < −1,3 queda fuera del alcance de la hoja.
        cov = classify(self._anillo_cuello(), _marco(_clip_en_cuello(4.0, desplaza=(1.0, 0.0, 0.0)), 4.0))
        pts = self._anillo_cuello()[:72]
        assert np.all(cov[:72][pts[:, 0] < -1.3] == COV_RESIDUAL)

    def test_la_cupula_mas_alla_de_la_punta_es_no_alcanzada(self):
        cov = classify(np.array([[5.0, 0.0, 4.0], [-1.0, 0.0, 4.0]]), _marco(_clip_en_cuello(4.0, desplaza=(-1.0, 0.0, 0.0)), 4.0))
        assert cov.tolist() == [COV_UNREACHED, COV_NONE]

    def test_lejos_de_la_mordaza_no_se_evalua(self):
        # Pared del vaso en la banda pero a 4 mm de la mordaza (> cuello/2 + 0,3).
        cov = classify(np.array([[0.0, 4.0, 0.0]]), _marco(_clip_en_cuello(12.0), 12.0))
        assert cov.tolist() == [COV_NONE]

    def test_un_clip_lejos_no_cubre_nada(self):
        cov = classify(self._anillo_cuello(), _marco(_clip_en_cuello(12.0, desplaza=(0.0, 0.0, 6.0)), 12.0))
        assert (cov == COV_COVERED).sum() == 0

    def test_combinar_clips_toma_la_mejor_categoria(self):
        a = np.array([COV_NONE, COV_RESIDUAL, COV_UNREACHED, COV_COVERED], dtype=np.uint8)
        b = np.array([COV_UNREACHED, COV_COVERED, COV_NONE, COV_RESIDUAL], dtype=np.uint8)
        assert combine_coverage([a, b]).tolist() == [COV_UNREACHED, COV_COVERED, COV_UNREACHED, COV_COVERED]


class TestMallaDelCampo:
    def test_une_saco_y_anillo_y_sigue_siendo_triangulos(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        m = field_mesh(_saco(), ring)
        assert m.GetNumberOfPoints() >= _saco().GetNumberOfPoints() + 50
        assert m.GetNumberOfPolys() > 0
        ids = vtk.vtkIdList()
        for i in range(0, m.GetNumberOfPolys(), max(1, m.GetNumberOfPolys() // 20)):
            m.GetCellPoints(i, ids); assert ids.GetNumberOfIds() == 3
```

- [ ] **Step 2: Ejecutar y ver fallar** → `cd backend && ./.venv/Scripts/python.exe -m pytest test_clip_field.py -v` FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```python
# backend/services/clip_field.py
"""Mapa de calor del clip: qué cubre, qué deja y qué presión estima.

ESTIMACIÓN GEOMÉTRICA. La fuerza de catálogo se reparte sobre el área de
contacto; no se modela pared, deformación ni deslizamiento. La simulación
mecánica vendrá después y sustituirá los escalares sin tocar el visor.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import vtk
from vtkmodules.util import numpy_support as ns

RING_RATIO = 1.5
RING_MIN_MM = 3.0
RING_MAX_MM = 12.0
DEPTH_TOL_MM = 0.6
GAP_TOL_MM = 0.3

COV_NONE, COV_COVERED, COV_RESIDUAL, COV_UNREACHED = 0, 1, 2, 3


@dataclass(frozen=True)
class BladeFrame:
    hinge: np.ndarray
    long_axis: np.ndarray
    open_axis: np.ndarray
    depth_axis: np.ndarray
    length_mm: float
    half_gap_mm: float
    half_height_mm: float


def _points(poly: vtk.vtkPolyData) -> np.ndarray:
    return ns.vtk_to_numpy(poly.GetPoints().GetData()).astype(float)


def vessel_ring(vessel: vtk.vtkPolyData, neck_origin, neck_axis, neck_mm: float) -> vtk.vtkPolyData:
    """El vaso alrededor del cuello: dentro de 1,5 × cuello y del lado de la arteria.

    Acotado: un cuello ancho no debe tragarse medio árbol, y uno diminuto debe
    dejar algo de pared que pintar.
    """
    o = np.asarray(neck_origin, dtype=float)
    n = np.asarray(neck_axis, dtype=float); n = n / (np.linalg.norm(n) or 1.0)
    radius = float(min(RING_MAX_MM, max(RING_MIN_MM, RING_RATIO * float(neck_mm))))
    sphere = vtk.vtkSphere(); sphere.SetCenter(*o); sphere.SetRadius(radius)
    inside = vtk.vtkClipPolyData(); inside.SetInputData(vessel); inside.SetClipFunction(sphere)
    inside.InsideOutOn(); inside.Update()
    # El plano de cuello separa saco y vaso: con la normal hacia el domo, lo que
    # queda «detrás» es la arteria.
    plane = vtk.vtkPlane(); plane.SetOrigin(*o); plane.SetNormal(*n)
    below = vtk.vtkClipPolyData(); below.SetInputData(inside.GetOutput()); below.SetClipFunction(plane)
    below.InsideOutOn(); below.Update()
    return below.GetOutput()


def blade_frame(clip_world: vtk.vtkPolyData, *, length_mm: float, blade_width_mm: float,
                blade_height_mm: float, neck_mm: float, neck_axis, jaw_mm: float = 1.2) -> BladeFrame:
    """El marco de las hojas, leído de la malla colocada.

    `jaw_geometry` ya sabe dónde empieza el pasillo entre hojas y hacia dónde
    apunta: sirve igual para el clip sintético (bisagra en el extremo) y para la
    pieza NAVARRO™ (bisagra a media pieza, cuerpo detrás).
    """
    from services.clip_animation import jaw_geometry
    g = jaw_geometry(clip_world)
    long_axis = np.asarray(g["long_axis"], dtype=float)
    # `jaw_direction` dice hacia qué lado del eje largo está la punta.
    if float(np.dot(long_axis, np.asarray(g["jaw_direction"], dtype=float))) < 0:
        long_axis = -long_axis
    long_axis /= (np.linalg.norm(long_axis) or 1.0)
    open_axis = np.asarray(g["open_axis"], dtype=float); open_axis /= (np.linalg.norm(open_axis) or 1.0)
    depth_axis = np.cross(long_axis, open_axis); depth_axis /= (np.linalg.norm(depth_axis) or 1.0)
    # La profundidad se orienta hacia el domo: así «más allá de la punta» distingue
    # saco (d > 0) de arteria (d < 0).
    if float(np.dot(depth_axis, np.asarray(neck_axis, dtype=float))) < 0:
        depth_axis = -depth_axis
    half_gap = float(jaw_mm) / 2.0 + float(blade_width_mm)
    return BladeFrame(
        hinge=np.asarray(g["hinge"], dtype=float), long_axis=long_axis, open_axis=open_axis,
        depth_axis=depth_axis, length_mm=float(length_mm), half_gap_mm=half_gap,
        half_height_mm=float(blade_height_mm) / 2.0,
        # Las hojas cerradas pinzan el cuello entero que alcanzan, no solo la
        # ranura: todo el ancho del cuello (medio cuello + holgura) se colapsa.
        close_half_mm=max(half_gap + GAP_TOL_MM, float(neck_mm) / 2.0 + GAP_TOL_MM),
    )


def classify(points: np.ndarray, frame: BladeFrame) -> np.ndarray:
    """Categoría por vértice para UN clip (ver constantes COV_*)."""
    rel = np.asarray(points, dtype=float) - frame.hinge
    l = rel @ frame.long_axis            # a lo largo de la hoja, desde la bisagra
    g = rel @ frame.open_axis            # a través de la mordaza
    d = rel @ frame.depth_axis           # profundidad respecto al plano de las hojas
    out = np.full(len(points), COV_NONE, dtype=np.uint8)
    band = np.abs(d) <= frame.half_height_mm + DEPTH_TOL_MM
    dome_side = d > frame.half_height_mm + DEPTH_TOL_MM
    near = np.abs(g) <= frame.close_half_mm
    behind = l < -GAP_TOL_MM
    beyond = l > frame.length_mm + GAP_TOL_MM
    within = ~behind & ~beyond
    out[band & near & within] = COV_COVERED
    out[band & near & behind] = COV_RESIDUAL
    out[(band | dome_side) & near & beyond] = COV_UNREACHED
    return out


_RANK = {COV_NONE: 0, COV_UNREACHED: 1, COV_RESIDUAL: 2, COV_COVERED: 3}


def combine_coverage(per_clip: list[np.ndarray]) -> np.ndarray:
    """Con varios clips manda la mejor categoría de cada vértice."""
    rank = np.vectorize(_RANK.get)
    best = per_clip[0].astype(np.uint8)
    for cov in per_clip[1:]:
        take = rank(cov) > rank(best)
        best = np.where(take, cov, best).astype(np.uint8)
    return best


def field_mesh(sac: vtk.vtkPolyData, ring: vtk.vtkPolyData) -> vtk.vtkPolyData:
    """Saco + anillo en una sola malla de triángulos (lo que se pinta)."""
    app = vtk.vtkAppendPolyData(); app.AddInputData(sac); app.AddInputData(ring); app.Update()
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(app.GetOutput()); tri.Update()
    clean = vtk.vtkCleanPolyData(); clean.SetInputData(tri.GetOutput()); clean.Update()
    return clean.GetOutput()
```

Nota: si `jaw_geometry` devuelve `long_axis`/`open_axis` como listas o con otra convención de signo, adapta `blade_frame` para que los tests del marco pasen y documenta en el informe lo que devuelve exactamente (lee `services/clip_animation.py:78–190`).

- [ ] **Step 4: Ejecutar y ver pasar** → `pytest test_clip_field.py -v` PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/clip_field.py backend/test_clip_field.py
git commit -m "El campo del clip clasifica cada vértice del cuello: cubierto, residual o no alcanzado"
```

---

### Task 2: Presión, resumen, colores y escritura del `.vtp`

**Files:**
- Modify: `backend/services/clip_field.py`, `backend/test_clip_field.py`

**Interfaces:**
- Consumes: Task 1; `services.clip_selection.force_window(neck_mm) -> (acc_lo, opt_lo, opt_hi, acc_hi)` en gramos.
- Produces:

```python
PRESSURE_COLORS = {"insuficiente": (59,130,246), "optima": (34,197,94), "aceptable": (245,158,11), "exceso": (239,68,68), "sin_contacto": (148,163,184)}
CATEGORY_COLORS = {COV_NONE: (120,112,124), COV_RESIDUAL: (217,70,239), COV_UNREACHED: (107,114,128)}
GEOMETRIC_NOTE = "Estimación geométrica: fuerza de catálogo repartida sobre el área de contacto; no modela pared, deformación ni deslizamiento."

def contact_area_mm2(mesh: vtk.vtkPolyData, coverage: np.ndarray) -> float   # triángulos con los 3 vértices cubiertos
def pressure_verdict(pressure_g_mm2: float, window_g_mm2: tuple[float, float, float, float]) -> str  # sin_contacto|insuficiente|optima|aceptable|exceso
@dataclass
class FieldSummary:
    covered_pct: float; residual_pct: float; unreached_pct: float
    contact_area_mm2: float; force_g: float; force_is_band_min: bool; force_provisional: bool
    pressure_g_mm2: float; window_g_mm2: tuple[float, float, float, float]; pressure_verdict: str
    note: str = GEOMETRIC_NOTE
def summarize(mesh, coverage: np.ndarray, *, force_g: float, force_is_band_min: bool, force_provisional: bool, neck_mm: float) -> FieldSummary
def colorize(coverage: np.ndarray, pressure_verdict: str) -> np.ndarray      # (N,3) uint8
def write_field(mesh, coverage, pressure_g_mm2: float, colors, path) -> None  # arrays "coverage", "pressure_g_mm2", "colors"; `colors` activo como escalares
```

- [ ] **Step 1: Tests que fallan** (añadir a `test_clip_field.py`)

```python
from services.clip_field import (
    CATEGORY_COLORS, GEOMETRIC_NOTE, PRESSURE_COLORS, colorize, contact_area_mm2, pressure_verdict, summarize, write_field,
)
from services.clip_selection import force_window


class TestPresion:
    def _campo(self, largo_hoja: float):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        return mesh, classify(_puntos(mesh), _marco(_clip_en_cuello(largo_hoja), largo_hoja))

    def test_el_area_de_contacto_crece_con_la_hoja(self):
        m1, c1 = self._campo(4.0); m2, c2 = self._campo(12.0)
        assert 0 < contact_area_mm2(m1, c1) < contact_area_mm2(m2, c2)

    def test_la_presion_es_inversa_al_area(self):
        m1, c1 = self._campo(4.0); m2, c2 = self._campo(12.0)
        s1 = summarize(m1, c1, force_g=120.0, force_is_band_min=True, force_provisional=True, neck_mm=6.0)
        s2 = summarize(m2, c2, force_g=120.0, force_is_band_min=True, force_provisional=True, neck_mm=6.0)
        assert s1.pressure_g_mm2 > s2.pressure_g_mm2
        assert abs(s1.pressure_g_mm2 * s1.contact_area_mm2 - 120.0) < 1e-6

    def test_el_veredicto_sigue_a_la_ventana(self):
        w = tuple(x / 10.0 for x in force_window(6.0))      # área 10 mm²
        assert pressure_verdict(w[0] - 0.1, w) == "insuficiente"
        assert pressure_verdict((w[1] + w[2]) / 2, w) == "optima"
        assert pressure_verdict((w[0] + w[1]) / 2, w) == "aceptable"
        assert pressure_verdict((w[2] + w[3]) / 2, w) == "aceptable"
        assert pressure_verdict(w[3] + 0.1, w) == "exceso"
        assert pressure_verdict(0.0, (0.0, 0.0, 0.0, 0.0)) == "sin_contacto"

    def test_sin_contacto_no_divide_por_cero(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        f = _marco(_clip_en_cuello(12.0, desplaza=(0.0, 0.0, 6.0)), 12.0)
        s = summarize(mesh, classify(_puntos(mesh), f), force_g=120.0, force_is_band_min=True, force_provisional=True, neck_mm=6.0)
        assert s.contact_area_mm2 == 0.0 and s.pressure_g_mm2 == 0.0 and s.pressure_verdict == "sin_contacto"
        assert s.covered_pct == 0.0

    def test_los_porcentajes_suman_cien_sobre_la_banda(self):
        m, c = self._campo(12.0)
        s = summarize(m, c, force_g=120.0, force_is_band_min=True, force_provisional=True, neck_mm=6.0)
        assert abs(s.covered_pct + s.residual_pct + s.unreached_pct - 100.0) < 1e-6
        assert s.note == GEOMETRIC_NOTE and s.force_provisional is True


class TestColores:
    def test_cada_categoria_tiene_su_color_y_el_cubierto_el_de_la_presion(self):
        cov = np.array([COV_NONE, COV_COVERED, COV_RESIDUAL, COV_UNREACHED], dtype=np.uint8)
        rgb = colorize(cov, "optima")
        assert rgb.shape == (4, 3) and rgb.dtype == np.uint8
        assert tuple(rgb[0]) == CATEGORY_COLORS[COV_NONE]
        assert tuple(rgb[1]) == PRESSURE_COLORS["optima"]
        assert tuple(rgb[2]) == CATEGORY_COLORS[COV_RESIDUAL]
        assert tuple(rgb[3]) == CATEGORY_COLORS[COV_UNREACHED]

    def test_el_vtp_lleva_los_tres_arrays_y_los_colores_activos(self, tmp_path):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        cov = classify(_puntos(mesh), _marco(_clip_en_cuello(12.0), 12.0))
        write_field(mesh, cov, 14.3, colorize(cov, "optima"), tmp_path / "clip_field.vtp")
        from services.segmentation import read_vtp
        back = read_vtp(tmp_path / "clip_field.vtp")
        pd = back.GetPointData()
        assert pd.GetArray("coverage").GetNumberOfTuples() == back.GetNumberOfPoints()
        assert pd.GetArray("pressure_g_mm2").GetNumberOfComponents() == 1
        assert pd.GetArray("colors").GetNumberOfComponents() == 3
        assert pd.GetScalars().GetName() == "colors"
```

- [ ] **Step 2: Ver fallar** → FAIL (símbolos inexistentes).

- [ ] **Step 3: Implementación** (añadir a `clip_field.py`)

```python
PRESSURE_COLORS = {
    "insuficiente": (59, 130, 246), "optima": (34, 197, 94), "aceptable": (245, 158, 11),
    "exceso": (239, 68, 68), "sin_contacto": (148, 163, 184),
}
CATEGORY_COLORS = {COV_NONE: (120, 112, 124), COV_RESIDUAL: (217, 70, 239), COV_UNREACHED: (107, 114, 128)}
GEOMETRIC_NOTE = ("Estimación geométrica: fuerza de catálogo repartida sobre el área de contacto; "
                  "no modela pared, deformación ni deslizamiento.")


def contact_area_mm2(mesh: vtk.vtkPolyData, coverage: np.ndarray) -> float:
    """Área de los triángulos cuyos tres vértices quedan entre las hojas."""
    polys = ns.vtk_to_numpy(mesh.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    pts = _points(mesh)
    covered = coverage[polys].all(axis=1)
    if not covered.any():
        return 0.0
    a, b, c = pts[polys[covered, 0]], pts[polys[covered, 1]], pts[polys[covered, 2]]
    return float(0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum())


def pressure_verdict(pressure_g_mm2: float, window_g_mm2) -> str:
    acc_lo, opt_lo, opt_hi, acc_hi = window_g_mm2
    if acc_hi <= 0.0 or pressure_g_mm2 <= 0.0:
        return "sin_contacto"
    if pressure_g_mm2 < acc_lo: return "insuficiente"
    if pressure_g_mm2 > acc_hi: return "exceso"
    if opt_lo <= pressure_g_mm2 <= opt_hi: return "optima"
    return "aceptable"


@dataclass
class FieldSummary:
    covered_pct: float; residual_pct: float; unreached_pct: float
    contact_area_mm2: float; force_g: float; force_is_band_min: bool; force_provisional: bool
    pressure_g_mm2: float; window_g_mm2: tuple[float, float, float, float]; pressure_verdict: str
    note: str = GEOMETRIC_NOTE


def summarize(mesh, coverage: np.ndarray, *, force_g: float, force_is_band_min: bool,
              force_provisional: bool, neck_mm: float) -> FieldSummary:
    from services.clip_selection import force_window
    band = coverage != COV_NONE
    n = int(band.sum()) or 1
    pct = lambda cat: float(100.0 * (coverage == cat).sum() / n)   # noqa: E731
    area = contact_area_mm2(mesh, coverage)
    pressure = float(force_g / area) if area > 0 and force_g > 0 else 0.0
    window = tuple(float(w / area) if area > 0 else 0.0 for w in force_window(neck_mm))
    return FieldSummary(
        covered_pct=pct(COV_COVERED) if band.any() else 0.0, residual_pct=pct(COV_RESIDUAL) if band.any() else 0.0,
        unreached_pct=pct(COV_UNREACHED) if band.any() else 0.0,
        contact_area_mm2=area, force_g=float(force_g), force_is_band_min=force_is_band_min,
        force_provisional=force_provisional, pressure_g_mm2=pressure,
        window_g_mm2=window, pressure_verdict=pressure_verdict(pressure, window),  # type: ignore[arg-type]
    )


def colorize(coverage: np.ndarray, pressure_verdict: str) -> np.ndarray:
    rgb = np.empty((len(coverage), 3), dtype=np.uint8)
    for cat, col in CATEGORY_COLORS.items():
        rgb[coverage == cat] = col
    rgb[coverage == COV_COVERED] = PRESSURE_COLORS.get(pressure_verdict, PRESSURE_COLORS["sin_contacto"])
    return rgb


def write_field(mesh: vtk.vtkPolyData, coverage: np.ndarray, pressure_g_mm2: float, colors: np.ndarray, path) -> None:
    from services.segmentation import write_vtp
    out = vtk.vtkPolyData(); out.ShallowCopy(mesh)
    cov = ns.numpy_to_vtk(coverage.astype(np.uint8), deep=True, array_type=vtk.VTK_UNSIGNED_CHAR); cov.SetName("coverage")
    pres = ns.numpy_to_vtk(np.where(coverage == COV_COVERED, np.float32(pressure_g_mm2), np.float32(0.0)).astype(np.float32),
                           deep=True, array_type=vtk.VTK_FLOAT); pres.SetName("pressure_g_mm2")
    col = ns.numpy_to_vtk(np.ascontiguousarray(colors, dtype=np.uint8), deep=True, array_type=vtk.VTK_UNSIGNED_CHAR)
    col.SetNumberOfComponents(3); col.SetName("colors")
    pd = out.GetPointData(); pd.AddArray(cov); pd.AddArray(pres); pd.SetScalars(col)
    write_vtp(out, path)
```

Si `GetPolys().GetConnectivityArray()` devuelve una vista no contigua con polígonos de más de 3 lados, `field_mesh` ya triangula; si aun así falla, usa `GetOffsetsArray()` para filtrar. `write_vtp` puede serializar el escalar activo: confirma con el test que `GetScalars().GetName() == "colors"`.

- [ ] **Step 4: Ver pasar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/clip_field.py backend/test_clip_field.py
git commit -m "El campo del clip estima la presión frente a la ventana de fuerza y pinta cada vértice"
```

---

### Task 3: Endpoint `POST /api/clips/field/{sid}` con veredicto y criterios

**Files:**
- Modify: `backend/routers/clips.py` (nuevo endpoint junto a `/clips/occlusion`), `backend/models/clips.py` (`ClipFieldSummary`, `ClipFieldResult`)
- Create: `backend/test_clip_field_api.py`

**Interfaces:**
- Consumes: Task 1–2; `_clip_geometry_for(clip_id, meshes_dir)`, `_catalogue_index()`, `_build_case(sid, None)`, `_load_float`, `_criteria_out`, `devices.pose_transform/apply_transform`, `clip_selection.evaluate_clip(spec, case) -> ClipCandidate`, `read_state`, `mesh_url`, `session_exists`, `session_subdir`.
- Produces:

```python
class ClipFieldSummary(BaseModel):
    covered_pct: float; residual_pct: float; unreached_pct: float
    contact_area_mm2: float; force_g: float; force_is_band_min: bool; force_provisional: bool
    pressure_g_mm2: float; window_g_mm2: list[float]; pressure_verdict: str
    verdict: str                      # ok | warn | fail
    criteria: list[ClipCriterion]     # del primer clip colocado (evaluate_clip); vacío si no tiene ficha
    clip_name: str; note: str
class ClipFieldResult(BaseModel):
    field_mesh_url: str
    scalars: dict[str, str]           # {"coverage": "uint8", "pressure_g_mm2": "float32", "colors": "uint8x3"}
    summary: ClipFieldSummary
```

Veredicto global (regla de Global Constraints): `fail` si `cand.verdict == "fail"` o `pressure_verdict in ("insuficiente","exceso")` o `covered_pct < 50`; `warn` si `cand.verdict == "warn"` o `pressure_verdict == "aceptable"` o `residual_pct > 10`; si no `ok`. Sin ficha (clip importado): `criteria=[]`, `force_g=0`, nota ampliada «Clip importado sin ficha: sin fuerza de catálogo, la presión no se puede estimar».

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_clip_field_api.py
"""El mapa de calor por la API: campo, resumen y veredicto."""
from __future__ import annotations

import vtk
from fastapi.testclient import TestClient

from main import app
from services import devices
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir, write_state
from test_clip_field import _saco, _tubo, RADIO

client = TestClient(app, raise_server_exceptions=True)


def _sesion(con_saco: bool = True, neck_mm: float = 6.0) -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    write_vtp(_tubo(), meshes / "vessel_tree.vtp")
    if con_saco:
        write_vtp(_saco(), meshes / "aneurysm_sac.vtp")
        write_state(sid, "morpho.sac_vtp_name", "aneurysm_sac.vtp")
    for k, v in {"morpho.neck_mm": neck_mm, "morpho.axis_x": 0.0, "morpho.axis_y": 0.0, "morpho.axis_z": 1.0,
                 "morpho.neck_origin_x": 0.0, "morpho.neck_origin_y": 0.0, "morpho.neck_origin_z": 0.0}.items():
        write_state(sid, k, str(v))
    return sid


def _primer_clip_id() -> str:
    """Un clip del catálogo con ficha (fuerza y hoja conocidas)."""
    return client.get("/api/clips").json()[0]["id"]


def _campo(sid: str, clip_id: str, pos=(0.0, 0.0, 0.0), rot: float = 0.0):
    return client.post(f"/api/clips/field/{sid}", json={
        "session_id": sid,
        "placements": [{"clip_id": clip_id, "position": {"x": pos[0], "y": pos[1], "z": pos[2]},
                        "normal": [0.0, 0.0, 1.0], "rotation_deg": rot}],
    })


class TestCampo:
    def test_devuelve_la_malla_con_tres_arrays_y_el_resumen(self):
        sid = _sesion()
        r = _campo(sid, _primer_clip_id())
        assert r.status_code == 200, r.text
        j = r.json()
        assert "clip_field.vtp" in j["field_mesh_url"] and "?v=" in j["field_mesh_url"]
        assert j["scalars"] == {"coverage": "uint8", "pressure_g_mm2": "float32", "colors": "uint8x3"}
        s = j["summary"]
        assert s["covered_pct"] > 0 and s["verdict"] in ("ok", "warn", "fail")
        assert len(s["window_g_mm2"]) == 4 and s["note"].startswith("Estimación geométrica")
        assert s["criteria"] and all({"key", "label", "verdict", "detail"} <= set(c) for c in s["criteria"])
        poly = read_vtp(session_subdir(sid, "meshes") / "clip_field.vtp")
        assert poly.GetPointData().GetArray("colors").GetNumberOfComponents() == 3

    def test_mover_el_clip_fuera_del_cuello_pinta_cuello_residual(self):
        sid = _sesion()
        cid = _primer_clip_id()
        bien = _campo(sid, cid).json()["summary"]
        lejos = _campo(sid, cid, pos=(0.0, 0.0, 6.0)).json()["summary"]
        assert lejos["covered_pct"] < bien["covered_pct"]
        assert lejos["pressure_verdict"] == "sin_contacto" and lejos["verdict"] == "fail"

    def test_girar_el_clip_cambia_la_cobertura(self):
        sid = _sesion()
        cid = _primer_clip_id()
        a = _campo(sid, cid, rot=0.0).json()["summary"]["covered_pct"]
        b = _campo(sid, cid, rot=90.0).json()["summary"]["covered_pct"]
        assert a != b     # el contorno del cuello sintético no es simétrico frente al anillo+vaso

    def test_varios_clips_suman_su_fuerza(self):
        sid = _sesion()
        cid = _primer_clip_id()
        body = {"session_id": sid, "placements": [
            {"clip_id": cid, "position": {"x": 0.0, "y": -1.5, "z": 0.0}, "normal": [0, 0, 1], "rotation_deg": 0.0},
            {"clip_id": cid, "position": {"x": 0.0, "y": 1.5, "z": 0.0}, "normal": [0, 0, 1], "rotation_deg": 0.0},
        ]}
        s = client.post(f"/api/clips/field/{sid}", json=body).json()["summary"]
        uno = _campo(sid, cid).json()["summary"]
        assert s["force_g"] == 2 * uno["force_g"]


class TestNegativas:
    def test_sin_saco_aislado_409_y_dice_morfometria(self):
        r = _campo(_sesion(con_saco=False), _primer_clip_id())
        assert r.status_code == 409 and "Morfometría" in r.json()["detail"]

    def test_sin_cuello_medido_409(self):
        r = _campo(_sesion(neck_mm=0.0), _primer_clip_id())
        assert r.status_code == 409 and "cuello" in r.json()["detail"].lower()

    def test_sin_colocaciones_409(self):
        sid = _sesion()
        r = client.post(f"/api/clips/field/{sid}", json={"session_id": sid, "placements": []})
        assert r.status_code == 409

    def test_sesion_inexistente_404(self):
        r = client.post("/api/clips/field/no-existe", json={"session_id": "no-existe", "placements": []})
        assert r.status_code == 404

    def test_clip_importado_sin_ficha_no_estima_presion(self):
        sid = _sesion()
        meshes = session_subdir(sid, "meshes")
        write_vtp(devices.make_clip_shaped(10.0), meshes / "custom_clip_0.vtp")
        s = _campo(sid, "custom:0").json()["summary"]
        assert s["force_g"] == 0.0 and s["criteria"] == [] and "sin ficha" in s["note"]
```

- [ ] **Step 2: Ver fallar** → `pytest test_clip_field_api.py -v` FAIL (404/405 en la ruta).

- [ ] **Step 3: Implementación**

En `backend/models/clips.py` (al final):

```python
class ClipFieldSummary(BaseModel):
    """Lo que el campo mide: cobertura, presión estimada y veredicto. Estimación geométrica."""
    covered_pct: float; residual_pct: float; unreached_pct: float
    contact_area_mm2: float; force_g: float; force_is_band_min: bool; force_provisional: bool
    pressure_g_mm2: float; window_g_mm2: list[float]; pressure_verdict: str
    verdict: str = Field(..., description="ok | warn | fail")
    criteria: list[ClipCriterion] = Field(default_factory=list)
    clip_name: str = ""
    note: str = ""


class ClipFieldResult(BaseModel):
    field_mesh_url: str
    scalars: dict[str, str]
    summary: ClipFieldSummary
```

En `backend/routers/clips.py`, junto a `/clips/occlusion`:

```python
@router.post("/clips/field/{session_id}", response_model=ClipFieldResult,
             summary="Mapa de calor del clip (estimación geométrica)",
             description="Pinta el saco y el anillo de cuello según lo que cubren las hojas y la presión "
                         "estimada (fuerza mínima de catálogo / área de contacto) frente a la ventana de "
                         "fuerza del cuello. No modela pared ni deformación.")
async def clip_field(session_id: str, req: ClipPlanRequest) -> ClipFieldResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    if not req.placements:
        raise HTTPException(status_code=409, detail="No hay ningún clip colocado que evaluar.")
    from services import devices
    from services import clip_field as cf
    from services.segmentation import read_vtp

    meshes_dir = session_subdir(session_id, "meshes")
    sac_name = read_state(session_id, "morpho.sac_vtp_name", "") or "aneurysm_sac.vtp"
    sac_path = meshes_dir / sac_name
    if not sac_path.exists():
        raise HTTPException(status_code=409, detail=(
            "No hay un saco aislado sobre el que pintar. Marca el plano del cuello en "
            "Morfometría: sin el saco cerrado no se puede estimar la cobertura."))
    neck_mm = _load_float(session_id, "morpho.neck_mm", 0.0)
    if neck_mm <= 0.1:
        raise HTTPException(status_code=409, detail="No hay cuello medido: la ventana de fuerza depende de su anchura.")
    neck_origin = tuple(_load_float(session_id, f"morpho.neck_origin_{a}", 0.0) for a in "xyz")
    neck_axis = (_load_float(session_id, "morpho.axis_x", 0.0), _load_float(session_id, "morpho.axis_y", 0.0),
                 _load_float(session_id, "morpho.axis_z", 1.0))

    sac = read_vtp(sac_path)
    vessel_path = meshes_dir / "vessel_tree.vtp"
    ring = cf.vessel_ring(read_vtp(vessel_path), neck_origin, neck_axis, neck_mm) if vessel_path.exists() else vtk.vtkPolyData()
    mesh = cf.field_mesh(sac, ring)
    pts = cf._points(mesh)

    index = _catalogue_index()
    per_clip, force_total, band_min, provisional, criteria, names = [], 0.0, False, False, [], []
    sin_ficha = False
    for i, pl in enumerate(req.placements):
        local = _clip_geometry_for(pl.clip_id, meshes_dir)
        t = devices.pose_transform(
            (pl.position.x, pl.position.y, pl.position.z), tuple(pl.normal) if pl.normal else (0.0, 0.0, 1.0), pl.rotation_deg)
        world = devices.apply_transform(local, t)
        spec = index.get(pl.clip_id)
        if spec is None:
            sin_ficha = True
            # Sin ficha: la hoja se mide en la malla LOCAL (la caja de mundo de un clip
            # girado no mide su largo); sin fuerza no hay presión.
            b = local.GetBounds(); length = max(b[1] - b[0], b[3] - b[2], b[5] - b[4])
            frame = cf.blade_frame(world, length_mm=length, blade_width_mm=0.5, blade_height_mm=1.4,
                                   neck_mm=neck_mm, neck_axis=neck_axis, pose=t)
            names.append(_custom_clip_name(session_id, pl.clip_id) if pl.clip_id.startswith("custom:") else pl.clip_id)
        else:
            frame = cf.blade_frame(world, length_mm=spec.blade_length_mm, blade_width_mm=spec.blade_width_mm,
                                   blade_height_mm=spec.blade_height_mm, neck_mm=neck_mm, neck_axis=neck_axis, pose=t)
            lo, hi = spec.force_band
            force_total += lo; band_min = band_min or hi > lo; provisional = provisional or spec.force_provisional
            names.append(spec.name)
            if i == 0:
                criteria = _criteria_out(evaluate_clip(spec, _build_case(session_id, None)))
        per_clip.append(cf.classify(pts, frame))
    coverage = cf.combine_coverage(per_clip)
    s = cf.summarize(mesh, coverage, force_g=force_total, force_is_band_min=band_min, force_provisional=provisional, neck_mm=neck_mm)
    colors = cf.colorize(coverage, s.pressure_verdict)
    cf.write_field(mesh, coverage, s.pressure_g_mm2, colors, meshes_dir / "clip_field.vtp")

    crit_verdicts = {c.verdict for c in criteria}
    if "fail" in crit_verdicts or s.pressure_verdict in ("insuficiente", "exceso", "sin_contacto") or s.covered_pct < 50:
        verdict = "fail"
    elif "warn" in crit_verdicts or s.pressure_verdict == "aceptable" or s.residual_pct > 10:
        verdict = "warn"
    else:
        verdict = "ok"
    note = s.note + (" Clip importado sin ficha: sin fuerza de catálogo, la presión no se puede estimar." if sin_ficha else "")
    return ClipFieldResult(
        field_mesh_url=f"{mesh_url(session_id, 'clip_field.vtp')}?v={int(time.time() * 1000)}",
        scalars={"coverage": "uint8", "pressure_g_mm2": "float32", "colors": "uint8x3"},
        summary=ClipFieldSummary(
            covered_pct=s.covered_pct, residual_pct=s.residual_pct, unreached_pct=s.unreached_pct,
            contact_area_mm2=s.contact_area_mm2, force_g=s.force_g, force_is_band_min=s.force_is_band_min,
            force_provisional=s.force_provisional, pressure_g_mm2=s.pressure_g_mm2, window_g_mm2=list(s.window_g_mm2),
            pressure_verdict=s.pressure_verdict, verdict=verdict, criteria=criteria, clip_name=" + ".join(names), note=note),
    )
```

Importa `ClipFieldResult`, `ClipFieldSummary` del módulo de modelos y `evaluate_clip` de `services.clip_selection` (ya hay un bloque de imports de ese módulo). `vtk` se importa dentro si el archivo no lo importa arriba. Nota: «sin_contacto» cuenta como `fail` (un clip que no toca el cuello no sirve).

- [ ] **Step 4: Ver pasar** → `pytest test_clip_field_api.py test_clip_field.py -v` PASS; `pytest test_session_abc.py test_oclusion_clip.py -q` sin regresiones nuevas frente a la línea base.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/clips.py backend/models/clips.py backend/test_clip_field_api.py
git commit -m "POST /api/clips/field pinta el saco según el clip colocado y dicta su idoneidad"
```

---

### Task 4: API, tipos y estado en el frontend

**Files:**
- Modify: `frontend/src/api/types.ts` (`ClipFieldSummary`, `ClipFieldResult`), `frontend/src/api/client.ts` (`clipField`), `frontend/src/store/planning.tsx` (`clipField`, `setClipField`, `showClipField`, `setShowClipField`; limpieza)
- Create: `frontend/src/store/clipField.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface ClipFieldSummary { covered_pct: number; residual_pct: number; unreached_pct: number; contact_area_mm2: number; force_g: number; force_is_band_min: boolean; force_provisional: boolean; pressure_g_mm2: number; window_g_mm2: [number, number, number, number]; pressure_verdict: "sin_contacto" | "insuficiente" | "optima" | "aceptable" | "exceso"; verdict: "ok" | "warn" | "fail"; criteria: ClipCriterion[]; clip_name: string; note: string }
export interface ClipFieldResult { field_mesh_url: string; scalars: Record<string, string>; summary: ClipFieldSummary }
api.clipField(sessionId: string, req: ClipPlanRequest): Promise<ClipFieldResult>
// store
clipField: ClipFieldResult | null; setClipField(f: ClipFieldResult | null): void;
showClipField: boolean; setShowClipField(v: boolean): void;   // por defecto true
// `clearDeviceMeshes("clips")`, `clearDeviceMeshes()` y el reset de sesión ponen clipField a null
```

- [ ] **Step 1: Test que falla**

```tsx
// frontend/src/store/clipField.test.tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanningProvider, usePlanning } from "./planning";
import type { ClipFieldResult } from "../api/types";

const campo: ClipFieldResult = {
  field_mesh_url: "/m/clip_field.vtp?v=1", scalars: { colors: "uint8x3" },
  summary: { covered_pct: 90, residual_pct: 10, unreached_pct: 0, contact_area_mm2: 8, force_g: 120, force_is_band_min: true,
    force_provisional: true, pressure_g_mm2: 15, window_g_mm2: [10, 12, 18, 22], pressure_verdict: "optima", verdict: "ok",
    criteria: [], clip_name: "NAVARRO T1 10", note: "Estimación geométrica" },
};

describe("campo del clip en el store", () => {
  it("se guarda, se muestra por defecto y se retira al limpiar los clips", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    expect(result.current.showClipField).toBe(true);
    act(() => result.current.setClipField(campo));
    expect(result.current.clipField?.summary.verdict).toBe("ok");
    act(() => result.current.clearDeviceMeshes("clips"));
    expect(result.current.clipField).toBeNull();
  });
  it("limpiar otros dispositivos no lo toca; limpiar todo sí", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    act(() => result.current.setClipField(campo));
    act(() => result.current.clearDeviceMeshes("coils"));
    expect(result.current.clipField).not.toBeNull();
    act(() => result.current.clearDeviceMeshes());
    expect(result.current.clipField).toBeNull();
  });
});
```

Si el proveedor del store se llama de otra forma (`PlanningProvider` es el nombre a comprobar en `store/planning.tsx`), usa el real.

- [ ] **Step 2: Ver fallar** → `npx vitest run src/store/clipField.test.tsx` FAIL.

- [ ] **Step 3: Implementación** — tipos en `types.ts` junto a `OcclusionOut`; `clipField: (sessionId: string, req: ClipPlanRequest) => post<ClipFieldResult>(`/api/clips/field/${sessionId}`, req)` en `client.ts` junto a `planClips`; en el store: `const [clipField, setClipField] = useState<ClipFieldResult | null>(null); const [showClipField, setShowClipField] = useState(true);`, en `clearDeviceMeshes` poner `setClipField(null)` cuando `kind === "clips"` o sin `kind`, y en el reset de sesión; exponer en el tipo del contexto y en el value. Comentario WHY: «el campo describe un plan de clips concreto; sin clips no hay nada que describa».

- [ ] **Step 4: Ver pasar** → PASS; `npx tsc --noEmit -p .` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/store/planning.tsx frontend/src/store/clipField.test.tsx
git commit -m "El cliente conoce el campo del clip y lo olvida cuando se limpian los clips"
```

---

### Task 5: La capa del campo en el visor, con leyenda e interruptor

**Files:**
- Modify: `frontend/src/vtk/MeshView.tsx` (`MeshLayer.scalars`), `frontend/src/vtk/Viewer.tsx` (capa, leyenda, toggle «CALOR»)
- Create: `frontend/src/vtk/clipFieldLegend.ts`, `frontend/src/vtk/clipFieldLegend.test.ts`

**Interfaces:**
- Consumes: Task 4 (`clipField`, `showClipField`, `setShowClipField`); `HudReadout` (`HudLine { text, color }`), `HudToggleGroup`.
- Produces:

```ts
// MeshLayer
scalars?: { array: string };   // color directo RGB por vértice desde ese array del .vtp
// clipFieldLegend.ts (puro)
export function legendLines(s: ClipFieldSummary): HudLine[];   // 3 categorías + presión + veredicto, con colores
export const FIELD_COLORS: Record<"cubierto_optima"|"cubierto_aceptable"|"cubierto_insuficiente"|"cubierto_exceso"|"residual"|"no_alcanzado", string>;
```

- [ ] **Step 1: Test que falla**

```ts
// frontend/src/vtk/clipFieldLegend.test.ts
import { describe, expect, it } from "vitest";
import { FIELD_COLORS, legendLines } from "./clipFieldLegend";
import type { ClipFieldSummary } from "../api/types";

const base: ClipFieldSummary = { covered_pct: 92, residual_pct: 8, unreached_pct: 0, contact_area_mm2: 8.4, force_g: 120,
  force_is_band_min: true, force_provisional: true, pressure_g_mm2: 14.3, window_g_mm2: [10.1, 11.6, 17.4, 21.8],
  pressure_verdict: "optima", verdict: "ok", criteria: [], clip_name: "T1 10", note: "" };

describe("legendLines", () => {
  it("una línea por categoría con su color, la presión frente a la ventana y el veredicto", () => {
    const l = legendLines(base);
    expect(l.map((x) => x.text)).toEqual([
      "CUBIERTO 92 %", "CUELLO RESIDUAL 8 %", "NO ALCANZADO 0 %",
      "PRESIÓN 14.3 g/mm² · ÓPTIMA (11.6–17.4)", "VEREDICTO OK · ESTIMACIÓN GEOMÉTRICA",
    ]);
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_optima);
    expect(l[1].color).toBe(FIELD_COLORS.residual);
  });
  it("sin contacto lo dice y pinta el cubierto en gris", () => {
    const l = legendLines({ ...base, covered_pct: 0, pressure_g_mm2: 0, pressure_verdict: "sin_contacto", verdict: "fail" });
    expect(l[3].text).toBe("PRESIÓN — · SIN CONTACTO");
    expect(l[4].text).toBe("VEREDICTO FAIL · ESTIMACIÓN GEOMÉTRICA");
  });
  it("la fuerza provisional se marca con ~", () => {
    expect(legendLines(base)[3].text.startsWith("PRESIÓN ~")).toBe(false);
    expect(legendLines({ ...base, force_provisional: true, force_is_band_min: true })[3].text).toContain("14.3");
  });
});
```

Ajusta el tercer test al formato que elijas para marcar la banda provisional (p. ej. sufijo «(mín. de banda provisional)» en el `title`, no en el texto); el formato de los dos primeros tests es el obligatorio.

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementación**

```ts
// frontend/src/vtk/clipFieldLegend.ts
/* Leyenda del mapa de calor del clip: los mismos colores que pinta el servidor
   (services/clip_field.py), para que la barra diga lo que la malla enseña. */
import type { ClipFieldSummary } from "../api/types";
import type { HudLine } from "./hud/HudReadout";

export const FIELD_COLORS = {
  cubierto_optima: "rgb(34,197,94)", cubierto_aceptable: "rgb(245,158,11)", cubierto_insuficiente: "rgb(59,130,246)",
  cubierto_exceso: "rgb(239,68,68)", cubierto_sin_contacto: "rgb(148,163,184)", residual: "rgb(217,70,239)", no_alcanzado: "rgb(107,114,128)",
} as const;

const VERDICT_LABEL: Record<ClipFieldSummary["pressure_verdict"], string> = {
  sin_contacto: "SIN CONTACTO", insuficiente: "INSUFICIENTE", optima: "ÓPTIMA", aceptable: "ACEPTABLE", exceso: "EXCESO",
};

export function legendLines(s: ClipFieldSummary): HudLine[] {
  const covKey = `cubierto_${s.pressure_verdict}` as keyof typeof FIELD_COLORS;
  const [, optLo, optHi] = s.window_g_mm2;
  const presion = s.pressure_verdict === "sin_contacto"
    ? "PRESIÓN — · SIN CONTACTO"
    : `PRESIÓN ${s.pressure_g_mm2.toFixed(1)} g/mm² · ${VERDICT_LABEL[s.pressure_verdict]} (${optLo.toFixed(1)}–${optHi.toFixed(1)})`;
  return [
    { text: `CUBIERTO ${Math.round(s.covered_pct)} %`, color: FIELD_COLORS[covKey] ?? FIELD_COLORS.cubierto_sin_contacto },
    { text: `CUELLO RESIDUAL ${Math.round(s.residual_pct)} %`, color: FIELD_COLORS.residual },
    { text: `NO ALCANZADO ${Math.round(s.unreached_pct)} %`, color: FIELD_COLORS.no_alcanzado },
    { text: presion },
    { text: `VEREDICTO ${s.verdict.toUpperCase()} · ESTIMACIÓN GEOMÉTRICA` },
  ];
}
```

`MeshView.tsx`: en la carga de cada capa, tras `mapper.setInputData(poly)`:

```ts
if (layer.scalars) {
  // Color directo por vértice: el servidor ya decidió el color de cada punto
  // (categoría y presión), así la leyenda y la malla no pueden discrepar.
  poly.getPointData().setActiveScalars(layer.scalars.array);
  mapper.setScalarVisibility(true);
  mapper.setColorModeToDirectScalars();
} else {
  mapper.setScalarVisibility(false);
}
```

`Viewer.tsx`: en el `useMemo` de `layers`, cuando `showDevice && clipField && showClipField`, en lugar de la capa del saco (`sacUrl`) empuja `{ url: clipField.field_mesh_url, color: SAC_COLOR, opacity: 1, id: "clip-field", scalars: { array: "colors" }, silhouette: true }` (añade `clipField` y `showClipField` a las dependencias). Leyenda: en `renderScene`, cuando esa capa está activa, `br.push(...legendLines(clipField.summary))` (ya existe el `br` para dispositivos). Interruptor: junto a REGLAS/SINCRO, `HudToggleGroup` «CALOR ●/○» visible solo cuando `clipField` existe, que llama a `setShowClipField`.

- [ ] **Step 4: Verificar** → `npx vitest run src/vtk/clipFieldLegend.test.ts`, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3, con un clip NAVARRO™ colocado y un saco cerrado — si no hay saco, márcalo en Morfometría): llama al endpoint desde la consola o espera a la Task 6; comprueba que la capa pinta verde/magenta/gris, la leyenda aparece abajo a la derecha, «CALOR ○» la quita y vuelve el saco normal, y no hay errores de consola.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/clipFieldLegend.ts frontend/src/vtk/clipFieldLegend.test.ts
git commit -m "El visor pinta el campo del clip con sus colores y lo explica en la leyenda"
```

---

### Task 6: El panel de clips pide el campo y enseña la tarjeta de idoneidad

**Files:**
- Modify: `frontend/src/components/planning/DevicesPanel.tsx`
- Create: `frontend/src/components/planning/ClipFieldCard.tsx`, `frontend/src/components/planning/ClipFieldCard.test.tsx`, `frontend/src/components/planning/DevicesPanel.clipField.test.tsx`

**Interfaces:**
- Consumes: `api.clipField`, store (`clipField`, `setClipField`, `showClipField`, `setShowClipField`), `ClipCriterion` (cómo lo pinta `ClipSelection.tsx`).
- Produces: `<ClipFieldCard summary={ClipFieldSummary} show={boolean} onToggle={(v) => void} />`.

- [ ] **Step 1: Tests que fallan**

```tsx
// frontend/src/components/planning/ClipFieldCard.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClipFieldCard } from "./ClipFieldCard";
import type { ClipFieldSummary } from "../../api/types";

const s: ClipFieldSummary = { covered_pct: 92, residual_pct: 8, unreached_pct: 0, contact_area_mm2: 8.4, force_g: 120,
  force_is_band_min: true, force_provisional: true, pressure_g_mm2: 14.3, window_g_mm2: [10.1, 11.6, 17.4, 21.8],
  pressure_verdict: "optima", verdict: "warn", clip_name: "T1 10",
  criteria: [{ key: "coverage", label: "Cobertura", verdict: "ok", detail: "ok" }, { key: "force", label: "Fuerza", verdict: "warn", detail: "banda provisional" }],
  note: "Estimación geométrica: …" };

describe("ClipFieldCard", () => {
  it("enseña cobertura, presión frente a la ventana, los criterios y la nota", () => {
    render(<ClipFieldCard summary={s} show onToggle={vi.fn()} />);
    expect(screen.getByText(/92\.0 %/)).toBeInTheDocument();
    expect(screen.getByText(/14\.3 g\/mm²/)).toBeInTheDocument();
    expect(screen.getByText(/11\.6.*17\.4/)).toBeInTheDocument();
    expect(screen.getByText("Fuerza")).toBeInTheDocument();
    expect(screen.getByText(/banda provisional/)).toBeInTheDocument();
    expect(screen.getByText(/Estimación geométrica/)).toBeInTheDocument();
    expect(screen.getByText(/fuerza mínima de la banda/i)).toBeInTheDocument();
  });
  it("el interruptor del mapa de calor avisa al padre", () => {
    const onToggle = vi.fn();
    render(<ClipFieldCard summary={s} show={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mapa de calor/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
```

```tsx
// frontend/src/components/planning/DevicesPanel.clipField.test.tsx
// Comprueba que colocar pide el campo justo después del plan y que mover el clip lo
// vuelve a pedir con debounce. Usa el patrón de los tests existentes del panel
// (busca `DevicesPanel.test.tsx` o similar para el wrapper y los mocks de `api`).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", async (orig) => {
  const mod = await orig<typeof import("../../api/client")>();
  return { ...mod, api: { ...mod.api,
    planClips: vi.fn(async () => ({ clips_mesh_url: "/m/clips.vtp", trajectory_mesh_url: null, neck_coverage_pct: 90, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null })),
    clipField: vi.fn(async () => ({ field_mesh_url: "/m/clip_field.vtp?v=1", scalars: {}, summary: { covered_pct: 90, residual_pct: 10, unreached_pct: 0, contact_area_mm2: 8, force_g: 120, force_is_band_min: true, force_provisional: true, pressure_g_mm2: 15, window_g_mm2: [10, 12, 18, 22], pressure_verdict: "optima", verdict: "ok", criteria: [], clip_name: "x", note: "Estimación geométrica" } })),
  } };
});
import { api } from "../../api/client";

describe("DevicesPanel · campo del clip", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  it("tras colocar pide el campo una vez y enseña la tarjeta", async () => {
    // Renderiza el panel con un clip seleccionado y pulsa «Colocar» (adapta al wrapper real).
    // …
    await waitFor(() => expect(api.clipField).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Estimación geométrica/)).toBeInTheDocument();
  });
  it("mover el clip vuelve a pedir el campo tras 250 ms, no en cada tecla", async () => {
    // … cambia dos veces la posición en < 250 ms y avanza los temporizadores
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.clipField).toHaveBeenCalledTimes(2));
  });
});
```

El segundo archivo exige leer cómo se prueba hoy `DevicesPanel` (fixtures del store y del `sessionId`); si no existe un test previo del panel, construye el wrapper mínimo con `PlanningProvider` y un `sessionId` fijo, y documenta en el informe lo que hizo falta.

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementación**

`ClipFieldCard.tsx`: una `Card` con el título «Mapa de calor del clip» y un `<label><input type="checkbox" aria-label="Mapa de calor" checked={show} onChange={(e) => onToggle(e.target.checked)} /> Mostrar en el visor</label>`; `Metric` para «Cobertura» (`covered_pct.toFixed(1)` %), «Cuello residual», «No alcanzado», «Presión estimada» (`pressure_g_mm2.toFixed(1)` g/mm² con badge según `pressure_verdict`: optima → success, aceptable → warning, insuficiente/exceso/sin_contacto → destructive) y la ventana «óptima 11.6–17.4 · aceptable 10.1–21.8 g/mm²»; línea «Fuerza: 120 g (fuerza mínima de la banda, provisional)» cuando `force_is_band_min`; lista de `criteria` con el mismo componente/estilo que usa `ClipSelection.tsx` para los criterios; al pie, `note` en 11 px color `--muted-foreground`.

`DevicesPanel.tsx`: tras `setDeviceMesh("clips", …)` en `place()`, `const field = await api.clipField(sessionId, { session_id: sessionId, placements })` dentro de un `try` propio (un fallo del campo no deshace la colocación: se enseña el error en una línea bajo la tarjeta) y `setClipField(field)`. Debounce: `useEffect` sobre `placed` (posiciones/giro) que, si `plan` existe, programa `setTimeout(…, 250)` para repetir la llamada y limpia el temporizador anterior (comentario WHY: «mover un deslizador dispara decenas de cambios por segundo; el servidor tarda ~100 ms por campo»). Renderiza `<ClipFieldCard summary={clipField.summary} show={showClipField} onToggle={setShowClipField} />` bajo la `Card` del plan cuando `clipField` existe.

- [ ] **Step 4: Verificar** → vitest de los dos archivos, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3): Dispositivos → Clips → coloca un NAVARRO™ T1 10 mm sobre el cuello → el saco se pinta y aparece la tarjeta; mueve el clip 2 mm fuera del cuello → sube el magenta y el veredicto empeora; gira 90° → cambia la cobertura; «Mostrar en el visor» apaga y encienda la capa; limpia los clips → la capa y la tarjeta desaparecen; sin errores de consola. Capturas `t6_*.png`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/planning/DevicesPanel.tsx frontend/src/components/planning/ClipFieldCard.tsx frontend/src/components/planning/ClipFieldCard.test.tsx frontend/src/components/planning/DevicesPanel.clipField.test.tsx
git commit -m "Colocar un clip pide su mapa de calor y la tarjeta dice si la hoja, la apertura y la fuerza bastan"
```

---

### Task 7: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección de clips: el mapa de calor y su etiqueta de estimación), este plan (casillas).

- [ ] **Step 1: Comprobación completa**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q -rf --no-header -p no:cacheprovider
```

Expected: frontend en verde; backend sin fallos NUEVOS frente a la línea base del ledger (37 ids). Tiempo del endpoint sobre Case 3 con la malla tubular: medir y anotar (< 1 s esperado).

- [ ] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)

1. Con saco cerrado y un NAVARRO™ T1 10 mm colocado: el saco se pinta, la leyenda abajo a la derecha dice cobertura, residual, no alcanzado, presión frente a ventana y veredicto con «ESTIMACIÓN GEOMÉTRICA».
2. Mover el clip 2 mm fuera del cuello pinta cuello residual (magenta) y el veredicto pasa a fail/warn.
3. Girar el clip 90° cambia la cobertura y los porcentajes.
4. Dos clips: la fuerza suma y la zona cubierta crece.
5. «CALOR ○» en el HUD y la casilla de la tarjeta apagan la capa; el saco normal vuelve.
6. Limpiar clips retira capa, leyenda y tarjeta; reanudar otra sesión también.
7. Sin saco aislado: el panel muestra el aviso de Morfometría y nada se pinta.
8. Clip importado (STL propio): la tarjeta dice que sin ficha no hay presión; la cobertura sí se pinta.
9. El ensayo de colocación (animación) sigue funcionando con el campo encendido (el campo se calcula para la pose final).

- [ ] **Step 3: README y commit de cierre**

```bash
git add README.md docs/superpowers/plans/2026-10-01-mapa-calor-clip.md
git commit -m "Cierre del mapa de calor del clip: lista manual y README"
```
