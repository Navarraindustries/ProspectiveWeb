# Distribución configurable de las vistas y MIP interactivo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cinco vistas del visor se vean grandes y siempre visibles en una rejilla configurable (presets, separador arrastrable, intercambio arrastrando) que se recuerda por usuario, y que el MIP responda a los mismos gestos que las vistas de cortes y se vea construirse corte a corte desde él mismo.

**Architecture:** El modelo de distribución (`layout.ts`) pasa a `{ preset, main, side[4], mainFraction }` con migración desde el formato actual. Un componente nuevo `ViewerGrid` renderiza las cinco vistas UNA sola vez en una rejilla CSS y solo cambia su `grid-area` al reordenar, así los lienzos WebGL no se remontan; lleva el separador y el arrastre para intercambiar, con la lógica pura separada en `layoutGrid.ts` y `paneDrag.ts` para probarla en vitest. El MIP cambia su interacción de vtk por un `InteractorStyleManipulator` (rotar, desplazar, Ctrl+rueda zoom) y un oyente de rueda propio que mueve el corte compartido; elige su eje de acumulación y dibuja la traza del corte actual.

**Tech Stack:** React 19, TypeScript, vtk.js 36.2.1 (`vtkGenericRenderWindow`, `vtkInteractorStyleManipulator`, manipuladores de cámara, `vtkRenderer.worldToView`/`viewToNormalizedDisplay`), vitest + Testing Library, CSS Grid. Sin dependencias nuevas. Sin cambios de backend.

**Spec:** `docs/superpowers/specs/2026-10-01-distribucion-vistas-mip-design.md`

## Global Constraints

- Sin dependencias nuevas en `frontend/package.json`; nunca se commitea `frontend/package-lock.json` por ruido de `npm install`.
- Copia y comentarios WHY en español; rótulos del HUD en mayúsculas mono como los existentes (`HudToggleGroup`, `HudReadout`).
- Las cinco vistas se renderizan una sola vez y no se remontan al cambiar la distribución (misma referencia DOM antes y después de intercambiar o cambiar de preset).
- Presets: `"derecha"` (por defecto) · `"abajo"` · `"sola"`. `mainFraction` acotada a [0.5, 0.85]; defecto 0.72 en `derecha`, 0.74 en `abajo`.
- `localStorage`: clave nueva `ws.viewer.layout.v2`; migración desde `ws.viewer.layout` (v1) y desde `viewer.stripHidden` → `preset: "sola"`; las claves viejas se borran al migrar. Valores inválidos → `DEFAULT_LAYOUT`. Almacenamiento bloqueado → la vista funciona en memoria.
- Visor más alto que ancho (relación < 1) → `derecha` se dibuja como `abajo` sin cambiar el estado guardado.
- Arrastre para intercambiar: empieza tras > 6 px; `Escape` cancela; soltar fuera de una vista no intercambia; sin HTML5 DnD (eventos de puntero).
- Separador de 6 px, cursor `col-resize`/`row-resize`; doble clic devuelve la fracción por defecto del preset.
- Modo compacto del HUD por tamaño real de la celda: ancho < 420 px o alto < 260 px.
- MIP: rueda = corte ±1 acotado a [0, n−1]; Ctrl+rueda = zoom factor 1,1; arrastrar = rotar; botón central o Shift+arrastrar = desplazar; traza del corte en `var(--hud-amber)` (el color que las vistas de cortes ya usan para las líneas de referencia), oculta si la cámara mira el plano de canto (< 5°).
- Atajos `Alt+1`/`Alt+2`/`Alt+3` (sola/derecha/abajo) solo con el foco dentro del visor y nunca desde `input`, `textarea` o `select`. Con Alt porque los dígitos solos ya saltan de paso (Workspace).
- Verificación: `npx tsc --noEmit -p .` limpio; `npx vitest run` sin regresiones (364 tests al empezar); `npm run build` correcto; comprobación en navegador con Case 3 (sesión «Case 3 revision», admin/admin123) donde la tarea lo indique.

## Review Focus

1. Almacenamiento bloqueado (navegación privada): `loadLayout` devuelve el defecto y `saveLayout` no lanza → test en Task 1.
2. Ventana vertical (tablet en vertical, ventana estrecha): `derecha` se pinta como `abajo` sin reescribir lo guardado → test puro en Task 2 (`effectivePreset`); en jsdom el `ResizeObserver` no dispara, así que la parte visual se comprueba en el navegador en Task 5.
3. Volumen con un solo corte en el eje del MIP o rueda en los extremos: el índice se acota y no sale de rango → test en Task 7.
4. El profesional escribe «2» en un campo del panel lateral: no debe cambiar el preset → test en Task 5.
5. Arrastre interrumpido (se suelta fuera del visor o se pulsa Escape): sin intercambio y sin resalte colgado → test en Task 3 y Task 4.

---

### Task 1: Modelo de distribución v2 con migración

**Files:**
- Modify: `frontend/src/vtk/layout.ts` (reescritura completa)
- Modify: `frontend/src/vtk/layout.test.ts` (reescritura completa)

**Interfaces:**
- Produces:

```ts
export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
export type LayoutPreset = "derecha" | "abajo" | "sola";
export type SidePanes = [PaneId, PaneId, PaneId, PaneId];
export interface ViewerLayout { preset: LayoutPreset; main: PaneId; side: SidePanes; mainFraction: number }
export const ALL_PANES: PaneId[];
export const LAYOUT_KEY_V2 = "ws.viewer.layout.v2";
export const LAYOUT_KEY_V1 = "ws.viewer.layout";
export const STRIP_HIDDEN_KEY_V1 = "viewer.stripHidden";
export const FRACTION_MIN = 0.5; export const FRACTION_MAX = 0.85;
export function defaultFraction(p: LayoutPreset): number;       // derecha 0.72, abajo 0.74, sola 0.72
export const DEFAULT_LAYOUT: ViewerLayout;                        // derecha, scene, [axial, coronal, sagital, mip], 0.72
export function swapPanes(l: ViewerLayout, a: PaneId, b: PaneId): ViewerLayout;
export function promote(l: ViewerLayout, id: PaneId): ViewerLayout;   // sube `id` a principal; la principal baja a su hueco
export function setPreset(l: ViewerLayout, p: LayoutPreset): ViewerLayout;
export function setMainFraction(l: ViewerLayout, f: number): ViewerLayout;  // acota a [FRACTION_MIN, FRACTION_MAX]
export function isValidLayout(x: unknown): x is ViewerLayout;
export function migrateV1(rawV1: unknown, stripHidden: boolean): ViewerLayout | null;
export function loadLayout(): ViewerLayout;
export function saveLayout(l: ViewerLayout): void;
```

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/layout.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT, FRACTION_MAX, FRACTION_MIN, LAYOUT_KEY_V1, LAYOUT_KEY_V2, STRIP_HIDDEN_KEY_V1,
  defaultFraction, isValidLayout, loadLayout, migrateV1, promote, saveLayout, setMainFraction, setPreset, swapPanes,
} from "./layout";

describe("intercambiar y subir", () => {
  it("swapPanes intercambia dos huecos y deja el resto igual", () => {
    const l = swapPanes(DEFAULT_LAYOUT, "axial", "mip");
    expect(l.side).toEqual(["mip", "coronal", "sagital", "axial"]);
    expect(l.main).toBe("scene");
  });
  it("swapPanes con la principal es lo mismo que promote", () => {
    expect(swapPanes(DEFAULT_LAYOUT, "scene", "coronal")).toEqual(promote(DEFAULT_LAYOUT, "coronal"));
  });
  it("promote sube el hueco y baja la principal a su sitio", () => {
    const l = promote(DEFAULT_LAYOUT, "mip");
    expect(l.main).toBe("mip");
    expect(l.side).toEqual(["axial", "coronal", "sagital", "scene"]);
  });
  it("promote de la principal y swap de una vista consigo misma no cambian nada", () => {
    expect(promote(DEFAULT_LAYOUT, "scene")).toBe(DEFAULT_LAYOUT);
    expect(swapPanes(DEFAULT_LAYOUT, "axial", "axial")).toBe(DEFAULT_LAYOUT);
  });
  it("dos promotes seguidos devuelven al inicio", () => {
    expect(promote(promote(DEFAULT_LAYOUT, "axial"), "scene")).toEqual(DEFAULT_LAYOUT);
  });
});

describe("preset y fracción", () => {
  it("setPreset cambia solo el preset y conserva la asignación", () => {
    const l = setPreset(DEFAULT_LAYOUT, "abajo");
    expect(l.preset).toBe("abajo");
    expect(l.main).toBe("scene"); expect(l.side).toEqual(DEFAULT_LAYOUT.side);
  });
  it("setMainFraction acota a los límites", () => {
    expect(setMainFraction(DEFAULT_LAYOUT, 0.1).mainFraction).toBe(FRACTION_MIN);
    expect(setMainFraction(DEFAULT_LAYOUT, 0.99).mainFraction).toBe(FRACTION_MAX);
    expect(setMainFraction(DEFAULT_LAYOUT, 0.6).mainFraction).toBe(0.6);
    expect(setMainFraction(DEFAULT_LAYOUT, Number.NaN).mainFraction).toBe(defaultFraction("derecha"));
  });
  it("los defectos por preset son los del diseño", () => {
    expect(defaultFraction("derecha")).toBe(0.72);
    expect(defaultFraction("abajo")).toBe(0.74);
  });
});

describe("validez", () => {
  it("acepta el defecto y rechaza vistas repetidas, ausentes, fracción fuera de rango o preset desconocido", () => {
    expect(isValidLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, side: ["axial", "axial", "sagital", "mip"] })).toBe(false);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, side: ["axial", "coronal", "sagital"] })).toBe(false);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, mainFraction: 0.2 })).toBe(false);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, preset: "libre" })).toBe(false);
    expect(isValidLayout(null)).toBe(false);
  });
});

