# Coherencia del visor (D1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el profesional elija la vista principal en un gesto visible, vea cada plano de corte con un color fijo en los cortes, en el MIP y como rectángulo en el 3D junto al punto compartido, y tenga el volumen como vista propia («VOLUMEN», modos MIP y COMPUESTO) en lugar de un modo que sustituye al 3D.

**Architecture:** Un módulo puro `planeColors.ts` fija el color de cada plano y lo consumen `SliceView` (rótulo y líneas de referencia), `MipView` (traza) y `MeshView` (rectángulos). Otro módulo puro `planeOutlines.ts` calcula las cuatro esquinas de cada plano a partir de `mprVoxel` y `meta`; `MeshView` gana la prop `planes` y las dibuja como polilíneas sin iluminación más un marcador del punto. `ViewerGrid` gana un botón «⤢» por celda y `Viewer` un selector «PRINCIPAL» que llaman a `promote`. La vista `mip` se rotula «VOLUMEN» y gana `renderMode` MIP/COMPUESTO: el modo compuesto reutiliza el mismo mapper con mezcla por composición y los preajustes de tejido traducidos del dominio 0–255 al rango real de intensidades (`volumePresets.ts`, puro); el modo «Volumen» de la escena se retira y `VolumeView.tsx` se borra.

**Tech Stack:** React 19, TypeScript, vtk.js 36.2.1 (`vtkVolumeMapper` blend modes, `vtkColorTransferFunction`, `vtkPiecewiseFunction`, `vtkPolyData` de líneas), vitest + Testing Library. Sin dependencias nuevas. Sin cambios de backend.

**Spec:** `docs/superpowers/specs/2026-10-01-coherencia-visor-design.md`

## Global Constraints

- Sin dependencias nuevas; nunca se commitea `frontend/package-lock.json`; copia y comentarios WHY en español; rótulos del HUD en mayúsculas mono como los existentes.
- `PaneId` no cambia (`"scene" | "axial" | "coronal" | "sagital" | "mip"`); el id `mip` conserva su nombre interno y la clave guardada; solo cambian rótulo y contenido.
- Colores de plano (una sola definición, `vtk/planeColors.ts`): axial `#4cc9f0`, coronal `#80ed99`, sagital `#f4a261`; expuestos también como variables CSS `--plane-axial`, `--plane-coronal`, `--plane-sagital`. Ninguno coincide con el ámbar `--hud-amber` (`#FFC857`), el verde del HUD `--hud` (`#8CFF9E`), el magenta del cuello residual (`#d946ef`), el gris no alcanzado (`#6b7280`), el verde del saco (`SAC_COLOR` [0.25,0.80,0.45] ≈ `#40cc73`) ni el dorado del clip (`DEVICE_COLOR` [0.92,0.82,0.45] ≈ `#ebd173`).
- Rectángulos de plano en 3D: líneas de 1 px, opacidad 0,85, sin iluminación, no seleccionables; relleno translúcido al 6 %; marcador del punto compartido radio 0,6 mm color `--hud`. Interruptor «PLANOS ●/○» (clave `viewer.planesHidden`, por defecto visibles); REGLAS ○ también los oculta.
- Selector «PRINCIPAL ▸ 3D · AX · COR · SAG · VOL» en la cabecera, a la izquierda antes de los presets; botón «⤢» (24 px, `title="Hacer principal"`) en la esquina superior derecha de cada celda secundaria, fuera del asa; ambos llaman a `promote(layout, id)`.
- VOLUMEN: conmutador «MIP · COMPUESTO» arriba a la izquierda junto a AX·COR·SAG; preajustes CTA, Vasos CTA, Cerebro, Hemorragia, Hueso, Tejido blando (los seis de `VolumeView`) traducidos linealmente de 0–255 al rango robusto `meta.intensity_range` (`[p0.5, p99.9]`); recorte, gestos y traza iguales en los dos modos; si COMPUESTO baja de 20 fps en la celda principal con Case 3, `setSampleDistance` ×1,5 y sombreado apagado en el preajuste por defecto (medir y anotar).
- La escena 3D pierde el modo «volume»: conmutador «3D · Oblicuo»; `VolumeView.tsx` se borra; `GET /volume/{sid}/raw` queda sin consumidor y se anota en el README.
- `estadoVisor` añade `volume_mode`, `volume_preset` y `planes_hidden`.
- Verificación: `npx tsc --noEmit -p .` limpio; `npx vitest run` sin regresiones (477 al empezar); `npm run build` correcto; comprobación en navegador con Case 3 («Case 3 revision», admin/admin123) donde la tarea lo indique.

## Review Focus

