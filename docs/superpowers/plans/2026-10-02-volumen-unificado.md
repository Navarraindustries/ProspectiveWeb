# Volumen unificado (D2) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un único plano libre (azimut, elevación, desplazamiento) compartido por la vista Oblicuo, el recorte de VOLUMEN (con el corte pintado en la cara), el 3D y los cortes; ventana y nivel por preajuste en COMPUESTO; y la retirada de `GET /volume/{sid}/raw`.

**Architecture:** La geometría del plano vive en un módulo puro `vtk/freePlane.ts` (normal/arriba desde los ángulos, origen desde el punto compartido, polígono de intersección con la caja, segmento por corte) y su estado en el store de planificación. `ObliqueView` deja su estado local y lee/escribe ese plano; `MipView` gana el modo de recorte LIBRE con un `vtkImageSlice` de reslice en el plano como cara del corte; `volumePresets` pasa de mapear 0–255 al rango robusto a mapearlo a una ventana `{wc, ww}` por preajuste guardada en el store; `planeOutlines`/`MeshView`/`SliceView` dibujan el plano libre con su color cuando procede. El backend solo pierde la ruta raw.

**Tech Stack:** React 19, TypeScript, vtk.js 36.2.1 (`vtkPlane`, `vtkImageResliceMapper`, `vtkImageSlice`, clipping planes del `vtkVolumeMapper`), vitest + Testing Library; FastAPI + pytest para la retirada. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-02-volumen-unificado-design.md`

## Global Constraints

- Sin dependencias nuevas; nunca se commitea `frontend/package-lock.json`; nunca `backend/data/`; copia y comentarios WHY en español; rótulos del HUD en mayúsculas mono como los existentes.
- Marco geométrico único: vóxel × espaciado, origen 0 (el de cortes, MIP, rectángulos de D1). `meta.shape = [nz, ny, nx]`, `meta.spacing = [sz, sy, sx]`.
- Plano libre: `FreePlane { azimuthDeg, elevationDeg, offsetMm }`, por defecto `{0, 0, 0}`; normal `n = [sin(e)·sin(a), sin(e)·cos(a), cos(e)]` (con `e=0` → `[0,0,1]`); azimut −180..180, elevación −89..89; arriba = −y del axial girado `e` alrededor de `k = (−cos a, sin a, 0)` (el giro que lleva +z a n), `[sin(a)·cos(a)·(1 − cos e), −cos e − sin²(a)·(1 − cos e), cos(a)·sin(e)]` (unitario y ortogonal a n; −y con e = 0; gira < 1° por 0,5° de azimut también cerca del coronal); `right = normalize(up × n)`; origen = `voxelToMm(mprVoxel) + n·offsetMm`.
- Color del plano libre `#c77dff` (`PLANE_HEX.libre`, `--plane-libre`); se dibuja solo cuando `viewMode === "oblique"` o `clipMode === "libre"`, y PLANOS ○ / REGLAS ○ lo ocultan.
- VOLUMEN: conmutador «RECORTE ▸ EJE · LIBRE» junto a AX·COR·SAG; en LIBRE, ACUMULADO = un plano (normal `−n`, o `+n` con DESDE EL FINAL), LÁMINA = dos planos a `±mipSlabMm`; rueda = `offsetMm ± spacing mínimo`; cara del corte = `vtkImageSlice` + `vtkImageResliceMapper` en el plano con ventana `mprWl`, interruptor «CARA ●/○» (por defecto ●), no seleccionable, `setUseBounds(false)`.
- Ventana por preajuste (solo COMPUESTO): `presetToWindow(preset, {wc, ww})` con `x ↦ (wc − ww/2) + x/255·ww`, `ww ≥ 1`; por defecto `defaultWindow(meta)` = centro y anchura de `intensity_range`; arrastre con botón derecho (vertical nivel, horizontal ventana, misma sensibilidad que `SliceView`: `k = (rhi − rlo)/400` por px); «RESTABLECER»; lectura «NIV n · VENT n».
- Oblicuo: deslizadores AZIMUT (−180..180) y ELEVACIÓN (−89..89); arrastre derecho 0,5°/px; rueda = offset; CENTRAR = offset 0; AJUSTAR encuadra el polígono; arrastre izquierdo = ventana/nivel (`mprWl`); sin WebGL2 `ObliqueMprView` queda como hoy.
- `estadoVisor` añade `free_plane {azimuth_deg, elevation_deg, offset_mm}`, `clip_mode`, `cut_face_visible`, `volume_window {wc, ww} | null`.
- Backend: eliminar `get_volume_raw` (router), `get_volume_raw_uint8` (servicio), sus tres pruebas; conservar `_downsampled_volume`/`_get_downsampled` y `volume_coarse_int16`.
- Verificación: `npx tsc --noEmit -p .` limpio; `npx vitest run` sin regresiones (509 al empezar); `npm run build`; backend `pytest` sin fallos nuevos frente a la línea base (36–37 preexistentes); navegador con Case 3 donde la tarea lo indique.

## Review Focus

1. Plano que no corta la caja (desplazamiento más allá del volumen): `clipPolygon` devuelve `[]`, no hay traza ni polígono ni cara y nada lanza; la rueda acota `offsetMm` a la caja → tests en Task 1 (`[]`) y Task 4 (acotado).
2. Elevación en el límite (±89°): el vector arriba sigue definido y ortogonal; los deslizadores no dejan pasar de 89 → test en Task 1 (`upOf` a 89°) y Task 3 (acotado del deslizador).
3. Cambio de estudio/sesión: `freePlane`, `clipMode`, `cutFaceVisible`, `volumeWindows` vuelven a sus valores por defecto como el resto del estado del visor → test en Task 2 (store `reset`).
4. Ventana arrastrada hasta anchura 0 o negativa: `ww` se acota a 1 y la transferencia sigue monótona → test en Task 2 (`presetToWindow` con `ww ≤ 0`).
5. Volver de LIBRE a EJE: el actor de la cara y los planos de recorte libres desaparecen sin dejar restos (ni actor huérfano ni plano acumulado) → Task 4 (efecto con limpieza, comprobado en navegador: CENTRAR tras volver a EJE encuadra como en D1).

---

### Task 1: Geometría del plano libre (`freePlane.ts`)

