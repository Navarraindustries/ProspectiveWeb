# Pantalla limpia y controles (E3) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HUD en tres niveles con H (completo · esencial · limpio) que las capturas respetan, panel derecho plegable con P, grupos de botones con nombre, pista de gestos que no tapa nada, ventana/nivel con aviso y restablecer, UMBRAL con unidad, y fuera «⤢» y el aviso repetido.

**Architecture:** Una preferencia `viewer.hudLevel` que la raíz del visor publica como `data-hud` y el CSS aplica (los viewports de vtk reciben `showInset`); `composeCapture` recibe el nivel y omite lo mismo que el CSS esconde. El panel se pliega con `display: none` sobre el mismo árbol para no perder estado. Los renombrados pasan por un `label` nuevo en `HudToggleGroup` y un test de copia que impide que vuelvan «CENTRAR»/«AJUSTAR».

**Tech Stack:** React 19, vtk.js 36, vitest + Testing Library. Sin backend.

**Spec:** `docs/superpowers/specs/2026-10-08-pantalla-limpia-controles-design.md`

## Global Constraints

- Niveles: `"completo" | "esencial" | "limpio"`; clave `viewer.hudLevel`; migración desde `viewer.hudDecorHidden = "1"` → `esencial` (y se borra la clave vieja); valor inválido → `completo`. Ciclo H: completo → esencial → limpio → completo.
- Qué esconde cada nivel: la tabla de la spec §2 es la autoridad. `.hud-anot`, las asas de los planos y los contornos de los planos (según PLANOS) se ven siempre. `showPlanes = !planesHidden` (ya no depende del HUD).
- Capturas y grabaciones reflejan el nivel: en `limpio` sin rótulo, lecturas ni banda superior; las formas de anotación siempre.
- Panel: clave `ws.panelCollapsed` en `localStorage`; plegado = tira de 28 px con pestaña vertical «PANEL ▸ <paso>»; el árbol del panel no se desmonta (`display: none`).
- Copia: «ENCUADRAR» para todo encuadre (VOLUMEN, 3D, Oblicuo, fila C de la tabla); «AL PUNTO» para el desplazamiento a 0 del Oblicuo; prefijos «EJE ▸», «VISTA ▸», «DESDE ▸», «HUD ▸». Ni «CENTRAR» ni «AJUSTAR» como etiqueta de botón.
- Unidades: `HU_MODALITIES = ["CT", "CTA", "CTPA"]` en `vtk/modality.ts`, única fuente; « HU» detrás de W, L, NIV, VENT y UMBRAL en esas modalidades; nada en el resto.
- Atajos: H → `hud-cycle` (visor), P → `panel-toggle` (flujo); `RESERVED_KEYS = []`; nunca con el foco en un campo de texto.
- Copia y comentarios WHY en español; sin dependencias nuevas; nunca `git add frontend/package-lock.json`.
- Commits terminan con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM`.
- Frontend: `cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run build` (línea base 835 tests / 111 archivos). Backend: sin cambios; no hace falta correrlo.
- Anclas (master 0a2c5f0): `vtk/viewerPrefs.ts` (`PREF_DECOR_HIDDEN` :12, `useStoredFlag` :27); `vtk/hud/hud.css` (`.hud-nodecor` :43–45, `.hud-hint` :39); `vtk/Viewer.tsx` (`decorHidden` ~238, `planesHidden` ~243, `showPlanes` ~875, `HINT_TEXT` ~79, pista ~1247–1270 y ~1411–1417, `levelNote` ~387, `wlSelect`/`wlHost` ~1503–1530, `estadoVisor` ~508–545, `leerVisor` ~552–588, `onShortcut` ~1432–1476, `renderScene` toggles ~1734–1768, `CAMERA_BUTTONS` ~119, raíz `className={decorHidden ? "hud-nodecor" : undefined}` ~1790, header props ~1806); `vtk/ViewerHeader.tsx` (grupo derecho :75–96); `vtk/hud/HudToggleGroup.tsx`; `vtk/MipView.tsx` (`PLANE_OPTIONS` :65, `CLIP_OPTIONS` :72, fila superior :618–631, fila inferior :662–668, inset :348); `vtk/ObliqueView.tsx` (:248–262 tira de deslizadores); `vtk/SliceView.tsx` (lecturas :416–420, barra de escala :421, W/L drag :325–334); `vtk/mipReadout.ts` (:22, :26); `vtk/windowPresets.ts` (:10–19); `components/segmentation/SegmentPanel.tsx` (:311–320); `components/segmentation/PreprocessSection.tsx` (`HU_MODALITIES` :15–19); `pages/Workspace.tsx` (Topbar :260–318, columnas :434–550, `onKey` :193–225, `VIEWER_SHORTCUTS` :34); `vtk/ViewerGrid.tsx` («⤢» :190–208); `vtk/composeCapture.ts` (`paintFrame` ~175, `drawTopBand`); `vtk/readHud.ts`; `vtk/shortcuts.ts` (`RESERVED_KEYS` :18–20, tabla :24–53); `README.md` (tabla :286–307, párrafo H/P :290, sección «Navegación y orientación del visor» ~2160).

## Review Focus

1. Con el HUD en limpio, S, C, espacio, R/A/G/T y H siguen funcionando aunque sus botones no se vean. → Task 2 test «los atajos actúan en limpio».
2. Plegar el panel con un formulario a medias (p. ej. una nota de anotación escrita y sin confirmar) y desplegarlo conserva el texto. → Task 4 test «el input conserva su valor».
3. Al cargar con `viewer.hudDecorHidden = "1"` guardado de antes, el visor arranca en esencial y la clave vieja desaparece. → Task 1 test de migración.
4. Una captura en limpio no lleva rótulos ni lecturas pero sí las anotaciones; en completo lleva todo. → Task 3 tests.
5. Doble clic en la lectura W/L de una celda lateral compacta restablece la ventana sin mover el corte ni el crosshair. → Task 7 test.

---

### Task 1: Modelo del nivel del HUD y preferencia con migración

**Files:**
- Modify: `frontend/src/vtk/viewerPrefs.ts`
- Create: `frontend/src/vtk/viewerPrefs.test.ts` (si ya existe, añadir)

**Interfaces:**

```ts
export type HudLevel = "completo" | "esencial" | "limpio";
export const HUD_LEVELS: HudLevel[] = ["completo", "esencial", "limpio"];
export const PREF_HUD_LEVEL = "viewer.hudLevel";
export function hudLevelFromStorage(raw: string | null, legacyDecorHidden: string | null): HudLevel;  // inválido → completo; raw null y legacy "1" → esencial
export function nextHudLevel(l: HudLevel): HudLevel;
export function readHudLevel(): HudLevel;        // lee, migra (borra viewer.hudDecorHidden) y devuelve
export function useStoredChoice<T extends string>(key: string, valid: readonly T[], porDefecto: T, read?: () => T): [T, (v: T) => void];
```

- [x] **Step 1: Tests que fallan**

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { hudLevelFromStorage, nextHudLevel, readHudLevel, PREF_HUD_LEVEL, PREF_DECOR_HIDDEN } from "./viewerPrefs";
describe("nivel del HUD", () => {
  beforeEach(() => window.localStorage.clear());
  it("sin nada guardado es completo; inválido también", () => {
    expect(hudLevelFromStorage(null, null)).toBe("completo");
    expect(hudLevelFromStorage("medio", null)).toBe("completo");
  });
  it("migra REGLAS ○ a esencial y borra la clave vieja", () => {
    window.localStorage.setItem(PREF_DECOR_HIDDEN, "1");
    expect(readHudLevel()).toBe("esencial");
    expect(window.localStorage.getItem(PREF_DECOR_HIDDEN)).toBeNull();
    expect(window.localStorage.getItem(PREF_HUD_LEVEL)).toBe("esencial");
  });
  it("el ciclo de H", () => {
    expect(nextHudLevel("completo")).toBe("esencial");
    expect(nextHudLevel("esencial")).toBe("limpio");
    expect(nextHudLevel("limpio")).toBe("completo");
  });
});
```

