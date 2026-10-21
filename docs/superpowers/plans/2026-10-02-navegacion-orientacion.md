# Navegación y orientación (E1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Que VOLUMEN gire alrededor del punto compartido y CENTRAR encuadre lo visible; un preset de distribución 2×2; un modo «Cortes 3D» con los tres cortes en su posición; un reproductor de cortes (escalera arrastrable, teclas, cine con espacio); y una tabla única de atajos con su hoja «?».

**Architecture:** Un módulo puro `vtk/orbit.ts` calcula el centro de giro y la caja visible que `MipView` aplica al manipulador y a CENTRAR. El preset `cuatro` se añade al modelo de `layout.ts` y a `layoutGrid.ts` sin cambiar la clave guardada. El modo `slices3d` reutiliza en `MeshView` el actor de reslice de D2 tres veces. El reproductor es un módulo puro `vtk/cine.ts` más un reloj en `Viewer` que escribe `mprVoxel`; la escalera gana puntero. Los atajos viven en una tabla `vtk/shortcuts.ts` que alimenta manejadores y hoja. Sin backend.

**Tech Stack:** React 19, TypeScript, vtk.js 36.2.1 (`vtkMouseCameraTrackballRotateManipulator.setCenterOfRotation`, `vtkImageSlice` + `vtkImageResliceMapper`, `renderer.resetCamera(bounds)`), vitest + Testing Library. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-02-navegacion-orientacion-design.md`

## Global Constraints

- Sin dependencias nuevas; nunca se commitea `frontend/package-lock.json`; copia y comentarios WHY en español; rótulos HUD en mayúsculas mono.
- Marco geométrico: vóxel × espaciado, origen 0 (`meta.shape = [nz, ny, nx]`, `meta.spacing = [sz, sy, sx]`); el punto compartido en mm es `voxelToMm(mprVoxel, meta)`.
- VOLUMEN: el manipulador de rotación recibe `setCenterOfRotation(punto compartido en mm)` al montar y en cada cambio de `mprVoxel`; CENTRAR = foco en el punto compartido + `resetCamera(visibleBounds)` + reafirmar el centro de giro; en LIBRE además `offsetMm = 0` (D2).
- `visibleBounds(bounds, clip)` con `clip = { mode: "eje", axis: 0|1|2, posMm, acumulado: boolean, reverse: boolean, slabMm } | { mode: "libre", normal, originMm, slabMm | null, acumulado, reverse }`: eje+acumulado → `[min, posMm]` en el eje (o `[posMm, max]` con `reverse`); eje+lámina → `[posMm − slab, posMm + slab]`; libre → la caja de los vértices del `clipPolygon` más los vértices de la caja del lado conservado (`(v − origin)·n ≤ 0`, o `≥ 0` con `reverse`); lámina libre → los dos polígonos a `±slab`. Siempre acotada a la caja original y nunca degenerada (extensión mínima 1 mm por eje).
- Preset `cuatro`: `LayoutPreset = "derecha" | "abajo" | "sola" | "cuatro"`; rejilla `"main s0" "s1 s2"` con `side[3]` oculta; sin separador; `Alt+4`; rótulo «CUATRO» / «4» bajo 800 px; al entrar en `cuatro` desde otro preset la oculta pasa a ser `mip` si estaba visible y VOLUMEN no es la principal (se reordena `side` para que `mip` quede en `side[3]`); `promote` y `⤢` no cambian.
- Modo `slices3d`: conmutador «3D · Cortes 3D · Oblicuo»; tres `vtkImageSlice` + `vtkImageResliceMapper` en los planos de índice, ventana `mprWl` (fallback `meta.wc/ww`), interpolación lineal, `setPickable(false)`, `setUseBounds(false)`; malla al 35 % con «MALLA ●/○» (store `slices3dMeshVisible`, defecto `true`); contornos de D1 y asas de D3 activos; objetivo ≥ 30 fps en Case 3 (anotar; fallback a `vtkImageReslice` a la mitad si < 20).
- Reproductor: escalera clicable (salto) y arrastrable (índice proporcional por `ladderTicks`); teclas con la celda enfocada: ↑/→ +1, ↓/← −1 (existentes), Re Pág/Av Pág ±10, Inicio/Fin (existentes), espacio = reproducir/parar, `+`/`−` velocidad; cine `{ pane, fps, bounce: true }` en el store, `fps` 1–30 (defecto 8, pref `viewer.cineFps`), ida y vuelta; se para con espacio, Escape, arrastre en esa celda, cambio de celda enfocada o de paso; barra «◀ ▶ ⏸ i/n · 8 fps» (compacta «▶ i/n»).
- Atajos: tabla `SHORTCUTS` en `vtk/shortcuts.ts` (`{ keys, action, scope: "visor" | "celda" | "flujo" }`); nuevos **S** (SINCRO), **C** (CENTRAR/AJUSTAR de la celda enfocada), **Alt+4**; existentes Esc, «?», 1–8, Alt+1/2/3; **H y P reservadas (no se asignan)**; nunca actúan con el foco en INPUT/TEXTAREA/SELECT/contenteditable; «?» abre la hoja «Atajos» (cierra con Esc o «?»).
- `estadoVisor` añade `scene_mode` («mesh» | «slices3d» | «oblique»), `slices3d_mesh_visible`, `cine` (`{ pane, fps }` o `null`).
- Verificación: `npx tsc --noEmit -p .` limpio; `npx vitest run` sin regresiones (640 al empezar); `npm run build`; navegador con Case 3 donde la tarea lo indique (backend http://127.0.0.1:8000, frontend http://localhost:5173, login admin/admin123, «Reanudar» «Case 3 revision»).

## Review Focus

1. Volumen a media resolución o recortado hasta el primer/último corte (`posMm` en el borde): `visibleBounds` nunca devuelve una caja degenerada y CENTRAR no deja la cámara en NaN → test en Task 1 (extensión mínima 1 mm).
2. Cine al llegar al extremo con `count = 1` o `fps` fuera de rango: no divide por cero ni queda en bucle vacío → test en Task 4 (`nextIndex` con n=1; `clampFps(0)`, `clampFps(99)`).
3. Cambiar de celda enfocada, de paso o pulsar Escape mientras el cine corre: el reloj se detiene y no escribe `mprVoxel` una vez más → test en Task 5 (store `cine` a `null` y el efecto limpia el intervalo).
4. Atajos con el foco en un campo de texto (renombrar una medición, campos numéricos del clip): S, C, espacio, +/− no actúan → test en Task 6 (`matchShortcut` devuelve `null` para esos targets).
5. Un layout guardado antes de E1 (presets `derecha|abajo|sola`) sigue cargando y `cuatro` guardado en una pestaña se lee en otra → test en Task 2 (`loadLayout` con JSON v2 antiguo y con `cuatro`).

---

### Task 1: Centro de giro y caja visible en VOLUMEN (`orbit.ts`)

**Files:**
- Create: `frontend/src/vtk/orbit.ts`, `frontend/src/vtk/orbit.test.ts`
- Modify: `frontend/src/vtk/MipView.tsx` (manipulador, `fit`, efecto de centro de giro)

**Interfaces:**
- Consumes: `voxelToMm`, `Vec3` (`vtk/geometry.ts`); `clipPolygon`, `normalOf`, `originOf` (`vtk/freePlane.ts`).
- Produces:

```ts
export type Bounds6 = [number, number, number, number, number, number];
export type ClipState =
  | { mode: "eje"; axis: 0 | 1 | 2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number }
  | { mode: "libre"; normal: Vec3; originMm: Vec3; polygon: Vec3[]; polygons?: Vec3[][]; acumulado: boolean; reverse: boolean; slabMm: number };
