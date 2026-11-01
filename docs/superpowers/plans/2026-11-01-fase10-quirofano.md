# Correcciones del dueño · Fase 10 («Quirófano») — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que nada del quirófano se pise, se parta ni enseñe códigos internos a ningún tamaño de pantalla (A63–A70 y la banda del visor a ancho estrecho), y que el quirófano sirva para revisar un caso en móvil y tableta (visor + hoja inferior L5 + dock).

**Architecture:** La banda del visor elige un **nivel** por el ancho que mide (`ancho` · `medio` · `estrecho` · `iconos`) y, en pantallas táctiles, siempre `iconos`; su estructura (`flex-wrap`, grupo izquierdo rígido, derecho elástico) hace imposible el solape aunque una cifra falle. El dock, la barra superior y la hoja de atajos eligen **modo** por `matchMedia` con dos consultas nuevas centralizadas en `pipeline/puntosCorte.ts` (móvil ≤ 640, táctil ≤ 1023) más la ya existente de L5 (`useEstrecho`, ≤ 1280). La cinta de rumbo se coloca con una función pura que lee las lecturas de las esquinas. Cada comportamiento por punto de corte se fija con un test que simula la pantalla (`src/test/pantalla.ts`), porque jsdom no maqueta.

**Tech Stack:** React 19, Vite 7, TypeScript, vitest + Testing Library (jsdom), `motion` vía `src/motion`.

**Spec:** `docs/superpowers/specs/2026-11-01-correcciones-dueno-design.md` (secciones «Quirófano» y «Responsive: requisito de toda la ronda»), con la auditoría `docs/superpowers/specs/2026-11-01-auditoria-visual.md` §14 (A63–A70).

## Global Constraints

- React 19 + Vite 7 + TS. Tests: `cd frontend && npx vitest run <ficheros>` (la suite completa tarda 5–7 min: solo en la tarea 12); tipos: `cd frontend && npx tsc -b`.
- Textos en español. Coma decimal en todo lo que lee una persona (`lib/numero.ts`: `cifra`, `cifraCorta`).
- Nunca `git add -A`: commit con lista explícita de ficheros. Los commits terminan con las líneas de atribución de la sesión.
- No usar `sed -i` sobre ficheros CRLF; editar con la herramienta de edición. No editar código con heredocs que lleven barras invertidas.
- Movimiento solo vía `src/motion` (nunca `motion/react` directo); respetar movimiento reducido (`MotionConfig reducedMotion="user"` ya está en `main.tsx`).
- `src/styles/cristal.audit.test.ts` verde: todo botón de solo icono lleva `aria-label`; cristal con `data-glass`.
- Esta fase NO toca Entorno/fondos, marca ni páginas de gestión (fases 8 y 9 van en paralelo en otras ramas). No editar `components/shell/*`, `components/Sheet.tsx`, `components/Button.tsx`, `styles/tokens/*`. Ninguna tarea de este plan los necesita.
- **Matriz de pantalla** (CSS px): anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1920, 2560; altos 600, 768, 900, 1080. El portátil del dueño es 1707×743 CSS (Chrome al 80 %): se añade 1707 a toda matriz de test.
- **Criterios en todos los anchos:** nada se corta ni se pisa; sin scroll horizontal de página; objetivos táctiles ≥ 44 px por debajo de 1024; textos de control ≥ 13 px por debajo de 1024 (excepción declarada: las lecturas del HUD sobre la imagen siguen a 10,5–11 px, ver decisiones); el visor aprovecha el ancho a ≥ 1920.
- **Puntos de corte:** solo los de `pipeline/puntosCorte.ts` (`MQ_MOVIL` 640, `MQ_TACTIL` 1023) y `hooks/useEstrecho` (1280); umbrales de la banda (que se miden sobre la banda, no sobre la ventana) solo en `vtk/mainOptions.ts`. Nada de números sueltos nuevos en componentes. Al fusionar con la fase 8 se alinean con su token/hook (ver nota en `puntosCorte.ts`).
- Cada vista tocada lleva un test que recorre la matriz con `simularPantalla(ancho, alto)` y fija clases/atributos por punto de corte; los altos se recorren para fijar que no cambian el modo salvo donde el plan lo diga.
- Fases: worktree propio (rama `fase10-quirofano`), SDD, fusión local `--no-ff`, sin push.

## Review Focus

1. **El portátil del dueño (1707×743, panel abierto: banda ≈ 1279 px) con CALOR y el aviso largo «Vista previa en baja resolución…»:** una sola fila, nada tapado, el aviso es un ⚠ que al pulsarlo despliega el texto. Test en la tarea 2 (`anchoBanda(1707)` → `medio`, con `hasClipField` y nota larga: el botón ⚠ existe y al pulsarlo aparece `header-level-note-text`).
2. **En táctil no hay tooltips:** ninguna información puede vivir solo en `title`. El aviso de nivel se despliega con un toque (tarea 2), el aviso del paso 4 va también en el nombre accesible (tarea 8) y la píldora del dock mínimo abre la lista de pasos (tarea 9). Test en cada una de esas tareas.
3. **Sesiones reanudadas o antiguas con candidatos sin `rank`, descartados y marcados a mano:** el nombre humano no puede volver a «cand-007» ni numerar mal un descartado. Test en la tarea 6 (`candidateName` con `rank` ausente, con descartado y con marcado a mano; y que el texto del panel no casa `/cand-\d/`).
4. **Re-segmentar después de detectar:** el store vacía candidatos y medida; los pasos 3–4 tienen que perder el ✓ aunque estén por delante del actual. Test en la tarea 8 (`stepDone` con segmentación y sin candidatos → paso 2 no hecho).
5. **Nombres de paciente o caso muy largos a 360 px:** la barra no puede desbordar. Test en la tarea 10 (modo `movil`: solo la última miga, con elipsis y `title` completo; la fila con márgenes de 12 px; el resto lo confirma la pasada de la tarea 12).

---

### Task 1: Puntos de corte del quirófano y simulador de pantalla

**Files:**
- Create: `frontend/src/pipeline/puntosCorte.ts`
- Create: `frontend/src/test/pantalla.ts`
- Test: `frontend/src/test/pantalla.test.ts`

**Interfaces:**
- Consumes: `zonaLibre` de `frontend/src/pipeline/zonaLibre.ts`.
- Produces:
  - `puntosCorte.ts`: `export const MQ_MOVIL = "(max-width: 640px)"`, `export const MQ_TACTIL = "(max-width: 1023px)"`, `export const OBJETIVO_TACTIL_PX = 44`. Comentario de cabecera: «L5 (≤ 1280) sigue en `hooks/useEstrecho`. Alinear con el token/hook de puntos de corte de la fase 8 al fusionar.»
  - `pantalla.ts`: `MATRIZ_ANCHOS = [360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560] as const`, `MATRIZ_ALTOS = [600, 768, 900, 1080] as const`, `cumpleConsulta(q: string, ancho: number, alto: number): boolean`, `simularPantalla(ancho: number, alto?: number): void` (alto por defecto 900; `vi.stubGlobal("matchMedia", …)` con objetos `MediaQueryList` completos y `innerWidth`/`innerHeight`; quien la usa llama a `vi.unstubAllGlobals()` en `afterEach`), `anchoBanda(ancho: number, o?: { ancho520?: boolean; plegado?: boolean }): number` = `ancho − zonaLibre({ estrecho: ancho <= 1280, plegado, ancho: ancho520 }).right`.

- [ ] **Step 1: Write the failing test** (`pantalla.test.ts`)

