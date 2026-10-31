# Cristal D · Fase 4 (quirófano: pipeline D + hoja inferior L5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el espacio de trabajo del pipeline en el quirófano de la dirección D: visor a pantalla entera con zona libre, pastillas superiores, dock de pasos, inspector flotante, avisos como toasts, registro de la sesión, mandos ⌘K del pipeline, HUD con los tokens de texto y, a ≤ 1280 px, el inspector como hoja inferior.

**Architecture:** `pages/Workspace.tsx` pasa de `flex` (barra · rail · visor · panel) a un lienzo `position: relative` sobre `--viewer-bg`: el contenedor de `ViewerWorkspace` se coloca en la **zona libre** que calcula una función pura (`pipeline/zonaLibre.ts`) a partir del estado del inspector y del ancho; encima flotan piezas de cristal posicionadas en absoluto: `QuirofanoBar` (dos pastillas), `StepDock` (sustituye a `StepRail` y a la barra compacta), `RightPanelColumn` reconvertido en inspector flotante (o `BottomSheet` a ≤ 1280), y `ToastStack` para los avisos. La lógica del pipeline (pasos, `missingFor`, `go`, guardado, captura, grabación, anotaciones, atajos) no cambia.

**Tech Stack:** React 19, `motion` 12 vía `src/motion`, vtk.js (sin cambios internos), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §5.4, §5.5 (pipeline), §5.6 (mandos del pipeline), §8.4–8.6 del documento anterior (HUD y actores intactos), §9 fase 4. Tableros: `docs/superpowers/specs/assets/2026-10-31-cristal-d/D-Pipeline.dc.html`, `L5-Deteccion.dc.html`, `L5-Esquema.dc.html`, `L6-Deteccion.dc.html` (registro).

## Global Constraints

- Material de la fase 1 (`glass()`, `data-glass`, tokens, `glide`, `lens`) y registro de mandos/paleta de la fase 2 (`lib/commands.ts`: `useRegisterCommands`, grupos `"pasos"` y `"acciones"`).
- Commits por lista explícita; nunca `git add -A`; nunca `docs/Informe-Ejecutivo-Zenodo.html`, `frontend/data/`.
- No se cambian cámara, planos, herramientas, actores VTK ni sus colores (`vtk/planeColors.ts`, `HUD_HEX`, `composeCapture.ts`).
- El lienzo WebGL del visor no queda bajo el inspector ni bajo las pastillas superiores en escritorio; solo el dock (y, a ≤ 1280, la hoja a media o completa altura) flota encima, con `glass("viewer")`.
- El visor no se desplaza al cambiar de paso; cambia de ancho solo cuando el inspector se pliega/despliega o se ensancha (380 ↔ 520 en Decisión e Informe), con transición de `--dur-2`.
- Se conservan: tecla P y pestaña de borde para plegar; atajos 1–8; `useUnfoldForNote`; contenido del panel montado aunque esté plegado; textos y roles de los avisos (`alert`/`status`) y su cierre al pulsar.
- Medidas: banda superior 72 px; márgenes del inspector 24 px; inspector 380/520; hoja inferior: asomar 96 px, media 50 % del alto, completa hasta la banda superior; dock con ampliación máx. 1,25 (ninguna con movimiento reducido).
- Breakpoint del modo estrecho: `(max-width: 1280px)`.

## Review Focus

1. Plegar el inspector con P mientras el foco está en el visor: la zona libre crece, el inspector sigue montado (nota a medio escribir intacta) y al desplegar todo vuelve igual (tests existentes de `PanelCollapse.test.tsx` adaptados en la tarea 4).
2. Paso bloqueado en el dock: no navega, enseña el motivo de `missingFor` como tooltip y nombre accesible (test en la tarea 3).
3. Ventana que cruza 1280 px con el inspector desplegado: pasa a hoja inferior a media altura sin desmontar el panel ni perder su scroll (test en la tarea 9).
4. Dos avisos a la vez (error al guardar y resultado de la grabación): se apilan sin taparse y cada uno se cierra solo al pulsarlo (test en la tarea 5).
5. Abrir la paleta en el pipeline: los 8 pasos aparecen en «Pasos», los bloqueados deshabilitados; «Guardar progreso» se deshabilita sin sesión (test en la tarea 7).

