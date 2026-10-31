# Rediseño visual · Fase 3 (pipeline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar el espacio de trabajo (`/app/sesion`) a la dirección «Obsidiana clínica»: rail con línea de progreso, barra superior única con estado de guardado, panel del paso de 380/520 px con cabecera, cuerpo y pie fijo que cruza en fundido al cambiar de paso, textos del HUD en Geist Mono sobre `--muted-foreground`/`--data`, la espera de Segmentación como lista de fases, el encendido de marcadores tras la Detección y el dial de medida con cifras que ruedan en Morfometría. El visor no se mueve y la API no cambia.

**Architecture:** `pages/Workspace.tsx` conserva su estado y sus efectos; se extraen el rail (`components/stepper/StepRail.tsx`) y el estado de guardado (`components/stepper/SaveStatus.tsx`) y se sustituye `components/Topbar.tsx` por el `TopBar` del shell (`crumbs` + `status` + `actions`). `RightPanelColumn` fija la anchura por paso (380 px; 520 en Decisión e Informe), anima el cruce de contenido con `AnimatePresence` y expone `PanelFooter` (pie pegado abajo) que cada panel usa para su acción de continuar. El HUD cambia solo en `hud.css` (DOM); los actores 3D y sus tokens `--hud*`/`--plane-*` no se tocan. El encendido y el dial son marcadores y líneas adicionales que `Viewer.tsx` ya sabe pasar a `MeshView` (`MeshMarker[]`, `MeshLine[]`), temporizados con `requestAnimationFrame` y respetando `prefers-reduced-motion`.

**Tech Stack:** React 19, Vite 7, TypeScript 5.8, vitest + Testing Library, `motion` 12 (barrel `frontend/src/motion`), `@kitware/vtk.js` (solo a través de `MeshView`), CSS plano con tokens.

**Spec:** `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§4.1–4.4, §4.7, §8.2, §8.3, §8.4, §8.6, §8.7, §8.10).

## Global Constraints

- Tokens con sus nombres actuales; `--primary-foreground` en vez de `#fff`; sin colores literales nuevos en TSX salvo los `Vector3` de actores ya existentes.
- Duraciones por token/`DUR` y curva `EASE`; `MotionConfig reducedMotion="user"` ya envuelve la app; el código vtk que anima consulta `matchMedia("(prefers-reduced-motion: reduce)")` y, si reduce, salta al estado final.
- El visor nunca cambia de sitio: disposición rail · visor · panel en los ocho pasos; el panel ensancha de 380 a 520 px en Decisión e Informe con transición de 240 ms (§8.2). Nada de modos de layout por paso.
- Actores 3D existentes, cámara, planos y herramientas intactos (§8.4, §8.6): lo nuevo es ADITIVO (marcadores y líneas que pasan por `markers`/`lines` de `MeshView`).
- `--hud` sigue existiendo en `colors.css` con su valor (lo vigila `vtk/planeColors.test.ts`) pero deja de usarse para texto DOM; los colores por plano (`--plane-*`) se conservan en las etiquetas.
- La API no cambia; `pdf_url` se embebe con `<object>` (§8.7); las calculadoras siguen en Morfometría (§8.10).
- Los textos que prueban los tests se conservan salvo que el test se actualice en la misma tarea; suite completa verde; `npx tsc -b` limpio. Atajos (1–8, P, Esc) intactos.
- Commits por lista explícita de ficheros; comentarios en castellano.

## Nota sobre tests de página

`pages/Workspace.test.tsx` y `pages/PanelCollapse.test.tsx` montan el Workspace con mocks del store y de la API; `components/Topbar.test.tsx` desaparece con `Topbar.tsx` (sus comprobaciones del menú de usuario ya viven en `components/shell/UserMenu.test.tsx`). Las tareas que muevan botones de la barra actualizan `Workspace.test.tsx` en el mismo commit.

## Review Focus

1. **Sesión reanudada en un paso avanzado (p. ej. Informe):** la línea de progreso del rail y el ancho de 520 deben salir correctos en el primer render, sin animación de «crecimiento» desde cero que confunda. Test en T1 (altura inicial) y T3 (anchura inicial).
2. **Re-detección:** el encendido ocurre UNA vez por lista de candidatos nueva; cambiar de candidato o volver al paso no lo repite; con `prefers-reduced-motion` todos aparecen encendidos de golpe. Test en T7 (secuencia pura).
3. **Morfometría sin medida (`m === null`) o no fiable:** ni dial ni odómetro; las cifras «—» no ruedan. Test en T8.
4. **Panel plegado (P) al cambiar de paso:** el cruce en fundido no debe desplegarlo ni perder lo escrito (`display: none` conserva el montaje). Test en T3 reutilizando el patrón de `PanelCollapse.test.tsx`.
5. **Guardado en curso al salir:** el estado «Guardando…» en la barra no puede quedarse pegado si `saveSession` falla; vuelve a «Cambios sin guardar» y el aviso rojo de siempre sigue saliendo. Test en T2.

