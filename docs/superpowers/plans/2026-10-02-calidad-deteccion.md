# Calidad de la detección (D4) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada candidato de la detección pase cuatro comprobaciones geométricas con motivo (borde, isla, bifurcación, forma), que los descartados se muestren aparte con su razón, que un banco de pruebas reproducible (Case 3 + sintéticos) mida la línea base y cada veto, y que re-detectar no deje la morfometría apuntando a un candidato que ya no existe.

**Architecture:** Primero el banco (`backend/eval/`): los generadores sintéticos salen de `test_consensus_and_plane.py` a `eval/synthetic.py`, un `detection_bench.py` declara los casos y calcula las métricas, y un test fija umbrales; la línea base se commitea antes de tocar la detección. Después los vetos como funciones puras en `services/candidate_vetoes.py` sobre `(malla, hit, parche)`, aplicados en `routers/detect.py` tras el consenso y antes del tope, con `rejected` en la respuesta y en el estado; la invalidación de la morfometría al re-detectar vive en el mismo router. El panel añade el desplegable «Descartados». Sin cambios en los canales ni en la malla de detección.

**Tech Stack:** Python 3 + VTK 9.7 + NumPy + SciPy (ya presentes), pytest con el marcador `slow` existente; React 19 + Testing Library + vitest. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-02-calidad-deteccion-design.md`

## Global Constraints

- Sin dependencias nuevas; nunca se commitea `frontend/package-lock.json`; nunca `backend/data/`; `backend/eval/results/baseline.json` SÍ se commitea (añadir una excepción al `.gitignore` si alguna regla lo tapa); copia y comentarios WHY en español.
- Los canales de detección (`aneurysm_detector.py`, `aneurysm_consensus.py`) no cambian de comportamiento; `order_hits` no cambia; el tope `_MAX_CANDIDATES = 5` pasa a contar solo aceptados.
- Lesión de Case 3: `[62.1, 63.7, 62.9]` mm (malla), `LESION_HIT_MM = 8`. La sesión de Case 3 se localiza por contenido (`backend/data/sessions/*/state.txt` con `dicom.modality=XA` y `meshes/vessel_tree.vtp` presente; la nativa tiene `seg.downsample_factor=1`, la media `=2`), nunca por un id fijo (la sesión `c80edc28…` de los tests antiguos ya no existe).
- Vetos: constantes `BORDER_TOL_MM = 1.0`, `OPEN_EDGE_MM = 3.0`, `ISLAND_FRAC = 0.02`, `BIF_RADIUS_K = 1.5` (radio mínimo 3 mm), `NECK_RATIO = 0.85`, `NECK_SLICES = 10`; orden borde → isla → bifurcación → forma, se queda el primero; etiquetas «Recorte de la malla», «Resto de segmentación», «Unión de ramas», «No es sacular»; la forma solo se evalúa en parches `region`.
- Umbrales del banco: `rejected_true == 0` en todos los casos; Case 3 nativa `lesion_rank ≤ 2`; Case 3 media `lesion_rank ≤ 3`; sintéticos con lesión `lesion_rank == 1`; sintéticos sin lesión `false_positives ≤ 1`. Si la línea base no cumple un umbral de Case 3, el umbral de ESA fila se fija al valor de la línea base y se anota (los vetos no deben empeorarlo).
- API: `AneurysmCandidate` gana `rank: int` y `veto: Veto | None`; `AneurysmDetectionResult` gana `rejected: list[AneurysmCandidate]`, `morphometry_invalidated: bool`; `DetectionDiagnostics` gana `n_rejected: int` y `rejected_by_reason: dict[str, int]`; ids `cand-00N` consecutivos (aceptados primero); estado `detect.cand_00N.veto_reason` («» si aceptado) y `detect.n_rejected`.
- Re-detectar: si `detect.selected_candidate` apunta a un id que ya no existe entre aceptados+descartados, o cuyo centro se movió > `REDETECT_MOVE_MM = 2` mm, se limpian `_MORPHO_STATE_KEYS`, el saco y el tratamiento (como `morphometry=True`) y `morphometry_invalidated = true`.
- Verificación: backend `pytest -q` sobre los archivos tocados (el pase completo tiene 36–37 fallos preexistentes y se cae a veces en `test_corredor_abordaje.py`: partirlo); frontend `npx tsc --noEmit -p .`, `npx vitest run` (623 al empezar), `npm run build`; navegador con Case 3 donde la tarea lo indique.

## Review Focus

1. Malla sin ningún candidato (resultado vacío): `rejected` es `[]`, `diagnostics.n_rejected = 0`, el panel sigue explicando el vacío con `explainEmpty` → test en Task 5 (API) y Task 7 (panel).
2. Parche vacío o de menos de 3 vértices (un `locator` recortado fuera de la malla): ningún veto lanza; devuelven `None` → test en Task 3 (`veto_shape`/`veto_bifurcation` con parche vacío).
3. Malla de un solo componente del tamaño justo (árbol pequeño, < 50 vértices): `veto_island` no descarta el único componente (es el mayor) → test en Task 3.
4. Re-detectar cuando `detect.selected_candidate` está vacío (nunca se midió): no se invalida nada, `morphometry_invalidated = false` → test en Task 5.
5. Candidato descartado elegido y luego medido: la morfometría acepta ids de descartados (`GET /morphometry?candidate_id=cand-00N` con N > aceptados) porque el archivo `aneurysm_cand_00N.vtp` existe → test en Task 5.

---

### Task 1: Generadores sintéticos compartidos (`eval/synthetic.py`)

**Files:**
- Create: `backend/eval/__init__.py` (vacío), `backend/eval/synthetic.py`, `backend/test_synthetic.py`
- Modify: `backend/test_consensus_and_plane.py` (importa `_tubo`, `_bola`, `_une`, `_limpia`, `vaso_con_saco`, `SACO` desde `eval.synthetic`; los tests no cambian)

**Interfaces:**
- Produces:

```python
Vec3 = tuple[float, float, float]
def limpia(poly) -> vtk.vtkPolyData                      # triangula + limpia (el `_limpia` actual)
def tubo(centro=(0,0,0), largo=60.0, radio=1.0, segmentos=60, res=20, eje="y") -> vtk.vtkPolyData   # el `_tubo` actual + eje opcional ("x"|"y"|"z")
def bola(centro, radio, res=26) -> vtk.vtkPolyData
def une(*polys) -> vtk.vtkPolyData
def tubo_con_saco() -> tuple[vtk.vtkPolyData, Vec3]       # (malla, centro del saco) = (vaso_con_saco(), SACO)
def bifurcacion_sin_saco() -> vtk.vtkPolyData             # tubo en y (largo 60, r 1.2) + dos ramas (r 0.9, largo 25) saliendo de (0,0,0) a ±35° en el plano xy
def tubo_curvo_sin_saco() -> vtk.vtkPolyData              # arco de 90° de radio 12 mm, r 1.2 (polilínea de 40 puntos por vtkTubeFilter)
def saco_en_borde() -> tuple[vtk.vtkPolyData, Vec3]       # tubo largo 60 r 1 cortado por el plano y = 20 (vtkClipPolyData, sin tapa → aristas abiertas) + saco r 3 en (0, 10, 2.2)
def tubo_mas_isla() -> vtk.vtkPolyData                    # tubo largo 60 r 1 + bola r 1.5 en (15, 0, 0) (sin tocar el tubo)
def bifurcacion_con_saco_apical() -> tuple[vtk.vtkPolyData, Vec3]   # bifurcacion_sin_saco() + bola r 2.5 en (0, 3.5, 0) (ápice de la Y, pegada)
SACO: np.ndarray                                          # (0, 5, 2.2), como hoy
```

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_synthetic.py
import numpy as np
import vtk
from eval.synthetic import (bifurcacion_con_saco_apical, bifurcacion_sin_saco, saco_en_borde,
                            tubo, tubo_con_saco, tubo_curvo_sin_saco, tubo_mas_isla)


def _n_components(poly):
    c = vtk.vtkPolyDataConnectivityFilter(); c.SetInputData(poly); c.SetExtractionModeToAllRegions(); c.Update()
    return c.GetNumberOfExtractedRegions()


def _open_edge_mm(poly):
    fe = vtk.vtkFeatureEdges(); fe.SetInputData(poly); fe.BoundaryEdgesOn(); fe.FeatureEdgesOff()
    fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff(); fe.Update()
    out = fe.GetOutput(); total = 0.0
    for i in range(out.GetNumberOfCells()):
        ids = out.GetCell(i).GetPointIds()
        a = np.array(out.GetPoint(ids.GetId(0))); b = np.array(out.GetPoint(ids.GetId(1)))
        total += float(np.linalg.norm(a - b))
    return total


def test_cada_generador_da_una_malla_triangulada_no_vacia():
    for poly in (tubo_con_saco()[0], bifurcacion_sin_saco(), tubo_curvo_sin_saco(),
                 saco_en_borde()[0], tubo_mas_isla(), bifurcacion_con_saco_apical()[0]):
        assert poly.GetNumberOfPoints() > 100 and poly.GetNumberOfPolys() > 100


def test_la_isla_es_un_componente_aparte_y_la_bifurcacion_uno_solo():
    assert _n_components(tubo_mas_isla()) == 2
    assert _n_components(bifurcacion_sin_saco()) == 1
    assert _n_components(bifurcacion_con_saco_apical()) == 1


def test_el_borde_cortado_tiene_aristas_abiertas_y_el_tubo_cerrado_no():
    assert _open_edge_mm(saco_en_borde()[0]) > 3.0
    assert _open_edge_mm(tubo()) < 1e-6


def test_el_saco_declarado_esta_sobre_la_malla():
    for poly, saco in (tubo_con_saco(), saco_en_borde(), bifurcacion_con_saco_apical()):
        pts = np.array([poly.GetPoint(i) for i in range(poly.GetNumberOfPoints())])
        assert np.linalg.norm(pts - np.array(saco), axis=1).min() < 3.5


def test_el_tubo_admite_otro_eje():
    pts = tubo(largo=20.0, eje="x")
    b = pts.GetBounds()
    assert b[1] - b[0] > 15 and b[3] - b[2] < 5
```

- [ ] **Step 2: Ver fallar** → `cd backend && .venv\Scripts\python -m pytest -q test_synthetic.py` FAIL (módulo inexistente).

- [ ] **Step 3: Implementación** → mueve `_limpia`, `_tubo`, `_bola`, `_une`, `vaso_con_saco`, `SACO` desde `test_consensus_and_plane.py` (líneas ~56–96) a `eval/synthetic.py` con los nombres públicos; `tubo(…, eje)` genera la polilínea a lo largo del eje elegido; `tubo_curvo_sin_saco` construye la polilínea del arco (`centro + 12·(cos θ, sin θ, 0)`, θ de 0 a π/2, 40 puntos) y la pasa por `vtkTubeFilter` con radio 1,2 y tapas; `saco_en_borde` recorta con `vtkClipPolyData` (`vtkPlane` origen (0,20,0), normal (0,−1,0), `InsideOutOn`) sin tapar; las bifurcaciones unen tubos rotados (`vtkTransformPolyDataFilter` con `RotateZ(±35)`) a un tronco; todo pasa por `limpia`. `test_consensus_and_plane.py` importa `from eval.synthetic import limpia as _limpia, tubo as _tubo, bola as _bola, une as _une, SACO` y mantiene la fixture `vaso_con_saco` llamando a `tubo_con_saco()[0]`. Comentario WHY: los generadores salen de los tests porque el banco de pruebas (Task 2) también los necesita.

- [ ] **Step 4: Verificar** → `pytest -q test_synthetic.py test_consensus_and_plane.py` en verde.

- [ ] **Step 5: Commit**

```bash
git add backend/eval/__init__.py backend/eval/synthetic.py backend/test_synthetic.py backend/test_consensus_and_plane.py
git commit -m "Los vasos sintéticos de los tests pasan a eval/synthetic con seis casos para el banco de detección"
```

---

### Task 2: Banco de pruebas y línea base (`eval/detection_bench.py`)

**Files:**
- Create: `backend/eval/detection_bench.py`, `backend/eval/results/baseline.json`, `backend/test_detection_bench.py`
- Modify: `.gitignore` (asegurar que `backend/eval/results/*.json` NO está ignorado: añadir `!backend/eval/results/*.json` si una regla `*.json` o `backend/*_report.json` lo tapa; comprobar con `git check-ignore -v`), `README.md` (sección nueva «Banco de detección» con la tabla de la línea base)

**Interfaces:**
- Consumes: generadores de Task 1; `routers.detect._detect_hits(poly, modality, detector)`, `_detector_for_modality(modality)`, `services.aneurysm_consensus.hit_patch`, `hit_diameter_mm`; `services.mesh_components.keep_main_tree`.
- Produces:

```python
@dataclass
class BenchCase:
    name: str
    mesh: Callable[[], vtk.vtkPolyData] | Path
    lesion_mm: Vec3 | None
    modality: str = "XA"
    expect_rank_max: int | None = None     # None = sin lesión
    expect_fp_max: int = 1
    real: bool = False                      # Case 3: slow, se salta si falta

@dataclass
class BenchResult:
    name: str; lesion_rank: int | None; lesion_distance_mm: float | None
    false_positives: int; rejected_true: int; rejected_fp: int; n_accepted: int; n_rejected: int; seconds: float

LESION_HIT_MM = 8.0
def find_case3_session(downsample_factor: int) -> Path | None     # backend/data/sessions/*/ con state.txt: dicom.modality=XA, seg.downsample_factor=<n>, meshes/vessel_tree.vtp
def synthetic_cases() -> list[BenchCase]                          # los seis
def real_cases() -> list[BenchCase]                               # case3_native, case3_half (los que existan)
def run_case(case: BenchCase, *, vetoes: bool = True) -> BenchResult   # vetoes=False hasta Task 4 (parámetro aceptado desde ya)
def run_bench(cases, *, vetoes=True) -> list[BenchResult]
def to_json(results) -> dict; def print_table(results) -> None
if __name__ == "__main__": argparse --json PATH --no-vetoes --only NAME
```

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_detection_bench.py
import pytest
from eval.detection_bench import (BenchCase, real_cases, run_bench, run_case, synthetic_cases)

SYN = {c.name: c for c in synthetic_cases()}


def test_hay_seis_sinteticos_con_sus_expectativas():
    assert set(SYN) == {"tubo_con_saco", "bifurcacion_sin_saco", "tubo_curvo_sin_saco",
                        "saco_en_borde", "tubo_mas_isla", "bifurcacion_con_saco_apical"}
    assert SYN["tubo_con_saco"].lesion_mm is not None and SYN["bifurcacion_sin_saco"].lesion_mm is None


@pytest.mark.parametrize("name", sorted(SYN))
def test_los_sinteticos_cumplen_sus_umbrales(name):
    c = SYN[name]
    r = run_case(c)
    assert r.rejected_true == 0, "un veto nunca quita la lesión"
    if c.lesion_mm is not None:
        assert r.lesion_rank is not None and r.lesion_rank <= c.expect_rank_max
    assert r.false_positives <= c.expect_fp_max


@pytest.mark.slow
@pytest.mark.parametrize("case", real_cases(), ids=lambda c: c.name)
def test_case3_cumple_su_umbral(case):
    r = run_case(case)
    assert r.rejected_true == 0
    assert r.lesion_rank is not None and r.lesion_rank <= case.expect_rank_max


def test_sin_sesion_de_case3_no_hay_casos_reales(monkeypatch, tmp_path):
    import eval.detection_bench as b
    monkeypatch.setattr(b, "SESSIONS_DIR", tmp_path)
    assert real_cases() == []
```

