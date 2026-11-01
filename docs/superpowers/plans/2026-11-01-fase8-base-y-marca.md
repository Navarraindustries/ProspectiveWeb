# Correcciones del dueño · Fase 8 (base común y marca) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el fondo de TC por el fondo «ambiente», dar a la oficina una base común (puntos de corte únicos, `PageBody`, barra superior y barra lateral adaptables, hoja que suelta el puntero y ocupa la pantalla en móvil, botón *outline* claro, «Ctrl K»), rehacer Entrar/Crear cuenta/cambio forzado sobre el cristal y estrenar la marca nueva (icono D «corte axial» + logotipo «Prospective™» en Sora 600, favicon).

**Architecture:** Un módulo de puntos de corte (`styles/puntosCorte.ts` + `tokens/breakpoints.css` + hooks en `hooks/useEstrecho.ts`) que usan todas las tareas, con un auxiliar de pruebas (`test/pantalla.ts`) que simula `matchMedia` por ancho y alto para fijar el comportamiento por punto de corte. El fondo es CSS puro (`styles/ambiente.css`) con tokens `--ambient-*`; la marca es SVG en línea (`components/shell/Logo.tsx`) y Sora autoalojada. Los cambios de páginas internas se limitan a quitar sus anchos propios y a pasar sus acciones de barra a datos (`AccionBarra[]`); su interior es la fase 9.

**Tech Stack:** React 19 + Vite 7 + TypeScript, `motion` 12 (barrel `src/motion`), vitest + Testing Library (jsdom), CSS plano con tokens; fonttools (venv aparte) para Sora; Python estándar para los PNG del favicon.

**Spec:** `docs/superpowers/specs/2026-11-01-correcciones-dueno-design.md` (secciones «Responsive», «Fondo ambiente», «Marca», «Base común de la oficina», fila 8 de «Fases»), con la auditoría `docs/superpowers/specs/2026-11-01-auditoria-visual.md` §2 (A14, A15), §3 (A16–A21; A22 es fase 9), §13 (A61, A62). Material D de referencia: `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §4. Marca: lienzo `https://claude.ai/artifact/7yiA2DemzaQQzWGd9ndEL5`; los SVG exactos están copiados en la tarea 2.

## Global Constraints

- Trabajo en el worktree de la fase (rama `fase8-base-marca`, creada con `superpowers:using-git-worktrees`; `npm ci` en `frontend/` del worktree). Al final, fusión local `--no-ff` a `main`, **sin push**.
- Frontend React 19 + Vite 7 + TS. Pruebas desde `frontend/`: `npx vitest run <ficheros>` por tarea; la suite completa (`npx vitest run`, 5–7 min) y `npx tsc -b` en la tarea 13. Ninguna tarea se da por hecha con tests rojos o errores de tipos en los ficheros que toca.
- Textos de interfaz en español; coma decimal en lo que lee una persona (`lib/numero.ts`).
- Commits con lista explícita de ficheros: **nunca `git add -A` ni `git add .`** (hay datos de pacientes sin versionar en `data/` y `frontend/data/`). Borrados con `git rm <ruta>`. Mensajes en español, terminados con:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Jvb98Z7qUQgpAZH17ZDo2f`.
- Editar con Edit/Write. No `sed -i` sobre ficheros CRLF; no heredocs de Python (`python - <<'PY'`) con escapes de barra invertida.
- La landing sigue anclada en oscuro (`data-theme="dark"` en `Landing.tsx`).
- `prefers-reduced-motion: reduce` → solo opacidad (`fundido`), sin escala ni desplazamiento; `prefers-reduced-transparency: reduce` → cristal opaco y fondo ambiente plano (sin brillos ni grano).
- `src/styles/cristal.audit.test.ts`, `src/styles/tokens.test.ts` y `src/styles/contraste.ts` siguen verdes: textos a 4,5:1 sobre el fondo nuevo en los dos temas. Ningún color literal en `pages/`, `components/shell/`, `components/patients/`, `components/ficha/` (lo vigila `tokens.test.ts`): todo color sale de un token.
- Cristal: todo elemento con `glass("normal" | "dense" | "viewer")` lleva `data-glass` (lo exige la auditoría).
- **Puntos de corte** (tarea 1): móvil ≤ 640, tableta ≤ 1024, estrecho (L5) ≤ 1280, grande ≥ 1920. Ningún número de corte nuevo fuera de esos (ni 1100 ni 820 ni 760): se importan `CONSULTA`/hooks en TS y se escriben esos mismos valores en `@media` de CSS (las variables CSS no valen dentro de `@media`). Lo vigila `styles/puntosCorte.audit.test.ts`.
- **Matriz de pantallas** (spec «Responsive»): anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1920, 2560 CSS px; altos 600, 768, 900, 1080+. El portátil del dueño es Chrome al 80 %: 1707×743 CSS.
- **Criterios en toda vista tocada y todo ancho:** nada se corta ni se pisa; ningún scroll horizontal de página; ningún scroll interno si el contenedor puede crecer; objetivos táctiles ≥ 44 px por debajo de 1024 (`--control-md`); texto ≥ 13 px (excepciones: rótulos mono en mayúsculas `--text-eyebrow` 11 px, códigos mono como la HC, «™» y la firma «por SkullApp» del logotipo); hojas a pantalla completa en móvil; a ≥ 1920 el contenido se queda en `--content-max` (1280), el lienzo (visor, landing) no.
- Cada vista tocada lleva un test que fija su comportamiento por punto de corte con `simularPantalla` (tarea 1), porque jsdom no maqueta. Lo que es CSS puro se fija leyendo la hoja con `readFileSync` (patrón de `AppShell.test.tsx`).

## Review Focus

1. **Crear cuenta y Entrar a 360 px**: hoy `.login-form` lleva `minWidth: 340` (Signup) y `320` (Login) más 32 px de margen → scroll horizontal. Se espera que a ≤ 1024 el `minWidth` sea `0` y nada desborde (test en la tarea 12).
2. **Altura 600 (portátil bajo, móvil apaisado)**: el menú «⋯» abierto cerca del borde inferior debe abrirse hacia arriba en vez de salirse de la pantalla (test en la tarea 8); formularios y hojas desplazan su cuerpo y el pie queda visible (se comprueba en la tarea 13).
3. **Cajón de secciones en móvil**: Escape, tocar fuera o navegar lo cierran y devuelven el foco al botón que lo abrió; si la ventana pasa de 640 con el cajón abierto, se cierra y vuelve el carril (test en la tarea 7).
4. **Nombre de paciente largo en la miga a 390 px**: solo se ve el último segmento, con elipsis, y la acción principal y «⋯» siguen visibles (test en la tarea 8).
5. **Cambio de tamaño en vivo** (girar la tableta, redimensionar): barra, cajón y hoja se recolocan sin recargar porque los hooks escuchan `change` (test de `useTramo` en la tarea 1 y de la barra en la tarea 8).

---

### Task 1: Puntos de corte en un solo sitio y auxiliar de pantalla para las pruebas

**Files:**
- Create: `frontend/src/styles/puntosCorte.ts`
- Create: `frontend/src/styles/tokens/breakpoints.css`
- Create: `frontend/src/styles/puntosCorte.audit.test.ts`
- Create: `frontend/src/test/pantalla.ts`
- Create: `frontend/src/test/pantalla.test.ts`
- Create: `frontend/src/hooks/useEstrecho.test.tsx`
- Modify: `frontend/src/hooks/useEstrecho.ts`
- Modify: `frontend/src/components/shell/useShellState.ts:31-38` (`WIDE_WINDOW_PX`, `NARROW_QUERY`)
- Modify: `frontend/src/styles/index.css` (importar `./tokens/breakpoints.css` tras `spacing.css`)
- Modify: `frontend/src/styles/responsive.css:1-8` (comentario de cabecera: remite a `puntosCorte.ts`, quita «≤1180 / ≤900 / ≤680»)

**Interfaces:**
- Produces (`styles/puntosCorte.ts`):
  ```ts
  export const PUNTOS_CORTE = { movil: 640, tableta: 1024, estrecho: 1280, grande: 1920 } as const;
  export const CONSULTA = {
    movil: "(max-width: 640px)",
    tableta: "(max-width: 1024px)",
    estrecho: "(max-width: 1280px)",
    grande: "(min-width: 1920px)",
  } as const;
  /** movil ≤ 640 < tableta ≤ 1024 < estrecho ≤ 1280 < ancho < 1920 ≤ grande */
  export type Tramo = "movil" | "tableta" | "estrecho" | "ancho" | "grande";
  ```
- Produces (`hooks/useEstrecho.ts`, además de `useMediaQuery` y `useEstrecho` que ya existen): `useMovil(): boolean`, `useTableta(): boolean` (≤ 1024, incluye móvil), `useGrande(): boolean`, `useTramo(): Tramo`. `useEstrecho` usa `CONSULTA.estrecho`.
- Produces (`test/pantalla.ts`):
  ```ts
  export interface Pantalla { ancho: number; alto?: number; transparenciaReducida?: boolean; movimientoReducido?: boolean }
  export function cumpleConsulta(consulta: string, p: Pantalla): boolean;
  export function simularPantalla(p: Pantalla): { cambiar(cambios: Partial<Pantalla>): void; restaurar(): void };
  ```
  `simularPantalla` espía `window.matchMedia` (cada lista devuelta guarda sus oyentes y su `matches` es un *getter* sobre el estado actual), fija `window.innerWidth`/`innerHeight` (alto por defecto 900) con `Object.defineProperty(..., { configurable: true })`; `cambiar` actualiza el estado y llama a los oyentes cuyo resultado cambió (el llamador lo envuelve en `act`); `restaurar` deshace todo. `cumpleConsulta` entiende listas separadas por comas (O), `and`, `(max-width|min-width|max-height|min-height: Npx)`, `(prefers-reduced-transparency: reduce)` y `(prefers-reduced-motion: reduce)`; cualquier otra característica da `false`.
- Produces (`tokens/breakpoints.css`): `:root { --bp-movil: 640px; --bp-tableta: 1024px; --bp-estrecho: 1280px; --bp-grande: 1920px; }` con un comentario: las variables documentan y sirven a JS; en `@media` se escribe el número.

- [ ] **Step 1: Escribir los tests del auxiliar** (`test/pantalla.test.ts`)

```ts
it("max-width incluye el borde", () => {
  expect(cumpleConsulta("(max-width: 640px)", { ancho: 640 })).toBe(true);
  expect(cumpleConsulta("(max-width: 640px)", { ancho: 641 })).toBe(false);
});
it("min-width, alto, O y Y", () => {
  expect(cumpleConsulta("(min-width: 1920px)", { ancho: 1920 })).toBe(true);
  expect(cumpleConsulta("(min-width: 1920px)", { ancho: 1919 })).toBe(false);
  expect(cumpleConsulta("(max-width: 760px), (max-height: 600px)", { ancho: 1707, alto: 600 })).toBe(true);
  expect(cumpleConsulta("(min-width: 641px) and (max-width: 1024px)", { ancho: 800 })).toBe(true);
});
it("preferencias y características desconocidas", () => {
  expect(cumpleConsulta("(prefers-reduced-transparency: reduce)", { ancho: 1000, transparenciaReducida: true })).toBe(true);
  expect(cumpleConsulta("(prefers-reduced-motion: reduce)", { ancho: 1000 })).toBe(false);
  expect(cumpleConsulta("(hover: hover)", { ancho: 1000 })).toBe(false);
});
it("simularPantalla avisa a los oyentes al cambiar y restaura", () => {
  const s = simularPantalla({ ancho: 1707 });
  const mq = window.matchMedia("(max-width: 640px)");
  const oyente = vi.fn();
  mq.addEventListener("change", oyente);
  expect(window.innerWidth).toBe(1707);
  s.cambiar({ ancho: 390 });
  expect(mq.matches).toBe(true);
  expect(oyente).toHaveBeenCalledTimes(1);
  s.restaurar();
  expect(window.matchMedia("(max-width: 640px)").matches).toBe(false);
});
```

- [ ] **Step 2: Escribir los tests de los hooks** (`hooks/useEstrecho.test.tsx`, con `renderHook`)

```ts
it.each([[360, "movil"], [640, "movil"], [768, "tableta"], [1024, "tableta"], [1280, "estrecho"], [1707, "ancho"], [1920, "grande"], [2560, "grande"]])(
  "a %i px el tramo es %s", (ancho, tramo) => {
    const s = simularPantalla({ ancho });
    expect(renderHook(() => useTramo()).result.current).toBe(tramo);
    s.restaurar();
  });
