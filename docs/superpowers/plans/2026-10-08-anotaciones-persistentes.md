# Anotaciones persistentes (E2) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reglas, ángulos, regiones y marcadores que se crean en los cortes o en la malla, se ven en todas las vistas, se guardan con la sesión y salen en capturas e informe.

**Architecture:** Un modelo puro (`vtk/annotations.ts`) con las fórmulas y la proyección a corte, espejado en `backend/services/annotations.py` para el informe; el store guarda la lista y el borrador; `SliceView`/`MeshView` dibujan con capas SVG `.hud-anot` posicionadas con la misma proyección que ya usan para el crosshair y las trazas; un router `/api/annotations/{sid}` guarda `annotations.json` en la carpeta de la sesión (viaja con snapshot/restore); el panel «Anotaciones» vive bajo el panel del paso y guarda solo con 600 ms de espera; la captura lee las formas del DOM y las pinta.

**Tech Stack:** React 19, vtk.js 36, vitest + Testing Library, FastAPI + Pydantic, pytest, reportlab.

**Spec:** `docs/superpowers/specs/2026-10-08-anotaciones-persistentes-design.md`

## Global Constraints

- Coordenadas: mm del marco del volumen (vóxel × espaciado, origen 0; `voxelToMm`/`mmToVoxel` en `frontend/src/vtk/geometry.ts`; `meta.shape = [nz, ny, nx]`, `meta.spacing = [sz, sy, sx]`). Nunca LPS.
- Fracciones de corte: `u = x/(nx−1)`; axial `v = y/(ny−1)`; coronal y sagital `v = 1 − z/(nz−1)` (Viewer.tsx `planeCfg`, ~1263).
- Tipos y puntos: regla 2, ángulo 3 (vértice en medio), región ≥ 3 con `plane` obligatorio, marcador 1. `label` ≤ 40, `note` ≤ 500, máximo 200 anotaciones por sesión.
- Tolerancia para dibujar en un corte: todos los puntos a ≤ 0,5 × espaciado del eje del plano; la región solo en su plano e índice exactos.
- Colores (nuevos en `vtk/planeColors.ts`): regla ámbar `#f5c02e`, ángulo cian `#39c6e0`, región verde `#5fd38a`, marcador magenta `#e06ad1`.
- Guardado automático 600 ms tras cada cambio; `saveProgress` espera al guardado en vuelo. Auditoría solo al borrar (`ACT_ANNOTATIONS_DELETED`).
- Seguridad: router incluido con `_private` (`backend/main.py` ~270), `session_exists` + `require_session(db, user, sid)` (`services/access.py:82`), ids con `valid_session_id` (ya lo hacen `session_dir`/`_live`).
- Contrato de la API: tras tocar modelos Pydantic, `cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json && cd ../frontend && npm run gen:api`; cada tipo nuevo de respuesta entra en `frontend/src/api/contract.check.ts` (patrón `Cabe<Completo<S["X"]>, ui.X>`).
- Atajos: R, A, G, T (ámbito visor), Supr y Retroceso (ámbito visor); H y P siguen reservadas; nunca con el foco en un campo de texto (`isTextEntryTarget`).
- Copia y comentarios WHY en español; sin dependencias nuevas; nunca `git add frontend/package-lock.json` ni `backend/data/`.
- Commits terminan con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM`.
- Frontend: `cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run build` (línea base 752 tests / 101 archivos). Backend: un archivo por proceso (`.venv/Scripts/python -m pytest -q -p no:cacheprovider <archivo>`); fallos preexistentes de entorno: `test_clip_manufacture`, `test_clip_orders`, `test_scene_render`, `test_oclusion_clip`, `test_auth_coverage` (1), `test_corredor_abordaje`, `test_apposition`, `test_followup` (caída nativa).

## Review Focus

1. Un clic en modo anotación sobre un corte **no** mueve el crosshair ni el foco, y en 3D sí lo mueve (como todo pick): si no, medir en un corte lo cambia de sitio bajo el ratón. → Task 4 test «clic en modo anotación no mueve el crosshair».
2. Una región creada en coronal 56 no aparece en coronal 57 ni en axial, pero una regla hecha en 3D con sus dos puntos dentro de medio espaciado del corte sí. → Task 1 tests de `onSlice`.
3. El guardado automático no pisa una lista más nueva: dos cambios en 300 ms producen un solo PUT con el último estado, y un PUT que falla deja «sin guardar» sin perder nada del store. → Task 6 test del hook con temporizadores falsos.
4. Un usuario de otro paciente recibe 403, una sesión inexistente 404, y una lista inválida (región de 2 puntos, 201 elementos) 422 sin tocar el fichero. → Task 2 tests del router.
5. Al resegmentar (`resetDownstream`) las anotaciones se vacían en el store **y** en disco; al cambiar de paso no. → Task 3 (store) y Task 6 (el hook guarda la lista vacía).

---

### Task 1: Modelo puro, proyección a corte y fórmulas espejo del backend

**Files:**
- Create: `frontend/src/vtk/annotations.ts`, `frontend/src/vtk/annotations.test.ts`, `frontend/src/vtk/sliceCoords.ts`, `frontend/src/vtk/sliceCoords.test.ts`, `backend/services/annotations.py`, `backend/test_annotations_measure.py`
- Modify: `frontend/src/vtk/planeColors.ts` (colores), `frontend/src/api/types.ts` (tipo `Annotation`)

**Interfaces:**
- Produces:

```ts
// api/types.ts
export type AnnotationKind = "regla" | "angulo" | "region" | "marcador";
export interface AnnotationPlane { plane: "axial" | "coronal" | "sagital"; index: number }
export interface Annotation {
  id: string; kind: AnnotationKind; points: [number, number, number][];
  plane: AnnotationPlane | null; label: string; note: string; visible: boolean;
  created_at: string; created_by: string;
}
export interface AnnotationsResult { annotations: Annotation[] }
// vtk/annotations.ts
export type Measure = { kind: "distancia"; mm: number } | { kind: "angulo"; deg: number }
  | { kind: "area"; mm2: number; perimetroMm: number } | null;