Si `real_cases()` está vacío en el entorno, el parametrize `slow` queda sin casos y pytest lo marca como skip (usa `pytest.param` o `pytest.skip` dentro si hace falta).

- [ ] **Step 2: Ver fallar** → FAIL (módulo inexistente).

- [ ] **Step 3: Implementación** → `run_case`: construye la malla (llama al generador o `read_vtp(Path)` + `keep_main_tree` para las reales), `hits, _ = _detect_hits(poly, modality, _detector_for_modality(modality))` con `top` grande (pasar `top=30` a `consensus` a través de un parámetro nuevo opcional de `_detect_hits`, por defecto `_MAX_CANDIDATES`), aplica los vetos si `vetoes` y existe `services.candidate_vetoes` (import protegido: hasta Task 4 no existe → sin vetos), toma los 5 primeros aceptados, calcula: `lesion_rank` = puesto 1-based del primer aceptado a < `LESION_HIT_MM` de la lesión; `lesion_distance_mm` = mínimo sobre aceptados+descartados; `false_positives` = aceptados a ≥ `LESION_HIT_MM` (todos si no hay lesión); `rejected_true` = 1 si algún descartado está a < `LESION_HIT_MM` y ningún aceptado lo está; `rejected_fp` = descartados restantes; `seconds`. `find_case3_session` parsea `state.txt` (líneas `clave=valor`). Expectativas: sintéticos con lesión `expect_rank_max=1`, sin lesión `expect_fp_max=1`; Case 3 nativa `expect_rank_max=2`, media `3`. Corre `python -m eval.detection_bench --no-vetoes --json eval/results/baseline.json` y commitea el resultado; si una fila de Case 3 no cumple su umbral en la línea base, ajusta `expect_rank_max` de esa fila al valor medido y anótalo en el README (regla de Global Constraints). README: sección «Banco de detección» con la tabla y el comando.