it("el tramo sigue al cambio de tamaño sin remontar", () => {
  const s = simularPantalla({ ancho: 1707 });
  const { result } = renderHook(() => useTramo());
  act(() => s.cambiar({ ancho: 390 }));
  expect(result.current).toBe("movil");
  s.restaurar();
});
it("useTableta incluye el móvil y useEstrecho sigue en 1280", () => {
  const s = simularPantalla({ ancho: 390 });
  expect(renderHook(() => useTableta()).result.current).toBe(true);
  expect(renderHook(() => useEstrecho()).result.current).toBe(true);
  s.restaurar();
});
```

- [ ] **Step 3: Escribir la auditoría** (`styles/puntosCorte.audit.test.ts`)

Recorre `src/**/*.{css,ts,tsx}` sin tests, quita comentarios (reutiliza el criterio de `sinComentarios` de `tokens.test.ts` o uno equivalente), extrae cada `(max|min)-(width|height):\s*(\d+)px` y comprueba:

```ts
const ANCHOS = new Set([640, 641, 1024, 1025, 1280, 1281, 1920]);   // N+1 para «mayor que»
const ALTOS = new Set([600, 768, 900, 1080]);                       // altos de la matriz
/** Números previos al módulo. Cada fase que migra uno lo quita de aquí. */
const LEGADO: Record<string, number[]> = {
  "styles/landing.css": [760],            // fase 11
  "styles/office.css": [760],             // fase 9
  "styles/responsive.css": [1100, 820],   // tarea 12 de esta fase
  "components/landing/heroFrames.ts": [760],
  "components/landing/FranjaCasos.tsx": [760],
  "components/landing/NavPildora.tsx": [900],
  "components/stepper/QuirofanoBar.tsx": [1366], // fase 10
};
it("ningún punto de corte fuera de los comunes (salvo el legado listado)", ...);
it("cada entrada del legado sigue existiendo (si se migra, se borra de LEGADO)", ...);
it("breakpoints.css y PUNTOS_CORTE dicen lo mismo", () => {
  const css = readFileSync(join(__dirname, "tokens/breakpoints.css"), "utf8");
  for (const [k, v] of Object.entries({ movil: 640, tableta: 1024, estrecho: 1280, grande: 1920 }))
    expect(css).toMatch(new RegExp(`--bp-${k}:\\s*${v}px`));
  expect(PUNTOS_CORTE).toEqual({ movil: 640, tableta: 1024, estrecho: 1280, grande: 1920 });
});
```

- [ ] **Step 4: Ejecutar y ver fallar**

Run: `npx vitest run src/test/pantalla.test.ts src/hooks/useEstrecho.test.tsx src/styles/puntosCorte.audit.test.ts`
Expected: FAIL (módulos y funciones sin definir).

- [ ] **Step 5: Implementar** `styles/puntosCorte.ts`, `tokens/breakpoints.css` (+ import en `index.css`), `test/pantalla.ts` y los hooks; en `useShellState.ts`, `NARROW_QUERY = CONSULTA.estrecho` y `WIDE_WINDOW_PX = PUNTOS_CORTE.tableta`; actualizar la cabecera de `responsive.css`.

- [ ] **Step 6: Ejecutar y ver pasar** (más los del shell que dependen de `useShellState`)

Run: `npx vitest run src/test/pantalla.test.ts src/hooks/useEstrecho.test.tsx src/styles/puntosCorte.audit.test.ts src/components/shell/AppShell.test.tsx src/styles/tokens.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/puntosCorte.ts frontend/src/styles/tokens/breakpoints.css frontend/src/styles/puntosCorte.audit.test.ts frontend/src/test/pantalla.ts frontend/src/test/pantalla.test.ts frontend/src/hooks/useEstrecho.ts frontend/src/hooks/useEstrecho.test.tsx frontend/src/components/shell/useShellState.ts frontend/src/styles/index.css frontend/src/styles/responsive.css
git commit -m "Fase 8: puntos de corte comunes (640/1024/1280/1920), useTramo y simularPantalla"
```

---

### Task 2: Sora autoalojada y el logotipo D en SVG

**Files:**
- Create: `backend/scripts/fuentes_sora.py`
- Create: `frontend/src/assets/fonts/Sora-latin.woff2`, `frontend/src/assets/fonts/Sora-latin-ext.woff2`, `frontend/src/assets/fonts/OFL-Sora.txt`
- Modify: `frontend/src/styles/tokens/fonts.css` (dos `@font-face` nuevos, comentario de cabecera)
- Modify: `frontend/src/styles/tokens/typography.css` (`--font-brand`)
- Modify: `frontend/src/styles/tokens/colors.css` (`--logo-dot` en los dos bloques)
- Modify: `frontend/src/styles/tokens.test.ts` (Sora y `--font-brand`, `--logo-dot`)
- Modify: `frontend/src/components/shell/Logo.tsx` (reescritura)
- Modify: `frontend/src/components/shell/Logo.test.tsx`

**Interfaces:**
- Produces (`components/shell/Logo.tsx`):
  ```ts
  export type LogoVariante = "app" | "linea";
  /** Grosor y punto del icono según su lado (lienzo de marca, tarjeta D). */
  export function trazoIcono(size: number): { trazo: number; punto: number; detalle: boolean };
  export function LogoIcono(props: { size: number; variante?: LogoVariante; tono?: "normal" | "media" }): JSX.Element;
  export interface LogoProps {
    compact?: boolean;            // solo el icono (sin nombre)
    size?: number;                // lado del icono en px; 28 por defecto
    variante?: LogoVariante;      // "app" por defecto
    firma?: boolean;              // «por SkullApp» bajo el nombre; true por defecto
    tono?: "normal" | "media";    // "media": sobre vídeo (siempre oscuro), en los dos temas
  }
  export function Logo(props: LogoProps): JSX.Element;
  ```
- Produces (tokens): `--font-brand: "Sora", "Inter", system-ui, sans-serif;` en `typography.css`; `--logo-dot: #FFFFFF;` en los dos bloques de `colors.css` (el punto del icono «app»).