- [x] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar** (try/catch alrededor de `localStorage` como el resto del archivo). - [ ] **Step 4: Verificar** `npx vitest run src/vtk/viewerPrefs.test.ts`, `tsc`. - [ ] **Step 5: Commit** `git add frontend/src/vtk/viewerPrefs.ts frontend/src/vtk/viewerPrefs.test.ts && git commit -m "Nivel del HUD: preferencia de tres valores con migración desde REGLAS"`

---

### Task 2: El nivel aplicado al visor: `data-hud`, CSS, maniquíes, PLANOS independiente, cabecera «HUD ▸», tecla H

**Files:**
- Modify: `frontend/src/vtk/Viewer.tsx` (raíz `data-hud`; `showPlanes = !planesHidden`; prop `showInset` a MeshView/MipView; barra de cine solo reproduciendo en limpio; pista no en limpio; `estadoVisor.hud_level` y fuera `hud_decor_hidden`; `onShortcut("hud-cycle")`; pista «HUD esencial» 1,2 s al cambiar y al cargar si ≠ completo), `frontend/src/vtk/hud/hud.css` (reglas `[data-hud="esencial"]`, `[data-hud="limpio"]`; se retira `.hud-nodecor`), `frontend/src/vtk/ViewerHeader.tsx` (grupo «HUD ▸ COMPLETO · ESENCIAL · LIMPIO», abreviado «HUD ▸ C · E · L» bajo 800 px, título «Nivel del HUD (H)»; props `hudLevel`/`onHudLevelChange` en lugar de `decorHidden`), `frontend/src/vtk/MeshView.tsx` y `frontend/src/vtk/MipView.tsx` (prop `showInset?: boolean`, por defecto true; el viewport del maniquí/recuadro se desactiva con `setViewport` fuera del lienzo o `renderer.setDraw(false)` + `render`), `frontend/src/vtk/shortcuts.ts` (`hud-cycle` «H», `RESERVED_KEYS` sin H; P se asigna en Task 4), `frontend/src/vtk/shortcuts.test.ts`, `frontend/src/pages/Workspace.tsx` (`VIEWER_SHORTCUTS` + `hud-cycle`), `frontend/src/vtk/ViewerHeader.test.tsx`
- Create: `frontend/src/vtk/hudLevel.test.tsx`