- [ ] **Step 4: Verificar** → `pytest -q test_detection_bench.py test_synthetic.py` (los `slow` se saltan sin Case 3; ejecútalos con `-m slow` si la sesión existe y anota los tiempos). `git check-ignore -v backend/eval/results/baseline.json` no debe devolver nada.

- [ ] **Step 5: Commit**

```bash
git add backend/eval/detection_bench.py backend/eval/results/baseline.json backend/test_detection_bench.py backend/routers/detect.py .gitignore README.md
git commit -m "Banco de detección: Case 3 y seis sintéticos con métricas fijas, y la línea base commiteada"
```

---

### Task 3: Vetos con motivo (`services/candidate_vetoes.py`)

**Files:**
- Create: `backend/services/candidate_vetoes.py`, `backend/test_candidate_vetoes.py`

**Interfaces:**
- Consumes: `ConsensusHit` (`position`, `radius_mm`, `candidate`), `hit_patch(poly, hit) -> (patch, patch_kind)`; generadores de Task 1.
- Produces:

```python
@dataclass(frozen=True)
class Veto:
    reason: Literal["borde", "isla", "bifurcacion", "forma"]
    label: str        # «Recorte de la malla» | «Resto de segmentación» | «Unión de ramas» | «No es sacular»
    detail: str       # una frase con la cifra que lo decidió

BORDER_TOL_MM = 1.0; OPEN_EDGE_MM = 3.0; ISLAND_FRAC = 0.02; BIF_RADIUS_K = 1.5; BIF_MIN_RADIUS_MM = 3.0; NECK_RATIO = 0.85; NECK_SLICES = 10
LABELS: dict[str, str]

def open_edge_length_mm(poly) -> float
def touches_bbox_face(patch, tree, tol_mm) -> bool
def component_fraction(tree, point) -> tuple[float, bool]      # (fracción de vértices del componente que contiene el punto más cercano, es_el_mayor)
def crossing_count(tree, center, radius_mm) -> int             # contornos de corte de la malla con la esfera
def neck_ratio(patch) -> float | None                          # sección mínima / diámetro máximo a lo largo del eje principal; None si el parche tiene < 3 cortes válidos
def veto_border(tree, hit, patch) -> Veto | None
def veto_island(tree, hit, patch) -> Veto | None
def veto_bifurcation(tree, hit, patch) -> Veto | None
def veto_shape(tree, hit, patch, patch_kind) -> Veto | None     # solo "region"
def evaluate(tree, hit, patch, patch_kind) -> Veto | None       # el primero en el orden fijado
```

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_candidate_vetoes.py
import numpy as np
import pytest
import vtk
from eval.synthetic import (bifurcacion_con_saco_apical, bifurcacion_sin_saco, saco_en_borde,
                            tubo, tubo_con_saco, tubo_curvo_sin_saco, tubo_mas_isla, bola, une)