```ts
it("evalúa max/min de ancho y alto, también encadenadas con and", () => {
  expect(cumpleConsulta("(max-width: 640px)", 640, 900)).toBe(true);
  expect(cumpleConsulta("(max-width: 640px)", 641, 900)).toBe(false);
  expect(cumpleConsulta("(min-width: 1024px) and (max-height: 700px)", 1366, 600)).toBe(true);
  expect(cumpleConsulta("(min-width: 1024px) and (max-height: 700px)", 1366, 768)).toBe(false);
});
it("las preferencias del usuario no se cumplen", () => {
  expect(cumpleConsulta("(prefers-reduced-motion: reduce)", 390, 900)).toBe(false);
});
it("simularPantalla responde a matchMedia", () => {
  simularPantalla(390, 600);
  expect(window.matchMedia(MQ_MOVIL).matches).toBe(true);
  expect(window.matchMedia(MQ_TACTIL).matches).toBe(true);
  expect(window.matchMedia("(max-width: 1280px)").matches).toBe(true);
});
it("ancho de la banda del visor por pantalla", () => {
  expect(anchoBanda(1280)).toBe(1280);   // L5: la hoja va abajo, la banda a todo el ancho
  expect(anchoBanda(1366)).toBe(938);    // inspector 380 + 2×24
  expect(anchoBanda(1707)).toBe(1279);   // el portátil del dueño
  expect(anchoBanda(1366, { ancho520: true })).toBe(798);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/test/pantalla.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implement `puntosCorte.ts` y `pantalla.ts`**

`cumpleConsulta`: parte por ` and `, cada trozo `(max|min)-(width|height): Npx`; cualquier otro trozo (prefers-*, hover…) → `false` para toda la consulta.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/test/pantalla.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pipeline/puntosCorte.ts frontend/src/test/pantalla.ts frontend/src/test/pantalla.test.ts
git commit -m "Quirófano: puntos de corte móvil/táctil y simulador de pantalla para los tests"
```

---

### Task 2: Banda del visor que no se pisa, con niveles por ancho (A63 y hallazgo previo)

**Files:**
- Modify: `frontend/src/vtk/mainOptions.ts`
- Modify: `frontend/src/vtk/ViewerHeader.tsx`
- Modify: `frontend/src/vtk/Viewer.tsx` (llamada a `ViewerHeader` ~l. 2062–2069, `levelNoteShort` ~l. 421 y el comentario de ~l. 2051–2060)
- Test: `frontend/src/vtk/mainOptions.test.ts`, `frontend/src/vtk/ViewerHeader.test.tsx`

**Interfaces:**
- Consumes: `simularPantalla`, `anchoBanda`, `MATRIZ_ANCHOS`, `MATRIZ_ALTOS` (tarea 1); `Icon` `STATUS_WARN`.
- Produces (en `mainOptions.ts`):
  - `WIDE_HEADER_PX = 1400`, `NARROW_HEADER_PX = 1100` (antes 800), `ICON_HEADER_PX = 800`.
  - `type BandTier = "ancho" | "medio" | "estrecho" | "iconos"`.
  - `bandTier(bandWidth: number, touch: boolean): BandTier` — `touch` → `"iconos"`; si no: ≥ 1400 `ancho`, ≥ 1100 `medio`, ≥ 800 `estrecho`, si no `iconos`. `Infinity` (sin medida) → `ancho`.
  - `presetOptions(bandWidth)` y `headerLabels(bandWidth)` mantienen firma; abrevian por debajo del nuevo `NARROW_HEADER_PX`.
- Produces (en `ViewerHeader.tsx`): raíz con `data-tier`, `data-banda="raiz"`; grupos `data-banda="izq"` y `data-banda="der"`; la prop `levelNoteShort` desaparece de `ViewerHeaderProps`.

Comportamiento por nivel (las cifras son anchos estimados a 11 px mono con `.08em` ≈ 7,5 px/carácter; están en el comentario de `mainOptions.ts`):

| elemento | `ancho` ≥ 1400 | `medio` 1100–1399 | `estrecho` 800–1099 |
|---|---|---|---|
| rótulo de la principal | PRINCIPAL | PRINCIPAL | ▸ |
| distribución | DERECHA ABAJO CUATRO SOLA | igual | DER ABA 4 SOLA |
| TEXTOS ▸ | COMPLETO ESENCIAL LIMPIO | igual | C E L |
| aviso de nivel | texto entero, elipsis si no cabe | botón ⚠ ámbar | botón ⚠ ámbar |
| contenido máximo | ≈ 1360 (el aviso encoge) | ≈ 1075 | ≈ 790 |

`iconos` (< 800 o táctil) es la tarea 3; en esta tarea `iconos` pinta lo mismo que `estrecho`.

Estructura (lo que garantiza que no se pisa aunque una cifra falle): raíz `display:flex; flexWrap:"wrap"; justifyContent:"space-between"; columnGap:14; rowGap:0; minHeight:22` (fuera `height:22` y `overflow:hidden`); grupo izquierdo `flex:"0 0 auto"`; grupo derecho `flex:"1 1 auto"; minWidth:0; flexWrap:"wrap"; justifyContent:"flex-end"`. El rótulo PRINCIPAL lleva `fontSize:11, letterSpacing:".08em"` (hoy hereda un tamaño sin fijar). El aviso como botón: `<button type="button" data-testid="header-level-note" aria-label={levelNote} title={levelNote} aria-expanded={noteOpen}>` con `Icon STATUS_WARN` 12 px en `var(--hud-amber)`; al pulsarlo alterna una última línea de la banda `data-testid="header-level-note-text"` (`role="status"`, `flexBasis:"100%"`, ámbar, 11 px) con el texto entero. En `ancho` el aviso es el `<span data-testid="header-level-note">` de hoy con el texto entero.

- [ ] **Step 1: Write the failing tests**

En `mainOptions.test.ts`: cambiar los umbrales de los tests existentes de 800 a 1100 (`presetOptions(1099)` abrevia, `presetOptions(1100)` entero; `headerLabels(1099).mainCaption === "▸"`) y añadir:

```ts
it("bandTier por ancho y táctil", () => {
  expect(bandTier(1400, false)).toBe("ancho");
  expect(bandTier(1399, false)).toBe("medio");
  expect(bandTier(1100, false)).toBe("medio");
  expect(bandTier(1099, false)).toBe("estrecho");
  expect(bandTier(800, false)).toBe("estrecho");
  expect(bandTier(799, false)).toBe("iconos");
  expect(bandTier(2132, true)).toBe("iconos");
  expect(bandTier(Number.POSITIVE_INFINITY, false)).toBe("ancho");
});
```

En `ViewerHeader.test.tsx`: reescribir los tests «estrecha (< 800 px)» con 900 px (nivel `estrecho`: ▸, DER/ABA/4/SOLA, C/E/L) y añadir:

```ts
const NIVEL: Record<number, BandTier> = {
  360: "iconos", 390: "iconos", 768: "iconos", 1024: "estrecho", 1280: "medio",
  1366: "estrecho", 1440: "estrecho", 1707: "medio", 1920: "ancho", 2560: "ancho",
};
it.each(MATRIZ_ANCHOS)("a %i px de pantalla la banda toma su nivel, sea cual sea el alto", (w) => {
  for (const h of MATRIZ_ALTOS) {
    simularPantalla(w, h); stubBandWidth(anchoBanda(w));
    const { container, unmount } = setup();
    expect(container.querySelector('[data-banda="raiz"]')).toHaveAttribute("data-tier", NIVEL[w]);
    unmount();
  }
});
it("la estructura no deja solapar: la raíz y el grupo derecho envuelven, el izquierdo no encoge", () => {
  const { container } = setup();
  expect((container.querySelector('[data-banda="raiz"]') as HTMLElement).style.flexWrap).toBe("wrap");
  expect((container.querySelector('[data-banda="der"]') as HTMLElement).style.flexWrap).toBe("wrap");
  expect((container.querySelector('[data-banda="izq"]') as HTMLElement).style.flexShrink).toBe("0");
});
it("a 1707 con CALOR y aviso largo, el aviso es ⚠ y un clic despliega el texto", () => {
  simularPantalla(1707, 743); stubBandWidth(anchoBanda(1707));
  const note = "Vista previa en baja resolución; las medidas no cambian";
  setup({ hasClipField: true, showClipField: true, levelNote: note });
  const b = screen.getByRole("button", { name: note });
  expect(screen.queryByTestId("header-level-note-text")).toBeNull();
  fireEvent.click(b);
  expect(screen.getByTestId("header-level-note-text")).toHaveTextContent(note);
  expect(b).toHaveAttribute("aria-expanded", "true");
});
it("a ≥ 1400 el aviso va en texto entero", () => {
  stubBandWidth(1500);
  setup({ levelNote: "Vista previa 1:2; las medidas no cambian" });
  expect(screen.getByTestId("header-level-note").textContent).toBe("Vista previa 1:2; las medidas no cambian");
});
```