**CSS (la tabla de la spec, elemento a elemento):**

```css
/* Esencial: fuera la decoración y los botones; quedan rótulo, lecturas, escalera, escala, barra de cine. */
[data-hud="esencial"] .hud-decor:not(.hud-ladder), [data-hud="esencial"] .hud-corner,
[data-hud="esencial"] .hud-toggle, [data-hud="esencial"] .hud-stack, [data-hud="esencial"] .hud-hint { display: none !important; }
[data-hud="esencial"] .hud-edge.right.beside-ladder { right: 48px; }   /* la escalera se queda */
/* Limpio: solo la imagen y las anotaciones. */
[data-hud="limpio"] .hud-decor, [data-hud="limpio"] .hud-corner, [data-hud="limpio"] .hud-toggle, [data-hud="limpio"] .hud-stack,
[data-hud="limpio"] .hud-hint, [data-hud="limpio"] .hud-label, [data-hud="limpio"] .hud-readout, [data-hud="limpio"] .hud-edge,
[data-hud="limpio"] .hud-scale, [data-hud="limpio"] .hud-cine:not(.playing) { display: none !important; }
```

`HudLadder` recibe la clase `hud-ladder` además de `hud-decor`; la barra de escala la clase `hud-scale`; `HudCineBar` la clase `playing` cuando reproduce. El selector de preajustes de ventana (`wlSelect`) lleva `hud-toggle` para esconderse con los botones.