---

### Task 1: Zona libre y lienzo del quirófano

**Files:**
- Create: `frontend/src/pipeline/zonaLibre.ts`, `frontend/src/pipeline/zonaLibre.test.ts`
- Modify: `frontend/src/pages/Workspace.tsx` (solo la estructura del layout: raíz `position: relative; height: 100%; background: var(--viewer-bg); overflow: hidden`; contenedor del visor en absoluto con los insets de `zonaLibre`, `transition: right var(--dur-2) var(--ease-out), bottom var(--dur-2) var(--ease-out)`), `frontend/src/pages/Workspace.test.tsx`

**Interfaces:**
- Produces: `interface Insets { top: number; right: number; bottom: number; left: number }`; `zonaLibre(o: { estrecho: boolean; plegado: boolean; ancho: boolean /* inspector de 520 */; hoja?: "asomar" | "media" | "completa" }): Insets`. Escritorio: `top 72, left 0, bottom 0, right = plegado ? 0 : (ancho ? 520 : 380) + 48`. Estrecho: `top 72, left 0, right 0, bottom 96` (la hoja a media/completa flota encima; la zona no cambia con la altura de la hoja). Constantes exportadas `BANDA_SUPERIOR = 72`, `MARGEN_INSPECTOR = 24`, `HOJA_ASOMAR = 96`.
- Produces en `Workspace.tsx`: el contenedor del visor lleva `data-zona-libre` y sus insets en `style`.

- [ ] **Step 1: Tests.** `zonaLibre.test.ts`: escritorio desplegado → `{ top: 72, right: 428, bottom: 0, left: 0 }`; ancho → `right: 568`; plegado → `right: 0`; estrecho (cualquier hoja) → `{ top: 72, right: 0, bottom: 96, left: 0 }`. `Workspace.test.tsx`: el elemento `[data-zona-libre]` tiene `right: 428px` en Detección y `568px` en Decisión (usar el arnés que ya tiene el test para fijar el paso).
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar** (el rail y la barra compacta siguen de momento; las tareas 2–4 los sustituyen).
- [ ] **Step 4: Ver que pasan** `npx vitest run src/pipeline/zonaLibre.test.ts src/pages/Workspace.test.tsx src/pages/PanelCollapse.test.tsx` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: zona libre del visor y lienzo a pantalla entera».

### Task 2: Pastillas superiores (`QuirofanoBar`)