from routers.detect import _detect_hits, _detector_for_modality
from services.aneurysm_consensus import hit_patch
from services.candidate_vetoes import (component_fraction, crossing_count, evaluate, neck_ratio,
                                       open_edge_length_mm, veto_bifurcation, veto_border, veto_island, veto_shape)


def _hits(poly):
    det = _detector_for_modality("XA")
    hits, _ = _detect_hits(poly, "XA", det, top=30)
    return [(h, *hit_patch(poly, h)) for h in hits]


def _nearest(hits, pt, within=8.0):
    best = min(hits, key=lambda t: np.linalg.norm(np.array(t[0].position) - pt))
    assert np.linalg.norm(np.array(best[0].position) - pt) < within
    return best


class TestBorde:
    def test_el_extremo_cortado_se_veta_y_el_saco_pegado_al_borde_no(self):
        poly, saco = saco_en_borde()
        hits = _hits(poly)
        h, patch, kind = _nearest(hits, np.array(saco))
        assert veto_border(poly, h, patch) is None
        cortado = [t for t in hits if t[0].position[1] > 17.0]
        assert cortado and veto_border(poly, *cortado[0][:2]) is not None
        assert veto_border(poly, *cortado[0][:2]).reason == "borde"

    def test_un_tubo_cerrado_no_tiene_aristas_abiertas(self):
        assert open_edge_length_mm(tubo()) < 1e-6