export const POINTS_NEEDED: Record<AnnotationKind, number>;        // regla 2, angulo 3, region 3 (mínimo), marcador 1
export const KIND_PREFIX: Record<AnnotationKind, string>;          // R, A, G, M
export function measure(a: Pick<Annotation, "kind" | "points">): Measure;
export function formatMeasure(m: Measure): string;                 // «12,4 mm» · «63°» · «48 mm²» · ""
export function nextLabel(kind: AnnotationKind, existing: { label: string }[]): string;  // «R1», «R2»… (el primer hueco libre no: el máximo + 1)
export function polygonArea(points: Vec3[], normalAxis: 0 | 1 | 2): number;             // cordón sobre los dos ejes del plano
export function onSlice(a: Annotation, plane: Plane, index: number, meta: VolumeMeta): boolean;
export function centroid(points: Vec3[]): Vec3;
export function toCsv(list: Annotation[]): string;                 // cabecera + una fila por anotación
// vtk/sliceCoords.ts
export const PLANE_AXIS: Record<Plane, 0 | 1 | 2>;                 // axial 2 (z), coronal 1 (y), sagital 0 (x)
export function uvToMm(plane: Plane, index: number, u: number, v: number, meta: VolumeMeta): Vec3;
export function mmToUv(plane: Plane, p: Vec3, meta: VolumeMeta): { u: number; v: number };
// planeColors.ts
export const ANNOTATION_HEX: Record<AnnotationKind, string>;
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/sliceCoords.test.ts
import { describe, expect, it } from "vitest";
import { mmToUv, uvToMm } from "./sliceCoords";
import type { VolumeMeta } from "../api/types";
const meta = { shape: [101, 201, 301], spacing: [2, 0.5, 0.25] } as unknown as VolumeMeta;   // [nz, ny, nx], [sz, sy, sx]
describe("uvToMm / mmToUv", () => {
  it("axial: u→x, v→y, el índice fija z", () => {
    expect(uvToMm("axial", 10, 0.5, 0.25, meta)).toEqual([150 * 0.25, 50 * 0.5, 10 * 2]);
  });
  it("coronal y sagital invierten v como el visor (v = 1 − f(z))", () => {
    expect(uvToMm("coronal", 20, 0, 1, meta)).toEqual([0, 20 * 0.5, 0]);
    expect(uvToMm("sagital", 30, 1, 0, meta)).toEqual([30 * 0.25, 200 * 0.5, 100 * 2]);
  });
  it("ida y vuelta en los tres planos", () => {
    for (const plane of ["axial", "coronal", "sagital"] as const) {
      const p = uvToMm(plane, 7, 0.3, 0.8, meta);
      const { u, v } = mmToUv(plane, p, meta);
      expect(u).toBeCloseTo(0.3, 9); expect(v).toBeCloseTo(0.8, 9);
    }
  });
});
// frontend/src/vtk/annotations.test.ts
import { describe, expect, it } from "vitest";
import { formatMeasure, measure, nextLabel, onSlice, polygonArea, toCsv } from "./annotations";
import type { Annotation, VolumeMeta } from "../api/types";
const meta = { shape: [100, 100, 100], spacing: [1, 1, 1] } as unknown as VolumeMeta;
const base = { id: "x", label: "", note: "", visible: true, created_at: "", created_by: "" };
describe("measure", () => {
  it("regla: distancia euclídea", () => {
    expect(measure({ kind: "regla", points: [[0, 0, 0], [3, 4, 0]] })).toEqual({ kind: "distancia", mm: 5 });
  });
  it("ángulo en el vértice central: recto y obtuso", () => {
    expect(measure({ kind: "angulo", points: [[1, 0, 0], [0, 0, 0], [0, 1, 0]] })).toEqual({ kind: "angulo", deg: 90 });
    const m = measure({ kind: "angulo", points: [[1, 0, 0], [0, 0, 0], [-1, 1, 0]] });
    expect(m && m.kind === "angulo" ? m.deg : NaN).toBeCloseTo(135, 6);
  });
  it("región: área del cordón y perímetro, también no convexa", () => {
    const sq = measure({ kind: "region", points: [[0, 0, 5], [2, 0, 5], [2, 2, 5], [0, 2, 5]] });
    expect(sq).toEqual({ kind: "area", mm2: 4, perimetroMm: 8 });
    const l = polygonArea([[0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0]], 2);
    expect(l).toBeCloseTo(5, 9);
  });
  it("marcador: sin medida; formato con coma decimal", () => {
    expect(measure({ kind: "marcador", points: [[1, 1, 1]] })).toBeNull();
    expect(formatMeasure({ kind: "distancia", mm: 12.449 })).toBe("12,4 mm");
    expect(formatMeasure({ kind: "angulo", deg: 63.4 })).toBe("63°");
    expect(formatMeasure({ kind: "area", mm2: 47.9, perimetroMm: 1 })).toBe("48 mm²");
  });
});
describe("nextLabel", () => {
  it("prefijo por tipo y máximo + 1, aunque falten números", () => {
    expect(nextLabel("regla", [])).toBe("R1");
    expect(nextLabel("regla", [{ label: "R1" }, { label: "R7" }, { label: "A3" }])).toBe("R8");
    expect(nextLabel("marcador", [{ label: "lesión" }])).toBe("M1");
  });
});
describe("onSlice", () => {
  const regla: Annotation = { ...base, kind: "regla", points: [[10, 10, 20.3], [30, 10, 19.8]], plane: null };
  const region: Annotation = { ...base, kind: "region", points: [[1, 56, 1], [5, 56, 1], [5, 56, 5]], plane: { plane: "coronal", index: 56 } };
  it("una regla hecha en 3D se dibuja en el corte que pasa por sus puntos", () => {
    expect(onSlice(regla, "axial", 20, meta)).toBe(true);
    expect(onSlice(regla, "axial", 22, meta)).toBe(false);          // 1,7 mm > 0,5 × 1 mm
    expect(onSlice(regla, "coronal", 10, meta)).toBe(true);
  });
  it("la región solo en su plano e índice", () => {
    expect(onSlice(region, "coronal", 56, meta)).toBe(true);
    expect(onSlice(region, "coronal", 57, meta)).toBe(false);
    expect(onSlice(region, "axial", 1, meta)).toBe(false);
  });
});
describe("toCsv", () => {
  it("una fila por anotación con valor y puntos", () => {
    const csv = toCsv([{ ...base, id: "1", kind: "regla", label: "R1", points: [[0, 0, 0], [3, 4, 0]], plane: { plane: "axial", index: 3 } }]);
    expect(csv.split("\n")[0]).toBe("nombre;tipo;valor;unidad;corte;nota;puntos_mm");
    expect(csv.split("\n")[1]).toBe("R1;regla;5,0;mm;AX 3;;0 0 0 | 3 4 0");
  });
});
```

```python
# backend/test_annotations_measure.py
import math
from services.annotations import measure, polygon_area

def test_regla_distancia():
    assert measure("regla", [[0, 0, 0], [3, 4, 0]]) == ("mm", 5.0)

def test_angulo_en_el_vertice():
    assert measure("angulo", [[1, 0, 0], [0, 0, 0], [0, 1, 0]]) == ("°", 90.0)
    assert math.isclose(measure("angulo", [[1, 0, 0], [0, 0, 0], [-1, 1, 0]])[1], 135.0)

def test_region_area_cordon_no_convexa():
    assert polygon_area([[0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0]], 2) == 5.0
    assert measure("region", [[0, 0, 5], [2, 0, 5], [2, 2, 5], [0, 2, 5]]) == ("mm²", 4.0)

def test_marcador_sin_medida_y_puntos_insuficientes():
    assert measure("marcador", [[1, 1, 1]]) is None
    assert measure("regla", [[1, 1, 1]]) is None