1. Sin `meta` (estudio sin volumen o carga en curso): ni rectángulos ni marcador se dibujan y nada lanza; el selector PRINCIPAL sigue funcionando → test en Task 3 (`planeOutlines` devuelve `[]` sin `meta`) y Task 2.
2. Volumen no alineado con LPS (Case 3): los rectángulos son los planos de ÍNDICE (ejes de vóxel), igual que las vistas de cortes y la traza del MIP; nunca los anatómicos → test en Task 3 (esquinas en coordenadas de vóxel·spacing) y comprobación visual en Task 5.
3. Celda pequeña (< 260 px de alto): el botón «⤢» no pisa el asa de arrastre ni la marca de esquina y sigue siendo pulsable → test en Task 2 (posición/clase) y navegador en Task 5.
4. Estado del store: `volumeMode`/`volumePreset` arrancan en `"mip"`/`"Vasos CTA"`, sus setters cambian el valor y no tocan `mipMode`/`mipPlane` (misma vida que el resto del estado del MIP: el store se crea por sesión) → test en Task 4 (`store/planning.test.tsx`).
5. COMPUESTO con un preajuste cuya banda cae fuera del rango real (p. ej. «Hueso» en un estudio sin hueso): la función de transferencia no produce NaN ni un volumen negro sin aviso; la lectura de esquina dice el preajuste → test en Task 4 (`presetToRange` con rango degenerado devuelve puntos monótonos).

---

### Task 1: Colores de plano en cortes y MIP

**Files:**
- Create: `frontend/src/vtk/planeColors.ts`, `frontend/src/vtk/planeColors.test.ts`
- Modify: `frontend/src/vtk/SliceView.tsx` (rótulo y líneas de referencia), `frontend/src/vtk/MipView.tsx` (traza), `frontend/src/vtk/hud/HudFrame.tsx` (`labelPlane`), `frontend/src/vtk/hud/hud.css` (`.hud-label[data-plane]`), `frontend/src/styles/tokens/colors.css` (`--plane-*`)

**Interfaces:**
- Produces:

```ts
export type Plane = "axial" | "coronal" | "sagital";                 // re-export de geometry.ts
export const PLANE_HEX: Record<Plane, string>;                         // "#4cc9f0" | "#80ed99" | "#f4a261"
export const PLANE_CSS_VAR: Record<Plane, string>;                     // "var(--plane-axial)" …
export function planeRgb01(p: Plane): [number, number, number];        // 0–1 para vtk
export const RESERVED_HEX: string[];                                   // ámbar, magenta, gris, saco, clip (para el test)
/** Qué plano representa cada línea de referencia de un corte: u = vertical, v = horizontal. */
export function referencePlanes(plane: Plane): { u: Plane; v: Plane };  // axial → {u:"sagital", v:"coronal"}, coronal → {u:"sagital", v:"axial"}, sagital → {u:"coronal", v:"axial"}
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/planeColors.test.ts
import { describe, expect, it } from "vitest";
import { PLANE_HEX, RESERVED_HEX, planeRgb01, referencePlanes } from "./planeColors";

describe("planeColors", () => {
  it("tres planos, tres colores distintos y ninguno reservado", () => {
    const hexes = Object.values(PLANE_HEX);
    expect(new Set(hexes).size).toBe(3);
    for (const h of hexes) expect(RESERVED_HEX.map((r) => r.toLowerCase())).not.toContain(h.toLowerCase());
  });
  it("convierte a 0–1 para vtk", () => {
    const [r, g, b] = planeRgb01("axial");
    expect(r).toBeCloseTo(0x4c / 255, 5); expect(g).toBeCloseTo(0xc9 / 255, 5); expect(b).toBeCloseTo(0xf0 / 255, 5);
  });
  it("cada corte sabe qué plano es cada línea de referencia", () => {
    expect(referencePlanes("axial")).toEqual({ u: "sagital", v: "coronal" });
    expect(referencePlanes("coronal")).toEqual({ u: "sagital", v: "axial" });
    expect(referencePlanes("sagital")).toEqual({ u: "coronal", v: "axial" });
  });
});
```

- [x] **Step 2: Ejecutar y ver fallar** → `cd frontend && npx vitest run src/vtk/planeColors.test.ts` FAIL (módulo inexistente).

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/planeColors.ts
/* Un color por plano de corte, el mismo en todas partes: el rótulo del corte,
   sus líneas de referencia en los otros cortes, la traza del MIP y su rectángulo
   en el 3D. Elegidos para no chocar con los colores que ya significan algo:
   ámbar (avisos), verde del HUD, magenta (cuello residual), gris (no alcanzado),
   verde del saco y dorado del clip. */
import type { Plane } from "./geometry";
export type { Plane };

export const PLANE_HEX: Record<Plane, string> = { axial: "#4cc9f0", coronal: "#80ed99", sagital: "#f4a261" };
export const PLANE_CSS_VAR: Record<Plane, string> = {
  axial: "var(--plane-axial)", coronal: "var(--plane-coronal)", sagital: "var(--plane-sagital)",
};
/** Ámbar y verde del HUD, magenta y gris del mapa de calor, verde del saco, dorado del clip. */
export const RESERVED_HEX = ["#ffc857", "#8cff9e", "#d946ef", "#6b7280", "#40cc73", "#ebd173"];