describe("migración desde v1", () => {
  it("convierte {main, strip} en preset abajo con la fracción de la franja de antes", () => {
    const l = migrateV1({ main: "coronal", strip: ["axial", "scene", "sagital", "mip"] }, false);
    expect(l).toEqual({ preset: "abajo", main: "coronal", side: ["axial", "scene", "sagital", "mip"], mainFraction: 0.74 });
  });
  it("la franja oculta de antes se convierte en preset sola", () => {
    expect(migrateV1({ main: "scene", strip: ["axial", "coronal", "sagital", "mip"] }, true)?.preset).toBe("sola");
  });
  it("devuelve null con basura", () => {
    expect(migrateV1({ main: "axial", strip: ["axial", "mip"] }, false)).toBeNull();
    expect(migrateV1("x", false)).toBeNull();
  });
});

describe("persistencia", () => {
  beforeEach(() => localStorage.clear());
  it("guarda y lee en la clave v2", () => {
    saveLayout(promote(DEFAULT_LAYOUT, "coronal"));
    expect(loadLayout()).toEqual(promote(DEFAULT_LAYOUT, "coronal"));
    expect(localStorage.getItem(LAYOUT_KEY_V2)).not.toBeNull();
  });
  it("sin v2, migra la v1 y la bandera de franja, y borra las claves viejas", () => {
    localStorage.setItem(LAYOUT_KEY_V1, JSON.stringify({ main: "mip", strip: ["axial", "coronal", "sagital", "scene"] }));
    localStorage.setItem(STRIP_HIDDEN_KEY_V1, "1");
    const l = loadLayout();
    expect(l).toEqual({ preset: "sola", main: "mip", side: ["axial", "coronal", "sagital", "scene"], mainFraction: 0.74 });
    expect(localStorage.getItem(LAYOUT_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STRIP_HIDDEN_KEY_V1)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY_V2)!)).toEqual(l);
  });
  it("con v2 inválida o sin nada vuelve al defecto", () => {
    localStorage.setItem(LAYOUT_KEY_V2, "{no json");
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    localStorage.clear();
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });
  it("con el almacenamiento bloqueado no lanza y devuelve el defecto", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(DEFAULT_LAYOUT)).not.toThrow();
    get.mockRestore(); set.mockRestore();
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `cd frontend && npx vitest run src/vtk/layout.test.ts`
Expected: FAIL (`swapPanes`, `promote`, … no exportados).

- [ ] **Step 3: Implementación**

```ts
// frontend/src/vtk/layout.ts
/* Distribución del visor: un preset (principal + columna a la derecha, principal
   + franja abajo, o la principal sola), qué vista ocupa cada hueco y qué fracción
   del eje repartido se lleva la principal. Las vistas no se remontan al cambiar
   de distribución: el modelo solo dice DÓNDE va cada una.

   Se guarda por usuario en el navegador. La v1 ({main, strip}) y la bandera
   «franja oculta» se migran una vez y se borran. */

export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
export type LayoutPreset = "derecha" | "abajo" | "sola";
export type SidePanes = [PaneId, PaneId, PaneId, PaneId];
export interface ViewerLayout { preset: LayoutPreset; main: PaneId; side: SidePanes; mainFraction: number }

export const ALL_PANES: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
const PRESETS: LayoutPreset[] = ["derecha", "abajo", "sola"];
export const LAYOUT_KEY_V2 = "ws.viewer.layout.v2";
export const LAYOUT_KEY_V1 = "ws.viewer.layout";
export const STRIP_HIDDEN_KEY_V1 = "viewer.stripHidden";
export const FRACTION_MIN = 0.5;
export const FRACTION_MAX = 0.85;

/** 0,74 en «abajo» equivale a la franja de 26 vh que había antes; 0,72 en
 *  «derecha» deja la principal casi cuadrada en 16:9. */
export function defaultFraction(p: LayoutPreset): number { return p === "abajo" ? 0.74 : 0.72; }

export const DEFAULT_LAYOUT: ViewerLayout = {
  preset: "derecha", main: "scene", side: ["axial", "coronal", "sagital", "mip"], mainFraction: defaultFraction("derecha"),
};

const clampFraction = (f: number, fallback: number) =>
  Number.isFinite(f) ? Math.min(FRACTION_MAX, Math.max(FRACTION_MIN, f)) : fallback;

export function swapPanes(l: ViewerLayout, a: PaneId, b: PaneId): ViewerLayout {
  if (a === b) return l;
  if (l.main === a) return promote(l, b);
  if (l.main === b) return promote(l, a);
  const ia = l.side.indexOf(a), ib = l.side.indexOf(b);
  if (ia < 0 || ib < 0) return l;
  const side = [...l.side] as SidePanes;
  side[ia] = b; side[ib] = a;
  return { ...l, side };
}

export function promote(l: ViewerLayout, id: PaneId): ViewerLayout {
  if (l.main === id) return l;
  const i = l.side.indexOf(id);
  if (i < 0) return l;
  const side = [...l.side] as SidePanes;
  side[i] = l.main;
  return { ...l, main: id, side };
}

export function setPreset(l: ViewerLayout, p: LayoutPreset): ViewerLayout {
  return l.preset === p ? l : { ...l, preset: p };
}

export function setMainFraction(l: ViewerLayout, f: number): ViewerLayout {
  const v = clampFraction(f, defaultFraction(l.preset));
  return v === l.mainFraction ? l : { ...l, mainFraction: v };
}

export function isValidLayout(x: unknown): x is ViewerLayout {
  if (!x || typeof x !== "object") return false;
  const { preset, main, side, mainFraction } = x as ViewerLayout;
  if (!PRESETS.includes(preset)) return false;
  if (!Array.isArray(side) || side.length !== 4) return false;
  const all = [main, ...side];
  if (!ALL_PANES.every((p) => all.filter((q) => q === p).length === 1)) return false;
  return typeof mainFraction === "number" && mainFraction >= FRACTION_MIN && mainFraction <= FRACTION_MAX;
}

export function migrateV1(rawV1: unknown, stripHidden: boolean): ViewerLayout | null {
  if (!rawV1 || typeof rawV1 !== "object") return null;
  const { main, strip } = rawV1 as { main?: PaneId; strip?: PaneId[] };
  if (!main || !Array.isArray(strip) || strip.length !== 4) return null;
  const l: ViewerLayout = { preset: stripHidden ? "sola" : "abajo", main, side: strip as SidePanes, mainFraction: defaultFraction("abajo") };
  return isValidLayout(l) ? l : null;
}

export function loadLayout(): ViewerLayout {
  try {
    const v2 = localStorage.getItem(LAYOUT_KEY_V2);
    if (v2 !== null) {
      const parsed: unknown = JSON.parse(v2);
      return isValidLayout(parsed) ? parsed : DEFAULT_LAYOUT;
    }
    const v1 = localStorage.getItem(LAYOUT_KEY_V1);
    const stripHidden = localStorage.getItem(STRIP_HIDDEN_KEY_V1) === "1";
    const migrated = v1 !== null ? migrateV1(JSON.parse(v1), stripHidden) : null;
    // Las claves viejas se van: si se quedaran, un navegador con las dos
    // podría resucitar la distribución antigua al borrar la nueva.
    localStorage.removeItem(LAYOUT_KEY_V1);
    localStorage.removeItem(STRIP_HIDDEN_KEY_V1);
    if (migrated) { localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify(migrated)); return migrated; }
    return DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: ViewerLayout): void {
  try { localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify(l)); } catch { /* almacenamiento bloqueado: queda en memoria */ }
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `cd frontend && npx vitest run src/vtk/layout.test.ts`
Expected: PASS (todos). `npx tsc --noEmit -p .` fallará todavía en `Viewer.tsx` (usa `swapPane`/`strip`): es esperado hasta la Task 5; en este commit NO toques `Viewer.tsx`. Para que el proyecto compile entre tareas, añade al final de `layout.ts` un puente temporal:

```ts
/** PUENTE TEMPORAL hasta que ViewerGrid sustituya a la franja (Task 5). */
export const swapPane = promote;
```

y en `frontend/src/vtk/Viewer.tsx` cambia SOLO las tres lecturas `viewerLayout.strip` por `viewerLayout.side` (líneas ~441 y ~1103) para que `tsc` quede limpio. El puente se quita en la Task 5.

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: limpio; 364 + nuevos tests en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/layout.ts frontend/src/vtk/layout.test.ts frontend/src/vtk/Viewer.tsx
git commit -m "La distribución del visor tiene preset, huecos y fracción, y migra la de antes"
```

---

### Task 2: Geometría de la rejilla y del separador

**Files:**
- Create: `frontend/src/vtk/layoutGrid.ts`, `frontend/src/vtk/layoutGrid.test.ts`

**Interfaces:**
- Consumes: `ViewerLayout`, `LayoutPreset`, `PaneId`, `FRACTION_MIN/MAX`, `setMainFraction` (Task 1).
- Produces:

```ts
export type Slot = "main" | "s0" | "s1" | "s2" | "s3";
export const SPLITTER_PX = 6;
export const COMPACT_MAX_WIDTH_PX = 420;
export interface GridSpec {
  columns: string; rows: string; areas: string;        // valores CSS listos para `gridTemplate*`
  slotOf: Record<PaneId, Slot>;                        // qué hueco ocupa cada vista
  visible: Record<PaneId, boolean>;                    // en «sola» solo la principal
  splitter: "x" | "y" | null;                          // eje que mueve el separador (null en «sola»)
}
export function effectivePreset(l: ViewerLayout, portrait: boolean): LayoutPreset;  // derecha + vertical → abajo
export function gridFor(l: ViewerLayout, portrait: boolean): GridSpec;
export function fractionFromPointer(rect: { left: number; top: number; width: number; height: number },
                                    clientX: number, clientY: number, splitter: "x" | "y"): number;  // acotada
export function isCompact(cellWidthPx: number): boolean;   // < COMPACT_MAX_WIDTH_PX
```

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/layoutGrid.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, FRACTION_MAX, FRACTION_MIN, setPreset } from "./layout";
import { COMPACT_MAX_WIDTH_PX, SPLITTER_PX, effectivePreset, fractionFromPointer, gridFor, isCompact } from "./layoutGrid";