class TestIsla:
    def test_la_bola_suelta_se_veta_y_el_tubo_no(self):
        poly = tubo_mas_isla()
        frac_isla, mayor = component_fraction(poly, (15.0, 0.0, 0.0))
        assert frac_isla < 0.02 and not mayor
        frac_tubo, mayor_t = component_fraction(poly, (0.0, 0.0, 1.0))
        assert mayor_t
        hits = _hits(poly)
        h, patch, _ = _nearest(hits, np.array([15.0, 0.0, 0.0]), within=4.0)
        assert veto_island(poly, h, patch).reason == "isla"

    def test_un_arbol_pequeno_de_un_solo_componente_no_se_veta(self):
        poly = une(tubo(largo=6.0, radio=1.0, segmentos=6, res=8), bola((0, 1.5, 1.2), 1.4, res=10))
        _, mayor = component_fraction(poly, (0.0, 1.5, 1.2))
        assert mayor


class TestBifurcacion:
    def test_la_union_sin_saco_tiene_tres_salidas_y_se_veta(self):
        poly = bifurcacion_sin_saco()
        assert crossing_count(poly, (0.0, 0.0, 0.0), 4.0) >= 3
        assert crossing_count(tubo(), (0.0, 0.0, 0.0), 4.0) == 2
        hits = _hits(poly)
        h, patch, kind = _nearest(hits, np.zeros(3), within=6.0)
        assert veto_bifurcation(poly, h, patch) is not None

    def test_el_saco_en_el_apice_no_se_veta(self):
        poly, saco = bifurcacion_con_saco_apical()
        hits = _hits(poly)
        h, patch, kind = _nearest(hits, np.array(saco))
        assert veto_bifurcation(poly, h, patch) is None


class TestForma:
    def test_el_saco_tiene_cuello_y_la_curva_no(self):
        poly, saco = tubo_con_saco()
        h, patch, kind = _nearest(_hits(poly), np.array(saco))
        if kind == "region":
            assert neck_ratio(patch) < 0.85 and veto_shape(poly, h, patch, kind) is None
        curva = tubo_curvo_sin_saco()
        for h, patch, kind in _hits(curva):
            if kind == "region":
                assert veto_shape(curva, h, patch, kind) is not None

    def test_un_parche_vacio_o_minimo_no_lanza(self):
        vacio = vtk.vtkPolyData()
        poly, _ = tubo_con_saco()
        h = _hits(poly)[0][0]
        assert neck_ratio(vacio) is None
        assert veto_shape(poly, h, vacio, "region") is None
        assert veto_bifurcation(poly, h, vacio) is None
        assert veto_border(poly, h, vacio) is None


def test_evaluate_respeta_el_orden_y_devuelve_el_primero():
    poly, _ = saco_en_borde()
    hits = _hits(poly)
    cortado = [t for t in hits if t[0].position[1] > 17.0][0]
    v = evaluate(poly, cortado[0], cortado[1], cortado[2])
    assert v is not None and v.reason == "borde" and v.label == "Recorte de la malla"
```

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementación** → `open_edge_length_mm`: `vtkFeatureEdges` (solo boundary) y suma de longitudes. `touches_bbox_face`: alguna coordenada de los bounds del parche a < `tol` de la cara correspondiente de los bounds del árbol. `component_fraction`: `vtkPolyDataConnectivityFilter` en modo `ClosestPointRegion` con el punto, fracción = puntos del componente / puntos del árbol; `es_el_mayor` comparando con el modo `LargestRegion`. `crossing_count`: `vtkClipPolyData` con `vtkSphere` (`InsideOutOn`), luego `vtkFeatureEdges` boundary sobre el recorte y `vtkPolyDataConnectivityFilter` AllRegions → número de contornos (un tubo que atraviesa da 2, una Y da 3; los contornos abiertos del propio árbol se descartan si estaban ya en `open_edge_length_mm` del árbol: compara contra las aristas abiertas originales por distancia). `neck_ratio`: eje principal del parche (PCA de sus puntos), 10 cortes con `vtkCutter` + `vtkPlane` entre el 10 % y el 90 % de la extensión; diámetro de cada corte = extensión máxima del contorno; ratio = mínimo / máximo; `None` si menos de 3 cortes válidos. `veto_border`: `touches_bbox_face(patch, tree, BORDER_TOL_MM) and open_edge_length_mm(patch) > OPEN_EDGE_MM`. `veto_island`: `frac < ISLAND_FRAC and not mayor`. `veto_bifurcation`: `crossing_count(tree, hit.position, max(BIF_MIN_RADIUS_MM, BIF_RADIUS_K·hit.radius_mm)) >= 3 and (neck_ratio(patch) is None or neck_ratio(patch) >= NECK_RATIO)`. `veto_shape`: solo `patch_kind == "region"`, `neck_ratio(patch) is not None and >= NECK_RATIO`. Todos devuelven `None` ante parches vacíos. `evaluate` en el orden fijado. Comentarios WHY en español por veto (qué falso positivo caza y por qué no caza la lesión de Case 3).

- [ ] **Step 4: Verificar** → `pytest -q test_candidate_vetoes.py`. Ajusta constantes solo si un test del banco lo exige y anótalo.

- [ ] **Step 5: Commit**

```bash
git add backend/services/candidate_vetoes.py backend/test_candidate_vetoes.py
git commit -m "Vetos con motivo para los candidatos: borde, isla, bifurcación y forma"
```

---

### Task 4: Los vetos entran en el banco; se mide su efecto

**Files:**
- Modify: `backend/eval/detection_bench.py` (quita el import protegido: usa `candidate_vetoes.evaluate` siempre que `vetoes=True`), `backend/eval/results/with_vetoes.json` (nuevo, commiteado), `backend/test_detection_bench.py` (los tests de sintéticos corren CON vetos por defecto; un test compara `with_vetoes` contra `baseline`: ningún `lesion_rank` empeora y `false_positives` no sube en ningún caso), `README.md` (tabla con ambas columnas), constantes de `candidate_vetoes.py` si el banco lo exige (anotar cada cambio)

- [ ] **Step 1: Test que falla**

```python
# añadir a backend/test_detection_bench.py
import json
from pathlib import Path
RESULTS = Path(__file__).resolve().parent / "eval" / "results"