**Files:**
- Create: `frontend/src/vtk/freePlane.ts`, `frontend/src/vtk/freePlane.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `Plane`, `voxelToMm` de `vtk/geometry.ts`; `VolumeMeta` de `api/types.ts`.
- Produces:

```ts
export interface FreePlane { azimuthDeg: number; elevationDeg: number; offsetMm: number }
export const DEFAULT_FREE_PLANE: FreePlane = { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 };
export const AZIMUTH_RANGE: [number, number] = [-180, 180];
export const ELEVATION_RANGE: [number, number] = [-89, 89];
export function clampPlane(p: FreePlane): FreePlane;                                     // acota ángulos a sus rangos
export function normalOf(p: FreePlane): Vec3;
export function upOf(p: FreePlane): Vec3;
export function rightOf(p: FreePlane): Vec3;                                             // up × n normalizado
export function originOf(p: FreePlane, voxel: {x,y,z}, meta: VolumeMeta): Vec3;
export function boxMm(meta: VolumeMeta): [Vec3, Vec3];                                   // [0,0,0] y [(nx−1)sx, (ny−1)sy, (nz−1)sz]
export function clipPolygon(p: FreePlane, voxel: {x,y,z}, meta: VolumeMeta): Vec3[];     // 3–6 vértices antihorarios vistos desde n, o []
export function clampOffsetToBox(p: FreePlane, voxel: {x,y,z}, meta: VolumeMeta): FreePlane; // offset dentro del intervalo en que el plano corta la caja
export function sliceSegment(p: FreePlane, voxel: {x,y,z}, meta: VolumeMeta, slice: Plane, index: number): [[number, number], [number, number]] | null; // fracciones u,v del corte
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/freePlane.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_PLANE, clampOffsetToBox, clampPlane, clipPolygon, normalOf, originOf, rightOf, sliceSegment, upOf } from "./freePlane";
import type { VolumeMeta } from "../api/types";

const meta = { shape: [11, 21, 31], spacing: [1, 1, 1] } as unknown as VolumeMeta;   // caja 30×20×10 mm (x,y,z)
const centre = { x: 15, y: 10, z: 5 };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

describe("normalOf / upOf / rightOf", () => {
  it("0/0 es el plano axial de índices y mira hacia +z", () => {
    expect(normalOf(DEFAULT_FREE_PLANE).map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it("la elevación inclina desde +z y el azimut elige el lado", () => {
    const n = normalOf({ azimuthDeg: 90, elevationDeg: 90, offsetMm: 0 });
    expect(n[0]).toBeCloseTo(1, 6); expect(n[2]).toBeCloseTo(0, 6);
  });
  it("arriba y derecha son unitarios y ortogonales a la normal, también a 89°", () => {
    for (const e of [0, 45, 89, -89]) for (const a of [0, 30, 180]) {
      const p = { azimuthDeg: a, elevationDeg: e, offsetMm: 0 };
      const n = normalOf(p), u = upOf(p), r = rightOf(p);
      expect(len(u)).toBeCloseTo(1, 6); expect(len(r)).toBeCloseTo(1, 6);
      expect(dot(u, n)).toBeCloseTo(0, 6); expect(dot(r, n)).toBeCloseTo(0, 6); expect(dot(r, u)).toBeCloseTo(0, 6);
    }
  });
  it("clampPlane acota los ángulos", () => {
    expect(clampPlane({ azimuthDeg: 200, elevationDeg: 95, offsetMm: 3 })).toEqual({ azimuthDeg: 180, elevationDeg: 89, offsetMm: 3 });
  });
});

describe("originOf", () => {
  it("parte del punto compartido y avanza offset por la normal", () => {
    expect(originOf({ ...DEFAULT_FREE_PLANE, offsetMm: 2.5 }, centre, meta)).toEqual([15, 10, 7.5]);
  });
});

describe("clipPolygon", () => {
  it("el plano axial por el centro es el rectángulo de D1 (4 vértices)", () => {
    const poly = clipPolygon(DEFAULT_FREE_PLANE, centre, meta);
    expect(poly).toHaveLength(4);
    expect(poly.every((v) => v[2] === 5)).toBe(true);
    expect(Math.max(...poly.map((v) => v[0]))).toBe(30); expect(Math.max(...poly.map((v) => v[1]))).toBe(20);
  });
  it("un plano diagonal por el centro corta la caja en 6 vértices, ordenados en sentido antihorario visto desde n", () => {
    const p = { azimuthDeg: 30, elevationDeg: 50, offsetMm: 0 };    // normal ≈ (0.38, 0.66, 0.64): corta las 6 aristas sin pasar por ningún vértice
    const poly = clipPolygon(p, centre, meta);
    expect(poly).toHaveLength(6);
    const n = normalOf(p), u = upOf(p), r = rightOf(p);
    const c = poly.reduce((s, v) => [s[0] + v[0] / 6, s[1] + v[1] / 6, s[2] + v[2] / 6], [0, 0, 0]);
    const ang = poly.map((v) => Math.atan2(dot([v[0] - c[0], v[1] - c[1], v[2] - c[2]], u), dot([v[0] - c[0], v[1] - c[1], v[2] - c[2]], r)));
    for (let i = 1; i < ang.length; i++) expect((ang[i] - ang[i - 1] + 2 * Math.PI) % (2 * Math.PI)).toBeLessThan(Math.PI);
    expect(len(n)).toBeCloseTo(1, 6);
  });
  it("fuera de la caja no hay polígono", () => {
    expect(clipPolygon({ ...DEFAULT_FREE_PLANE, offsetMm: 50 }, centre, meta)).toEqual([]);
  });
  it("clampOffsetToBox devuelve el plano al intervalo en que corta la caja", () => {
    expect(clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: 50 }, centre, meta).offsetMm).toBe(5);
    expect(clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: -50 }, centre, meta).offsetMm).toBe(-5);
    expect(clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: 2 }, centre, meta).offsetMm).toBe(2);
  });
});