**Files:**
- Create: `frontend/src/components/stepper/QuirofanoBar.tsx`, `QuirofanoBar.test.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (sustituye a `<TopBar brand …>`), `frontend/src/pages/Workspace.test.tsx`

**Interfaces:**
- Consumes: `Crumb` de `components/shell/TopBar.tsx`, `SaveStatus`, `Badge`/`riskVariant`, `ThemeToggle`, `UserMenu`, `openCommandPalette` (`lib/commands.ts`), `glass()`.
- Produces: `QuirofanoBar({ crumbs, onBack, riskLabel, status, actions }: { crumbs: Crumb[]; onBack: () => void; riskLabel?: string | null; status?: ReactNode; actions?: ReactNode })`. Pastilla izquierda (absoluta, `top: 16px; left: 24px`, alto 48, `glass("normal")` + `data-glass`, radio `--radius-full`): botón redondo «Volver a Pacientes» (`aria-label`), migas con `nav aria-label="Miga de pan"` (mismo marcado que `TopBar` para no romper sus tests), insignia de riesgo si hay `riskLabel` (lo que hoy enseña el rail). Pastilla derecha (`top: 16px; right: 24px`): `status`, `actions`, botón «⌘K» (`aria-label="Abrir la paleta de mandos (Ctrl+K)"`), `ThemeToggle`, `UserMenu`. Ninguna de las dos invade la zona libre (alto total ≤ 72 px).
- `Workspace.tsx` pasa exactamente las migas, el estado y las acciones que hoy pasa a `TopBar` (Captura, Grabar, Archivar/Adjuntar, Guardar progreso) y `riskLabel = morphometry?.rupture_risk_label ?? null`.

- [ ] **Step 1: Tests.** `QuirofanoBar.test.tsx`: renderiza la miga «Pacientes» como botón que llama su `onClick`; «Volver a Pacientes» llama `onBack`; con `riskLabel="alto"` hay una insignia con «Alto» (el texto que hoy pinta el rail); las dos pastillas tienen `data-glass`. En `Workspace.test.tsx`, las aserciones existentes sobre «Guardar progreso», «Captura» y la miga siguen pasando sin cambiar su texto.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: migas y acciones en dos pastillas de cristal».

### Task 3: Dock de pasos (`StepDock`)

**Files:**
- Create: `frontend/src/components/stepper/StepDock.tsx`, `StepDock.test.tsx`
- Delete: `frontend/src/components/stepper/StepRail.tsx`, `StepRail.test.tsx` (sus tres casos migran al test del dock)
- Modify: `frontend/src/pages/Workspace.tsx` (quita `StepRail` y el bloque `ws-steps-compact`), `frontend/src/styles/responsive.css` (reglas de `.ws-rail` y `.ws-steps-compact` fuera)

**Interfaces:**
- Consumes: `PipelineStep` (`pipeline/steps.ts`), `glass("viewer")`, `useReducedMotion`, `openCommandPalette`, `Icon`.
- Produces: `StepDock({ steps, activeIndex, missingFor, onGo, compacto }: { steps: PipelineStep[]; activeIndex: number; missingFor: (i: number) => string | null; onGo: (i: number) => void; compacto?: boolean })`. `nav aria-label="Flujo de planificación"` en pastilla absoluta `left: 24px; bottom: 20px`, `glass("viewer")` + `data-glass`, `z-index` por encima del visor. Un botón redondo por paso (44 px base; activo 60 px relleno `--primary` con rótulo «n · Nombre» encima; hecho = tick en `--success` sobre `--success-bg`; pendiente = número mono; bloqueado = `aria-disabled="true"`, opacidad .4, `title` y nombre accesible «Paso n, Nombre — <motivo>», sin navegar); el activo con `aria-current="step"`; «hecho» = índice < activo y `missingFor(i) === null` (la misma regla de consecutivos del rail). Ampliación: con el puntero sobre el dock, la escala de cada botón es `1 + 0.25 * max(0, 1 - |dx| / 120)` (dx = distancia horizontal del puntero al centro del botón), aplicada con `motion` (`animate={{ scale }}`, `--dur-1`); sin ampliación con `useReducedMotion()` o `compacto`. Separador y botón «⌘K» al final. `compacto` = botones de 36 px solo con número.

- [ ] **Step 1: Tests** (migrar los de `StepRail.test.tsx`): un paso bloqueado tiene `aria-disabled="true"`, su nombre accesible incluye el motivo y pulsarlo no llama `onGo`; el activo lleva `aria-current="step"`; los completados consecutivos llevan la marca de hecho (`data-estado="hecho"`) y uno no consecutivo no; pulsar un paso libre llama `onGo(i)`; con `useReducedMotion` simulado a `true`, mover el puntero no cambia ninguna escala (`data-escala="1"` en todos; exponer la escala calculada como atributo para el test); sin movimiento reducido, el botón bajo el puntero tiene `data-escala="1.25"`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar y retirar el rail.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/components/stepper src/pages/Workspace.test.tsx` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: dock de pasos con ampliación; se retira el rail».

### Task 4: Inspector flotante