**Sora (OFL), de dónde y cómo.** Descargar a una carpeta nueva y vacía del scratchpad (`C:\Users\juesn\AppData\Local\Temp\claude\C--UniNavarra-Proyectos-Prospective\ca88ebdd-7623-4fb4-baac-076e448b24ca\scratchpad\fonts-sora\`), nunca dentro del repo:
- `https://github.com/google/fonts/raw/main/ofl/sora/Sora%5Bwght%5D.ttf` → `Sora[wght].ttf` (variable, eje `wght` 100–800)
- `https://github.com/google/fonts/raw/main/ofl/sora/OFL.txt` → se copia tal cual a `frontend/src/assets/fonts/OFL-Sora.txt`

`fuentes_sora.py` sigue el patrón de `backend/scripts/fuentes_simbolos.py` (docstring con las URL y el uso): `main(dl: str, sal: str) -> None` abre `Sora[wght].ttf`, recorta el eje con `fontTools.varLib.instancer.instantiateVariableFont(fuente, {"wght": (500, 600)})`, y para cada subconjunto (`latin`, `latin-ext`) hace `subset.Subsetter` con `flavor="woff2"`, `layout_features=["*"]`, `name_IDs=["*"]`, `notdef_outline=True` sobre los puntos de código de los **mismos `unicode-range` que el `@font-face` de Inter en `fonts.css`** (copiarlos como cadenas y convertirlos con una función `puntos(rango: str) -> list[int]`), guardando solo los que la fuente tiene (`getBestCmap`). Escribe `Sora-latin.woff2` y `Sora-latin-ext.woff2` e imprime tamaño y nº de glifos. Se ejecuta con el venv que ya tiene fonttools y brotli:

```bash
"/c/Users/juesn/AppData/Local/Temp/claude/C--UniNavarra-Proyectos-Prospective/ca88ebdd-7623-4fb4-baac-076e448b24ca/scratchpad/venv-fuentes/Scripts/python.exe" -I backend/scripts/fuentes_sora.py "<scratchpad>/fonts-sora" frontend/src/assets/fonts
```
(si el venv no existe: `python -m venv <scratchpad>/venv-fuentes` y `pip install fonttools brotli` en él). Los `@font-face` nuevos copian el formato de los de Inter: `font-family: "Sora"; font-style: normal; font-weight: 500 600; font-display: swap; src: url("../../assets/fonts/Sora-latin.woff2") format("woff2"); unicode-range: <el de Inter latin>` (y lo mismo para `latin-ext`).

**SVG del icono D (copiados del lienzo, `Main.dc.html` sección «D · Corte axial» y `EnContexto.dc.html`).** Todo en `viewBox="0 0 48 48"`, `fill="none" stroke-linecap="round" stroke-linejoin="round"`:
- Completo (lado > 32 px): `stroke-width="3.5"`; `<ellipse cx="24" cy="25" rx="15" ry="18"/>`, `<circle cx="18" cy="30" r="1.8"/>` y `<circle cx="23.5" cy="35" r="1.8"/>` rellenos del color del trazo, sin trazo; `<circle cx="28.5" cy="20" r="4.4"/>` relleno del color del punto, sin trazo.
- Simplificado 17–32 px: `stroke-width="4"`; la elipse y `<circle cx="28.5" cy="20" r="5"/>` (sin los dos puntos pequeños).
- Simplificado ≤ 16 px: `stroke-width="5"`; la elipse y `<circle cx="28.5" cy="20" r="6"/>`.
- El icono va siempre dentro de un único `<g>` que lleva `fill="none"`, `stroke`, `stroke-width` y los `stroke-line*`.
- Variante «app»: primero `<rect width="48" height="48" rx="12" fill="var(--primary)"/>` y el `<g transform="translate(T T) scale(S)">` con trazo `var(--primary-foreground)` y punto `var(--logo-dot)`; `S`/`T`: completo `0.666667`/`8` (icono de 32 en 48), 17–32 px `0.6875`/`7.5` (22 en 32), ≤ 16 px `0.8125`/`4.5` (13 en 16).
- Variante «línea»: sin rectángulo y el `<g>` sin `transform`; trazo `currentColor`, punto `var(--data)`.
- La raíz de `Logo` (y la de `LogoIcono` cuando se usa sola) lleva `data-logo`, para que las auditorías de tamaño de texto apliquen la excepción de la marca.
- `tono="media"`: el punto pasa a `var(--brand-mist)` (azul claro en los dos temas, legible sobre vídeo).
- El `<svg>` lleva `aria-hidden="true"` y `focusable="false"`.

**Logotipo 4 (`Logotipos.dc.html` fila 4; proporciones de `EnContexto.dc.html`: icono 38 → nombre 24, ™ 10, firma 12, separación 12).** Para un icono de lado `s`: nombre `Math.round(s * 0.63)` px, «™» `Math.max(9, Math.round(s * 0.26))` px, firma `Math.max(11, Math.round(s * 0.32))` px, separación icono–texto `Math.round(s * 0.32)` px, separación nombre–firma 2 px, `line-height: 1.1`. El nombre: `<span>` con `fontFamily: "var(--font-brand)"`, `fontWeight: 600`, `letterSpacing: "-0.02em"` y el texto «Prospective» seguido de `<sup>™</sup>` (`fontWeight: 500`, color atenuado, `marginLeft: 1`). Colores: tono normal → nombre hereda, ™ y firma `var(--muted-foreground)`; tono media → nombre `var(--on-media)`, ™ y firma `var(--on-media-muted)`, `textShadow: var(--on-media-shadow)`.

- [ ] **Step 1: Escribir los tests de Logo** (sustituyen a los de la «P»)

```ts
it("trazoIcono sigue el lienzo por tamaño", () => {
  expect(trazoIcono(48)).toEqual({ trazo: 3.5, punto: 4.4, detalle: true });
  expect(trazoIcono(33)).toEqual({ trazo: 3.5, punto: 4.4, detalle: true });
  expect(trazoIcono(32)).toEqual({ trazo: 4, punto: 5, detalle: false });
  expect(trazoIcono(17)).toEqual({ trazo: 4, punto: 5, detalle: false });
  expect(trazoIcono(16)).toEqual({ trazo: 5, punto: 6, detalle: false });
});
it("app grande: cuadrado primario, icono a 2/3 y tres puntos", () => {
  const { container } = render(<LogoIcono size={48} variante="app" />);
  expect(container.querySelector("rect")!.getAttribute("fill")).toBe("var(--primary)");
  expect(container.querySelector("g")!.getAttribute("transform")).toBe("translate(8 8) scale(0.666667)");
  expect(container.querySelectorAll("circle")).toHaveLength(3);
  expect(container.querySelector('circle[r="4.4"]')!.getAttribute("fill")).toBe("var(--logo-dot)");
});
it("la raíz lleva data-logo", () => {
  const { container } = render(<Logo />);
  expect(container.firstElementChild).toHaveAttribute("data-logo");
});
it("app de 32: simplificado, sin los puntos pequeños", () => {
  const { container } = render(<LogoIcono size={32} variante="app" />);
  expect(container.querySelector("g")!.getAttribute("transform")).toBe("translate(7.5 7.5) scale(0.6875)");
  expect(container.querySelectorAll("circle")).toHaveLength(1);
  expect(container.querySelector("circle")!.getAttribute("r")).toBe("5");
  expect(container.querySelector("g")!.getAttribute("stroke-width")).toBe("4");
});
it("línea: sin cuadrado, trazo currentColor y punto --data; con tono media, --brand-mist", () => {
  const { container, rerender } = render(<LogoIcono size={38} variante="linea" />);
  expect(container.querySelector("rect")).toBeNull();
  expect(container.querySelector("ellipse")!.closest("[stroke]")!.getAttribute("stroke")).toBe("currentColor");
  expect(container.querySelector('circle[r="4.4"]')!.getAttribute("fill")).toBe("var(--data)");
  rerender(<LogoIcono size={38} variante="linea" tono="media" />);
  expect(container.querySelector('circle[r="4.4"]')!.getAttribute("fill")).toBe("var(--brand-mist)");
});
it("completo: «Prospective» en Sora 600 con ™ y la firma", () => {
  render(<Logo size={38} />);
  const nombre = screen.getByText("Prospective");
  expect(nombre.style.fontFamily).toBe("var(--font-brand)");
  expect(nombre.style.fontWeight).toBe("600");
  expect(nombre.style.letterSpacing).toBe("-0.02em");
  expect(nombre.style.fontSize).toBe("24px");
  expect(nombre.querySelector("sup")!.textContent).toBe("™");
  expect(screen.getByText("por SkullApp").style.fontSize).toBe("12px");
});
it("sin firma y compacto", () => {
  const { container, rerender } = render(<Logo firma={false} />);
  expect(screen.queryByText("por SkullApp")).toBeNull();
  rerender(<Logo compact />);
  expect(container.textContent).toBe("");
});
it("tono media: firma en --on-media-muted", () => {
  render(<Logo tono="media" />);
  expect(screen.getByText("por SkullApp").style.color).toBe("var(--on-media-muted)");
});
```

- [ ] **Step 2: Añadir a `tokens.test.ts`** un test «Sora autoalojada para la marca»: `fonts.css` contiene `font-family: "Sora"`, `font-weight: 500 600`, `Sora-latin.woff2` y `Sora-latin-ext.woff2`; `typography.css` casa `/--font-brand:\s*"Sora"/`; existen `assets/fonts/Sora-latin.woff2`, `Sora-latin-ext.woff2` (cada uno < 60 KB, `statSync`) y `OFL-Sora.txt`; `--logo-dot: #FFFFFF` en los dos bloques.

- [ ] **Step 3: Ejecutar y ver fallar**

Run: `npx vitest run src/components/shell/Logo.test.tsx src/styles/tokens.test.ts`
Expected: FAIL.

- [ ] **Step 4: Generar las fuentes** con `fuentes_sora.py` (comando de arriba) y copiar `OFL.txt` a `OFL-Sora.txt`. Comprobar que la salida lista los dos ficheros con glifos > 0.

- [ ] **Step 5: Implementar** los `@font-face`, `--font-brand`, `--logo-dot` y `Logo.tsx` (`trazoIcono`, `LogoIcono`, `Logo`). Los usos actuales de `Logo` siguen compilando con la nueva firma (sus cambios visibles son la tarea 5).

- [ ] **Step 6: Ejecutar y ver pasar**

Run: `npx vitest run src/components/shell/Logo.test.tsx src/styles/tokens.test.ts src/styles/cristal.audit.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/fuentes_sora.py frontend/src/assets/fonts/Sora-latin.woff2 frontend/src/assets/fonts/Sora-latin-ext.woff2 frontend/src/assets/fonts/OFL-Sora.txt frontend/src/styles/tokens/fonts.css frontend/src/styles/tokens/typography.css frontend/src/styles/tokens/colors.css frontend/src/styles/tokens.test.ts frontend/src/components/shell/Logo.tsx frontend/src/components/shell/Logo.test.tsx
git commit -m "Fase 8: marca D — icono «corte axial» en SVG y logotipo Prospective™ en Sora 600 autoalojada"
```

---

### Task 3: Favicon SVG y PNG 32/180; fuera `logo.png` e `icon.png`

**Files:**
- Create: `frontend/public/favicon.svg`
- Create: `backend/scripts/favicon_png.py`
- Create: `frontend/public/favicon-32.png`, `frontend/public/apple-touch-icon.png` (generados)
- Create: `frontend/src/styles/marca.test.ts`
- Modify: `frontend/index.html`
- Modify: `frontend/src/styles/base.css:85-89` (quitar la regla `.logo-mark`, que tiñe el PNG viejo y nadie usa)
- Delete: `frontend/src/assets/logo.png`, `frontend/public/icon.png` (ningún código los referencia: `index.html` era el único uso de `icon.png`)

**Interfaces:**
- Produces: `favicon.svg` exacto (icono «app» simplificado de 16 px, colores del tema oscuro, literales porque es un fichero estático):
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect width="48" height="48" rx="12" fill="#5AA9FF"/>
    <g transform="translate(4.5 4.5) scale(0.8125)" fill="none" stroke="#06121F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="24" cy="25" rx="15" ry="18"/>
      <circle cx="28.5" cy="20" r="6" fill="#FFFFFF" stroke="none"/>
    </g>
  </svg>
  ```
- Produces (`index.html`, en lugar de la línea de `icon.png`):
  ```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  ```
  y `<title>Prospective</title>` (la pestaña dice el nombre de la marca, como en `EnContexto.dc.html`).

`favicon_png.py` (solo biblioteca estándar: `zlib`, `struct`; sin Pillow ni Chrome): `main(sal: str) -> None` escribe `favicon-32.png` (32×32, geometría «app» de 17–32 px: `rx=12` en el espacio 48, `translate(7.5 7.5) scale(0.6875)`, trazo 4, punto r 5; esquinas transparentes) y `apple-touch-icon.png` (180×180, geometría «app» completa: `translate(8 8) scale(0.666667)`, trazo 3,5, los tres puntos; cuadrado entero sin redondear, iOS recorta). Rasterizado por supermuestreo 4×4 por píxel en el espacio 48×48: capas de abajo arriba —fondo `#5AA9FF` (rectángulo redondeado), anillo de la elipse `#06121F` (dentro de la elipse de semiejes 15 + t/2, 18 + t/2 y fuera de la de 15 − t/2, 18 − t/2, con `t` el trazo, en coordenadas del icono `q = (p − T) / S`), puntos pequeños `#06121F`, punto grande `#FFFFFF`—; cada submuestra toma la capa superior que la cubre y el píxel es la media RGBA. PNG RGBA de 8 bits (tipo de color 6), filtro 0 por fila, `IHDR`/`IDAT`/`IEND` con `zlib.crc32`. Uso: `python -I backend/scripts/favicon_png.py frontend/public`.

- [ ] **Step 1: Escribir `styles/marca.test.ts`**

```ts
const raiz = join(__dirname, "../..");
const png = (f: string) => { const b = readFileSync(join(raiz, "public", f)); return { firma: b.subarray(1, 4).toString(), ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) }; };
it("index.html enlaza el favicon SVG, el PNG de 32 y el apple-touch de 180", () => {
  const html = readFileSync(join(raiz, "index.html"), "utf8");
  expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  expect(html).toContain('sizes="32x32" href="/favicon-32.png"');
  expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
  expect(html).not.toContain("icon.png\"");
  expect(html).toMatch(/<title>Prospective<\/title>/);
});
it("los PNG existen con su tamaño", () => {
  expect(png("favicon-32.png")).toEqual({ firma: "PNG", ancho: 32, alto: 32 });
  expect(png("apple-touch-icon.png")).toEqual({ firma: "PNG", ancho: 180, alto: 180 });
});
it("el SVG es el icono app simplificado y se retiraron los PNG viejos", () => {
  const svg = readFileSync(join(raiz, "public/favicon.svg"), "utf8");
  expect(svg).toContain('scale(0.8125)');
  expect(svg).toContain('r="6"');
  expect(existsSync(join(raiz, "src/assets/logo.png"))).toBe(false);
  expect(existsSync(join(raiz, "public/icon.png"))).toBe(false);
});
```

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/styles/marca.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** `favicon.svg`, `favicon_png.py`; generar los PNG; editar `index.html`; quitar `.logo-mark` de `base.css`; `git rm frontend/src/assets/logo.png frontend/public/icon.png`.
- [ ] **Step 4: Ver los PNG** (abrirlos con la herramienta de lectura de imágenes) y comprobar a ojo que son el icono D: elipse oscura con punto blanco sobre azul.
- [ ] **Step 5: Ejecutar y ver pasar** — Run: `npx vitest run src/styles/marca.test.ts src/styles/tokens.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add frontend/public/favicon.svg frontend/public/favicon-32.png frontend/public/apple-touch-icon.png backend/scripts/favicon_png.py frontend/src/styles/marca.test.ts frontend/index.html frontend/src/styles/base.css
git commit -m "Fase 8: favicon del icono D (SVG + PNG 32/180) y retirada de logo.png e icon.png"
```
(los `git rm` del paso 3 ya quedan preparados en el índice).

---

### Task 4: Fondo ambiente en lugar del Entorno

**Files:**
- Create: `frontend/src/components/Ambiente.tsx`
- Create: `frontend/src/components/Ambiente.test.tsx`
- Create: `frontend/src/styles/ambiente.css`
- Modify: `frontend/src/styles/index.css` (importar `./ambiente.css` tras `base.css`)
- Modify: `frontend/src/styles/tokens/colors.css` (tokens `--ambient-*` en los dos bloques)
- Modify: `frontend/src/styles/tokens.test.ts`, `frontend/src/styles/cristal.audit.test.ts`
- Modify: `frontend/src/components/shell/AppShell.tsx` (+ `AppShell.test.tsx`), `frontend/src/components/shell/shell.css:8` (comentario)
- Modify: `frontend/src/pages/Login.tsx` (+ `Login.test.tsx`), `frontend/src/pages/Signup.tsx` (+ `Signup.test.tsx`), `frontend/src/components/ForcePasswordChange.tsx` (+ `ForcePasswordChange.test.tsx`)
- Modify: `frontend/src/motion/reducido.test.tsx` (quitar el `describe("transparencia reducida en vivo")` y el import de Entorno)
- Delete: `frontend/src/components/Entorno.tsx`, `frontend/src/components/Entorno.test.tsx`, `frontend/public/media/entorno/corte-036.webp`

**Interfaces:**
- Produces: `export function Ambiente({ children }: { children?: ReactNode }): JSX.Element` — mismo contrato de maquetación que `Entorno` (envoltorio `position: relative; min-height: 100%`, hijos en una capa `position: relative; z-index: 1`) más una capa `<div className="ambiente" data-ambiente aria-hidden="true" />`. Sin prop `dense`, sin hooks de tema ni de transparencia: todo lo resuelve el CSS (y por eso reacciona en vivo).
- Produces (tokens, exactos; los brillos son `rgba(…)` sueltos para que `capas()` de la auditoría los lea):

| token | oscuro | claro |
|---|---|---|
| `--ambient-glow-1` (arriba a la izquierda) | `rgba(96, 173, 255, 0.12)` | `rgba(10, 102, 255, 0.08)` |
| `--ambient-glow-2` (abajo a la derecha, más pequeño) | `rgba(96, 173, 255, 0.08)` | `rgba(10, 102, 255, 0.06)` |
| `--ambient-grain-opacity` | `0.04` | `0.03` |

  El fondo base es `--canvas` (`#050608` / `#F3F5F8`), sin token nuevo.
- Produces (`styles/ambiente.css`):
  ```css
  .ambiente {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background:
      radial-gradient(60vmax 60vmax at 8% 0%, var(--ambient-glow-1), transparent 70%),
      radial-gradient(40vmax 40vmax at 100% 100%, var(--ambient-glow-2), transparent 70%),
      var(--canvas);
  }
  .ambiente::after { content: ""; position: absolute; inset: 0; opacity: var(--ambient-grain-opacity);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>"); }
  @media (prefers-reduced-transparency: reduce) {
    .ambiente { background: var(--canvas); }
    .ambiente::after { display: none; }
  }
  ```
  Quieto (sin animación). Tamaños en `vmax`: el brillo escala con la pantalla, de 360 a 2560, sin `@media` de anchura.

- [ ] **Step 1: Escribir `Ambiente.test.tsx`**

```ts
it("pinta la capa decorativa y los hijos encima; sin imagen", () => {
  const { container } = render(<Ambiente><p>contenido</p></Ambiente>);
  const capa = container.querySelector<HTMLElement>("[data-ambiente]")!;
  expect(capa).toHaveClass("ambiente");
  expect(capa).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("contenido").parentElement!.style.zIndex).toBe("1");
});
it.each([360, 768, 1707, 2560])("a %i px el marcado es el mismo (el fondo no depende del ancho)", (ancho) => {
  const s = simularPantalla({ ancho });
  const { container } = render(<Ambiente><p>x</p></Ambiente>);
  expect(container.querySelectorAll("[data-ambiente]")).toHaveLength(1);
  s.restaurar();
});
it("CSS: capa fija sin puntero, dos brillos en vmax sobre --canvas, grano ≤ 4 % y plano con transparencia reducida", () => {
  const css = readFileSync(join(__dirname, "../styles/ambiente.css"), "utf8");
  expect(css).toMatch(/\.ambiente\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/);
  expect(css).toMatch(/radial-gradient\(60vmax 60vmax at 8% 0%, var\(--ambient-glow-1\)/);
  expect(css).toMatch(/radial-gradient\(40vmax 40vmax at 100% 100%, var\(--ambient-glow-2\)/);
  expect(css).toMatch(/opacity:\s*var\(--ambient-grain-opacity\)/);
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\.ambiente\s*\{\s*background:\s*var\(--canvas\);\s*\}\s*\.ambiente::after\s*\{\s*display:\s*none;/);
  expect(css).not.toMatch(/@media[^{]*(max|min)-width/);
  expect(css).not.toMatch(/animation/);
});
```

- [ ] **Step 2: Cambiar las auditorías**
  - `tokens.test.ts`: test «el fondo ambiente tiene sus tokens en los dos temas» con los seis valores de la tabla (regex tolerante a espacios como las existentes).
  - `cristal.audit.test.ts`: en `superficies()`, sustituir las dos filas «… sobre Entorno» por
    ```ts
    const ambiente = (b: string) => deHex(apilar(b, ["--ambient-glow-1", "--ambient-glow-2"], deHex(hexDe(b, "--canvas"))));
    { donde: "cristal sobre el Ambiente (los dos brillos apilados)", fondo: apilar(b, ["--glass"], ambiente(b)) },
    { donde: "cristal denso sobre el Ambiente (los dos brillos apilados)", fondo: apilar(b, ["--glass-dense"], ambiente(b)) },
    ```
    (adaptar a los auxiliares que existan: `apilar` devuelve hex y `deHex` lo pasa a RGB) y añadir un `it` por tema: **texto sin cristal sobre el Ambiente** —`--foreground`, `--muted-foreground`, `--data` y `--destructive-text` a ≥ 4,5:1 sobre `ambiente(b)` en hex—. Los estados `--success`/`--warning` no van nunca directamente sobre el fondo (viven dentro del cristal); el comentario del test lo dice.
  - `AppShell.test.tsx`: «se pinta sobre el Ambiente»: `container.querySelector("[data-ambiente]")` existe y no hay `img`. Quitar el import de `ENTORNO_SRC`.
  - `Login.test.tsx`, `Signup.test.tsx`, `ForcePasswordChange.test.tsx`: los tests «el velo del Entorno es el denso» pasan a «la pantalla va sobre el Ambiente» (`[data-ambiente]` presente, ningún `img[aria-hidden]` de fondo); `sinFondoOpaco` se conserva con el comentario «el Ambiente debe verse».

- [ ] **Step 3: Ejecutar y ver fallar**

Run: `npx vitest run src/components/Ambiente.test.tsx src/styles/tokens.test.ts src/styles/cristal.audit.test.ts src/components/shell/AppShell.test.tsx src/pages/Login.test.tsx src/pages/Signup.test.tsx src/components/ForcePasswordChange.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implementar** `ambiente.css`, los tokens, `Ambiente.tsx`; sustituir `<Entorno dense>` por `<Ambiente>` en AppShell, Login, Signup y ForcePasswordChange (y los comentarios que nombran el Entorno en esos ficheros y en `shell.css`); borrar con `git rm` `Entorno.tsx`, `Entorno.test.tsx` y `public/media/entorno/corte-036.webp`; quitar de `reducido.test.tsx` el bloque del Entorno.

- [ ] **Step 5: Comprobar que no queda ninguna referencia** — Run (Grep): patrón `Entorno|ENTORNO_SRC|corte-036|data-entorno` en `frontend/src` — Expected: sin resultados (salvo, si los hay, textos de comentarios históricos de otras fases, que se reescriben).

- [ ] **Step 6: Ejecutar y ver pasar** — el mismo comando del paso 3 más `src/motion/reducido.test.tsx` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Ambiente.tsx frontend/src/components/Ambiente.test.tsx frontend/src/styles/ambiente.css frontend/src/styles/index.css frontend/src/styles/tokens/colors.css frontend/src/styles/tokens.test.ts frontend/src/styles/cristal.audit.test.ts frontend/src/components/shell/AppShell.tsx frontend/src/components/shell/AppShell.test.tsx frontend/src/components/shell/shell.css frontend/src/pages/Login.tsx frontend/src/pages/Login.test.tsx frontend/src/pages/Signup.tsx frontend/src/pages/Signup.test.tsx frontend/src/components/ForcePasswordChange.tsx frontend/src/components/ForcePasswordChange.test.tsx frontend/src/motion/reducido.test.tsx
git commit -m "Fase 8: fondo ambiente (brillos de marca y grano) en lugar del corte de TC (A14, A16)"
```

---

### Task 5: La marca nueva en sus sitios

**Files:**
- Modify: `frontend/src/components/shell/AuthBrand.tsx` (+ `AuthBrand.test.tsx`)
- Modify: `frontend/src/components/shell/SideNav.tsx` (+ `SideNav.test.tsx`), `frontend/src/components/shell/shell.css` (`.shell-nav-head`, `.shell-brand*`)
- Modify: `frontend/src/components/shell/TopBar.tsx` (rama `brand`)
- Modify: `frontend/src/components/landing/NavPildora.tsx` (+ `NavPildora.test.tsx`)
- Modify: `frontend/src/pages/Landing.tsx` (`Pie`) (+ `Landing.test.tsx`)
- Modify: `frontend/src/components/LoadingScreen.tsx` (+ `LoadingScreen.test.tsx`)
- Modify: `frontend/src/pages/Login.tsx`, `frontend/src/pages/Signup.tsx` (textos «PROSPECTIVE» → «Prospective»), `frontend/src/pages/Login.test.tsx`

**Interfaces:**
- Consumes: `Logo`, `LogoProps` (tarea 2); `useMovil` (tarea 1); `simularPantalla` (tarea 1).
- Sitios y props exactas:
  - `AuthBrand`: el botón de marca pasa a `<Logo variante="linea" size={38} tono="media" />` (sustituye a `Logo compact` + spans «PROSPECTIVE»/«por SkullApp»); el botón conserva `color: var(--on-media)` y su `title`.
  - `SideNav` cabecera: `<Logo compact={!expanded} size={32} />` (variante app; expandida con nombre y firma). `.shell-nav-head` pasa a `padding: 0 16px` para que el icono de 32 quede centrado en el carril de 64 (centro a 32 px, como el icono de 24 con 20 px hoy).
  - `TopBar` rama `brand`: `<Logo size={24} firma={false} />` y se borra el span `shell-brand-name` (y su regla en `shell.css`).
  - `NavPildora`: ancho → `<Logo variante="linea" size={26} />`; plegada (≤ 900, legado de la fase 11) → `<Logo variante="linea" size={26} compact />` + `<span className="landing-sr">Prospective</span>`.
  - `Landing` `Pie`: `<Logo variante="linea" size={32} />`.
  - `LoadingScreen`: `<Logo variante="linea" tono="media" firma={false} size={movil ? 28 : 34} />` en lugar de `Logo compact` + span «PROSPECTIVE»; con `useMovil()` además la pastilla usa `padding: movil ? "24px 28px" : "32px 44px"` y `maxWidth: "calc(100vw - 32px)"`.
  - Textos: pie de Login y Signup «Prospective™ Web — Laboratorio de Imagen Médica»; subtítulo de Signup «Regístrate para acceder a Prospective.».

- [ ] **Step 1: Actualizar los tests**
  - `AuthBrand.test.tsx`: `getByText("Prospective")` en vez de «PROSPECTIVE»; «por SkullApp» con `style.color` `var(--on-media-muted)` (ahora lo pone `Logo tono="media"`); el SVG del botón no tiene `rect` (variante línea).
  - `SideNav.test.tsx`: la cabecera tiene un `svg` de `width="32"` con `rect[fill="var(--primary)"]`; expandida, `getByText("Prospective")`.
  - `NavPildora.test.tsx:70`: `getByText("Prospective")` con clase `landing-sr`.
  - `Landing.test.tsx`: dentro de `footer` hay `getByText("Prospective")` y «por SkullApp».
  - `LoadingScreen.test.tsx:16,72`: «Prospective» dentro de la pastilla; nuevo:
    ```ts
    it("en móvil la marca y la pastilla se compactan", () => {
      const s = simularPantalla({ ancho: 390 });
      const { container } = render(<LoadingScreen onDone={() => {}} />);
      expect(container.querySelector("[data-glass] svg")!.getAttribute("width")).toBe("28");
      expect(container.querySelector<HTMLElement>("[data-glass]")!.style.padding).toBe("24px 28px");
      s.restaurar();
    });
    ```
  - `Login.test.tsx:166`: `getByText("Prospective")`.
- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/components/shell/AuthBrand.test.tsx src/components/shell/SideNav.test.tsx src/components/landing/NavPildora.test.tsx src/pages/Landing.test.tsx src/components/LoadingScreen.test.tsx src/pages/Login.test.tsx src/pages/Signup.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** los cambios de la lista de sitios.
- [ ] **Step 4: Ejecutar y ver pasar** — el mismo comando más `src/components/shell/TopBar.test.tsx src/styles/tokens.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/AuthBrand.tsx frontend/src/components/shell/AuthBrand.test.tsx frontend/src/components/shell/SideNav.tsx frontend/src/components/shell/SideNav.test.tsx frontend/src/components/shell/shell.css frontend/src/components/shell/TopBar.tsx frontend/src/components/landing/NavPildora.tsx frontend/src/components/landing/NavPildora.test.tsx frontend/src/pages/Landing.tsx frontend/src/pages/Landing.test.tsx frontend/src/components/LoadingScreen.tsx frontend/src/components/LoadingScreen.test.tsx frontend/src/pages/Login.tsx frontend/src/pages/Login.test.tsx frontend/src/pages/Signup.tsx
git commit -m "Fase 8: marca D en entrada, barra lateral, landing y pantalla de carga"
```

---

### Task 6: `PageBody` común con `--content-max`

**Files:**
- Create: `frontend/src/components/shell/PageBody.tsx`
- Create: `frontend/src/components/shell/PageBody.test.tsx`
- Modify: `frontend/src/components/shell/shell.css` (reglas `.page-body*`)
- Modify (solo el contenedor exterior; nada del interior): `frontend/src/pages/UsersAdmin.tsx:415-416`, `frontend/src/pages/PendingRequests.tsx:202-203`, `frontend/src/pages/AuditTrail.tsx:143`, `frontend/src/pages/Studies.tsx:369-370`, `frontend/src/pages/Patients.tsx:180-182`, `frontend/src/pages/Workshops.tsx:197`, `frontend/src/pages/ClipOrders.tsx:436`, `frontend/src/pages/PatientPage.tsx:347`

**Interfaces:**
- Produces:
  ```ts
  /** Cuerpo de una página de la oficina: desplaza y limita el ancho a --content-max.
   *  "lista": la página desplaza entera. "pantalla": ocupa el alto y no desplaza
   *  (la ficha L3, cuyas columnas desplazan solas). */
  export function PageBody(props: { children: ReactNode; modo?: "lista" | "pantalla"; className?: string }): JSX.Element;
  ```
  Marcado: `<div className="page-body" data-modo={modo}><div className={"page-body__ancho" + (className ? " " + className : "")}>{children}</div></div>`.
- CSS (`shell.css`), valores exactos:
  ```css
  .page-body { flex: 1; min-height: 0; overflow-y: auto; }
  .page-body__ancho { box-sizing: border-box; width: 100%; max-width: var(--content-max); margin: 0 auto; padding: 28px 32px 48px; }
  .page-body[data-modo="pantalla"] { overflow: hidden; display: flex; flex-direction: column; }
  .page-body[data-modo="pantalla"] > .page-body__ancho { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 24px 32px; }
  @media (max-width: 1024px) { .page-body__ancho { padding: 24px 24px 40px; } .page-body[data-modo="pantalla"] > .page-body__ancho { padding: 20px 24px; } }
  @media (max-width: 640px)  { .page-body__ancho { padding: 16px 16px 32px; } .page-body[data-modo="pantalla"] > .page-body__ancho { padding: 16px; } }
  ```
- Uso en páginas: las siete de lista pasan a `<PageBody className="fade-rise">…</PageBody>` (Patients, UsersAdmin y PendingRequests ya llevaban `fade-rise` en su contenedor interior; Workshops, ClipOrders, AuditTrail y Studies sin clase); PatientPage a `<PageBody modo="pantalla">`. Se borran el `div` exterior con `flex: 1; overflowY: auto` y el interior con `maxWidth`/`margin`/`padding` de cada una. Lo de dentro (tablas, `overflowX` de Usuarios, etc.) no se toca: es la fase 9.

- [ ] **Step 1: Escribir `PageBody.test.tsx`**

```ts
it("lista: desplaza y limita el ancho", () => {
  const { container } = render(<PageBody className="fade-rise"><p>x</p></PageBody>);
  const cuerpo = container.querySelector(".page-body")!;
  expect(cuerpo).toHaveAttribute("data-modo", "lista");
  expect(cuerpo.firstElementChild).toHaveClass("page-body__ancho", "fade-rise");
});
it("CSS: --content-max y márgenes por punto de corte (1024 y 640)", () => {
  const css = readFileSync(join(__dirname, "shell.css"), "utf8");
  expect(css).toMatch(/\.page-body__ancho\s*\{[^}]*max-width:\s*var\(--content-max\)[^}]*padding:\s*28px 32px 48px/);
  expect(css).toMatch(/@media \(max-width: 1024px\)\s*\{\s*\.page-body__ancho\s*\{\s*padding:\s*24px 24px 40px/);
  expect(css).toMatch(/@media \(max-width: 640px\)\s*\{\s*\.page-body__ancho\s*\{\s*padding:\s*16px 16px 32px/);
});
it("ninguna página interna lleva ancho propio y todas usan PageBody", () => {
  const PAGINAS = ["UsersAdmin", "PendingRequests", "AuditTrail", "Studies", "Patients", "Workshops", "ClipOrders", "PatientPage"];
  for (const p of PAGINAS) {
    const src = readFileSync(join(__dirname, `../../pages/${p}.tsx`), "utf8");
    expect(src, p).toMatch(/<PageBody[\s>]/);
    expect(src, p).not.toMatch(/maxWidth:\s*(?:"var\(--content-max\)"|(?:900|1000|1100|1320|1440)\b)/);
  }
});
```

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/components/shell/PageBody.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** `PageBody` y su CSS; aplicarlo en las ocho páginas.
- [ ] **Step 4: Ejecutar y ver pasar** — Run: `npx vitest run src/components/shell/PageBody.test.tsx src/pages/UsersAdmin.test.tsx src/pages/PendingRequests.test.tsx src/pages/AuditTrail.test.tsx src/pages/Studies.test.tsx src/pages/Patients.test.tsx src/pages/Workshops.test.tsx src/pages/ClipOrders.test.tsx src/pages/PatientPage.test.tsx src/styles/tokens.test.ts` (los que existan; `Glob` `src/pages/*.test.tsx`) — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/PageBody.tsx frontend/src/components/shell/PageBody.test.tsx frontend/src/components/shell/shell.css frontend/src/pages/UsersAdmin.tsx frontend/src/pages/PendingRequests.tsx frontend/src/pages/AuditTrail.tsx frontend/src/pages/Studies.tsx frontend/src/pages/Patients.tsx frontend/src/pages/Workshops.tsx frontend/src/pages/ClipOrders.tsx frontend/src/pages/PatientPage.tsx
git commit -m "Fase 8: PageBody común con --content-max en las páginas de la oficina (A17)"
```
(más los tests de página que hubiera que ajustar, nombrados uno a uno).

---

### Task 7: Barra lateral y carcasa por punto de corte (carril, cajón en móvil)

**Files:**
- Modify: `frontend/src/components/shell/AppShell.tsx` (+ `AppShell.test.tsx`)
- Modify: `frontend/src/components/shell/SideNav.tsx` (+ `SideNav.test.tsx`)
- Modify: `frontend/src/components/shell/TopBar.tsx` (botón «Abrir las secciones»)
- Modify: `frontend/src/components/shell/shell.css`

**Interfaces:**
- Consumes: `useMovil` (tarea 1), `simularPantalla` (tarea 1), presets `fundido`/`fundidoTransition` y `useReducedMotion` del barrel `src/motion`.
- Produces:
  ```ts
  export function SideNav(props: { state: ShellState; modo?: "carril" | "cajon"; abierto?: boolean; onCerrar?: () => void }): JSX.Element | null;
  // TopBar, props nuevas:
  onAbrirSecciones?: () => void;   // si viene, pinta el botón «Abrir las secciones» al principio
  seccionesAbiertas?: boolean;     // aria-expanded del botón
  ```
- Comportamiento por tramo:
  - **> 1280**: carril de 64 / fijado a 240 según la preferencia (sin cambios).
  - **641–1280**: carril que arranca plegado (sin cambios, `CONSULTA.estrecho`); a ≤ 1024 los enlaces miden 44 px de alto (`@media (max-width: 1024px) { .shell-nav-link { height: 44px; } }`).
  - **≤ 640**: `.shell` lleva `data-movil="true"` y una sola columna (`.shell[data-movil="true"], .shell[data-movil="true"][data-pinned="true"] { grid-template-columns: 1fr; }`); la barra lateral no se pinta hasta que se abre. La barra superior muestra un botón de icono `MENU`, `aria-label="Abrir las secciones"`, `aria-expanded`, 44×44, con `data-abrir-secciones`. Abierto: `SideNav modo="cajon"` como panel fijo a la izquierda (`position: fixed; top: 0; bottom: 0; left: 0; width: min(280px, 86vw); z-index: 200`, `data-expanded="true"`, `data-modo="cajon"`, `glass("normal")` + `data-glass`), con un velo `.shell-nav-velo` (`position: fixed; inset: 0; z-index: 199; background: var(--scrim)`) que cierra al tocarlo. Entra desde la izquierda (`x: "-100%" → 0`, `--dur-3`, `EASE`); con movimiento reducido, `fundido`. Al abrir, el foco va al primer enlace; Escape, el velo o elegir una sección cierran y el foco vuelve al botón `[data-abrir-secciones]`. Si el ancho pasa de 640 con el cajón abierto, AppShell lo cierra.
- Texto ≥ 13 px: `.shell-nav-user-role` pasa de 11 a 13 px.

- [ ] **Step 1: Escribir los tests** (en `AppShell.test.tsx`, con `simularPantalla` y `afterEach` que restaura)

```ts
it("> 1280 con la preferencia «fijada»: carril fijado a 240", () => {
  const s = simularPantalla({ ancho: 1707 }); localStorage.setItem("shell.sidebar", "pinned");
  const { container } = renderShell({});
  expect(container.querySelector(".shell")).toHaveAttribute("data-pinned", "true");
  expect(screen.queryByRole("button", { name: "Abrir las secciones" })).toBeNull();
  s.restaurar();
});
it("a 1024: carril plegado, sin botón de cajón; enlaces de 44 px por CSS", () => {
  const s = simularPantalla({ ancho: 1024 });
  const { container } = renderShell({});
  expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-modo", "carril");
  expect(container.querySelector(".shell")).toHaveAttribute("data-pinned", "false");
  const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");
  expect(css).toMatch(/@media \(max-width: 1024px\)\s*\{[^}]*\.shell-nav-link\s*\{\s*height:\s*44px/);
  s.restaurar();
});
it("a 390: sin carril; el botón abre el cajón con el foco en el primer enlace y Escape lo cierra devolviendo el foco", () => {
  const s = simularPantalla({ ancho: 390 });
  const { container } = renderShell({ crumbs: [{ label: "Pacientes" }] });
  expect(container.querySelector(".shell")).toHaveAttribute("data-movil", "true");
  expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
  const boton = screen.getByRole("button", { name: "Abrir las secciones" });
  fireEvent.click(boton);
  const cajon = screen.getByRole("navigation", { name: "Secciones" });
  expect(cajon).toHaveAttribute("data-modo", "cajon");
  expect(cajon).toHaveAttribute("data-expanded", "true");
  expect(boton).toHaveAttribute("aria-expanded", "true");
  expect(document.activeElement).toBe(within(cajon).getAllByRole("link")[0]);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
  expect(document.activeElement).toBe(boton);
  s.restaurar();
});
it("a 390: elegir una sección navega y cierra; el velo también cierra", () => {
  /* clic en el enlace «Estudios» → nav.go("studies") y sin navegación; reabrir, clic en .shell-nav-velo → cerrado */
});
it("si la ventana pasa de 640 con el cajón abierto, vuelve el carril", () => {
  const s = simularPantalla({ ancho: 390 });
  renderShell({});
  fireEvent.click(screen.getByRole("button", { name: "Abrir las secciones" }));
  act(() => s.cambiar({ ancho: 1024 }));
  expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-modo", "carril");
  expect(screen.queryByRole("button", { name: "Abrir las secciones" })).toBeNull();
  s.restaurar();
});
```
(El primer bloque del cajón es la Review Focus 3. En el test de «elegir una sección» escribir el cuerpo completo con `nav.go` del mock del fichero.)

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/components/shell/AppShell.test.tsx src/components/shell/SideNav.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** en AppShell (`const movil = useMovil()`, estado `cajonAbierto`, efecto que lo cierra cuando `!movil`, `data-movil` en `.shell`, props a TopBar y SideNav), SideNav (`data-modo`, rama cajón con velo, foco y Escape propio en `document` mientras está abierto) y el CSS.
- [ ] **Step 4: Ejecutar y ver pasar** — el mismo comando más `src/components/shell/TopBar.test.tsx src/styles/puntosCorte.audit.test.ts src/styles/cristal.audit.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/AppShell.tsx frontend/src/components/shell/AppShell.test.tsx frontend/src/components/shell/SideNav.tsx frontend/src/components/shell/SideNav.test.tsx frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/shell.css
git commit -m "Fase 8: barra lateral por punto de corte — carril con objetivos de 44 px y cajón en móvil"
```

---

### Task 8: Barra superior adaptable y menú «⋯» común (A19)

**Files:**
- Create: `frontend/src/components/MenuMas.tsx`
- Create: `frontend/src/components/MenuMas.test.tsx`
- Modify: `frontend/src/components/shell/TopBar.tsx` (+ `TopBar.test.tsx`)
- Modify: `frontend/src/components/shell/AppShell.tsx` (+ `AppShell.test.tsx`): prop `actions` → `acciones` + `extra`
- Modify: `frontend/src/components/shell/shell.css`
- Modify: `frontend/src/components/ThemeToggle.tsx` (tamaño `"lg"` = 44 px)
- Modify: `frontend/src/pages/Patients.tsx`, `frontend/src/pages/AuditTrail.tsx`, `frontend/src/pages/PendingRequests.tsx`, `frontend/src/pages/UsersAdmin.tsx`, `frontend/src/pages/Workshops.tsx` (y sus tests si consultan la estructura vieja)

**Interfaces:**
- Consumes: `useTramo` (tarea 1), `Button`, `Icon`, `IconName`, `glass`.
- Produces (`components/MenuMas.tsx`, reutilizable en la fase 9 para las filas de tabla):
  ```ts
  export interface ItemMenu {
    id: string;
    label: string;
    icon?: IconName;
    onSelect?: () => void;
    href?: string;          // se pinta como <a role="menuitem" target="_blank" rel="noreferrer">
    destructive?: boolean;  // data-danger, en --destructive
    disabled?: boolean;     // aria-disabled, no ejecuta
    separadoAntes?: boolean;
  }
  export function MenuMas(props: { items: ItemMenu[]; label?: string /* "Más acciones" */; tactil?: boolean }): JSX.Element;
  ```
  Botón disparador: icono de tres puntos (añadir `MORE: "M3.5 8h.01M8 8h.01M12.5 8h.01"` a `Icon.tsx`, con trazo grueso como el resto), `aria-label={label}`, `aria-haspopup="menu"`, `aria-expanded`; 32 px (44 con `tactil`). Menú en portal sobre `document.body`, `role="menu"`, `glass("dense")` + `data-glass`, `position: fixed` calculado desde `getBoundingClientRect()` del botón, alineado a su borde derecho; si `rect.bottom + alturaEstimada > window.innerHeight` (altura estimada = 44 × nº de ítems + 16) se abre hacia arriba y lleva `data-lado="arriba"` (si no, `"abajo"`). Ítems `role="menuitem"`, alto mínimo 36 (44 con `tactil`). ↑/↓ mueven el foco, Escape cierra y devuelve el foco al botón, clic fuera cierra, elegir ejecuta y cierra.
- Produces (`TopBar.tsx`):
  ```ts
  export interface AccionBarra {
    id: string;
    label: string;          // texto visible y nombre accesible
    icon: IconName;
    onClick?: () => void;
    href?: string;          // enlace (descarga) con aspecto de botón: <a target="_blank" rel="noreferrer">
    principal?: boolean;    // como mucho una; variante "default"; las demás "outline"
    title?: string;         // tooltip; si falta, label
    disabled?: boolean;
  }
  // props de TopBar y AppShell: acciones?: AccionBarra[]; extra?: ReactNode  (sustituyen a `actions`)
  ```
- Comportamiento por tramo (`useTramo()`), todos los controles de la barra con `white-space: nowrap`:

| tramo | principal | secundarias | «Ctrl K» | miga / subtítulo | alto de control |
|---|---|---|---|---|---|
| ancho, grande | icono + texto | icono + texto | botón | todas / visible | 32 (`sm`) |
| estrecho (≤ 1280) | icono + texto | solo icono, `aria-label`=label, `title` | botón | todas / visible | 32 |
| tableta (≤ 1024) | icono + texto | solo icono | botón | todas / visible | 44 (`md`; icono 44×44; `ThemeToggle size="lg"`; avatar y Ctrl K a 44 por CSS) |
| móvil (≤ 640) | solo icono | dentro de `MenuMas` (`tactil`) | ítem «Paleta de mandos» (icono `SEARCH`) dentro del menú; sin botón | solo el último segmento; sin subtítulo | 44 |

  (Se usa 1280 y no el 1100 de A19 porque no se admiten cortes nuevos; a 1280 con la barra lateral plegada sobran 1216 px.) Las acciones con `href` se pintan como `<a className="shell-accion" data-variant="outline">` con el aspecto de pastilla del botón *outline* (reglas en `shell.css` con `--btn-outline-bg`/`--btn-outline-border` si la tarea 11 ya se hizo, o los valores actuales de `Button` si no; la tarea 11 las alinea). `extra` va antes de las acciones dentro de `.shell-extra` (`flex: 0 1 220px; min-width: 0`; a ≤ 640 `flex: 1 1 auto`). En CSS: `@media (max-width: 1024px) { .shell-user-btn, .shell-cmdk { width: var(--control-md); min-width: var(--control-md); height: var(--control-md); } }` y `.shell-actions > * { white-space: nowrap; flex-shrink: 0; }`.
- Páginas (datos exactos):
  - Patients: `[{ id: "nuevo-paciente", label: "Nuevo paciente", icon: "PLUS", principal: true, onClick: openCreate }, { id: "nuevo-caso", label: "Nuevo caso", icon: "FOLDER", onClick: () => setCaseSheet(true) }, ...(onStartWithoutPatient ? [{ id: "prueba-rapida", label: "Prueba rápida sin paciente", icon: "STEP_SEGMENT", title: "Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.", onClick: onStartWithoutPatient }] : [])]`
  - AuditTrail: `[{ id: "exportar", label: "Exportar", icon: "EXPORT", href: "/api/audit/export" }, { id: "verificar", label: busy ? "Verificando…" : "Verificar integridad", icon: "SHIELD", principal: true, disabled: busy, onClick: () => void runVerify() }]`
  - PendingRequests: `tab === "Pendientes" ? [{ id: "actualizar", label: "Actualizar", icon: "REFRESH", onClick: load }] : undefined`
  - UsersAdmin: `extra={<Input icon={<Icon name="SEARCH" />} placeholder="Buscar usuario…" aria-label="Buscar usuario" value={q} onChange={…} />}` (sin el `div` de 220) y `acciones={[{ id: "nuevo-usuario", label: "Nuevo usuario", icon: "PLUS", principal: true, onClick: () => setNewOpen(true) }]}`
  - Workshops: `[{ id: "nuevo-taller", label: "Nuevo taller", icon: "PLUS", principal: true, onClick: () => { setEditing(null); setSheetOpen(true); } }]`

- [ ] **Step 1: Escribir `MenuMas.test.tsx`**

```ts
const items: ItemMenu[] = [
  { id: "a", label: "Editar", icon: "EDIT", onSelect: vi.fn() },
  { id: "b", label: "Descargar", href: "/x.zip" },
  { id: "c", label: "Borrar", destructive: true, separadoAntes: true, onSelect: vi.fn() },
  { id: "d", label: "Bloqueado", disabled: true, onSelect: vi.fn() },
];
it("abre un menú de cristal en el body y lo cierra con Escape devolviendo el foco", ...);   // aria-expanded, role=menu con data-glass, 4 menuitem, Escape → foco al disparador
it("↓ y ↑ recorren los ítems", ...);
it("elegir ejecuta y cierra; deshabilitado no ejecuta; destructivo con data-danger; href es un enlace", ...);
it("clic fuera cierra", ...);
it("cerca del borde inferior se abre hacia arriba (alto 600)", () => {
  const s = simularPantalla({ ancho: 1707, alto: 600 });
  render(<MenuMas items={items} />);
  const boton = screen.getByRole("button", { name: "Más acciones" });
  vi.spyOn(boton, "getBoundingClientRect").mockReturnValue({ top: 560, bottom: 592, left: 1600, right: 1632, width: 32, height: 32, x: 1600, y: 560, toJSON() {} } as DOMRect);
  fireEvent.click(boton);
  expect(screen.getByRole("menu")).toHaveAttribute("data-lado", "arriba");
  s.restaurar();
});
it("táctil: ítems de 44 px", ...);   // style.minHeight === "44px"
```
(Escribir los cuerpos con las aserciones nombradas en cada comentario.)

- [ ] **Step 2: Escribir los tests de la barra por tramo** (`TopBar.test.tsx`; renderizar `TopBar` con `crumbs=[{label:"Pacientes", onClick}, {label:"Segura Restrepo, María Fernanda de los Ángeles"}]`, `subtitle="14 pacientes"` y tres acciones: principal «Nuevo paciente», «Nuevo caso», «Exportar» con `href`)

```ts
it("a 1707 todas llevan texto y hay botón Ctrl K", ...);           // getByRole("button",{name:"Nuevo caso"}).textContent contiene "Nuevo caso"; sin «Más acciones»
it("a 1280 la principal lleva texto y las demás solo icono con tooltip", ...); // «Nuevo caso»: textContent "" , aria-label y title; link «Exportar» con aria-label
it("a 1024 los controles miden 44", ...);                          // la principal data-size="md"; el botón de icono style.height "var(--control-md)"
it("a 390: icono principal, «⋯» con secundarias y la paleta, solo el último segmento de la miga y sin subtítulo", () => {
  const s = simularPantalla({ ancho: 390 });
  /* render … */
  expect(screen.getByRole("button", { name: "Nuevo paciente" }).textContent).toBe("");
  expect(screen.queryByText("14 pacientes")).toBeNull();
  expect(screen.queryByRole("button", { name: "Pacientes" })).toBeNull();
  const ultimo = screen.getByText("Segura Restrepo, María Fernanda de los Ángeles");
  expect(ultimo).toHaveClass("shell-crumb");                       // elipsis por CSS (.shell-crumb)
  expect(screen.queryByRole("button", { name: /Abrir la paleta de mandos/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  expect(screen.getByRole("menuitem", { name: "Nuevo caso" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Exportar" })).toHaveAttribute("href", "/api/audit/export");
  expect(screen.getByRole("menuitem", { name: "Paleta de mandos" })).toBeInTheDocument();
  s.restaurar();
});
it("al pasar de 1707 a 390 en vivo, las secundarias se recogen en «⋯»", ...);  // act(() => s.cambiar({ ancho: 390 }))
```
(La de 390 cubre la Review Focus 4; la última, la 5.)

- [ ] **Step 3: Ejecutar y ver fallar** — Run: `npx vitest run src/components/MenuMas.test.tsx src/components/shell/TopBar.test.tsx src/components/shell/AppShell.test.tsx` — Expected: FAIL.
- [ ] **Step 4: Implementar** `MenuMas`, el icono `MORE`, `AccionBarra` y la lógica por tramo en TopBar, las props en AppShell, el tamaño `lg` de ThemeToggle, el CSS, y migrar las cinco páginas a `acciones`/`extra`. Actualizar los tests de AppShell que pasaban `actions={<button>…</button>}` para que pasen `acciones=[…]`.
- [ ] **Step 5: Ejecutar y ver pasar** — Run: `npx vitest run src/components/MenuMas.test.tsx src/components/shell src/pages/Patients.test.tsx src/pages/AuditTrail.test.tsx src/pages/PendingRequests.test.tsx src/pages/UsersAdmin.test.tsx src/pages/Workshops.test.tsx src/components/Icon.test.tsx src/styles/cristal.audit.test.ts src/styles/tokens.test.ts` — Expected: PASS (el test de AuditTrail sigue encontrando `link` «Exportar» con `href` y `target="_blank"`).
- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MenuMas.tsx frontend/src/components/MenuMas.test.tsx frontend/src/components/Icon.tsx frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/TopBar.test.tsx frontend/src/components/shell/AppShell.tsx frontend/src/components/shell/AppShell.test.tsx frontend/src/components/shell/shell.css frontend/src/components/ThemeToggle.tsx frontend/src/pages/Patients.tsx frontend/src/pages/AuditTrail.tsx frontend/src/pages/PendingRequests.tsx frontend/src/pages/UsersAdmin.tsx frontend/src/pages/Workshops.tsx
git commit -m "Fase 8: barra superior adaptable — iconos a ≤ 1280, 44 px a ≤ 1024 y menú «⋯» en móvil (A19)"
```
(más los tests de página tocados, nombrados uno a uno).

---

### Task 9: «Ctrl K» fuera de macOS e iconos en la paleta (A20, A62)

**Files:**
- Create: `frontend/src/lib/plataforma.ts`
- Create: `frontend/src/lib/plataforma.test.ts`
- Modify: `frontend/src/components/shell/TopBar.tsx` (+ `TopBar.test.tsx`)
- Modify: `frontend/src/components/stepper/QuirofanoBar.tsx:111-112` (+ `QuirofanoBar.test.tsx`)
- Modify: `frontend/src/components/stepper/StepDock.tsx:120-132`
- Modify: `frontend/src/components/CommandPalette.tsx` (+ `CommandPalette.test.tsx`)

**Interfaces:**
- Produces:
  ```ts
  type NavegadorMin = { platform?: string; userAgent?: string; userAgentData?: { platform?: string } };
  /** macOS, iPhone o iPad: userAgentData.platform, si no navigator.platform, si no el userAgent. */
  export function esMac(nav?: NavegadorMin): boolean;          // por defecto, window.navigator
  /** Rótulo visible del atajo: "⌘K" en Mac, "Ctrl K" en el resto. */
  export function atajoPaleta(nav?: NavegadorMin): "⌘K" | "Ctrl K";
  /** Nombre accesible del botón: "Abrir la paleta de mandos (⌘K)" o "Abrir la paleta de mandos (Ctrl+K)". */
  export function rotuloPaleta(nav?: NavegadorMin): string;
  ```
  Los tres botones (TopBar `.shell-cmdk`, QuirofanoBar `.shell-cmdk`, StepDock) muestran `atajoPaleta()`, `aria-label={rotuloPaleta()}`, `title={"Paleta de mandos (" + atajoPaleta() + ")"}` y `aria-keyshortcuts={esMac() ? "Meta+K" : "Control+K"}`. Fuera de Mac el nombre accesible no cambia respecto a hoy, así que las consultas existentes por «Abrir la paleta de mandos (Ctrl+K)» siguen valiendo.
- Paleta (A62): `Row` gana `icon: IconName`, fijado por grupo con `const ICONO_GRUPO: Record<(typeof GROUPS)[number], IconName> = { "Ir a": "OPEN", Pasos: "TARGET", Acciones: "SPARKLE", Pacientes: "USER", Recientes: "RESUME" };` y pintado con `<Icon name={r.icon} size={14} color="var(--muted-foreground)" />` a la izquierda de la etiqueta. Por punto de corte: con `useTableta()` cada opción tiene `minHeight: 44` (objetivo táctil).

- [ ] **Step 1: Escribir los tests**

```ts
// plataforma.test.ts
it.each([
  [{ userAgentData: { platform: "macOS" } }, true],
  [{ platform: "MacIntel" }, true],
  [{ platform: "iPhone" }, true],
  [{ platform: "Win32" }, false],
  [{ platform: "", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }, false],
  [{ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" }, true],
])("esMac(%o) = %s", (nav, mac) => expect(esMac(nav)).toBe(mac));
it("rótulos", () => {
  expect(atajoPaleta({ platform: "Win32" })).toBe("Ctrl K");
  expect(atajoPaleta({ platform: "MacIntel" })).toBe("⌘K");
  expect(rotuloPaleta({ platform: "Win32" })).toBe("Abrir la paleta de mandos (Ctrl+K)");
  expect(rotuloPaleta({ platform: "MacIntel" })).toBe("Abrir la paleta de mandos (⌘K)");
});
// TopBar.test.tsx (jsdom: platform "" y userAgent sin Mac)
it("fuera de Mac el botón dice «Ctrl K»", () => {
  render(<TopBar crumbs={[{ label: "Pacientes" }]} />);
  const b = screen.getByRole("button", { name: "Abrir la paleta de mandos (Ctrl+K)" });
  expect(b.textContent).toBe("Ctrl K");
  expect(b).toHaveAttribute("aria-keyshortcuts", "Control+K");
});
// CommandPalette.test.tsx
it("cada opción lleva el icono de su grupo", async () => { /* abrir con Ctrl+K; cada role=option contiene un svg */ });
it("a 1024 las opciones miden al menos 44 px", async () => { /* simularPantalla({ ancho: 1024 }); option.style.minHeight === "44px" */ });
```
(Añadir a `QuirofanoBar.test.tsx` la misma aserción de texto «Ctrl K».)

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/lib/plataforma.test.ts src/components/shell/TopBar.test.tsx src/components/stepper/QuirofanoBar.test.tsx src/components/CommandPalette.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** `lib/plataforma.ts`, los tres botones y los iconos y el alto táctil de la paleta.
- [ ] **Step 4: Ejecutar y ver pasar** — el mismo comando más `src/components/stepper/StepDock.test.tsx src/motion/reducido.test.tsx src/App.paleta.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/plataforma.ts frontend/src/lib/plataforma.test.ts frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/TopBar.test.tsx frontend/src/components/stepper/QuirofanoBar.tsx frontend/src/components/stepper/QuirofanoBar.test.tsx frontend/src/components/stepper/StepDock.tsx frontend/src/components/CommandPalette.tsx frontend/src/components/CommandPalette.test.tsx
git commit -m "Fase 8: «Ctrl K» fuera de macOS e iconos por grupo en la paleta (A20, A62)"
```

---

### Task 10: Hoja lateral que suelta el puntero al cerrarse y ocupa la pantalla en móvil (A18)

**Files:**
- Modify: `frontend/src/components/Sheet.tsx`
- Modify: `frontend/src/components/Sheet.test.tsx`
- Modify: `frontend/src/motion/index.ts` (exportar `useIsPresent` de `motion/react`)

**Interfaces:**
- Consumes: `useMovil`, `useTableta` (tarea 1); `useIsPresent` (nuevo en el barrel).
- Produces: sin cambio de props de `Sheet`. Por dentro:
  - La capa fija (`position: fixed; inset: 0; z-index: 100`) pasa a un componente interno `CapaHoja` hijo directo de `AnimatePresence` que lee `useIsPresent()` y pone `pointerEvents: presente ? "auto" : "none"`: en cuanto empieza la salida, los clics atraviesan velo y panel y llegan a la página.
  - Por tramo: **≤ 640** el panel ocupa la pantalla (`width: "100%"`, `maxWidth: "100vw"`, `borderRadius: 0`); **641–1024** `width` pedido con `maxWidth: "94vw"` (como hoy) y el botón «Cerrar» de 44×44; **> 1024** como hoy (botón de 40). Con movimiento reducido sigue el `fundido`.

- [ ] **Step 1: Escribir los tests**

```ts
it("al cerrarse, la capa deja de capturar el puntero durante la salida (A18)", () => {
  const { rerender } = render(<Sheet open onClose={() => {}} title="Nuevo taller"><p>x</p></Sheet>);
  expect(screen.getByRole("dialog").parentElement!.style.pointerEvents).toBe("auto");
  rerender(<Sheet open={false} onClose={() => {}} title="Nuevo taller"><p>x</p></Sheet>);
  const saliendo = screen.getByRole("dialog");            // AnimatePresence la mantiene durante la salida (480 ms)
  expect(saliendo.parentElement!.style.pointerEvents).toBe("none");
});
it("en móvil ocupa la pantalla entera", () => {
  const s = simularPantalla({ ancho: 390 });
  render(<Sheet open onClose={() => {}} title="Ficha" width={560}><p>x</p></Sheet>);
  const panel = screen.getByRole("dialog");
  expect(panel.style.width).toBe("100%");
  expect(panel.style.maxWidth).toBe("100vw");
  expect(panel.style.borderRadius).toBe("0px");
  s.restaurar();
});
it("en tableta conserva el ancho pedido con tope 94vw y «Cerrar» de 44 px", () => {
  const s = simularPantalla({ ancho: 768 });
  render(<Sheet open onClose={() => {}} title="Ficha" width={560}><p>x</p></Sheet>);
  expect(screen.getByRole("dialog").style.width).toBe("560px");
  expect(screen.getByRole("dialog").style.maxWidth).toBe("94vw");
  expect(screen.getByRole("button", { name: "Cerrar" }).style.width).toBe("44px");
  s.restaurar();
});
it("en escritorio, como hasta ahora", () => { /* simularPantalla({ ancho: 1707 }); width "460px" por defecto; Cerrar "40px" */ });
```

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/components/Sheet.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** `CapaHoja`, el export de `useIsPresent` y los tramos.
- [ ] **Step 4: Ejecutar y ver pasar** — Run: `npx vitest run src/components/Sheet.test.tsx src/motion/reducido.test.tsx src/components/PatientFormSheet.test.tsx src/components/CommandPalette.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sheet.tsx frontend/src/components/Sheet.test.tsx frontend/src/motion/index.ts
git commit -m "Fase 8: la hoja suelta el puntero al empezar la salida (A18) y ocupa la pantalla en móvil"
```

---

### Task 11: Botón *outline*/*secondary* sin relleno gris en claro (A21)

**Files:**
- Modify: `frontend/src/styles/tokens/colors.css` (dos tokens en los dos bloques)
- Modify: `frontend/src/styles/tokens.test.ts`
- Modify: `frontend/src/components/Button.tsx:28-29,52-59`
- Modify: `frontend/src/components/Button.test.tsx`
- Modify: `frontend/src/components/shell/shell.css` (`.shell-accion` de la tarea 8, si usa los valores viejos)

**Interfaces:**
- Produces (tokens exactos):

| token | oscuro | claro |
|---|---|---|
| `--btn-outline-bg` | `rgba(255, 255, 255, 0.08)` | `transparent` |
| `--btn-outline-border` | `rgba(255, 255, 255, 0.3)` | `rgba(0, 0, 0, 0.14)` |

  El oscuro reproduce lo de hoy (`color-mix(--foreground 8 %)` y `30 %`); el claro deja el botón transparente con el borde de los campos (`--input`), no `--border` (0,08, que sobre las tarjetas blancas no dibuja borde). `Button` (`outline` y `secondary`): `background: on ? "var(--glass-hover)" : "var(--btn-outline-bg)"`, `border: "1px solid var(--btn-outline-border)"`; se borran las constantes `REST` y `EDGE`.

- [ ] **Step 1: Escribir los tests**

```ts
// Button.test.tsx
it.each(["outline", "secondary"] as const)("%s usa los tokens de contorno (transparente en claro)", (variant) => {
  render(<Button variant={variant}>Editar</Button>);
  const b = screen.getByRole("button", { name: "Editar" });
  expect(b.style.background).toBe("var(--btn-outline-bg)");
  expect(b.style.border).toBe("1px solid var(--btn-outline-border)");
});
// tokens.test.ts
it("el botón de contorno es transparente en claro y conserva el cristal en oscuro (A21)", () => {
  expect(dark).toMatch(/--btn-outline-bg:\s*rgba\(255, ?255, ?255, ?0?\.08\)/);
  expect(dark).toMatch(/--btn-outline-border:\s*rgba\(255, ?255, ?255, ?0?\.3\)/);
  expect(light).toMatch(/--btn-outline-bg:\s*transparent/);
  expect(light).toMatch(/--btn-outline-border:\s*rgba\(0, ?0, ?0, ?0?\.14\)/);
});
```

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/components/Button.test.tsx src/styles/tokens.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** tokens y `Button`; alinear `.shell-accion` con los mismos tokens.
- [ ] **Step 4: Ejecutar y ver pasar** — el mismo comando más `src/styles/cristal.audit.test.ts src/components/shell/TopBar.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/tokens/colors.css frontend/src/styles/tokens.test.ts frontend/src/components/Button.tsx frontend/src/components/Button.test.tsx frontend/src/components/shell/shell.css
git commit -m "Fase 8: botón de contorno transparente en claro (A21, A52)"
```

---

### Task 12: Entrar, Crear cuenta y cambio forzado sobre el cristal y a cualquier ancho (A15, A61)

**Files:**
- Modify: `frontend/src/components/shell/AuthWindow.tsx` (+ `AuthWindow.test.tsx`)
- Modify: `frontend/src/pages/Login.tsx` (+ `Login.test.tsx`)
- Modify: `frontend/src/pages/Signup.tsx` (+ `Signup.test.tsx`)
- Modify: `frontend/src/components/ForcePasswordChange.tsx` (+ `ForcePasswordChange.test.tsx`)
- Modify: `frontend/src/components/ChangePasswordSheet.tsx:80-81`
- Create: `frontend/src/components/ChangePasswordSheet.test.tsx`
- Modify: `frontend/src/components/Input.tsx:93,99` (pista y error de 12 → 13 px), `frontend/src/components/FileField.tsx:13` (rótulo de 12 → 13 px) (+ `Input.test.tsx` si fija el 12)
- Modify: `frontend/src/styles/responsive.css:23-30` (borrar el bloque `.login-media`/`.login-form` de 1100/820)
- Modify: `frontend/src/styles/puntosCorte.audit.test.ts` (quitar `styles/responsive.css` de `LEGADO`)

**Interfaces:**
- Consumes: `Ambiente` (tarea 4), `Logo` (tarea 2), `useMovil`/`useTableta`/`useEstrecho` (tarea 1), `Button` variante `link` y `ghost`.
- Produces: `AuthWindow` con `glass("normal")` + `data-glass` (A15; antes `dense`) y `padding: movil ? 24 : 40`. Mismas props.
- Login y Signup por tramo:

| tramo | panel de marca (`AuthBrand`) | cabecera de la zona del formulario | `.login-form` |
|---|---|---|---|
| > 1280 | sí, `flex` `"1 1 62%"` (Login) / `"1 1 56%"` (Signup) | volver + tema | `minWidth` 320 / 340 |
| 1025–1280 | sí, `flex` `"1 1 45%"` | volver + tema | `minWidth` 320 / 340 |
| ≤ 1024 | **no se monta** (tampoco se descarga el vídeo) | `<Logo variante="linea" size={32} />` encima de la ventana, centrado | `minWidth: 0`, `flex: "1 1 100%"` |
| ≤ 640 | no | igual | igual; `AuthWindow` con 24 px de relleno |

  (Sustituye a las reglas de `responsive.css` con `!important` a 1100 y 820, que no son puntos comunes.) Volver: `<Button variant="ghost" size={tableta ? "md" : "sm"} leadingIcon={<Icon name="BACK" />}>Página principal</Button>` (Login) y «Volver a Entrar» (Signup); el «Crear cuenta» de Login pasa a `<Button variant="link">Crear cuenta</Button>`. Textos sans < 13 px de estas tres pantallas pasan a 13 px (aviso de cuenta, las dos frases bajo el formulario, aviso de pendiente de Signup, error de Signup, pie «Prospective™ Web — …»). ForcePasswordChange: rejilla centrada con `padding: 16` (sin cambios) y la ventana hereda los 24/40 px de `AuthWindow`.
- A61: el texto de `ChangePasswordSheet` pasa a exactamente «Tu sesión seguirá abierta en este equipo.»

- [ ] **Step 1: Escribir los tests**

```ts
// AuthWindow.test.tsx
it("cristal normal con data-glass (A15)", () => {
  render(<AuthWindow titulo="Iniciar sesión"><p>x</p></AuthWindow>);
  const v = screen.getByRole("region", { name: "Iniciar sesión" });
  expect(v).toHaveAttribute("data-glass");
  expect(v.style.background).toBe("var(--glass)");
});
it.each([[390, "24px"], [768, "40px"], [1707, "40px"]])("a %i px el relleno es %s", (ancho, relleno) => { /* simularPantalla; style.padding */ });

// Login.test.tsx
it("a 1707 el panel de marca ocupa el 62 %", () => { /* simularPantalla({ancho:1707}); .login-media style.flex "1 1 62%" */ });
it("a 1280 cede al 45 %", () => { /* "1 1 45%" */ });
it.each([1024, 768, 390, 360])("a %i px no hay panel de vídeo: el logotipo va sobre la ventana y nada fuerza ancho mínimo", (ancho) => {
  const s = simularPantalla({ ancho });
  const { container } = montar();
  expect(container.querySelector(".login-media")).toBeNull();
  expect(container.querySelector("video")).toBeNull();
  const zona = container.querySelector<HTMLElement>(".login-form")!;
  expect(within(zona).getByText("Prospective")).toBeInTheDocument();
  expect(zona.style.minWidth).toBe("0px");
  s.restaurar();
});
it("por debajo de 1024 «Página principal» mide 44 px", () => { /* data-size="md" */ });
it("«Crear cuenta» es un botón de enlace del sistema", () => { /* getByRole("button",{name:"Crear cuenta"}) data-variant="link" */ });
it("ningún texto de la pantalla baja de 13 px (salvo rótulos mono y la marca)", () => {
  const { container } = montar();
  for (const el of container.querySelectorAll<HTMLElement>("p, div, span, a, button, label")) {
    const fs = parseFloat(el.style.fontSize);
    if (Number.isNaN(fs) || el.closest("[data-logo]") || el.style.fontFamily.includes("--font-mono")) continue;
    expect(fs, el.textContent ?? "").toBeGreaterThanOrEqual(13);
  }
});
// Signup.test.tsx: los mismos tramos (56 % / 45 % / sin panel a ≤ 1024 con minWidth "0px"; a 360 sin panel — Review Focus 1)
// ForcePasswordChange.test.tsx: a 390 la ventana tiene 24 px de relleno y la pantalla va sobre [data-ambiente]
// ChangePasswordSheet.test.tsx
it("dice que la sesión sigue abierta, sin jerga (A61)", () => {
  render(<ChangePasswordSheet open onClose={() => {}} />);
  expect(screen.getByText("Tu sesión seguirá abierta en este equipo.")).toBeInTheDocument();
  expect(screen.queryByText(/token/)).toBeNull();
});
```
(El test de 13 px se repite en Signup, que lleva `FileField` e `Input` con pista: por eso suben a 13 la pista, el error y el rótulo de esos dos componentes; sus rótulos de grupo en mono mayúsculas quedan como excepción. Adaptar las props del render de `ChangePasswordSheet` a las suyas reales y mockear lo que pida, como en `UserMenu.test.tsx`.)

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `npx vitest run src/components/shell/AuthWindow.test.tsx src/pages/Login.test.tsx src/pages/Signup.test.tsx src/components/ForcePasswordChange.test.tsx src/components/ChangePasswordSheet.test.tsx src/styles/puntosCorte.audit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** lo de la tabla; borrar el bloque de `responsive.css` y la entrada de `LEGADO`.
- [ ] **Step 4: Ejecutar y ver pasar** — el mismo comando más `src/components/shell/AuthBrand.test.tsx src/styles/cristal.audit.test.ts src/styles/tokens.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/AuthWindow.tsx frontend/src/components/shell/AuthWindow.test.tsx frontend/src/pages/Login.tsx frontend/src/pages/Login.test.tsx frontend/src/pages/Signup.tsx frontend/src/pages/Signup.test.tsx frontend/src/components/ForcePasswordChange.tsx frontend/src/components/ForcePasswordChange.test.tsx frontend/src/components/ChangePasswordSheet.tsx frontend/src/components/ChangePasswordSheet.test.tsx frontend/src/components/Input.tsx frontend/src/components/FileField.tsx frontend/src/styles/responsive.css frontend/src/styles/puntosCorte.audit.test.ts
git commit -m "Fase 8: Entrar, Crear cuenta y cambio forzado en cristal normal y adaptables (A15, A61)"
```
(más `Input.test.tsx` si hubo que tocarlo).

---

### Task 13: Verificación final — suite, tipos, construcción y pasada en el navegador por la matriz

La hace el controlador; no cambia código salvo para arreglar lo que salga (cada arreglo, con su test y su commit, vuelve a la tarea dueña).

- [ ] **Step 1: Suite completa y tipos** — desde `frontend/` del worktree: `npx tsc -b` (sin errores) y `npx vitest run` (5–7 min; todo verde; guardar la salida en el scratchpad como `suite-fase8.txt`).
- [ ] **Step 2: Construcción** — `npx vite build`: sin avisos de recursos que falten (fuentes Sora, favicon); comprobar en `dist/` que están `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` y los dos `Sora-*.woff2` con hash.
- [ ] **Step 3: Servidores** — backend y Vite del worktree con `Start-Process` (los shells de fondo mueren); antes, comprobar que no hay un backend zombi en :8000 sirviendo código viejo.
- [ ] **Step 4: Pasada por la matriz** — en el Chrome del dueño (al 80 %), con la extensión: como la ventana maximizada no se encoge, cada ancho se prueba dentro de un `iframe` del mismo origen creado con `javascript_tool` sobre la propia app (`document.body.innerHTML = '<iframe src="/app/…" style="width:Wpx;height:Hpx;border:0">'`). Anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1920, 2560 × altos 600, 768, 900, 1080; temas claro y oscuro (la landing solo oscuro). Vistas tocadas: Entrar, Crear cuenta, cambio forzado (si no hay cuenta con contraseña asignada, por código y con el test), Pacientes (barra, «⋯», cajón de secciones, `PageBody`), Usuarios y Auditoría (barra con `extra` y enlace «Exportar»), Estudios y la ficha L3 (`PageBody` modo pantalla), una hoja («Nuevo taller»: abrir, cerrar con Escape y **pulsar enseguida** otro control —el clic debe llegar—; a 390 a pantalla completa), la paleta (rótulo «Ctrl K», iconos, opciones de 44 px a ≤ 1024), landing (nav y pie con la marca nueva), pantalla de carga (marca y pastilla a 390), pestaña (favicon D) y, con la emulación de DevTools si está a mano o el ajuste del sistema, `prefers-reduced-transparency` (fondo plano) y `prefers-reduced-motion` (hojas y cajón solo se funden).
- [ ] **Step 5: Criterios por captura** — en cada combinación: nada cortado ni pisado; sin scroll horizontal de página (`document.documentElement.scrollWidth <= innerWidth` con `javascript_tool`); sin scroll interno evitable; objetivos ≥ 44 px a < 1024; textos ≥ 13 px salvo las excepciones; a ≥ 1920 el contenido a 1280 centrado y el fondo ambiente llenando la pantalla; brillos visibles detrás del cristal y el cristal notándose. Guardar las capturas en `<scratchpad>/capturas-fase8/` con nombre `vista-ancho×alto-tema.png` y una tabla de resultados en el informe de la fase.
- [ ] **Step 6: Fusión** — con todo verde y la pasada limpia: `git merge --no-ff fase8-base-marca` en `main` (mensaje «Fusiona la fase 8 de las correcciones del dueño: base común y marca»), **sin push**; añadir a la sección «Fases» del spec una línea «Fase 8 completada el …» con desviaciones (las de la sección de dudas del plan si se mantienen).