export function planeRgb01(p: Plane): [number, number, number] {
  const h = PLANE_HEX[p].slice(1);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** En un corte, la línea vertical (u) y la horizontal (v) son la huella de los
 *  otros dos planos; ver `planeCfg` en Viewer.tsx. */
export function referencePlanes(plane: Plane): { u: Plane; v: Plane } {
  if (plane === "axial") return { u: "sagital", v: "coronal" };
  if (plane === "coronal") return { u: "sagital", v: "axial" };
  return { u: "coronal", v: "axial" };
}
```

Los valores de `RESERVED_HEX` salen de `styles/tokens/colors.css` (`--hud`, `--hud-amber`), `Viewer.tsx` (`SAC_COLOR`, `DEVICE_COLOR`, convertidos de 0–1 a hex redondeando) y `clipFieldLegend.ts` (magenta y gris); si alguno difiere de lo escrito aquí, corrige la constante, no el test.

`styles/tokens/colors.css` (donde viven `--hud*`): añade `--plane-axial: #4cc9f0; --plane-coronal: #80ed99; --plane-sagital: #f4a261;` y la regla `.hud-label[data-plane="axial"] { color: var(--plane-axial); }` (y las otras dos). `HudFrame` acepta `labelPlane?: Plane` y lo pone en `data-plane` del `span.hud-label`.

`SliceView.tsx`: `<HudFrame active={p.active} label={LABEL[p.plane]} labelPlane={p.plane}>`; las dos líneas de referencia pasan de `background: "var(--hud-amber)"` a `PLANE_CSS_VAR[referencePlanes(p.plane).u]` (vertical) y `.v` (horizontal), con `data-plane` en cada `div` para el test; opacidad 0,7 (el ámbar al 0,5 se perdía; con color propio basta algo más de presencia).

`MipView.tsx`: el `<polygon>` de la traza usa `stroke={PLANE_HEX[plane]}` en lugar de `var(--hud-amber)`.

Test adicional en `SliceView` (si existe `SliceView.test.tsx`; si no, créalo mínimo con el patrón de los tests de componentes vtk, mockeando el render): las dos líneas de referencia del corte axial llevan `data-plane="sagital"` (vertical) y `data-plane="coronal"` (horizontal). Si montar `SliceView` en jsdom resulta impracticable (vtk.js), deja el test del módulo puro y comprueba las líneas en navegador en la Task 5; dilo en el informe.

- [x] **Step 4: Verificar** → `npx vitest run src/vtk/planeColors.test.ts`, `npx tsc --noEmit -p .`, `npx vitest run`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/planeColors.ts frontend/src/vtk/planeColors.test.ts frontend/src/vtk/SliceView.tsx frontend/src/vtk/MipView.tsx frontend/src/vtk/hud/hud.css frontend/src/vtk/hud/HudFrame.tsx frontend/src/styles/tokens/colors.css
git commit -m "Cada plano de corte tiene su color: rótulo, líneas de referencia y traza del MIP"
```

---

### Task 2: Elegir la vista principal: selector «PRINCIPAL» y botón «⤢»

**Files:**
- Modify: `frontend/src/vtk/ViewerGrid.tsx`, `frontend/src/vtk/ViewerGrid.test.tsx`, `frontend/src/vtk/Viewer.tsx` (cabecera, grupo de la izquierda), `frontend/src/vtk/hud/hud.css` (`.viewer-maximize`)
- Create: `frontend/src/vtk/mainOptions.ts`, `frontend/src/vtk/mainOptions.test.ts`

**Interfaces:**
- Consumes: `promote(layout, id)`, `PaneId`, `ViewerLayout` (`vtk/layout.ts`); `HudToggleGroup`.
- Produces:

```ts
// mainOptions.ts
export const MAIN_LABELS: Record<PaneId, string> = { scene: "3D", axial: "AX", coronal: "COR", sagital: "SAG", mip: "VOL" };
export function mainOptions(): { key: PaneId; label: string; title: string }[];   // en el orden scene, axial, coronal, sagital, mip
// ViewerGrid: cada celda secundaria renderiza <button class="viewer-maximize" title="Hacer principal" aria-label="Hacer principal: <LABEL>">⤢</button>
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/mainOptions.test.ts
import { describe, expect, it } from "vitest";
import { MAIN_LABELS, mainOptions } from "./mainOptions";

describe("mainOptions", () => {
  it("cinco vistas en orden fijo con rótulos cortos", () => {
    expect(mainOptions().map((o) => o.key)).toEqual(["scene", "axial", "coronal", "sagital", "mip"]);
    expect(mainOptions().map((o) => o.label)).toEqual(["3D", "AX", "COR", "SAG", "VOL"]);
    expect(MAIN_LABELS.mip).toBe("VOL");
  });
  it("cada opción explica qué hace", () => {
    for (const o of mainOptions()) expect(o.title).toMatch(/principal/i);
  });
});
```

```tsx
// añadir a frontend/src/vtk/ViewerGrid.test.tsx
it("cada celda secundaria tiene el botón de maximizar y la principal no", () => {
  const { cell, onLayoutChange } = setup();
  expect(cell("scene").querySelector(".viewer-maximize")).toBeNull();
  const btn = cell("coronal").querySelector<HTMLButtonElement>(".viewer-maximize")!;
  expect(btn.getAttribute("aria-label")).toBe("Hacer principal: COR");
  fireEvent.click(btn);
  expect(onLayoutChange).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, main: "coronal", side: ["axial", "scene", "sagital", "mip"] });
});
it("el botón de maximizar no inicia un arrastre ni cuenta como doble clic del asa", () => {
  const { cell, onLayoutChange } = setup();
  const btn = cell("mip").querySelector<HTMLButtonElement>(".viewer-maximize")!;
  fireEvent.pointerDown(btn, { button: 0, clientX: 5, clientY: 5, pointerId: 9 });
  fireEvent.pointerMove(btn, { clientX: 60, clientY: 5, pointerId: 9 });
  fireEvent.pointerUp(btn, { clientX: 60, clientY: 5, pointerId: 9 });
  expect(onLayoutChange).not.toHaveBeenCalled();
  fireEvent.click(btn);
  expect(onLayoutChange).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Ver fallar** → `npx vitest run src/vtk/mainOptions.test.ts src/vtk/ViewerGrid.test.tsx` FAIL.

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/mainOptions.ts
/* Las cinco vistas del visor como opciones del selector «PRINCIPAL». El rótulo
   es corto porque va en la cabecera junto a los presets; el título explica. */
import type { PaneId } from "./layout";
export const MAIN_LABELS: Record<PaneId, string> = { scene: "3D", axial: "AX", coronal: "COR", sagital: "SAG", mip: "VOL" };
const ORDER: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
const TITLES: Record<PaneId, string> = {
  scene: "Hacer principal la escena 3D", axial: "Hacer principal el corte axial", coronal: "Hacer principal el corte coronal",
  sagital: "Hacer principal el corte sagital", mip: "Hacer principal la vista de volumen (MIP / compuesto)",
};
export function mainOptions() { return ORDER.map((key) => ({ key, label: MAIN_LABELS[key], title: TITLES[key] })); }
```

`ViewerGrid.tsx`: dentro de cada celda visible y no principal, después del asa:

```tsx
{!hidden && !isMain && (
  <button type="button" className="viewer-maximize" title="Hacer principal" aria-label={`Hacer principal: ${MAIN_LABELS[id]}`}
          // El asa de arrastre ocupa el borde superior: el botón va encima (z 8) y
          // detiene el puntero para que pulsarlo no empiece un arrastre.
          onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onLayoutChange(promote(layout, id)); }}>⤢</button>
)}
```

`hud.css`: `.viewer-maximize { position: absolute; top: 2px; right: 20px; width: 24px; height: 20px; z-index: 8; background: transparent; border: none; color: var(--hud-dim); font-family: var(--font-mono); font-size: 13px; cursor: pointer; } .viewer-maximize:hover { color: var(--hud); }` (a 20 px de la derecha para no pisar la marca de esquina de 12 px a 6 px del borde).

`Viewer.tsx`: en el grupo de la izquierda de la cabecera (donde están DERECHA/ABAJO/SOLA), ANTES de los presets:

```tsx
<HudToggleGroup options={mainOptions()} value={viewerLayout.main}
  onChange={(k) => setViewerLayout(promote(viewerLayout, k as PaneId))} />