export const MIN_EXTENT_MM = 1;
export function rotationCenterMm(voxel: {x,y,z}, meta: VolumeMeta): Vec3;          // voxelToMm
export function visibleBounds(bounds: Bounds6, clip: ClipState): Bounds6;          // ver Global Constraints
export function boundsCenter(b: Bounds6): Vec3;
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/orbit.test.ts
import { describe, expect, it } from "vitest";
import { boundsCenter, rotationCenterMm, visibleBounds, type Bounds6 } from "./orbit";
import type { VolumeMeta } from "../api/types";
const B: Bounds6 = [0, 30, 0, 20, 0, 10];
const meta = { shape: [11, 21, 31], spacing: [1, 1, 1] } as unknown as VolumeMeta;
describe("rotationCenterMm", () => {
  it("es el punto compartido en mm", () => { expect(rotationCenterMm({ x: 3, y: 4, z: 5 }, meta)).toEqual([3, 4, 5]); });
});
describe("visibleBounds en eje", () => {
  it("acumulado recorta hasta el corte, y desde el final a partir de él", () => {
    expect(visibleBounds(B, { mode: "eje", axis: 2, posMm: 4, acumulado: true, reverse: false, slabMm: 0 })).toEqual([0, 30, 0, 20, 0, 4]);
    expect(visibleBounds(B, { mode: "eje", axis: 2, posMm: 4, acumulado: true, reverse: true, slabMm: 0 })).toEqual([0, 30, 0, 20, 4, 10]);
  });
  it("lámina recorta ±slab y se acota a la caja", () => {
    expect(visibleBounds(B, { mode: "eje", axis: 0, posMm: 2, acumulado: false, reverse: false, slabMm: 5 })).toEqual([0, 7, 0, 20, 0, 10]);
  });
  it("en el borde nunca degenera: extensión mínima 1 mm", () => {
    const v = visibleBounds(B, { mode: "eje", axis: 2, posMm: 0, acumulado: true, reverse: false, slabMm: 0 });
    expect(v[5] - v[4]).toBeGreaterThanOrEqual(1);
    const w = visibleBounds(B, { mode: "eje", axis: 2, posMm: 10, acumulado: true, reverse: true, slabMm: 0 });
    expect(w[5] - w[4]).toBeGreaterThanOrEqual(1);
  });
});
describe("visibleBounds en libre", () => {
  it("acumulado conserva el lado (v − o)·n ≤ 0 y el polígono", () => {
    const poly = [[0, 0, 5], [30, 0, 5], [30, 20, 5], [0, 20, 5]] as [number, number, number][];
    const v = visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 5], polygon: poly, acumulado: true, reverse: false, slabMm: 0 });
    expect(v).toEqual([0, 30, 0, 20, 0, 5]);
    const w = visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 5], polygon: poly, acumulado: true, reverse: true, slabMm: 0 });
    expect(w).toEqual([0, 30, 0, 20, 5, 10]);
  });
  it("lámina libre es la caja de los dos polígonos", () => {
    const a = [[0, 0, 3], [30, 0, 3], [30, 20, 3], [0, 20, 3]] as [number, number, number][];
    const b = [[0, 0, 7], [30, 0, 7], [30, 20, 7], [0, 20, 7]] as [number, number, number][];
    expect(visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 5], polygon: a, polygons: [a, b], acumulado: false, reverse: false, slabMm: 2 })).toEqual([0, 30, 0, 20, 3, 7]);
  });
  it("sin polígono (plano fuera de la caja) devuelve la caja entera", () => {
    expect(visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 50], polygon: [], acumulado: true, reverse: false, slabMm: 0 })).toEqual(B);
  });
});
it("boundsCenter", () => { expect(boundsCenter(B)).toEqual([15, 10, 5]); });
```

- [x] **Step 2: Ver fallar** → `cd frontend && npx vitest run src/vtk/orbit.test.ts` FAIL.

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/orbit.ts
/* Qué hay que encuadrar y alrededor de qué se gira en VOLUMEN. Medido en Case 3:
   el manipulador giraba alrededor de (0,0,0), una ESQUINA del volumen, y tras
   90° el centro quedaba 124 mm fuera de la celda. El centro de giro es el punto
   compartido; CENTRAR encuadra solo lo que el recorte deja ver. */
import type { VolumeMeta } from "../api/types";
import { voxelToMm, type Vec3 } from "./geometry";

export type Bounds6 = [number, number, number, number, number, number];
export type ClipState =
  | { mode: "eje"; axis: 0 | 1 | 2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number }
  | { mode: "libre"; normal: Vec3; originMm: Vec3; polygon: Vec3[]; polygons?: Vec3[][]; acumulado: boolean; reverse: boolean; slabMm: number };
export const MIN_EXTENT_MM = 1;

export function rotationCenterMm(voxel: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3 { return voxelToMm(voxel, meta); }
export function boundsCenter(b: Bounds6): Vec3 { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }

const clampTo = (v: Bounds6, b: Bounds6): Bounds6 => {
  const out = v.slice() as Bounds6;
  for (let a = 0; a < 3; a++) {
    out[2 * a] = Math.max(b[2 * a], Math.min(b[2 * a + 1], out[2 * a]));
    out[2 * a + 1] = Math.max(b[2 * a], Math.min(b[2 * a + 1], out[2 * a + 1]));
    if (out[2 * a + 1] - out[2 * a] < MIN_EXTENT_MM) {           // nunca una caja plana: resetCamera daría NaN
      const c = (out[2 * a] + out[2 * a + 1]) / 2;
      out[2 * a] = Math.max(b[2 * a], c - MIN_EXTENT_MM / 2); out[2 * a + 1] = Math.min(b[2 * a + 1], c + MIN_EXTENT_MM / 2);
      if (out[2 * a + 1] - out[2 * a] < MIN_EXTENT_MM) { out[2 * a] = b[2 * a]; out[2 * a + 1] = Math.min(b[2 * a + 1], b[2 * a] + MIN_EXTENT_MM); }
    }
  }
  return out;
};
const boxOf = (pts: Vec3[]): Bounds6 | null => {
  if (!pts.length) return null;
  const o: Bounds6 = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const p of pts) for (let a = 0; a < 3; a++) { o[2 * a] = Math.min(o[2 * a], p[a]); o[2 * a + 1] = Math.max(o[2 * a + 1], p[a]); }
  return o;
};

export function visibleBounds(bounds: Bounds6, clip: ClipState): Bounds6 {
  if (clip.mode === "eje") {
    const v = bounds.slice() as Bounds6, lo = 2 * clip.axis, hi = lo + 1;
    if (clip.acumulado) { if (clip.reverse) v[lo] = clip.posMm; else v[hi] = clip.posMm; }
    else { v[lo] = clip.posMm - clip.slabMm; v[hi] = clip.posMm + clip.slabMm; }
    return clampTo(v, bounds);
  }
  if (!clip.polygon.length) return bounds;
  if (!clip.acumulado) {
    const pts = (clip.polygons ?? [clip.polygon]).flat();
    return clampTo(boxOf(pts) ?? bounds, bounds);
  }
  const corners: Vec3[] = [];
  for (let i = 0; i < 8; i++) corners.push([i & 1 ? bounds[1] : bounds[0], i & 2 ? bounds[3] : bounds[2], i & 4 ? bounds[5] : bounds[4]]);
  const n = clip.normal, o = clip.originMm;
  const keep = corners.filter((c) => { const d = (c[0] - o[0]) * n[0] + (c[1] - o[1]) * n[1] + (c[2] - o[2]) * n[2]; return clip.reverse ? d >= 0 : d <= 0; });
  return clampTo(boxOf([...keep, ...clip.polygon]) ?? bounds, bounds);
}
```