**Files:**
- Modify: `frontend/src/components/RightPanelColumn.tsx`, `RightPanelColumn.test.tsx`, `frontend/src/pages/PanelCollapse.test.tsx`, `frontend/src/pages/Workspace.tsx` (le pasa `stepIndex` y `stepLabel`), el CSS donde vivan `.ws-panel-fold`, `.ws-panel-strip`, `.ws-panel-body` (localizar con grep)

**Interfaces:**
- Produces: misma API de `RightPanelColumn` más `stepIndex: number`. Desplegado: `position: absolute; top: 72px; right: 24px; bottom: 24px; width: 380 | 520` (transición de ancho `--dur-2`), `glass("dense")` + `data-glass`, radio `--radius-xl`, `overflow: hidden`; cabecera con rótulo mono «PASO {stepIndex + 1} · {STEPLABEL EN MAYÚSCULAS}» (`--text-eyebrow`, `--tracking-eyebrow`); cuerpo con el cruce actual (`panelSwap`); la pestaña de borde (`aria-label="Plegar el panel del paso (P)"`) sigue en su borde izquierdo. Plegado: el contenido sigue montado (`display: none`); en su lugar, una pastilla de cristal vertical pegada al borde derecho (`right: 24px; top: 72px`) con el botón «PANEL ▸ <paso>» (texto actual) y la insignia.

- [ ] **Step 1: Tests.** `RightPanelColumn.test.tsx`: mide 380 y 520 (ya existe; adaptar a la nueva posición); el panel tiene `data-glass` y el rótulo «PASO 3 · DETECCIÓN» con `stepIndex=2, stepLabel="Detección"`. `PanelCollapse.test.tsx`: sus seis casos siguen pasando sin cambiar textos.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: inspector flotante de cristal 380/520».

### Task 5: Avisos del pipeline como toasts (`ToastStack`)

**Files:**
- Create: `frontend/src/components/ToastStack.tsx`, `ToastStack.test.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (las cuatro bandas `attachNote`, `saveError`, `shotError`, `recMessage` pasan al apilado), `frontend/src/pages/Workspace.test.tsx` si alguna aserción depende de la banda

**Interfaces:**
- Produces: `interface ToastItem { id: string; tono: "error" | "ok" | "info"; texto: ReactNode; role: "alert" | "status"; onClose?: () => void }`; `ToastStack({ items, top, right }: { items: ToastItem[]; top: number; right: number })` — columna centrada horizontalmente en la zona libre (recibe `right` de `zonaLibre` para centrarse en ella), `top` = 72 + 12; cada toast es una pastilla `glass("dense")` + `data-glass` con icono del tono (`STATUS_WARN` / `STATUS_OK` / `INFO`), el texto y «✕»; pulsarlo llama su `onClose`; entra con `glide`. Los textos («No se pudo guardar el progreso: …», «No se pudo guardar la captura: …», el de la grabación, la nota de adjuntar) no cambian.

- [ ] **Step 1: Tests.** `ToastStack.test.tsx`: dos items se pintan como dos elementos con sus roles; pulsar el primero llama solo su `onClose`; cada uno tiene `data-glass`. En `Workspace.test.tsx`: forzar un error de guardado y comprobar que aparece `role="alert"` con «No se pudo guardar el progreso:» (si el test ya lo comprueba, que siga pasando).
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: los avisos del pipeline como toasts de cristal».

### Task 6: Registro de la sesión

**Files:**
- Create: `frontend/src/pipeline/sessionLog.ts`, `sessionLog.test.ts`, `frontend/src/components/planning/SessionLog.tsx`, `SessionLog.test.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (un `Collapsible` «Registro» plegado por defecto bajo «Anotaciones», visible siempre que haya sesión)