describe("sliceSegment", () => {
  it("paralelo al corte → null", () => {
    expect(sliceSegment(DEFAULT_FREE_PLANE, centre, meta, "axial", 5)).toBeNull();
  });
  it("plano inclinado 45° alrededor de x cruza el corte axial en una horizontal por el punto", () => {
    const p = { azimuthDeg: 0, elevationDeg: 45, offsetMm: 0 };           // n ∝ (0, 1, 1): corta z=5 en y=10
    const seg = sliceSegment(p, centre, meta, "axial", 5)!;
    expect(seg[0][1]).toBeCloseTo(0.5, 6); expect(seg[1][1]).toBeCloseTo(0.5, 6);
    expect(Math.min(seg[0][0], seg[1][0])).toBeCloseTo(0, 6); expect(Math.max(seg[0][0], seg[1][0])).toBeCloseTo(1, 6);
  });
  it("en el corte coronal la v va invertida (1 − z/Z), como las líneas de referencia", () => {
    const p = { azimuthDeg: 90, elevationDeg: 45, offsetMm: 0 };          // n ∝ (1, 0, 1): corta y=10 en la recta x + z = 20
    const seg = sliceSegment(p, centre, meta, "coronal", 10)!;
    // en x = 10 (u = 1/3) z = 10 (v = 1 − 10/10 = 0); en x = 20 (u = 2/3) z = 0 (v = 1)
    const byU = [seg[0], seg[1]].sort((a, b) => a[0] - b[0]);
    expect(byU[0]).toEqual([expect.closeTo(1 / 3, 6), expect.closeTo(0, 6)]);
    expect(byU[1]).toEqual([expect.closeTo(2 / 3, 6), expect.closeTo(1, 6)]);
  });
});
```

- [x] **Step 2: Ver fallar** → `cd frontend && npx vitest run src/vtk/freePlane.test.ts` FAIL (módulo inexistente).

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/freePlane.ts
/* Geometría del plano libre: el que recorta el volumen, el que muestra la vista
   Oblicuo y el que se dibuja en el 3D y en los cortes. Todo en el marco de
   índices (vóxel × espaciado, origen 0), el mismo que usan las demás vistas, y
   todo puro para poder probarlo sin WebGL. */
import type { VolumeMeta } from "../api/types";
import { voxelToMm, type Plane, type Vec3 } from "./geometry";

export interface FreePlane { azimuthDeg: number; elevationDeg: number; offsetMm: number }
export const DEFAULT_FREE_PLANE: FreePlane = { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 };
export const AZIMUTH_RANGE: [number, number] = [-180, 180];
/* 89 y no 90: con la normal horizontal el «arriba» proyectado se anula. */
export const ELEVATION_RANGE: [number, number] = [-89, 89];

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

export function clampPlane(p: FreePlane): FreePlane {
  return { azimuthDeg: clamp(p.azimuthDeg, AZIMUTH_RANGE), elevationDeg: clamp(p.elevationDeg, ELEVATION_RANGE), offsetMm: p.offsetMm };
}

export function normalOf(p: FreePlane): Vec3 {
  const a = rad(p.azimuthDeg), e = rad(p.elevationDeg);
  return norm([Math.sin(e) * Math.sin(a), Math.sin(e) * Math.cos(a), Math.cos(e)]);
}

/** Proyección de +z (o de +y si la normal está casi tumbada) sobre el plano:
 *  un «arriba» fijo para que el oblicuo no gire solo al mover los ángulos. */
export function upOf(p: FreePlane): Vec3 {
  const n = normalOf(p);
  const ref: Vec3 = Math.abs(p.elevationDeg) >= 89 ? [0, 1, 0] : [0, 0, 1];
  return norm(sub(ref, [n[0] * dot(ref, n), n[1] * dot(ref, n), n[2] * dot(ref, n)]));
}

export function rightOf(p: FreePlane): Vec3 { return norm(cross(upOf(p), normalOf(p))); }

export function originOf(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3 {
  return add(voxelToMm(voxel, meta), normalOf(p), p.offsetMm);
}

export function boxMm(meta: VolumeMeta): [Vec3, Vec3] {
  const [nz, ny, nx] = meta.shape; const [sz, sy, sx] = meta.spacing;
  return [[0, 0, 0], [(nx - 1) * sx, (ny - 1) * sy, (nz - 1) * sz]];
}

/** Intersección plano–caja: se cortan las 12 aristas y los puntos se ordenan
 *  por ángulo en la base (right, up) alrededor de su centroide. */
export function clipPolygon(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3[] {
  const n = normalOf(p), o = originOf(p, voxel, meta);
  const [lo, hi] = boxMm(meta);
  const corner = (i: number): Vec3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const pts: Vec3[] = [];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
    if (i & bit) continue;
    const a = corner(i), b = corner(i | bit);
    const da = dot(sub(a, o), n), db = dot(sub(b, o), n);
    if (da === 0) pts.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); pts.push(add(a, sub(b, a), t)); }
  }
  // Quitar duplicados (aristas que comparten un vértice cortado exactamente).
  const uniq: Vec3[] = [];
  for (const q of pts) if (!uniq.some((u) => Math.hypot(u[0] - q[0], u[1] - q[1], u[2] - q[2]) < 1e-6)) uniq.push(q);
  if (uniq.length < 3) return [];
  const c = uniq.reduce((s, v) => add(s, v, 1 / uniq.length), [0, 0, 0] as Vec3);
  const r = rightOf(p), u = upOf(p);
  return uniq.map((v) => ({ v, ang: Math.atan2(dot(sub(v, c), u), dot(sub(v, c), r)) })).sort((a, b) => a.ang - b.ang).map((x) => x.v);
}

/** El plano corta la caja mientras su origen quede entre las proyecciones
 *  mínima y máxima de los 8 vértices sobre la normal. */
export function clampOffsetToBox(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta): FreePlane {
  const n = normalOf(p), base = voxelToMm(voxel, meta);
  const [lo, hi] = boxMm(meta);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 8; i++) {
    const v: Vec3 = [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    const d = dot(sub(v, base), n); min = Math.min(min, d); max = Math.max(max, d);
  }
  return { ...p, offsetMm: clamp(p.offsetMm, [min, max]) };
}

/** Recta de intersección del plano libre con un corte de índice, recortada
 *  al rectángulo del corte y expresada en fracciones (u, v) con las mismas
 *  convenciones que las líneas de referencia (`planeCfg`): axial u=x/X v=y/Y;
 *  coronal u=x/X v=1−z/Z; sagital u=y/Y v=1−z/Z. */
export function sliceSegment(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta, slice: Plane, index: number): [[number, number], [number, number]] | null {
  const n = normalOf(p), o = originOf(p, voxel, meta);
  const [, hi] = boxMm(meta);
  const [sz, sy, sx] = meta.spacing;
  // Ejes del corte en el marco 3D: (ejeU, ejeV, ejeFijo) y su coordenada fija.
  const cfg = slice === "axial" ? { u: 0, v: 1, f: 2, c: index * sz, flipV: false }
    : slice === "coronal" ? { u: 0, v: 2, f: 1, c: index * sy, flipV: true }
    : { u: 1, v: 2, f: 0, c: index * sx, flipV: true };
  const nu = n[cfg.u], nv = n[cfg.v];
  if (Math.abs(nu) < 1e-9 && Math.abs(nv) < 1e-9) return null;            // paralelo al corte
  // Ecuación en el corte: nu·u + nv·v = k, con u,v en mm.
  const k = dot(n, o) - n[cfg.f] * cfg.c;
  const U = hi[cfg.u], V = hi[cfg.v];
  const pts: [number, number][] = [];
  const push = (u: number, v: number) => { if (u >= -1e-9 && u <= U + 1e-9 && v >= -1e-9 && v <= V + 1e-9 && !pts.some((q) => Math.abs(q[0] - u) < 1e-6 && Math.abs(q[1] - v) < 1e-6)) pts.push([u, v]); };
  if (Math.abs(nv) > 1e-9) { push(0, k / nv); push(U, (k - nu * U) / nv); }          // con los bordes u = 0 y u = U
  if (Math.abs(nu) > 1e-9) { push(k / nu, 0); push((k - nv * V) / nu, V); }          // con los bordes v = 0 y v = V
  if (pts.length < 2) return null;
  const [a, b] = pts;
  const frac = (q: [number, number]): [number, number] => [q[0] / U, cfg.flipV ? 1 - q[1] / V : q[1] / V];
  return [frac(a), frac(b)];
}
```