```

con un rótulo mono «PRINCIPAL» delante (un `span` con `color: var(--hud-dim)`). Si en una principal estrecha (< 800 px) el grupo pisa el rótulo centrado, los presets pasan a abreviaturas «DER · ABA · SOLA» (comprobación en navegador).

- [x] **Step 4: Verificar** → vitest de los dos archivos, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3): PRINCIPAL cambia la vista grande y refleja el estado tras un doble clic o un arrastre; «⤢» en cada celda; a 1280×720 nada se pisa en la cabecera.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/mainOptions.ts frontend/src/vtk/mainOptions.test.ts frontend/src/vtk/ViewerGrid.tsx frontend/src/vtk/ViewerGrid.test.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/hud/hud.css
git commit -m "La vista principal se elige con un selector y un botón de maximizar en cada celda"
```

---

### Task 3: Los planos de corte y el punto compartido en el 3D

**Files:**
- Create: `frontend/src/vtk/planeOutlines.ts`, `frontend/src/vtk/planeOutlines.test.ts`
- Modify: `frontend/src/vtk/MeshView.tsx` (prop `planes`), `frontend/src/vtk/Viewer.tsx` (construcción, interruptor PLANOS, marcador, `estadoVisor`), `frontend/src/vtk/viewerPrefs.ts` (`PREF_PLANES_HIDDEN`)