**Interfaces:**
- Produces en `sessionLog.ts`: `interface LogEntry { at: Date; paso: string; texto: string; duracionMs?: number }`; `useSessionLog(): LogEntry[]` — hook que observa el store de planificación (`usePlanning()`) y añade una entrada cuando cambia, de vacío a valor: la serie cargada («DICOM cargado · {n} cortes»), la segmentación («Segmentación · {vértices} vértices»), la lista de candidatos («Detección · {n} candidatos»), el candidato elegido («Elegido {id}»), la morfometría («Medida · Ø máx. {x} mm», coma decimal), y el guardado (`savedAt`, «Progreso guardado»). Duración: si el store expone un indicador de trabajo en curso para segmentación o detección (buscarlo en `store/planning.tsx`), `duracionMs` = tiempo entre que se enciende y que llega el resultado; si no existe, sin duración (no se inventa). Se vacía al cambiar `sessionId`. Función pura exportada para el test: `entradaPara(campo: CampoLog, anterior: unknown, actual: unknown, paso: string, ahora: Date): LogEntry | null`.
- Produces: `SessionLog({ entries }: { entries: LogEntry[] })` — lista en mono 12 px: «hh:mm:ss · paso · texto · {s,s} s» (coma decimal); vacía: «Aún no ha pasado nada en esta sesión».

- [ ] **Step 1: Tests.** `sessionLog.test.ts`: `entradaPara("candidatos", [], [a, b, c, d, e], "Detección", t)` → texto «Detección · 5 candidatos»; `entradaPara("morfometria", null, { max_diameter_mm: 11 }, "Morfometría", t)` → «Medida · Ø máx. 11,0 mm»; cambiar de un valor a otro igual no añade nada (devuelve `null`). `SessionLog.test.tsx`: una entrada con `duracionMs: 1530` se lee «1,5 s»; sin entradas, el texto vacío.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar** (leer los nombres reales de los campos del store antes de escribir `CampoLog`).
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: registro de la sesión en el inspector».

### Task 7: Mandos del pipeline en la paleta

**Files:**
- Modify: `frontend/src/pages/Workspace.tsx`, `frontend/src/pages/Workspace.test.tsx`

**Interfaces:**
- Consumes: `useRegisterCommands(owner, cmds)` (fase 2).
- Produces: `Workspace` registra con owner `"workspace"`: grupo `"pasos"` uno por paso («{n} · {label}», `disabled` si `i !== stepIdx && missingFor(i, planning)`, `run: () => go(i)`); grupo `"acciones"`: «Guardar progreso» (`disabled` sin `sessionId` o guardando; `run: saveProgress`), «Captura» (`disabled` como el botón; `run: tomarCaptura`), «Plegar el panel del paso» / «Mostrar el panel del paso» según el estado (`run`: el mismo conmutador que la tecla P).

- [ ] **Step 1: Tests.** En `Workspace.test.tsx` (o un test nuevo junto a él), tras montar en Detección, `getCommands()` contiene «3 · Detección» en `"pasos"`, «Guardar progreso» en `"acciones"` con `disabled` según haya sesión, y al desmontar `getCommands()` ya no tiene ningún mando de owner `"workspace"`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: pasos y acciones del pipeline en la paleta ⌘K».

### Task 8: HUD con los tokens de texto y holgura del dock

**Files:**
- Modify: los ficheros de `frontend/src/vtk/` y `frontend/src/vtk/hud/` que usan `var(--hud)` o `var(--hud-dim)` como color de **texto o de trazo DOM** (lista de partida: `vtk/Viewer.tsx:228`, `:1898`, `:2021`; `vtk/MipView.tsx:713`; `vtk/ObliqueView.tsx:218`, `:219`, `:276`; `vtk/SliceView.tsx:454`, `:461`, `:462`; `vtk/ViewerHeader.tsx:78`, `:82`; `vtk/hud/HudHeadingTape.tsx`; `vtk/hud/HudLadder.tsx`; repetir el grep), `frontend/src/vtk/hud/hud.css`, y el test `vtk/hudText.test.ts`
- No tocar: `vtk/Viewer.tsx:625` (colores leídos para el lienzo), `vtk/planeColors.ts`, `composeCapture.ts`, la paleta de actores.