def test_los_vetos_no_empeoran_ninguna_fila_del_banco():
    base = {r["name"]: r for r in json.loads((RESULTS / "baseline.json").read_text())["results"]}
    con = {r["name"]: r for r in json.loads((RESULTS / "with_vetoes.json").read_text())["results"]}
    for name, b in base.items():
        c = con[name]
        assert c["rejected_true"] == 0
        if b["lesion_rank"] is not None:
            assert c["lesion_rank"] is not None and c["lesion_rank"] <= b["lesion_rank"]
        assert c["false_positives"] <= b["false_positives"]
```

- [ ] **Step 2: Ver fallar** → FAIL (`with_vetoes.json` no existe).

- [ ] **Step 3: Implementación** → genera `with_vetoes.json` con `python -m eval.detection_bench --json eval/results/with_vetoes.json` (vetos activos); si alguna fila empeora, ajusta la constante responsable en `candidate_vetoes.py` (nunca el canal), vuelve a generar ambos JSON y anota en el README qué constante y por qué. README: tabla «sin vetos / con vetos» por caso (puesto, falsos positivos, descartados).

- [ ] **Step 4: Verificar** → `pytest -q test_detection_bench.py test_candidate_vetoes.py` (y `-m slow` si Case 3 está).

- [ ] **Step 5: Commit**

```bash
git add backend/eval/detection_bench.py backend/eval/results/with_vetoes.json backend/test_detection_bench.py backend/services/candidate_vetoes.py README.md
git commit -m "El banco mide los vetos: ninguna fila empeora y los falsos positivos bajan"
```

---

### Task 5: API: `rejected`, `rank`, `veto`, estado y la morfometría invalidada

**Files:**
- Modify: `backend/models/detection.py`, `backend/routers/detect.py`, `backend/test_candidato_elegido.py` (si asume `n_candidates == len(candidates)`)
- Create: `backend/test_detect_api.py` (no existe; patrón `TestClient(app)` + sesiones creadas con `create_session()` y `write_vtp` en `session_subdir(sid, "meshes") / "vessel_tree.vtp"`, como hacen las clases de API de `test_consensus_and_plane.py` ~líneas 405–430)

**Interfaces:**
- Consumes: `candidate_vetoes.evaluate` (Task 3).
- Produces (modelos):

```python
class Veto(BaseModel): reason: Literal["borde","isla","bifurcacion","forma"]; label: str; detail: str
class AneurysmCandidate(BaseModel): ... + rank: int; veto: Veto | None = None
class DetectionDiagnostics(BaseModel): ... + n_rejected: int = 0; rejected_by_reason: dict[str, int] = {}
class AneurysmDetectionResult(BaseModel): ... + rejected: list[AneurysmCandidate] = []; morphometry_invalidated: bool = False
# estado: detect.cand_00N.veto_reason ("" si aceptado), detect.n_rejected; REDETECT_MOVE_MM = 2.0
```

- [ ] **Step 1: Tests que fallan**

```python
# backend/test_detect_api.py (nuevo)
def test_la_respuesta_separa_aceptados_y_descartados_con_ids_consecutivos(session_con_saco_en_borde):
    r = client.post(f"/api/detect/{session_con_saco_en_borde}").json()
    ids = [c["id"] for c in r["candidates"]] + [c["id"] for c in r["rejected"]]
    assert ids == [f"cand-{i:03d}" for i in range(1, len(ids) + 1)]
    assert all(c["veto"] is None for c in r["candidates"])
    assert all(c["veto"]["label"] for c in r["rejected"])
    assert r["diagnostics"]["n_rejected"] == len(r["rejected"])
    assert [c["rank"] for c in r["candidates"]] == list(range(1, len(r["candidates"]) + 1))
    assert len(r["candidates"]) <= 5


def test_un_descartado_se_puede_medir(session_con_saco_en_borde):
    r = client.post(f"/api/detect/{session_con_saco_en_borde}").json()
    assert r["rejected"], "este caso tiene un extremo cortado que se descarta"
    cid = r["rejected"][0]["id"]
    m = client.get(f"/api/morphometry/{session_con_saco_en_borde}", params={"candidate_id": cid})
    assert m.status_code == 200


def test_re_detectar_sin_medida_previa_no_invalida_nada(session_con_saco):
    r1 = client.post(f"/api/detect/{session_con_saco}").json()
    assert r1["morphometry_invalidated"] is False


def test_re_detectar_con_el_elegido_movido_limpia_la_morfometria(session_con_saco):
    client.post(f"/api/detect/{session_con_saco}")
    client.get(f"/api/morphometry/{session_con_saco}", params={"candidate_id": "cand-001"})
    from services.sessions import write_state
    # Simula que la detección anterior tenía el elegido 10 mm más allá.
    write_state(session_con_saco, "detect.cand_001.centroid_x", "999")
    r = client.post(f"/api/detect/{session_con_saco}").json()
    assert r["morphometry_invalidated"] is True
    from services.sessions import read_state
    assert read_state(session_con_saco, "detect.selected_candidate") in ("", None)