describe("effectivePreset", () => {
  it("derecha en una ventana vertical se pinta como abajo, sin tocar el estado", () => {
    expect(effectivePreset(DEFAULT_LAYOUT, true)).toBe("abajo");
    expect(effectivePreset(DEFAULT_LAYOUT, false)).toBe("derecha");
    expect(effectivePreset(setPreset(DEFAULT_LAYOUT, "sola"), true)).toBe("sola");
  });
});

describe("gridFor", () => {
  it("derecha: dos columnas con el separador y cuatro filas", () => {
    const g = gridFor(DEFAULT_LAYOUT, false);
    expect(g.columns).toBe(`0.72fr ${SPLITTER_PX}px 0.28fr`);
    expect(g.rows).toBe("repeat(4, minmax(0, 1fr))");
    expect(g.areas).toBe('"main gap s0" "main gap s1" "main gap s2" "main gap s3"');
    expect(g.slotOf).toEqual({ scene: "main", axial: "s0", coronal: "s1", sagital: "s2", mip: "s3" });
    expect(g.splitter).toBe("x");
    expect(Object.values(g.visible).every(Boolean)).toBe(true);
  });
  it("abajo: dos filas con el separador y cuatro columnas", () => {
    const g = gridFor(setPreset(DEFAULT_LAYOUT, "abajo"), false);
    expect(g.rows).toBe(`0.74fr ${SPLITTER_PX}px 0.26fr`);
    expect(g.columns).toBe("repeat(4, minmax(0, 1fr))");
    expect(g.areas).toBe('"main main main main" "gap gap gap gap" "s0 s1 s2 s3"');
    expect(g.splitter).toBe("y");
  });
  it("sola: una celda y las demás ocultas", () => {
    const g = gridFor(setPreset(DEFAULT_LAYOUT, "sola"), false);
    expect(g.areas).toBe('"main"');
    expect(g.visible).toEqual({ scene: true, axial: false, coronal: false, sagital: false, mip: false });
    expect(g.splitter).toBeNull();
  });
  it("la fracción se escribe con dos decimales y su complemento suma 1", () => {
    const g = gridFor({ ...DEFAULT_LAYOUT, mainFraction: 0.6 }, false);
    expect(g.columns).toBe(`0.60fr ${SPLITTER_PX}px 0.40fr`);
  });
});

describe("fractionFromPointer", () => {
  const rect = { left: 100, top: 50, width: 1000, height: 500 };
  it("en x, la fracción es la posición relativa del puntero", () => {
    expect(fractionFromPointer(rect, 700, 0, "x")).toBeCloseTo(0.6);
  });
  it("en y, usa la altura", () => {
    expect(fractionFromPointer(rect, 0, 400, "y")).toBeCloseTo(0.7);
  });
  it("acota a los límites", () => {
    expect(fractionFromPointer(rect, 100, 0, "x")).toBe(FRACTION_MIN);
    expect(fractionFromPointer(rect, 1100, 0, "x")).toBe(FRACTION_MAX);
  });
});