Para `index` fuera de `[0, n−1]` devuelve `null`.

- [x] **Step 4: Verificar** → `npx vitest run src/vtk/freePlane.test.ts`, `npx tsc --noEmit -p .`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/freePlane.ts frontend/src/vtk/freePlane.test.ts
git commit -m "Geometría del plano libre: normal por azimut y elevación, polígono en la caja y segmento por corte"
```

---

### Task 2: Estado del plano libre, del recorte y de la ventana por preajuste

**Files:**
- Modify: `frontend/src/store/planning.tsx`, `frontend/src/store/planning.test.tsx`, `frontend/src/vtk/volumePresets.ts`, `frontend/src/vtk/volumePresets.test.ts`

**Interfaces:**
- Consumes: `FreePlane`, `DEFAULT_FREE_PLANE`, `clampPlane` (Task 1); `VolumePreset`, `TransferPoints`, `presetToRange` (existentes).
- Produces:

```ts
// store/planning.tsx (en el tipo del contexto y en el value)
freePlane: FreePlane; setFreePlane(p: FreePlane): void;                 // guarda clampPlane(p)
clipMode: "eje" | "libre"; setClipMode(m): void;                        // defecto "eje"
cutFaceVisible: boolean; setCutFaceVisible(v): void;                    // defecto true
volumeWindows: Partial<Record<VolumePreset, { wc: number; ww: number }>>; setVolumeWindow(preset, w: {wc,ww} | null): void;   // null borra la entrada
// volumePresets.ts
export interface VolumeWindow { wc: number; ww: number }
export function defaultWindow(range: [number, number]): VolumeWindow;           // wc = (lo+hi)/2, ww = hi − lo (≥ 1)
export function presetToWindow(preset: VolumePreset, w: VolumeWindow): TransferPoints;   // x ↦ (wc − ww/2) + x/255·ww, ww acotada a ≥ 1
```

`presetToRange` queda como envoltorio: `presetToRange(preset, [lo, hi]) === presetToWindow(preset, defaultWindow([lo, hi]))`.

- [x] **Step 1: Tests que fallan**

```ts
// añadir a frontend/src/vtk/volumePresets.test.ts
import { defaultWindow, presetToRange, presetToWindow } from "./volumePresets";
describe("presetToWindow", () => {
  it("con la ventana por defecto reproduce presetToRange punto a punto", () => {
    expect(presetToWindow("Vasos CTA", defaultWindow([1000, 3000]))).toEqual(presetToRange("Vasos CTA", [1000, 3000]));
  });
  it("mueve el dominio con el nivel y lo estira con la ventana", () => {
    const t = presetToWindow("CTA", { wc: 2000, ww: 1000 });
    expect(t.color[0][0]).toBe(1500); expect(t.color.at(-1)![0]).toBe(2500);
  });
  it("una ventana nula o negativa se acota a 1 y los puntos siguen monótonos", () => {
    const t = presetToWindow("Hueso", { wc: 500, ww: -20 });
    for (let i = 1; i < t.opacity.length; i++) expect(t.opacity[i][0]).toBeGreaterThanOrEqual(t.opacity[i - 1][0]);
    expect(t.opacity.at(-1)![0] - t.opacity[0][0]).toBeCloseTo(1, 9);
  });
  it("defaultWindow es el centro y la anchura del rango", () => {
    expect(defaultWindow([1000, 3000])).toEqual({ wc: 2000, ww: 2000 });
    expect(defaultWindow([7, 7])).toEqual({ wc: 7, ww: 1 });
  });
});
```

```tsx
// añadir a frontend/src/store/planning.test.tsx (seguir el patrón de los tests existentes: renderHook/act con PlanningProvider)
describe("plano libre, recorte y ventana por preajuste", () => {
  it("arrancan en sus valores por defecto", () => {
    const { result } = renderPlanning();
    expect(result.current.freePlane).toEqual({ azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 });
    expect(result.current.clipMode).toBe("eje");
    expect(result.current.cutFaceVisible).toBe(true);
    expect(result.current.volumeWindows).toEqual({});
  });
  it("setFreePlane acota los ángulos y setVolumeWindow guarda por preajuste y borra con null", () => {
    const { result } = renderPlanning();
    act(() => result.current.setFreePlane({ azimuthDeg: 400, elevationDeg: -95, offsetMm: 1 }));
    expect(result.current.freePlane).toEqual({ azimuthDeg: 180, elevationDeg: -89, offsetMm: 1 });
    act(() => result.current.setVolumeWindow("Hueso", { wc: 1, ww: 2 }));
    expect(result.current.volumeWindows).toEqual({ Hueso: { wc: 1, ww: 2 } });
    act(() => result.current.setVolumeWindow("Hueso", null));
    expect(result.current.volumeWindows).toEqual({});
  });
  it("cambiar de estudio los devuelve a los valores por defecto", () => {
    const { result } = renderPlanning();
    act(() => { result.current.setClipMode("libre"); result.current.setCutFaceVisible(false); result.current.setFreePlane({ azimuthDeg: 10, elevationDeg: 10, offsetMm: 2 }); });
    act(() => switchStudy(result));   // el helper que ya usan los tests «switching to another study»
    expect(result.current.clipMode).toBe("eje"); expect(result.current.cutFaceVisible).toBe(true);
    expect(result.current.freePlane).toEqual({ azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 });
  });
});
```

Adapta `renderPlanning`/`switchStudy` a los helpers reales del archivo (léelo primero); si el cambio de estudio hoy no reinicia `mipMode`/`volumeMode`, añade los cuatro campos nuevos a la misma rutina de reinicio que usa `mprVoxel`/`mprWl` y anótalo en el informe.

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

```ts
// volumePresets.ts
export interface VolumeWindow { wc: number; ww: number }
export function defaultWindow(range: [number, number]): VolumeWindow {
  const lo = range[0], hi = Math.max(range[1], range[0] + 1);
  return { wc: (lo + hi) / 2, ww: hi - lo };
}
export function presetToWindow(preset: VolumePreset, w: VolumeWindow): TransferPoints {
  const ww = Math.max(1, w.ww), lo = w.wc - ww / 2;
  const map = (x: number) => lo + (x / 255) * ww;
  const p = RAW[preset];
  return { color: p.color.map(([x, r, g, b]) => [map(x), r, g, b] as [number, number, number, number]),
           opacity: p.opacity.map(([x, a]) => [map(x), a] as [number, number]), lighting: p.lighting };
}
export function presetToRange(preset: VolumePreset, range: [number, number]): TransferPoints {
  return presetToWindow(preset, defaultWindow(range));
}
```

Store: cuatro `useState` junto a `volumeMode`/`volumePreset` (líneas ~344–345), tipos junto a las líneas ~175–177, en el `value` (línea ~451), reinicio en la rutina de cambio de estudio; `setFreePlane = (p) => setFreePlaneState(clampPlane(p))`; `setVolumeWindow = (k, w) => setVolumeWindows((m) => { const n = { ...m }; if (w) n[k] = w; else delete n[k]; return n; })`.

- [x] **Step 4: Verificar** → vitest de los dos archivos, `npx tsc --noEmit -p .`, `npx vitest run`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/vtk/volumePresets.ts frontend/src/vtk/volumePresets.test.ts
git commit -m "El store guarda el plano libre, el modo de recorte y la ventana por preajuste; los preajustes se mapean a una ventana"
```