- [x] **Step 1: Tests que fallan** → `hudLevel.test.tsx`: monta `<div data-hud="esencial"><div class="hud-decor">…</div><div class="hud-decor hud-ladder">…</div><div class="hud-readout">…</div><button class="hud-toggle">…</button><svg class="hud-anot"/></div>` con el CSS real cargado (importa `hud.css`; jsdom aplica `display` de hojas inyectadas si se usa `getComputedStyle` sobre reglas simples — si jsdom no computa `!important` desde el archivo, el test comprueba las reglas del CSS parseado con `document.styleSheets` o lee el texto del archivo y afirma los selectores presentes; elige lo que sea fiable y dilo en el informe) y afirma: en esencial decor oculto, escalera y lectura visibles, botones ocultos, `.hud-anot` visible; en limpio rótulo/lectura/escalera ocultos y `.hud-anot` visible. `ViewerHeader.test.tsx`: el grupo HUD con tres opciones, título «Nivel del HUD (H)», `onHudLevelChange("limpio")` al pulsar LIMPIO; PLANOS sigue emitiendo con cualquier nivel. `shortcuts.test.ts`: `KeyH` → `hud-cycle`; `RESERVED_KEYS` no contiene «H». Test «los atajos actúan en limpio»: `matchShortcut` no mira el nivel (prueba de que `hud-cycle`, `sync`, `center`, `cine-toggle`, `anot-regla` se resuelven igual) — y en Viewer el `onShortcut` no consulta `hudLevel` (revisión).
- [x] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar** (sustituir `decorHidden`/`useStoredFlag(PREF_DECOR_HIDDEN)` por `useStoredChoice(PREF_HUD_LEVEL, HUD_LEVELS, "completo", readHudLevel)`; `hudLevelRef` para `estadoVisor`; la pista «HUD esencial»/«HUD limpio»/«HUD completo» reutiliza `showHintText`; en `limpio` `hintKind` → null). - [ ] **Step 4: Verificar** vitest de los archivos, `tsc`, navegador (Case 3, admin / admin12345): H tres veces en DERECHA y en CUATRO, maniquíes fuera en limpio, PLANOS funciona en esencial, botones de cabecera, S y C siguen actuando en limpio. - [ ] **Step 5: Commit** `git add frontend/src/vtk/Viewer.tsx frontend/src/vtk/hud/hud.css frontend/src/vtk/ViewerHeader.tsx frontend/src/vtk/ViewerHeader.test.tsx frontend/src/vtk/MeshView.tsx frontend/src/vtk/MipView.tsx frontend/src/vtk/SliceView.tsx frontend/src/vtk/hud/HudLadder.tsx frontend/src/vtk/hud/HudCineBar.tsx frontend/src/vtk/shortcuts.ts frontend/src/vtk/shortcuts.test.ts frontend/src/pages/Workspace.tsx frontend/src/vtk/hudLevel.test.tsx && git commit -m "HUD en tres niveles con H: completo, esencial y limpio, y PLANOS por su cuenta"`

---

### Task 3: Las capturas y grabaciones respetan el nivel

**Files:**
- Modify: `frontend/src/vtk/composeCapture.ts` (`ComposeInput.hudLevel?: HudLevel`; en `limpio`: `drawPaneHud` no pinta rótulo ni lecturas y `drawTopBand` no se pinta; las formas siempre), `frontend/src/vtk/composeCapture.test.ts`, `frontend/src/vtk/Viewer.tsx` (`leerVisor` añade `hudLevel: hudLevelRef.current`)