```

- [x] **Step 2: Ver fallar** → `npx vitest run src/vtk/annotations.test.ts src/vtk/sliceCoords.test.ts` y `pytest test_annotations_measure.py`: FAIL (módulos inexistentes).

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/sliceCoords.ts
/* Conversión exacta entre las fracciones (u, v) del rectángulo de un corte y
   los mm del marco del volumen. Hasta ahora un clic se redondeaba a vóxel
   (planeCfg): una regla de 3 mm con vóxeles de 0,5 mm salía con ±0,5 mm de
   error por extremo. La región de un plano no lo soporta. */
import type { VolumeMeta } from "../api/types";
import type { Plane, Vec3 } from "./geometry";
export const PLANE_AXIS: Record<Plane, 0 | 1 | 2> = { axial: 2, coronal: 1, sagital: 0 };
// La misma inversión de v que el visor: coronal y sagital enseñan z hacia arriba.
export function uvToMm(plane: Plane, index: number, u: number, v: number, meta: VolumeMeta): Vec3 {
  const [nz, ny, nx] = meta.shape, [sz, sy, sx] = meta.spacing;
  const span = (n: number, f: number) => (n > 1 ? f * (n - 1) : 0);
  if (plane === "axial") return [span(nx, u) * sx, span(ny, v) * sy, index * sz];
  if (plane === "coronal") return [span(nx, u) * sx, index * sy, span(nz, 1 - v) * sz];
  return [index * sx, span(ny, u) * sy, span(nz, 1 - v) * sz];
}
export function mmToUv(plane: Plane, p: Vec3, meta: VolumeMeta): { u: number; v: number } {
  const [nz, ny, nx] = meta.shape, [sz, sy, sx] = meta.spacing;
  const f = (n: number, mm: number, s: number) => (n > 1 ? mm / s / (n - 1) : 0.5);
  if (plane === "axial") return { u: f(nx, p[0], sx), v: f(ny, p[1], sy) };
  if (plane === "coronal") return { u: f(nx, p[0], sx), v: 1 - f(nz, p[2], sz) };
  return { u: f(ny, p[1], sy), v: 1 - f(nz, p[2], sz) };
}
```

`annotations.ts`: `measure` (regla `Math.hypot`; ángulo `acos` del producto escalar normalizado, acotado a [−1, 1]; región `polygonArea` + perímetro cerrado; `null` si faltan puntos), `formatMeasure` con `toLocaleString("es-ES", { maximumFractionDigits })` (1 decimal mm, 0 en grados y mm²), `nextLabel` (regex `^R(\d+)$`), `onSlice` (eje = `PLANE_AXIS[plane]`, centro del corte `index × spacing[2 − eje]`, tolerancia `0.5 × spacing`; región: `a.plane?.plane === plane && a.plane.index === index`), `centroid`, `toCsv` (separador `;`, valor con coma, `corte` = «AX 3» / «COR n» / «SAG n» / «3D», puntos `x y z | …` con 1 decimal). `planeColors.ts`: `ANNOTATION_HEX`. `backend/services/annotations.py`: `measure(kind, points) -> tuple[str, float] | None` y `polygon_area(points, normal_axis)` con las mismas reglas y redondeo a 1 decimal (mm) o entero (°, mm²) **solo al formatear** (`format_measure`), no en el número.

- [x] **Step 4: Verificar** → ambos en verde; `npx tsc --noEmit -p .`.
- [x] **Step 5: Commit** → `git add frontend/src/vtk/annotations.ts frontend/src/vtk/annotations.test.ts frontend/src/vtk/sliceCoords.ts frontend/src/vtk/sliceCoords.test.ts frontend/src/vtk/planeColors.ts frontend/src/api/types.ts backend/services/annotations.py backend/test_annotations_measure.py && git commit -m "Anotaciones: modelo puro, medidas y proyección a corte, con las mismas fórmulas en el servidor"`

---

### Task 2: API `/api/annotations/{sid}`: guardar en la sesión, permisos, auditoría al borrar, contrato

**Files:**
- Create: `backend/models/annotations.py`, `backend/routers/annotations.py`, `backend/test_annotations_api.py`
- Modify: `backend/main.py` (~270, `include_router(annotations.router, dependencies=_private)`), `backend/services/audit.py` (~40, `ACT_ANNOTATIONS_DELETED = "ANNOTATIONS_DELETED"`), `frontend/src/api/client.ts` (~437), `frontend/src/api/contract.check.ts` (~124), `frontend/openapi.json`, `frontend/src/api/schema.gen.ts` (regenerados)

**Interfaces:**
- Consumes: `session_exists`, `session_dir` (`services/sessions.py:92,128`), `require_session` (`services/access.py:82`), `get_db`, `get_current_user`, `audit_append`, `audit_patient`, `session_patient_id` (`services/access.py`).
- Produces:

```python
# models/annotations.py
class AnnotationPlane(BaseModel): plane: Literal["axial", "coronal", "sagital"]; index: int = Field(ge=0)
class Annotation(BaseModel):
    id: str = Field(min_length=1, max_length=64); kind: Literal["regla", "angulo", "region", "marcador"]
    points: list[Position3D]; plane: AnnotationPlane | None = None
    label: str = Field(max_length=40); note: str = Field(default="", max_length=500); visible: bool = True
    created_at: str = ""; created_by: str = ""
    # validador: regla 2, angulo 3, marcador 1, region ≥ 3 y plane obligatorio
class AnnotationsIn(BaseModel): annotations: list[Annotation] = Field(max_length=200)
class AnnotationsResult(BaseModel): annotations: list[Annotation]
# routers/annotations.py  (prefix /api/annotations)
GET  /{session_id}  -> AnnotationsResult          # [] si no hay fichero
PUT  /{session_id}  (AnnotationsIn) -> AnnotationsResult   # escribe annotations.json atómico; created_by/created_at del servidor si venían vacíos
FILE = "annotations.json"   # en session_dir(sid)
```

```ts
// client.ts
getAnnotations: (sessionId: string) => get<AnnotationsResult>(`/api/annotations/${sessionId}`),
putAnnotations: (sessionId: string, annotations: Annotation[]) =>
  request<AnnotationsResult>(`/api/annotations/${sessionId}`, { method: "PUT", body: JSON.stringify({ annotations }), headers: { "Content-Type": "application/json" } }),
```

- [x] **Step 1: Tests que fallan**