describe("isCompact", () => {
  it("compacto por debajo de 420 px de ancho", () => {
    expect(isCompact(COMPACT_MAX_WIDTH_PX - 1)).toBe(true);
    expect(isCompact(COMPACT_MAX_WIDTH_PX)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `cd frontend && npx vitest run src/vtk/layoutGrid.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```ts
// frontend/src/vtk/layoutGrid.ts
/* La rejilla CSS que dibuja una distribución, y la aritmética del separador.
   Puro: lo prueba vitest sin DOM. ViewerGrid solo aplica lo que sale de aquí. */
import { FRACTION_MAX, FRACTION_MIN, type LayoutPreset, type PaneId, type ViewerLayout } from "./layout";

export type Slot = "main" | "s0" | "s1" | "s2" | "s3";
export const SPLITTER_PX = 6;
/** Por debajo de este ancho la celda no tiene sitio para la cinta de rumbo ni
 *  los conmutadores: el HUD pasa a compacto. */
export const COMPACT_MAX_WIDTH_PX = 420;

export interface GridSpec {
  columns: string; rows: string; areas: string;
  slotOf: Record<PaneId, Slot>;
  visible: Record<PaneId, boolean>;
  splitter: "x" | "y" | null;
}

/** En vertical no hay ancho para una columna: «derecha» se dibuja como «abajo».
 *  No se guarda: al girar la pantalla vuelve la columna. */
export function effectivePreset(l: ViewerLayout, portrait: boolean): LayoutPreset {
  return l.preset === "derecha" && portrait ? "abajo" : l.preset;
}

const two = (x: number) => x.toFixed(2);

export function gridFor(l: ViewerLayout, portrait: boolean): GridSpec {
  const preset = effectivePreset(l, portrait);
  const slots: Slot[] = ["s0", "s1", "s2", "s3"];
  const slotOf = { [l.main]: "main" } as Record<PaneId, Slot>;
  l.side.forEach((id, i) => { slotOf[id] = slots[i]; });
  const allVisible = Object.fromEntries([l.main, ...l.side].map((id) => [id, preset !== "sola"])) as Record<PaneId, boolean>;
  allVisible[l.main] = true;
  const f = l.mainFraction, g = 1 - l.mainFraction;
  if (preset === "sola") {
    return { columns: "1fr", rows: "1fr", areas: '"main"', slotOf, visible: allVisible, splitter: null };
  }
  if (preset === "derecha") {
    return {
      columns: `${two(f)}fr ${SPLITTER_PX}px ${two(g)}fr`,
      rows: "repeat(4, minmax(0, 1fr))",
      areas: '"main gap s0" "main gap s1" "main gap s2" "main gap s3"',
      slotOf, visible: allVisible, splitter: "x",
    };
  }
  return {
    columns: "repeat(4, minmax(0, 1fr))",
    rows: `${two(f)}fr ${SPLITTER_PX}px ${two(g)}fr`,
    areas: '"main main main main" "gap gap gap gap" "s0 s1 s2 s3"',
    slotOf, visible: allVisible, splitter: "y",
  };
}

export function fractionFromPointer(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number, clientY: number, splitter: "x" | "y",
): number {
  const raw = splitter === "x" ? (clientX - rect.left) / rect.width : (clientY - rect.top) / rect.height;
  return Math.min(FRACTION_MAX, Math.max(FRACTION_MIN, raw));
}

export function isCompact(cellWidthPx: number): boolean { return cellWidthPx < COMPACT_MAX_WIDTH_PX; }
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npx vitest run src/vtk/layoutGrid.test.ts && npx tsc --noEmit -p .` → PASS, limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/layoutGrid.ts frontend/src/vtk/layoutGrid.test.ts
git commit -m "La rejilla y el separador se calculan en una función pura por preset"
```

---

### Task 3: Máquina de estados del arrastre para intercambiar

**Files:**
- Create: `frontend/src/vtk/paneDrag.ts`, `frontend/src/vtk/paneDrag.test.ts`

**Interfaces:**
- Consumes: `PaneId` (Task 1).
- Produces:

```ts
export const DRAG_THRESHOLD_PX = 6;
export interface DragState { from: PaneId; x0: number; y0: number; active: boolean; over: PaneId | null }
export function beginDrag(from: PaneId, x: number, y: number): DragState;
export function moveDrag(s: DragState, x: number, y: number, over: PaneId | null): DragState;
export function cancelDrag(): null;
export function endDrag(s: DragState | null): [PaneId, PaneId] | null;   // par a intercambiar, o null
```

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/paneDrag.test.ts
import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD_PX, beginDrag, cancelDrag, endDrag, moveDrag } from "./paneDrag";

describe("arrastre para intercambiar", () => {
  it("no se activa hasta pasar el umbral", () => {
    let s = beginDrag("axial", 10, 10);
    s = moveDrag(s, 10 + DRAG_THRESHOLD_PX, 10, "mip");
    expect(s.active).toBe(false);
    expect(endDrag(s)).toBeNull();                     // un clic con temblor no intercambia
    s = moveDrag(s, 10 + DRAG_THRESHOLD_PX + 1, 10, "mip");
    expect(s.active).toBe(true);
    expect(s.over).toBe("mip");
  });
  it("mientras no está activo, el destino no se marca", () => {
    const s = moveDrag(beginDrag("axial", 0, 0), 2, 2, "mip");
    expect(s.over).toBeNull();
  });
  it("activo y sobre otra vista, al soltar devuelve el par", () => {
    const s = moveDrag(beginDrag("axial", 0, 0), 40, 0, "coronal");
    expect(endDrag(s)).toEqual(["axial", "coronal"]);
  });
  it("sobre sí misma o fuera de toda vista no hay intercambio", () => {
    expect(endDrag(moveDrag(beginDrag("axial", 0, 0), 40, 0, "axial"))).toBeNull();
    expect(endDrag(moveDrag(beginDrag("axial", 0, 0), 40, 0, null))).toBeNull();
  });
  it("cancelar deja el estado vacío y soltar después no hace nada", () => {
    expect(cancelDrag()).toBeNull();
    expect(endDrag(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar** → `npx vitest run src/vtk/paneDrag.test.ts` FAIL.

- [ ] **Step 3: Implementación**

```ts
// frontend/src/vtk/paneDrag.ts
/* Arrastrar una vista sobre otra para intercambiarlas. Puro: el componente
   solo traduce eventos de puntero a estas llamadas. El umbral evita que un
   clic con temblor (o el doble clic que sube a principal) se tome por arrastre. */
import type { PaneId } from "./layout";

export const DRAG_THRESHOLD_PX = 6;
export interface DragState { from: PaneId; x0: number; y0: number; active: boolean; over: PaneId | null }

export function beginDrag(from: PaneId, x: number, y: number): DragState {
  return { from, x0: x, y0: y, active: false, over: null };
}

export function moveDrag(s: DragState, x: number, y: number, over: PaneId | null): DragState {
  const active = s.active || Math.hypot(x - s.x0, y - s.y0) > DRAG_THRESHOLD_PX;
  return { ...s, active, over: active ? over : null };
}

export function cancelDrag(): null { return null; }

export function endDrag(s: DragState | null): [PaneId, PaneId] | null {
  if (!s || !s.active || !s.over || s.over === s.from) return null;
  return [s.from, s.over];
}
```

- [ ] **Step 4: Ejecutar y ver pasar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/paneDrag.ts frontend/src/vtk/paneDrag.test.ts
git commit -m "El arrastre para intercambiar vistas se decide en una máquina de estados pura"
```

---

### Task 4: `ViewerGrid`: las cinco vistas montadas una vez, separador y arrastre

**Files:**
- Create: `frontend/src/vtk/ViewerGrid.tsx`, `frontend/src/vtk/ViewerGrid.test.tsx`
- Modify: `frontend/src/index.css` (clases `.viewer-grid`, `.viewer-cell`, `.viewer-cell--over`, `.viewer-splitter`, `.viewer-handle`)

**Interfaces:**
- Consumes: Task 1 (`ViewerLayout`, `PaneId`, `swapPanes`, `promote`, `setMainFraction`, `defaultFraction`), Task 2 (`gridFor`, `fractionFromPointer`, `isCompact`), Task 3 (`beginDrag`, `moveDrag`, `endDrag`, `cancelDrag`).
- Produces:

```ts
export interface PaneContext { compact: boolean; isMain: boolean }
export interface ViewerGridProps {
  layout: ViewerLayout;
  onLayoutChange: (l: ViewerLayout) => void;
  /** Dibuja una vista. Se llama en cada render pero la celda (el nodo DOM) es
   *  siempre la misma por `id`: la clave de React es el id de la vista. */
  renderPane: (id: PaneId, ctx: PaneContext) => ReactNode;
  /** El nodo de cada celda, para componer la captura del visor. */
  registerCell?: (id: PaneId, el: HTMLDivElement | null) => void;
  /** Contenido que va encima de la principal (pista, conmutadores de cabecera). */
  mainOverlay?: ReactNode;
}
export function ViewerGrid(props: ViewerGridProps): JSX.Element;
```

Comportamiento:
- Contenedor `div.viewer-grid` con `display: grid`, `gridTemplateColumns/Rows/Areas` de `gridFor(layout, portrait)`; `portrait` sale de un `ResizeObserver` del contenedor (`height > width`).
- Una celda `div.viewer-cell[data-pane=id][data-slot=slot]` por vista, SIEMPRE renderizada con `key={id}`; `style.gridArea = slot`. Si `visible[id]` es falso, la celda lleva la clase `viewer-cell--hidden` (`position:absolute; width:1px; height:1px; overflow:hidden; opacity:0; pointer-events:none`) para que el lienzo WebGL siga vivo con tamaño 1 px en lugar de 0 (vtk se queja de 0).
- Cada celda mide su ancho con `ResizeObserver` y pasa `compact = isCompact(width)` a `renderPane`; `isMain = slotOf[id] === "main"`.
- Asa de arrastre: `div.viewer-handle` de 14 px pegado al borde superior de cada cella visible, `title="Arrastrar para intercambiar · Doble clic para maximizar"`, `cursor: grab`. `onPointerDown` (botón 0): `setPointerCapture`, `beginDrag`. `onPointerMove`: `moveDrag` con `over = document.elementFromPoint(x, y)?.closest("[data-pane]")?.getAttribute("data-pane")`. `onPointerUp`: `endDrag` → `onLayoutChange(swapPanes(layout, a, b))`. `onKeyDown Escape` en el contenedor y `pointercancel` → `cancelDrag`. La celda destino lleva `viewer-cell--over` mientras `over === id`.
- Doble clic en una celda secundaria → `onLayoutChange(promote(layout, id))`.
- Separador `div.viewer-splitter[data-testid=splitter]` con `gridArea: "gap"` solo si `splitter !== null`; `cursor` según eje; `onPointerDown` captura; `onPointerMove` → `onLayoutChange(setMainFraction(layout, fractionFromPointer(rect, x, y, splitter)))` (`rect` del contenedor); doble clic → `setMainFraction(layout, defaultFraction(layout.preset))`.

- [ ] **Step 1: Tests que fallan**

```tsx
// frontend/src/vtk/ViewerGrid.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, setPreset, type PaneId, type ViewerLayout } from "./layout";
import { ViewerGrid } from "./ViewerGrid";

const renderPane = (id: PaneId) => <span data-testid={`pane-${id}`}>{id}</span>;

function setup(layout: ViewerLayout = DEFAULT_LAYOUT) {
  const onLayoutChange = vi.fn();
  const utils = render(<ViewerGrid layout={layout} onLayoutChange={onLayoutChange} renderPane={renderPane} />);
  const cell = (id: PaneId) => utils.container.querySelector<HTMLDivElement>(`[data-pane="${id}"]`)!;
  return { ...utils, onLayoutChange, cell };
}

describe("ViewerGrid", () => {
  it("coloca cada vista en su hueco y la principal en «main»", () => {
    const { cell } = setup();
    expect(cell("scene").style.gridArea).toBe("main");
    expect(cell("axial").style.gridArea).toBe("s0");
    expect(cell("mip").style.gridArea).toBe("s3");
  });

  it("al cambiar la distribución las celdas son los mismos nodos", () => {
    const { cell, rerender } = setup();
    const before = { scene: cell("scene"), mip: cell("mip") };
    rerender(<ViewerGrid layout={{ ...DEFAULT_LAYOUT, main: "mip", side: ["axial", "coronal", "sagital", "scene"] }}
                         onLayoutChange={vi.fn()} renderPane={renderPane} />);
    expect(cell("scene")).toBe(before.scene);
    expect(cell("mip")).toBe(before.mip);
    expect(cell("mip").style.gridArea).toBe("main");
    expect(cell("scene").style.gridArea).toBe("s3");
  });

  it("en «sola» las secundarias siguen montadas pero ocultas", () => {
    const { cell } = setup(setPreset(DEFAULT_LAYOUT, "sola"));
    expect(screen.getByTestId("pane-axial")).toBeInTheDocument();
    expect(cell("axial").className).toContain("viewer-cell--hidden");
    expect(cell("scene").className).not.toContain("viewer-cell--hidden");
    expect(screen.queryByTestId("splitter")).toBeNull();
  });

  it("doble clic en una secundaria la sube a principal", () => {
    const { cell, onLayoutChange } = setup();
    fireEvent.doubleClick(cell("coronal"));
    expect(onLayoutChange).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, main: "coronal", side: ["axial", "scene", "sagital", "mip"] });
  });

  it("arrastrar el asa de una vista sobre otra las intercambia; un arrastre corto no", () => {
    const { container, cell, onLayoutChange } = setup();
    const handle = cell("axial").querySelector<HTMLDivElement>(".viewer-handle")!;
    // elementFromPoint no existe en jsdom: se simula el destino.
    const target = cell("mip");
    vi.spyOn(document, "elementFromPoint").mockImplementation(() => target);
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 13, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 13, clientY: 10, pointerId: 1 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(target.className).toContain("viewer-cell--over");
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(onLayoutChange).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, side: ["mip", "coronal", "sagital", "axial"] });
    expect(container.querySelector(".viewer-cell--over")).toBeNull();
  });

  it("Escape cancela el arrastre sin intercambiar ni dejar resalte", () => {
    const { container, cell, onLayoutChange } = setup();
    const handle = cell("axial").querySelector<HTMLDivElement>(".viewer-handle")!;
    vi.spyOn(document, "elementFromPoint").mockImplementation(() => cell("mip"));
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.keyDown(container.firstChild as Element, { key: "Escape" });
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(container.querySelector(".viewer-cell--over")).toBeNull();
  });

  it("el separador cambia la fracción acotada y el doble clic la devuelve al defecto", () => {
    const { container, onLayoutChange } = setup({ ...DEFAULT_LAYOUT, mainFraction: 0.6 });
    const grid = container.firstChild as HTMLDivElement;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
    const splitter = screen.getByTestId("splitter");
    fireEvent.pointerDown(splitter, { button: 0, clientX: 600, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(splitter, { clientX: 800, clientY: 0, pointerId: 2 });
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...DEFAULT_LAYOUT, mainFraction: 0.8 });
    fireEvent.pointerMove(splitter, { clientX: 990, clientY: 0, pointerId: 2 });
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...DEFAULT_LAYOUT, mainFraction: 0.85 });
    fireEvent.pointerUp(splitter, { pointerId: 2 });
    fireEvent.doubleClick(splitter);
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...DEFAULT_LAYOUT, mainFraction: 0.72 });
  });
});
```

Nota para el implementador: si jsdom no define `PointerEvent`, añade en `src/test/setup.ts` un polyfill mínimo (`class PointerEvent extends MouseEvent { pointerId; constructor(t, i) { super(t, i); this.pointerId = i?.pointerId ?? 0; } }`) para que `fireEvent.pointerDown` llegue a `onPointerDown` de React. jsdom tampoco implementa `setPointerCapture`/`releasePointerCapture`; llámalos con `try { el.setPointerCapture?.(id) } catch {}`. El `ResizeObserver` del `setup.ts` de tests no dispara: el componente debe arrancar con `portrait = false` y `compact = false` hasta la primera medida.

- [ ] **Step 2: Ejecutar y ver fallar** → `npx vitest run src/vtk/ViewerGrid.test.tsx` FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```tsx
// frontend/src/vtk/ViewerGrid.tsx
/* La rejilla del visor. Las cinco vistas se montan UNA vez (clave = id) y al
   cambiar la distribución solo cambia su `gridArea`: así el lienzo WebGL de
   cada una sobrevive al intercambio sin parpadear ni perder cámara. El modelo
   (layout.ts), la geometría (layoutGrid.ts) y el arrastre (paneDrag.ts) son
   puros; aquí solo se traducen eventos a esas llamadas. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ALL_PANES, defaultFraction, promote, setMainFraction, swapPanes, type PaneId, type ViewerLayout } from "./layout";
import { fractionFromPointer, gridFor, isCompact } from "./layoutGrid";
import { beginDrag, cancelDrag, endDrag, moveDrag, type DragState } from "./paneDrag";

export interface PaneContext { compact: boolean; isMain: boolean }
export interface ViewerGridProps {
  layout: ViewerLayout;
  onLayoutChange: (l: ViewerLayout) => void;
  renderPane: (id: PaneId, ctx: PaneContext) => ReactNode;
  registerCell?: (id: PaneId, el: HTMLDivElement | null) => void;
  mainOverlay?: ReactNode;
}

const paneUnder = (x: number, y: number): PaneId | null => {
  const el = document.elementFromPoint(x, y)?.closest("[data-pane]");
  const id = el?.getAttribute("data-pane") as PaneId | null | undefined;
  return id && ALL_PANES.includes(id) ? id : null;
};
const capture = (el: Element, id: number) => { try { (el as HTMLElement).setPointerCapture?.(id); } catch { /* jsdom */ } };