---

### Task 3: La vista Oblicuo sobre el plano compartido

**Files:**
- Modify: `frontend/src/vtk/ObliqueView.tsx`, `frontend/src/vtk/Viewer.tsx` (props de `ObliqueView`), `README.md` (oblicuo: controles nuevos y modo degradado sin WebGL2)
- Create: `frontend/src/vtk/obliqueGestures.ts`, `frontend/src/vtk/obliqueGestures.test.ts`

**Interfaces:**
- Consumes: `freePlane`/`setFreePlane` (store), `normalOf`, `upOf`, `rightOf`, `originOf`, `clipPolygon`, `clampOffsetToBox`, `clampPlane`, `AZIMUTH_RANGE`, `ELEVATION_RANGE` (Task 1).
- Produces:

```ts
// obliqueGestures.ts (puro)
export const DEG_PER_PX = 0.5;
export function dragAngles(start: FreePlane, dxPx: number, dyPx: number): FreePlane;   // azimut += dx·0.5, elevación −= dy·0.5, acotado
export function wheelOffset(p: FreePlane, deltaY: number, stepMm: number): FreePlane;  // offset ± stepMm según el signo de deltaY
export function obliqueReadout(p: FreePlane): string;                                 // "AZ 20° · EL −10° · +3,2 mm"
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/obliqueGestures.test.ts
import { describe, expect, it } from "vitest";
import { dragAngles, obliqueReadout, wheelOffset } from "./obliqueGestures";
const p0 = { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 };
describe("gestos del oblicuo", () => {
  it("arrastrar 40 px a la derecha y 20 px arriba gira 20° de azimut y sube 10° de elevación", () => {
    expect(dragAngles(p0, 40, -20)).toEqual({ azimuthDeg: 20, elevationDeg: 10, offsetMm: 0 });
  });
  it("el arrastre no pasa de ±89° de elevación ni de ±180° de azimut", () => {
    expect(dragAngles(p0, 1000, -1000)).toEqual({ azimuthDeg: 180, elevationDeg: 89, offsetMm: 0 });
  });
  it("la rueda mueve el desplazamiento un paso por evento", () => {
    expect(wheelOffset(p0, 100, 0.32).offsetMm).toBeCloseTo(0.32, 9);
    expect(wheelOffset(p0, -100, 0.32).offsetMm).toBeCloseTo(-0.32, 9);
  });
  it("la lectura usa coma decimal y signo", () => {
    expect(obliqueReadout({ azimuthDeg: 20, elevationDeg: -10, offsetMm: 3.25 })).toBe("AZ 20° · EL −10° · +3,3 mm");
    expect(obliqueReadout({ azimuthDeg: 0, elevationDeg: 0, offsetMm: -0.5 })).toBe("AZ 0° · EL 0° · −0,5 mm");
  });
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

```ts
// obliqueGestures.ts
import { clampPlane, type FreePlane } from "./freePlane";
export const DEG_PER_PX = 0.5;
export function dragAngles(start: FreePlane, dxPx: number, dyPx: number): FreePlane {
  return clampPlane({ ...start, azimuthDeg: start.azimuthDeg + dxPx * DEG_PER_PX, elevationDeg: start.elevationDeg - dyPx * DEG_PER_PX });
}
export function wheelOffset(p: FreePlane, deltaY: number, stepMm: number): FreePlane {
  return { ...p, offsetMm: p.offsetMm + Math.sign(deltaY) * stepMm };
}
const sgn = (v: number) => (v < 0 ? "−" : "+");
export function obliqueReadout(p: FreePlane): string {
  const deg = (d: number) => `${d < 0 ? "−" : ""}${Math.abs(Math.round(d))}°`;
  return `AZ ${deg(p.azimuthDeg)} · EL ${deg(p.elevationDeg)} · ${sgn(p.offsetMm)}${Math.abs(p.offsetMm).toFixed(1).replace(".", ",")} mm`;
}
```

`ObliqueView.tsx`: elimina `tilt`, `pos`, `axis` y `sliceExtent`; lee `freePlane`, `setFreePlane`, `mprVoxel` del store. Efecto del plano: `n = normalOf(freePlane)`, `o = originOf(freePlane, mprVoxel, meta)`, `up = upOf(freePlane)`; `s.plane.setNormal(...n); s.plane.setOrigin(...o)`; cámara: foco en `o`, posición `o − n·1000`, `setViewUp(...up)`. `fit()`: con `clipPolygon(...)` proyecta los vértices sobre `(rightOf, upOf)` y usa la extensión máxima como `parallelScale` (mismo criterio que tenía `sliceExtent`). Gestos: botón izquierdo = ventana/nivel (como hoy); **botón derecho** (`e.button === 2`, con `onContextMenu={e => e.preventDefault()}`) = `dragAngles` desde el plano al empezar el arrastre; rueda sin Ctrl = `setFreePlane(clampOffsetToBox(wheelOffset(freePlane, e.deltaY, Math.min(...meta.spacing)), mprVoxel, meta))`; Ctrl+rueda zoom como hoy. Fila inferior: dos `<input type="range">` «AZIMUT» (−180..180) y «ELEVACIÓN» (−89..89) con su cifra, y `HudToggleGroup` AJUSTAR · CENTRAR (CENTRAR → `offsetMm: 0`). Lectura `bl`: `obliqueReadout(freePlane)`; `br` W/L como hoy. `Viewer.tsx`: `ObliqueView` ya no recibe nada del plano (sus props siguen siendo `image, meta, wc, ww, onWindowLevel, active, registerCapture`); `ObliqueMprView` no cambia. README: sección del oblicuo con los controles nuevos y la nota del modo degradado.

- [x] **Step 4: Verificar** → vitest del archivo, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3, escena en Oblicuo): deslizadores y arrastre derecho orientan el corte; rueda lo desplaza y no sale de la caja; CENTRAR vuelve al punto; AJUSTAR encuadra; ventana con arrastre izquierdo sigue. Captura `t3_oblicuo.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/ObliqueView.tsx frontend/src/vtk/obliqueGestures.ts frontend/src/vtk/obliqueGestures.test.ts frontend/src/vtk/Viewer.tsx README.md
git commit -m "La vista Oblicuo usa el plano libre compartido: azimut, elevación y desplazamiento"
```

---

### Task 4: VOLUMEN: recorte LIBRE y corte en la cara

**Files:**
- Modify: `frontend/src/vtk/MipView.tsx`, `frontend/src/vtk/mipReadout.ts`, `frontend/src/vtk/mipReadout.test.ts`, `frontend/src/vtk/planeTrace.ts`, `frontend/src/vtk/planeTrace.test.ts`

**Interfaces:**
- Consumes: `clipMode`/`setClipMode`, `cutFaceVisible`/`setCutFaceVisible`, `freePlane`/`setFreePlane` (Task 2); `normalOf`, `originOf`, `clipPolygon`, `clampOffsetToBox` (Task 1); `wheelOffset` (Task 3); `mprWl` (store).
- Produces:

```ts
// planeTrace.ts
export function traceVisibleForNormal(cameraDirection: Vec3, normal: Vec3): boolean;   // |cos| entre dirección y normal > sin(EDGE_ON_DEG)
// mipReadout.ts: nuevo parámetro opcional `clip?: "eje" | "libre"`; en libre la línea del corte dice «LIBRE +3,2 mm» (acumulado) o «LIBRE ±8 mm» (lámina); compacto «LIB +3,2» / «LIB ±8»
```

- [x] **Step 1: Tests que fallan**

```ts
// añadir a frontend/src/vtk/planeTrace.test.ts
it("traceVisibleForNormal oculta la traza cuando la cámara mira de canto al plano", () => {
  expect(traceVisibleForNormal([0, 0, 1], [0, 0, 1])).toBe(true);
  expect(traceVisibleForNormal([1, 0, 0], [0, 0, 1])).toBe(false);
  expect(traceVisibleForNormal([Math.sin(4 * Math.PI / 180), 0, Math.cos(4 * Math.PI / 180)], [1, 0, 0])).toBe(false);
});
// añadir a frontend/src/vtk/mipReadout.test.ts
it("en recorte libre la línea del corte dice el desplazamiento", () => {
  expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, clip: "libre", offsetMm: 3.25 })).toEqual(["LIBRE +3,3 mm", "UMBRAL 1470"]);
  expect(mipReadoutLines({ mode: "lamina", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: true, clip: "libre", offsetMm: 0 })).toEqual(["LIB ±8"]);
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