`MipView.tsx`: tras crear `rotate` (línea ~183) guarda la referencia en `scene.current.rotate`; un efecto con dependencias `[mprVoxel, meta, image]` llama `rotate.setCenterOfRotation(...rotationCenterMm(mprVoxel, meta))` (también justo después de `cameraToPlane` y de `fit`). `fit` (línea ~462): construye `ClipState` desde el estado actual (`libre`, `plane`→`axis`, `posMm`, `mipMode`, `mipSlabMm`, `reverse`, y en libre `normalOf/originOf/clipPolygon` ya calculados para la traza), `v = visibleBounds(image.getBounds(), clip)`, `cam.setFocalPoint(...rotationCenterMm(...))`, `renderer.resetCamera(v)`, reafirma el centro de giro y renderiza; en libre sigue poniendo `offsetMm` a 0 antes. Comentarios WHY con la medida (124 mm).

- [x] **Step 4: Verificar** → vitest del archivo, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3, VOLUMEN principal, MIP·EJE): girar 90° dos veces y pasar 20 cortes: el punto compartido no sale del centro de la celda; CENTRAR en acumulado, lámina y libre encuadra lo visible; repetir en COMPUESTO. Capturas `t1_*.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/orbit.ts frontend/src/vtk/orbit.test.ts frontend/src/vtk/MipView.tsx
git commit -m "VOLUMEN gira alrededor del punto compartido y CENTRAR encuadra solo lo visible"
```

---

### Task 2: Preset de distribución «CUATRO»

**Files:**
- Modify: `frontend/src/vtk/layout.ts`, `frontend/src/vtk/layout.test.ts`, `frontend/src/vtk/layoutGrid.ts`, `frontend/src/vtk/layoutGrid.test.ts`, `frontend/src/vtk/layoutShortcuts.ts`, `frontend/src/vtk/layoutShortcuts.test.ts`, `frontend/src/vtk/mainOptions.ts`, `frontend/src/vtk/mainOptions.test.ts`, `frontend/src/vtk/ViewerGrid.tsx` (si asume tres presets), `README.md`