(Si jsdom normaliza `flex: "0 0 auto"` de otra manera, la aserción usa la forma que devuelva `style.flexShrink`; lo que se fija es que el grupo izquierdo no encoge.) En esta tarea `iconos` aún pinta como `estrecho`; los checks de contenido de `iconos` son de la tarea 3.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/vtk/mainOptions.test.ts src/vtk/ViewerHeader.test.tsx`
Expected: FAIL (`bandTier` no existe; sin `data-tier`; umbral 800).

- [ ] **Step 3: Implement** `bandTier` y constantes en `mainOptions.ts`; la estructura, `data-*`, el aviso-botón y su línea desplegable en `ViewerHeader.tsx` (`touch` = `useMediaQuery(MQ_TACTIL)` de `hooks/useEstrecho`); quitar `levelNoteShort` de la prop y de `Viewer.tsx` (la función `levelNoteFor(…, true)` y su test se quedan). Actualizar el comentario de `Viewer.tsx` sobre los 740 px.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/vtk/mainOptions.test.ts src/vtk/ViewerHeader.test.tsx src/vtk/levelNote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/mainOptions.ts frontend/src/vtk/mainOptions.test.ts frontend/src/vtk/ViewerHeader.tsx frontend/src/vtk/ViewerHeader.test.tsx frontend/src/vtk/Viewer.tsx
git commit -m "Banda del visor: niveles por ancho, aviso como ⚠ desplegable y estructura que no se pisa (A63)"
```

---

### Task 3: Banda del visor en táctil y móvil: modo iconos

**Files:**
- Create: `frontend/src/vtk/ViewerHeaderIconos.tsx`
- Modify: `frontend/src/vtk/ViewerHeader.tsx`
- Modify: `frontend/src/vtk/hud/hud.css`
- Test: `frontend/src/vtk/ViewerHeader.test.tsx`, `frontend/src/vtk/hudLevel.test.tsx`

**Interfaces:**
- Consumes: `bandTier`, `mainOptions()`, `presetOptions(Infinity)` (nombres enteros en las opciones), `HUD_LEVELS`, `MQ_MOVIL`, `MQ_TACTIL`; `Icon` `MPR_VIEW`, `LINK`, `STATUS_WARN`.
- Produces: `ViewerHeaderIconos(props: ViewerHeaderProps & { movil: boolean; noteOpen: boolean; onToggleNote: () => void })`; la raíz de la banda lleva además `data-tactil="true"` (≤ 1023) y `data-movil="true"` (≤ 640).

Contenido en `iconos`, de izquierda a derecha (≈ 350 px a 44 px por objetivo, cabe en 360):
- `<select aria-label="Vista principal" className="viewer-band-select">` con 3D, AX, COR, SAG, VOLUMEN; valor `layout.main`; `onChange` → `promote`.
- `<select aria-label="Distribución" className="viewer-band-select">` con DERECHA, ABAJO, CUATRO, SOLA; valor `layout.preset`; `onChange` → `setPreset`.
- PLANOS: botón icono `MPR_VIEW`, `aria-label="Planos de corte en el 3D"`, `aria-pressed={!planesHidden}`.
- TEXTOS: un botón que rota completo → esencial → limpio (orden de `HUD_LEVELS`); texto `C`/`E`/`L`; `aria-label={`Nivel de textos: ${nivel}. Cambiar (H)`}`.
- VINCULAR: botón icono `LINK`, `aria-pressed={syncViews}`, `aria-label="Vincular las vistas"`.
- CALOR (solo con `hasClipField`): botón «CAL ●/○», `aria-label="Mapa de calor del clip"`, mismo `aria-pressed`/título que hoy.
- Aviso: el botón ⚠ de la tarea 2.
- «?»: no se pinta con `movil` (los atajos son de teclado); sí en tableta.
Si no cabe (nota + CALOR a 360) la banda baja a una segunda fila; nunca se pisa.

CSS en `hud.css`: `.viewer-band-select` (fuente mono heredada, 11 px, mayúsculas, `color: var(--hud-text)`, `background: var(--viewer-bg)`, borde `1px solid var(--hud-text-dim)`, alto 18 px, foco como `.hud-toggle button:focus-visible`); `.viewer-band[data-tactil="true"] { min-height: 44px }`; `.viewer-band[data-tactil="true"] button, .viewer-band[data-tactil="true"] select { min-height: 44px; min-width: 44px; font-size: 13px }`.

- [ ] **Step 1: Write the failing tests**

En `ViewerHeader.test.tsx`:

```ts
it.each([360, 390, 768])("a %i px (táctil) la banda va en iconos con objetivos marcados", (w) => {
  simularPantalla(w); stubBandWidth(anchoBanda(w));
  const { container } = setup({ onHelp: () => {} });
  const raiz = container.querySelector('[data-banda="raiz"]')!;
  expect(raiz).toHaveAttribute("data-tactil", "true");
  expect(screen.getByRole("combobox", { name: "Vista principal" })).toHaveValue(DEFAULT_LAYOUT.main);
  expect(screen.getByRole("combobox", { name: "Distribución" })).toHaveValue(DEFAULT_LAYOUT.preset);
  expect(screen.getByRole("button", { name: "Planos de corte en el 3D" })).toBeInTheDocument();
  expect(screen.queryByText("PRINCIPAL")).toBeNull();
  if (w <= 640) expect(screen.queryByTitle("Atajos (?)")).toBeNull();
  else expect(screen.getByTitle("Atajos (?)")).toBeInTheDocument();
});
it("en iconos, cambiar el desplegable de vista llama a promote y el de distribución a setPreset", () => { /* simularPantalla(390); fireEvent.change(...{ target: { value: "axial" } }) → onLayoutChange(promote(DEFAULT_LAYOUT,"axial")); value "sola" → setPreset */ });
it("en iconos, TEXTOS rota completo → esencial", () => { /* hudLevel "completo"; clic en /Nivel de textos: completo/ → onHudLevelChange("esencial") */ });
it("a 1024 o más no hay marca táctil", () => { /* simularPantalla(1024); stubBandWidth(1024); raíz sin data-tactil; sin combobox */ });
```

En `hudLevel.test.tsx` (ya carga `hud.css` en un `<style>`), un `describe` nuevo:

```ts
it("la banda táctil pide 44 px de alto y 44 px por botón", () => {
  const { container } = render(<div className="viewer-band" data-tactil="true"><button data-t="b">C</button></div>);
  expect(getComputedStyle(container.firstElementChild!).minHeight).toBe("44px");
  expect(getComputedStyle(container.querySelector('[data-t="b"]')!).minWidth).toBe("44px");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/vtk/ViewerHeader.test.tsx src/vtk/hudLevel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `ViewerHeaderIconos.tsx`; `ViewerHeader` lo pinta cuando `tier === "iconos"` y pone `data-tactil`/`data-movil`; las reglas de `hud.css`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/vtk/ViewerHeader.test.tsx src/vtk/hudLevel.test.tsx src/styles/cristal.audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/ViewerHeaderIconos.tsx frontend/src/vtk/ViewerHeader.tsx frontend/src/vtk/ViewerHeader.test.tsx frontend/src/vtk/hud/hud.css frontend/src/vtk/hudLevel.test.tsx
git commit -m "Banda del visor en táctil y móvil: desplegables e iconos de 44 px, sin «?» en móvil"
```