```python
# backend/test_annotations_api.py
"""Las anotaciones viven en la carpeta de la sesión y solo las ve quien ve al paciente."""
import json
from fastapi.testclient import TestClient
from main import app
from services.sessions import create_session, session_dir, snapshot_session, rehydrate_session
from test_access_control import login, make_patient_for   # helpers existentes: adapta los nombres a los reales del archivo

REGLA = {"id": "a1", "kind": "regla", "points": [{"x": 0, "y": 0, "z": 0}, {"x": 3, "y": 4, "z": 0}],
         "plane": {"plane": "axial", "index": 3}, "label": "R1", "note": "", "visible": True, "created_at": "", "created_by": ""}

def test_sin_usuario_401(client_anon):
    assert client_anon.get(f"/api/annotations/{create_session()}").status_code == 401

def test_sesion_inexistente_404(client_admin):
    assert client_admin.get("/api/annotations/00000000-0000-0000-0000-000000000000").status_code == 404
    assert client_admin.get("/api/annotations/../../etc").status_code in (404, 422)

def test_ida_y_vuelta_y_created_by(client_admin):
    sid = create_session()
    r = client_admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    assert r.status_code == 200
    a = r.json()["annotations"][0]
    assert a["created_by"] == "admin" and a["created_at"]
    assert client_admin.get(f"/api/annotations/{sid}").json()["annotations"][0]["label"] == "R1"
    assert (session_dir(sid) / "annotations.json").exists()

def test_validacion_por_tipo_no_toca_el_fichero(client_admin):
    sid = create_session()
    mala = {**REGLA, "kind": "region"}                       # región de 2 puntos
    assert client_admin.put(f"/api/annotations/{sid}", json={"annotations": [mala]}).status_code == 422
    sin_plano = {**REGLA, "kind": "region", "plane": None, "points": [{"x": 0, "y": 0, "z": 0}] * 3}
    assert client_admin.put(f"/api/annotations/{sid}", json={"annotations": [sin_plano]}).status_code == 422
    assert client_admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA] * 201}).status_code == 422
    assert not (session_dir(sid) / "annotations.json").exists()

def test_viaja_con_snapshot_y_restore(client_admin):
    sid = create_session()
    client_admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    snapshot_session(sid)
    nuevo = rehydrate_session(sid)
    assert client_admin.get(f"/api/annotations/{nuevo}").json()["annotations"][0]["id"] == "a1"

def test_otro_paciente_403(client_admin, client_otro_usuario, sesion_de_paciente_ajeno):
    assert client_otro_usuario.get(f"/api/annotations/{sesion_de_paciente_ajeno}").status_code == 403

def test_auditoria_solo_al_borrar(client_admin, audit_events):
    sid = create_session()
    client_admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA, {**REGLA, "id": "a2", "label": "R2"}]})
    assert not [e for e in audit_events() if e["action"] == "ANNOTATIONS_DELETED"]
    client_admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    ev = [e for e in audit_events() if e["action"] == "ANNOTATIONS_DELETED"]
    assert len(ev) == 1 and ev[0]["payload"]["deleted"] == ["a2"]
```

Los fixtures `client_anon`, `client_admin`, `client_otro_usuario`, `sesion_de_paciente_ajeno` y `audit_events` se construyen como en `test_access_control.py` y `test_auditoria_eventos.py` (mismos helpers; si allí son funciones y no fixtures, úsalas igual).

- [x] **Step 2: Ver fallar** → 404 en todas (router inexistente).
- [x] **Step 3: Implementación** → modelos con `@model_validator` por tipo; router: `if not session_exists(sid): 404`; `require_session(db, current_user, sid)`; GET lee el JSON (lista vacía si no existe o está corrupto → log + `[]`); PUT compara ids anteriores y nuevos, escribe con `tmp + os.replace`, rellena `created_by = current_user.username` y `created_at = datetime.now(UTC).isoformat()` cuando vengan vacíos, audita `ACT_ANNOTATIONS_DELETED` con `{"session_id", "deleted": [...], "remaining": n}` y `audit_patient(paciente)` si la sesión tiene paciente (`session_patient_id` → `db.get(Patient, …)`). `main.py`: `include_router(..., dependencies=_private)`. Cliente y `contract.check.ts` (`Cabe<Completo<S["Annotation"]>, ui.Annotation>`, `Cabe<Completo<S["AnnotationsResult"]>, ui.AnnotationsResult>`; `AnnotationsIn` en la lista de cuerpos de petición). Regenerar contrato.
- [x] **Step 4: Verificar** → `pytest test_annotations_api.py test_openapi_contract.py test_auth_coverage.py::test_every_route_is_either_public_by_design_or_authenticated` (este último: la ruta nueva debe responder 401 anónima); `npx tsc --noEmit -p .`.
- [x] **Step 5: Commit** → `git add backend/models/annotations.py backend/routers/annotations.py backend/test_annotations_api.py backend/main.py backend/services/audit.py frontend/src/api/client.ts frontend/src/api/contract.check.ts frontend/openapi.json frontend/src/api/schema.gen.ts && git commit -m "API de anotaciones: se guardan en la sesión, con permisos por paciente y auditoría al borrar"`

---

### Task 3: Store y retirada del calibrador 3D

**Files:**
- Modify: `frontend/src/store/planning.tsx` (PickMode ~357, `measurements` ~107/364/414/540/590/652), `frontend/src/store/planning.test.tsx`, `frontend/src/vtk/Viewer.tsx` (`onPick` ~1216, `markers` ~1069, `lines` ~1116, `pickText` ~1766, colores ~123), `frontend/src/pages/Workspace.tsx` (~20 import, ~221–228 Collapsible «Mediciones 3D»)
- Delete: `frontend/src/components/vessels/MeasurementPanel.tsx` (y su test si existe)

**Interfaces:**
- Produces (store):

```ts
export type PickMode = | "cl_source" | "cl_target" | "neck_origin" | "neck_dome" | "neck_rim" | "scissors"
  | "crop_center" | "erase_piece" | "traj_entry" | "traj_target" | "lesion_mark"
  | "anot_regla" | "anot_angulo" | "anot_region" | "anot_marcador" | null;     // "measure" desaparece
annotations: Annotation[]; setAnnotations: (a: Annotation[] | ((prev: Annotation[]) => Annotation[])) => void;  // touch
annotationDraft: Vec3[]; setAnnotationDraft: (p: Vec3[]) => void;
selectedAnnotation: string | null; setSelectedAnnotation: (id: string | null) => void;
annotationsSync: "guardado" | "guardando" | "error"; setAnnotationsSync(s): void;      // lo escribe el hook de Task 6
setAnnotationsLoaded: (a: Annotation[]) => void;     // sin touch: lo que llega del servidor al reanudar (Task 6)
annotationsFlushRef: RefObject<(() => Promise<void>) | null>;   // Task 6 lo rellena; saveProgress lo espera
export const ANNOTATION_MODES: Record<AnnotationKind, PickMode>;  // regla → "anot_regla"…
export function kindOfMode(m: PickMode): AnnotationKind | null;
```

- `resetDownstream()` vacía `annotations`, `annotationDraft`, `selectedAnnotation`; `reset()` también. Cambiar `pickMode` a un modo que no sea de anotación vacía el borrador.

- [x] **Step 1: Tests que fallan**

```ts
// añadir a planning.test.tsx
describe("anotaciones", () => {
  it("arrancan vacías, setAnnotations marca la sesión sucia y acepta función", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper });
    expect(result.current.annotations).toEqual([]); expect(result.current.annotationDraft).toEqual([]); expect(result.current.dirty).toBe(false);
    const a = { id: "1", kind: "regla" as const, points: [[0, 0, 0], [1, 0, 0]] as Vec3[], plane: null, label: "R1", note: "", visible: true, created_at: "", created_by: "" };
    act(() => result.current.setAnnotations([a]));
    act(() => result.current.setAnnotations((p) => p.map((x) => ({ ...x, label: "cuello" }))));
    expect(result.current.annotations[0].label).toBe("cuello"); expect(result.current.dirty).toBe(true);
  });
  it("resegmentar las vacía; cambiar de modo de pinchado vacía el borrador", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper });
    act(() => { result.current.setPickMode("anot_regla"); result.current.setAnnotationDraft([[1, 1, 1]]); result.current.setSelectedAnnotation("x"); });
    act(() => result.current.setPickMode("neck_rim"));
    expect(result.current.annotationDraft).toEqual([]);
    act(() => result.current.setAnnotations([{ id: "1", kind: "marcador", points: [[0, 0, 0]], plane: null, label: "M1", note: "", visible: true, created_at: "", created_by: "" }]));
    act(() => result.current.resetDownstream());
    expect(result.current.annotations).toEqual([]); expect(result.current.selectedAnnotation).toBeNull();
  });
});
```

- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → store según las firmas (`setAnnotations = touch(...)` con soporte de función); quitar `Measurement`, `measurements`, `measurePending`, `setMeasurements`, `setMeasurePending` y el modo `measure` en store, Viewer (`onPick`, `markers`, `lines`, `pickText`, deps) y Workspace (import + Collapsible); borrar `MeasurementPanel.tsx`. En Viewer `onPick`: los modos `anot_*` llaman a `addAnnotationPoint(xyz, null)` que define Task 4 (de momento un `TODO` **no** vale: en esta tarea el 3D añade al borrador y cierra regla/ángulo/marcador con la lógica mínima `draft.length + 1 === POINTS_NEEDED[kind]` → crea la anotación con `nextLabel`, `plane: null`, `created_at: new Date().toISOString()`, `created_by: ""`, la selecciona y desarma; región en 3D: ignora el clic). `pickText`: `anot_regla` → «Regla: clic en el primer punto» / «…segundo punto»; `anot_angulo` → «Ángulo: primer punto · vértice · tercer punto» según `draft.length`; `anot_region` → «Región: clic en un corte alrededor del hallazgo (n puntos) · Intro o el primer punto cierra»; `anot_marcador` → «Marcador: clic donde quieras la nota».
- [x] **Step 4: Verificar** → `npx vitest run src/store src/vtk/Viewer* src/pages`, `npx tsc --noEmit -p .` (debe dejar de compilar cualquier resto de `measurements`), `npx vitest run` completo.
- [x] **Step 5: Commit** → `git add -A frontend/src/store frontend/src/vtk/Viewer.tsx frontend/src/pages/Workspace.tsx frontend/src/components/vessels && git commit -m "Anotaciones en el store; el calibrador 3D deja paso a las reglas"`

---

### Task 4: Crear anotaciones en los cortes con precisión subvóxel

**Files:**
- Create: `frontend/src/vtk/annotationDraft.ts`, `frontend/src/vtk/annotationDraft.test.ts`
- Modify: `frontend/src/vtk/SliceView.tsx` (props ~36–62, `frac` ~257, mouseup ~317, `onKey`), `frontend/src/vtk/SliceView.test.tsx`, `frontend/src/vtk/Viewer.tsx` (`planeCfg` ~1263, `renderPane` SliceView ~1440)

**Interfaces:**
- Produces:

```ts
// annotationDraft.ts (puro)
export type DraftStep = { draft: Vec3[]; done: Vec3[] | null };
/** Añade un punto; `done` trae los puntos de la anotación terminada (y el borrador vuelve a []). */
export function addPoint(kind: AnnotationKind, draft: Vec3[], p: Vec3): DraftStep;
/** Un clic a ≤ radiusPx del primer punto cierra la región (si ya tiene ≥ 3). */
export function closesRegion(draftPx: { x: number; y: number }[], clickPx: { x: number; y: number }, radiusPx?: number): boolean;  // radiusPx = 8
export function closeRegion(draft: Vec3[]): Vec3[] | null;     // null si < 3 puntos
export function removeLast(draft: Vec3[]): Vec3[];
// SliceView props nuevos
onPlaneClickMm?: (p: Vec3, px: { x: number; y: number }) => void;   // en modo anotación sustituye a onPlaneClick
annotationMode?: boolean;                                            // true: el clic no mueve el crosshair
onAnnotationKey?: (key: "Enter" | "Backspace" | "Escape") => void;
```

- [x] **Step 1: Tests que fallan**

```ts
// annotationDraft.test.ts
import { describe, expect, it } from "vitest";
import { addPoint, closeRegion, closesRegion, removeLast } from "./annotationDraft";
describe("addPoint", () => {
  it("regla termina al segundo punto, ángulo al tercero, marcador al primero", () => {
    expect(addPoint("regla", [], [0, 0, 0])).toEqual({ draft: [[0, 0, 0]], done: null });
    expect(addPoint("regla", [[0, 0, 0]], [1, 0, 0])).toEqual({ draft: [], done: [[0, 0, 0], [1, 0, 0]] });
    expect(addPoint("angulo", [[0, 0, 0], [1, 0, 0]], [1, 1, 0]).done).toHaveLength(3);
    expect(addPoint("marcador", [], [2, 2, 2]).done).toEqual([[2, 2, 2]]);
  });
  it("la región no termina sola", () => {
    expect(addPoint("region", [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [0, 1, 0]).done).toBeNull();
  });
});
describe("cerrar la región", () => {
  it("por el primer punto a ≤ 8 px, o con Intro si tiene ≥ 3", () => {
    const px = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }];
    expect(closesRegion(px, { x: 15, y: 14 })).toBe(true);
    expect(closesRegion(px, { x: 30, y: 30 })).toBe(false);
    expect(closesRegion(px.slice(0, 2), { x: 10, y: 10 })).toBe(false);
    expect(closeRegion([[0, 0, 0], [1, 0, 0]])).toBeNull();
    expect(closeRegion([[0, 0, 0], [1, 0, 0], [1, 1, 0]])).toHaveLength(3);
    expect(removeLast([[0, 0, 0], [1, 0, 0]])).toEqual([[0, 0, 0]]);
  });
});
// añadir a SliceView.test.tsx (sigue el patrón de montaje y de `box` que ya use el archivo)
it("en modo anotación el clic reporta mm subvóxel y no mueve el crosshair", () => {
  const onPlaneClick = vi.fn(), onPlaneClickMm = vi.fn();
  // render con annotationMode y un box conocido (p. ej. left 0, top 0, w 200, h 200 sobre meta 101×201×301)
  // mousedown + mouseup sin mover en (50, 100):
  expect(onPlaneClick).not.toHaveBeenCalled();
  expect(onPlaneClickMm).toHaveBeenCalledTimes(1);
  const [p] = onPlaneClickMm.mock.calls[0];
  expect(p[0]).toBeCloseTo(0.25 * 300 * 0.25, 6);   // u = 0,25 → x = 75 vóxeles × 0,25 mm
});
it("Intro, Retroceso y Esc llegan a onAnnotationKey solo en modo anotación", () => { /* fireEvent.keyDown en el contenedor */ });
```

- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → `annotationDraft.ts` puro. `SliceView`: en el mouseup sin arrastre (`~317`), si `p.annotationMode` y `p.onPlaneClickMm`: `const f = frac(e); if (f) p.onPlaneClickMm(uvToMm(p.plane, p.index, f.u, f.v, p.meta), { x: e.clientX − rect.left, y: e.clientY − rect.top })`; si no, `onPlaneClick` como hoy. `onKey`: con `annotationMode`, Enter/Backspace/Escape → `onAnnotationKey` y `preventDefault`; el resto como hoy. Doble clic en modo región → `onAnnotationKey("Enter")`. `Viewer`: `addAnnotationPoint(p: Vec3, plane: AnnotationPlane | null, px?)` usa `addPoint`; para región en 2D comprueba `closesRegion` con los puntos del borrador proyectados a px (`mmToUv` × `box` — SliceView pasa en `px` las coordenadas del clic y Viewer recibe también `boxOf(plane)`; alternativa aceptada: SliceView calcula `closesRegion` él mismo con `annotationDraftPx` prop y emite `onAnnotationKey("Enter")`); `finish(points, plane)` crea la anotación (`nextLabel`, `created_at`, `created_by: ""`), la selecciona, vacía el borrador y desarma (`setPickMode(null)`); Enter → `closeRegion`; Backspace → `removeLast`; Escape → borrador vacío y desarmar. `planeCfg` pasa `annotationMode = kindOfMode(pickMode) !== null`, `onPlaneClickMm`, `onAnnotationKey`. La región en 3D sigue ignorándose (la pista lo dice).
- [x] **Step 4: Verificar** → vitest de los archivos, `tsc`, navegador: regla en axial (dos clics, valor en el panel de Task 6 aún no existe: comprobar en React DevTools o con `console` que el store tiene la anotación), región en coronal cerrada por el primer punto y por Intro, Esc cancela.
- [x] **Step 5: Commit** → `git add frontend/src/vtk/annotationDraft.ts frontend/src/vtk/annotationDraft.test.ts frontend/src/vtk/SliceView.tsx frontend/src/vtk/SliceView.test.tsx frontend/src/vtk/Viewer.tsx && git commit -m "Anotaciones en los cortes: clics subvóxel, región que se cierra por el primer punto o con Intro"`

---

### Task 5: Verlas en los cortes y en el 3D

**Files:**
- Create: `frontend/src/vtk/annotationOverlay.ts`, `frontend/src/vtk/annotationOverlay.test.ts`, `frontend/src/vtk/hud/HudAnnotations.tsx`, `frontend/src/vtk/hud/HudAnnotations.test.tsx`
- Modify: `frontend/src/vtk/SliceView.tsx` (capa SVG junto a `freeSegment` ~351), `frontend/src/vtk/MeshView.tsx` (prop `labels`, capa SVG con `worldToNormalizedDisplay` como `MipView.tsx:476–480`/`planeTrace.ts`), `frontend/src/vtk/Viewer.tsx` (`markers`/`lines` + `labels` + props de SliceView), `frontend/src/vtk/hud/hud.css` (`.hud-anot`)

**Interfaces:**

```ts
// annotationOverlay.ts (puro)
export type Shape =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dashed?: boolean }
  | { kind: "polygon"; points: { x: number; y: number }[]; color: string; fill: string; closed: boolean }
  | { kind: "circle"; x: number; y: number; r: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string };
export interface Box { left: number; top: number; w: number; h: number }
/** Formas en px de la celda para las anotaciones visibles en este corte, más el borrador. */
export function shapesForSlice(list: Annotation[], draft: { kind: AnnotationKind; points: Vec3[] } | null,
  plane: Plane, index: number, meta: VolumeMeta, box: Box, opts: { compact: boolean; selected: string | null }): Shape[];
export function labelFor(a: Annotation, compact: boolean): string;   // «R1 · 12,4 mm» / «R1»
// MeshView
export interface MeshLabel { pos: Vec3; text: string; color: string }
labels?: MeshLabel[];      // capa SVG .hud-anot sobre el lienzo, reposicionada en onModified de la cámara
```

- [x] **Step 1: Tests que fallan** → `annotationOverlay.test.ts`: una regla en el corte produce `line` + 2 `circle` + `text` con las px de `mmToUv × box`; un ángulo produce 2 `line` + `text` en el vértice; una región `polygon closed` con relleno; el borrador de región `polygon` abierto (`closed: false`) y sin texto; `compact` reduce el texto a «R1»; la seleccionada lleva `width` 3; una anotación `visible: false` no sale; `onSlice` falso no sale. `HudAnnotations.test.tsx`: renderiza un `<svg class="hud-anot">` con un `<line>`, un `<polygon>` y un `<text>` a partir de `Shape[]` y nada cuando la lista está vacía.
- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → `HudAnnotations({ shapes, w, h, left, top })` SVG absoluto con `pointer-events: none`; texto con `paint-order: stroke` y trazo oscuro para leerse sobre la imagen. `SliceView` recibe `annotationShapes?: Shape[]` (calculadas en Viewer con `shapesForSlice` y el `box`; como el `box` es estado interno de SliceView, SliceView llama a `p.shapesFor?.(box)` → prop función `annotationShapes?: (box: Box) => Shape[]`). `MeshView`: `labels` → `<svg className="hud-anot">` con `<text>` en `worldToNormalizedDisplay(pos)` × tamaño del lienzo, actualizado en `renderer.getActiveCamera().onModified` y en `ResizeObserver`; en `Viewer`: `lines` suma las reglas/ángulos/regiones visibles (tubo `MeshLine` por segmento, región cerrada), `markers` los puntos del borrador en `PENDING_COLOR` y los marcadores como bola; `labels` con `labelFor(a, false)` en el centroide (regla: punto medio; ángulo: vértice). `hud.css`: `.hud-anot { position:absolute; inset:0; pointer-events:none; } .hud-anot text { font: 10.5px var(--font-mono); paint-order: stroke; stroke: #000; stroke-width: 3px; }`.
- [x] **Step 4: Verificar** → vitest, `tsc`, navegador (Case 3): regla en axial se ve en axial con «R1 · n mm», no en axial ± 2, sí en el 3D con rótulo; región en coronal con relleno; ángulo; marcador con nota; borrador visible mientras se crea; fps del 3D sin caída apreciable con 10 anotaciones.
- [x] **Step 5: Commit** → `git add frontend/src/vtk/annotationOverlay.ts frontend/src/vtk/annotationOverlay.test.ts frontend/src/vtk/hud/HudAnnotations.tsx frontend/src/vtk/hud/HudAnnotations.test.tsx frontend/src/vtk/SliceView.tsx frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/hud/hud.css && git commit -m "Las anotaciones se dibujan en el corte que las contiene y en el 3D, con su valor"`

---

### Task 6: Panel «Anotaciones», guardado automático y reanudar