**Interfaces:**
- Produces: `LayoutPreset` incluye `"cuatro"`; `setPreset(l, "cuatro")` reordena `side` para que `mip` quede en `side[3]` (oculta) salvo que `mip` sea `main`; `gridFor` devuelve `columns: "repeat(2, minmax(0, 1fr))"`, `rows: "repeat(2, minmax(0, 1fr))"`, `areas: '"main s0" "s1 s2"'`, `visible[side[3]] = false`, `splitter: null`; `presetForKey("Digit4", …, alt=true) === "cuatro"`; `presetOptions` incluye `{ key: "cuatro", label: short ? "4" : "CUATRO", title: "Axial, coronal, sagital y 3D a cuartos (Alt+4)" }`.

- [x] **Step 1: Tests que fallan**

```ts
// añadir a layout.test.ts
it("cuatro oculta la quinta vista y deja VOLUMEN fuera salvo que sea la principal", () => {
  const l = setPreset(DEFAULT_LAYOUT, "cuatro");
  expect(l.preset).toBe("cuatro"); expect(l.side[3]).toBe("mip");
  const m = setPreset({ ...DEFAULT_LAYOUT, main: "mip", side: ["axial", "coronal", "sagital", "scene"] }, "cuatro");
  expect(m.main).toBe("mip"); expect(m.side[3]).toBe("scene");
});
it("loadLayout acepta cuatro y sigue aceptando los presets anteriores", () => {
  localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify({ ...DEFAULT_LAYOUT, preset: "cuatro" }));
  expect(loadLayout().preset).toBe("cuatro");
  localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify({ ...DEFAULT_LAYOUT, preset: "abajo" }));
  expect(loadLayout().preset).toBe("abajo");
});
// añadir a layoutGrid.test.ts
it("cuatro es una rejilla 2×2 sin separador con side[3] oculta", () => {
  const g = gridFor({ ...DEFAULT_LAYOUT, preset: "cuatro" }, false);
  expect(g.areas).toBe('"main s0" "s1 s2"'); expect(g.splitter).toBeNull();
  expect(g.visible.mip).toBe(false); expect(g.visible.scene).toBe(true);
  expect(gridFor({ ...DEFAULT_LAYOUT, preset: "cuatro" }, true).areas).toBe('"main s0" "s1 s2"');   // en vertical también 2×2
});
// añadir a layoutShortcuts.test.ts
it("Alt+4 elige cuatro", () => { expect(presetForKey("Digit4", null, true)).toBe("cuatro"); });
// añadir a mainOptions.test.ts
it("CUATRO está entre los presets y se abrevia a 4", () => {
  expect(presetOptions(1000).map((o) => o.key)).toContain("cuatro");
  expect(presetOptions(600).find((o) => o.key === "cuatro")!.label).toBe("4");
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación** → `layout.ts`: `PRESETS` y el tipo ganan `cuatro`; `defaultFraction("cuatro")` = 0.5 (no se usa); `setPreset` para `cuatro`: si `l.main !== "mip"` y `mip` está en `side`, mueve `mip` a la última posición conservando el orden del resto. `layoutGrid.ts`: rama `cuatro` (sin `effectivePreset` de vertical: 2×2 también en vertical); `visible[l.side[3]] = false`. `ViewerGrid.tsx`: si tiene un `switch` por preset o asume `splitter !== null` fuera de `sola`, trata `cuatro` como `sola` para el separador. `layoutShortcuts.ts`: `Digit4: "cuatro"`. `mainOptions.ts`: opción nueva. README: preset CUATRO y Alt+4.

- [x] **Step 4: Verificar** → vitest de los cuatro archivos, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador: CUATRO enseña AX, COR, SAG y 3D a cuartos; «▸ VOL» trae VOLUMEN al cuadrante; Alt+4; volver a DERECHA conserva el orden.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/layout.ts frontend/src/vtk/layout.test.ts frontend/src/vtk/layoutGrid.ts frontend/src/vtk/layoutGrid.test.ts frontend/src/vtk/layoutShortcuts.ts frontend/src/vtk/layoutShortcuts.test.ts frontend/src/vtk/mainOptions.ts frontend/src/vtk/mainOptions.test.ts frontend/src/vtk/ViewerGrid.tsx README.md
git commit -m "Preset CUATRO: axial, coronal, sagital y 3D a cuartos, con Alt+4"
```

---

### Task 3: Modo «Cortes 3D» de la escena

**Files:**
- Modify: `frontend/src/vtk/MeshView.tsx` (prop `slicePlanes`), `frontend/src/vtk/Viewer.tsx` (`viewMode` `slices3d`, conmutador, interruptor MALLA, `estadoVisor`), `frontend/src/store/planning.tsx` (`slices3dMeshVisible`), `frontend/src/store/planning.test.tsx`
- Create: `frontend/src/vtk/slicePlanes.ts`, `frontend/src/vtk/slicePlanes.test.ts`

**Interfaces:**
- Consumes: `MeshLayer.opacity`, el patrón de reslice de `MipView` (D2, `vtkImageResliceMapper` + `vtkImageSlice` + `vtkPlane`), `planes`/`handles` existentes.
- Produces:

```ts
// slicePlanes.ts (puro)
export interface SlicePlaneSpec { plane: Plane; normal: Vec3; originMm: Vec3 }
export function slicePlaneSpecs(voxel: {x,y,z}, meta: VolumeMeta): SlicePlaneSpec[];   // axial n=[0,0,1] origen z; coronal n=[0,1,0]; sagital n=[1,0,0]
export const SLICES3D_MESH_OPACITY = 0.35;
// MeshView prop
slicePlanes?: { specs: SlicePlaneSpec[]; image: vtkImageData; wc: number; ww: number } | null;   // null = modo normal
// store
slices3dMeshVisible: boolean; setSlices3dMeshVisible(v): void;   // defecto true, se reinicia con la sesión
// Viewer
viewMode: "default" | "slices3d" | "oblique"
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/slicePlanes.test.ts
import { describe, expect, it } from "vitest";
import { slicePlaneSpecs } from "./slicePlanes";
import type { VolumeMeta } from "../api/types";
const meta = { shape: [10, 20, 30], spacing: [1, 0.5, 0.25] } as unknown as VolumeMeta;
describe("slicePlaneSpecs", () => {
  it("tres planos de índice por el punto compartido", () => {
    const s = slicePlaneSpecs({ x: 4, y: 6, z: 5 }, meta);
    expect(s.map((p) => p.plane)).toEqual(["axial", "coronal", "sagital"]);
    expect(s[0].normal).toEqual([0, 0, 1]); expect(s[0].originMm[2]).toBe(5);
    expect(s[1].normal).toEqual([0, 1, 0]); expect(s[1].originMm[1]).toBe(3);
    expect(s[2].normal).toEqual([1, 0, 0]); expect(s[2].originMm[0]).toBe(1);
  });
});
// añadir a planning.test.tsx
it("slices3dMeshVisible arranca en true y se reinicia", () => {
  const { result } = renderHook(() => usePlanning(), { wrapper });
  expect(result.current.slices3dMeshVisible).toBe(true);
  act(() => result.current.setSlices3dMeshVisible(false));
  act(() => result.current.reset());
  expect(result.current.slices3dMeshVisible).toBe(true);
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación** → `slicePlanes.ts` según las firmas. `MeshView.tsx`: efecto propio keyed en `slicePlanes` (null → quita los tres actores; si cambia `image` los recrea): por spec, `vtkImageResliceMapper` (`setInputData(image)`, `setSlabThickness(0)`, `setSlicePlane(vtkPlane{normal, origin})`) + `vtkImageSlice` (`setColorWindow(ww)`, `setColorLevel(wc)`, interpolación lineal, `setPickable(false)`, `setUseBounds(false)`), en el renderer principal; en cada cambio de spec/ventana actualiza plano y ventana; limpieza en el desmontaje de la escena. `Viewer.tsx`: `viewMode` gana `slices3d`; conmutador `[{default: 3D|MPR}, {slices3d: "Cortes 3D"}, {oblique: "Oblicuo"}]`; en `slices3d` la escena de malla se monta igual que en `default` (misma celda, mismo `MeshView`) con `slicePlanes={{ specs: slicePlaneSpecs(mprVoxel, meta), image: clientVol.image, wc, ww }}` (null si no hay imagen cliente: el modo exige WebGL2 como el oblicuo), las capas de malla con `opacity: slices3dMeshVisible ? SLICES3D_MESH_OPACITY : 0` (la malla sigue cargada para no refetch), `planes` y `handles` como en `default`, y un `HudToggleGroup` «MALLA ●/○» junto al conmutador; `estadoVisor.scene_mode` y `slices3d_mesh_visible`; `sceneHasMesh` y las puertas del manipulador de D3 tratan `slices3d` como `default`. Medir fps (rAF 2 s girando) y anotar; si < 20, aplicar el fallback de la constraint.

- [x] **Step 4: Verificar** → vitest de los dos archivos, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3): «Cortes 3D» muestra los tres cortes en gris cruzándose en el punto, la malla al 35 %, MALLA ○ la quita, arrastrar un cuadrado mueve su corte (y la celda 2D correspondiente), la rueda en un corte mueve su imagen en el 3D; fps anotados; captura compuesta incluye la celda. Capturas `t3_*.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/vtk/slicePlanes.ts frontend/src/vtk/slicePlanes.test.ts
git commit -m "Modo Cortes 3D: los tres cortes en su posición dentro de la escena, con la malla translúcida"
```

---

### Task 4: Reproductor puro y escalera interactiva (`cine.ts`, `HudLadder`)

**Files:**
- Create: `frontend/src/vtk/cine.ts`, `frontend/src/vtk/cine.test.ts`, `frontend/src/vtk/hud/HudLadder.test.tsx`
- Modify: `frontend/src/vtk/hud/HudLadder.tsx`, `frontend/src/vtk/hud/ladder.ts`, `frontend/src/vtk/SliceView.tsx`, `frontend/src/vtk/MipView.tsx`, `frontend/src/vtk/ObliqueView.tsx` (pasan `onIndexChange` a la escalera; Re Pág/Av Pág)

**Interfaces:**
- Produces:

```ts
// cine.ts
export const CINE_FPS_DEFAULT = 8, CINE_FPS_MIN = 1, CINE_FPS_MAX = 30, PAGE_STEP = 10;
export function clampFps(fps: number): number;
export function nextIndex(i: number, dir: 1 | -1, count: number, bounce: boolean): { index: number; dir: 1 | -1 };   // rebote en los extremos; count ≤ 1 → mismo índice
export function stepFromKey(key: string): number | null;   // ArrowUp/ArrowRight +1, ArrowDown/ArrowLeft −1, PageUp +10, PageDown −10, Home −Infinity, End +Infinity, otro null
export function applyStep(i: number, step: number, count: number): number;   // acota 0..count−1 (±Infinity → extremos)
// ladder.ts
export function indexAtY(y: number, count: number, index: number, heightPx: number, pxPerTick = 8): number;   // inversa de ladderTicks: índice del corte en la altura y (acotado)
// HudLadder props
onIndexChange?: (i: number) => void;   // clic → indexAtY; arrastre (pointer capture) → indexAtY continuo
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/cine.test.ts
import { describe, expect, it } from "vitest";
import { applyStep, clampFps, nextIndex, stepFromKey } from "./cine";
describe("cine", () => {
  it("clampFps acota a 1..30 y los no numéricos al defecto", () => {
    expect(clampFps(0)).toBe(1); expect(clampFps(99)).toBe(30); expect(clampFps(NaN)).toBe(8);
  });
  it("nextIndex rebota en los extremos y con un solo corte no se mueve", () => {
    expect(nextIndex(8, 1, 10, true)).toEqual({ index: 9, dir: 1 });
    expect(nextIndex(9, 1, 10, true)).toEqual({ index: 8, dir: -1 });
    expect(nextIndex(0, -1, 10, true)).toEqual({ index: 1, dir: 1 });
    expect(nextIndex(0, 1, 1, true)).toEqual({ index: 0, dir: 1 });
  });
  it("stepFromKey y applyStep", () => {
    expect(stepFromKey("PageUp")).toBe(10); expect(stepFromKey("PageDown")).toBe(-10);
    expect(stepFromKey("Home")).toBe(-Infinity); expect(stepFromKey("x")).toBeNull();
    expect(applyStep(95, 10, 100)).toBe(99); expect(applyStep(3, -Infinity, 100)).toBe(0); expect(applyStep(3, Infinity, 100)).toBe(99);
  });
});
// añadir a un test de ladder (ladder.test.ts si existe; si no, créalo)
it("indexAtY es la inversa de ladderTicks", () => {
  const ticks = ladderTicks(100, 50, 400);
  for (const t of ticks.filter((_, k) => k % 7 === 0)) expect(indexAtY(t.y, 100, 50, 400)).toBe(t.index);
  expect(indexAtY(-9999, 100, 50, 400)).toBe(99); expect(indexAtY(9999, 100, 50, 400)).toBe(0);
});
// frontend/src/vtk/hud/HudLadder.test.tsx (Testing Library; mock ResizeObserver con clientHeight 400 como hacen otros tests del HUD, o fija la altura con un ResizeObserver stub)
it("clic en la escalera salta al índice y arrastrar lo recorre", () => {
  const onIndexChange = vi.fn();
  const { container } = render(<HudLadder count={100} index={50} onIndexChange={onIndexChange} />);
  const el = container.firstChild as HTMLElement;
  fireEvent.pointerDown(el, { clientY: 200 + 80, button: 0, pointerId: 1 });   // 80 px por debajo del centro = 10 cortes menos
  expect(onIndexChange).toHaveBeenLastCalledWith(40);
  fireEvent.pointerMove(el, { clientY: 200 - 80, pointerId: 1 });
  expect(onIndexChange).toHaveBeenLastCalledWith(60);
  fireEvent.pointerUp(el, { pointerId: 1 });
});
```

Adapta el cálculo de `clientY` a cómo el test fija `getBoundingClientRect`/altura (usa `vi.spyOn(el, "getBoundingClientRect")` devolviendo `top: 0, height: 400`).

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación** → `cine.ts` según las firmas (`nextIndex` con `bounce` siempre true en E1 pero el parámetro queda). `ladder.ts`: `indexAtY = clamp(round(index + (heightPx/2 − y)/pxPerTick), 0, count−1)`. `HudLadder`: `onPointerDown` (botón 0: `setPointerCapture`, `onIndexChange(indexAtY(y − rect.top, …))`), `onPointerMove` mientras captura, `onPointerUp`/`onLostPointerCapture` sueltan; `cursor: ns-resize`; `pointerEvents: "auto"` aunque sea `hud-decor` (se oculta igual con REGLAS ○). `SliceView`/`MipView`/`ObliqueView`: pasan `onIndexChange` (el mismo setter de la rueda); en `onKey` de `SliceView` añaden `PageUp/PageDown` vía `stepFromKey`/`applyStep`; `MipView` y `ObliqueView` ganan `tabIndex=0` y un `onKeyDown` con el mismo mapa (en LIBRE/oblicuo el paso mueve `offsetMm` por `spacing` × paso).

- [x] **Step 4: Verificar** → vitest de los archivos, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador: clic y arrastre en la escalera de un corte y de VOLUMEN; Re Pág/Av Pág en los tres tipos de celda.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/cine.ts frontend/src/vtk/cine.test.ts frontend/src/vtk/hud/ladder.ts frontend/src/vtk/hud/HudLadder.tsx frontend/src/vtk/hud/HudLadder.test.tsx frontend/src/vtk/SliceView.tsx frontend/src/vtk/MipView.tsx frontend/src/vtk/ObliqueView.tsx
git commit -m "La escalera de cortes se arrastra y las teclas de página recorren diez cortes"
```