def test_sin_candidatos_rejected_vacio(session_tubo_liso):
    r = client.post(f"/api/detect/{session_tubo_liso}").json()
    assert r["candidates"] == [] and r["rejected"] == [] and r["diagnostics"]["n_rejected"] == 0
```

Las fixtures `session_con_saco`, `session_con_saco_en_borde`, `session_tubo_liso` crean una sesión (`create_session`), escriben `meshes/vessel_tree.vtp` con el generador correspondiente (`tubo_con_saco()[0]`, `saco_en_borde()[0]`, `tubo(radio=2.5)`) y `dicom.modality=XA` en el estado; copia el patrón de `test_consensus_and_plane.py` (`_session_with_mesh` o equivalente).

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementación** → en `_run_detection_sync`: antes de `_clear_detection_state`, lee `detect.selected_candidate` y, si existe, su `centroid_*` (la detección anterior); `_detect_hits(..., top=30)`; para cada hit `patch, patch_kind = hit_patch(poly, hit)`, `veto = evaluate(poly, hit, patch, patch_kind)`; aceptados = los sin veto hasta `_MAX_CANDIDATES`; descartados = los con veto (todos) + los aceptados que sobraron del tope NO entran (se tiran, como hoy); ids consecutivos: aceptados `cand-001..`, luego descartados; escribe `aneurysm_cand_00N.vtp` para ambos grupos (así `GET /morphometry` acepta descartados), estado con `veto_reason`, `detect.n_candidates` = aceptados, `detect.n_rejected`; `_clear_detection_state` limpia también `veto_reason` y `n_rejected` y recorre `n_candidates + n_rejected`; invalidación: tras calcular los ids, si había elegido y (no está entre aceptados+descartados o `‖centro_nuevo − centro_viejo‖ > REDETECT_MOVE_MM`), aplica la rama `morphometry=True` de la limpieza (saco, `_MORPHO_STATE_KEYS`, tratamiento, `selected_candidate`) y marca `morphometry_invalidated=True`. `DetectionDiagnostics` con `n_rejected` y `rejected_by_reason`. Comentarios WHY.

- [ ] **Step 4: Verificar** → `pytest -q test_detect_api.py test_candidato_elegido.py test_consensus_and_plane.py test_detect_diagnostics.py test_morphometry_sac.py` en verde (ajusta tests que asumían `n_candidates == len(archivos)`); `test_detector_case3.py -m slow` si Case 3 está.

- [ ] **Step 5: Commit**

```bash
git add backend/models/detection.py backend/routers/detect.py backend/test_detect_api.py backend/test_candidato_elegido.py
git commit -m "La detección devuelve los descartados con su motivo y limpia la morfometría si el elegido cambió"
```

---

### Task 6: Tipos del cliente y store

**Files:**
- Modify: `frontend/src/api/types.ts` (`Veto`, `AneurysmCandidate.rank`, `.veto`, `DetectionDiagnostics.n_rejected`, `.rejected_by_reason`, `AneurysmDetectionResult.rejected`, `.morphometry_invalidated`), `frontend/src/store/planning.tsx` (`rejectedCandidates: AneurysmCandidate[]`, `setRejectedCandidates`; `candidates` sigue siendo la lista de aceptados; el store expone `allCandidates = [...candidates, ...rejectedCandidates]` memoizado y `selectedCandidate` indexa ESA lista combinada; `MorphometryPanel` y `Viewer` leen `allCandidates[selectedCandidate]`), `frontend/src/components/morphometry/MorphometryPanel.tsx`, `frontend/src/vtk/Viewer.tsx`, `frontend/src/store/planning.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
// añadir a planning.test.tsx
it("los descartados se guardan aparte y el índice elegido recorre la lista combinada", () => {
  const { result } = renderHook(() => usePlanning(), { wrapper });
  const c = (id: string) => ({ id, center_mm: { x: 0, y: 0, z: 0 }, max_diameter_mm: 3, confidence: 0.5, dome_mesh_url: "", selected: false, channels: [], patch_kind: "region" as const, rank: 1, veto: null });
  act(() => { result.current.setCandidates([c("cand-001")]); result.current.setRejectedCandidates([{ ...c("cand-002"), veto: { reason: "borde", label: "Recorte de la malla", detail: "" } }]); });
  expect(result.current.allCandidates.map((x) => x.id)).toEqual(["cand-001", "cand-002"]);
  act(() => result.current.setSelectedCandidate(1));
  expect(result.current.allCandidates[result.current.selectedCandidate!].id).toBe("cand-002");
  act(() => result.current.reset());
  expect(result.current.rejectedCandidates).toEqual([]);
});
```

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementación** → tipos; store con `rejectedCandidates` (reiniciado en `reset()` y donde se reinician `candidates`), `allCandidates` memoizado; sustituye las lecturas `candidates[selectedCandidate]` en `MorphometryPanel.tsx` (~79) y `Viewer.tsx` (~300, ~478) por `allCandidates[selectedCandidate]`; `setSelectedCandidate` sigue anulando morfometría/tratamiento al cambiar.

- [ ] **Step 4: Verificar** → `npx tsc --noEmit -p .`, `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/components/morphometry/MorphometryPanel.tsx frontend/src/vtk/Viewer.tsx
git commit -m "El cliente conoce los candidatos descartados y el elegido recorre la lista combinada"
```

---

### Task 7: Panel: «Descartados (n)», «Puesto» y el aviso de morfometría

**Files:**
- Modify: `frontend/src/components/planning/DetectPanel.tsx`
- Create: `frontend/src/components/planning/DetectPanel.test.tsx`, `frontend/src/components/planning/detectCopy.ts` (puro: etiquetas y textos)

**Interfaces:**
- Produces:

```ts
// detectCopy.ts
export const VETO_HINT = "Descartado por un criterio geométrico: compruébalo en el 3D antes de medir.";
export const MORPHO_INVALIDATED = "La morfometría se ha limpiado: el candidato elegido cambió al re-detectar.";
export function rankLabel(rank: number): string;                 // "Puesto #3"
export function rejectedSummary(n: number): string;              // "Descartados (3)" / "Descartados (0)"
```

- [ ] **Step 1: Tests que fallan**

```tsx
// frontend/src/components/planning/DetectPanel.test.tsx (Testing Library; mock de `api.detect` que devuelve 1 aceptado y 2 descartados, uno «borde» y otro «isla»; render dentro de PlanningProvider con sessionId)
it("muestra los aceptados con su puesto y un desplegable cerrado con los descartados", async () => {
  render(<Wrapped />);
  expect(await screen.findByText("Puesto #1")).toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: /Descartados \(2\)/ });
  expect(screen.queryByText("Recorte de la malla")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByText("Recorte de la malla")).toBeInTheDocument();
  expect(screen.getByText("Resto de segmentación")).toBeInTheDocument();
});
it("elegir un descartado lo selecciona y enseña la advertencia", async () => {
  render(<Wrapped />);
  fireEvent.click(await screen.findByRole("button", { name: /Descartados/ }));
  fireEvent.click(screen.getByText("cand-002"));
  expect(screen.getByText(/compruébalo en el 3D/)).toBeInTheDocument();
});
it("avisa cuando la respuesta trae la morfometría invalidada", async () => {
  mockDetect({ morphometry_invalidated: true });
  render(<Wrapped />);
  expect(await screen.findByText(/La morfometría se ha limpiado/)).toBeInTheDocument();
});
it("sin candidatos sigue explicando el vacío y no muestra el desplegable", async () => {
  mockDetect({ candidates: [], rejected: [], diagnostics: { ...diag, regions_analyzed: 0 } });
  render(<Wrapped />);
  expect(await screen.findByText(/No se encontró/)).toBeInTheDocument();   // usa el texto real de explainEmpty
  expect(screen.queryByRole("button", { name: /Descartados/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementación** → `run()` guarda `setRejectedCandidates(res.rejected)` y `setMorphoInvalidated(res.morphometry_invalidated)` (estado local); la barra y el porcentaje pasan a «Puesto #n» (el `confidence` sigue alimentando el ancho de la barra); «Baja confianza» pasa a «Puesto bajo» si `rank > 3`; debajo de la lista, si `rejected.length > 0`, un `<button aria-expanded>` «Descartados (n)» que despliega filas con id, Ø est., `<Badge variant="warning">{veto.label}</Badge>` con `title={veto.detail}`; clic en una fila → `setSelectedCandidate(candidates.length + i)`; si el elegido es un descartado, nota `VETO_HINT`; si `morphoInvalidated`, aviso `MORPHO_INVALIDATED` (se oculta al re-detectar sin invalidación). El texto «Lo que se pinta de azul no es el saco» no cambia.

- [ ] **Step 4: Verificar** → vitest del archivo, `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`. Navegador (Case 3, paso Detección): la lesión entre los dos primeros; «Descartados (n)» con motivos; elegir uno descartado lo pinta en el 3D y muestra la advertencia; medir y re-detectar no avisa (determinista); captura `t7_*.png`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/planning/DetectPanel.tsx frontend/src/components/planning/DetectPanel.test.tsx frontend/src/components/planning/detectCopy.ts
git commit -m "El panel de detección enseña los descartados con su motivo, el puesto y el aviso de morfometría"
```

---

### Task 8: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección de detección: vetos, banco, «Puesto», descartados, invalidación), este plan (casillas).

- [ ] **Step 1: Comprobación completa**

```bash
cd backend && .venv\Scripts\python -m pytest -q --no-header -p no:cacheprovider --deselect test_corredor_abordaje.py && .venv\Scripts\python -m pytest -q --no-header -p no:cacheprovider test_corredor_abordaje.py
cd backend && .venv\Scripts\python -m pytest -q -m slow test_detection_bench.py test_detector_case3.py     # si Case 3 está
cd frontend && npx tsc -b && npx vitest run && npm run build
```

Expected: backend sin fallos nuevos frente a la línea base (28 + 8–9); frontend en verde.

- [ ] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)

1. Detección en Case 3 nativa: la lesión (tronco basilar) entre los dos primeros aceptados; los descartados listados con motivo.
2. Cada descartado, al elegirlo, se pinta en el 3D y muestra la advertencia; «Analizar morfometría» funciona sobre él.
3. «Puesto #n» en lugar del porcentaje; el texto del azul se mantiene.
4. Medir cand-001, re-detectar: sin aviso (determinista). Cambiar de malla (re-segmentar) y re-detectar: aviso de morfometría limpiada si el elegido cambió.
5. Sin candidatos (umbral absurdo): explicación del vacío, sin desplegable.
6. `python -m eval.detection_bench` imprime la tabla con Case 3 nativa (y media si existe) y los seis sintéticos; los JSON de `eval/results/` coinciden con el README.

- [ ] **Step 3: README y commit de cierre**

```bash
git add README.md docs/superpowers/plans/2026-10-02-calidad-deteccion.md
git commit -m "Cierre de la calidad de la detección (D4): lista manual y README"
```