- [x] **Step 1: Tests que fallan** → con `hudLevel: "limpio"` el `Ctx2D` falso no recibe `fillText` del rótulo «AXIAL» ni de las lecturas, y la banda superior no pinta su texto, pero `drawShapes` sí recorre las formas; con `"completo"` (o sin el campo) todo igual que hoy. - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar.** - [ ] **Step 4: Verificar** vitest, `tsc`, navegador: «Captura» en limpio con una regla → imagen sin rótulos y con la regla; en completo con todo. - [ ] **Step 5: Commit** `git add frontend/src/vtk/composeCapture.ts frontend/src/vtk/composeCapture.test.ts frontend/src/vtk/Viewer.tsx && git commit -m "Las capturas salen con el mismo nivel de HUD que se ve"`

---

### Task 4: Panel derecho plegable con P

**Files:**
- Modify: `frontend/src/pages/Workspace.tsx` (estado `panelCollapsed` con `localStorage` `ws.panelCollapsed`; la columna derecha envuelta: `display: none` cuando plegado + tira de 28 px `aside.ws-panel-strip` con botón vertical «PANEL ▸ <STEPS[stepIdx].label>» e insignia de anotaciones; botón «◧ Panel» en la Topbar a la izquierda de «Guardar progreso», `aria-pressed`, título «Ocultar o mostrar el panel del paso (P)»; `onKey`: `panel-toggle` → alternar), `frontend/src/styles/responsive.css` (`.ws-panel-strip` y `writing-mode: vertical-rl`), `frontend/src/vtk/shortcuts.ts` (`panel-toggle` «P», ámbito flujo; `RESERVED_KEYS = []`), `frontend/src/vtk/shortcuts.test.ts` (la prueba de H/P pasa a exigir que estén asignadas), `frontend/src/vtk/Viewer.tsx` (`estadoVisor.panel_collapsed` — Workspace lo expone por el store o por `data-panel-collapsed` en el contenedor, lo que sea más simple)
- Create: `frontend/src/pages/PanelCollapse.test.tsx`

- [x] **Step 1: Tests que fallan** → monta Workspace (o un harness mínimo con su columna derecha si Workspace exige demasiado contexto; en ese caso extrae `RightPanelColumn({ collapsed, onToggle, stepLabel, badge, children })` a `components/RightPanelColumn.tsx` y pruébalo): P pliega (la tira aparece, el contenido tiene `display: none` pero sigue en el DOM), P despliega, `localStorage` guarda «1»/«0», un `<input>` dentro conserva su valor tras plegar y desplegar, P con el foco en un `<input>` no hace nada. - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar.** - [ ] **Step 4: Verificar** vitest, `tsc`, navegador: P pliega, el visor se ensancha (la celda principal crece), recarga y sigue plegado, clic en la tira despliega. - [ ] **Step 5: Commit** `git add frontend/src/pages/Workspace.tsx frontend/src/components/RightPanelColumn.tsx frontend/src/pages/PanelCollapse.test.tsx frontend/src/styles/responsive.css frontend/src/vtk/shortcuts.ts frontend/src/vtk/shortcuts.test.ts frontend/src/vtk/Viewer.tsx && git commit -m "Panel del paso plegable con P: el visor gana el ancho y el panel no pierde lo escrito"`

---

### Task 5: Nombres: «EJE ▸», «VISTA ▸», «DESDE ▸», «ENCUADRAR», «AL PUNTO»

**Files:**
- Modify: `frontend/src/vtk/hud/HudToggleGroup.tsx` (`label?: string` pintado delante en `--hud-dim`), `frontend/src/vtk/hud/HudToggleGroup.test.tsx` (crear si no existe), `frontend/src/vtk/MipView.tsx` (`label="EJE ▸"`; «CENTRAR» → «ENCUADRAR»; «DESDE EL FINAL/INICIO» → grupo `label="DESDE ▸"` opciones INICIO · FINAL con `value` según `reverse`; título de EJE sin la lista), `frontend/src/vtk/Viewer.tsx` (`CAMERA_BUTTONS`: «ENCUADRAR» y `label="VISTA ▸"` en el grupo), `frontend/src/vtk/ObliqueView.tsx` («AJUSTAR» → «ENCUADRAR», «CENTRAR» → «AL PUNTO»), `frontend/src/vtk/shortcuts.ts` (fila C «Encuadrar la celda enfocada»), `README.md` (fila C)
- Create: `frontend/src/vtk/copy.test.ts`