---

### Task 5: Cine por celda con espacio

**Files:**
- Modify: `frontend/src/store/planning.tsx`, `frontend/src/store/planning.test.tsx`, `frontend/src/vtk/Viewer.tsx` (reloj del cine, celda enfocada, barra), `frontend/src/vtk/viewerPrefs.ts` (`PREF_CINE_FPS`), `frontend/src/vtk/hud/hud.css`
- Create: `frontend/src/vtk/hud/HudCineBar.tsx`, `frontend/src/vtk/hud/HudCineBar.test.tsx`, `frontend/src/vtk/cineClock.ts`, `frontend/src/vtk/cineClock.test.ts`

**Interfaces:**
- Consumes: `nextIndex`, `clampFps`, `CINE_FPS_*` (Task 4); `PaneId`.
- Produces:

```ts
// store
cine: { pane: PaneId; fps: number; bounce: true } | null; setCine(c): void;   // se reinicia con la sesión y con reset()
focusedPane: PaneId | null; setFocusedPane(p): void;                          // la celda con el foco de teclado (pointerdown/focus en la celda)
// cineClock.ts (puro, sin React): crea un reloj que llama tick() a fps y se puede parar
export function startClock(fps: number, tick: () => void): () => void;       // devuelve stop; usa setInterval(1000/fps)
// HudCineBar props
{ index: number; count: number; playing: boolean; fps: number; compact: boolean; onPlay(): void; onStep(d: 1 | -1): void; onFps(f: number): void }
// render: compacto «▶ 152/384» / «⏸ 152/384»; completo «◀ ▶|⏸ ▶ 152/384 · 8 fps» con botones title «Reproducir (espacio)», «Parar (espacio)», «Corte anterior», «Corte siguiente», «Más lento (−)», «Más rápido (+)»
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/cineClock.test.ts
import { describe, expect, it, vi } from "vitest";
import { startClock } from "./cineClock";
describe("startClock", () => {
  it("llama a tick a la cadencia y se para", () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const stop = startClock(10, tick);
    vi.advanceTimersByTime(350); expect(tick).toHaveBeenCalledTimes(3);
    stop(); vi.advanceTimersByTime(500); expect(tick).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
// frontend/src/vtk/hud/HudCineBar.test.tsx
it("muestra el estado y emite las acciones", () => {
  const onPlay = vi.fn(), onStep = vi.fn(), onFps = vi.fn();
  render(<HudCineBar index={151} count={384} playing={false} fps={8} compact={false} onPlay={onPlay} onStep={onStep} onFps={onFps} />);
  expect(screen.getByText("152/384")).toBeInTheDocument(); expect(screen.getByText("8 fps")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle("Reproducir (espacio)")); expect(onPlay).toHaveBeenCalled();
  fireEvent.click(screen.getByTitle("Corte siguiente")); expect(onStep).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByTitle("Más rápido (+)")); expect(onFps).toHaveBeenCalledWith(9);
});
// añadir a planning.test.tsx
it("cine y focusedPane arrancan vacíos y se reinician", () => {
  const { result } = renderHook(() => usePlanning(), { wrapper });
  expect(result.current.cine).toBeNull(); expect(result.current.focusedPane).toBeNull();
  act(() => { result.current.setCine({ pane: "axial", fps: 8, bounce: true }); result.current.setFocusedPane("axial"); });
  act(() => result.current.reset());
  expect(result.current.cine).toBeNull();
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación** → store según las firmas. `Viewer.tsx`: cada celda registra `setFocusedPane(id)` en `onPointerDownCapture`/`onFocusCapture` del contenedor de la celda (en `ViewerGrid` ya hay `registerCell`; añade un callback `onPaneFocus`); un `useEffect` keyed en `[cine]` arranca `startClock(cine.fps, tick)` donde `tick` lee refs (`mprVoxelRef`, `metaRef`, `cine`) y escribe el eje de la celda (`axial→z`, `coronal→y`, `sagital→x`, `mip→ el eje activo o `offsetMm` en LIBRE, oblicuo→`offsetMm`) con `nextIndex` (dirección guardada en un ref); limpia al cambiar `cine` o desmontar; **parada**: `setCine(null)` en Escape (en el `onLayoutKey`/manejador de la celda), al cambiar `focusedPane`, al cambiar `step`, y en `pointerdown` con botón izquierdo dentro de la celda del cine (arrastre); **espacio** y `+`/`−` se manejan en Task 6 a través de la tabla (aquí expón `toggleCine(pane)` y `bumpFps(±1)` como funciones del Viewer). `HudCineBar` montado en la esquina inferior izquierda de cada celda de corte/VOLUMEN/oblicuo cuando `focusedPane === id || cine?.pane === id` (no estorba al readout: colócala encima del readout `bl` con `bottom: 40`; en VOLUMEN, por encima de la fila de preajustes). Pref `viewer.cineFps` leída al arrancar el cine y escrita al cambiar.