**Files:**
- Create: `frontend/src/components/annotations/AnnotationsPanel.tsx`, `frontend/src/components/annotations/AnnotationsPanel.test.tsx`, `frontend/src/components/annotations/useAnnotationsSync.ts`, `frontend/src/components/annotations/useAnnotationsSync.test.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (~505–508: `{panel}` + Collapsible «Anotaciones»; `saveProgress` ~130 espera al sync), `frontend/src/App.tsx` (`resumeSession` ~216: `api.getAnnotations`), `frontend/src/vtk/Viewer.tsx` («Ir»: `setFocusMm(centroid)` + índice del plano)

**Interfaces:**

```ts
// useAnnotationsSync.ts
/** Guarda `annotations` 600 ms después del último cambio; expone el estado y una promesa para esperar al vuelo. */
export function useAnnotationsSync(sessionId: string | null, annotations: Annotation[], setAnnotations, setSync): { flush: () => Promise<void> };
// Workspace registra flush en un ref global `window.__anotFlush` NO: lo expone por contexto del store: `annotationsFlushRef` (RefObject<() => Promise<void>>) en PlanningProvider.
// AnnotationsPanel: sin props; lee el store. Botones title: «Regla (R)», «Ángulo (A)», «Región (G)», «Marcador (T)»; fila: nombre editable (click), valor, corte («AX 152» / «3D»), «Ocultar»/«Mostrar», «Ir», «Borrar (Supr)»; «Ocultar todas» / «Mostrar todas»; «Exportar CSV» (descarga `anotaciones-<sesión>.csv` con `toCsv`).
```

- [x] **Step 1: Tests que fallan** → `useAnnotationsSync.test.tsx` (temporizadores falsos, `api.putAnnotations` simulado): dos cambios en 300 ms → un solo PUT con la lista final y `setSync("guardado")`; PUT que rechaza → `setSync("error")` y la lista del store intacta; `flush()` resuelve tras el PUT en vuelo; sin `sessionId` no llama. `AnnotationsPanel.test.tsx`: pulsar «Regla (R)» arma `anot_regla` y queda `aria-pressed`; la lista enseña «R1», «5,0 mm», «AX 3»; renombrar por clic escribe en el store; el ojo alterna `visible`; Supr con la fila seleccionada borra; «Exportar CSV» produce un blob con la cabecera; vacío muestra «Sin anotaciones. Elige una herramienta y pincha en un corte o en la malla».
- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → hook con `useEffect` sobre `annotations` (omite la primera carga: se guarda solo cuando la lista cambia respecto a la cargada, por `useRef` con la última versión guardada; así reanudar no dispara un PUT); `Workspace`: `<Collapsible title="Anotaciones" subtitle="Reglas, ángulos, regiones y notas" storageKey="ws.annotations" badge={n>0 ? <Badge variant="subtle">{n}</Badge> : undefined}>` debajo de `{panel}`, con el estado de sincronía en el subtítulo («guardando…» / «sin guardar»); `saveProgress` hace `await annotationsFlushRef.current?.()` antes del POST; `App.tsx` `resumeSession`: tras la trayectoria, `const an = await api.getAnnotations(r.session_id); planning.setAnnotationsLoaded(an.annotations)` (setter sin `touch`, que además fija la «última versión guardada» del hook: expón `setAnnotationsLoaded` en el store). «Ir»: `setFocusMm(centroid(a.points), meta)` y, con `a.plane`, el índice de ese plano a `a.plane.index`; selecciona la fila.
- [x] **Step 4: Verificar** → vitest, `tsc`, navegador: crear tres anotaciones, ver «guardando…» → nada, recargar la página sin «Guardar progreso» (la sesión viva conserva el fichero) y reanudar desde Pacientes tras «Guardar progreso»: las tres vuelven; renombrar; «Ir»; CSV descargado.
- [x] **Step 5: Commit** → `git add frontend/src/components/annotations frontend/src/pages/Workspace.tsx frontend/src/App.tsx frontend/src/vtk/Viewer.tsx frontend/src/store/planning.tsx && git commit -m "Panel «Anotaciones»: lista editable, guardado automático en la sesión y recuperación al reanudar"`

---

### Task 7: Atajos R / A / G / T / Supr / Retroceso y hoja

**Files:**
- Modify: `frontend/src/vtk/shortcuts.ts` (~24–47 tabla, ~81–95 `matchShortcut`), `frontend/src/vtk/shortcuts.test.ts`, `frontend/src/pages/Workspace.tsx` (~171–196 reenvío por `viewer:shortcut`), `frontend/src/vtk/Viewer.tsx` (`onShortcut` ~1341), `README.md` (tabla «Atajos de teclado»)

- [x] **Step 1: Tests que fallan**

```ts
// añadir a shortcuts.test.ts
it("resuelve R, A, G, T, Supr y Retroceso, y respeta H/P", () => {
  expect(matchShortcut(ev({ key: "r", code: "KeyR" }), null)).toBe("anot-regla");
  expect(matchShortcut(ev({ key: "a", code: "KeyA" }), null)).toBe("anot-angulo");
  expect(matchShortcut(ev({ key: "g", code: "KeyG" }), null)).toBe("anot-region");
  expect(matchShortcut(ev({ key: "t", code: "KeyT" }), null)).toBe("anot-marcador");
  expect(matchShortcut(ev({ key: "Delete", code: "Delete" }), null)).toBe("anot-borrar");
  expect(matchShortcut(ev({ key: "Backspace", code: "Backspace" }), null)).toBe("anot-deshacer-punto");
  expect(matchShortcut(ev({ key: "h", code: "KeyH" }), null)).toBeNull();
  const input = document.createElement("input");
  expect(matchShortcut(ev({ key: "r", code: "KeyR" }), input)).toBeNull();
  expect(matchShortcut(ev({ key: "Backspace", code: "Backspace" }), input)).toBeNull();
});
```

- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → tabla: `anot-regla` «R» «Regla: dos puntos», `anot-angulo` «A» «Ángulo: tres puntos», `anot-region` «G» «Región: contorno en un corte», `anot-marcador` «T» «Marcador con nota», `anot-borrar` «Supr» «Borrar la anotación seleccionada», `anot-deshacer-punto` «Retroceso» «Quitar el último punto de la anotación en curso» (ámbito visor); `matchShortcut` por `code` KeyR/KeyA/KeyG/KeyT y por `key` Delete/Backspace (Backspace solo si hay borrador: eso lo decide Viewer; la tabla siempre lo devuelve). `Workspace` reenvía los ids `anot-*`. `Viewer.onShortcut`: `anot-<tipo>` → si `pickMode === ANNOTATION_MODES[tipo]` desarma, si no arma (vaciando el borrador); `anot-borrar` → quita `selectedAnnotation` del store; `anot-deshacer-punto` → `removeLast` si hay borrador, si no nada (sin `preventDefault` para no romper Retroceso en otros sitios: Workspace solo llama a `preventDefault` cuando Viewer confirma; simplifica: Workspace hace `preventDefault` para `anot-deshacer-punto` solo si `document.activeElement` está dentro del visor). README: seis filas nuevas.
- [x] **Step 4: Verificar** → `npx vitest run src/vtk/shortcuts.test.ts src/vtk/hud/ShortcutsSheet.test.tsx`, `tsc`, navegador: R arma y la pista aparece; R otra vez desarma; Supr borra la seleccionada; Retroceso quita el último punto; nada en un campo de texto.
- [x] **Step 5: Commit** → `git add frontend/src/vtk/shortcuts.ts frontend/src/vtk/shortcuts.test.ts frontend/src/pages/Workspace.tsx frontend/src/vtk/Viewer.tsx README.md && git commit -m "Atajos de anotación: R, A, G, T, Supr y Retroceso, en la hoja y en el README"`

---

### Task 8: Las anotaciones salen en las capturas

**Files:**
- Create: `frontend/src/vtk/readShapes.ts`, `frontend/src/vtk/readShapes.test.ts`
- Modify: `frontend/src/vtk/composeCapture.ts` (`Ctx2D` ~56, `PaneShot` ~36, `paintFrame` ~135), `frontend/src/vtk/composeCapture.test.ts`, `frontend/src/vtk/Viewer.tsx` (`leerVisor` ~542: `...readPaneHud(el), shapes: readPaneShapes(el)`; `estadoVisor` ~500: `annotations_visible`)

**Interfaces:**

```ts
// readShapes.ts: lee los <svg class="hud-anot"> de una celda y devuelve Shape[] en px de la celda
export function readPaneShapes(cell: HTMLElement): Shape[];
// composeCapture.ts
export interface Ctx2D { …; lineWidth: number; beginPath(): void; moveTo(x, y): void; lineTo(x, y): void; closePath(): void; stroke(): void; fill(): void; arc(x, y, r, a0, a1): void; setLineDash(d: number[]): void; measureText(t: string): { width: number } }
export interface PaneShot { …; shapes?: Shape[] }
export function drawShapes(ctx: Ctx2D, rect: PaneRect, shapes: Shape[], fontFamily: string): void;   // tras drawPaneHud
```

- [x] **Step 1: Tests que fallan** → `readShapes.test.ts`: un DOM con `<svg class="hud-anot" style="left:10px;top:5px"><line x1=…/><polygon points="…"/><circle…/><text x y>R1 · 5,0 mm</text></svg>` devuelve las cuatro formas con el desplazamiento del svg sumado; un svg `.hud-decor` se ignora. `composeCapture.test.ts`: `drawShapes` sobre un `Ctx2D` falso registra `moveTo/lineTo/stroke` para la línea, `fill` para el polígono, `arc` para el círculo y `fillText` con fondo (`fillRect` antes) para el texto, todo desplazado por `rect.x/y`.
- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → `drawShapes` después de `drawPaneHud` en `paintFrame`; texto con rectángulo de fondo `rgba(0,0,0,.6)` del ancho de `measureText`. Los lienzos reales (`CanvasRenderingContext2D`) ya cumplen `Ctx2D`; el `Ctx2D` falso de las pruebas existentes gana los métodos nuevos como `vi.fn()`. `estadoVisor.annotations_visible = annotations.filter(a => a.visible).length`.
- [x] **Step 4: Verificar** → vitest, `tsc`, navegador: «Captura» con una regla en axial y un marcador en 3D → la imagen (descargada o guardada) muestra las formas y los rótulos.
- [x] **Step 5: Commit** → `git add frontend/src/vtk/readShapes.ts frontend/src/vtk/readShapes.test.ts frontend/src/vtk/composeCapture.ts frontend/src/vtk/composeCapture.test.ts frontend/src/vtk/Viewer.tsx && git commit -m "Las capturas pintan las anotaciones que se ven en cada celda"`

---

### Task 9: Sección «Anotaciones» del informe

**Files:**
- Modify: `backend/services/report_generator.py` (`ReportData` ~174: `annotations: list[dict]`; `build_report_data_from_session` ~361: leer `annotations.json`; `_build_story` ~766: `_section_annotations` tras `_section_trajectory`; método nuevo con la tabla, patrón de `_section_trajectory` ~1651)
- Create: `backend/test_report_annotations.py`

- [x] **Step 1: Tests que fallan**

```python
# backend/test_report_annotations.py
from services.report_generator import ReportData, ReportGenerator   # el nombre real de la clase que tiene _build_story