- [x] **Step 1: Tests que fallan** → `copy.test.ts` lee con `fs` los archivos `src/vtk/**/*.tsx` y `src/components/**/*.tsx` y afirma que ningún literal de etiqueta es `"CENTRAR"`, `"AJUSTAR"` ni `"Ajustar"` (regex sobre `label: "…"` y `>…<`), y que «ENCUADRAR» aparece en MipView, Viewer y ObliqueView; `HudToggleGroup.test.tsx`: con `label="EJE ▸"` el texto precede a las opciones; tests existentes de MipView/Viewer que busquen «CENTRAR» se actualizan. - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar.** - [ ] **Step 4: Verificar** vitest completo, `tsc`, navegador: los tres grupos con prefijo, DESDE ▸ INICIO · FINAL alterna el sentido, ENCUADRAR en los tres sitios, AL PUNTO en Oblicuo. - [ ] **Step 5: Commit** `git add frontend/src/vtk/hud/HudToggleGroup.tsx frontend/src/vtk/hud/HudToggleGroup.test.tsx frontend/src/vtk/MipView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/ObliqueView.tsx frontend/src/vtk/shortcuts.ts frontend/src/vtk/copy.test.ts README.md && git commit -m "Los grupos del HUD dicen lo que hacen: EJE, VISTA, DESDE, ENCUADRAR y AL PUNTO"`

---

### Task 6: La pista de gestos arriba, sin recibir clics, una vez por tipo y sesión

**Files:**
- Modify: `frontend/src/vtk/Viewer.tsx` (~1247–1270, ~1411–1417: `sessionStorage` `ws.hintShown.<kind>`; la pista no se enseña en `limpio`), `frontend/src/vtk/hud/hud.css` (`.hud-hint { top: 24px; bottom: auto; pointer-events: none; font-size: 10px; }`)
- Create: `frontend/src/vtk/hint.ts` (puro: `shouldShowHint(kind, storage) → boolean` que marca la clave), `frontend/src/vtk/hint.test.ts`

- [x] **Step 1: Tests que fallan** → `shouldShowHint("mip", store)` true la primera vez y false la segunda; otro `kind` true; `hud.css` contiene `pointer-events: none` para `.hud-hint` (lectura del archivo). - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar** (las pistas no efímeras como «Máximo 200 anotaciones» siguen pasando por `showHintText` y heredan la posición). - [ ] **Step 4: Verificar** vitest, `tsc`, navegador: la pista sale arriba al entrar en VOLUMEN la primera vez y no la segunda; no tapa ACUMULADO ni la barra de cine; un clic a través de ella llega al botón. - [ ] **Step 5: Commit** `git add frontend/src/vtk/Viewer.tsx frontend/src/vtk/hud/hud.css frontend/src/vtk/hint.ts frontend/src/vtk/hint.test.ts && git commit -m "La pista de gestos va arriba, no tapa nada y sale una vez por tipo de celda"`

---

### Task 7: Ventana y nivel: lectura clicable, restablecer, preajustes en toda celda, unidad HU