**Interfaces:**
- Produces: en DOM, `var(--hud)` → `var(--hud-text)` y `var(--hud-dim)` → `var(--hud-text-dim)` (también en `accentColor` de los deslizadores y en bordes de 1 px decorativos del HUD); el `background: "#000"` de `ViewerHeader.tsx:78` y `SliceView.tsx:454` → `var(--viewer-bg)`. Holgura: el contenedor del visor publica `--dock-holgura: 96px` (escritorio) y los elementos del HUD anclados abajo a la izquierda (localizar con grep de `bottom:` en `vtk/` y `hud.css`) suman esa holgura para no quedar bajo el dock.

- [ ] **Step 1: Test.** Ampliar `vtk/hudText.test.ts`: ningún `.tsx` de `vtk/` ni `vtk/hud/` (excepto `Viewer.tsx` en la línea que lee colores para el lienzo, identificada por la llamada `color("--hud"`) contiene `var(--hud)` ni `var(--hud-dim)`; leer los ficheros con `readFileSync` como hace `tokens.test.ts`.
- [ ] **Step 2: Ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/vtk` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: textos del HUD con los tokens de datos y holgura del dock».

### Task 9: Hoja inferior a ≤ 1280 px (`BottomSheet`)

**Files:**
- Create: `frontend/src/components/BottomSheet.tsx`, `BottomSheet.test.tsx`, `frontend/src/hooks/useEstrechoQuirofano.ts` (o reutilizar `components/patients/useEstrecho.ts` si sirve con el umbral 1280; leerlo)
- Modify: `frontend/src/components/RightPanelColumn.tsx` (en modo estrecho, su contenido va dentro de `BottomSheet`), `frontend/src/pages/Workspace.tsx` (`zonaLibre` con `estrecho`; `StepDock compacto` y por encima de la hoja: `bottom: 96 + 12`)

**Interfaces:**
- Produces: `type AlturaHoja = "asomar" | "media" | "completa"`; `BottomSheet({ altura, onAltura, titulo, children }: { altura: AlturaHoja; onAltura: (a: AlturaHoja) => void; titulo: string; children: ReactNode })` — `section` con `aria-label={titulo}`, absoluta `left: 0; right: 0; bottom: 0`, alto `96px` / `50%` / `calc(100% - 72px)`, `glass("viewer")` + `data-glass`, radio `--radius-xl` arriba; tirador (`button` con `aria-label="Cambiar la altura del panel"`, clic = siguiente altura cíclica asomar → media → completa → asomar); arrastre del tirador con eventos de puntero que eligen la altura más cercana al soltar; ↑/↓ con el foco en la hoja suben/bajan una altura; Esc la deja en «asomar»; transición de alto `--dur-3` (sin ella con movimiento reducido). El contenido no se desmonta al cambiar de altura. Al entrar en modo estrecho la hoja arranca en «media».

- [ ] **Step 1: Tests.** `BottomSheet.test.tsx`: pulsar el tirador desde «asomar» llama `onAltura("media")`, desde «completa» llama `onAltura("asomar")`; `ArrowUp` desde «media» → `"completa"`; `Escape` → `"asomar"`; el `section` tiene `data-glass`. En `PanelCollapse.test.tsx` o `RightPanelColumn.test.tsx`: con `matchMedia("(max-width: 1280px)")` a `true`, el panel del paso está dentro de una región «Panel del paso» con tirador y un campo escrito antes del cambio sigue con su valor.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Quirófano: hoja inferior con tres alturas en pantallas estrechas».

### Task 10: Cierre de la fase

- [ ] **Step 1:** `npx vitest run` completo y `npx tsc -b` verdes.
- [ ] **Step 2:** Nota «Fase 4 completada el …» en §9 del documento de diseño, con desviaciones (en particular, si la transición de ancho del visor se quitó por coste).
- [ ] **Step 3: Commit** — «Diseño: fase 4 del cristal D completada».