---

### Task 4: Cinta de rumbo a la derecha del rótulo (A64)

**Files:**
- Create: `frontend/src/vtk/hud/headingPlacement.ts`
- Create: `frontend/src/vtk/hud/HudHeadingSlot.tsx`
- Modify: `frontend/src/vtk/hud/HudHeadingTape.tsx`
- Modify: `frontend/src/vtk/Viewer.tsx` (`SceneHeading` ~l. 207–222 y su uso ~l. 1963)
- Test: `frontend/src/vtk/hud/headingPlacement.test.ts`, `frontend/src/vtk/hud/HudHeadingSlot.test.tsx`, `frontend/src/vtk/hud/HudHeadingTape.test.tsx`

**Interfaces:**
- Produces:
  - `headingPlacement.ts`: `READOUT_CHAR_PX = 6.72` (10,5 px × (0,6 + 0,04)), `READOUT_INSET_PX = 14`, `HEADING_GAP_PX = 16`, `HEADING_MIN_PX = 200` (`HEADING_READOUT_PX` 110 + 90 de banda), `HEADING_ROW_TOP_PX = 24`; `interface HeadingPlacement { top: number; left: number; right: number }`; `headingPlacement(cellWidth: number, tl: string[], tr: string[]): HeadingPlacement | null`.
  - `HudHeadingTape` acepta `top?: number; left?: number | string; right?: number | string` (por defecto 6, `"20%"`, `"20%"`: el MIP no cambia).
  - `HudHeadingSlot({ tl, tr, azimuthDeg, elevationDeg, known })`: capa `data-testid="heading-slot"` (`position:absolute; top:0; left:0; right:0; height:0; pointerEvents:none`) que mide su `clientWidth` con `ResizeObserver` (mismo patrón que `ViewerHeader`) y pinta la cinta con la colocación, o nada si es `null`.
- `SceneHeading` recibe `tl: string[]` y `tr: string[]` y pinta `HudHeadingSlot`; Viewer le pasa el `tl` que ya arma y `mode ? [mode] : []`.

Algoritmo (no lo determinan las firmas): `len(s) = [...s].length`; `bordeIzq = 14 + max(len(tl)) × 6,72 + 16`; `bordeDer = 14 + max(len(tr)) × 6,72 + 16`; `left = max(0,2·w, bordeIzq)`; `right = max(0,2·w, bordeDer)`; si `w − left − right ≥ 200` → `{ top: 24, left, right }`; si no, `null` (en una celda así no cabe: se lee al maximizar, como ya pasa en las celdas pequeñas). Listas vacías cuentan como longitud 0.

- [ ] **Step 1: Write the failing tests**

```ts
const TL = ["CANDIDATOS ANEURISMÁTICOS", "Candidato 1 · Ø 11,6 mm est."];
it("se aparta del rótulo de la izquierda cuando el 20 % no basta", () => {
  const p = headingPlacement(800, TL, ["3D"])!;
  expect(p.top).toBe(24);
  expect(p.left).toBeCloseTo(14 + 25 * 6.72 + 16);
  expect(p.right).toBeCloseTo(160);
});
it("con sitio se queda en el 20 % de cada lado", () => {
  expect(headingPlacement(1500, TL, ["3D"])).toEqual({ top: 24, left: 300, right: 300 });
});
it("cuenta la línea más larga, no la primera", () => {
  const p = headingPlacement(1200, ["3D", "VISTA PREVIA · CAPTURA [150HU, 500HU]"], [])!;
  expect(p.left).toBeCloseTo(14 + 37 * 6.72 + 16);
});
it("si no quedan 200 px, no se pinta", () => {
  expect(headingPlacement(450, TL, ["3D"])).toBeNull();
});
```

`HudHeadingSlot.test.tsx`: con `clientWidth` simulado a 800 la capa exterior de la cinta lleva `style.left === "198px"` (redondeo al píxel), `top === "24px"`; a 450 no existe `heading-readout`. `HudHeadingTape.test.tsx`: sin props nuevas mantiene `left: 20%` y `top: 6px`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/vtk/hud/headingPlacement.test.ts src/vtk/hud/HudHeadingSlot.test.tsx src/vtk/hud/HudHeadingTape.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** los dos ficheros nuevos, las props de `HudHeadingTape` y el cambio de `SceneHeading` (redondear `left`/`right` a entero al pintarlos).

- [ ] **Step 4: Run tests to verify they pass**