`planeTrace.ts`: `traceVisibleForNormal(d, n) = Math.abs(dot(norm(d), norm(n))) > Math.sin(EDGE_ON_DEG·π/180)` (la actual `traceVisible(d, axis)` pasa a llamarla con el vector del eje).

`mipReadout.ts`: parámetros `clip?: "eje" | "libre"` y `offsetMm?: number`; cuando `clip === "libre"`, la línea del corte es `LIBRE ±${slabMm} mm` (lámina) o `LIBRE ${signo}${|offset| con coma, 1 decimal} mm` (acumulado); compacto `LIB ±N` / `LIB +n,n`. Sin `clip` nada cambia.

`MipView.tsx`:
- Lee `clipMode`, `setClipMode`, `cutFaceVisible`, `setCutFaceVisible`, `freePlane`, `setFreePlane`, `mprWl` del store. `const libre = clipMode === "libre"`.
- Conmutador «RECORTE» (`HudToggleGroup` con `[{key:"eje",label:"EJE"},{key:"libre",label:"LIBRE"}]`, un `span` «RECORTE ▸» delante) a la derecha de AX·COR·SAG en la fila superior izquierda (`top:52,left:14`); en LIBRE el grupo AX·COR·SAG recibe `style={{ opacity: 0.45 }}`. En LIBRE, junto al conmutador, `HudToggleGroup` «CARA ●/○» que alterna `cutFaceVisible`.
- Efecto de recorte (hoy `[axis, posMm, mipMode, mipSlabMm, reverse, image]`): añade `libre, freePlane, mprVoxel` a las dependencias; en LIBRE `n = normalOf(freePlane)`, `o = originOf(freePlane, mprVoxel, meta)`; acumulado → un `vtkPlane` origen `o`, normal `reverse ? n : −n`; lámina → dos planos, origen `o ∓ n·slab`, normales `+n`/`−n`. Siempre `removeAllClippingPlanes()` antes.
- Rueda en LIBRE: en el handler de rueda existente, si `libre` → `setFreePlane(clampOffsetToBox(wheelOffset(freePlane, e.deltaY, Math.min(...meta.spacing)), mprVoxel, meta))` en lugar de mover el índice.
- Cara del corte: efecto propio con dependencias `[libre, cutFaceVisible, freePlane, mprVoxel, image, mprWl]`: si `libre && cutFaceVisible`, crea (una vez, en una ref) `vtkImageResliceMapper` (`setInputData(image)`, `setSlabThickness(0)`, `setSlicePlane(plane)`) + `vtkImageSlice` (`getProperty().setColorWindow(ww)/setColorLevel(wc)`, `setInterpolationTypeToLinear()`), `actor.setPickable(false)`, `actor.setUseBounds(false)`, añadido al renderer; actualiza `plane.setNormal/setOrigin` y la ventana en cada cambio; si no, lo quita del renderer (`removeActor`) y lo deja en la ref para reutilizarlo; en la limpieza de la escena, `delete()`. Copia los imports de perfil que ya usa `ObliqueView` (ImageResliceMapper necesita el perfil de volumen o `All`). WHY: la geometría opaca se dibuja antes que el volumen, así que la cara se ve donde el tejido es transparente y los vasos por delante la tapan.
- Traza en LIBRE: `computeTraceRef` usa `clipPolygon(freePlane, mprVoxel, meta)` (en lámina, el polígono desplazado `±slab` a lo largo de `n`), proyectado con `toPx`, visible según `traceVisibleForNormal(dirección de cámara, n)`; color `PLANE_HEX.libre` (lo añade Task 6; hasta entonces usa `"#c77dff"` literal y sustitúyelo en Task 6 — anótalo).
- CENTRAR en LIBRE: `setFreePlane({ ...freePlane, offsetMm: 0 })` además del encuadre actual.
- Lectura: `mipReadoutLines({..., clip: clipMode, offsetMm: freePlane.offsetMm })`.

- [x] **Step 4: Verificar** → vitest de `planeTrace`, `mipReadout`, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3, VOLUMEN principal): RECORTE LIBRE con el plano del oblicuo; rueda mueve el mismo plano (comprobar en Oblicuo); cara en gris con la ventana de los cortes y vasos por delante tapándola; CARA ○ la quita; LÁMINA ±slab; MIP y COMPUESTO; volver a EJE restaura el recorte por eje y CENTRAR encuadra como en D1; fps en COMPUESTO + LIBRE + CARA (anotar). Capturas `t4_*.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/MipView.tsx frontend/src/vtk/mipReadout.ts frontend/src/vtk/mipReadout.test.ts frontend/src/vtk/planeTrace.ts frontend/src/vtk/planeTrace.test.ts
git commit -m "VOLUMEN recorta por el plano libre y pinta el corte en gris sobre la cara"
```