---

### Task 1: Rail de pasos extraído con línea de progreso vertical

**Files:**
- Create: `frontend/src/components/stepper/StepRail.tsx`
- Create: `frontend/src/components/stepper/StepRail.test.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (sustituye el bloque `.ws-rail` en línea por `<StepRail …/>`)
- Modify: `frontend/src/styles/responsive.css` (las reglas `.ws-rail*` siguen válidas; añadir `.ws-rail-progress` oculto bajo 1024 px)

**Interfaces:**
- Produces: `StepRail({ steps: PipelineStep[], activeIndex: number, missingFor: (i: number) => string | null, onGo: (i: number) => void, patient?: PatientSummary | null, riskLabel?: string | null })`. Pinta `<nav aria-label="Flujo de planificación" className="ws-rail">` con `SectionLabel` «Flujo de planificación» (mismo `title` de atajos), una columna con línea de progreso (`<div className="ws-rail-progress" aria-hidden>` de 2 px, pista `--border`, relleno `<span>` `--primary` con `height: ${pct}%` donde `pct = 100 * (número de pasos completados consecutivos desde 0) / (steps.length - 1)`, `transition: height var(--dur-3) var(--ease-out)`), y un `<button>` por paso con `aria-current="step"` en el activo, `disabled` + `title={missing}` en los bloqueados, círculo de 26 px (activo `--primary`/`--primary-foreground`; hecho `--success-bg`/`--success` con `Icon STATUS_OK`; resto `--muted`/`--muted-foreground`), etiqueta 13 px (600 activo / 500), «opcional» 10 px, icono del paso. Debajo, la tarjeta de paciente actual (`Card.ws-patient-card`) sin cambios de texto. «Completado» = `i < activeIndex && missingFor(i) === null`; la línea llega hasta el último completado consecutivo desde 0.

- [ ] **Step 1: Tests que fallan (`StepRail.test.tsx`)**

```ts
const steps = STEPS; // de pipeline/steps
it("la línea de progreso llega hasta el último paso completado", () => {
  render(<StepRail steps={steps} activeIndex={3} missingFor={() => null} onGo={() => {}} />);
  const fill = document.querySelector(".ws-rail-progress > span") as HTMLElement;
  expect(fill.style.height).toBe(`${(100 * 3) / (steps.length - 1)}%`);
});
it("un paso bloqueado va apagado con el motivo y no navega", () => {
  const onGo = vi.fn();
  render(<StepRail steps={steps} activeIndex={0} missingFor={(i) => (i === 2 ? "Segmenta el vaso primero" : null)} onGo={onGo} />);
  const b = screen.getByRole("button", { name: /Detección/ });
  expect(b).toBeDisabled();
  expect(b).toHaveAttribute("title", "Segmenta el vaso primero");
  fireEvent.click(b);
  expect(onGo).not.toHaveBeenCalled();
});
it("el activo lleva aria-current=step y los completados la marca", () => {
  render(<StepRail steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} />);
  expect(screen.getByRole("button", { name: /Detección/ })).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("button", { name: /Carga DICOM/ }).querySelector("svg")).not.toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/stepper` → FAIL. **Step 3: Implementar** `StepRail.tsx` con los valores de Interfaces; en `Workspace.tsx` sustituir el bloque en línea por `<StepRail steps={STEPS} activeIndex={stepIdx} missingFor={(i) => missingFor(i, planning)} onGo={go} patient={patient} riskLabel={morphometry?.rupture_risk_label ?? null} />` conservando el `Card` de paciente dentro del rail. **Step 4: Run** `npx vitest run src/components/stepper src/pages/Workspace.test.tsx src/pages/PanelCollapse.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stepper/StepRail.tsx frontend/src/components/stepper/StepRail.test.tsx frontend/src/pages/Workspace.tsx frontend/src/styles/responsive.css