Run: (el mismo comando del paso 2)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/hud/headingPlacement.ts frontend/src/vtk/hud/headingPlacement.test.ts frontend/src/vtk/hud/HudHeadingSlot.tsx frontend/src/vtk/hud/HudHeadingSlot.test.tsx frontend/src/vtk/hud/HudHeadingTape.tsx frontend/src/vtk/hud/HudHeadingTape.test.tsx frontend/src/vtk/Viewer.tsx
git commit -m "Cinta de rumbo: se coloca a la derecha de las lecturas y se oculta si no cabe (A64)"
```

---

### Task 5: HUD de las celdas en táctil

**Files:**
- Modify: `frontend/src/vtk/Viewer.tsx` (raíz de la rejilla con `data-hud`, ~l. 2077; columna de conmutadores de la escena, ~l. 1977)
- Modify: `frontend/src/vtk/hud/hud.css`
- Test: `frontend/src/vtk/hudLevel.test.tsx`

**Interfaces:**
- Consumes: `MQ_TACTIL` (tarea 1), `useMediaQuery`.
- Produces: la raíz de la rejilla lleva `data-tactil="true"` con `MQ_TACTIL`; la columna de conmutadores de la escena lleva la clase `hud-controls-col` y `maxWidth: "calc(100% - 28px)"` (no `right`: un ancho completo capturaría los clics sobre el 3D).

Reglas: `[data-hud][data-tactil="true"] .hud-toggle { flex-wrap: wrap; row-gap: 4px }` y `[data-hud][data-tactil="true"] .hud-toggle button { min-height: 44px; min-width: 44px; font-size: 13px }`. Las lecturas (`.hud-readout`) no cambian de tamaño (excepción declarada). Sin táctil, nada cambia. El alto de pantalla no cambia nada.

- [ ] **Step 1: Write the failing test** (en el `describe` del CSS real de `hudLevel.test.tsx`)

```ts
it("en táctil los conmutadores de la celda miden 44 px y envuelven; sin táctil, no", () => {
  const { container } = render(
    <div><div data-hud="completo" data-tactil="true"><span className="hud-toggle" data-t="g"><button data-t="b">AX</button></span></div>
         <div data-hud="completo"><span className="hud-toggle" data-t="g2"><button data-t="b2">AX</button></span></div></div>);
  const q = (t: string) => getComputedStyle(container.querySelector(`[data-t="${t}"]`)!);
  expect(q("b").minHeight).toBe("44px");
  expect(q("g").flexWrap).toBe("wrap");
  expect(q("b2").minHeight).not.toBe("44px");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/vtk/hudLevel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** las dos reglas y los dos cambios de `Viewer.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/vtk/hudLevel.test.tsx src/vtk/ViewerGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/Viewer.tsx frontend/src/vtk/hud/hud.css frontend/src/vtk/hudLevel.test.tsx
git commit -m "HUD de las celdas en táctil: objetivos de 44 px y grupos que envuelven"
```

---

### Task 6: «Candidato 1» en vez de «cand-001» (A65)

**Files:**
- Modify: `frontend/src/components/planning/detectCopy.ts`
- Modify: `frontend/src/components/planning/DetectPanel.tsx` (l. 237, 340, 369 y el «Puesto #» de l. 275–280)
- Modify: `frontend/src/components/planning/LesionConfirm.tsx` (`describe`, l. 19–32; botón, l. 161–162)
- Modify: `frontend/src/vtk/hudCandidate.ts`
- Modify: `frontend/src/vtk/Viewer.tsx` (l. 1910: `hudCandidateLine(candidate, morphometry, selectedCandidate >= candidates.length)`)
- Test: `frontend/src/components/planning/detectCopy.test.ts`, `DetectPanel.test.tsx`, `LesionConfirm.test.tsx`, `frontend/src/vtk/hudCandidate.test.ts` (los que existan; crear el de `detectCopy` si no existe)

**Interfaces:**
- Produces: `candidateName(c: { id: string; rank?: number | null; patch_kind?: string | null; channels?: readonly string[] | null }, rejected?: boolean): string` en `detectCopy.ts`:
  - marcado a mano (`isManual`) → `"Marcado a mano"`;
  - `rank > 0` → `rejected ? \`Descartado D${rank}\` : \`Candidato ${rank}\`` (la misma numeración que las etiquetas del 3D, `candidateLabel` en `vtk/candidateOverlay.ts`);
  - sin `rank`: id `cand-NNN` → `rejected ? "Candidato descartado" : \`Candidato ${Number(NNN)}\``; cualquier otro id → `"Candidato"`.
- `hudCandidateLine(candidate, morphometry, rejected = false)`: «Candidato 1 · Ø 10,9 mm», «Candidato 1 · Ø 3,7 mm est.», «Marcado a mano» (antes «cand-00N · marcado a mano»). `Cand` añade `"rank" | "channels"` al `Pick`.
- Los ids (`c.id`) siguen intactos en claves, API, `candidate_id` y comparaciones.

Copia exacta de `LesionConfirm`:
- marcado a mano: `La lesión es un punto marcado a mano.`
- descartado de la lista: `La lesión es «${candidateName(cand, true)}», que el detector descartó.`
- id que ya no está en la lista: `La lesión es un candidato que el detector descartó.`
- marca a mano que coincide con un descartado: `Marcada a mano; coincide con «${candidateName(cand, true)}», que el detector descartó.`
- botón: `Confirmar «${candidateName(cand, rejected)}» como la lesión`, con `rejected = rejectedCandidates.some((x) => x.id === cand.id)`.

En `DetectPanel`: la tarjeta de aceptado titula con `candidateName(c)` en sans 12 px, peso 600, color `--foreground` (ya no mono); se quita el «Puesto #N» de la esquina (repetía el número; `rankLabel` se borra si queda sin uso). Descartados: `candidateName(c, true)`. Aviso de l. 369: `${candidateName(selectedRejected, true)}: ${vetoHint(…)}`.

- [ ] **Step 1: Write the failing tests**

```ts
it("candidateName", () => {
  expect(candidateName({ id: "cand-003", rank: 3 })).toBe("Candidato 3");
  expect(candidateName({ id: "cand-007", rank: 2 }, true)).toBe("Descartado D2");
  expect(candidateName({ id: "cand-009", rank: 0, patch_kind: "manual" })).toBe("Marcado a mano");
  expect(candidateName({ id: "cand-004" })).toBe("Candidato 4");
  expect(candidateName({ id: "cand-004" }, true)).toBe("Candidato descartado");
});
```

`hudCandidate.test.ts`: las tres formas de arriba. `DetectPanel.test.tsx`: con un aceptado `rank 1` y un descartado `rank 1` (id `cand-005`), se ve «Candidato 1» y, al desplegar, «Descartado D1»; `container.textContent` no casa `/cand-\d/`; no hay «Puesto #». `LesionConfirm.test.tsx`: el botón dice «Confirmar «Candidato 1» como la lesión» y el envío sigue mandando `candidate_id: "cand-001"`. Actualizar los asertos existentes que esperaban «cand-00N» como texto visible (no los de ids).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/planning src/vtk/hudCandidate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `candidateName` y los usos listados.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/planning src/vtk/hudCandidate.test.ts src/vtk/candidateOverlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/planning/detectCopy.ts frontend/src/components/planning/detectCopy.test.ts frontend/src/components/planning/DetectPanel.tsx frontend/src/components/planning/DetectPanel.test.tsx frontend/src/components/planning/LesionConfirm.tsx frontend/src/components/planning/LesionConfirm.test.tsx frontend/src/vtk/hudCandidate.ts frontend/src/vtk/hudCandidate.test.ts frontend/src/vtk/Viewer.tsx
git commit -m "Candidatos con nombre humano («Candidato 1», «Descartado D2») en panel, visor y confirmación (A65)"
```

(Ajustar la lista a los tests que existan de verdad.)

---

### Task 7: Pies de panel sin botones partidos y enlace «Más» (A66, A70)

**Files:**
- Modify: `frontend/src/components/PanelFooter.tsx`
- Modify: `frontend/src/styles/responsive.css` (junto a `.ws-panel-footer`, ~l. 90)
- Modify: `frontend/src/components/segmentation/SegmentPanel.tsx` (pie, l. 709–728)
- Modify: `frontend/src/components/planning/DetectPanel.tsx` (pie, ~l. 425–440; «Más», ~l. 199–211)
- Test: `frontend/src/components/PanelFooter.test.tsx`, `SegmentPanel.test.tsx`, `DetectPanel.test.tsx`

**Interfaces:**
- Produces: `export function PanelActions({ children }: { children: ReactNode })` en `PanelFooter.tsx` → `<div className="ws-panel-actions">`.
- CSS: `.ws-panel-actions { display: flex; flex-wrap: wrap; gap: 10px; }` y `.ws-panel-actions > * { flex: 1 1 auto; white-space: nowrap; }`. Si los dos botones no caben en una fila (≈ 340 px: a 360 de pantalla, dentro de la hoja), el segundo baja a otra fila y los dos ocupan todo el ancho; desde 390 y en el inspector de 380 van en una fila. Ningún cambio por alto.
- `SegmentPanel` y `DetectPanel` envuelven sus dos botones en `PanelActions` y quitan el `flex: 1` en línea de los botones (la línea ganaría a la clase). Orden: secundaria primero, principal al final. Los textos no cambian.
- «Más»/«Menos»: `<Button variant="link" size="sm" aria-expanded={showMore}>` con `trailingIcon` = `motion.span` (de `src/motion`) que contiene `Icon CHEVRON_RIGHT` 12 px y anima `rotate: showMore ? 90 : 0` con `DUR.respuesta`; el movimiento reducido lo apaga `MotionConfig`.

- [ ] **Step 1: Write the failing tests**

`PanelFooter.test.tsx` (carga `styles/responsive.css` con `readFileSync` en un `<style>`, como `hudLevel.test.tsx`):

```ts
it.each([360, 768, 1440])("a %i px los botones del pie no se parten y la fila envuelve", (w) => {
  simularPantalla(w);
  const { container } = render(<PanelFooter><PanelActions><button>Re-segmentar</button><button>Continuar a detección</button></PanelActions></PanelFooter>);
  const fila = container.querySelector(".ws-panel-actions")!;
  expect(getComputedStyle(fila).flexWrap).toBe("wrap");
  for (const b of fila.querySelectorAll("button")) expect(getComputedStyle(b).whiteSpace).toBe("nowrap");
});
```

`SegmentPanel.test.tsx` / `DetectPanel.test.tsx`: «Re-segmentar»/«Re-detectar» y «Continuar a detección»/«Analizar morfometría» están dentro de `.ws-panel-actions` y su `style.flex` está vacío. `DetectPanel.test.tsx`: «Más» es un botón con `aria-expanded="false"` que pasa a «Menos» con `aria-expanded="true"` y enseña el primer texto de `DETECT_MORE`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/PanelFooter.test.tsx src/components/segmentation/SegmentPanel.test.tsx src/components/planning/DetectPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `PanelActions`, las dos reglas CSS, los dos pies y el enlace «Más».

- [ ] **Step 4: Run tests to verify they pass**

Run: (el mismo comando del paso 2) y `npx vitest run src/styles/cristal.audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PanelFooter.tsx frontend/src/components/PanelFooter.test.tsx frontend/src/styles/responsive.css frontend/src/components/segmentation/SegmentPanel.tsx frontend/src/components/segmentation/SegmentPanel.test.tsx frontend/src/components/planning/DetectPanel.tsx frontend/src/components/planning/DetectPanel.test.tsx
git commit -m "Pies de panel: botones sin partir que bajan de fila si no caben; «Más» como enlace con chevrón (A66, A70)"
```

---

### Task 8: Dock: hechos por resultado y aviso del paso 4 (A67, A68)

**Files:**
- Create: `frontend/src/pipeline/stepGate.ts`
- Modify: `frontend/src/pipeline/steps.ts`
- Modify: `frontend/src/components/stepper/StepDock.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (quitar `missingFor` local, l. 52–70; registro de mandos, l. 263–270; `StepDock`, l. 487–495; atajo de dígitos, l. 325)
- Test: `frontend/src/pipeline/stepGate.test.ts`, `frontend/src/components/stepper/StepDock.test.tsx`, `frontend/src/pages/Workspace.test.tsx`

**Interfaces:**
- Produces:
  - `steps.ts`: `export const MORPHO_AUTO_HINT = "Al abrirlo calcula la morfometría del candidato elegido";`
  - `stepGate.ts`, con `type GateState = Pick<ReturnType<typeof usePlanning>, "series" | "segmentation" | "candidates" | "rejectedCandidates" | "morphometry" | "treatment" | "clipPlan" | "plannedClips">`:
    - `stepMissing(i: number, p: GateState): string | null` — la función `missingFor` de Workspace, movida tal cual.
    - `stepDone(i: number, p: GateState): boolean` — 0: `!!series`; 1: `!!segmentation`; 2: `canAdvanceFromDetect(candidates, rejectedCandidates)`; 3: `!!morphometry`; 4: `!!treatment`; 5: `clipPlan !== null || (plannedClips?.length ?? 0) > 0`; 6 y 7: `false` (sin resultado propio).
    - `stepAviso(i: number, p: GateState): string | null` — `MORPHO_AUTO_HINT` si `STEPS[i].key === "morpho"`, `!p.morphometry` y `stepMissing(i, p) === null`; si no, `null`.
  - `StepDock` props nuevas: `doneFor?: (i: number) => boolean`, `avisoFor?: (i: number) => string | null`.
- Regla del dock: `done = !active && !locked && (doneFor?.(i) === true || i < consecutivos)` (se conserva la regla de hoy para lo recorrido en orden y se añade lo completado, esté antes o después del actual). Con aviso: `title = \`${label}${opcional} — ${aviso}\``; `aria-label = \`Paso ${i + 1}, ${label}${opcional}. ${aviso}\``. El comportamiento al pulsar NO cambia.
- Workspace: `missingFor={(i) => stepMissing(i, planning)}`, `doneFor={(i) => stepDone(i, planning)}`, `avisoFor={(i) => stepAviso(i, planning)}`; los mandos de paso de la paleta llevan `hint: stepAviso(i, planning) ?? undefined`.

- [ ] **Step 1: Write the failing tests**

```ts
// stepGate.test.ts
const base = { series: {}, segmentation: {}, candidates: [{ id: "cand-001", rank: 1 }], rejectedCandidates: [],
  morphometry: null, treatment: null, clipPlan: null, plannedClips: null } as unknown as GateState;
it("hecho = tiene resultado", () => {
  expect([0, 1, 2, 3].map((i) => stepDone(i, base))).toEqual([true, true, true, false]);
});
it("re-segmentar vacía lo de después: sin candidatos el paso 3 deja de estar hecho", () => {
  expect(stepDone(2, { ...base, candidates: [] })).toBe(false);
});
it("el paso 4 avisa de que calculará la morfometría solo si aún no la hay y se puede abrir", () => {
  expect(stepAviso(3, base)).toBe(MORPHO_AUTO_HINT);
  expect(stepAviso(3, { ...base, morphometry: {} } as GateState)).toBeNull();
  expect(stepAviso(3, { ...base, candidates: [] })).toBeNull();
  expect(stepAviso(2, base)).toBeNull();
});
```

`StepDock.test.tsx`:

```ts
it("un paso completado después del actual lleva la marca de hecho", () => {
  render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} doneFor={(i) => i <= 2} onGo={() => {}} />);
  expect(screen.getByRole("button", { name: /Paso 2,/ })).toHaveAttribute("data-estado", "hecho");
  expect(screen.getByRole("button", { name: /Paso 3,/ })).toHaveAttribute("data-estado", "hecho");
  expect(screen.getByRole("button", { name: /Paso 4,/ })).toHaveAttribute("data-estado", "pendiente");
});
it("el aviso va en el tooltip y en el nombre accesible, y pulsar sigue navegando", () => {
  const onGo = vi.fn();
  render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} avisoFor={(i) => (i === 3 ? MORPHO_AUTO_HINT : null)} onGo={onGo} />);
  const b = screen.getByRole("button", { name: `Paso 4, Morfometría. ${MORPHO_AUTO_HINT}` });
  expect(b).toHaveAttribute("title", `Morfometría — ${MORPHO_AUTO_HINT}`);
  fireEvent.click(b);
  expect(onGo).toHaveBeenCalledWith(3);
});
```

`Workspace.test.tsx`: con `series`, `segmentation` y un candidato en el store y paso inicial 0, el dock marca «hecho» los pasos 2 y 3 y el paso 4 lleva el aviso en su nombre.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pipeline/stepGate.test.ts src/components/stepper/StepDock.test.tsx src/pages/Workspace.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `stepGate.ts`, `MORPHO_AUTO_HINT`, las props del dock y el cableado de Workspace.

- [ ] **Step 4: Run tests to verify they pass**

Run: (el mismo comando del paso 2) y `npx vitest run src/App.paleta.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pipeline/stepGate.ts frontend/src/pipeline/stepGate.test.ts frontend/src/pipeline/steps.ts frontend/src/components/stepper/StepDock.tsx frontend/src/components/stepper/StepDock.test.tsx frontend/src/pages/Workspace.tsx frontend/src/pages/Workspace.test.tsx
git commit -m "Dock: marca hechos los pasos con resultado aunque vayan después; el paso 4 avisa de que medirá (A67, A68)"
```

---

### Task 9: Dock por tamaño de pantalla

**Files:**
- Modify: `frontend/src/components/stepper/StepDock.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (cálculo del modo y llamada a `StepDock`)
- Test: `frontend/src/components/stepper/StepDock.test.tsx`, `frontend/src/pages/Workspace.test.tsx`

**Interfaces:**
- Consumes: `MQ_MOVIL`, `MQ_TACTIL` (tarea 1), `useEstrecho`, `useMediaQuery`, `openCommandPalette`, props de la tarea 8.
- Produces: `StepDock` sustituye `compacto?: boolean` por `modo?: "completo" | "compacto" | "tactil" | "mini"` (por defecto `"completo"`) y pone `data-modo` en el `<nav>`. Workspace: `modoDock = movil ? "mini" : tactil ? "tactil" : estrecho ? "compacto" : "completo"`.

| pantalla | modo | qué se ve |
|---|---|---|
| ≤ 640 (360, 390) | `mini` | `‹` paso anterior (44×44, `Icon BACK`, `aria-label="Paso anterior: <rótulo>"`), píldora `N/8 · Rótulo` (alto 44, 13 px, peso 600, elipsis a 180 px, `aria-label="Paso N de 8, <rótulo>. Ver todos los pasos"`, abre la paleta de mandos), `›` paso siguiente (`Icon ARROW_RIGHT`; `aria-disabled` y `title` con el motivo si está bloqueado; con aviso de la tarea 8, el aviso va en su nombre). Sin ⌘K. `left: 12`. |
| 641–1023 (768) | `tactil` | los 8 botones a 44 px con número/✓, sin ampliación ni rótulo flotante; ⌘K con alto 44. `left: 24`. |
| 1024–1280 (1024, 1280) | `compacto` | como hoy en estrecho: 36 px, sin ampliación. |
| ≥ 1281 (1366 … 2560, 1707) | `completo` | como hoy: 44 px, activo 60, ampliación bajo el puntero, rótulo flotante. |

La posición vertical (`abajo`, sobre la hoja) y la capa no cambian. El alto de pantalla no cambia el modo.

- [ ] **Step 1: Write the failing tests**

`StepDock.test.tsx`: en `mini` hay exactamente tres botones de pasos (anterior, píldora, siguiente), la píldora llama a `openCommandPalette` (espiar `lib/commands`), «‹» en el paso 0 está deshabilitado y «›» con `missingFor(i+1)` lleva `aria-disabled="true"` y el motivo en `title`; en `tactil` cada botón de paso mide `style.width === "44px"`; en `compacto`, `"36px"`.

`Workspace.test.tsx`:

```ts
const MODO: Record<number, string> = { 360: "mini", 390: "mini", 768: "tactil", 1024: "compacto", 1280: "compacto",
  1366: "completo", 1440: "completo", 1707: "completo", 1920: "completo", 2560: "completo" };
it.each(MATRIZ_ANCHOS)("a %i px el dock va en su modo, a cualquier alto", (w) => {
  for (const h of MATRIZ_ALTOS) {
    simularPantalla(w, h);
    const { unmount } = montar();
    expect(screen.getByRole("navigation", { name: "Flujo de planificación" })).toHaveAttribute("data-modo", MODO[w]);
    unmount();
  }
});
```

Los `describe` de modo estrecho de `Workspace.test.tsx` que hoy simulan `matches: true` para toda consulta pasan a `simularPantalla(1100)` (L5 sin táctil), para que sigan probando lo que prueban.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/stepper/StepDock.test.tsx src/pages/Workspace.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** los cuatro modos en `StepDock` y el cálculo en Workspace.

- [ ] **Step 4: Run tests to verify they pass**

Run: (el mismo comando del paso 2) y `npx vitest run src/styles/cristal.audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stepper/StepDock.tsx frontend/src/components/stepper/StepDock.test.tsx frontend/src/pages/Workspace.tsx frontend/src/pages/Workspace.test.tsx
git commit -m "Dock por pantalla: mínimo en móvil, 44 px en tableta, compacto en L5 y completo en escritorio"
```

---

### Task 10: Barra del quirófano por tamaño de pantalla

**Files:**
- Modify: `frontend/src/components/stepper/QuirofanoBar.tsx`
- Modify: `frontend/src/components/stepper/SaveStatus.tsx`
- Modify: `frontend/src/components/RecordButton.tsx`
- Modify: `frontend/src/pages/Workspace.tsx` (acciones de la barra, l. 417–470; mandos de la paleta, l. 263–275)
- Test: `frontend/src/components/stepper/QuirofanoBar.test.tsx`, `frontend/src/components/stepper/SaveStatus.test.tsx`, `frontend/src/pages/Workspace.test.tsx`

**Interfaces:**
- Consumes: `MQ_MOVIL`, `MQ_TACTIL`, `useThemeContext` (`store/theme.tsx`), `openCommandPalette`, `rotuloAccion`.
- Produces:
  - `QuirofanoBar` prop `modo?: "ancho" | "tactil" | "movil"` (por defecto `"ancho"`), `data-modo` en la fila.
  - `SaveStatus` prop `compacta?: boolean`: solo el punto; el texto en un `<span>` visualmente oculto (el mismo estilo de recorte que ya usa `QuirofanoBar` para «HC») y en `title`; `role="status"` se queda.
  - `RecordButton` prop `size?: "sm" | "md"` (por defecto `"sm"`).
  - Workspace: `modoBarra = movil ? "movil" : tactil ? "tactil" : "ancho"`; mandos nuevos en la paleta (grupo `acciones`): `tema` («Cambiar a tema oscuro» / «Cambiar a tema claro», siempre) y `archivar` (rótulo `ARCHIVAR_EN_CASO` o «Adjuntar a un caso», solo con `sessionId && !imagingStudyId`, abre la hoja de adjuntar).

| pantalla | modo | barra |
|---|---|---|
| ≥ 1024 | `ancho` | como hoy (≤ 1366 solo iconos en las acciones, ya existente). |
| 641–1023 | `tactil` | volver 44×44; acciones `size="md"` (44); Grabar `size="md"`; `SaveStatus compacta`; ⌘K sustituido por «⋯» (`Icon MENU`, 44, `aria-label="Más acciones"`, `title="Más acciones: paleta de mandos"`, abre la paleta); sin `ThemeToggle` (el tema va a la paleta). |
| ≤ 640 | `movil` | lo de `tactil` y además: fila con `left/right: 12` y `gap: 8`; solo la última miga (con elipsis y `title`); sin insignia de riesgo (está en Morfometría); acciones solo Captura y Guardar progreso (Grabar y Archivar fuera; Archivar va a la paleta; grabar vídeo no se ofrece en móvil). |

El menú de usuario (`shell/UserMenu`) no se toca: su objetivo táctil es de la fase 8 (ver decisiones). El alto de pantalla no cambia el modo.

- [ ] **Step 1: Write the failing tests**

`QuirofanoBar.test.tsx`: en `movil` con tres migas solo se pinta la última y lleva `title` con su texto; la fila tiene `style.left === "12px"` y `style.right === "12px"`; sin insignia de riesgo; hay «Más acciones» y no hay «Abrir la paleta de mandos (Ctrl+K)» ni botón de tema; el botón de volver mide 44 (`style.width`/`height`). En `ancho`, ⌘K y tema siguen.

`SaveStatus.test.tsx`: `compacta` mantiene `role="status"` con el texto accesible «Cambios sin guardar» y `title` igual.

`Workspace.test.tsx`:

```ts
it.each(MATRIZ_ANCHOS)("a %i px la barra va en su modo y sus acciones", (w) => {
  simularPantalla(w);
  montar();
  const modo = w <= 640 ? "movil" : w <= 1023 ? "tactil" : "ancho";
  expect(document.querySelector("[data-banda-superior] [data-modo]")).toHaveAttribute("data-modo", modo);
  expect(!!screen.queryByRole("button", { name: /Grabar/ })).toBe(modo !== "movil");
  expect(!!screen.queryByRole("button", { name: "Más acciones" })).toBe(modo !== "ancho");
  if (modo !== "ancho") expect(screen.getByRole("button", { name: "Guardar progreso" }).style.height).toBe("var(--control-md)");
});
it("la paleta ofrece el tema y, sin estudio archivado, archivar", () => { /* comandos «Cambiar a tema …» y «Archivar en un caso» registrados */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/stepper/QuirofanoBar.test.tsx src/components/stepper/SaveStatus.test.tsx src/pages/Workspace.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** los modos de la barra, `SaveStatus compacta`, `RecordButton size`, y en Workspace el modo, las acciones por modo y los dos mandos.

- [ ] **Step 4: Run tests to verify they pass**

Run: (el mismo comando del paso 2) y `npx vitest run src/App.paleta.test.tsx src/components/RecordButton.test.tsx src/styles/cristal.audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stepper/QuirofanoBar.tsx frontend/src/components/stepper/QuirofanoBar.test.tsx frontend/src/components/stepper/SaveStatus.tsx frontend/src/components/stepper/SaveStatus.test.tsx frontend/src/components/RecordButton.tsx frontend/src/pages/Workspace.tsx frontend/src/pages/Workspace.test.tsx
git commit -m "Barra del quirófano por pantalla: «⋯» y objetivos de 44 px en táctil, solo lo esencial en móvil"
```

---

### Task 11: Hoja de atajos a dos columnas y a pantalla completa en móvil (A69)

**Files:**
- Modify: `frontend/src/vtk/hud/ShortcutsSheet.tsx`
- Test: `frontend/src/vtk/hud/ShortcutsSheet.test.tsx`

**Interfaces:**
- Consumes: `MQ_MOVIL`, `MQ_TACTIL`, `useMediaQuery`, `Icon CLOSE`.
- Produces: tarjeta con `data-movil="true"` en móvil; botón `aria-label="Cerrar"` en la cabecera (en táctil no hay Esc ni «clic fuera» a pantalla completa).

Comportamiento:
- Rejilla de secciones: `gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))"` → 2×2 (Visor | Celda, Flujo | Ratón) a partir de una tarjeta de ≈ 744 px (pantallas ≥ 1024 con el tope de 920), una columna por debajo.
- Cada `<dl>`: `gridTemplateColumns: "minmax(0, 22ch) minmax(0, 1fr)"`; `<dt>` sin `nowrap` (parte solo por espacios: «Mayús+arrastrar o botón central» en dos líneas; «Ctrl+rueda» entera). La descripción tiene el resto de la columna: «Corte siguiente o anterior» en una línea a ≥ 1024.
- ≤ 640: el fondo pierde el `padding`, la tarjeta ocupa `width: 100%`, `height: 100%`, sin `maxWidth` ni borde.
- ≤ 1023: tamaño de letra 13 px en la tarjeta y botón «Cerrar» de 44×44; desde 1024, 11 px y «Cerrar» de 24×24.
- Todos los altos: `maxHeight: 100%` y `overflow: auto` (la hoja no puede crecer más que la pantalla; a 600 de alto desplaza dentro).

- [ ] **Step 1: Write the failing tests**

```ts
it.each(MATRIZ_ANCHOS)("a %i px la hoja toma su forma, a cualquier alto", (w) => {
  for (const h of MATRIZ_ALTOS) {
    simularPantalla(w, h);
    const { unmount } = render(<ShortcutsSheet open onClose={() => {}} />);
    const card = screen.getByRole("dialog", { name: "Atajos" });
    expect(card.style.overflow).toBe("auto");
    if (w <= 640) { expect(card).toHaveAttribute("data-movil", "true"); expect(card.style.height).toBe("100%"); }
    else expect(card.style.maxWidth).toBe("920px");
    expect(screen.getByRole("button", { name: "Cerrar" }).style.width).toBe(w <= 1023 ? "44px" : "24px");
    unmount();
  }
});
it("la columna de teclas tiene tope de 22ch y las teclas pueden partir por espacios", () => {
  render(<ShortcutsSheet open onClose={() => {}} />);
  const dl = document.querySelector("dl") as HTMLElement;
  expect(dl.style.gridTemplateColumns).toBe("minmax(0, 22ch) minmax(0, 1fr)");
  expect((dl.querySelector("dt") as HTMLElement).style.whiteSpace).not.toBe("nowrap");
});
it("«Cerrar» cierra", () => { /* clic → onClose */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/vtk/hud/ShortcutsSheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** los cambios de estilo, `data-movil` y el botón «Cerrar» (el foco inicial sigue en la tarjeta; Tab llega al botón).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/vtk/hud/ShortcutsSheet.test.tsx src/styles/cristal.audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/vtk/hud/ShortcutsSheet.tsx frontend/src/vtk/hud/ShortcutsSheet.test.tsx
git commit -m "Hoja de atajos: dos columnas con sitio para la descripción, pantalla completa y «Cerrar» en móvil (A69)"
```

---

### Task 12: Verificación final: suite, tipos, auditoría y pasada por la matriz en el navegador

Esta tarea la hace el controlador, no un subagente implementador.

**Files:**
- Ninguno de código salvo arreglos que salgan de la pasada (cada arreglo, su test y su commit).

- [ ] **Step 1: Suite completa y tipos**

Run: `cd frontend && npx vitest run` (5–7 min) y `npx tsc -b`
Expected: todo verde; `cristal.audit.test.ts` incluido.

- [ ] **Step 2: Servidores locales**

Backend y frontend con `Start-Process` (no en shells de fondo de la sesión), comprobando que no hay un backend viejo en :8000. Abrir un caso guardado con detección y morfometría (p. ej. el paciente «Zenodo, Caso 015»).

- [ ] **Step 3: Pasada por la matriz**

Anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560 × altos 600, 768, 900, 1080. Para anchos que la ventana no alcanza, iframe del mismo origen (recarga VTK: esperar al volumen). En cada punto, captura y comprobación de:
- banda del visor: nivel esperado (tabla de la tarea 2/3), nada pisado, a 1707×743 con el panel abierto una sola fila y el ⚠ desplegable;
- cinta de rumbo en el paso 3: no toca «CANDIDATOS ANEURISMÁTICOS» ni la línea del candidato; oculta solo si la celda no da;
- HUD de celda: conmutadores de 44 px en táctil, envueltos dentro de la celda;
- dock: modo de la tabla de la tarea 9; en móvil, «‹ N/8 · Rótulo ›» y la píldora abre la paleta;
- barra superior: modo de la tabla de la tarea 10, sin desbordar a 360 con el nombre de paciente más largo disponible;
- hoja inferior L5 (≤ 1280): asomar/media/completa usables; pies de panel sin botones partidos (a 360 en dos filas);
- hoja de atajos (tecla «?» o botón): dos columnas a ≥ 1024, una por debajo, pantalla completa con «Cerrar» en móvil;
- «Candidato 1» en panel, visor y confirmación; paso 4 con el aviso en el tooltip;
- volver al paso 1 con 2 y 3 hechos: siguen con ✓;
- sin scroll horizontal de página en ningún punto.

- [ ] **Step 4: Arreglos**

Cada desviación: test que la fije en la tarea correspondiente + arreglo + commit con lista explícita. Repetir la suite al final.

- [ ] **Step 5: Fusión**

`git merge --no-ff fase10-quirofano` en `main`, sin push. Anotar en el libro de la ronda las notas de alineación con la fase 8 (puntos de corte, ⌘K del dock, objetivo táctil del menú de usuario).

---

## Decisiones tomadas en este plan

- **Banda en táctil = siempre modo iconos**, aunque la banda mida más de 800 px (tableta 800–1023): a 44 px y 13 px los rótulos de `estrecho` ya no caben en una fila.
- **Desplegables nativos con estilo HUD** en el modo iconos (no el `Select` D): la banda es HUD mono y el selector nativo es el mejor en el móvil.
- **El aviso de nivel ya no tiene forma corta**: o texto entero (≥ 1400) o ⚠ que se despliega con un toque. Se retira `levelNoteShort` de la banda (la función `levelNoteFor(…, true)` y su test se quedan).
- **Cinta de rumbo: a la derecha del rótulo o nada**; sin colocación apilada (la columna de conmutadores de la izquierda no tiene ancho conocido).
- **Excepción a «textos ≥ 13 px»**: las lecturas sobre la imagen (HUD) siguen a 10,5–11 px; los controles táctiles sí pasan a 13 px. Decisión para el dueño.
- **«Puesto #N» se quita** de la tarjeta del aceptado: repetía el número de «Candidato N».
- **Descartados se nombran «Descartado D2»**, como la etiqueta «D2» del 3D.
- **Hecho = tiene resultado o se recorrió en orden** (se conserva la regla de hoy y se añade la nueva). Fabricación e Informe no tienen resultado propio: solo se marcan por la regla de orden.
- **En móvil no se ofrece grabar vídeo**; el tema y archivar pasan a la paleta (que en táctil se abre con «⋯»).