---

### Task 5: Ventana y nivel por preajuste en COMPUESTO

**Files:**
- Modify: `frontend/src/vtk/MipView.tsx`, `frontend/src/vtk/mipReadout.ts`, `frontend/src/vtk/mipReadout.test.ts`
- Create: `frontend/src/vtk/windowDrag.ts`, `frontend/src/vtk/windowDrag.test.ts`

**Interfaces:**
- Consumes: `volumeWindows`/`setVolumeWindow`, `volumePreset`, `volumeMode` (store); `presetToWindow`, `defaultWindow`, `VolumeWindow` (Task 2).
- Produces:

```ts
// windowDrag.ts (puro; la misma regla que SliceView)
export function windowFromDrag(start: VolumeWindow, dxPx: number, dyPx: number, range: [number, number]): VolumeWindow;  // k=(hi−lo)/400; wc = start.wc − dy·k; ww = max(1, start.ww + dx·k)
// mipReadout.ts: parámetro opcional `window?: VolumeWindow`; en compuesto añade la línea «NIV n · VENT n» (enteros); en compacto no se añade
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/windowDrag.test.ts
import { describe, expect, it } from "vitest";
import { windowFromDrag } from "./windowDrag";
describe("windowFromDrag", () => {
  it("vertical cambia el nivel y horizontal la ventana, 400 px recorren el rango", () => {
    expect(windowFromDrag({ wc: 2000, ww: 1000 }, 40, -40, [1000, 3000])).toEqual({ wc: 2200, ww: 1200 });
  });
  it("la ventana nunca baja de 1", () => {
    expect(windowFromDrag({ wc: 2000, ww: 10 }, -400, 0, [1000, 3000]).ww).toBe(1);
  });
});
// añadir a mipReadout.test.ts
it("en compuesto la lectura añade nivel y ventana", () => {
  expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, render: "compuesto", preset: "Hueso", window: { wc: 2200.4, ww: 1799.6 } }))
    .toEqual(["COMPUESTO · HUESO", "ACUMULADO HASTA 5/10", "NIV 2200 · VENT 1800"]);
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

```ts
// windowDrag.ts
import type { VolumeWindow } from "./volumePresets";
/* La misma sensibilidad que el arrastre de ventana de los cortes (SliceView):
   400 px recorren todo el rango robusto del volumen. */