**Interfaces:**
- Consumes: `planeRgb01`, `PLANE_HEX` (Task 1); `voxelToMm`, `VolumeMeta` (`geometry.ts`, `api/types.ts`); `MeshMarker`.
- Produces:

```ts
// planeOutlines.ts
export interface PlaneOutline { plane: Plane; corners: [Vec3, Vec3, Vec3, Vec3]; color: [number, number, number] }
/** Los tres planos de ÍNDICE (ejes de vóxel) que pasan por `voxel`, con la extensión del volumen; [] sin meta. */
export function planeOutlines(voxel: { x: number; y: number; z: number } | null, meta: VolumeMeta | null): PlaneOutline[];
// MeshView
planes?: PlaneOutline[];      // rectángulos de líneas sin iluminación, no seleccionables; se redibujan al cambiar
// viewerPrefs
export const PREF_PLANES_HIDDEN = "viewer.planesHidden";
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/planeOutlines.test.ts
import { describe, expect, it } from "vitest";
import { planeOutlines } from "./planeOutlines";
import type { VolumeMeta } from "../api/types";

const meta = { shape: [10, 20, 30], spacing: [1, 0.5, 0.25] } as unknown as VolumeMeta;   // (z,y,x) y (sz,sy,sx)

describe("planeOutlines", () => {
  it("sin meta o sin vóxel no hay planos", () => {
    expect(planeOutlines(null, meta)).toEqual([]);
    expect(planeOutlines({ x: 0, y: 0, z: 0 }, null)).toEqual([]);
  });
  it("el plano axial pasa por z del vóxel y cubre toda la extensión x,y en mm", () => {
    const ax = planeOutlines({ x: 3, y: 4, z: 5 }, meta).find((p) => p.plane === "axial")!;
    expect(ax.corners.every((c) => Math.abs(c[2] - 5 * 1) < 1e-9)).toBe(true);           // z = 5 × sz
    const xs = ax.corners.map((c) => c[0]), ys = ax.corners.map((c) => c[1]);
    expect(Math.min(...xs)).toBe(0); expect(Math.max(...xs)).toBeCloseTo(29 * 0.25);      // (nx−1)·sx
    expect(Math.min(...ys)).toBe(0); expect(Math.max(...ys)).toBeCloseTo(19 * 0.5);
  });
  it("sagital fija x y coronal fija y, con el color de su plano", () => {
    const out = planeOutlines({ x: 3, y: 4, z: 5 }, meta);
    const sag = out.find((p) => p.plane === "sagital")!, cor = out.find((p) => p.plane === "coronal")!;
    expect(sag.corners.every((c) => Math.abs(c[0] - 3 * 0.25) < 1e-9)).toBe(true);
    expect(cor.corners.every((c) => Math.abs(c[1] - 4 * 0.5) < 1e-9)).toBe(true);
    expect(sag.color[0]).toBeGreaterThan(sag.color[2]);     // naranja: más rojo que azul
    expect(cor.color[1]).toBeGreaterThan(cor.color[0]);     // verde
  });
  it("mover el corte mueve solo su rectángulo", () => {
    const a = planeOutlines({ x: 3, y: 4, z: 5 }, meta), b = planeOutlines({ x: 3, y: 4, z: 9 }, meta);
    expect(a.find((p) => p.plane === "coronal")).toEqual(b.find((p) => p.plane === "coronal"));
    expect(a.find((p) => p.plane === "axial")).not.toEqual(b.find((p) => p.plane === "axial"));
  });
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/planeOutlines.ts
/* Los tres planos de corte como rectángulos en coordenadas de la malla
   (vóxel × espaciado, el mismo marco que usan las vistas de cortes y la traza
   del MIP). Son planos de ÍNDICE: en un volumen no alineado con LPS el «axial»
   es el plano k, igual que en la celda AXIAL, y así los rectángulos del 3D
   coinciden con lo que enseñan los cortes. */
import type { VolumeMeta } from "../api/types";
import type { Plane, Vec3 } from "./geometry";
import { planeRgb01 } from "./planeColors";

export interface PlaneOutline { plane: Plane; corners: [Vec3, Vec3, Vec3, Vec3]; color: [number, number, number] }

export function planeOutlines(voxel: { x: number; y: number; z: number } | null, meta: VolumeMeta | null): PlaneOutline[] {
  if (!voxel || !meta) return [];
  const [nz, ny, nx] = meta.shape; const [sz, sy, sx] = meta.spacing;
  const X = (nx - 1) * sx, Y = (ny - 1) * sy, Z = (nz - 1) * sz;
  const x = voxel.x * sx, y = voxel.y * sy, z = voxel.z * sz;
  const rect = (plane: Plane, corners: [Vec3, Vec3, Vec3, Vec3]): PlaneOutline => ({ plane, corners, color: planeRgb01(plane) });
  return [
    rect("axial",   [[0, 0, z], [X, 0, z], [X, Y, z], [0, Y, z]]),
    rect("coronal", [[0, y, 0], [X, y, 0], [X, y, Z], [0, y, Z]]),
    rect("sagital", [[x, 0, 0], [x, Y, 0], [x, Y, Z], [x, 0, Z]]),
  ];
}
```