**Files:**
- Create: `frontend/src/vtk/modality.ts` (`HU_MODALITIES`, `isHuModality(m: string | null | undefined)`, `unitFor(m) → " HU" | ""`), `frontend/src/vtk/modality.test.ts`
- Modify: `frontend/src/vtk/SliceView.tsx` (la lectura br W/L pasa a `button.hud-readout` con título «Ventana y nivel · arrastrar en la imagen los cambia · doble clic restablece» y `onDoubleClick={p.onWindowLevelReset}`; también en compacta en forma corta; unidad por `unitFor(meta.modality)`; prop nueva `onWindowLevelReset?: () => void`; el selector de preajustes se monta aquí (`presets?: {label, wc, ww}[]`, `onPreset`) en toda celda no compacta como `select.hud-toggle` en br bajo la lectura), `frontend/src/vtk/ObliqueView.tsx` (misma lectura clicable y unidad), `frontend/src/vtk/Viewer.tsx` (`onWindowLevelReset = () => setMprWl(null)`; `wlHost`/`wlSelect` del `mainOverlay` desaparecen; pasa `presets` a cada SliceView), `frontend/src/vtk/windowPresets.ts` (usa `isHuModality`; TC gana «Auto» = ventana del estudio; todas las listas acaban con «Restablecer» que emite `null`), `frontend/src/vtk/mipReadout.ts` (NIV/VENT con unidad), `frontend/src/components/segmentation/PreprocessSection.tsx` (importa `HU_MODALITIES` de `vtk/modality.ts`), `frontend/src/vtk/SliceView.anotaciones.test.tsx` o nuevo `SliceView.wl.test.tsx`, `frontend/src/vtk/windowPresets.test.ts` (crear si no existe)

- [x] **Step 1: Tests que fallan** → `modality.test.ts` (CT/CTA/CTPA → " HU"; XA/MR/null → ""); `windowPresets.test.ts` (TC tiene «Auto» primero y «Restablecer» último; XA mantiene Auto/Vasos/Todo + Restablecer); `SliceView.wl.test.tsx`: la lectura muestra «W 400 HU  L 40 HU» con meta CT y «W 400  L 40» con XA; doble clic en la lectura llama `onWindowLevelReset` y NO `onPlaneClick` ni `onIndexChange`; en compacta la lectura corta existe; el select de preajustes existe en no compacta y emite el preajuste. - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar.** - [ ] **Step 4: Verificar** vitest, `tsc`, navegador: doble clic en W/L de una celda lateral restablece; preajuste en celda lateral; Case 3 (XA) sin unidad. - [ ] **Step 5: Commit** `git add frontend/src/vtk/modality.ts frontend/src/vtk/modality.test.ts frontend/src/vtk/SliceView.tsx frontend/src/vtk/SliceView.wl.test.tsx frontend/src/vtk/ObliqueView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/windowPresets.ts frontend/src/vtk/windowPresets.test.ts frontend/src/vtk/mipReadout.ts frontend/src/components/segmentation/PreprocessSection.tsx && git commit -m "Ventana y nivel: la lectura avisa y restablece, preajustes en toda celda y HU donde toca"`

---

### Task 8: UMBRAL con unidad

**Files:**
- Modify: `frontend/src/vtk/mipReadout.ts` (:26 «UMBRAL n» + `unitFor(meta.modality)`), `frontend/src/vtk/mipReadout.test.ts` (crear si no existe), `frontend/src/vtk/Viewer.tsx` (~1670 «VISTA PREVIA · CAPTURA [lo, hi]» con unidad), `frontend/src/components/segmentation/SegmentPanel.tsx` (:311–320 `unit={isHu ? "HU" : ""}` y ayuda «Intensidad del volumen, sin unidad física» cuando no es HU), test del panel si existe

- [x] **Step 1: Tests que fallan** → `mipReadout.test.ts`: con CT «UMBRAL 220 HU», con XA «UMBRAL 220». - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar.** - [ ] **Step 4: Verificar** vitest, `tsc`. - [ ] **Step 5: Commit** `git add frontend/src/vtk/mipReadout.ts frontend/src/vtk/mipReadout.test.ts frontend/src/vtk/Viewer.tsx frontend/src/components/segmentation/SegmentPanel.tsx && git commit -m "UMBRAL con unidad: HU en TC, intensidad en el resto"`

