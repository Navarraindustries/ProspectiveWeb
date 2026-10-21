# Herramientas clínicas (E4) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar las ventanas del visor (una banda de vasos para todo, VOLUMEN por modalidad, MIP con ventana), dar referencia y vista al abordaje, completar las cámaras, acotar el MIP a la lesión, hacer recorrible la línea central y quitar los duplicados del inventario.

**Architecture:** Todo lo decidible sin WebGL va a módulos puros de `frontend/src/vtk/` con su prueba (`useVesselBand`, `volumePresetsFor`, `mipRamp`, `planeFromNormal`, `resolveView`, `lookAlongUp`, `localBox`, `axisClipPlanes`, `centerlineWalk`). `MipView`, `MeshView`, `ObliqueView` y `Viewer` solo cablean. El único cambio de backend es un endpoint de solo lectura (`GET /api/centerline/{sid}/points`) más un texto del informe; el contrato OpenAPI se regenera.

**Tech Stack:** React 19, vtk.js 36, vitest + Testing Library (frontend); FastAPI + Pydantic + pytest (backend).

**Spec:** `docs/superpowers/specs/2026-10-09-herramientas-clinicas-design.md`

## Global Constraints

- Rama `herramientas-clinicas` desde master 4f8f017. Nunca `git push` (el propietario empuja). Nunca `backend/data/`, nunca `frontend/package-lock.json` en un commit.
- Textos de la interfaz y comentarios en español; cada comentario dice **por qué**, no qué. Etiquetas del HUD en mayúsculas («VASOS», «TODO», «ABORDAJE», «LOCAL ●/○», «RECORRIDO ▸ PLANO · VASO»).
- Todo control nuevo del HUD lleva `hud-toggle` (vía `HudToggleGroup`) o `hud-controls`; toda lectura nueva va en `.hud-readout` (hud.css decide qué esconde cada nivel).
- Commits terminan con las dos líneas:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM`
- Frontend: `cd frontend && npx vitest run <ruta>` por tarea; antes de cada commit `npx tsc --noEmit -p .`. `npm run build` en la última tarea. Las pruebas de vistas vtk (`*View.test.tsx`) están excluidas por la configuración: nómbralas `SliceView.wl.test.tsx`-style (`<Vista>.<tema>.test.tsx`) o prueba los módulos puros.
- Backend: un archivo de prueba por proceso (`cd backend && .venv/Scripts/python -m pytest test_x.py -q`). Contrato: `cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json && cd ../frontend && npm run gen:api`, y luego `npx tsc --noEmit -p .` (incluye `src/api/contract.check.ts`) y `cd backend && .venv/Scripts/python -m pytest test_openapi_contract.py -q`.
- Coordenadas «mm» = marco del volumen (vóxel × espaciado, origen 0), no LPS. `meta.shape = [nz, ny, nx]`, `meta.spacing = [sz, sy, sx]`.
- No reinicies los servidores de desarrollo; si hacen falta para una comprobación manual, pídelo al controlador.

## Review Focus

1. **Volumen cambiado dentro de la sesión** (otra serie o preproceso): la banda de vasos debe volver a pedirse; una banda vieja daría un «Vasos» de otro volumen. Prueba en Tarea 1 (`volumeVersion`).
2. **Ventana del MIP con `lo` por debajo del rango** (el usuario arrastra el nivel muy abajo): la rampa no puede tener puntos decrecientes ni NaN. Prueba en Tarea 3 (`mipRampPoints` con `wc − ww/2 < rangeLo`).
3. **Dirección de abordaje paralela al «superior» del paciente** (corredor vertical): el `viewUp` no puede degenerar a cero. Prueba en Tarea 4 (`lookAlongUp`).
4. **Caja LOCAL fuera del volumen** (lesión en el borde): los planos deben quedar dentro de los límites y seguir siendo seis con extensión ≥ 1 mm. Prueba en Tarea 6 (`localBox` acotado, `axisClipPlanes` con corte fuera de la caja).
5. **Cine VASO con espaciado de vóxel mayor que el paso de la línea** (0,5 mm): el índice no puede quedarse pegado por el redondeo a vóxel. Prueba en Tarea 9 (`stepTrackIndex` usa el índice guardado cuando el foco sigue sobre su punto).

---

### Task 1: Banda de vasos única y «Vasos» que no desaparece

**Files:**
- Create: `frontend/src/vtk/useVesselBand.ts`
- Create: `frontend/src/vtk/useVesselBand.test.ts`
- Modify: `frontend/src/vtk/Viewer.tsx:1555-1562` (construcción de los preajustes de los cortes)
- Test: `frontend/src/vtk/windowPresets.test.ts` (sin cambios; sigue verde)

**Interfaces:**
- Consumes: `api.suggestedBand(sessionId) → Promise<SuggestedBand {lower, upper, vmin, vmax}>` (`api/client.ts:328`), `SegmentResult.threshold_lower?: number` (`api/types.ts:370`).
- Produces: `export type VesselBand = [number, number]`; `export function useVesselBand(sessionId: string | null, segmentation: SegmentResult | null, volumeVersion?: number): VesselBand | null`. Tareas 2 y 3 reciben la banda como prop `vesselBand` de `MipView`.

- [x] **Step 1: Crear la rama**

```bash
git checkout -b herramientas-clinicas master
```

- [x] **Step 2: Escribir la prueba del hook**

`frontend/src/vtk/useVesselBand.test.ts`:

```ts
/* La banda de vasos sale del servidor una vez por volumen y sirve a los tres
   sistemas de ventana; sin ella «Vasos» desaparecía al terminar de segmentar. */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { SegmentResult } from "../api/types";
import { useVesselBand } from "./useVesselBand";

const sugerida = { lower: 1470, upper: 4200, vmin: 12, vmax: 4717 };
const segmentada = { threshold_lower: 1600 } as unknown as SegmentResult;

afterEach(() => vi.restoreAllMocks());