`MeshView.tsx`: nueva prop `planes?: PlaneOutline[]` y un efecto propio (clave `planes.map(p => p.corners.flat().join(",")).join(";")`) que borra los actores anteriores (`planeActors` ref) y, por plano, crea un `vtkPolyData` con 4 puntos y una celda de línea cerrada (`lines` = `[5, 0,1,2,3,0]`) + un `vtkPolyData` con un polígono (`polys` = `[4, 0,1,2,3]`) para el relleno: actor de líneas con `getProperty().setLineWidth(1)`, `setColor(...color)`, `setOpacity(0.85)`, `setLighting(false)`, `setPickable(false)`; actor de relleno `setOpacity(0.06)`, `setLighting(false)`, `setPickable(false)`. Se añaden al renderer y se renderiza. Importa `vtkPolyData` de `@kitware/vtk.js/Common/DataModel/PolyData` y usa `getLines().setData(Uint32Array)` / `getPolys().setData(...)`. Los planos no cuentan para `resetCamera` ni para el encuadre (no toques `sceneDiagonal`).

`Viewer.tsx`: `const [planesHidden, setPlanesHidden] = useStoredFlag(PREF_PLANES_HIDDEN);` `const planes = useMemo(() => (planesHidden || decorHidden || !meta ? [] : planeOutlines(mprVoxel, meta)), [planesHidden, decorHidden, meta, mprVoxel]);` y pásalo a `<MeshView planes={planes} …/>` en la escena de malla. Marcador del punto: `MeshMarker` gana `radiusMm?: number` (radio absoluto en mm; cuando está, sustituye a `markerRadiusMm(...) * scale` en el `vtkSphereSource`), y `Viewer` añade a `markers` `{ pos: voxelToMm(mprVoxel, meta), color: HUD_RGB, radiusMm: 0.6 }` donde `HUD_RGB` es `#8CFF9E` en 0–1 (`[0.549, 1, 0.620]`), solo cuando hay `meta` y los planos no están ocultos. Interruptor en la cabecera (grupo de la derecha, antes de REGLAS): «PLANOS ●/○» con `title` «Mostrar/ocultar los planos de corte en el 3D». `estadoVisor` añade `planes_hidden: planesHiddenRef.current`.