export function ViewerGrid({ layout, onLayoutChange, renderPane, registerCell, mainOverlay }: ViewerGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [portrait, setPortrait] = useState(false);
  const [widths, setWidths] = useState<Partial<Record<PaneId, number>>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDragBoth = (s: DragState | null) => { dragRef.current = s; setDrag(s); };

  // ¿Vertical? Decide si «derecha» se pinta como «abajo».
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setPortrait(e.contentRect.height > e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spec = gridFor(layout, portrait);

  // Cada celda mide su ancho: el HUD compacto depende del tamaño real, no del hueco.
  const observeCell = useCallback((id: PaneId) => (el: HTMLDivElement | null) => {
    registerCell?.(id, el);
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidths((w) => (w[id] === e.contentRect.width ? w : { ...w, [id]: e.contentRect.width })));
    ro.observe(el);
    (el as HTMLDivElement & { __ro?: ResizeObserver }).__ro?.disconnect();
    (el as HTMLDivElement & { __ro?: ResizeObserver }).__ro = ro;
  }, [registerCell]);

  // ── Arrastre para intercambiar ────────────────────────────────────────── #
  const onHandleDown = (id: PaneId) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    capture(e.currentTarget, e.pointerId);
    setDragBoth(beginDrag(id, e.clientX, e.clientY));
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const s = dragRef.current; if (!s) return;
    setDragBoth(moveDrag(s, e.clientX, e.clientY, paneUnder(e.clientX, e.clientY)));
  };
  const onHandleUp = () => {
    const pair = endDrag(dragRef.current);
    setDragBoth(cancelDrag());
    if (pair) onLayoutChange(swapPanes(layout, pair[0], pair[1]));
  };
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Escape" && dragRef.current) setDragBoth(cancelDrag()); };

  // ── Separador ─────────────────────────────────────────────────────────── #
  const splitting = useRef(false);
  const onSplitDown = (e: React.PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); capture(e.currentTarget, e.pointerId); splitting.current = true; };
  const onSplitMove = (e: React.PointerEvent) => {
    if (!splitting.current || !spec.splitter || !rootRef.current) return;
    const f = fractionFromPointer(rootRef.current.getBoundingClientRect(), e.clientX, e.clientY, spec.splitter);
    onLayoutChange(setMainFraction(layout, f));
  };
  const onSplitUp = () => { splitting.current = false; };

  return (
    <div ref={rootRef} className="viewer-grid" tabIndex={-1} onKeyDown={onKeyDown}
         style={{ display: "grid", gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows, gridTemplateAreas: spec.areas, width: "100%", height: "100%", position: "relative", background: "var(--hud-dim)" }}>
      {ALL_PANES.map((id) => {
        const slot = spec.slotOf[id];
        const hidden = !spec.visible[id];
        const isMain = slot === "main";
        const compact = !isMain && isCompact(widths[id] ?? Number.POSITIVE_INFINITY);
        return (
          <div key={id} ref={observeCell(id)} data-pane={id} data-slot={slot}
               className={`viewer-cell${hidden ? " viewer-cell--hidden" : ""}${drag?.over === id ? " viewer-cell--over" : ""}`}
               style={{ gridArea: hidden ? undefined : slot, position: hidden ? "absolute" : "relative", minWidth: 0, minHeight: 0, overflow: "hidden", background: "#000" }}
               onDoubleClick={() => { if (!isMain) onLayoutChange(promote(layout, id)); }}>
            {renderPane(id, { compact, isMain })}
            {isMain && mainOverlay}
            {!hidden && (
              <div className="viewer-handle" title="Arrastrar para intercambiar · Doble clic para maximizar"
                   onPointerDown={onHandleDown(id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} />
            )}
          </div>
        );
      })}
      {spec.splitter && (
        <div className="viewer-splitter" data-testid="splitter" data-axis={spec.splitter}
             style={{ gridArea: "gap", cursor: spec.splitter === "x" ? "col-resize" : "row-resize", touchAction: "none" }}
             onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onPointerCancel={onSplitUp}
             onDoubleClick={() => onLayoutChange(setMainFraction(layout, defaultFraction(layout.preset)))}
             title="Arrastrar: repartir · Doble clic: reparto por defecto" />
      )}
    </div>
  );
}
```

CSS en `frontend/src/index.css` (junto a las reglas `.hud-*` existentes):

```css
.viewer-cell--hidden { width: 1px !important; height: 1px !important; opacity: 0; pointer-events: none; left: 0; top: 0; }
.viewer-cell--over { outline: 1px solid var(--hud); outline-offset: -1px; }
.viewer-handle { position: absolute; top: 0; left: 0; right: 0; height: 14px; cursor: grab; touch-action: none; z-index: 7; }
.viewer-handle:active { cursor: grabbing; }
.viewer-splitter { background: var(--hud-dim); }
.viewer-splitter:hover { background: var(--hud); opacity: .6; }
```

- [ ] **Step 4: Ejecutar y ver pasar** → `npx vitest run src/vtk/ViewerGrid.test.tsx && npx tsc --noEmit -p .` PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/ViewerGrid.tsx frontend/src/vtk/ViewerGrid.test.tsx frontend/src/index.css
git commit -m "ViewerGrid monta las cinco vistas una vez y las reparte, intercambia y separa sin remontarlas"
```

---

### Task 5: El visor usa la rejilla: presets, atajos, pista y modo compacto por tamaño


> **Corrección previa a revisión (controlador):** los atajos son `Alt+1/2/3` y `presetForKey(code, target, altKey)` (por `e.code`) devuelve `null` sin Alt; el HUD compacto es `isCompact(ancho, alto)` = ancho < 420 o alto < 260 (`COMPACT_MIN_HEIGHT_PX`). El código de los atajos de abajo ya es el real; el resto es la versión original.

**Files:**
- Modify: `frontend/src/vtk/Viewer.tsx` (zona de render final ~1075–1115, `renderPane` ~856, `pickMode` ~744, prefs ~185–188, `estadoVisor` ~405)
- Modify: `frontend/src/vtk/viewerPrefs.ts` (quitar `PREF_STRIP_HIDDEN`)
- Modify: `frontend/src/vtk/layout.ts` (quitar el puente `swapPane`)
- Create: `frontend/src/vtk/layoutShortcuts.ts`, `frontend/src/vtk/layoutShortcuts.test.ts`

**Interfaces:**
- Consumes: `ViewerGrid`, `PaneContext` (Task 4); `promote`, `setPreset` (Task 1).
- Produces: `presetForKey(code: string, target: EventTarget | null, altKey: boolean): LayoutPreset | null` (puro, por `e.code`; `null` sin Alt o `null` desde `input`/`textarea`/`select` o `[contenteditable]`).

- [ ] **Step 1: Test del atajo (falla)**

```ts
// frontend/src/vtk/layoutShortcuts.test.ts
import { describe, expect, it } from "vitest";
import { presetForKey } from "./layoutShortcuts";

describe("presetForKey", () => {
  it("Alt+1/2/3 eligen sola/derecha/abajo", () => {
    expect(presetForKey("Digit1", document.body, true)).toBe("sola");
    expect(presetForKey("Digit2", document.body, true)).toBe("derecha");
    expect(presetForKey("Digit3", document.body, true)).toBe("abajo");
    expect(presetForKey("Digit4", document.body, true)).toBeNull();
  });
  it("sin Alt el dígito es del salto de paso, no de la distribución", () => {
    expect(presetForKey("Digit2", document.body, false)).toBeNull();
  });
  it("no roba la tecla a un campo de texto", () => {
    expect(presetForKey("Digit2", document.createElement("input"), true)).toBeNull();
    expect(presetForKey("Digit2", document.createElement("textarea"), true)).toBeNull();
    expect(presetForKey("Digit2", document.createElement("select"), true)).toBeNull();
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "true");
    expect(presetForKey("Digit2", ce, true)).toBeNull();
  });
});
```