---

### Task 9: Fuera «⤢» y el aviso repetido por celda

**Files:**
- Modify: `frontend/src/vtk/ViewerGrid.tsx` (:190–208 quitar el botón y su reenfoque; conservar el doble clic y su enfoque), `frontend/src/vtk/ViewerGrid.test.tsx` (la prueba de «⤢» pasa a doble clic), `frontend/src/vtk/SliceView.tsx` (fuera la lectura tr `levelNote`), `frontend/src/vtk/Viewer.tsx` (fuera `levelNote` del tr de la escena y `levelNoteShort`; `levelNote` pasa como prop a `ViewerHeader`), `frontend/src/vtk/ViewerHeader.tsx` (lectura ámbar a la derecha de los grupos; abreviada bajo 800 px), `frontend/src/vtk/ViewerHeader.test.tsx`, `frontend/src/vtk/composeCapture.ts` (la banda superior sigue llevando `note`: sin cambios; comprobar)

- [x] **Step 1: Tests que fallan** → ViewerGrid sin `.viewer-maximize`; doble clic promueve y enfoca; ViewerHeader enseña `levelNote` cuando se le pasa. - [ ] **Step 2: Ver fallar.** - [ ] **Step 3: Implementar.** - [ ] **Step 4: Verificar** vitest, `tsc`, navegador: sin «⤢»; doble clic en una lateral la hace principal; el aviso de nivel reducido (forzar con una serie grande o revisar que la prop llega) sale una vez en la banda. - [ ] **Step 5: Commit** `git add frontend/src/vtk/ViewerGrid.tsx frontend/src/vtk/ViewerGrid.test.tsx frontend/src/vtk/SliceView.tsx frontend/src/vtk/Viewer.tsx frontend/src/vtk/ViewerHeader.tsx frontend/src/vtk/ViewerHeader.test.tsx && git commit -m "Fuera el botón ⤢ y el aviso de nivel repetido: una vez, en la banda de cabecera"`

---

### Task 10: Cierre: comprobación completa, lista manual y README

**Files:**
- Modify: `README.md` (tabla de atajos con H y P; quitar «H y P quedan sin asignar»; sección «Pantalla limpia y controles» tras «Anotaciones del visor»), este plan (casillas).

- [x] **Step 1: Comprobación completa** → `cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run build`.
- [ ] **Step 2: Lista manual con Case 3** (anótala en el commit de cierre)
  1. H tres veces en DERECHA y en CUATRO: esencial sin esquinas ni botones pero con escalera y lecturas; limpio solo imagen y anotaciones; la pista «HUD esencial» arriba; recarga y se conserva.
  2. En limpio: S alterna SINCRO, C encuadra, espacio reproduce, R crea una regla, H vuelve a completo.
  3. Captura en limpio sin rótulos y con una regla pintada; en completo con todo.
  4. P pliega el panel, el visor se ensancha, la tira dice «PANEL ▸ Morfometría», clic en la tira despliega, una nota de anotación a medias sigue escrita; recarga y sigue plegado.
  5. Grupos: «EJE ▸», «VISTA ▸», «DESDE ▸ INICIO · FINAL», «ENCUADRAR» en VOLUMEN, 3D y Oblicuo, «AL PUNTO» en Oblicuo; sin «⤢».
  6. Pista: una vez por tipo al entrar en VOLUMEN y en un corte; no tapa ACUMULADO ni la barra de cine.
  7. W/L: doble clic en la lectura de una celda lateral restablece; preajuste desde una celda lateral; Case 3 (XA) sin unidad; «UMBRAL n» sin unidad; en un TC (si hay uno archivado) con HU.
- [x] **Step 3: README y commit de cierre** → `git add README.md docs/superpowers/plans/2026-10-08-pantalla-limpia-controles.md && git commit -m "Cierre de pantalla limpia y controles (E3): lista manual y README"`