- [x] **Step 4: Verificar** → `npx vitest run src/vtk/planeOutlines.test.ts`, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3): tres rectángulos en el 3D con los colores de los cortes, moviéndose con la rueda en cada corte; el marcador del punto; PLANOS ○ los quita y REGLAS ○ también; comparar con la traza del MIP y las líneas de referencia: mismos planos, mismos colores. Capturas `t3_*.png` en el scratchpad.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/planeOutlines.ts frontend/src/vtk/planeOutlines.test.ts frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/viewerPrefs.ts
git commit -m "El 3D dibuja los tres planos de corte con su color y el punto compartido"
```

---

### Task 4: La vista «VOLUMEN»: modos MIP y COMPUESTO con preajustes de tejido

**Files:**
- Create: `frontend/src/vtk/volumePresets.ts`, `frontend/src/vtk/volumePresets.test.ts`
- Modify: `frontend/src/vtk/MipView.tsx` (modo, preajustes, rótulo), `frontend/src/vtk/mipReadout.ts` (+test), `frontend/src/store/planning.tsx` (`volumeMode`, `volumePreset`, reset), `frontend/src/vtk/Viewer.tsx` (rótulo VOLUMEN, quitar modo «volume» de la escena, `estadoVisor`), `frontend/src/vtk/mainOptions.ts` (sin cambios de código; el rótulo VOL ya está)
- Delete: `frontend/src/vtk/VolumeView.tsx`
- Modify: `README.md` (nota: `GET /volume/{sid}/raw` sin consumidor en el frontend)

**Interfaces:**
- Consumes: `mipMode`, `mipPlane` (store), `meta.intensity_range` (`[p1, p99]`), `HudToggleGroup`.
- Produces:

```ts
// volumePresets.ts
export type VolumePreset = "CTA" | "Vasos CTA" | "Cerebro" | "Hemorragia" | "Hueso" | "Tejido blando";
export const VOLUME_PRESETS: VolumePreset[];
export interface TransferPoints { color: [number, number, number, number][]; opacity: [number, number][]; lighting: { ambient: number; diffuse: number; specular: number } }
/** Los puntos del preajuste (dominio 0–255) llevados linealmente al rango real [lo, hi]; con lo ≥ hi se usa [lo, lo+1]. */
export function presetToRange(preset: VolumePreset, range: [number, number]): TransferPoints;
// store
volumeMode: "mip" | "compuesto"; setVolumeMode; volumePreset: VolumePreset; setVolumePreset;   // defectos "mip", "Vasos CTA"; se reinician con la sesión
```

- [x] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/volumePresets.test.ts
import { describe, expect, it } from "vitest";
import { VOLUME_PRESETS, presetToRange } from "./volumePresets";

describe("presetToRange", () => {
  it("hay seis preajustes con los nombres de siempre", () => {
    expect(VOLUME_PRESETS).toEqual(["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"]);
  });
  it("lleva 0 → lo y 255 → hi, y conserva el orden de los puntos", () => {
    const t = presetToRange("CTA", [1000, 3000]);
    expect(t.color[0][0]).toBe(1000); expect(t.color.at(-1)![0]).toBe(3000);
    expect(t.opacity[0][0]).toBe(1000); expect(t.opacity.at(-1)![0]).toBe(3000);
    for (let i = 1; i < t.color.length; i++) expect(t.color[i][0]).toBeGreaterThanOrEqual(t.color[i - 1][0]);
  });
  it("un rango degenerado no produce NaN ni puntos decrecientes", () => {
    const t = presetToRange("Hueso", [500, 500]);
    expect(t.opacity.every(([x, a]) => Number.isFinite(x) && Number.isFinite(a))).toBe(true);
    for (let i = 1; i < t.opacity.length; i++) expect(t.opacity[i][0]).toBeGreaterThanOrEqual(t.opacity[i - 1][0]);
  });
  it("los valores de color y opacidad no cambian, solo el dominio", () => {
    const t = presetToRange("Vasos CTA", [0, 255]);
    expect(t.color[2]).toEqual([120, 1, 0.18, 0.08]);
    expect(t.opacity[2]).toEqual([120, 0.75]);
  });
});
```

```ts
// añadir a frontend/src/vtk/mipReadout.test.ts
it("en compuesto la lectura nombra el preajuste y el corte", () => {
  expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, render: "compuesto", preset: "Vasos CTA" }))
    .toEqual(["COMPUESTO · VASOS CTA", "ACUMULADO HASTA 5/10"]);
  expect(mipReadoutLines({ mode: "lamina", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: true, render: "compuesto", preset: "Hueso" }))
    .toEqual(["COMP ±8"]);
});
```

- [x] **Step 2: Ver fallar** → FAIL.

- [x] **Step 3: Implementación**

```ts
// frontend/src/vtk/volumePresets.ts
/* Los preajustes de tejido del antiguo VolumeView, expresados en el dominio
   0–255 del volumen reducido que aquel pedía al servidor. Aquí se llevan al
   rango real de intensidades del volumen que ya está en el navegador, para
   que «Hueso» siga siendo hueso sin volver a bajar nada. */
export type VolumePreset = "CTA" | "Vasos CTA" | "Cerebro" | "Hemorragia" | "Hueso" | "Tejido blando";
export const VOLUME_PRESETS: VolumePreset[] = ["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"];
export interface TransferPoints { color: [number, number, number, number][]; opacity: [number, number][]; lighting: { ambient: number; diffuse: number; specular: number } }

const RAW: Record<VolumePreset, TransferPoints> = {
  // (copiar literalmente los seis preajustes de VolumeView.tsx líneas 32–65)
};

export function presetToRange(preset: VolumePreset, range: [number, number]): TransferPoints {
  const lo = range[0], hi = range[1] > range[0] ? range[1] : range[0] + 1;
  const map = (x: number) => lo + (x / 255) * (hi - lo);
  const p = RAW[preset];
  return {
    color: p.color.map(([x, r, g, b]) => [map(x), r, g, b] as [number, number, number, number]),
    opacity: p.opacity.map(([x, a]) => [map(x), a] as [number, number]),
    lighting: p.lighting,
  };
}
```