- [x] **Step 4: Verificar** → vitest de los archivos, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador: la barra aparece en la celda enfocada; ▶ reproduce, rebota en los extremos, ⏸ para; cambiar de celda o pulsar Escape para; arrastrar en la celda para; VOLUMEN y oblicuo también.

- [x] **Step 5: Commit**

```bash
git add frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/viewerPrefs.ts frontend/src/vtk/hud/hud.css frontend/src/vtk/hud/HudCineBar.tsx frontend/src/vtk/hud/HudCineBar.test.tsx frontend/src/vtk/cineClock.ts frontend/src/vtk/cineClock.test.ts
git commit -m "Cine por celda: reproducir los cortes con ida y vuelta y una barra mínima"
```

---

### Task 6: Tabla de atajos, teclas S/C/espacio y hoja «Atajos»

**Files:**
- Create: `frontend/src/vtk/shortcuts.ts`, `frontend/src/vtk/shortcuts.test.ts`, `frontend/src/vtk/hud/ShortcutsSheet.tsx`, `frontend/src/vtk/hud/ShortcutsSheet.test.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (manejador global usa `matchShortcut`), `frontend/src/vtk/Viewer.tsx` (acciones S, C, espacio, +/−; hoja en lugar de la pista), `frontend/src/vtk/ViewerHeader.tsx` (botón «?»), `README.md` (tabla de atajos)

**Interfaces:**
- Produces:

```ts
export type ShortcutScope = "visor" | "celda" | "flujo";
export interface Shortcut { id: string; keys: string; action: string; scope: ShortcutScope }
export const SHORTCUTS: Shortcut[];   // ids: "escape","help","step-1..8","preset-sola","preset-derecha","preset-abajo","preset-cuatro","sync","center","cine-toggle","cine-faster","cine-slower","slice-up","slice-down","page-up","page-down","home","end"
export const RESERVED_KEYS = ["H", "P"];
export function matchShortcut(e: { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, target: EventTarget | null): string | null;   // id o null; null si el target es INPUT/TEXTAREA/SELECT/contenteditable
export function shortcutsByScope(): Record<ShortcutScope, Shortcut[]>;
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/shortcuts.test.ts
import { describe, expect, it } from "vitest";
import { matchShortcut, RESERVED_KEYS, SHORTCUTS, shortcutsByScope } from "./shortcuts";
const ev = (p: Partial<{ key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) => ({ key: "", code: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...p });
describe("tabla de atajos", () => {
  it("no hay teclas duplicadas en el mismo ámbito y H/P no se asignan", () => {
    for (const scope of ["visor", "celda", "flujo"] as const) {
      const keys = SHORTCUTS.filter((s) => s.scope === scope).map((s) => s.keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const s of SHORTCUTS) for (const r of RESERVED_KEYS) expect(s.keys.split("+").map((k) => k.trim())).not.toContain(r);
  });
  it("resuelve S, C, espacio, Alt+4 y ?", () => {
    expect(matchShortcut(ev({ key: "s", code: "KeyS" }), null)).toBe("sync");
    expect(matchShortcut(ev({ key: "c", code: "KeyC" }), null)).toBe("center");
    expect(matchShortcut(ev({ key: " ", code: "Space" }), null)).toBe("cine-toggle");
    expect(matchShortcut(ev({ key: "4", code: "Digit4", altKey: true }), null)).toBe("preset-cuatro");
    expect(matchShortcut(ev({ key: "?", code: "Slash", shiftKey: true }), null)).toBe("help");
    expect(matchShortcut(ev({ key: "3", code: "Digit3" }), null)).toBe("step-3");
  });
  it("no actúa con el foco en un campo de texto", () => {
    const input = document.createElement("input");
    expect(matchShortcut(ev({ key: "s", code: "KeyS" }), input)).toBeNull();
    expect(matchShortcut(ev({ key: " ", code: "Space" }), input)).toBeNull();
  });
  it("shortcutsByScope agrupa todo", () => {
    const g = shortcutsByScope(); expect(g.visor.length + g.celda.length + g.flujo.length).toBe(SHORTCUTS.length);
  });
});
// ShortcutsSheet.test.tsx: renderiza las tres secciones y cierra con Escape y con ?
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación** → `shortcuts.ts` con la tabla (keys legibles: «Esc», «?», «1 … 8», «Alt+1», «Alt+2», «Alt+3», «Alt+4», «S», «C», «Espacio», «+», «−», «↑ / →», «↓ / ←», «Re Pág», «Av Pág», «Inicio», «Fin») y `matchShortcut` por `code` para letras/dígitos/espacio y por `key` para `?`/`+`/`-`; `Workspace.tsx`: su manejador global pasa a `const id = matchShortcut(e, e.target); if (!id) return;` y despacha `escape`, `help`, `step-N` como hoy, y los de ámbito visor/celda mediante un evento `viewer:shortcut` con `detail: id` (o un contexto); `Viewer.tsx` escucha y ejecuta: `sync` → `setSyncViews(!syncViews)`, `center` → `fit` de la celda enfocada (3D: `setView("fit")`; VOLUMEN: su `fit`; cortes: `resetCamera` del corte si existe, si no nada), `cine-toggle` → `toggleCine(focusedPane)`, `cine-faster/slower` → `bumpFps`, `preset-cuatro` ya lo hace `layoutShortcuts` (deja un solo camino: `presetForKey` se alimenta de la tabla o la tabla delega en él; evita doble disparo). La hoja: `ShortcutsSheet` modal ligera (fondo oscuro, tarjeta mono, tres columnas por ámbito, cierre con Esc/«?»/clic fuera), abierta por `help`; sustituye a la pista efímera (`viewer:hint`) que queda solo para la pista de gestos de la celda. Botón «?» al final de la banda de cabecera. README: tabla de atajos.

- [x] **Step 4: Verificar** → vitest de los archivos, `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`. Navegador: S alterna SINCRO, C centra la celda enfocada, espacio reproduce/para, +/− cambian fps, «?» abre la hoja y la cierra; con el cursor en un campo de texto ninguna actúa.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/shortcuts.ts frontend/src/vtk/shortcuts.test.ts frontend/src/vtk/hud/ShortcutsSheet.tsx frontend/src/vtk/hud/ShortcutsSheet.test.tsx frontend/src/pages/Workspace.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/ViewerHeader.tsx README.md
git commit -m "Tabla única de atajos: S, C, espacio, Alt+4 y la hoja de ayuda con «?»"
```

---

### Task 7: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección del visor: centro de giro, CUATRO, Cortes 3D, reproductor, atajos), este plan (casillas).

- [x] **Step 1: Comprobación completa**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q --no-header -p no:cacheprovider --deselect test_corredor_abordaje.py && .venv\Scripts\python -m pytest -q --no-header -p no:cacheprovider test_corredor_abordaje.py
```

Expected: frontend en verde; backend sin fallos nuevos frente a la línea base (28 + 8–9; este plan no toca el backend).

- [x] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)

1. VOLUMEN (MIP y COMPUESTO, EJE y LIBRE): girar 90° dos veces y pasar 20 cortes; el punto compartido permanece en el centro de la celda; CENTRAR encuadra lo visible en acumulado, lámina y libre.
2. CUATRO: cuatro celdas iguales; «▸ VOL» y «⤢» traen VOLUMEN; Alt+4; volver a DERECHA.
3. Cortes 3D: tres cortes cruzándose en el punto, malla al 35 %, MALLA ○, arrastre de un plano mueve su corte 2D, rueda en el corte mueve la imagen 3D; fps anotados.
4. Escalera: clic y arrastre en corte, VOLUMEN y oblicuo; Re Pág/Av Pág.
5. Cine: espacio reproduce con rebote en la celda enfocada; ⏸, Escape, arrastre y cambio de celda lo paran; +/− cambian la velocidad y se recuerda.
6. Atajos: S, C, «?» abre la hoja completa; nada actúa con el foco en un campo de texto.
7. Captura/estado con `scene_mode`, `slices3d_mesh_visible`, `cine`, preset `cuatro`.

- [x] **Step 3: README y commit de cierre**

```bash
git add README.md docs/superpowers/plans/2026-10-02-navegacion-orientacion.md
git commit -m "Cierre de la navegación y orientación (E1): lista manual y README"
```