describe("useVesselBand", () => {
  it("sin segmentación usa el inferior sugerido y el techo robusto", async () => {
    vi.spyOn(api, "suggestedBand").mockResolvedValue(sugerida);
    const { result } = renderHook(() => useVesselBand("s1", null));
    await waitFor(() => expect(result.current).toEqual([1470, 4717]));
  });
  it("con segmentación el inferior es el umbral que se usó", async () => {
    vi.spyOn(api, "suggestedBand").mockResolvedValue(sugerida);
    const { result } = renderHook(() => useVesselBand("s1", segmentada));
    await waitFor(() => expect(result.current).toEqual([1600, 4717]));
  });
  it("pide la banda una vez por sesión y otra al cambiar el volumen", async () => {
    const spy = vi.spyOn(api, "suggestedBand").mockResolvedValue(sugerida);
    const { result, rerender } = renderHook(({ seg, v }) => useVesselBand("s1", seg, v), { initialProps: { seg: null as SegmentResult | null, v: 0 } });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ seg: segmentada, v: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    rerender({ seg: segmentada, v: 1 });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
  it("sin sesión o con error de red devuelve null", async () => {
    vi.spyOn(api, "suggestedBand").mockRejectedValue(new Error("red"));
    const { result } = renderHook(() => useVesselBand("s1", null));
    await waitFor(() => expect(api.suggestedBand).toHaveBeenCalled());
    expect(result.current).toBeNull();
    const { result: sinSesion } = renderHook(() => useVesselBand(null, null));
    expect(sinSesion.current).toBeNull();
  });
  it("una banda degenerada (techo ≤ suelo) es null", async () => {
    vi.spyOn(api, "suggestedBand").mockResolvedValue({ ...sugerida, vmax: 1500 });
    const { result } = renderHook(() => useVesselBand("s1", segmentada));
    await waitFor(() => expect(api.suggestedBand).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
```

- [x] **Step 3: Ejecutar y ver fallar**

Run: `cd frontend && npx vitest run src/vtk/useVesselBand.test.ts`
Expected: FAIL — «Cannot find module './useVesselBand'».

- [x] **Step 4: Implementar el hook**

`frontend/src/vtk/useVesselBand.ts`:

```ts
/* La banda de intensidades de los vasos, una sola para toda la app.

   Antes «Vasos» (preajustes de los cortes) se construía con
   `[threshold_lower, NaN]` al acabar de segmentar y `windowPresets` lo
   descartaba por el NaN: el preajuste existía mientras se ajustaba el umbral y
   desaparecía justo cuando el estudio quedaba segmentado. El techo sí existe
   en el servidor (`suggested-band.vmax` = máx(p99,9, techo de la banda), que
   incluye los núcleos brillantes de una DSA); se pide una vez por volumen. */
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SegmentResult } from "../api/types";

/** [suelo, techo] en intensidades del volumen. */
export type VesselBand = [number, number];

export function useVesselBand(sessionId: string | null, segmentation: SegmentResult | null, volumeVersion = 0): VesselBand | null {
  const [state, setState] = useState<{ forSession: string | null; forVersion: number; suggested: { lower: number; vmax: number } | null }>({ forSession: null, forVersion: -1, suggested: null });
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    api.suggestedBand(sessionId)
      .then((b) => { if (!cancelled) setState({ forSession: sessionId, forVersion: volumeVersion, suggested: { lower: b.lower, vmax: b.vmax } }); })
      // Sin banda no hay «Vasos»: mejor que un preajuste inventado. No se
      // reintenta hasta cambiar de sesión o de volumen.
      .catch(() => { if (!cancelled) setState({ forSession: sessionId, forVersion: volumeVersion, suggested: null }); });
    return () => { cancelled = true; };
  }, [sessionId, volumeVersion]);
  if (!sessionId || state.forSession !== sessionId || state.forVersion !== volumeVersion || !state.suggested) return null;
  // El suelo es el umbral con el que se segmentó, si lo hay: es lo que el
  // profesional decidió que es vaso en ESTE estudio.
  const lo = segmentation?.threshold_lower ?? state.suggested.lower;
  const hi = state.suggested.vmax;
  return hi > lo ? [lo, hi] : null;
}
```

- [x] **Step 5: Ejecutar y ver pasar**

Run: `cd frontend && npx vitest run src/vtk/useVesselBand.test.ts`
Expected: PASS (5 pruebas).

- [x] **Step 6: Usar la banda en el visor**

En `frontend/src/vtk/Viewer.tsx`, añade el import junto a los demás de `./`:

```ts
import { useVesselBand } from "./useVesselBand";
```

Debajo de la línea donde el visor obtiene la meta (`const { meta ... } = useVolumeMeta(sessionId, volumeVersion)`; busca `useVolumeMeta(`), añade:

```ts
  // Banda de vasos del volumen: una para los preajustes de los cortes y, en
  // VOLUMEN, para «VASOS» (Tarea 2) — spec §3.1.
  const vesselBand = useVesselBand(sessionId, segmentation, volumeVersion);
```

Sustituye la construcción de los preajustes (hoy `windowPresets(meta, previewBand ?? (segmentation?.threshold_lower != null ? [segmentation.threshold_lower, NaN] : null))`) por:

```ts
    ? windowPresets(meta, previewBand ?? vesselBand)
```

y actualiza el comentario de encima: «se derivan de la meta y de la banda activa (vista previa viva mientras se ajusta el umbral; si no, la banda de vasos del volumen, que sobrevive a la segmentación)».

- [x] **Step 7: Comprobar tipos y suites tocadas**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/useVesselBand.test.ts src/vtk/windowPresets.test.ts`
Expected: tsc sin errores; PASS.

- [x] **Step 8: Commit**

```bash
git add frontend/src/vtk/useVesselBand.ts frontend/src/vtk/useVesselBand.test.ts frontend/src/vtk/Viewer.tsx
git commit -m "Banda de vasos única: «Vasos» sigue en los cortes después de segmentar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 2: VOLUMEN según la modalidad (VASOS · TODO en XA)

**Files:**
- Modify: `frontend/src/vtk/volumePresets.ts`
- Modify: `frontend/src/vtk/volumePresets.test.ts`
- Modify: `frontend/src/vtk/MipView.tsx` (`PRESET_OPTIONS`, `win`, props)
- Modify: `frontend/src/store/planning.tsx:533,681` (preajuste inicial y `reset`)
- Modify: `frontend/src/vtk/Viewer.tsx` (prop `vesselBand` a `MipView`; corrección del preajuste por modalidad)
- Modify: `frontend/src/vtk/copy.test.ts` (nombres VASOS y TODO)
- Test: `frontend/src/store/planning.test.tsx`

**Interfaces:**
- Consumes: `VesselBand` (Tarea 1), `isHuModality` (`vtk/modality.ts`).
- Produces: `VolumePreset` ampliado con `"Vasos" | "Todo"`; `HU_VOLUME_PRESETS`, `XA_VOLUME_PRESETS`; `volumePresetsFor(modality: string | null | undefined): VolumePreset[]`; `defaultVolumeWindow(preset: VolumePreset, range: [number, number], band: [number, number] | null): VolumeWindow`. `MipView` gana la prop `vesselBand: [number, number] | null`. `VOLUME_PRESETS` desaparece.

- [x] **Step 1: Actualizar las pruebas de los preajustes**

En `frontend/src/vtk/volumePresets.test.ts`, cambia el import y la primera prueba, y añade un bloque:

```ts
import { HU_VOLUME_PRESETS, XA_VOLUME_PRESETS, defaultVolumeWindow, defaultWindow, presetToRange, presetToWindow, volumePresetsFor } from "./volumePresets";

describe("presetToRange", () => {
  it("en TC hay seis preajustes de tejido con los nombres de siempre", () => {
    expect(HU_VOLUME_PRESETS).toEqual(["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"]);
    expect(volumePresetsFor("CT")).toEqual(HU_VOLUME_PRESETS);
    expect(volumePresetsFor("ctpa")).toEqual(HU_VOLUME_PRESETS);
  });
  // ... (el resto de pruebas del bloque sin cambios)
});

describe("preajustes por modalidad (spec §3.2)", () => {
  it("fuera de TC solo hay VASOS y TODO, en ese orden", () => {
    expect(volumePresetsFor("XA")).toEqual(["Vasos", "Todo"]);
    expect(volumePresetsFor(null)).toEqual(XA_VOLUME_PRESETS);
  });
  it("«Vasos» y «Todo» reutilizan las curvas de «Vasos CTA» y «CTA» punto a punto", () => {
    expect(presetToRange("Vasos", [0, 255])).toEqual(presetToRange("Vasos CTA", [0, 255]));
    expect(presetToRange("Todo", [0, 255])).toEqual(presetToRange("CTA", [0, 255]));
  });
  it("la ventana por defecto de «Vasos» es la banda de vasos; la del resto, el rango", () => {
    expect(defaultVolumeWindow("Vasos", [0, 5000], [1470, 4717])).toEqual({ wc: 3093.5, ww: 3247 });
    expect(defaultVolumeWindow("Todo", [0, 5000], [1470, 4717])).toEqual(defaultWindow([0, 5000]));
    expect(defaultVolumeWindow("Hueso", [0, 5000], [1470, 4717])).toEqual(defaultWindow([0, 5000]));
  });
  it("sin banda (o degenerada) «Vasos» cae al rango", () => {
    expect(defaultVolumeWindow("Vasos", [0, 5000], null)).toEqual(defaultWindow([0, 5000]));
    expect(defaultVolumeWindow("Vasos", [0, 5000], [3000, 3000])).toEqual(defaultWindow([0, 5000]));
  });
});
```

- [x] **Step 2: Ejecutar y ver fallar**

Run: `cd frontend && npx vitest run src/vtk/volumePresets.test.ts`
Expected: FAIL — `volumePresetsFor` no exportado.

- [x] **Step 3: Implementar en `volumePresets.ts`**

Reemplaza las dos primeras líneas de código (tipo y `VOLUME_PRESETS`) y la constante `RAW`, y añade `defaultVolumeWindow`:

```ts
import { isHuModality } from "./modality";

export type VolumePreset = "CTA" | "Vasos CTA" | "Cerebro" | "Hemorragia" | "Hueso" | "Tejido blando" | "Vasos" | "Todo";
/** Preajustes de tejido: solo tienen sentido en HU. */
export const HU_VOLUME_PRESETS: VolumePreset[] = ["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"];
/** Fuera de TC (XA/3DRA) la intensidad no es tejido: «Hueso» era «lo más
 *  brillante» y «Cerebro» no significaba nada. Dos preajustes que sí dicen algo. */
export const XA_VOLUME_PRESETS: VolumePreset[] = ["Vasos", "Todo"];

export function volumePresetsFor(modality: string | null | undefined): VolumePreset[] {
  return isHuModality(modality) ? HU_VOLUME_PRESETS : XA_VOLUME_PRESETS;
}
```

Renombra la constante existente `RAW` a `BASE` (tipo `Record<Exclude<VolumePreset, "Vasos" | "Todo">, TransferPoints>`) y debajo:

```ts
// «Vasos» y «Todo» no son curvas nuevas: la de «Vasos CTA» (aisla lo brillante)
// y la de «CTA» (todo el rango) llevadas a otra ventana por defecto.
const RAW: Record<VolumePreset, TransferPoints> = { ...BASE, "Vasos": BASE["Vasos CTA"], "Todo": BASE["CTA"] };
```

Tras `defaultWindow` añade:

```ts
/** Ventana por defecto de un preajuste: «Vasos» arranca en la banda de vasos
 *  del volumen (spec §3.2); los demás, en el rango robusto como siempre. */
export function defaultVolumeWindow(preset: VolumePreset, range: [number, number], band: [number, number] | null): VolumeWindow {
  if (preset === "Vasos" && band && band[1] > band[0]) return { wc: (band[0] + band[1]) / 2, ww: band[1] - band[0] };
  return defaultWindow(range);
}
```

- [x] **Step 4: Ejecutar y ver pasar**

Run: `cd frontend && npx vitest run src/vtk/volumePresets.test.ts`
Expected: PASS.

- [x] **Step 5: Cablear `MipView`**

En `frontend/src/vtk/MipView.tsx`:
- Import: sustituye `VOLUME_PRESETS` por `defaultVolumeWindow, volumePresetsFor` (deja `defaultWindow` si sigue usándose; si no, quítalo).
- Borra la constante global `PRESET_OPTIONS`.
- Props: añade `vesselBand: [number, number] | null;` con doc «Banda de vasos del volumen (Tarea 1): ventana por defecto de «VASOS»».
- Dentro del componente, tras calcular `[rlo, rhi]`:

```ts
  // Los preajustes que tienen sentido en esta modalidad (spec §3.2).
  const presetOptions = volumePresetsFor(meta.modality).map((p) => ({ key: p, label: p.toUpperCase(), title: `Preajuste «${p}»` }));
  // Ventana del preajuste en COMPUESTO: la guardada para él o su ventana por defecto.
  const win: VolumeWindow = volumeWindows[volumePreset] ?? defaultVolumeWindow(volumePreset, [rlo, rhi], vesselBand);
```

(reemplaza la línea `const win: VolumeWindow = volumeWindows[volumePreset] ?? defaultWindow([rlo, rhi]);`).
- En el JSX, `options={PRESET_OPTIONS}` → `options={presetOptions}`. El título de RESTABLECER pasa a «Volver a la ventana por defecto de este preajuste».

- [x] **Step 6: Store y visor**

`frontend/src/store/planning.tsx`: `useState<VolumePreset>("Vasos CTA")` → `useState<VolumePreset>("Vasos")`; en `reset()`, `setVolumePreset("Vasos CTA")` → `setVolumePreset("Vasos")`, y cambia el comentario: «el estudio nuevo abre en MIP y con «Vasos»; si es TC, el visor lo cambia al primer preajuste de tejido al llegar la meta».

`frontend/src/vtk/Viewer.tsx`:
- Añade al import de `./volumePresets` (créalo si no existe) `volumePresetsFor`.
- Pasa `vesselBand={vesselBand}` en el `<MipView …>`.
- Junto al efecto que fija el foco en el cuello (busca `morphometry?.neck_origin`), añade:

```ts
  // El preajuste de VOLUMEN tiene que existir en esta modalidad: la sesión
  // arranca en «Vasos» (XA) y un TC lo cambia a «CTA» al llegar la meta.
  useEffect(() => {
    if (!meta) return;
    const list = volumePresetsFor(meta.modality);
    if (!list.includes(volumePreset)) setVolumePreset(list[0]);
  }, [meta, volumePreset, setVolumePreset]);
```

(`setVolumePreset` hay que añadirlo a la destructuración de `usePlanning()` del visor, línea ~233.)

- [x] **Step 7: Prueba del store y de los nombres**

En `frontend/src/store/planning.test.tsx` añade al final:

```ts
describe("VOLUMEN abre en «Vasos»", () => {
  it("el preajuste inicial y el de después de reset es Vasos", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper });
    expect(result.current.volumePreset).toBe("Vasos");
    act(() => result.current.setVolumePreset("Hueso"));
    act(() => result.current.reset());
    expect(result.current.volumePreset).toBe("Vasos");
  });
});
```

En `frontend/src/vtk/copy.test.ts` añade al `describe("nombres de los botones")`:

```ts
  it("VOLUMEN construye sus preajustes por modalidad (sin lista fija)", () => {
    const src = readFileSync(join(root, "vtk", "MipView.tsx"), "utf8");
    expect(src).toMatch(/volumePresetsFor\(meta\.modality\)/);
    expect(src).not.toMatch(/VOLUME_PRESETS/);
  });
```

- [x] **Step 8: Verificar**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/volumePresets.test.ts src/store/planning.test.tsx src/vtk/copy.test.ts src/vtk/mipReadout.test.ts`
Expected: tsc limpio; PASS.

- [x] **Step 9: Commit**

```bash
git add frontend/src/vtk/volumePresets.ts frontend/src/vtk/volumePresets.test.ts frontend/src/vtk/MipView.tsx frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/copy.test.ts
git commit -m "VOLUMEN por modalidad: VASOS y TODO en angiografía, los preajustes de tejido solo en TC

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 3: El MIP gana ventana y nivel

**Files:**
- Create: `frontend/src/vtk/mipRamp.ts`
- Create: `frontend/src/vtk/mipRamp.test.ts`
- Modify: `frontend/src/vtk/mipReadout.ts`, `frontend/src/vtk/mipReadout.test.ts`
- Modify: `frontend/src/store/planning.tsx` (`mipWindow`, `setMipWindow`)
- Modify: `frontend/src/vtk/MipView.tsx` (rampa, botón derecho en MIP, RESTABLECER en los dos modos, lectura con doble clic)

**Interfaces:**
- Consumes: `VolumeWindow`, `windowFromDrag(start, dx, dy, range)`, `WL_TITLE` (`vtk/windowPresets.ts`).
- Produces: `derivedMipWindow(thresholdLo: number, rangeHi: number): VolumeWindow`; `mipRampPoints(w: VolumeWindow, rangeLo: number): { color: [number, number, number, number][]; opacity: [number, number][] }`; store `mipWindow: VolumeWindow | null`, `setMipWindow(w: VolumeWindow | null)`; `mipReadoutLines` acepta `windowDerived?: boolean`.

- [x] **Step 1: Prueba de la rampa**

`frontend/src/vtk/mipRamp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { derivedMipWindow, mipRampPoints } from "./mipRamp";

describe("la rampa del MIP", () => {
  it("con la ventana derivada del umbral reproduce la rampa histórica punto a punto", () => {
    // Antes: ctf (rlo→negro, lo→gris 0,25, rhi→blanco); otf (rlo 0, lo 0, lo+15 % 0,9, rhi 1).
    const r = mipRampPoints(derivedMipWindow(2000, 5000), 1000);
    expect(r.color).toEqual([[1000, 0, 0, 0], [2000, 0.25, 0.25, 0.25], [5000, 1, 1, 1]]);
    expect(r.opacity).toEqual([[1000, 0], [2000, 0], [2450, 0.9], [5000, 1]]);
  });
  it("derivedMipWindow centra la ventana entre el umbral y el techo", () => {
    expect(derivedMipWindow(2000, 5000)).toEqual({ wc: 3500, ww: 3000 });
    expect(derivedMipWindow(5000, 5000).ww).toBe(1);   // nunca una rampa sin pendiente
  });
  it("una ventana movida por el usuario desplaza negro y blanco con ella", () => {
    const r = mipRampPoints({ wc: 3000, ww: 1000 }, 1000);
    expect(r.color.map((p) => p[0])).toEqual([1000, 2500, 3500]);
    expect(r.opacity.map((p) => p[0])).toEqual([1000, 2500, 2650, 3500]);
  });
  it("con el suelo de la ventana por debajo del rango los puntos siguen crecientes y finitos", () => {
    const r = mipRampPoints({ wc: 500, ww: 2000 }, 1000);   // lo = −500 < rlo
    const xs = [...r.color.map((p) => p[0]), ...r.opacity.map((p) => p[0])];
    expect(xs.every(Number.isFinite)).toBe(true);
    for (const pts of [r.color, r.opacity]) for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThanOrEqual(pts[i - 1][0]);
    expect(r.color[0][0]).toBe(-500);   // el negro empieza donde empieza la ventana
  });
});
```

- [x] **Step 2: Ejecutar y ver fallar**

Run: `cd frontend && npx vitest run src/vtk/mipRamp.test.ts`
Expected: FAIL — módulo inexistente.

- [x] **Step 3: Implementar `mipRamp.ts`**

```ts
/* La rampa de gris del MIP expresada como ventana (nivel y anchura), para que
   el botón derecho y el doble clic la muevan igual que en los cortes. Sin
   ventana del usuario se deriva del umbral: negro hasta él, blanco en el techo
   del rango robusto — exactamente la rampa que había antes (spec §3.3). */
import type { VolumeWindow } from "./volumePresets";

export interface MipRamp { color: [number, number, number, number][]; opacity: [number, number][] }

export function derivedMipWindow(thresholdLo: number, rangeHi: number): VolumeWindow {
  const ww = Math.max(1, rangeHi - thresholdLo);
  return { wc: thresholdLo + ww / 2, ww };
}

export function mipRampPoints(w: VolumeWindow, rangeLo: number): MipRamp {
  const ww = Math.max(1, w.ww), lo = w.wc - ww / 2, hi = w.wc + ww / 2;
  // El negro arranca en el suelo del rango o en el de la ventana, el menor:
  // una ventana bajada por debajo del rango no puede dejar puntos decrecientes.
  const floor = Math.min(rangeLo, lo);
  return {
    color: [[floor, 0, 0, 0], [lo, 0.25, 0.25, 0.25], [hi, 1, 1, 1]],
    opacity: [[floor, 0], [lo, 0], [lo + ww * 0.15, 0.9], [hi, 1]],
  };
}
```

- [x] **Step 4: Ejecutar y ver pasar**

Run: `cd frontend && npx vitest run src/vtk/mipRamp.test.ts`
Expected: PASS.

- [x] **Step 5: Lectura: prueba y cambio**

En `frontend/src/vtk/mipReadout.test.ts` añade:

```ts
  it("en MIP ampliado la ventana se lee junto al umbral mientras es la derivada, y sola cuando se movió", () => {
    const o = { mode: "acumulado" as const, reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, window: { wc: 3093.5, ww: 3247 } };
    expect(mipReadoutLines({ ...o, windowDerived: true })[1]).toBe("UMBRAL 1470 · NIV 3094 · VENT 3247");
    expect(mipReadoutLines({ ...o, windowDerived: false })[1]).toBe("NIV 3094 · VENT 3247");
    // Sin ventana (llamadas antiguas) la lectura es la de siempre.
    expect(mipReadoutLines({ ...o, window: undefined })[1]).toBe("UMBRAL 1470");
    // En compacto no cabe: no cambia.
    expect(mipReadoutLines({ ...o, compact: true, windowDerived: true })).toEqual(["ACUM 5/10"]);
  });
```

En `mipReadout.ts`, añade la opción `windowDerived?: boolean` al tipo y sustituye la última línea de la función (`return [cutLine(o), \`UMBRAL …\`]`) por:

```ts
  const umbral = `UMBRAL ${Math.round(o.threshold)}${o.unit ?? ""}`;
  if (!o.window) return [cutLine(o), umbral];
  const niv = `NIV ${Math.round(o.window.wc)}${o.unit ?? ""} · VENT ${Math.round(o.window.ww)}${o.unit ?? ""}`;
  // Mientras la ventana es la derivada del umbral, el umbral la explica; movida
  // a mano ya no describe la rampa y se calla.
  return [cutLine(o), o.windowDerived ? `${umbral} · ${niv}` : niv];
```

Actualiza el comentario de cabecera: «En MIP ampliado, con ventana, la segunda línea añade NIV · VENT (y conserva UMBRAL mientras la ventana sea la derivada)».

Run: `cd frontend && npx vitest run src/vtk/mipReadout.test.ts` → PASS.

- [x] **Step 6: Store**

`frontend/src/store/planning.tsx`:
- Interfaz (junto a `volumeWindows`): 

```ts
  /** Ventana del modo MIP movida a mano; null = la derivada del umbral (la rampa de siempre). */
  mipWindow: { wc: number; ww: number } | null;
  setMipWindow: (w: { wc: number; ww: number } | null) => void;
```
- Estado: `const [mipWindow, setMipWindow] = useState<{ wc: number; ww: number } | null>(null);`
- `reset()`: `setMipWindow(null);` junto a `setVolumeWindows({})`.
- Value del provider: añade `mipWindow` y `setMipWindow`.

- [x] **Step 7: `MipView`: rampa, arrastre, RESTABLECER, lectura**

En `frontend/src/vtk/MipView.tsx`:

1. Imports: `import { derivedMipWindow, mipRampPoints } from "./mipRamp";` y `import { WL_TITLE } from "./windowPresets";`. Destructura `mipWindow, setMipWindow` de `usePlanning()`.
2. Tras `win`: 
```ts
  // Ventana efectiva del MIP: la del usuario o la derivada del umbral.
  const mipWin: VolumeWindow = mipWindow ?? derivedMipWindow(lo, rhi);
```
3. En el efecto de funciones de transferencia, rama `volumeMode === "mip"`, sustituye las dos líneas de `ctf.addRGBPoint`/`otf.addPoint` por:
```ts
      const ramp = mipRampPoints(mipWin, rlo);
      ramp.color.forEach(([x, r, g, b]) => ctf.addRGBPoint(x, r, g, b));
      ramp.opacity.forEach(([x, a]) => otf.addPoint(x, a));
```
   y añade `mipWin.wc, mipWin.ww` a las dependencias.
4. Botón derecho: cambia el tipo de `winDrag` a `{ id: number; x: number; y: number; start: VolumeWindow; apply: (w: VolumeWindow) => void }`. En `pointerdown`:
```ts
      if (e.button !== 2 || d) return;
      // En COMPUESTO escribe en la ventana del preajuste; en MIP, en la del MIP (spec §3.3).
      const compuesto = volumeMode === "compuesto", preset = volumePreset;
      winDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: compuesto ? win : mipWin,
        apply: compuesto ? (w) => setVolumeWindow(preset, w) : setMipWindow };
```
   y en `pointermove`: `d.apply(windowFromDrag(d.start, e.clientX - d.x, e.clientY - d.y, [rlo, rhi]));`. Actualiza el comentario del bloque (ya no «solo en COMPUESTO») y el `title` del contenedor: « · Botón derecho: nivel y ventana» siempre.
5. La fila de preajustes: el `div` de la fila se renderiza en ambos modos; dentro, el grupo de preajustes solo con `volumeMode === "compuesto"`, y RESTABLECER siempre:
```tsx
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", pointerEvents: "auto" }}>
              {volumeMode === "compuesto" && <HudToggleGroup options={presetOptions} value={volumePreset} onChange={(k) => setVolumePreset(k as VolumePreset)} style={{ flexWrap: "wrap" }} />}
              <HudToggleGroup options={[{ key: "reset", label: "RESTABLECER", title: volumeMode === "compuesto" ? "Volver a la ventana por defecto de este preajuste" : "Volver a la rampa del umbral" }]}
                value="" onChange={resetWindow} />
            </div>
```
   con `const resetWindow = () => (volumeMode === "compuesto" ? setVolumeWindow(volumePreset, null) : setMipWindow(null));` definido antes del `return`.
6. Lectura. Antes del `return`:
```ts
  const readout = mipReadoutLines({
    mode: mipMode, reverse, index, count, slabMm: mipSlabMm, threshold: lo, compact, render: volumeMode, preset: volumePreset,
    clip: clipMode, offsetMm: freePlane.offsetMm, unit: unitFor(meta.modality),
    window: volumeMode === "compuesto" ? win : mipWin, windowDerived: volumeMode === "mip" && mipWindow === null,
  });
```
   Sustituye `<HudReadout at="bl" lines={mipReadoutLines({ … })} />` por un botón que se lee igual (hud.css: `.hud-readout` es `white-space: pre` y `.hud-wl` quita el estilo de botón; `readHud` lee `.hud-readout` por `textContent`):
```tsx
        {/* La lectura es un botón, como la W/L de los cortes: el doble clic
            restablece la ventana. pointerdown no llega al lienzo (empezaría un giro). */}
        <button type="button" className="hud-readout bl hud-wl" title={compact ? undefined : WL_TITLE}
          onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); if (!compact) resetWindow(); }}>
          {readout.join("\n")}
        </button>
```
   (si `HudReadout` deja de usarse en `MipView`, quita su import; la Tarea 6 añade `local: !!box` a este mismo objeto).
   `readHud` lee `.hud-readout` por `textContent` y el salto de línea `\n` lo da `white-space: pre`; `HudReadout` ya usaba esa misma regla.

- [x] **Step 8: Verificar**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/mipRamp.test.ts src/vtk/mipReadout.test.ts src/vtk/readHud.test.ts src/vtk/composeCapture.test.ts src/store/planning.test.tsx`
Expected: tsc limpio; PASS.

- [x] **Step 9: Commit**

```bash
git add frontend/src/vtk/mipRamp.ts frontend/src/vtk/mipRamp.test.ts frontend/src/vtk/mipReadout.ts frontend/src/vtk/mipReadout.test.ts frontend/src/store/planning.tsx frontend/src/vtk/MipView.tsx
git commit -m "El MIP gana ventana y nivel: botón derecho, RESTABLECER y doble clic en la lectura

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 4: Geometría de cámara: plano desde una normal, vista opuesta, mirar a lo largo

**Files:**
- Modify: `frontend/src/vtk/freePlane.ts`, `frontend/src/vtk/freePlane.test.ts`
- Modify: `frontend/src/vtk/geometry.ts`, `frontend/src/vtk/geometry.test.ts`
- Modify: `frontend/src/vtk/MeshView.tsx:174-184` (interfaz `CameraController`) y `:572-595` (`setView`, nuevo `lookAlong`)
- Modify: `frontend/src/vtk/Viewer.tsx:124-129` (títulos de AX · COR · SAG)

**Interfaces:**
- Consumes: `normalOf`, `clampPlane`, `ELEVATION_RANGE` (freePlane); `standardViewInVolume`, `effectiveDirection`, `fromLps`, `StandardView`, `Orientation` (geometry).
- Produces: `planeFromNormal(n: Vec3): FreePlane`; `oppositeView(v: StandardView): StandardView`; `resolveView(view: StandardView, currentDop: Vec3, o: Orientation): StandardView` (`SAME_VIEW_DOT = 0.99`); `lookAlongUp(dir: Vec3, o: Orientation): Vec3`; `CameraController.lookAlong(dir: Vec3, focal: Vec3, radiusMm: number): void`.

- [x] **Step 1: Pruebas de `planeFromNormal`**

En `frontend/src/vtk/freePlane.test.ts`, añade `planeFromNormal` al import y:

```ts
describe("planeFromNormal (spec §4.2)", () => {
  it("es la inversa de normalOf para una rejilla de direcciones (salvo el signo, que es el mismo plano)", () => {
    for (const a of [-150, -90, -30, 0, 45, 120, 180]) for (const e of [-80, -45, 0, 30, 60, 89]) {
      const n = normalOf({ azimuthDeg: a, elevationDeg: e, offsetMm: 0 });
      const m = normalOf(planeFromNormal(n));
      expect(Math.abs(dot(n, m))).toBeCloseTo(1, 6);
    }
  });
  it("una normal hacia −z se expresa con su opuesta (elevación en rango, offset 0)", () => {
    const p = planeFromNormal([0, 0, -1]);
    expect(p.elevationDeg).toBeCloseTo(0, 6); expect(p.offsetMm).toBe(0);
    expect(normalOf(p).map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it("una normal horizontal se acota a 89° sin NaN", () => {
    const p = planeFromNormal([1, 0, 0]);
    expect(p.elevationDeg).toBe(89); expect(Number.isFinite(p.azimuthDeg)).toBe(true);
    expect(normalOf(p)[0]).toBeGreaterThan(0.99);
  });
  it("una normal nula da el plano por defecto", () => {
    expect(planeFromNormal([0, 0, 0])).toEqual(DEFAULT_FREE_PLANE);
  });
});
```

- [x] **Step 2: Implementar `planeFromNormal`** (en `freePlane.ts`, tras `normalOf`)

```ts
/** El plano libre cuya normal es `n` (offset 0): la inversa de `normalOf`.
 *  Una normal y su opuesta son el mismo plano, así que se toma la que mira a
 *  +z, como todos los planos libres; una horizontal queda en ±89°, el límite
 *  de ELEVATION_RANGE (el corte se inclina 1°, que no se aprecia). */
export function planeFromNormal(n: Vec3): FreePlane {
  const l = Math.hypot(n[0], n[1], n[2]);
  if (l < EPS) return DEFAULT_FREE_PLANE;
  let [x, y, z] = [n[0] / l, n[1] / l, n[2] / l];
  if (z < 0) { x = -x; y = -y; z = -z; }
  const elevationDeg = (Math.acos(Math.min(1, Math.max(-1, z))) * 180) / Math.PI;
  const azimuthDeg = Math.hypot(x, y) < EPS ? 0 : (Math.atan2(x, y) * 180) / Math.PI;
  return clampPlane({ azimuthDeg, elevationDeg, offsetMm: 0 });
}
```

Run: `cd frontend && npx vitest run src/vtk/freePlane.test.ts` → PASS.

- [x] **Step 3: Pruebas de `oppositeView`, `resolveView`, `lookAlongUp`**

En `frontend/src/vtk/geometry.test.ts` añade al import `lookAlongUp, oppositeView, resolveView, type Orientation` y:

```ts
describe("segundo clic en la misma vista (spec §5)", () => {
  const o: Orientation = { direction: null, manual: null };   // orientación asumida: +z superior
  it("oppositeView empareja las seis caras", () => {
    expect(oppositeView("axial")).toBe("axial_inf"); expect(oppositeView("axial_inf")).toBe("axial");
    expect(oppositeView("coronal")).toBe("coronal_post"); expect(oppositeView("sagital_izq")).toBe("sagital");
  });
  it("si la cámara ya mira como la vista pedida, resuelve la opuesta; si no, la pedida", () => {
    const ax = standardViewInVolume("axial", o).direction;
    expect(resolveView("axial", ax, o)).toBe("axial_inf");
    expect(resolveView("axial", [-ax[0], -ax[1], -ax[2]], o)).toBe("axial");
    expect(resolveView("axial", standardViewInVolume("coronal", o).direction, o)).toBe("axial");
  });
  it("una cámara rotada 10° ya no cuenta como «la misma vista»", () => {
    const ax = standardViewInVolume("axial", o).direction;
    const r = 10 * Math.PI / 180;
    const girada: [number, number, number] = [ax[0] * Math.cos(r) + Math.sin(r), ax[1], ax[2] * Math.cos(r)];
    expect(resolveView("axial", girada, o)).toBe("axial");
  });
});

describe("lookAlongUp (spec §4.2)", () => {
  const o: Orientation = { direction: null, manual: null };
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  it("el arriba es el superior del paciente proyectado perpendicular a la dirección", () => {
    const up = lookAlongUp([1, 0, 0], o);
    expect(len(up)).toBeCloseTo(1, 6); expect(dot(up, [1, 0, 0])).toBeCloseTo(0, 6);
    expect(Math.abs(up[2])).toBeCloseTo(1, 6);
  });
  it("mirando casi a lo largo del superior usa el anterior y no degenera", () => {
    const up = lookAlongUp([0.01, 0, 0.99995], o);
    expect(len(up)).toBeCloseTo(1, 6); expect(dot(up, [0.01, 0, 0.99995])).toBeCloseTo(0, 4);
  });
});
```

`Orientation` es `{ direction: number[] | null; manual: ManualOrientation | null }` (`geometry.ts:13`); con los dos campos a `null` es la orientación asumida (+z superior), la misma que usan las pruebas existentes de `standardViewInVolume`. Añade `type Orientation` al import del test si no está.

- [x] **Step 4: Implementar en `geometry.ts`** (tras `standardViewInVolume`)

```ts
/** La cara contraria de una vista estándar. */
export function oppositeView(v: StandardView): StandardView {
  const pair: Record<StandardView, StandardView> = {
    axial: "axial_inf", axial_inf: "axial", coronal: "coronal_post", coronal_post: "coronal", sagital: "sagital_izq", sagital_izq: "sagital",
  };
  return pair[v];
}

/** Coseno mínimo para considerar que la cámara ya está en una vista. */
export const SAME_VIEW_DOT = 0.99;

/** Qué vista aplicar al pulsar `view`: la opuesta si la cámara ya mira así
 *  (segundo clic), la pedida si no. Se decide por la dirección actual de la
 *  cámara y no por el último botón: vale también tras girar a mano y volver. */
export function resolveView(view: StandardView, currentDop: Vec3, o: Orientation): StandardView {
  const want = standardViewInVolume(view, o).direction;
  const c = currentDop[0] * want[0] + currentDop[1] * want[1] + currentDop[2] * want[2];
  return c > SAME_VIEW_DOT ? oppositeView(view) : view;
}

/** «Arriba» de una cámara que mira a lo largo de `dir`: el superior del
 *  paciente proyectado perpendicular a `dir`; si `dir` es casi vertical, el
 *  anterior. Unitario siempre. */
export function lookAlongUp(dir: Vec3, o: Orientation): Vec3 {
  const { d } = effectiveDirection(o);
  const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dn = unit(dir);
  const sup = unit(fromLps(d, [0, 0, 1]));
  const ref = Math.abs(dn[0] * sup[0] + dn[1] * sup[1] + dn[2] * sup[2]) > 0.95 ? unit(fromLps(d, [0, -1, 0])) : sup;
  const k = ref[0] * dn[0] + ref[1] * dn[1] + ref[2] * dn[2];
  return unit([ref[0] - k * dn[0], ref[1] - k * dn[1], ref[2] - k * dn[2]]);
}
```

Run: `cd frontend && npx vitest run src/vtk/geometry.test.ts` → PASS.

- [x] **Step 5: `MeshView`: `setView` resuelve la cara y `lookAlong`**

En `frontend/src/vtk/MeshView.tsx`:
- Import `lookAlongUp, resolveView` desde `./geometry` (junto a `standardViewInVolume`).
- Interfaz `CameraController`: añade
```ts
  /** Mira a lo largo de `dir` hacia `focal`, encuadrando un cubo de lado 2·radiusMm (spec §4.2). */
  lookAlong(dir: Vec3, focal: Vec3, radiusMm: number): void;
```
- En `setView`, sustituye la rama `if (view !== "fit") { … }` por:
```ts
      if (view !== "fit") {
        // Segundo clic en la misma vista: la cara contraria (spec §5).
        const target = resolveView(view, cam.getDirectionOfProjection() as Vec3, orientationRef.current);
        // La cámara se pone del lado contrario a donde mira.
        const { direction: dop, viewUp: up } = standardViewInVolume(target, orientationRef.current);
        const dir: Vec3 = [-dop[0], -dop[1], -dop[2]];
        cam.setFocalPoint(0, 0, 0);
        cam.setPosition(dir[0], dir[1], dir[2]);
        cam.setViewUp(up[0], up[1], up[2]);
      }
```
- En el objeto `controller`, tras `frame`:
```ts
      // Vista de abordaje: desde fuera, por el corredor, hacia la diana.
      lookAlong: (dir: Vec3, focal: Vec3, r: number) => {
        const h = handles.current; if (!h) return;
        const cam = h.renderer.getActiveCamera();
        const up = lookAlongUp(dir, orientationRef.current);
        cam.setFocalPoint(focal[0], focal[1], focal[2]);
        cam.setPosition(focal[0] - dir[0], focal[1] - dir[1], focal[2] - dir[2]);
        cam.setViewUp(up[0], up[1], up[2]);
        // resetCamera(bounds) conserva dirección y arriba: solo aleja la cámara hasta encuadrar el cubo.
        h.renderer.resetCamera([focal[0] - r, focal[0] + r, focal[1] - r, focal[1] + r, focal[2] - r, focal[2] + r]);
        h.renderer.resetCameraClippingRange();
        h.renderer.updateLightsGeometryToFollowCamera();
        h.renderWindow.render();
      },
```
- Busca otros objetos que implementen `CameraController` (`grep -rn "CameraController" frontend/src --include=*.ts --include=*.tsx`) y añade `lookAlong` a los dobles de prueba que fallen en `tsc`.

- [x] **Step 6: Títulos en `Viewer.tsx`**

```ts
const CAMERA_BUTTONS: [CameraView, string, string][] = [
  ["fit", "ENCUADRAR", "Reencuadrar la escena completa"],
  ["axial", "AX", "Vista axial (desde superior; otro clic, desde inferior)"],
  ["coronal", "COR", "Vista coronal (desde anterior; otro clic, desde posterior)"],
  ["sagital", "SAG", "Vista sagital (desde la izquierda; otro clic, desde la derecha)"],
];
```

- [x] **Step 7: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/freePlane.test.ts src/vtk/geometry.test.ts src/vtk/copy.test.ts`
Expected: tsc limpio; PASS.

```bash
git add frontend/src/vtk/freePlane.ts frontend/src/vtk/freePlane.test.ts frontend/src/vtk/geometry.ts frontend/src/vtk/geometry.test.ts frontend/src/vtk/MeshView.tsx frontend/src/vtk/Viewer.tsx
git commit -m "Cámara 3D: segundo clic en AX · COR · SAG mira la cara opuesta; mirar a lo largo de una dirección

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 5: Abordaje con referencia y botón «ABORDAJE»

**Files:**
- Create: `frontend/src/vtk/approachView.ts`, `frontend/src/vtk/approachView.test.ts`
- Modify: `frontend/src/vtk/Viewer.tsx` (grupo «VISTA ▸» de `renderScene`, ~línea 1787)
- Modify: `frontend/src/components/planning/DevicesPanel.tsx:1424-1600` (`TrajectoryTool`: exportarla; etiqueta del ángulo)
- Create: `frontend/src/components/planning/TrajectoryTool.test.tsx`
- Modify: `backend/services/report_generator.py:1689`
- Modify: `frontend/src/vtk/copy.test.ts`

**Interfaces:**
- Consumes: `planeFromNormal`, `CameraController.lookAlong`, `lesionFrameRadiusMm` (Viewer), store `trajEntry/trajTarget/setFocusMm/setFreePlane`, `morphometry.principal_axis`.
- Produces: `approachDirection(entry: Vec3, target: Vec3): Vec3 | null`; `angleReferenceLabel(axis: number[] | null | undefined): { text: string; title: string }`.

- [x] **Step 1: Pruebas**

`frontend/src/vtk/approachView.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { angleReferenceLabel, approachDirection } from "./approachView";

describe("approachDirection", () => {
  it("es el unitario de entrada → diana", () => {
    expect(approachDirection([0, 0, 0], [0, 3, 4])).toEqual([0, 0.6, 0.8]);
  });
  it("con los dos puntos iguales no hay dirección", () => {
    expect(approachDirection([1, 1, 1], [1, 1, 1])).toBeNull();
  });
});

describe("angleReferenceLabel (spec §4.1)", () => {
  it("con eje del aneurisma lo dice", () => {
    expect(angleReferenceLabel([0.1, 0.2, 0.97]).text).toBe("Ángulo respecto al eje del aneurisma");
  });
  it("sin eje (o nulo) avisa de que la referencia es el eje vertical", () => {
    expect(angleReferenceLabel(null).text).toBe("Ángulo respecto al eje vertical del estudio (sin eje del aneurisma medido)");
    expect(angleReferenceLabel([0, 0, 0]).text).toContain("eje vertical");
  });
});
```

- [x] **Step 2: Implementar `approachView.ts`**

```ts
/* El abordaje como dirección: lo que la cámara mira y lo que el plano Oblicuo
   corta en perpendicular (spec §4). */
import type { Vec3 } from "./geometry";

export function approachDirection(entry: Vec3, target: Vec3): Vec3 | null {
  const d: Vec3 = [target[0] - entry[0], target[1] - entry[1], target[2] - entry[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  return l < 1e-6 ? null : [d[0] / l, d[1] / l, d[2] / l];
}

/** Respecto a qué se mide el ángulo del corredor: el servidor usa el eje
 *  principal del saco y, sin morfometría, el eje z. La etiqueta lo dice. */
export function angleReferenceLabel(axis: number[] | null | undefined): { text: string; title: string } {
  const hasAxis = !!axis && axis.some((v) => v !== 0);
  return hasAxis
    ? { text: "Ángulo respecto al eje del aneurisma", title: "Incidencia del corredor sobre el eje principal del saco, de 0° (a lo largo del eje) a 90° (perpendicular)" }
    : { text: "Ángulo respecto al eje vertical del estudio (sin eje del aneurisma medido)", title: "Sin morfometría el servidor mide la incidencia contra el eje z del estudio; mide el aneurisma para tener la referencia clínica" };
}
```

Run: `cd frontend && npx vitest run src/vtk/approachView.test.ts` → PASS.

- [x] **Step 3: Botón «ABORDAJE» en el visor**

En `frontend/src/vtk/Viewer.tsx`:
- Imports: `import { approachDirection } from "./approachView";` y `planeFromNormal` desde `./freePlane` (amplía el import existente).
- Junto a `centerOnLesion` (línea ~1239) añade:
```ts
  // «ABORDAJE»: la cámara mira por el corredor hacia la diana y el plano
  // libre queda perpendicular a él en la diana (spec §4.2). Oblicuo y VOLUMEN
  // en LIBRE siguen ese plano sin más.
  const viewApproach = () => {
    if (!trajEntry || !trajTarget || !meta) return;
    const dir = approachDirection(trajEntry, trajTarget);
    if (!dir) return;
    camera?.lookAlong(dir, trajTarget, lesionFrameRadiusMm(morphometry?.max_diameter_mm ?? candidate?.max_diameter_mm ?? 0));
    setFocusMm(trajTarget, meta);
    setFreePlane(planeFromNormal(dir));
  };
```
- En el grupo `VISTA ▸` de `renderScene`:
```tsx
                options={[
                  ...CAMERA_BUTTONS.map(([key, label, title]) => ({ key, label, title })),
                  ...(lesion ? [{ key: "lesion", label: "LESIÓN", title: "Acercar la cámara a la lesión" }] : []),
                  ...(trajEntry && trajTarget ? [{ key: "abordaje", label: "ABORDAJE", title: "Mirar a lo largo del corredor; el plano Oblicuo se pone perpendicular a él" }] : []),
                ]}
                value="" onChange={(k) => (k === "lesion" ? centerOnLesion() : k === "abordaje" ? viewApproach() : camera.setView(k as CameraView))} />
```

- [x] **Step 4: Etiqueta del ángulo en el panel**

En `frontend/src/components/planning/DevicesPanel.tsx`:
- `function TrajectoryTool()` → `export function TrajectoryTool()`.
- Destructura también `morphometry` de `usePlanning()` en `TrajectoryTool`.
- Import `angleReferenceLabel` desde `../../vtk/approachView`.
- Sustituye `{saved && <> · Ángulo: <b …>{saved.angle_deg.toFixed(1)}°</b></>}` por:
```tsx
          {saved && (() => { const ref = angleReferenceLabel(morphometry?.principal_axis); return (
            <> · <span title={ref.title}>{ref.text}</span>: <b style={{ fontFamily: "var(--font-mono)" }}>{saved.angle_deg.toFixed(1)}°</b></>
          ); })()}
```

- [x] **Step 5: Prueba del panel**

`frontend/src/components/planning/TrajectoryTool.test.tsx`:

```tsx
/* El ángulo del corredor dice respecto a qué se mide (spec §4.1). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTrajectory = vi.fn();
vi.mock("../../api/client", () => ({ api: { setTrajectory: (...a: unknown[]) => setTrajectory(...a), suggestCorridors: vi.fn() }, ApiError: class extends Error {} }));
let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));

import { TrajectoryTool } from "./DevicesPanel";

beforeEach(() => {
  setTrajectory.mockReset().mockResolvedValue({ entry: [0, 0, 0], target: [0, 0, 10], depth_mm: 10, angle_deg: 37.2, corridor: null });
  planning = {
    sessionId: "s", segmentation: { mesh_url: "/m.vtp" }, pickMode: null, setPickMode: vi.fn(),
    trajEntry: [0, 0, 0], trajTarget: [0, 0, 10], setTrajEntry: vi.fn(), setTrajTarget: vi.fn(),
    morphometry: { principal_axis: [0, 0, 1] },
  };
});

describe("TrajectoryTool", () => {
  it("con eje medido, el ángulo se dice respecto al eje del aneurisma", async () => {
    render(<TrajectoryTool />);
    fireEvent.click(screen.getByText("Guardar trayectoria"));
    await waitFor(() => expect(setTrajectory).toHaveBeenCalled());
    expect(await screen.findByText("Ángulo respecto al eje del aneurisma")).toBeInTheDocument();
    expect(screen.getByText("37.2°")).toBeInTheDocument();
  });
  it("sin morfometría avisa de que la referencia es el eje vertical", async () => {
    planning.morphometry = null;
    render(<TrajectoryTool />);
    fireEvent.click(screen.getByText("Guardar trayectoria"));
    expect(await screen.findByText(/eje vertical del estudio/)).toBeInTheDocument();
  });
});
```

Si `DevicesPanel.tsx` arrastra al montarse módulos que rompan el test (p. ej. vtk), añade `vi.mock` para esos módulos como hace `DevicesPanel.clipField.test.tsx` (cópialos de ahí).

- [x] **Step 6: Informe y guardia de nombres**

`backend/services/report_generator.py:1689`: `["Ángulo de incidencia", …]` → `["Ángulo respecto al eje del aneurisma", …]`. Comprueba que ninguna prueba espera el texto viejo: `grep -rn "ngulo de incidencia" backend/*.py` debe no devolver nada tras el cambio.

En `frontend/src/vtk/copy.test.ts`, en `describe("nombres de los botones")`:
```ts
  it("el 3D ofrece ABORDAJE junto a las vistas", () => {
    expect(readFileSync(join(root, "vtk", "Viewer.tsx"), "utf8")).toMatch(/label:\s*"ABORDAJE"/);
  });
```

- [x] **Step 7: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/approachView.test.ts src/components/planning/TrajectoryTool.test.tsx src/components/planning/DevicesPanel.clipField.test.tsx src/vtk/copy.test.ts`
Expected: PASS.

```bash
git add frontend/src/vtk/approachView.ts frontend/src/vtk/approachView.test.ts frontend/src/vtk/Viewer.tsx frontend/src/components/planning/DevicesPanel.tsx frontend/src/components/planning/TrajectoryTool.test.tsx frontend/src/vtk/copy.test.ts backend/services/report_generator.py
git commit -m "Abordaje: el ángulo dice respecto a qué se mide y ABORDAJE mira por el corredor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 6: MIP local del cuello («LOCAL ●/○»)

**Files:**
- Create: `frontend/src/vtk/lesionFrame.ts` (mueve `lesionFrameRadiusMm` desde `Viewer.tsx:1944-1952`)
- Create: `frontend/src/vtk/localBox.ts`, `frontend/src/vtk/localBox.test.ts`
- Create: `frontend/src/vtk/mipClipPlanes.ts`, `frontend/src/vtk/mipClipPlanes.test.ts`
- Modify: `frontend/src/vtk/orbit.ts`, `frontend/src/vtk/orbit.test.ts` (`ClipState.box`)
- Modify: `frontend/src/vtk/mipReadout.ts`, `frontend/src/vtk/mipReadout.test.ts` (` · LOCAL`)
- Modify: `frontend/src/store/planning.tsx` (`mipLocal`)
- Modify: `frontend/src/vtk/MipView.tsx` (planos, botón, encuadre), `frontend/src/vtk/Viewer.tsx` (prop `lesion`)

**Interfaces:**
- Consumes: `Bounds6`, `ClipState`, `visibleBounds`, `MIN_EXTENT_MM` (orbit); `lesion: Vec3 | null` y diámetro (Viewer).
- Produces: `lesionFrameRadiusMm(diameterMm)` en `vtk/lesionFrame.ts` (Viewer la reexporta); `localBox(center: Vec3, diameterMm: number, volume: Bounds6): Bounds6`; `axisClipPlanes(o: { axis: 0|1|2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number; box: Bounds6 | null }): ClipPlaneSpec[]` con `ClipPlaneSpec = { origin: Vec3; normal: Vec3 }`; store `mipLocal: boolean`, `setMipLocal`; `MipView` prop `lesion: { center: Vec3; diameterMm: number } | null`; `mipReadoutLines` opción `local?: boolean`.

- [x] **Step 1: Mover `lesionFrameRadiusMm`**

Crea `frontend/src/vtk/lesionFrame.ts` con la función y su comentario tal como están en `Viewer.tsx` (líneas ~1944-1952, `export function lesionFrameRadiusMm`). En `Viewer.tsx` bórrala e importa: `import { lesionFrameRadiusMm } from "./lesionFrame";` y añade `export { lesionFrameRadiusMm };` para no romper importadores (`grep -rn lesionFrameRadiusMm frontend/src`). Run: `cd frontend && npx tsc --noEmit -p .` → limpio.

- [x] **Step 2: Pruebas de `localBox` y `axisClipPlanes`**

`frontend/src/vtk/localBox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localBox } from "./localBox";
import { lesionFrameRadiusMm } from "./lesionFrame";

const vol: [number, number, number, number, number, number] = [0, 100, 0, 80, 0, 60];

describe("localBox (spec §6)", () => {
  it("es un cubo centrado en la lesión con el medio lado de «Centrar en la lesión»", () => {
    const r = lesionFrameRadiusMm(6);
    expect(localBox([50, 40, 30], 6, vol)).toEqual([50 - r, 50 + r, 40 - r, 40 + r, 30 - r, 30 + r]);
  });
  it("se acota al volumen sin perder extensión mínima", () => {
    const b = localBox([1, 40, 59], 6, vol);
    expect(b[0]).toBe(0); expect(b[5]).toBe(60);
    for (let a = 0; a < 3; a++) expect(b[2 * a + 1] - b[2 * a]).toBeGreaterThanOrEqual(1);
  });
  it("una lesión fuera del volumen devuelve una caja pegada al borde, no vacía", () => {
    const b = localBox([-50, 40, 30], 6, vol);
    expect(b[0]).toBe(0); expect(b[1]).toBeGreaterThanOrEqual(1);
  });
});
```

`frontend/src/vtk/mipClipPlanes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { axisClipPlanes } from "./mipClipPlanes";

const box: [number, number, number, number, number, number] = [10, 30, 20, 40, 30, 50];
const base = { axis: 2 as const, posMm: 35, acumulado: true, reverse: false, slabMm: 5, box: null };

describe("axisClipPlanes", () => {
  it("sin caja reproduce los planos de siempre: uno en acumulado, dos en lámina", () => {
    expect(axisClipPlanes(base)).toEqual([{ origin: [0, 0, 35], normal: [0, 0, -1] }]);
    expect(axisClipPlanes({ ...base, reverse: true })).toEqual([{ origin: [0, 0, 35], normal: [0, 0, 1] }]);
    expect(axisClipPlanes({ ...base, acumulado: false })).toEqual([
      { origin: [0, 0, 30], normal: [0, 0, 1] }, { origin: [0, 0, 40], normal: [0, 0, -1] },
    ]);
  });
  it("con caja son exactamente seis planos y el corte sustituye a la cara de su lado", () => {
    const p = axisClipPlanes({ ...base, box });
    expect(p).toHaveLength(6);
    // Eje z: suelo de la caja (30, normal +z) y el corte (35, normal −z) en vez del techo (50).
    expect(p).toContainEqual({ origin: [0, 0, 30], normal: [0, 0, 1] });
    expect(p).toContainEqual({ origin: [0, 0, 35], normal: [0, 0, -1] });
    expect(p.some((q) => q.origin[2] === 50)).toBe(false);
    // Las otras caras siguen.
    expect(p).toContainEqual({ origin: [10, 0, 0], normal: [1, 0, 0] });
    expect(p).toContainEqual({ origin: [0, 40, 0], normal: [0, -1, 0] });
  });
  it("en lámina los dos planos se funden con las dos caras del eje (siguen siendo seis)", () => {
    const p = axisClipPlanes({ ...base, acumulado: false, slabMm: 3, box });
    expect(p).toHaveLength(6);
    expect(p).toContainEqual({ origin: [0, 0, 32], normal: [0, 0, 1] });
    expect(p).toContainEqual({ origin: [0, 0, 38], normal: [0, 0, -1] });
  });
  it("un corte fuera de la caja no la vacía: queda al menos 1 mm", () => {
    const p = axisClipPlanes({ ...base, posMm: 5, box });   // acumulado hasta 5, caja 30–50 en z
    const z = p.filter((q) => q.normal[2] !== 0).map((q) => q.origin[2]).sort((a, b) => a - b);
    expect(z[1] - z[0]).toBeGreaterThanOrEqual(1);
    expect(p).toHaveLength(6);
  });
});
```

- [x] **Step 3: Implementar**

`frontend/src/vtk/localBox.ts`:

```ts
/* La caja del MIP local: la lesión y lo que la rodea (spec §6), el mismo cubo
   que encuadra «Centrar en la lesión», acotado al volumen. */
import type { Vec3 } from "./geometry";
import { lesionFrameRadiusMm } from "./lesionFrame";
import { MIN_EXTENT_MM, type Bounds6 } from "./orbit";

export function localBox(center: Vec3, diameterMm: number, volume: Bounds6): Bounds6 {
  const r = lesionFrameRadiusMm(diameterMm);
  const out: Bounds6 = [0, 0, 0, 0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const lo = Math.max(volume[2 * a], Math.min(volume[2 * a + 1], center[a] - r));
    const hi = Math.max(volume[2 * a], Math.min(volume[2 * a + 1], center[a] + r));
    out[2 * a] = lo; out[2 * a + 1] = hi;
    // Nunca una caja plana: resetCamera daría NaN y los planos se cruzarían.
    if (hi - lo < MIN_EXTENT_MM) {
      if (lo <= volume[2 * a]) out[2 * a + 1] = Math.min(volume[2 * a + 1], lo + MIN_EXTENT_MM);
      else out[2 * a] = Math.max(volume[2 * a], hi - MIN_EXTENT_MM);
    }
  }
  return out;
}
```

`frontend/src/vtk/mipClipPlanes.ts`:

```ts
/* Los planos de recorte del MIP en RECORTE EJE, con o sin la caja LOCAL.
   vtk.js admite seis planos en el mapper de volumen (vClipPlaneNormals[6]):
   la caja aporta seis y el corte del eje se FUNDE con la cara de su lado en
   vez de sumarse (spec §6). vtk conserva el semiespacio (p − origen)·normal ≥ 0. */
import type { Vec3 } from "./geometry";
import { MIN_EXTENT_MM, type Bounds6 } from "./orbit";

export interface ClipPlaneSpec { origin: Vec3; normal: Vec3 }

export function axisClipPlanes(o: { axis: 0 | 1 | 2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number; box: Bounds6 | null }): ClipPlaneSpec[] {
  const n = (a: number, sign: 1 | -1): Vec3 => { const v: Vec3 = [0, 0, 0]; v[a] = sign; return v; };
  const at = (a: number, mm: number): Vec3 => { const v: Vec3 = [0, 0, 0]; v[a] = mm; return v; };
  if (!o.box) {
    if (o.acumulado) return [{ origin: at(o.axis, o.posMm), normal: n(o.axis, o.reverse ? 1 : -1) }];
    return [{ origin: at(o.axis, o.posMm - o.slabMm), normal: n(o.axis, 1) }, { origin: at(o.axis, o.posMm + o.slabMm), normal: n(o.axis, -1) }];
  }
  const b = o.box.slice() as Bounds6;
  const lo = 2 * o.axis, hi = lo + 1;
  if (o.acumulado) { if (o.reverse) b[lo] = Math.max(b[lo], o.posMm); else b[hi] = Math.min(b[hi], o.posMm); }
  else { b[lo] = Math.max(b[lo], o.posMm - o.slabMm); b[hi] = Math.min(b[hi], o.posMm + o.slabMm); }
  // El corte puede caer fuera de la caja: se deja 1 mm pegado al lado que manda.
  if (b[hi] - b[lo] < MIN_EXTENT_MM) {
    if (o.acumulado && !o.reverse) b[lo] = b[hi] - MIN_EXTENT_MM;
    else b[hi] = b[lo] + MIN_EXTENT_MM;
  }
  const out: ClipPlaneSpec[] = [];
  for (let a = 0; a < 3; a++) {
    out.push({ origin: at(a, b[2 * a]), normal: n(a, 1) });
    out.push({ origin: at(a, b[2 * a + 1]), normal: n(a, -1) });
  }
  return out;
}
```

Run: `cd frontend && npx vitest run src/vtk/localBox.test.ts src/vtk/mipClipPlanes.test.ts` → PASS.

- [x] **Step 4: `ClipState.box` para el encuadre**

En `orbit.ts`, al modo `eje` añade `box?: Bounds6`:
```ts
  | { mode: "eje"; axis: 0 | 1 | 2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number; box?: Bounds6 }
```
y en `visibleBounds`, rama `eje`, antes de `return clampTo(v, bounds)`:
```ts
    if (clip.box) for (let a = 0; a < 3; a++) { v[2 * a] = Math.max(v[2 * a], clip.box[2 * a]); v[2 * a + 1] = Math.min(v[2 * a + 1], clip.box[2 * a + 1]); }
```
Prueba en `orbit.test.ts`:
```ts
  it("con caja LOCAL lo visible es la intersección del corte con la caja", () => {
    const v = visibleBounds([0, 100, 0, 100, 0, 100], { mode: "eje", axis: 2, posMm: 45, acumulado: true, reverse: false, slabMm: 5, box: [40, 60, 40, 60, 40, 60] });
    expect(v).toEqual([40, 60, 40, 60, 40, 45]);
  });
```
Run: `cd frontend && npx vitest run src/vtk/orbit.test.ts` → PASS.

- [x] **Step 5: Lectura ` · LOCAL`**

`mipReadout.ts`: opción `local?: boolean`. Renombra la función actual a `linesWithoutLocal` (misma firma y cuerpo) y exporta en su lugar:

```ts
/** La línea del corte lleva « · LOCAL» con la caja activa: es la primera
 *  salvo en COMPUESTO ampliado, donde la primera nombra el preajuste. */
export function mipReadoutLines(o: Parameters<typeof linesWithoutLocal>[0] & { local?: boolean }): string[] {
  const lines = linesWithoutLocal(o);
  if (!o.local) return lines;
  const i = o.render === "compuesto" && !o.compact ? 1 : 0;
  lines[i] = `${lines[i]} · LOCAL`;
  return lines;
}
```

Prueba en `mipReadout.test.ts`:
```ts
  it("LOCAL se lee en la línea del corte, en compacto y ampliado", () => {
    expect(mipReadoutLines({ ...base, mode: "acumulado", compact: true, local: true })).toEqual(["ACUM 193/384 · LOCAL"]);
    expect(mipReadoutLines({ ...base, mode: "acumulado", compact: false, local: true })[0]).toBe("ACUMULADO HASTA 193/384 · LOCAL");
    expect(mipReadoutLines({ ...base, mode: "lamina", compact: false, render: "compuesto", preset: "Vasos", local: true })[1]).toBe("LÁMINA ±10 mm · LOCAL");
  });
```

- [x] **Step 6: Store, `MipView`, `Viewer`**

Store: `mipLocal: boolean; setMipLocal: (v: boolean) => void;` (doc: «Acotar VOLUMEN a la caja de la lesión (spec §6)»), `useState(false)`, `setMipLocal(false)` en `reset()`, y en el value.

`MipView.tsx`:
- Props: `lesion: { center: Vec3; diameterMm: number } | null;` (doc: «Centro y diámetro de la lesión para la caja LOCAL; null sin lesión»).
- Imports: `localBox` (`./localBox`), `axisClipPlanes` (`./mipClipPlanes`), `vtkPlane` ya está.
- Destructura `mipLocal, setMipLocal`.
- Tras `libre`: 
```ts
  // La caja LOCAL solo cabe con el recorte por eje: seis planos son el tope de vtk.js.
  const box: Bounds6 | null = lesion && mipLocal && !libre ? localBox(lesion.center, lesion.diameterMm, image.getBounds() as Bounds6) : null;
  // Por valor: los efectos dependen de la clave, no de la identidad del array.
  const boxKey = box ? box.join(",") : "";
```
- En el efecto de planos de recorte, rama no-libre: sustituye los bloques `n`/`o`/`if (mipMode === "acumulado") … else …` por:
```ts
    for (const p of axisClipPlanes({ axis, posMm, acumulado: mipMode === "acumulado", reverse, slabMm: mipSlabMm, box })) {
      const pl = vtkPlane.newInstance(); pl.setOrigin(...p.origin); pl.setNormal(...p.normal);
      s.mapper.addClippingPlane(pl);
    }
```
  y añade `boxKey` a las dependencias (no `box`).
- En `fit`, el `ClipState` del modo eje: `{ mode: "eje", axis, posMm, acumulado, reverse, slabMm: mipSlabMm, box: box ?? undefined }`.
- Al encender LOCAL se encuadra una vez: `useEffect(() => { if (mipLocal && !libre) fitRef.current(); }, [mipLocal]);   // eslint-disable-line react-hooks/exhaustive-deps` (después de la definición de `fitRef`).
- Botón, en la fila superior tras el grupo `RECORTE ▸`:
```tsx
            {lesion && (
              <HudToggleGroup options={[{ key: "local", label: mipLocal ? "LOCAL ●" : "LOCAL ○",
                                          title: libre ? "Solo con RECORTE EJE (vtk.js admite seis planos de recorte)" : "Acotar la proyección a la lesión y lo que la rodea" }]}
                value={mipLocal && !libre ? "local" : ""} onChange={() => { if (!libre) setMipLocal(!mipLocal); }} style={libre ? { opacity: 0.45 } : undefined} />
            )}
```
- Lectura: `local: !!box` en la llamada a `mipReadoutLines`.

`Viewer.tsx`: junto a `const lesion` (línea ~1237) añade
```ts
  // Para la caja LOCAL de VOLUMEN: memorizado por valor, para que MipView no rehaga sus planos en cada render.
  const lesionDiam = morphometry?.max_diameter_mm ?? candidate?.max_diameter_mm ?? 0;
  const mipLesion = useMemo(() => (lesion ? { center: lesion, diameterMm: lesionDiam } : null), [lesion?.[0], lesion?.[1], lesion?.[2], lesionDiam]);   // eslint-disable-line react-hooks/exhaustive-deps
```
y en el `<MipView …>` (línea ~1590, dentro de `renderPane`, declarado después de `lesion`) añade `lesion={mipLesion}`.

- [x] **Step 7: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/localBox.test.ts src/vtk/mipClipPlanes.test.ts src/vtk/orbit.test.ts src/vtk/mipReadout.test.ts src/store/planning.test.tsx src/vtk/copy.test.ts`
Expected: PASS.

```bash
git add frontend/src/vtk/lesionFrame.ts frontend/src/vtk/localBox.ts frontend/src/vtk/localBox.test.ts frontend/src/vtk/mipClipPlanes.ts frontend/src/vtk/mipClipPlanes.test.ts frontend/src/vtk/orbit.ts frontend/src/vtk/orbit.test.ts frontend/src/vtk/mipReadout.ts frontend/src/vtk/mipReadout.test.ts frontend/src/store/planning.tsx frontend/src/vtk/MipView.tsx frontend/src/vtk/Viewer.tsx
git commit -m "MIP local: LOCAL ●/○ acota VOLUMEN a la caja de la lesión con seis planos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 7: Los puntos de la línea central llegan al cliente (backend + contrato)

**Files:**
- Modify: `backend/models/centerline.py` (tras `CenterlineResult`)
- Modify: `backend/routers/centerline.py` (tras `get_centerline`)
- Create: `backend/test_centerline_points.py`
- Regenerate: `frontend/openapi.json`, `frontend/src/api/schema.gen.ts`
- Modify: `frontend/src/api/types.ts:124` (tras `CenterlineResult`), `frontend/src/api/client.ts:412` (tras `getCenterline`), `frontend/src/api/contract.check.ts:38`

**Interfaces:**
- Produces: `GET /api/centerline/{session_id}/points → CenterlinePoints { points: Position3D[]; radii_mm: number[]; arc_mm: number[] }` (404 sin sesión o sin línea central; 409 si el `npz` es ilegible o tiene < 2 puntos); `api.centerlinePoints(sessionId): Promise<CenterlinePoints>`; TS `interface CenterlinePoints`.

- [x] **Step 1: Prueba del endpoint**

`backend/test_centerline_points.py`:

```python
"""Los puntos de la línea central (spec §7.1): el cliente los recorre y la gráfica de calibre lleva a ellos."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_clp_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.database import Base, engine
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _session_with_points(pts, radii) -> str:
    sid = create_session()
    np.savez(session_subdir(sid, "meshes") / "centerline_points.npz",
             points=np.asarray(pts, dtype=np.float32), radii=np.asarray(radii, dtype=np.float32))
    return sid


def test_devuelve_puntos_radios_y_arco_acumulado():
    sid = _session_with_points([[0, 0, 0], [0, 0, 1], [0, 0, 3]], [1.0, 1.5, 2.0])
    r = client.get(f"/api/centerline/{sid}/points")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["points"] == [{"x": 0, "y": 0, "z": 0}, {"x": 0, "y": 0, "z": 1}, {"x": 0, "y": 0, "z": 3}]
    assert body["radii_mm"] == [1.0, 1.5, 2.0]
    assert body["arc_mm"] == [0.0, 1.0, 3.0]


def test_sin_linea_central_404():
    sid = create_session()
    assert client.get(f"/api/centerline/{sid}/points").status_code == 404


def test_sesion_inexistente_404():
    assert client.get("/api/centerline/no-existe/points").status_code == 404


def test_menos_de_dos_puntos_409():
    sid = _session_with_points([[0, 0, 0]], [1.0])
    assert client.get(f"/api/centerline/{sid}/points").status_code == 409


def test_sin_usuario_401():
    sid = _session_with_points([[0, 0, 0], [0, 0, 1]], [1.0, 1.0])
    assert anonymous_client(app).get(f"/api/centerline/{sid}/points").status_code == 401
```

- [x] **Step 2: Ejecutar y ver fallar**

Run: `cd backend && .venv/Scripts/python -m pytest test_centerline_points.py -q`
Expected: FAIL (404 donde se espera 200; la ruta no existe aún).

- [x] **Step 3: Modelo y endpoint**

`backend/models/centerline.py`, tras `CenterlineResult`:

```python
class CenterlinePoints(BaseModel):
    """The resampled medial-axis points the extraction saved, for the client to walk along."""

    points: list[Position3D] = Field(..., description="Centreline points (mm, volume frame), ~0.5 mm apart")
    radii_mm: list[float] = Field(..., description="Local vessel radius at each point (mm)")
    arc_mm: list[float] = Field(..., description="Cumulative arc length at each point, starting at 0 (mm)")
```

`backend/routers/centerline.py`: añade `CenterlinePoints` al import de `models.centerline` y `from models.detection import Position3D`; tras `get_centerline`:

```python
@router.get(
    "/centerline/{session_id}/points",
    response_model=CenterlinePoints,
    summary="The centreline points, radii and arc positions",
    description=(
        "The medial-axis points `centerline_points.npz` holds, so the client can walk "
        "the vessel section by section and the calibre chart can lead to a position. "
        "404 when no centreline was extracted; 409 when the file is unreadable or degenerate."
    ),
)
async def get_centerline_points(session_id: str) -> CenterlinePoints:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    points_path = session_subdir(session_id, "meshes") / "centerline_points.npz"
    if not points_path.exists():
        raise HTTPException(status_code=404, detail="No hay línea central extraída.")
    try:
        with np.load(points_path) as data:
            pts = data["points"].astype(float)
            radii = data["radii"].astype(float)
    except Exception as exc:  # noqa: BLE001 — un fichero dañado no es un 500
        raise HTTPException(status_code=409, detail=f"centerline_points.npz ilegible: {exc}")
    if len(pts) < 2 or len(radii) != len(pts):
        raise HTTPException(status_code=409, detail="La línea central tiene menos de dos puntos.")
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return CenterlinePoints(
        points=[Position3D(x=round(float(p[0]), 2), y=round(float(p[1]), 2), z=round(float(p[2]), 2)) for p in pts],
        radii_mm=[round(float(r), 3) for r in radii],
        arc_mm=[round(float(a), 2) for a in arc],
    )
```

Run: `cd backend && .venv/Scripts/python -m pytest test_centerline_points.py -q` → 5 passed.

- [x] **Step 4: Regenerar el contrato y tipar el cliente**

```bash
cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json && cd ../frontend && npm run gen:api
```

`frontend/src/api/types.ts`, tras `CenterlineResult`:
```ts
/** Puntos de la línea central (marco del volumen, mm), con radio y arco acumulado. */
export interface CenterlinePoints {
  points: Position3D[];
  radii_mm: number[];
  arc_mm: number[];
}
```
`frontend/src/api/client.ts`, tras `getCenterline`:
```ts
  /** Los puntos de la línea central, para recorrerla y para que la gráfica lleve a ellos. */
  centerlinePoints: (sessionId: string) =>
    get<CenterlinePoints>(`/api/centerline/${sessionId}/points`),
```
(añade `CenterlinePoints` al import de tipos). `frontend/src/api/contract.check.ts`, junto a la línea de `CenterlineResult`:
```ts
  Cabe<Completo<S["CenterlinePoints"]>, ui.CenterlinePoints>,
```

- [x] **Step 5: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && cd ../backend && .venv/Scripts/python -m pytest test_openapi_contract.py -q && .venv/Scripts/python -m pytest test_centerline.py -q`
Expected: tsc limpio; contract y centerline verdes (si `test_centerline.py` falla por entorno vtk, comprueba que falla igual en master: `git stash; pytest …; git stash pop`).

```bash
git add backend/models/centerline.py backend/routers/centerline.py backend/test_centerline_points.py frontend/openapi.json frontend/src/api/schema.gen.ts frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/contract.check.ts
git commit -m "GET /api/centerline/{sid}/points: los puntos de la línea central llegan al cliente

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 8: La gráfica de calibre lleva al sitio

**Files:**
- Create: `frontend/src/vtk/centerlineWalk.ts`, `frontend/src/vtk/centerlineWalk.test.ts`
- Modify: `frontend/src/store/planning.tsx` (`centerline`, `setCenterline`; limpieza)
- Modify: `frontend/src/components/vessels/DiameterChart.tsx`
- Create: `frontend/src/components/vessels/DiameterChart.test.tsx`
- Modify: `frontend/src/components/vessels/CenterlinePanel.tsx`, `CenterlinePanel.test.tsx`

**Interfaces:**
- Consumes: `api.centerlinePoints`, `CenterlinePoints` (Tarea 7); `planeFromNormal` (Tarea 4); `useVolumeMeta`; store `focusPoint`, `setFocusMm(mm, meta)`, `setFreePlane`.
- Produces: store `export interface CenterlineTrack { points: Vec3[]; radiiMm: number[]; arcMm: number[] }`, `centerline: CenterlineTrack | null`, `setCenterline(t: CenterlineTrack | null)`; `trackFromWire(w: CenterlinePoints): CenterlineTrack`; `tangentAt(points: Vec3[], i: number): Vec3`; `indexAtArc(arcMm: number[], mm: number): number`; `nearestIndex(points: Vec3[], p: Vec3): { index: number; distMm: number }`; `DiameterChart` props `onPick?(arcMm: number)`, `cursorArcMm?: number | null`.

- [x] **Step 1: Pruebas puras**

`frontend/src/vtk/centerlineWalk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { indexAtArc, nearestIndex, tangentAt, trackFromWire } from "./centerlineWalk";
import type { Vec3 } from "./geometry";

const pts: Vec3[] = [[0, 0, 0], [0, 0, 1], [0, 1, 2], [0, 2, 2]];
const arc = [0, 1, 1 + Math.SQRT2, 2 + Math.SQRT2];

describe("centerlineWalk", () => {
  it("tangentAt usa diferencias centradas y unilaterales en los extremos, unitarias", () => {
    expect(tangentAt(pts, 0)).toEqual([0, 0, 1]);
    const t1 = tangentAt(pts, 1);   // (p2 − p0) normalizado = (0, 1, 2)/√5
    expect(t1[1]).toBeCloseTo(1 / Math.sqrt(5), 9); expect(t1[2]).toBeCloseTo(2 / Math.sqrt(5), 9);
    expect(tangentAt(pts, 3)).toEqual([0, 1, 0]);
  });
  it("con un solo punto la tangente es +z", () => {
    expect(tangentAt([[1, 1, 1]], 0)).toEqual([0, 0, 1]);
  });
  it("indexAtArc devuelve el índice del arco más cercano, acotado", () => {
    expect(indexAtArc(arc, 0)).toBe(0); expect(indexAtArc(arc, 1.1)).toBe(1);
    expect(indexAtArc(arc, 2.3)).toBe(2); expect(indexAtArc(arc, 99)).toBe(3); expect(indexAtArc(arc, -5)).toBe(0);
  });
  it("nearestIndex da el punto más cercano y la distancia", () => {
    expect(nearestIndex(pts, [0, 0.9, 2.1])).toEqual({ index: 2, distMm: expect.closeTo(Math.hypot(0.1, 0.1), 9) });
  });
  it("trackFromWire convierte Position3D en Vec3", () => {
    const t = trackFromWire({ points: [{ x: 1, y: 2, z: 3 }], radii_mm: [1.5], arc_mm: [0] });
    expect(t).toEqual({ points: [[1, 2, 3]], radiiMm: [1.5], arcMm: [0] });
  });
});
```

- [x] **Step 2: Implementar `centerlineWalk.ts`**

```ts
/* Recorrer la línea central (spec §7): dónde está cada punto, hacia dónde va
   el vaso allí y a qué punto corresponde una posición de la gráfica. Puro. */
import type { CenterlinePoints } from "../api/types";
import type { Vec3 } from "./geometry";

export interface CenterlineTrack { points: Vec3[]; radiiMm: number[]; arcMm: number[] }

export function trackFromWire(w: CenterlinePoints): CenterlineTrack {
  return { points: w.points.map((p): Vec3 => [p.x, p.y, p.z]), radiiMm: [...w.radii_mm], arcMm: [...w.arc_mm] };
}

const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return l < 1e-9 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l]; };

/** Dirección del vaso en el punto i: diferencias centradas (más suave que la
 *  hacia delante), unilaterales en los extremos; +z si no hay con qué. */
export function tangentAt(points: Vec3[], i: number): Vec3 {
  const n = points.length;
  if (n < 2) return [0, 0, 1];
  const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
  return unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
}

/** El índice cuyo arco está más cerca de `mm` (búsqueda binaria; `arcMm` crece). */
export function indexAtArc(arcMm: number[], mm: number): number {
  let lo = 0, hi = arcMm.length - 1;
  if (hi < 0) return 0;
  if (mm <= arcMm[0]) return 0;
  if (mm >= arcMm[hi]) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arcMm[mid] <= mm) lo = mid; else hi = mid; }
  return mm - arcMm[lo] <= arcMm[hi] - mm ? lo : hi;
}

export function nearestIndex(points: Vec3[], p: Vec3): { index: number; distMm: number } {
  let index = 0, best = Infinity;
  points.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < best) { best = d; index = i; } });
  return { index, distMm: best };
}
```

Run: `cd frontend && npx vitest run src/vtk/centerlineWalk.test.ts` → PASS.

- [x] **Step 3: Store**

`frontend/src/store/planning.tsx`:
- Import `type CenterlineTrack` desde `../vtk/centerlineWalk` y reexpórtalo: `export type { CenterlineTrack };`.
- Interfaz, junto a `centerlineMesh`: 
```ts
  /** Los puntos de la línea central (spec §7): la gráfica de calibre lleva a
   *  ellos y el cine del Oblicuo los recorre. null hasta que se piden. */
  centerline: CenterlineTrack | null;
  setCenterline: (t: CenterlineTrack | null) => void;
```
- Estado: `const [centerline, setCenterline] = useState<CenterlineTrack | null>(null);`
- `setCenterlineMesh`: pasa de `touch(_setCenterlineMesh)` a 
```ts
  // Sin tubo no hay puntos: quien quita la malla (descartar, recortar, resegmentar) quita el recorrido.
  const setCenterlineMesh = touch((url: string | null) => { _setCenterlineMesh(url); if (!url) setCenterline(null); });
```
  (`touch` es `<T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); }`, `planning.tsx:554`: acepta cualquier función, no solo un setter).
- `resetDownstream`: `setCenterline(null);` junto a `_setCenterlineMesh(null)`.
- Value: `centerline, setCenterline`.

Prueba en `planning.test.tsx`:
```ts
describe("la línea central recorrible", () => {
  const track = { points: [[0, 0, 0], [0, 0, 1]] as Vec3[], radiiMm: [1, 1], arcMm: [0, 1] };
  it("se guarda y se va con el tubo", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper });
    act(() => { result.current.setCenterlineMesh("/cl.vtp"); result.current.setCenterline(track); });
    expect(result.current.centerline).toEqual(track);
    act(() => result.current.setCenterlineMesh(null));
    expect(result.current.centerline).toBeNull();
  });
  it("resetDownstream la olvida", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper });
    act(() => result.current.setCenterline(track));
    act(() => result.current.resetDownstream());
    expect(result.current.centerline).toBeNull();
  });
});
```

- [x] **Step 4: `DiameterChart` clicable: prueba**

`frontend/src/components/vessels/DiameterChart.test.tsx`:

```tsx
/* La gráfica de calibre enseñaba dónde se estrecha el vaso y no llevaba allí (spec §7.2). */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiameterChart } from "./DiameterChart";

const arc = [0, 10, 20, 30, 40], d = [3, 3.2, 2.1, 3.1, 3];

function chart(onPick = vi.fn(), cursor: number | null = null) {
  const { container } = render(<DiameterChart arc={arc} diameters={d} meanDiameter={2.9} onPick={onPick} cursorArcMm={cursor} />);
  const svg = container.querySelector("svg")!;
  // viewBox 320×150; el área del trazado va de x=30 a x=310.
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 150, right: 320, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
  return { svg, onPick };
}

describe("DiameterChart", () => {
  it("un clic en el trazado llama a onPick con la posición en mm", () => {
    const { svg, onPick } = chart();
    fireEvent.click(svg, { clientX: 170, clientY: 60 });   // mitad del área → 20 mm
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBeCloseTo(20, 5);
  });
  it("fuera del área se acota a los extremos", () => {
    const { svg, onPick } = chart();
    fireEvent.click(svg, { clientX: 2, clientY: 60 });
    expect(onPick).toHaveBeenLastCalledWith(0);
    fireEvent.click(svg, { clientX: 318, clientY: 60 });
    expect(onPick).toHaveBeenLastCalledWith(40);
  });
  it("dibuja el cursor donde está el foco", () => {
    const { svg } = chart(vi.fn(), 20);
    expect(svg.querySelector('[data-t="cursor"]')).not.toBeNull();
    expect(chart(vi.fn(), null).svg.querySelector('[data-t="cursor"]')).toBeNull();
  });
  it("← y → mueven una muestra desde el cursor", () => {
    const { svg, onPick } = chart(vi.fn(), 20);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(onPick).toHaveBeenLastCalledWith(30);
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(onPick).toHaveBeenLastCalledWith(10);
  });
  it("sin onPick sigue siendo una imagen", () => {
    const { container } = render(<DiameterChart arc={arc} diameters={d} meanDiameter={2.9} />);
    expect(container.querySelector("svg")!.getAttribute("tabindex")).toBeNull();
  });
});
```

- [x] **Step 5: Implementar en `DiameterChart.tsx`**

Cambia la firma y el `<svg>`:

```tsx
export function DiameterChart({ arc, diameters, meanDiameter, onPick, cursorArcMm = null }: {
  arc: number[]; diameters: number[]; meanDiameter: number;
  /** Clic o flechas sobre el trazado: posición en mm a lo largo del vaso (spec §7.2). */
  onPick?: (arcMm: number) => void;
  /** Dónde está el punto compartido sobre el vaso; null si no está sobre él. */
  cursorArcMm?: number | null;
}) {
  …(cálculos existentes)…
  // De píxeles de pantalla a mm: el viewBox es fijo, así que el ancho real escala x.
  const mmAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / (r.width || 1)) * W;
    const f = Math.min(1, Math.max(0, (vx - P.l) / iw));
    return x0 + f * (x1 - x0);
  };
  const cursorIdx = cursorArcMm === null ? minIdx : arc.reduce((b, a, i) => (Math.abs(a - cursorArcMm) < Math.abs(arc[b] - cursorArcMm) ? i : b), 0);
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    onPick(arc[Math.max(0, Math.min(arc.length - 1, cursorIdx + d))]);
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role={onPick ? "slider" : "img"} aria-label="Perfil de diámetro"
      aria-valuemin={x0} aria-valuemax={x1} aria-valuenow={cursorArcMm ?? undefined}
      tabIndex={onPick ? 0 : undefined} onClick={onPick ? (e) => onPick(mmAt(e)) : undefined} onKeyDown={onKey}
      style={{ display: "block", marginTop: 8, cursor: onPick ? "crosshair" : undefined }}>
      …(frame, media, trazado, punto más estrecho, ticks, rótulo como hoy)…
      {/* El punto compartido sobre el vaso. */}
      {cursorArcMm !== null && (
        <line data-t="cursor" x1={sx(cursorArcMm)} y1={P.t} x2={sx(cursorArcMm)} y2={P.t + ih} stroke="var(--brand)" strokeWidth={1.5} strokeDasharray="2 2" />
      )}
    </svg>
  );
}
```

Run: `cd frontend && npx vitest run src/components/vessels/DiameterChart.test.tsx` → PASS.

- [x] **Step 6: `CenterlinePanel`: cargar los puntos y responder a la gráfica**

En `frontend/src/components/vessels/CenterlinePanel.tsx`:
- Imports: `useVolumeMeta` (`../../vtk/useVolumeMeta`), `indexAtArc, nearestIndex, tangentAt, trackFromWire` (`../../vtk/centerlineWalk`), `planeFromNormal` (`../../vtk/freePlane`).
- Destructura además `centerline, setCenterline, focusPoint, setFocusMm, setFreePlane, volumeVersion` de `usePlanning()`.
- `const { meta } = useVolumeMeta(sessionId, volumeVersion);`
- Carga de puntos, junto al efecto que pide las métricas al reanudar:
```ts
  // Los puntos se piden cuando hay tubo y aún no están: tras extraer y tras «Reanudar».
  useEffect(() => {
    if (!sessionId || !centerlineMesh || centerline) return;
    let vivo = true;
    api.centerlinePoints(sessionId).then((w) => { if (vivo) setCenterline(trackFromWire(w)); }).catch(() => { /* sin puntos la gráfica no lleva a ningún sitio; lo demás sigue */ });
    return () => { vivo = false; };
  }, [sessionId, centerlineMesh, centerline, setCenterline]);
```
- En `extract`, tras `setCenterlineMesh(res.centerline_mesh_url)`: `setCenterline(null);` (fuerza la recarga de los puntos nuevos). En `clear`: `setCenterline(null);` ya lo hace `setCenterlineMesh(null)`.
- Antes del `return`:
```ts
  // Clic en la gráfica: el punto compartido va a esa sección y el Oblicuo
  // queda perpendicular al vaso allí (spec §7.2).
  const irA = (mm: number) => {
    if (!centerline || !meta) return;
    const i = indexAtArc(centerline.arcMm, mm);
    setFocusMm(centerline.points[i], meta);
    setFreePlane(planeFromNormal(tangentAt(centerline.points, i)));
  };
  const cursor = (() => {
    if (!centerline || !focusPoint) return null;
    const n = nearestIndex(centerline.points, focusPoint);
    return n.distMm <= 2 ? centerline.arcMm[n.index] : null;
  })();
```
- `<DiameterChart … onPick={centerline && meta ? irA : undefined} cursorArcMm={cursor} />`.

Actualiza `CenterlinePanel.test.tsx`: al mock del store añade `centerline: null, setCenterline: vi.fn(), focusPoint: null, setFocusMm: vi.fn(), setFreePlane: vi.fn(), volumeVersion: 0`; al mock de `api` añade `centerlinePoints: vi.fn().mockResolvedValue({ points: [], radii_mm: [], arc_mm: [] })`; mockea `../../vtk/useVolumeMeta` → `({ useVolumeMeta: () => ({ meta: null, forSession: null }) })`. Añade una prueba:
```ts
  it("con el tubo en el visor pide también los puntos", async () => {
    render(<CenterlinePanel />);
    await waitFor(() => expect(planning.setCenterline).toHaveBeenCalledWith({ points: [], radiiMm: [], arcMm: [] }));
  });
```
(`centerlinePoints` debe ser un `vi.fn` accesible desde el test, como `getCenterline`).

- [x] **Step 7: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/centerlineWalk.test.ts src/components/vessels src/store/planning.test.tsx`
Expected: PASS.

```bash
git add frontend/src/vtk/centerlineWalk.ts frontend/src/vtk/centerlineWalk.test.ts frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/components/vessels/DiameterChart.tsx frontend/src/components/vessels/DiameterChart.test.tsx frontend/src/components/vessels/CenterlinePanel.tsx frontend/src/components/vessels/CenterlinePanel.test.tsx
git commit -m "La gráfica de calibre lleva al sitio: clic o flechas mueven el punto y el Oblicuo se pone perpendicular al vaso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 9: Cine por el vaso («RECORRIDO ▸ PLANO · VASO»)

**Files:**
- Modify: `frontend/src/vtk/centerlineWalk.ts`, `centerlineWalk.test.ts` (`stepTrackIndex`)
- Modify: `frontend/src/vtk/obliqueGestures.ts`, `obliqueGestures.test.ts` (`vesselReadout`)
- Modify: `frontend/src/store/planning.tsx` (`obliqueWalk`)
- Modify: `frontend/src/vtk/Viewer.tsx:75-76` (`CineTarget`), `:907-970` (`cineTarget`, `cineMove`, `cinePosition`), montaje de `ObliqueView`
- Modify: `frontend/src/vtk/ObliqueView.tsx` (props `walk`, `onWalkChange`, `onStep`; lectura; grupo RECORRIDO)
- Modify: `frontend/src/vtk/copy.test.ts`

**Interfaces:**
- Consumes: store `centerline` (Tarea 8), `tangentAt`, `nearestIndex`, `planeFromNormal`, `applyStep`, `nextIndex`.
- Produces: `stepTrackIndex(track: CenterlineTrack, currentMm: Vec3, lastIndex: number | null, toleranceMm: number): number` (índice vigente: el guardado si el foco sigue sobre su punto, el más cercano si no); `vesselReadout(index: number, count: number, diameterMm: number): string`; store `obliqueWalk: "plano" | "vaso"`, `setObliqueWalk`; `CineTarget` gana `{ kind: "vessel" }`; `ObliqueView` props `walk?: { mode: "plano" | "vaso"; index: number; count: number; diameterMm: number } | null`, `onWalkChange?: (m: "plano" | "vaso") => void`, `onStep?: (step: number) => void`.

- [x] **Step 1: Pruebas puras**

`centerlineWalk.test.ts`, añade:
```ts
describe("stepTrackIndex (Review Focus 5)", () => {
  const track = { points: [[0, 0, 0], [0, 0, 0.5], [0, 0, 1], [0, 0, 1.5]] as Vec3[], radiiMm: [1, 1, 1, 1], arcMm: [0, 0.5, 1, 1.5] };
  it("si el foco sigue sobre el punto guardado (a menos de la tolerancia), manda el índice guardado y no el más cercano", () => {
    // Vóxel de 1 mm: el punto 1 (z=0,5) se redondea a z=1, que está igual de cerca del punto 2.
    expect(stepTrackIndex(track, [0, 0, 1], 1, 1)).toBe(1);
  });
  it("si el foco se fue a otro sitio, se recalcula el más cercano", () => {
    expect(stepTrackIndex(track, [0, 0, 1.5], 0, 0.6)).toBe(3);
    expect(stepTrackIndex(track, [0, 0, 1.5], null, 0.6)).toBe(3);
  });
});
```
`obliqueGestures.test.ts`, añade:
```ts
describe("vesselReadout", () => {
  it("índice 1-based y diámetro con coma", () => {
    expect(vesselReadout(36, 120, 3.14)).toBe("VASO 37/120 · Ø 3,1 mm");
  });
});
```

- [x] **Step 2: Implementar**

`centerlineWalk.ts`:
```ts
/** Índice vigente del recorrido. El redondeo a vóxel puede dejar el foco tan
 *  cerca del punto siguiente como del propio: con el espaciado por encima del
 *  paso de la línea (0,5 mm) el «más cercano» oscilaría y el cine se pegaría.
 *  Por eso manda el índice guardado mientras el foco siga sobre su punto. */
export function stepTrackIndex(track: CenterlineTrack, currentMm: Vec3, lastIndex: number | null, toleranceMm: number): number {
  if (lastIndex !== null && lastIndex >= 0 && lastIndex < track.points.length) {
    const p = track.points[lastIndex];
    if (Math.hypot(p[0] - currentMm[0], p[1] - currentMm[1], p[2] - currentMm[2]) <= toleranceMm) return lastIndex;
  }
  return nearestIndex(track.points, currentMm).index;
}
```
`obliqueGestures.ts`:
```ts
/** Lectura del Oblicuo recorriendo el vaso: sección 1-based y calibre local. */
export function vesselReadout(index: number, count: number, diameterMm: number): string {
  return `VASO ${index + 1}/${count} · Ø ${diameterMm.toFixed(1).replace(".", ",")} mm`;
}
```
Run: `cd frontend && npx vitest run src/vtk/centerlineWalk.test.ts src/vtk/obliqueGestures.test.ts` → PASS.

- [x] **Step 3: Store**

`planning.tsx`: `obliqueWalk: "plano" | "vaso"; setObliqueWalk: (m: "plano" | "vaso") => void;` (doc: «Qué recorre el cine del Oblicuo: el desplazamiento del plano o los puntos de la línea central (spec §7.3)»), `useState<"plano" | "vaso">("plano")`, vuelve a `"plano"` en `reset()` y dentro de `setCenterline` cuando recibe `null` (envuelve: `const setCenterline = (t: CenterlineTrack | null) => { _setCenterline(t); if (!t) setObliqueWalk("plano"); };`). Value: `obliqueWalk, setObliqueWalk`. Prueba en `planning.test.tsx`:
```ts
  it("al perder la línea central el recorrido vuelve a PLANO", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper });
    act(() => { result.current.setCenterline(track); result.current.setObliqueWalk("vaso"); });
    act(() => result.current.setCenterline(null));
    expect(result.current.obliqueWalk).toBe("plano");
  });
```

- [x] **Step 4: `Viewer`: el cine recorre el vaso**

En `Viewer.tsx`:
- `type CineTarget = { kind: "axis"; axis: "x" | "y" | "z" } | { kind: "free" } | { kind: "vessel" };`
- Destructura `centerline, obliqueWalk, setObliqueWalk` del store; imports `stepTrackIndex, tangentAt` (`./centerlineWalk`), `planeFromNormal` (ya importado en Tarea 5), `voxelToMm, mmToVoxel` (`./geometry`, comprueba cuáles ya están).
- Refs: `const centerlineRef = useRef(centerline); centerlineRef.current = centerline;` y `const trackIndexRef = useRef<number | null>(null);`.
- `cineTarget`, rama `scene`:
```ts
    if (pane === "scene") {
      if (!(viewMode === "oblique" && !legacy && clientVol.image)) return null;
      return centerline && obliqueWalk === "vaso" ? { kind: "vessel" } : { kind: "free" };
    }
```
- Antes de `cineMove`:
```ts
  /** Lleva el punto compartido al punto i de la línea central y pone el plano
   *  libre perpendicular al vaso allí. Adelantado al render, como el eje. */
  const goToTrackIndex = (i: number) => {
    const t = centerlineRef.current, m = metaRef.current; if (!t || !m) return;
    const v = mmToVoxel(t.points[i], m);
    mprVoxelRef.current = v; setMprVoxel(v);
    const fp = planeFromNormal(tangentAt(t.points, i));
    freePlaneRef.current = fp; setFreePlane(fp);
    trackIndexRef.current = i;
  };
  const currentTrackIndex = (): number | null => {
    const t = centerlineRef.current, m = metaRef.current; if (!t || !m) return null;
    return stepTrackIndex(t, voxelToMm(mprVoxelRef.current, m), trackIndexRef.current, Math.max(1, ...m.spacing));
  };
```
- En `cineMove`, tras la rama `axis`:
```ts
    if (t.kind === "vessel") {
      const track = centerlineRef.current; if (!track) return false;
      const count = track.points.length, i = currentTrackIndex() ?? 0;
      const next = bounce ? nextIndex(i, dir, count, true) : { index: applyStep(i, dir, count), dir };
      if (bounce) cineDirRef.current = next.dir;
      if (next.index !== i) goToTrackIndex(next.index);
      return true;
    }
```
- En `cinePosition`, tras la rama `axis`:
```ts
    if (t.kind === "vessel") { const track = centerline!; return { index: currentTrackIndex() ?? 0, count: track.points.length }; }
```
- Montaje de `ObliqueView` (línea ~1667): añade
```tsx
              walk={centerline ? { mode: obliqueWalk, index: cinePosition("scene")?.index ?? 0, count: centerline.points.length,
                                   diameterMm: 2 * (centerline.radiiMm[cinePosition("scene")?.index ?? 0] ?? 0) } : null}
              onWalkChange={setObliqueWalk}
              onStep={obliqueWalk === "vaso" && centerline ? (step) => { const i = currentTrackIndex() ?? 0; goToTrackIndex(applyStep(i, step, centerline.points.length)); } : undefined}
```
  (calcula `cinePosition("scene")` una vez en una `const` antes del JSX para no repetirlo).

- [x] **Step 5: `ObliqueView`: controles y lectura**

Props nuevas (documentadas):
```ts
  /** Recorrido del cine: PLANO (desplazamiento) o VASO (puntos de la línea central). null sin línea central. */
  walk?: { mode: "plano" | "vaso"; index: number; count: number; diameterMm: number } | null;
  onWalkChange?: (m: "plano" | "vaso") => void;
  /** En VASO, las teclas de corte avanzan por los puntos; lo resuelve el visor. */
  onStep?: (step: number) => void;
```
- Import `vesselReadout` desde `./obliqueGestures`.
- En el `onKeyDown` del Oblicuo (busca `stepFromKey`): si `walk?.mode === "vaso" && onStep` → `onStep(step)` en lugar de mover el offset.
- Lectura: `<HudReadout at="bl" lines={[walk?.mode === "vaso" ? vesselReadout(walk.index, walk.count, walk.diameterMm) : obliqueReadout(freePlane)]} />`.
- En la fila `hud-controls`, antes de ENCUADRAR/AL PUNTO:
```tsx
        {walk && onWalkChange && (
          <HudToggleGroup label="RECORRIDO ▸"
            options={[{ key: "plano", label: "PLANO", title: "El cine desplaza el plano libre" }, { key: "vaso", label: "VASO", title: "El cine recorre la línea central, con el corte perpendicular al vaso" }]}
            value={walk.mode} onChange={(k) => onWalkChange(k as "plano" | "vaso")} />
        )}
```
- `copy.test.ts`: añade `it("el Oblicuo ofrece RECORRIDO ▸ PLANO · VASO", () => { const src = readFileSync(join(root, "vtk", "ObliqueView.tsx"), "utf8"); expect(src).toMatch(/label="RECORRIDO ▸"/); expect(src).toMatch(/label:\s*"VASO"/); });`.

- [x] **Step 6: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/vtk/centerlineWalk.test.ts src/vtk/obliqueGestures.test.ts src/vtk/cine.test.ts src/store/planning.test.tsx src/vtk/copy.test.ts`
Expected: PASS.

```bash
git add frontend/src/vtk/centerlineWalk.ts frontend/src/vtk/centerlineWalk.test.ts frontend/src/vtk/obliqueGestures.ts frontend/src/vtk/obliqueGestures.test.ts frontend/src/store/planning.tsx frontend/src/store/planning.test.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/ObliqueView.tsx frontend/src/vtk/copy.test.ts
git commit -m "Cine por el vaso: RECORRIDO ▸ VASO recorre la línea central con el Oblicuo perpendicular

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 10: Duplicados: una caja, una edad, un «Centrar en la lesión» (tecla L)

**Files:**
- Modify: `frontend/src/components/segmentation/MeshEditTools.tsx:19-21,205-215,600-607`, `MeshEditTools.test.tsx`
- Modify: `frontend/src/store/planning.tsx` (quitar `cropShape`), `frontend/src/vtk/Viewer.tsx:226,1174-1177`
- Create: `frontend/src/components/patientAge.ts`, `frontend/src/components/patientAge.test.ts`
- Modify: `frontend/src/components/morphometry/PhasesCalculator.tsx`, `ElapssCalculator.tsx`, `UiatsCalculator.tsx`, `frontend/src/components/planning/TreatmentPanel.tsx`
- Create: `frontend/src/components/morphometry/PhasesCalculator.test.tsx`
- Delete: `frontend/src/components/CenterOnLesionButton.tsx`; Modify: `MorphometryPanel.tsx:8,120`, `DevicesPanel.tsx:31,1714`
- Modify: `frontend/src/vtk/shortcuts.ts`, `shortcuts.test.ts`, `frontend/src/pages/Workspace.tsx:36`, `frontend/src/vtk/Viewer.tsx` (`onShortcut`), `README.md` (tabla de atajos)

**Interfaces:**
- Produces: `ageFromDob(dob?: string | null): string` en `components/patientAge.ts`; atajo `center-lesion` (L); `UiatsCalculator` deja de exportar `edadDesde`.

- [x] **Step 1: Una caja**

`MeshEditTools.tsx`: quita `cropShape: shape, setCropShape: setShape` de la destructuración; en `runCrop` → `mode: "sphere"`; borra el `div` con los botones «Esfera»/«Caja» y deja `<Slider label="Radio" …>`. Añade bajo el texto de la tarjeta de ROI: «Para recortar por una caja con los seis límites a la vista, usa la «Caja de recorte» de abajo.» Comentario de cabecera del archivo: «· Recortar malla por ROI esférico (POST /api/mesh-crop; la caja la hace «Caja de recorte»)».

Store: elimina `cropShape`, `setCropShape` (interfaz, estado y value). `Viewer.tsx`: quita `cropShape` de la destructuración y en `cropPreview` pon `shape: "sphere"` (y actualiza sus dependencias).

Prueba en `MeshEditTools.test.tsx`, montando el panel exactamente como lo hacen las pruebas vecinas (copia su `render(...)` con `PlanningProvider` y la segmentación falsa):
```ts
  it("el recorte por ROI es solo esférico: no hay botón «Caja» y sí la remisión a la caja de recorte", async () => {
    // (mismo montaje que la prueba anterior)
    expect(await screen.findByText("Caja de recorte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Caja" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Esfera" })).toBeNull();
    expect(screen.getByText(/usa la «Caja de recorte» de abajo/)).toBeInTheDocument();
  });
```
y comprueba que la prueba existente de la caja (`req.mode` → `"box"`, línea ~207) sigue verde: esa es la «Caja de recorte», que no cambia.

- [x] **Step 2: Una edad**

`frontend/src/components/patientAge.ts`:
```ts
/* La edad del paciente a partir de su fecha de nacimiento, una sola vez para
   Decisión, PHASES, ELAPSS y UIATS (spec §8). "" si no hay fecha o no vale. */
export function ageFromDob(dob?: string | null): string {
  if (!dob) return "";
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years <= 120 ? String(years) : "";
}
```
`patientAge.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ageFromDob } from "./patientAge";
const iso = (d: Date) => d.toISOString().slice(0, 10);
describe("ageFromDob", () => {
  it("resta un año si el cumpleaños no ha llegado", () => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 45); d.setDate(d.getDate() + 3);
    expect(ageFromDob(iso(d))).toBe("44");
    const e = new Date(); e.setFullYear(e.getFullYear() - 45); e.setDate(e.getDate() - 3);
    expect(ageFromDob(iso(e))).toBe("45");
  });
  it("sin fecha, inválida o imposible devuelve vacío", () => {
    expect(ageFromDob(undefined)).toBe(""); expect(ageFromDob("ayer")).toBe(""); expect(ageFromDob("2999-01-01")).toBe("");
  });
});
```
Sustituciones: `TreatmentPanel.tsx` borra su `ageFromDob` local e importa `{ ageFromDob } from "../patientAge"`. `UiatsCalculator.tsx` borra `export function edadDesde` e importa `ageFromDob` (usa `ageFromDob(dob)`). `ElapssCalculator.tsx`: `import { ageFromDob } from "../patientAge";` y `useState(ageFromDob(dob))` (sin `|| "60"`: la edad es un dato, no un valor inventado; deshabilita su botón de calcular con `!age` como hace UIATS). `PhasesCalculator.tsx`: `useState(ageFromDob(planning.patient?.dob))` y el botón de calcular `disabled={busy || !age}`.

`PhasesCalculator.test.tsx`:
```tsx
/* PHASES partía de una edad inventada («60»); ahora de la del paciente, y sin ella no calcula (spec §8). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));
vi.mock("../../api/client", () => ({ api: { phases: vi.fn() } }));
import { PhasesCalculator } from "./PhasesCalculator";

describe("PHASES y la edad", () => {
  it("rellena la edad desde la fecha de nacimiento", () => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 61); d.setDate(d.getDate() - 2);
    planning = { patient: { dob: d.toISOString().slice(0, 10) } };
    render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    expect((screen.getByLabelText("Edad (años)") as HTMLInputElement).value).toBe("61");
  });
  it("sin fecha el campo queda vacío y no se puede calcular", () => {
    planning = { patient: null };
    render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    expect((screen.getByLabelText("Edad (años)") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Calcular PHASES" })).toBeDisabled();
  });
});
```
El botón de `PhasesCalculator.tsx:116` pasa a `disabled={busy || !age}`; el de `ElapssCalculator.tsx:98` («Calcular ELAPSS»), igual.

- [x] **Step 3: Un «Centrar en la lesión» y la tecla L**

- Borra `frontend/src/components/CenterOnLesionButton.tsx`; quita su import y `<CenterOnLesionButton />` de `MorphometryPanel.tsx` y `DevicesPanel.tsx`. Ajusta el `marginBottom` del `PanelHead` si el botón aportaba separación (comprueba visualmente en el navegador en la lista manual; si no hay servidores, déjalo).
- `shortcuts.ts`: tras la fila `sync`: `{ id: "center-lesion", keys: "L", action: "Centrar en la lesión (3D y cortes)", scope: "visor" },` y en `matchShortcut`, tras `KeyS`: `if (e.code === "KeyL") return "center-lesion";`. Actualiza el comentario de cabecera (Workspace reenvía también L).
- `shortcuts.test.ts`: `expect(matchShortcut(ev({ key: "l", code: "KeyL" }), null)).toBe("center-lesion");` en la prueba «resuelve …».
- `Workspace.tsx:36`: añade `"center-lesion"` al `Set`.
- `Viewer.tsx` `onShortcut`: `case "center-lesion": if (lesion) centerOnLesion(); return;`.
- `README.md`, tabla de atajos, tras la fila S: `| L | Centrar en la lesión (3D y cortes) | Visor |`.
- `grep -rn "CenterOnLesionButton" frontend/src` debe quedar vacío.

- [x] **Step 4: Verificar y commit**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/components/segmentation/MeshEditTools.test.tsx src/components/patientAge.test.ts src/components/morphometry src/components/planning/TreatmentPanel.test.tsx src/vtk/shortcuts.test.ts src/vtk/hud/ShortcutsSheet.test.tsx src/store/planning.test.tsx`
Expected: PASS.

```bash
git add -A frontend/src/components frontend/src/store/planning.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/shortcuts.ts frontend/src/vtk/shortcuts.test.ts frontend/src/pages/Workspace.tsx README.md
git commit -m "Duplicados fuera: recorte ROI solo esférico, una edad para los cuatro formularios, L centra en la lesión

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

### Task 11: Inventario en el README, suites completas y build

**Files:**
- Modify: `README.md` (sección nueva tras «Atajos de teclado»)
- Modify: `docs/superpowers/plans/2026-10-09-herramientas-clinicas.md` (marcar casillas)

- [x] **Step 1: Sección «Herramientas del visor y de los paneles»**

Inserta tras la tabla de atajos (antes de `## Environment Variables`):

```markdown
## Herramientas del visor y de los paneles

Qué hace cada control y cuándo usarlo. Lo que no está aquí no existe.

### Banda de cabecera
| Herramienta | Qué hace | Cuándo |
|---|---|---|
| PRINCIPAL ▸ 3D · AX · COR · SAG · VOL | Elige la celda grande | Para trabajar en una vista |
| Distribución (Alt+1…4) | SOLA · DERECHA · ABAJO · CUATRO | Según cuántas vistas quieras a la vez |
| SINCRO ●/○ (S) | Centra todas las vistas en el punto compartido | Casi siempre encendido |
| PLANOS ●/○ | Dibuja los rectángulos de los cortes en el 3D | Para situar un corte en el árbol |
| CALOR ●/○ | Mapa de calor del clip sobre la malla | En el paso de dispositivos |
| HUD ▸ COMPLETO · ESENCIAL · LIMPIO (H) | Cuánto HUD se ve | Limpio para capturas y presentaciones |
| ? | Hoja de atajos | — |

### Celda 3D (malla)
| Herramienta | Qué hace | Cuándo |
|---|---|---|
| VISTA ▸ ENCUADRAR · AX · COR · SAG | Cámara estándar; un segundo clic mira la cara opuesta | Perder la orientación al rotar |
| VISTA ▸ LESIÓN (L) | Encuadra la lesión (2,5 × Ø) en el 3D y los cortes | Al medir cuello y ápice, al colocar un dispositivo |
| VISTA ▸ ABORDAJE | Mira a lo largo del corredor y pone el Oblicuo perpendicular a él | Con una trayectoria marcada |
| CORTES 3D · MALLA ●/○ | Los tres cortes dentro del 3D, con o sin malla translúcida | Relacionar imagen y segmentación |
| Marcado (clic) | Puntos de línea central, cuello, ápice, borde, tijera, recorte, lesión, trayectoria, anotaciones | Según el paso |

### Cortes AX · COR · SAG
| Herramienta | Qué hace | Cuándo |
|---|---|---|
| Rueda · flechas · escalera · cine (espacio) | Recorren los cortes | Siempre |
| Arrastrar · W/L (doble clic restablece) · menú de preajustes | Ventana y nivel; «Vasos» sale de la banda de vasos del estudio | Ver el vaso con el contraste correcto |
| R · A · G · T | Regla, ángulo, región, marcador | Medir y anotar; se guardan con la sesión |

### Oblicuo
| Herramienta | Qué hace | Cuándo |
|---|---|---|
| AZIMUT · ELEVACIÓN · botón derecho | Orientan el plano libre (compartido con VOLUMEN y el 3D) | Cortar el vaso en el ángulo que haga falta |
| ENCUADRAR · AL PUNTO | Reencuadra; devuelve el plano al punto compartido | — |
| RECORRIDO ▸ PLANO · VASO | El cine desplaza el plano o recorre la línea central perpendicular al vaso | Inspeccionar el vaso sección a sección |

### VOLUMEN
| Herramienta | Qué hace | Cuándo |
|---|---|---|
| EJE ▸ AX · COR · SAG | Eje de acumulación | — |
| RECORTE ▸ EJE · LIBRE · CARA ●/○ | Recorta por el eje o por el plano libre; pinta la cara del corte | Ver el interior del árbol |
| LOCAL ●/○ | Acota la proyección a la caja de la lesión | Ver el cuello sin que lo tape el resto |
| MIP · COMPUESTO | Proyección de máxima intensidad o composición por tejidos | — |
| Preajustes (VASOS · TODO en angiografía; tejidos en TC) · botón derecho · RESTABLECER | Ventana de la rampa o del preajuste | Contraste de la proyección |
| ACUMULADO · DESDE ▸ INICIO · FINAL · LÁMINA | Hasta el corte, desde el otro extremo, o una lámina alrededor | — |

### Paneles por paso
| Paso | Herramientas |
|---|---|
| Cargar | Paciente y caso, serie, preproceso (recorte HU, reducción) |
| Segmentar | Umbral con vista previa, tubular, borrador, tijera, recorte ROI esférico, caja de recorte, historial |
| Detectar | Candidatos y descartados, confirmar lesión, centrar |
| Morfometría | Cuello y ápice (o borde), medidas, PHASES · ELAPSS · UIATS (edad desde la ficha), seguimiento, línea central y calibre (clic lleva al sitio), perforantes |
| Decisión | Factores y recomendación con fuentes |
| Dispositivos | Trayectoria (ángulo respecto al eje del aneurisma), clips (campo, ensayo, pedido), coils, stents, WEB |
| Fabricación | Paquete de fabricación de la pieza a medida |
| Informe | Capturas, grabaciones, anotaciones, PDF |
```

Revisa cada fila contra el código (un `grep` por etiqueta) y corrige lo que no exista tal cual.

- [x] **Step 2: Suites completas y build**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run build`
Expected: todo verde (anota el número de pruebas y archivos). Backend: `cd backend && .venv/Scripts/python -m pytest test_centerline_points.py -q && .venv/Scripts/python -m pytest test_openapi_contract.py -q && .venv/Scripts/python -m pytest test_corredor_abordaje.py -q` → verdes.

- [x] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-10-09-herramientas-clinicas.md
git commit -m "Cierre de herramientas clínicas (E4): inventario de herramientas en el README; suites y build

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM"
```

---

## Lista manual en el navegador (Case 3, XA; la hace el controlador tras la revisión final)

1. Segmentar y mirar el menú de preajustes de un corte: «Vasos» sigue ahí.
2. VOLUMEN arranca en VASOS; TODO está; no hay «Hueso». Botón derecho en MIP cambia la rampa; la lectura pasa a `NIV · VENT`; doble clic en la lectura y RESTABLECER la devuelven a `UMBRAL · NIV · VENT`.
3. 3D: AX dos veces → inferior; COR dos veces → posterior; SAG dos veces → derecha; rotar a mano y pulsar AX → superior.
4. Marcar entrada y diana → ABORDAJE aparece; la cámara mira por el corredor; el Oblicuo (DERECHA) enseña la sección en la diana.
5. Con lesión: LOCAL ● recorta al cuello en MIP y COMPUESTO; ENCUADRAR encuadra la caja; en RECORTE LIBRE el botón se atenúa.
6. Línea central + «Analizar secciones»: clic en la gráfica mueve el punto y el Oblicuo; la línea del cursor sigue al foco. RECORRIDO ▸ VASO en el Oblicuo: espacio recorre el vaso; la lectura dice `VASO n/N · Ø`.
7. Segmentar: el ROI solo ofrece «Radio». Morfometría: PHASES trae la edad del paciente (o vacío y deshabilitado). L centra en la lesión; sin botones «Centrar en la lesión» en los paneles. Hoja «?» muestra L.
8. HUD esencial: LOCAL, RECORRIDO, ABORDAJE y RESTABLECER desaparecen; las lecturas quedan. Limpio: solo imagen.