`MipView.tsx`: props sin cambios; lee `volumeMode`, `setVolumeMode`, `volumePreset`, `setVolumePreset` del store. Rótulo del `HudFrame` «VOLUMEN». Efecto del mapper: `volumeMode === "mip" ? mapper.setBlendModeToMaximumIntensity() : mapper.setBlendModeToComposite()`; efecto de la función de transferencia: en MIP la actual; en COMPUESTO `presetToRange(volumePreset, meta.intensity_range)` → `ctf.addRGBPoint` por punto, `otf.addPoint` por punto, `prop.setAmbient/Diffuse/Specular` del preajuste, `prop.setShade(true)`; `setSampleDistance(min spacing × 1.2)` como ahora; si la medición en navegador baja de 20 fps en la celda principal, ×1,5 y `setShade(false)` en el preajuste por defecto, con comentario WHY y la cifra. HUD: junto a AX·COR·SAG, `HudToggleGroup` «MIP · COMPUESTO»; en COMPUESTO una fila de preajustes bajo la lectura de la izquierda (`HudToggleGroup` con los seis nombres en mayúsculas); la lectura usa `mipReadoutLines({..., render, preset})`. La traza, el recorte y los gestos no cambian. En `Viewer.tsx` el `HudFrame label="MIP"` del estado de carga pasa a «VOLUMEN».

`mipReadout.ts`: parámetros nuevos `render: "mip" | "compuesto"` y `preset: string`; en compuesto la primera línea es `COMPUESTO · <PRESET EN MAYÚSCULAS>` y la segunda la de acumulado/lámina; en compacto `COMP ±N` o `COMP i/n`. En MIP la salida actual no cambia (test existente).

`planning.tsx`: `volumeMode`/`volumePreset` con sus setters, en el tipo y el value, con la misma vida que `mipMode`/`mipPlane` (`useState` en el proveedor, que se crea por sesión). Test en `store/planning.test.tsx`: valores por defecto y setters, sin tocar `mipMode`.

`Viewer.tsx`: quita `"volume"` del tipo `viewMode` y del conmutador (queda `[{default: 3D/MPR}, {oblique: Oblicuo}]`), elimina la rama `viewMode === "volume"` y el import de `VolumeView`; borra `frontend/src/vtk/VolumeView.tsx`; `estadoVisor` añade `volume_mode` y `volume_preset`. README: en la sección del visor, nota de que la vista VOLUMEN tiene modos MIP y COMPUESTO y que `GET /volume/{sid}/raw` queda sin consumidor en el frontend (D2 decide).

- [x] **Step 4: Verificar** → vitest de `volumePresets`, `mipReadout`, `store/planning`, `npx tsc --noEmit -p .`, `npx vitest run`. Navegador (Case 3): VOLUMEN como principal; MIP igual que antes; COMPUESTO con «Vasos CTA» enseña el árbol a color y la rueda lo construye; «Hueso» y «Cerebro» cambian el tejido visible; fps medidos (anotar); la traza del plano se ve en los dos modos; el conmutador de la escena ya no ofrece «Volumen». Capturas `t4_*.png`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/vtk/volumePresets.ts frontend/src/vtk/volumePresets.test.ts frontend/src/vtk/MipView.tsx frontend/src/vtk/mipReadout.ts frontend/src/vtk/mipReadout.test.ts frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/vtk/Viewer.tsx README.md
git rm frontend/src/vtk/VolumeView.tsx
git commit -m "La vista VOLUMEN reúne MIP y compuesto por tejidos sobre el volumen del navegador, y el 3D deja de tener modo volumen"
```

---

### Task 5: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección del visor: selector PRINCIPAL, botón ⤢, colores de plano y PLANOS, VOLUMEN), este plan (casillas).

- [x] **Step 1: Comprobación completa**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q -rf --no-header -p no:cacheprovider
```

Expected: frontend en verde; backend sin fallos nuevos frente a la línea base del ledger (este plan no toca el backend).

- [x] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)

1. PRINCIPAL ▸ AX pone el axial grande; ▸ VOL la vista de volumen; el selector refleja un doble clic en otra celda.
2. «⤢» en cada celda secundaria la sube; la principal no lo tiene.
3. Los rótulos AXIAL/CORONAL/SAGITAL llevan su color; las líneas de referencia de cada corte llevan los colores de los otros dos planos.
4. En el 3D se ven tres rectángulos con esos colores y el punto; la rueda en un corte mueve su rectángulo; coinciden con la traza del MIP.
5. PLANOS ○ quita rectángulos y punto; REGLAS ○ también; PLANOS recordado al recargar.
6. VOLUMEN en MIP se comporta como antes (acumulado/lámina, eje, traza, gestos).
7. VOLUMEN en COMPUESTO: «Vasos CTA», «Hueso», «Cerebro» cambian el tejido; la rueda construye el volumen; fps anotados en la principal.
8. El conmutador de la escena ofrece 3D · Oblicuo, sin Volumen; el oblicuo sigue funcionando.
9. Captura compuesta y grabación con VOLUMEN en COMPUESTO: la celda sale pintada; el estado guardado trae `volume_mode`, `volume_preset`, `planes_hidden`.

- [x] **Step 3: README y commit de cierre**

```bash
git add README.md docs/superpowers/plans/2026-10-01-coherencia-visor.md
git commit -m "Cierre de la coherencia del visor (D1): lista manual y README"
```