git commit -m "Pipeline: rail de pasos extraído con línea de progreso"
```

---

### Task 2: Barra superior única en el pipeline con estado de guardado

**Files:**
- Create: `frontend/src/components/stepper/SaveStatus.tsx` (+ `SaveStatus.test.tsx`)
- Modify: `frontend/src/components/shell/TopBar.tsx` (prop `brand?: boolean` → pinta `<Logo compact size={24}/>` + «PROSPECTIVE» a la izquierda de la miga, para pantallas sin barra lateral)
- Modify: `frontend/src/pages/Workspace.tsx` (usa `TopBar` del shell; quita «◧ Panel» y «Pacientes» de la barra; «Guardar progreso» pasa a primario)
- Modify: `frontend/src/components/RightPanelColumn.tsx` (pestaña de plegado en el borde del panel: `<button className="ws-panel-fold" aria-label="Plegar el panel del paso (P)">` a la izquierda del panel, 20 × 56 px, pegada al borde, icono `CHEVRON_RIGHT`)
- Delete: `frontend/src/components/Topbar.tsx`, `frontend/src/components/Topbar.test.tsx`
- Modify: `frontend/src/components/shell/shell.css` (`.shell-brand`, `.ws-panel-fold`)
- Test: `frontend/src/pages/Workspace.test.tsx` (actualizar), `frontend/src/pages/PanelCollapse.test.tsx` (añadir: la pestaña pliega)

**Interfaces:**
- Produces: `SaveStatus({ state: "saving" | "dirty" | "saved" | "clean", savedAt?: Date | null })` → `<span role="status" className="ws-save-status">` con punto de 8 px y texto: `saving` → «Guardando…» (punto `--muted-foreground` con animación `pulse` 1,2 s); `dirty` → «Cambios sin guardar» (punto `--warning`); `saved` → `Guardado ${hora(savedAt)}` (punto `--success`); `clean` → «Sin guardar» (punto `--muted-foreground`). `Workspace` deriva `state` de `saving`, `dirty`, `savedAt` en ese orden de prioridad.
- `TopBar` del shell gana `brand?: boolean` (por defecto false; `AppShell` no lo pasa). Workspace pinta `<TopBar brand crumbs={…mismas migas…} status={<SaveStatus …/>} actions={<>Captura · Grabar · Archivar/Adjuntar · Guardar progreso (primario)</>} />` — `ThemeToggle` y `UserMenu` los pone ya `TopBar`. El botón «Guardar progreso» ya no lleva el punto ni la hora (los lleva `SaveStatus`); su `title` y `disabled` se conservan.

- [ ] **Step 1: Tests que fallan**

`SaveStatus.test.tsx`:
```ts
it.each([
  ["saving", null, "Guardando…"],
  ["dirty", null, "Cambios sin guardar"],
  ["clean", null, "Sin guardar"],
] as const)("%s → %s", (state, at, text) => {
  render(<SaveStatus state={state} savedAt={at} />);
  expect(screen.getByRole("status")).toHaveTextContent(text);
});
it("saved muestra la hora local", () => {
  render(<SaveStatus state="saved" savedAt={new Date(2026, 9, 31, 12, 3)} />);
  expect(screen.getByRole("status")).toHaveTextContent(/^Guardado 12:03$/);
});
```
`Workspace.test.tsx`: actualizar «tocar el estado muestra el punto; guardar muestra la hora» → el `role="status"` de la barra pasa de «Sin guardar» a «Cambios sin guardar» al tocar y a `/^Guardado \d{2}:\d{2}$/` tras guardar; el botón dice siempre «Guardar progreso» y es `data-variant="default"`; «sin cambios ni guardado…» → `status` «Sin guardar». Añadir (Review Focus 5): «si el guardado falla, el estado vuelve a «Cambios sin guardar» y sale el aviso rojo» (`api.saveSession` rechaza → `role="alert"` con «No se pudo guardar el progreso» y `role="status"` con «Cambios sin guardar»). Quitar las aserciones sobre «◧ Panel» y «Pacientes» en la barra si existen.
`PanelCollapse.test.tsx` (añadir): «la pestaña del borde pliega el panel» → `fireEvent.click(getByRole("button", { name: "Plegar el panel del paso (P)" }))` deja `[data-panel-column]` con `display: none` y muestra `aside.ws-panel-strip`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/stepper src/components/shell src/pages/Workspace.test.tsx src/pages/PanelCollapse.test.tsx` → PASS; `npx tsc -b` limpio (sin referencias a `components/Topbar`: `grep -rn "components/Topbar" src`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stepper/SaveStatus.tsx frontend/src/components/stepper/SaveStatus.test.tsx frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/shell.css frontend/src/pages/Workspace.tsx frontend/src/pages/Workspace.test.tsx frontend/src/pages/PanelCollapse.test.tsx frontend/src/components/RightPanelColumn.tsx
git rm frontend/src/components/Topbar.tsx frontend/src/components/Topbar.test.tsx
git commit -m "Pipeline: barra superior única con estado de guardado; el panel se pliega desde su borde"
```

---

### Task 3: Panel del paso de 380/520 px con cruce en fundido, cabecera 18 px y pie fijo

**Files:**
- Modify: `frontend/src/components/RightPanelColumn.tsx`
- Create: `frontend/src/components/PanelFooter.tsx` (+ `PanelFooter.test.tsx`)
- Modify: `frontend/src/components/PanelHead.tsx` (`PanelHead` título 18 px / 600, `letterSpacing: "-0.01em"`, desc 13 px)
- Modify: `frontend/src/pages/Workspace.tsx` (pasa `stepKey` y `wide` a `RightPanelColumn`)
- Modify: `frontend/src/styles/responsive.css` (`.ws-panel-body`, `.ws-panel-footer`)
- Test: `frontend/src/components/RightPanelColumn.test.tsx` (crear), `frontend/src/pages/PanelCollapse.test.tsx` (sin cambios esperados)

**Interfaces:**
- Produces: `RightPanelColumn({ collapsed, onToggle, stepLabel, stepKey, wide, badge?, children })` — `wide: boolean` → `width: wide ? 520 : 380` (ya no `clamp`), `transition: width var(--dur-2) var(--ease-out)`, `flexShrink: 0`, atributo `data-panel-wide="true|false"`; dentro, `<AnimatePresence mode="wait" initial={false}><motion.div key={stepKey} className="ws-panel-body" {...panelSwap} transition={panelTransition}>{children}</motion.div></AnimatePresence>` (presets de `../motion`: fundido con 8 px de desplazamiento). El cuerpo desplaza (`overflowY: auto`, `padding: 20px 18px 24px`). `PanelFooter({ children, note? })` → `<div className="ws-panel-footer">` pegado abajo del panel (`position: sticky; bottom: 0; background: var(--background); borderTop: 1px solid var(--border); padding: 12px 18px; margin: 0 -18px -24px`), con `note` (11 px, `--muted-foreground`) encima de los botones. `Workspace` pasa `wide={step === "treatment" || step === "report"}` y `stepKey={step}`.

- [ ] **Step 1: Tests que fallan**

`RightPanelColumn.test.tsx`:
```ts
it("mide 380 px y 520 px en los pasos anchos, sin clamp", () => {
  const { rerender } = render(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Detección" stepKey="detect" wide={false}><p>a</p></RightPanelColumn>);
  const col = document.querySelector("[data-panel-column]") as HTMLElement;
  expect(col.style.width).toBe("380px");
  rerender(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Decisión" stepKey="treatment" wide><p>b</p></RightPanelColumn>);
  expect(col.style.width).toBe("520px");
});
it("plegado conserva el contenido montado al cambiar de paso", () => {
  const { rerender } = render(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="A" stepKey="a" wide={false}><input aria-label="nota" defaultValue="x" /></RightPanelColumn>);
  rerender(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="A" stepKey="a" wide={false}><input aria-label="nota" defaultValue="x" /></RightPanelColumn>);
  expect((screen.getByLabelText("nota") as HTMLInputElement).value).toBe("x");
  expect((document.querySelector("[data-panel-column]") as HTMLElement).style.display).toBe("none");
});
```
`PanelFooter.test.tsx`: «pinta la nota encima de los botones y lleva la clase del pie» (`getByText(note)` precede al botón en el DOM; `.ws-panel-footer` presente).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/RightPanelColumn.test.tsx src/components/PanelFooter.test.tsx src/pages` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RightPanelColumn.tsx frontend/src/components/RightPanelColumn.test.tsx frontend/src/components/PanelFooter.tsx frontend/src/components/PanelFooter.test.tsx frontend/src/components/PanelHead.tsx frontend/src/pages/Workspace.tsx frontend/src/styles/responsive.css
git commit -m "Pipeline: panel de 380/520 px con cruce en fundido, cabecera de 18 px y pie fijo"
```

---

### Task 4: Carga, Segmentación y Detección con pie fijo; la espera de Segmentación como lista de fases

**Files:**
- Modify: `frontend/src/components/upload/UploadPanel.tsx`, `frontend/src/components/segmentation/SegmentPanel.tsx`, `frontend/src/components/planning/DetectPanel.tsx` (el bloque final de botones de avance pasa a `<PanelFooter note={…}>`; textos, `disabled`, `title` y handlers iguales)
- Modify: `frontend/src/components/segmentation/SegmentProgress.tsx`
- Test: `frontend/src/components/segmentation/SegmentProgress.test.tsx` (añadir), los tests de los tres paneles (sin cambios de texto esperados)

**Interfaces:**
- Produces: `SegmentProgress({ state, slowNote?, headline })` acumula las fases vistas (`useRef<{ phase: string; message: string }[]>`): cada `state.phase` nuevo añade una fila; pinta una lista `<ol className="ws-phases">` con las fases en orden (mono, minúscula), la actual con punto `--primary` pulsante y las anteriores con `Icon STATUS_OK` en `--success` y su último `message` en 11 px `--muted-foreground`; debajo la barra real (`ProgressBar value={pct}`) y, si `pct` ≥ 5 y han pasado ≥ 3 s, «≈ N s restantes» calculado con `elapsed / pct * (100 − pct)` redondeado a 5 s. El `<details>` «Fases» desaparece (lo sustituye la lista). `aria-live` y el aviso de lentitud se conservan.

- [ ] **Step 1: Tests que fallan (`SegmentProgress.test.tsx`, añadir; conservar los existentes salvo el que busca el `<details>`/«Fases» plegado, que se reescribe sobre la lista)**

```ts
it("acumula las fases vistas: la actual con punto y las anteriores con marca y su mensaje", () => {
  const { rerender } = render(<SegmentProgress state={{ phase: "umbral", pct: 10, running: true, ok: true, message: "umbral 150–500" }} />);
  rerender(<SegmentProgress state={{ phase: "tubularidad", pct: 40, running: true, ok: true, message: "" }} />);
  const items = screen.getAllByRole("listitem");
  expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining("umbral"), expect.stringContaining("tubularidad")]);
  expect(items[0].querySelector("svg")).not.toBeNull();
  expect(items[0]).toHaveTextContent("umbral 150–500");
});
it("estima el tiempo restante a partir del porcentaje y el tiempo transcurrido", () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { rerender } = render(<SegmentProgress state={{ phase: "a", pct: 1, running: true, ok: true, message: "" }} />);
  vi.setSystemTime(10_000);
  rerender(<SegmentProgress state={{ phase: "a", pct: 25, running: true, ok: true, message: "" }} />);
  expect(screen.getByText(/≈ 30 s restantes/)).toBeInTheDocument();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** (los tres paneles solo mueven su bloque final a `PanelFooter`; la nota de 11 px bajo el botón de Carga pasa a `note`). **Step 4: Run** `npx vitest run src/components/upload src/components/segmentation src/components/planning/DetectPanel.test.tsx src/components/planning/DetectPanel.progreso.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/upload/UploadPanel.tsx frontend/src/components/segmentation/SegmentPanel.tsx frontend/src/components/segmentation/SegmentProgress.tsx frontend/src/components/segmentation/SegmentProgress.test.tsx frontend/src/components/planning/DetectPanel.tsx
git commit -m "Pipeline: pie fijo en Carga, Segmentación y Detección; la espera como lista de fases con tiempo estimado"
```

---

### Task 5: Morfometría, Decisión, Dispositivos, Fabricación e Informe con pie fijo; Decisión en dos columnas; Informe con el PDF embebido

**Files:**
- Modify: `frontend/src/components/morphometry/MorphometryPanel.tsx`, `frontend/src/components/planning/TreatmentPanel.tsx`, `frontend/src/components/planning/DevicesPanel.tsx`, `frontend/src/components/planning/ManufacturePanel.tsx`, `frontend/src/components/planning/ReportPanel.tsx`
- Modify: `frontend/src/styles/responsive.css` (`[data-panel-wide="true"] .panel-dos-columnas { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }`; fuera de `wide`, una columna)
- Test: `frontend/src/components/planning/ReportPanel.test.tsx` (añadir), `frontend/src/components/planning/TreatmentPanel.test.tsx` (añadir), el resto sin cambios de texto

**Interfaces:**
- Produces: en los cinco paneles la acción de avance («Continuar a decisión», «Continuar a dispositivos», «Continuar a fabricación», «Continuar al informe», «Guardar y cerrar») va en `PanelFooter` con las mismas condiciones. `TreatmentPanel`: el resultado se reparte en `<div className="panel-dos-columnas">`: izquierda «Riesgo» (tarjeta JSDB, factores contribuyentes, tarjetas de solo lectura PHASES/ELAPSS/UIATS con «Cambiar en Morfometría» como hoy), derecha «Geometría» (cuello, relación domo-cuello, ramas/perforantes); debajo, a todo el ancho, la vía (`TeamDecisionCard`). `ReportPanel`: cuando hay `pdfUrl`, un `<object data={pdfUrl} type="application/pdf" aria-label="Vista previa del informe" style={{ width: "100%", height: 520, borderRadius: 12 }}>` con un enlace de descarga como contenido alternativo; las casillas de qué incluir y «Cirujano responsable» quedan encima; los botones de exportación debajo. `DevicesPanel`: los chips «En el plan» pasan a `Badge variant="data"`.

- [ ] **Step 1: Tests que fallan**

`ReportPanel.test.tsx`: «con PDF en disco lo embebe y mantiene el enlace de descarga» → `document.querySelector('object[type="application/pdf"]')` con `data` = `pdf_url` y el enlace «Descargar PDF» sigue. «sin PDF no hay objeto embebido».
`TreatmentPanel.test.tsx`: «el resultado va en dos columnas: riesgo y geometría, y la vía debajo» → `.panel-dos-columnas` existe y contiene los rótulos «Riesgo estimado por cada vía · Japan Stroke Data Bank» y la geometría («Cuello»); `TeamDecisionCard` fuera de ella.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/morphometry src/components/planning` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/morphometry/MorphometryPanel.tsx frontend/src/components/planning/TreatmentPanel.tsx frontend/src/components/planning/TreatmentPanel.test.tsx frontend/src/components/planning/DevicesPanel.tsx frontend/src/components/planning/ManufacturePanel.tsx frontend/src/components/planning/ReportPanel.tsx frontend/src/components/planning/ReportPanel.test.tsx frontend/src/styles/responsive.css
git commit -m "Pipeline: pie fijo del resto de pasos; Decisión en dos columnas; Informe con el PDF embebido"
```

---

### Task 6: HUD del visor: textos DOM en Geist Mono sobre `--muted-foreground` y `--data`

**Files:**
- Modify: `frontend/src/vtk/hud/hud.css`
- Modify: `frontend/src/styles/tokens/colors.css` (añadir `--hud-text: var(--data)` y `--hud-text-dim: var(--muted-foreground)` en ambos temas; `--hud`, `--hud-dim`, `--hud-amber`, `--hud-red` se conservan para actores y lienzo)
- Modify: `frontend/src/components/CaptureGallery.tsx` (L~201: `var(--hud, #8CFF9E)` → `var(--data)`)
- Test: `frontend/src/vtk/hudText.test.ts` (crear)

**Interfaces:**
- Produces: en `hud.css` todo `color: var(--hud)` de texto pasa a `var(--hud-text)` y todo `var(--hud-dim)` a `var(--hud-text-dim)`; `.hud-warn` → `var(--warning)`, `.hud-err` → `var(--destructive)`; `outline`/`border-bottom` de foco y pulsado → `var(--hud-text)`; `.hud-label[data-plane=…]` conserva `--plane-*`; `.viewer-cell--over` y `.viewer-splitter` → `var(--primary)`. `vtk/composeCapture.ts` y `readHud.ts` no se tocan (la captura sigue con los colores de siempre; se anota en §8.4).

- [ ] **Step 1: Test que falla (`vtk/hudText.test.ts`)**

```ts
const css = readFileSync(resolve(__dirname, "hud/hud.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
it("el texto del HUD ya no usa el verde: ni --hud ni --hud-dim fuera de los planos", () => {
  expect(css).not.toMatch(/var\(--hud\)/);
  expect(css).not.toMatch(/var\(--hud-dim\)/);
  expect(css).toMatch(/\.hud\s*\{[^}]*color:\s*var\(--hud-text\)/);
  expect(css).toMatch(/\.hud-warn\s*\{[^}]*var\(--warning\)/);
});
it("los tokens de texto del HUD existen en los dos temas", () => {
  const colors = readFileSync(resolve(__dirname, "../styles/tokens/colors.css"), "utf8");
  expect(colors.match(/--hud-text:/g)?.length).toBeGreaterThanOrEqual(2);
  expect(colors).toMatch(/--hud:\s*#8CFF9E/i); // los actores siguen
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/vtk` → PASS (incluidos `planeColors.test.ts`, `hudLevel.test.tsx`, `composeCapture.test.ts`); `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/hud/hud.css frontend/src/styles/tokens/colors.css frontend/src/components/CaptureGallery.tsx frontend/src/vtk/hudText.test.ts
git commit -m "HUD: textos del visor en mono sobre --data y --muted-foreground; los actores conservan su verde"
```

---

### Task 7: Encendido de marcadores tras la detección

**Files:**
- Create: `frontend/src/vtk/candidateMarkers.ts` (+ `candidateMarkers.test.ts`)
- Modify: `frontend/src/vtk/Viewer.tsx` (añade los marcadores de candidatos a `markers` y la secuencia)
- Modify: `frontend/src/vtk/markerColors.ts` (si existe; exporta `CANDIDATE_COLOR` y `CANDIDATE_DIM_COLOR`)

**Interfaces:**
- Produces: `candidateMarkers(cands: AneurysmCandidate[], selected: number, lit: number): MeshMarker[]` — un marcador por candidato con `pos = [center_mm.x, center_mm.y, center_mm.z]`, radio ≈ 2 mm (`scale` relativo al radio compartido; el implementador lee `markerSize.ts`), color `CANDIDATE_COLOR` (`hexToRgb01("#3B8BFF")`) para el seleccionado y `CANDIDATE_DIM_COLOR` (el mismo azul mezclado al 40 % hacia el negro) para el resto; solo los `i < lit` se incluyen. `litSequence(n: number, totalMs = 1000): number[]` devuelve los instantes (ms) en los que se enciende cada marcador (`i * totalMs / max(n − 1, 1)`). En `Viewer.tsx`: `const [lit, setLit] = useState(0)`; un efecto sobre `allCandidates` (identidad de la lista) y `step === "detect"` que, con `prefers-reduced-motion: reduce`, pone `lit = n` de golpe y, si no, programa con `requestAnimationFrame` los instantes de `litSequence` hasta `n`; se limpia al desmontar o si la lista cambia. Los marcadores entran en el `useMemo` de `markers` solo en el paso `detect`.

- [ ] **Step 1: Tests que fallan (`candidateMarkers.test.ts`, puros)**

```ts
it("un marcador por candidato encendido, el seleccionado en el color vivo y el resto apagados", () => {
  const cands = [c(1, 1, 1), c(2, 2, 2), c(3, 3, 3)];
  const out = candidateMarkers(cands, 1, 2);
  expect(out).toHaveLength(2);
  expect(out[1].color).toEqual(CANDIDATE_COLOR);
  expect(out[0].color).toEqual(CANDIDATE_DIM_COLOR);
  expect(out[0].pos).toEqual([1, 1, 1]);
});
it("la secuencia reparte el segundo entre los candidatos y con uno solo enciende en 0", () => {
  expect(litSequence(3)).toEqual([0, 500, 1000]);
  expect(litSequence(1)).toEqual([0]);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/vtk src/pages/Workspace.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/candidateMarkers.ts frontend/src/vtk/candidateMarkers.test.ts frontend/src/vtk/Viewer.tsx frontend/src/vtk/markerColors.ts
git commit -m "Detección: los candidatos se encienden en secuencia al terminar, una vez"
```

---

### Task 8: Dial de medida alrededor del saco y cifras que ruedan en Morfometría

**Files:**
- Create: `frontend/src/vtk/measureDial.ts` (+ `measureDial.test.ts`)
- Modify: `frontend/src/vtk/Viewer.tsx` (líneas del dial en `lines` cuando `step === "morpho"` y hay medida; progreso 0→1 en 800 ms con rAF, de golpe con movimiento reducido)
- Create: `frontend/src/components/morphometry/Odometro.tsx` (+ `Odometro.test.tsx`)
- Modify: `frontend/src/components/morphometry/MorphometryPanel.tsx` (la pestaña Métricas usa `Odometro` para las cifras numéricas)
- Modify: `frontend/src/motion/index.ts` (reexporta `animate` de `motion/react`)

**Interfaces:**
- Produces: `measureDial(center: Vec3, axis: Vec3, radiusMm: number, progress: number, opts = { segments: 48, tickEveryMm: 2, tickLenMm: 0.8 }): MeshLine[]` — circunferencia en el plano perpendicular a `axis` (el eje cuello→ápice que ya calcula el overlay de `Viewer.tsx`), centrada en `center` (el `centroid` de la medida), radio `max_diameter_mm / 2 + 1`, color `DIAL_COLOR = hexToRgb01("#8CBBFF")`, radio de línea 0,12 mm; devuelve solo la fracción `progress` del perímetro (0 → nada, 1 → todo) y las marcas radiales cada `tickEveryMm` de perímetro hasta ese punto. Con `progress` ≤ 0 devuelve `[]`. `Odometro({ value: number | null, decimals: number, duracionMs = 600 })` → `<span data-odometro>` que, al cambiar `value` de `null`/otro a un número, anima desde el valor anterior (o 0) hasta el nuevo con `animate` de `../motion` en `duracionMs` y curva `EASE`, formateando con coma decimal; con `value === null` pinta «—» sin animar; con movimiento reducido (`useReducedMotion`) pinta el valor final de golpe.

- [ ] **Step 1: Tests que fallan**

`measureDial.test.ts`:
```ts
it("sin progreso no dibuja nada y con 1 cierra la circunferencia", () => {
  expect(measureDial([0, 0, 0], [0, 0, 1], 5, 0)).toEqual([]);
  const full = measureDial([0, 0, 0], [0, 0, 1], 5, 1, { segments: 8, tickEveryMm: 100, tickLenMm: 1 });
  expect(full).toHaveLength(8);
  expect(full[7].b).toEqual(full[0].a);
  for (const l of full) expect(Math.hypot(l.a[0], l.a[1])).toBeCloseTo(5, 6);
});
it("las marcas van cada 2 mm de perímetro y hasta donde llega el progreso", () => {
  const half = measureDial([0, 0, 0], [0, 0, 1], 5, 0.5, { segments: 8, tickEveryMm: 2, tickLenMm: 1 });
  const ticks = half.length - 4;
  expect(ticks).toBe(Math.floor((Math.PI * 5) / 2) + 1);
});
```
`Odometro.test.tsx`: «con null pinta — y no anima»; «con movimiento reducido pinta el valor final» (mock de `useReducedMotion` → true; `getByText("12,3")`); «formatea con coma y los decimales pedidos».

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/vtk src/components/morphometry` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/measureDial.ts frontend/src/vtk/measureDial.test.ts frontend/src/vtk/Viewer.tsx frontend/src/components/morphometry/Odometro.tsx frontend/src/components/morphometry/Odometro.test.tsx frontend/src/components/morphometry/MorphometryPanel.tsx frontend/src/motion/index.ts
git commit -m "Morfometría: dial de medida alrededor del saco y cifras que ruedan una vez"
```

---

### Task 9: Comprobación de conjunto y notas en el documento de diseño

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (al final de §7: «Fase 3 completada el <fecha>: pipeline; ver plan …»; en §8.4 anotar que la captura (`composeCapture.ts`) conserva los colores anteriores; en §8.6 anotar que el dial se dibuja en el plano del saco (perpendicular al eje cuello→ápice), no en el de la cámara, y que el estado de guardado muestra la hora («Guardado 12:03») en vez de «hace 2 min»; en §4.4 anotar que las baldosas de la banda nativa en el visor durante la segmentación requieren API y quedan fuera)

- [ ] **Step 1:** `cd frontend && npx vitest run && npx tsc -b` → verde.
- [ ] **Step 2:** Navegador desde el worktree: abrir una sesión YA GUARDADA solo si el backend no está ocupado con una pasada (si `backend/data/shell_runner.log` sigue avanzando, mirar únicamente la pantalla sin sesión: rail, barra, panel de Carga y su pie). Corregir desbordes.
- [ ] **Step 3: Commit de la nota**

```bash
git add docs/superpowers/specs/2026-10-30-rediseno-visual-design.md
git commit -m "Diseño: fase 3 (pipeline) completada"
```

---

## Autorrevisión

- **Cobertura (fase 3):** rail con progreso → T1; barra única + estado de guardado + «◧ Panel» fuera → T2; panel 380/520 con cruce y pie → T3–T5; Segmentación como lista de fases → T4; Detección con encendido → T7; Morfometría con dial y odómetro → T8; Decisión en dos columnas → T5; Dispositivos chips → T5; Informe con PDF embebido → T5; HUD → T6. Las baldosas de la banda nativa en el visor (§4.4 Segmentación) requieren API y quedan fuera: se anota en T9.
- **Nombres:** `PanelFooter`, `RightPanelColumn({ stepKey, wide })`, `SaveStatus`, `StepRail`, `candidateMarkers`/`litSequence`, `measureDial`, `Odometro`, `--hud-text`/`--hud-text-dim` se definen y consumen con esos nombres.
- **Review Focus:** 1 → T1/T3; 2 → T7; 3 → T8; 4 → T3; 5 → T2.
- **Proporción:** nueve tareas, ~330 líneas; los cuerpos no están escritos.