def _texts(story):   # concatena el texto de los Paragraph y celdas de Table del story
    ...

def test_la_seccion_entra_en_el_pdf_con_valores_del_servidor():
    data = ReportData()
    data.annotations = [
        {"id": "1", "kind": "regla", "label": "R1", "points": [[0, 0, 0], [3, 4, 0]], "plane": {"plane": "axial", "index": 3}, "note": "", "visible": True},
        {"id": "2", "kind": "angulo", "label": "A1", "points": [[1, 0, 0], [0, 0, 0], [0, 1, 0]], "plane": None, "note": "", "visible": True},
        {"id": "3", "kind": "marcador", "label": "M1", "points": [[1, 1, 1]], "plane": None, "note": "trombo mural", "visible": False},
    ]
    story = ReportGenerator(data)._build_story()
    t = _texts(story)
    assert "Anotaciones" in t and "R1" in t and "5,0 mm" in t and "90°" in t and "AX 3" in t and "3D" in t and "trombo mural" in t

def test_sin_anotaciones_lo_dice():
    story = ReportGenerator(ReportData())._build_story()
    assert "Sin anotaciones" in _texts(story)
```

- [x] **Step 2: Ver fallar.**
- [x] **Step 3: Implementación** → `read_annotations(session_id) -> list[dict]` (JSON o `[]`); `_section_annotations`: h2 «Anotaciones», tabla Nombre · Tipo · Valor · Corte · Nota con `services.annotations.measure`/`format_measure` (tipo en español: Regla, Ángulo, Región, Marcador; corte «AX 3»/«COR n»/«SAG n»/«3D»; las ocultas también salen: lo que se anotó, se anotó), y «Sin anotaciones» si la lista está vacía; estilos de `_section_trajectory`.
- [x] **Step 4: Verificar** → `pytest test_report_annotations.py test_report*.py` (los que existan) y, con el backend arrancado, generar el PDF de Case 3 con dos anotaciones y abrirlo.
- [x] **Step 5: Commit** → `git add backend/services/report_generator.py backend/test_report_annotations.py && git commit -m "El informe lista las anotaciones con su valor medido en el servidor"`

---

### Task 10: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección «Navegación y orientación del visor» gana un apartado «Anotaciones», o sección propia justo después), este plan (casillas).

- [x] **Step 1: Comprobación completa** → `cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run build`; backend por archivo: `test_annotations_measure.py test_annotations_api.py test_report_annotations.py test_openapi_contract.py test_auth_coverage.py test_auditoria_eventos.py test_session_d.py test_access_control.py` en verde (salvo el fallo de entorno conocido de `test_auth_coverage`); contrato regenerado sin diferencias.
- [x] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)
  1. Regla en axial (dos clics): valor en el panel y en el corte; visible en el 3D con rótulo; no visible dos cortes más allá.
  2. Regla en 3D sobre la malla: visible en el 3D; aparece en el corte cuyo índice pasa por sus puntos.
  3. Ángulo en coronal; región en sagital cerrada por el primer punto y otra con Intro; marcador con nota en 3D.
  4. Esc cancela un borrador; Retroceso quita el último punto; Supr borra la seleccionada; R/A/G/T arman y desarman; nada con el foco en un campo.
  5. «Guardar progreso», salir, «Reanudar»: todas vuelven con sus nombres; resegmentar las vacía.
  6. Captura con una regla y una región: la imagen las lleva. Informe PDF con la tabla.
  7. Otro usuario sin el paciente: GET 403 (con curl y su token).
- [x] **Step 3: README y commit de cierre** → `git add README.md docs/superpowers/plans/2026-10-08-anotaciones-persistentes.md && git commit -m "Cierre de las anotaciones persistentes (E2): lista manual y README"`