```ts
// frontend/src/vtk/layoutShortcuts.ts
import type { LayoutPreset } from "./layout";
// Por `KeyboardEvent.code` (tecla física): en macOS Option+1 da key «¡».
const CODES: Record<string, LayoutPreset> = { Digit1: "sola", Digit2: "derecha", Digit3: "abajo" };
/** Un atajo numérico nunca debe robarle la tecla a un campo donde se escribe. */
export function presetForKey(code: string, target: EventTarget | null, altKey: boolean): LayoutPreset | null {
  if (!altKey) return null;
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return null;
  if (el?.closest?.('[contenteditable]:not([contenteditable="false"])')) return null;
  return CODES[code] ?? null;
}
```

- [ ] **Step 2: Integrar en `Viewer.tsx`**

1. Imports: `import { ViewerGrid, type PaneContext } from "./ViewerGrid";`, `import { promote, setPreset, type PaneId, type ViewerLayout } from "./layout";`, `import { presetForKey } from "./layoutShortcuts";`. Quita `swapPane` y `PREF_STRIP_HIDDEN`/`stripHidden` (y `stripHiddenRef`, `stripCells`, `mainAreaRef`).
2. `renderPane(id, slot, captureAs)` pasa a `renderPane(id, ctx: PaneContext, captureAs = id)`: `compact = ctx.compact`, `active = ctx.isMain`; dentro de `renderScene`, la llamada `renderPane("axial", compact ? "strip" : "main", "scene")` pasa a `renderPane("axial", { compact, isMain: !compact }, "scene")`.
3. Sustituye el bloque final (`<div ref={mainAreaRef} …> … </div>` y la franja `{!stripHidden && (…)}`) por:

```tsx
<div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}
     tabIndex={0}
     onKeyDown={(e) => { if (e.ctrlKey || e.metaKey) return; const p = presetForKey(e.code, e.target, e.altKey); if (p) { e.preventDefault(); setViewerLayout(setPreset(viewerLayout, p)); } }}>
  <ViewerGrid
    layout={viewerLayout}
    onLayoutChange={setViewerLayout}
    registerCell={registerCell}
    renderPane={(id, ctx) => renderPane(id, ctx)}
    mainOverlay={
      <>
        {wlHost === viewerLayout.main && wlSelect}
        {hint && <div key={hintSeq} className="hud-hint">{hint}</div>}
        <div style={{ position: "absolute", top: 2, right: 24, zIndex: 6, lineHeight: 1.2, fontFamily: "var(--font-mono)", display: "flex", gap: 14 }}>
          {/* DISTRIBUCIÓN, REGLAS y SINCRO dicen cómo se ve el visor, no qué hay en él. */}
          <HudToggleGroup
            options={[
              { key: "derecha", label: "DERECHA", title: "3D grande y cuatro cortes en columna (Alt+2)" },
              { key: "abajo", label: "ABAJO", title: "3D grande y cuatro cortes en franja (Alt+3)" },
              { key: "sola", label: "SOLA", title: "Solo la vista principal (Alt+1)" },
            ]}
            value={viewerLayout.preset} onChange={(k) => setViewerLayout(setPreset(viewerLayout, k as ViewerLayout["preset"]))} />
          <HudToggleGroup options={[{ key: "decor", label: decorHidden ? "REGLAS ○" : "REGLAS ●", title: decorHidden ? "Mostrar reglas, retícula y marcos" : "Ocultar reglas, retícula y marcos (la orientación y las medidas se quedan)" }]}
            value={decorHidden ? "" : "decor"} onChange={() => setDecorHidden(!decorHidden)} />
          <HudToggleGroup options={[{ key: "sync", label: syncViews ? "SINCRO ●" : "SINCRO ○", title: "Centrar todas las vistas en el punto" }]}
            value={syncViews ? "sync" : ""} onChange={() => setSyncViews(!syncViews)} />
        </div>
      </>
    }
  />
</div>
```

4. `registerCell`: `const cellEls = useRef<Partial<Record<PaneId, HTMLDivElement | null>>>({}); const registerCell = useCallback((id: PaneId, el: HTMLDivElement | null) => { cellEls.current[id] = el; }, []);` (la captura compuesta lo usa en la Task 6).
5. `pickMode`: `if (pickMode !== null && viewerLayout.main !== "scene") setViewerLayout(promote(viewerLayout, "scene"));`.
6. `estadoVisor`: quita `strip_hidden`; `layout: layoutRef.current` ya lleva el preset.
7. `viewerPrefs.ts`: borra `PREF_STRIP_HIDDEN` (la migración la hizo `loadLayout`). `layout.ts`: borra el puente `swapPane`.
8. El MIP recibe por ahora `mainPlane={mipPlane}` igual que antes (la Task 7 lo cambia).

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit -p . && npx vitest run` → limpio y en verde (ajusta tests del visor que mencionen `strip`/`CORTES` si los hay: `grep -rn "CORTES\|stripHidden\|\.strip" src --include=*.test.tsx`).

Navegador (Case 3): abrir el estudio → 3D grande a la izquierda y columna de cuatro a la derecha; arrastrar el asa del MIP sobre el 3D → se intercambian sin parpadeo y la cámara del 3D se conserva; mover el separador; Alt+1/2/3 (y el «2» solo sigue saltando de paso); recargar → se recuerda; estrechar la ventana hasta hacerla vertical → la columna pasa a franja. Guarda capturas en el scratchpad como `t5_*.png`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/vtk/Viewer.tsx frontend/src/vtk/viewerPrefs.ts frontend/src/vtk/layout.ts frontend/src/vtk/layoutShortcuts.ts frontend/src/vtk/layoutShortcuts.test.ts
git commit -m "El visor reparte las vistas en una rejilla con presets, separador y atajos, y recuerda cómo se dejó"
```

---

### Task 6: Capturas sobre la rejilla y `captureWithLayout` sin espera de remontado

**Files:**
- Modify: `frontend/src/vtk/captureWithLayout.ts`, `frontend/src/vtk/captureWithLayout.test.ts`
- Modify: `frontend/src/vtk/Viewer.tsx` (`captureScene` ~352–380, `leerVisor` ~430–445)

**Interfaces:**
- Consumes: `registerCell`/`cellEls` (Task 5), `gridFor` (Task 2).
- Produces:

```ts
export interface CaptureLayoutDeps {
  sceneIsMain: () => boolean;
  current: () => CaptureFn | null;     // la captura de la escena, que ahora SIEMPRE está registrada (no se remonta)
  promote: () => void;
  restore: () => void;
  nextFrame: () => Promise<void>;
}
export async function captureWithLayout(d: CaptureLayoutDeps): Promise<string | null>;
```