export function windowFromDrag(start: VolumeWindow, dxPx: number, dyPx: number, range: [number, number]): VolumeWindow {
  const k = (range[1] - range[0]) / 400;
  return { wc: start.wc - dyPx * k, ww: Math.max(1, start.ww + dxPx * k) };
}
```

`MipView.tsx`: `const window = volumeWindows[volumePreset] ?? defaultWindow([rlo, rhi])`; el efecto de transferencia en COMPUESTO usa `presetToWindow(volumePreset, window)` (dependencia `window.wc, window.ww`); **botón derecho** (`e.button === 2`, `onContextMenu` prevenido) en COMPUESTO arrastra la ventana: al bajar guarda `{x, y, start: window}`, al mover `setVolumeWindow(volumePreset, windowFromDrag(start, dx, dy, [rlo, rhi]))` (en MIP el botón derecho no hace nada nuevo); en la fila de preajustes añade `HudToggleGroup` «RESTABLECER» → `setVolumeWindow(volumePreset, null)`; lectura con `window`. Comprueba cómo `MipView` intercepta ya Shift/central para el desplazamiento (listener en fase de captura que para la propagación hacia el interactor de vtk) y usa el mismo mecanismo para el botón derecho, para que vtk no haga zoom con él.

- [x] **Step 4: Verificar** → vitest de `windowDrag`, `mipReadout`, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador: en COMPUESTO el arrastre derecho cambia nivel/ventana con lectura en vivo; cambiar de preajuste recuerda cada ventana; RESTABLECER vuelve al defecto; en MIP el botón derecho no cambia nada. Captura `t5_ventana.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/MipView.tsx frontend/src/vtk/mipReadout.ts frontend/src/vtk/mipReadout.test.ts frontend/src/vtk/windowDrag.ts frontend/src/vtk/windowDrag.test.ts
git commit -m "Nivel y ventana por preajuste en COMPUESTO con el botón derecho y RESTABLECER"
```

---

### Task 6: El plano libre en el 3D, en los cortes y en las capturas

**Files:**
- Modify: `frontend/src/vtk/planeColors.ts`, `frontend/src/vtk/planeColors.test.ts`, `frontend/src/styles/tokens/colors.css`, `frontend/src/vtk/planeOutlines.ts`, `frontend/src/vtk/planeOutlines.test.ts`, `frontend/src/vtk/MeshView.tsx`, `frontend/src/vtk/SliceView.tsx`, `frontend/src/vtk/Viewer.tsx`, `frontend/src/vtk/MipView.tsx` (color literal de Task 4 → `PLANE_HEX.libre`)

**Interfaces:**
- Consumes: `clipPolygon`, `sliceSegment`, `FreePlane` (Task 1); `clipMode`, `freePlane` (Task 2).
- Produces:

```ts
// planeColors.ts
export type OutlinePlane = Plane | "libre";
export const PLANE_HEX: Record<OutlinePlane, string>;          // + libre: "#c77dff"
export const PLANE_CSS_VAR: Record<OutlinePlane, string>;      // + "var(--plane-libre)"
export function planeRgb01(p: OutlinePlane): [number, number, number];
// planeOutlines.ts
export interface PlaneOutline { plane: OutlinePlane; corners: Vec3[]; color: [number, number, number] }   // ≥ 3 vértices
export function planeOutlines(voxel, meta, free?: FreePlane | null): PlaneOutline[];   // 4.º contorno "libre" si `free` y su polígono no está vacío
// SliceView: prop nueva `freeSegment?: [[number, number], [number, number]] | null` dibujada en SVG
```

- [x] **Step 1: Tests que fallan**

```ts
// añadir a planeColors.test.ts: PLANE_HEX.libre existe, es distinto de los tres y de los reservados, y coincide con --plane-libre en colors.css (ampliar el test de sincronía existente)
// añadir a planeOutlines.test.ts
it("con plano libre hay un cuarto contorno con N vértices y su color", () => {
  const out = planeOutlines({ x: 3, y: 4, z: 5 }, meta, { azimuthDeg: 30, elevationDeg: 50, offsetMm: 0 });
  expect(out).toHaveLength(4);
  const libre = out.find((p) => p.plane === "libre")!;
  expect(libre.corners.length).toBeGreaterThanOrEqual(3);
  expect(libre.color[2]).toBeGreaterThan(libre.color[1]);     // lavanda: más azul que verde
});
it("sin plano libre o con el plano fuera de la caja siguen siendo tres", () => {
  expect(planeOutlines({ x: 3, y: 4, z: 5 }, meta)).toHaveLength(3);
  expect(planeOutlines({ x: 3, y: 4, z: 5 }, meta, { azimuthDeg: 0, elevationDeg: 0, offsetMm: 999 })).toHaveLength(3);
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

`colors.css`: `--plane-libre: #c77dff;` junto a los otros tres. `planeColors.ts`: tipo `OutlinePlane`, entradas `libre` en `PLANE_HEX`/`PLANE_CSS_VAR`; `referencePlanes` sigue tipada con `Plane`. `planeOutlines.ts`: `corners: Vec3[]`; tercer parámetro `free`; si `free`, `const poly = clipPolygon(free, voxel, meta); if (poly.length >= 3) out.push({ plane: "libre", corners: poly, color: planeRgb01("libre") })`. `MeshView.tsx`: el efecto de planos construye `lines = [N+1, 0..N−1, 0]` y `polys = [N, 0..N−1]` con `N = p.corners.length` (hoy fijo a 4). `SliceView.tsx`: prop `freeSegment`; un `<svg className="hud-decor" data-plane="libre">` absoluto sobre `box` con una `<line>` de `(u0·w, v0·h)` a `(u1·w, v1·h)`, `stroke=PLANE_CSS_VAR.libre`, `strokeWidth 1`, `strokeOpacity 0.85`, `pointer-events: none`. `Viewer.tsx`: `const showFreePlane = showPlanes && (viewMode === "oblique" || clipMode === "libre")`; `planes = planeOutlines(mprVoxel, meta, showFreePlane ? freePlane : null)`; cada `SliceView` recibe `freeSegment={showFreePlane ? sliceSegment(freePlane, mprVoxel, meta, plane, index) : null}`; `estadoVisor` añade `free_plane: { azimuth_deg, elevation_deg, offset_mm }`, `clip_mode`, `cut_face_visible`, `volume_window` (la del preajuste activo o `null`) leídos por refs como los campos de D1. `MipView.tsx`: sustituye el literal `"#c77dff"` por `PLANE_HEX.libre`.

- [x] **Step 4: Verificar** → vitest de `planeColors`, `planeOutlines`, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador: con la escena en Oblicuo o VOLUMEN en LIBRE aparece el polígono lavanda en el 3D y el segmento en los tres cortes, y se mueven con los deslizadores/rueda; en EJE y 3D normal no aparecen; PLANOS ○ los quita; el estado guardado trae los campos nuevos. Capturas `t6_*.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/planeColors.ts frontend/src/vtk/planeColors.test.ts frontend/src/styles/tokens/colors.css frontend/src/vtk/planeOutlines.ts frontend/src/vtk/planeOutlines.test.ts frontend/src/vtk/MeshView.tsx frontend/src/vtk/SliceView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/MipView.tsx
git commit -m "El plano libre se ve en el 3D, en los cortes y en el estado de las capturas"
```

---

### Task 7: Retirar `GET /volume/{sid}/raw`

**Files:**
- Modify: `backend/routers/mpr.py` (quitar `get_volume_raw` y su import), `backend/services/mpr.py` (quitar `get_volume_raw_uint8`; dejar `_downsampled_volume`, `_get_downsampled`, `volume_coarse_int16` y actualizar su docstring que cita a la función borrada), `backend/test_mpr_advanced.py` (quitar el import y las pruebas del servicio, del 200 y del 404 del raw), `frontend/src/api/client.ts` (quitar `volumeRawUrl`), `README.md` (quitar la nota «sin consumidor»; describir que el cliente carga el volumen por `/volume/{sid}/chunk/...`)

- [x] **Step 1: Prueba que falla** → añade en `backend/test_mpr_advanced.py`:

```python
def test_volume_raw_route_is_gone(client, session_id):
    assert client.get(f"/api/volume/{session_id}/raw").status_code == 404
```

(usa los fixtures que ya usan las pruebas vecinas; si el 404 lo da ya el router por sesión inexistente, usa una sesión válida).

- [x] **Step 2: Ver fallar** → `cd backend && .venv\Scripts\python -m pytest -q test_mpr_advanced.py -k raw` FAIL (hoy devuelve 200).

- [x] **Step 3: Implementación** → borra la ruta, el servicio, el import, las tres pruebas antiguas y `volumeRawUrl`; README.

- [x] **Step 4: Verificar** → `pytest -q test_mpr_advanced.py test_volume_chunks.py`; `cd frontend && npx tsc --noEmit -p . && npx vitest run`; `grep -rn "volume_raw\|volumeRawUrl\|/raw" backend frontend/src README.md` sin restos (salvo documentos históricos en `docs/`).

- [x] **Step 5: Commit**

```bash
git add backend/routers/mpr.py backend/services/mpr.py backend/test_mpr_advanced.py frontend/src/api/client.ts README.md
git commit -m "Se retira GET /volume/{sid}/raw: el cliente carga el volumen por trozos desde D1"
```

---

### Task 8: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección del visor: plano libre compartido, RECORTE EJE/LIBRE, CARA, ventana por preajuste), este plan (casillas).

- [x] **Step 1: Comprobación completa**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q -rf --no-header -p no:cacheprovider
```

Expected: frontend en verde; backend sin fallos nuevos frente a la línea base (36–37 preexistentes; las tres pruebas del raw ya no existen).

- [x] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)

1. Oblicuo: AZIMUT/ELEVACIÓN y arrastre derecho orientan; rueda desplaza y se detiene en la caja; CENTRAR y AJUSTAR.
2. VOLUMEN LIBRE muestra el mismo plano; la rueda en VOLUMEN se refleja en Oblicuo y al revés.
3. Cara del corte en gris con la ventana de los cortes (cambiar la ventana en un corte la cambia en la cara); CARA ○ la quita; vasos por delante la tapan.
4. LÁMINA en LIBRE recorta ±slab alrededor del plano; DESDE EL FINAL invierte.
5. Volver a EJE devuelve el recorte por eje; CENTRAR encuadra como en D1; sin restos de la cara.
6. COMPUESTO: arrastre derecho cambia NIV/VENT por preajuste; cada preajuste recuerda su ventana; RESTABLECER; en MIP el botón derecho no cambia nada.
7. Plano libre lavanda en el 3D y segmentos en los tres cortes solo en Oblicuo/LIBRE; PLANOS ○ los quita.
8. fps en COMPUESTO + LIBRE + CARA en la principal (anotar; ≥ 20).
9. Estado guardado con `free_plane`, `clip_mode`, `cut_face_visible`, `volume_window`.
10. `GET /api/volume/{sid}/raw` responde 404; el visor sigue cargando el volumen por trozos.

- [x] **Step 3: README y commit de cierre**

```bash
git add README.md docs/superpowers/plans/2026-10-02-volumen-unificado.md
git commit -m "Cierre del volumen unificado (D2): lista manual y README"
```