- [ ] **Step 1: Tests (reescribir `captureWithLayout.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { captureWithLayout, type CaptureLayoutDeps } from "./captureWithLayout";

function fakeDeps(over: Partial<CaptureLayoutDeps>, log: string[]): CaptureLayoutDeps {
  return {
    sceneIsMain: () => false,
    current: () => null,
    promote: () => { log.push("promote"); },
    restore: () => { log.push("restore"); },
    nextFrame: async () => { log.push("frame"); },
    ...over,
  };
}

describe("captureWithLayout", () => {
  it("con la escena en principal captura directamente", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ sceneIsMain: () => true, current: () => async () => { log.push("capture"); return "data:main"; } }, log);
    await expect(captureWithLayout(deps)).resolves.toBe("data:main");
    expect(log).toEqual(["capture"]);
  });
  it("sin captura registrada devuelve null sin tocar la distribución", async () => {
    const log: string[] = [];
    await expect(captureWithLayout(fakeDeps({}, log))).resolves.toBeNull();
    expect(log).toEqual([]);
  });
  it("si la escena no es principal: sube, espera un fotograma, captura con el lienzo grande y restaura", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ current: () => async () => { log.push("capture"); return "data:big"; } }, log);
    await expect(captureWithLayout(deps)).resolves.toBe("data:big");
    expect(log).toEqual(["promote", "frame", "capture", "restore"]);
  });
  it("restaura aunque la captura falle", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ current: () => async () => { throw new Error("gl"); } }, log);
    await expect(captureWithLayout(deps)).rejects.toThrow("gl");
    expect(log).toEqual(["promote", "frame", "restore"]);
  });
});
```

- [ ] **Step 2: Implementación**

```ts
export async function captureWithLayout(d: CaptureLayoutDeps): Promise<string | null> {
  const cap = d.current();
  if (!cap) return null;
  if (d.sceneIsMain()) return cap();
  // La escena ya no se remonta al subir: basta con que el lienzo tome el
  // tamaño del hueco principal antes de leerlo.
  d.promote();
  try {
    await d.nextFrame();
    return await cap();
  } finally {
    d.restore();
  }
}
```

En `Viewer.tsx`: `captureScene` deja de pasar `waitForCapture`; borra `captureWaiters` y el filtro en `registerMeshCapture`; `promote: () => setLayoutRef.current(promote(before, "scene"))`. En `leerVisor`, sustituye `anotar(main, mainEl)` + bucle de `stripCells` por:

```ts
const spec = gridFor(layoutRef.current, portraitRef.current);
for (const id of [layoutRef.current.main, ...layoutRef.current.side]) {
  const el = cellEls.current[id];
  if (el && spec.visible[id]) anotar(id, el);
}
```

donde `portraitRef` refleja si el visor es vertical (`viewerRef` medido con el mismo `ResizeObserver` de la Task 4; expón un callback `onPortraitChange` en `ViewerGrid` o mide `viewerRef` aquí: elige medir aquí, es local).

- [ ] **Step 3: Verificar** → `npx vitest run src/vtk/captureWithLayout.test.ts && npx tsc --noEmit -p . && npx vitest run`. Navegador: botón de captura del topbar con el MIP en principal → la imagen compuesta trae las cinco vistas en su sitio; con preset «sola», solo la principal.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/vtk/captureWithLayout.ts frontend/src/vtk/captureWithLayout.test.ts frontend/src/vtk/Viewer.tsx
git commit -m "La captura del visor recorre la rejilla y ya no espera a que la escena se remonte"
```

---

### Task 7: Gestos del MIP: rueda avanza el corte, Ctrl zoom, Shift/central desplaza, eje propio

**Files:**
- Create: `frontend/src/vtk/mipGestures.ts`, `frontend/src/vtk/mipGestures.test.ts`
- Modify: `frontend/src/vtk/MipView.tsx`, `frontend/src/store/planning.tsx` (`mipPlane`, `setMipPlane`), `frontend/src/vtk/Viewer.tsx` (paso de props al MIP)

**Interfaces:**
- Consumes: `usePlanning` (`mprVoxel`, `setMprVoxel`), `Plane`, `standardViewInVolume` (geometry.ts), `HudToggleGroup`.
- Produces:

```ts
// mipGestures.ts
export type WheelAction = { kind: "slice"; next: number } | { kind: "zoom" } | { kind: "none" };
export function wheelAction(e: { deltaY: number; ctrlKey: boolean }, index: number, count: number): WheelAction;
export function indexOf(plane: Plane, v: { x: number; y: number; z: number }): number;
export function withIndex(plane: Plane, v: { x: number; y: number; z: number }, i: number): { x: number; y: number; z: number };
export const AXIS_OF: Record<Plane, 0 | 1 | 2>;        // sagital 0, coronal 1, axial 2 (se mueve aquí desde MipView)
// store
mipPlane: Plane | null; setMipPlane: (p: Plane | null) => void;   // null = seguir a la vista principal como hasta ahora
// MipView props
{ image, meta, orientation, compact, plane: Plane, onPlaneChange: (p: Plane) => void, registerCapture }
```

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/mipGestures.test.ts
import { describe, expect, it } from "vitest";
import { indexOf, wheelAction, withIndex } from "./mipGestures";

describe("wheelAction", () => {
  it("la rueda avanza o retrocede un corte acotado", () => {
    expect(wheelAction({ deltaY: 100, ctrlKey: false }, 5, 10)).toEqual({ kind: "slice", next: 6 });
    expect(wheelAction({ deltaY: -100, ctrlKey: false }, 5, 10)).toEqual({ kind: "slice", next: 4 });
    expect(wheelAction({ deltaY: 100, ctrlKey: false }, 9, 10)).toEqual({ kind: "slice", next: 9 });
    expect(wheelAction({ deltaY: -100, ctrlKey: false }, 0, 10)).toEqual({ kind: "slice", next: 0 });
  });
  it("con un solo corte no se mueve", () => {
    expect(wheelAction({ deltaY: 100, ctrlKey: false }, 0, 1)).toEqual({ kind: "slice", next: 0 });
  });
  it("Ctrl+rueda es zoom y lo hace vtk", () => {
    expect(wheelAction({ deltaY: 100, ctrlKey: true }, 5, 10)).toEqual({ kind: "zoom" });
  });
  it("deltaY cero no hace nada", () => {
    expect(wheelAction({ deltaY: 0, ctrlKey: false }, 5, 10)).toEqual({ kind: "none" });
  });
});

describe("índice por plano", () => {
  const v = { x: 1, y: 2, z: 3 };
  it("lee y escribe la componente del plano", () => {
    expect(indexOf("axial", v)).toBe(3); expect(indexOf("coronal", v)).toBe(2); expect(indexOf("sagital", v)).toBe(1);
    expect(withIndex("axial", v, 7)).toEqual({ x: 1, y: 2, z: 7 });
    expect(withIndex("sagital", v, 7)).toEqual({ x: 7, y: 2, z: 3 });
  });
});
```

- [ ] **Step 2: Implementación pura**

```ts
// frontend/src/vtk/mipGestures.ts
/* Los gestos del MIP, decididos sin vtk: la rueda mueve el corte compartido
   (el MIP se ve construirse desde él mismo), Ctrl+rueda la deja a vtk para el
   zoom. Igual que SliceView, para que el profesional no cambie de gesto al
   cambiar de vista. */
import type { Plane } from "./geometry";

export const AXIS_OF: Record<Plane, 0 | 1 | 2> = { sagital: 0, coronal: 1, axial: 2 };   // eje vtk (x,y,z)
export type WheelAction = { kind: "slice"; next: number } | { kind: "zoom" } | { kind: "none" };

export function wheelAction(e: { deltaY: number; ctrlKey: boolean }, index: number, count: number): WheelAction {
  if (e.ctrlKey) return { kind: "zoom" };
  if (e.deltaY === 0) return { kind: "none" };
  const next = Math.max(0, Math.min(count - 1, index + (e.deltaY > 0 ? 1 : -1)));
  return { kind: "slice", next };
}
export function indexOf(plane: Plane, v: { x: number; y: number; z: number }): number {
  return plane === "axial" ? v.z : plane === "coronal" ? v.y : v.x;
}
export function withIndex(plane: Plane, v: { x: number; y: number; z: number }, i: number) {
  return plane === "axial" ? { ...v, z: i } : plane === "coronal" ? { ...v, y: i } : { ...v, x: i };
}
```

- [ ] **Step 3: `MipView.tsx`**

1. Props: `plane: Plane` y `onPlaneChange: (p: Plane) => void` sustituyen a `mainPlane`. `index = indexOf(plane, mprVoxel)`, `count` y `spacingAlong` por `plane` como hasta ahora.
2. Interacción de vtk: tras crear `grw`, sustituye el estilo por defecto:

```ts
import vtkInteractorStyleManipulator from "@kitware/vtk.js/Interaction/Style/InteractorStyleManipulator";
import vtkMouseCameraTrackballRotateManipulator from "@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballRotateManipulator";
import vtkMouseCameraTrackballPanManipulator from "@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballPanManipulator";
import vtkMouseCameraTrackballZoomManipulator from "@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballZoomManipulator";
// …
// Rotar con el botón izquierdo, desplazar con el central o con Shift, zoom
// solo con Ctrl+rueda: la rueda sola queda libre para avanzar el corte, como
// en SliceView.
const style = vtkInteractorStyleManipulator.newInstance();
const rotate = vtkMouseCameraTrackballRotateManipulator.newInstance(); rotate.setButton(1);
const panMid = vtkMouseCameraTrackballPanManipulator.newInstance(); panMid.setButton(2);
const panShift = vtkMouseCameraTrackballPanManipulator.newInstance(); panShift.setButton(1); panShift.setShift(true);
const zoom = vtkMouseCameraTrackballZoomManipulator.newInstance(); zoom.setControl(true); zoom.setDragEnabled(false); zoom.setScrollEnabled(true);
style.addMouseManipulator(rotate); style.addMouseManipulator(panMid); style.addMouseManipulator(panShift); style.addMouseManipulator(zoom);
grw.getInteractor().setInteractorStyle(style);
```

   Comprueba los nombres de los setters en `node_modules/@kitware/vtk.js/Interaction/Manipulators/*/index.d.ts` (`setButton`, `setShift`, `setControl`, `setDragEnabled`, `setScrollEnabled`); si `setScrollEnabled` no existe en esta versión, usa el `vtkMouseCameraTrackballZoomToMouseManipulator` o el flag equivalente y anótalo en el informe.
3. Rueda propia (no pasiva, en el contenedor, igual que SliceView): 

```ts
const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
wheelRef.current = (e) => {
  const a = wheelAction(e, index, count);
  if (a.kind === "zoom") return;                       // lo hace vtk (Ctrl+rueda)
  e.preventDefault(); e.stopPropagation();             // ni página ni vtk
  if (a.kind === "slice" && a.next !== index) setMprVoxel(withIndex(plane, mprVoxel, a.next));
};
useEffect(() => {
  const el = ref.current; if (!el) return;
  const h = (e: WheelEvent) => wheelRef.current(e);
  // En fase de captura: llega ANTES que el oyente de vtk en el lienzo.
  el.addEventListener("wheel", h, { passive: false, capture: true });
  return () => el.removeEventListener("wheel", h, { capture: true } as EventListenerOptions);
}, []);
```

4. Al cambiar `plane`: la cámara se recoloca con `standardViewInVolume(viewOf(plane), orientation)` donde `viewOf = { axial: "axial", coronal: "coronal", sagital: "sagital" }`, y `resetCamera()`; el efecto de escena deja de depender de `mainPlane` (la escena no se rehace al cambiar de eje; solo se mueve la cámara y los planos de recorte).
5. HUD (no compacto): añade `HudToggleGroup` «AX · COR · SAG» con `value={plane}` y `onChange={(k) => onPlaneChange(k as Plane)}`; renombra «AJUSTAR» a «CENTRAR» y cambia el `title` del contenedor a `"Arrastrar: rotar · Shift o botón central: desplazar · Rueda: corte · Ctrl+rueda: zoom"`. Actualiza el comentario de cabecera del archivo (ya no «la rueda hace zoom»).

- [ ] **Step 4: Store y Viewer**

`planning.tsx`: `const [mipPlane, setMipPlane] = useState<Plane | null>(null);` y expónlos en el contexto (tipo e implementación). `Viewer.tsx`: `const mipPlane = storeMipPlane ?? (viewerLayout.main === "coronal" || viewerLayout.main === "sagital" ? viewerLayout.main : "axial");` y `<MipView … plane={mipPlane} onPlaneChange={setMipPlane} />`.

- [ ] **Step 5: Verificar**

`npx vitest run src/vtk/mipGestures.test.ts && npx tsc --noEmit -p . && npx vitest run`. Navegador (Case 3, MIP en principal): rueda → el MIP crece y decrece corte a corte y las vistas de cortes siguen al mismo punto; Ctrl+rueda zoom; arrastrar rota; Shift+arrastrar y botón central desplazan; AX/COR/SAG recoloca la cámara y cambia el eje de acumulación; CENTRAR recoloca. Sin errores en consola. Capturas `t7_*.png`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/vtk/mipGestures.ts frontend/src/vtk/mipGestures.test.ts frontend/src/vtk/MipView.tsx frontend/src/store/planning.tsx frontend/src/vtk/Viewer.tsx
git commit -m "El MIP se maneja como los cortes: la rueda avanza el corte, Ctrl hace zoom y Shift desplaza"
```

---

### Task 8: La traza del corte actual sobre el MIP

**Files:**
- Create: `frontend/src/vtk/planeTrace.ts`, `frontend/src/vtk/planeTrace.test.ts`
- Modify: `frontend/src/vtk/MipView.tsx`

**Interfaces:**
- Consumes: `AXIS_OF` (Task 7), `vtkRenderer.worldToView` / `viewToNormalizedDisplay` (vtk.js).
- Produces:

```ts
export const EDGE_ON_DEG = 5;
export function planeCorners(bounds: number[], axis: 0 | 1 | 2, posMm: number): [number, number, number][];   // 4 esquinas
export function traceVisible(cameraDirection: [number, number, number], axis: 0 | 1 | 2): boolean;              // |dir·normal| ≥ sin(5°)
export function toPixels(ndc: [number, number], widthPx: number, heightPx: number): { x: number; y: number };   // display normalizado (0..1, y arriba) → píxeles
export function tracePolygon(points: { x: number; y: number }[]): string;                                      // atributo `points` de un <polygon> SVG
```

- [ ] **Step 1: Tests que fallan**

```ts
// frontend/src/vtk/planeTrace.test.ts
import { describe, expect, it } from "vitest";
import { planeCorners, toPixels, traceVisible, tracePolygon } from "./planeTrace";

describe("planeCorners", () => {
  it("devuelve el rectángulo del volumen en el plano z = pos", () => {
    const c = planeCorners([0, 10, 0, 20, 0, 30], 2, 7);
    expect(c).toEqual([[0, 0, 7], [10, 0, 7], [10, 20, 7], [0, 20, 7]]);
  });
  it("en el eje x fija x", () => {
    expect(planeCorners([0, 10, 0, 20, 0, 30], 0, 3).every((p) => p[0] === 3)).toBe(true);
  });
});

describe("traceVisible", () => {
  it("se oculta cuando la cámara mira el plano de canto", () => {
    expect(traceVisible([1, 0, 0], 2)).toBe(false);          // mirando a lo largo de x, plano z: de canto
    expect(traceVisible([0, 0, -1], 2)).toBe(true);          // de frente
    expect(traceVisible([Math.cos(0.1), 0, Math.sin(0.1)], 2)).toBe(true);   // 5,7° > 5°
    expect(traceVisible([Math.cos(0.05), 0, Math.sin(0.05)], 2)).toBe(false); // 2,9° < 5°
  });
});

describe("toPixels y tracePolygon", () => {
  it("convierte display normalizado (y hacia arriba) en píxeles (y hacia abajo)", () => {
    expect(toPixels([0.5, 0.5], 400, 200)).toEqual({ x: 200, y: 100 });
    expect(toPixels([0, 1], 400, 200)).toEqual({ x: 0, y: 0 });
  });
  it("escribe los puntos para el polígono SVG", () => {
    expect(tracePolygon([{ x: 1, y: 2 }, { x: 3.456, y: 4 }])).toBe("1,2 3.5,4");
  });
});
```

- [ ] **Step 2: Implementación pura**

```ts
// frontend/src/vtk/planeTrace.ts
/* La traza del plano de acumulación del MIP en pantalla: las cuatro esquinas
   del volumen en ese plano, proyectadas con la cámara del MIP. Lo puro va
   aquí; la proyección la hace vtk (worldToView + viewToNormalizedDisplay). */
export const EDGE_ON_DEG = 5;

export function planeCorners(bounds: number[], axis: 0 | 1 | 2, posMm: number): [number, number, number][] {
  const lo = [bounds[0], bounds[2], bounds[4]], hi = [bounds[1], bounds[3], bounds[5]];
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const mk = (a: number, b: number): [number, number, number] => {
    const p: [number, number, number] = [0, 0, 0];
    p[axis] = posMm; p[u] = a; p[v] = b;
    return p;
  };
  return [mk(lo[u], lo[v]), mk(hi[u], lo[v]), mk(hi[u], hi[v]), mk(lo[u], hi[v])];
}

export function traceVisible(cameraDirection: [number, number, number], axis: 0 | 1 | 2): boolean {
  const n = Math.hypot(...cameraDirection) || 1;
  const cos = Math.abs(cameraDirection[axis]) / n;      // |dir·normal|, normal = eje
  return cos >= Math.sin((EDGE_ON_DEG * Math.PI) / 180);
}

export function toPixels(ndc: [number, number], widthPx: number, heightPx: number) {
  return { x: ndc[0] * widthPx, y: (1 - ndc[1]) * heightPx };
}

export function tracePolygon(points: { x: number; y: number }[]): string {
  return points.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(" ");
}
```

- [ ] **Step 3: Superposición en `MipView.tsx`**

Estado `trace: string | null` (atributo `points`). Un efecto recalcula la traza cuando cambian `posMm`, `axis`, `mipMode`, `mipSlabMm` y en cada `cam.onModified` (ya hay una suscripción para la cinta de rumbo: añade la llamada ahí):

```ts
const computeTrace = () => {
  const s = scene.current; const el = ref.current; if (!s || !el) { setTrace(null); return; }
  const ren = s.grw.getRenderer(); const cam = ren.getActiveCamera();
  if (!traceVisible(cam.getDirectionOfProjection() as Vec3, axis)) { setTrace(null); return; }
  const { width, height } = el.getBoundingClientRect();
  const aspect = width / Math.max(1, height);
  const toPx = (p: Vec3) => {
    const v = ren.worldToView(p[0], p[1], p[2]);
    const d = ren.viewToNormalizedDisplay(v[0], v[1], v[2], aspect);
    return toPixels([d[0], d[1]], width, height);
  };
  const planes = mipMode === "acumulado" ? [posMm] : [posMm - mipSlabMm, posMm + mipSlabMm];
  setTrace(planes.map((mm) => tracePolygon(planeCorners(image.getBounds(), axis, mm).map(toPx))).join("|"));
};
```

Dibuja, dentro del `HudFrame` y con `className="hud-decor"` (para que REGLAS ○ lo oculte como a las demás líneas):

```tsx
{trace && (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    {trace.split("|").map((pts, i) => <polygon key={i} points={pts} fill="none" stroke="var(--hud-amber)" strokeOpacity={0.6} strokeWidth={1} />)}
  </svg>
)}
```

Comprueba `worldToView`/`viewToNormalizedDisplay` en `node_modules/@kitware/vtk.js/Rendering/Core/Renderer/index.d.ts`; si la firma de `viewToNormalizedDisplay` no acepta `aspect`, usa `vtkCoordinate` (`setCoordinateSystemToWorld`, `getComputedNormalizedDisplayValue(renderer)`) y anótalo.

- [ ] **Step 4: Verificar** → `npx vitest run src/vtk/planeTrace.test.ts && npx tsc --noEmit -p . && npx vitest run`. Navegador: con el MIP de frente la traza es un rectángulo ámbar que avanza con la rueda; al rotar se vuelve un paralelogramo y desaparece al mirar de canto; en LÁMINA son dos; REGLAS ○ la oculta. Capturas `t8_*.png`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/planeTrace.ts frontend/src/vtk/planeTrace.test.ts frontend/src/vtk/MipView.tsx
git commit -m "El MIP dibuja la traza del corte hasta donde ha acumulado"
```

---

### Task 9: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (sección del visor: presets, gestos del MIP, atajos)
- Modify: `docs/superpowers/plans/2026-10-01-distribucion-vistas-mip.md` (marcar casillas)

- [ ] **Step 1: Comprobación completa**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
cd ../backend && .venv\Scripts\python -m pytest -q -rf --no-header -p no:cacheprovider
```

Expected: frontend en verde (≥ 364 + nuevos) y chunk de entrada sin vtk.js; backend con los 38 fallos preexistentes y ninguno nuevo (lista en el ledger del plan anterior o regenerada en `master`).

- [ ] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)

1. Abrir «Case 3 revision» sin preferencias guardadas (borrar `ws.viewer.layout.v2`): 3D grande a la izquierda, columna de cuatro a la derecha, cada una ≈ un cuarto del alto.
2. Arrastrar el MIP sobre el 3D: se intercambian sin parpadeo; la cámara del 3D y la ventana/nivel de los cortes se conservan.
3. Rueda sobre el MIP grande: se construye corte a corte y los cortes siguen el mismo punto; Shift+arrastrar desplaza; Ctrl+rueda zoom; la traza ámbar avanza.
4. Separador: arrastrar reparte; doble clic vuelve al defecto; la fracción no sale de 50–85 %.
5. Alt+1/2/3 cambian el preset (los dígitos solos saltan de paso); escribir «2» en el umbral del panel de segmentación no lo cambia.
6. Recargar: se recuerda la distribución. Con una sesión que tenía `ws.viewer.layout` v1 y franja oculta: arranca en «sola» y las claves viejas desaparecen.
7. Ventana estrecha y alta: la columna pasa a franja; al ensanchar vuelve.
8. Captura del visor desde el topbar con el MIP en principal: las cinco vistas en su sitio.
9. Marcado de cuello (pick) con el MIP en principal: el 3D sube solo a principal como antes.

- [ ] **Step 3: README y commit de cierre**

En `README.md`, en la sección del visor, un párrafo: presets (DERECHA/ABAJO/SOLA, Alt+1/2/3), intercambio arrastrando el borde superior de una vista, separador, y los gestos del MIP (rueda corte · Ctrl+rueda zoom · arrastrar rota · Shift/central desplaza · AX/COR/SAG eje · CENTRAR).

```bash
git add README.md docs/superpowers/plans/2026-10-01-distribucion-vistas-mip.md
git commit -m "Cierre de la distribución configurable y el MIP interactivo: lista manual y README"
```
