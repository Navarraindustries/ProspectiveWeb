# Correcciones del dueño · Fase 9 (páginas de gestión) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restilar al sistema D el INTERIOR de Pacientes, hojas Nuevo paciente / Nuevo caso, Estudios, ficha L3, Pedidos de clips, Talleres, Usuarios, Cuentas pendientes y Auditoría (hoy solo el contenedor es de cristal), arreglar los hallazgos A23–A60 de la auditoría y fijar con tests su comportamiento en cada punto de corte: sin scroll horizontal, sin scroll interno innecesario, tablas → tarjetas por debajo de 640.

**Architecture:** Primero las piezas comunes que varias páginas necesitan (`Switch`, `Pastillas`, variante `destructive-ghost`, marca de obligatorio, `Collapsible` con chevron, `EstadoVacio`, fechas es-ES de solo día, `TablaTarjetas` que pinta tabla o tarjetas según `useMovil`, objetivos táctiles por token dentro de la oficina) y una auditoría estática de gestión que cada tarea de página amplía con sus ficheros. Después, una tarea por página (dos para la ficha y dos para Pedidos) que cambia estilos inline viejos por esos componentes, arregla sus hallazgos y añade su matriz con `simularPantalla`. El único cambio de servidor es resolver el paciente de cada bloque de auditoría (A59).

**Tech Stack:** React 19 + Vite 7 + TypeScript, `motion` 12 por el barrel `src/motion`, vitest + Testing Library (jsdom), CSS plano con tokens; FastAPI + Pydantic + pytest para la tarea 16.

**Spec:** `docs/superpowers/specs/2026-11-01-correcciones-dueno-design.md` (secciones «Responsive», «Páginas de gestión», fila 9 de «Fases») y la auditoría `docs/superpowers/specs/2026-11-01-auditoria-visual.md` §4–§12 (A23–A60) más la lista final «Páginas que necesitan el restilado completo». §13 (A61, A62) ya lo cerró la fase 8: solo se comprueba en la tarea 18. Material D: `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §4.

## Global Constraints

- Worktree de la fase (rama `fase9-gestion`, con `superpowers:using-git-worktrees`; `npm ci` en `frontend/`). Al final, fusión local `--no-ff` a `main`, **sin push**.
- Pruebas desde `frontend/` del worktree: `npx vitest run <ficheros>` por tarea. La suite completa (`npx vitest run`, 5–7 min) y `npx tsc -b` solo en la tarea 18. Ninguna tarea se cierra con tests rojos o errores de tipos en lo que toca; si un test existente de la página cambia por el rediseño (botón que pasa a un menú «⋯», texto nuevo), se actualiza en la misma tarea diciendo por qué en el commit.
- Backend (tarea 16): el worktree no trae `.venv`; se usa el del repositorio principal desde `backend/` del worktree: `C:/UniNavarra/Proyectos/Prospective/ProspectiveWeb/backend/.venv/Scripts/python.exe -m pytest <fichero> -q`.
- Textos en español; coma decimal en lo que lee una persona (`lib/numero.ts`: `cifra`, `mm`); plurales escritos (nunca «(s)» ni «(es)»); fechas solo con `lib/fecha.ts`.
- Commits con lista explícita de ficheros: **nunca `git add -A` ni `git add .`** (hay datos de pacientes sin versionar en `data/` y `frontend/data/`). Ningún dato de paciente real en commits ni en fixtures nuevas (nombres de prueba inventados). Mensajes en español terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Jvb98Z7qUQgpAZH17ZDo2f`.
- Editar con Edit/Write. No `sed -i` sobre ficheros CRLF; no heredocs de Python con barras invertidas.
- **No tocar** el quirófano (`pages/Workspace.tsx`, `vtk/*`, `components/stepper/*`) ni la landing (`pages/Landing.tsx`, `components/landing/*`, `styles/landing.css`).
- Movimiento solo por `src/motion`; con `prefers-reduced-motion: reduce` solo opacidad (`fundido`) o nada. Con `prefers-reduced-transparency: reduce` el cristal es opaco (lo hace `base.css` sobre `[data-glass]`).
- Cristal: todo `glass("normal" | "dense" | "viewer")` lleva `data-glass` (`styles/cristal.audit.test.ts`). Ningún color literal: solo tokens (`styles/tokens.test.ts`). Botón de solo icono = `aria-label` + `title`.
- **Puntos de corte**: solo los de `styles/puntosCorte.ts` (640 / 1024 / 1280 / 1920; en CSS `max-width: 640px`, `1024px`, `1280px`, `min-width: 1920px`, o 641/1025/1281 para «mayor que»). En TS, los hooks `useMovil` / `useTableta` / `useEstrecho` / `useTramo` de `hooks/useEstrecho.ts`. Lo vigila `styles/puntosCorte.audit.test.ts`.
- **Matriz** (spec «Responsive»): anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1707 (portátil del dueño, Chrome al 80 %: 1707×743), 1920, 2560; altos 600, 768, 900, 1080.
- **En toda vista tocada y todo ancho:** nada se corta ni se pisa; sin scroll horizontal (ni de página ni de contenedor: fuera `overflowX: "auto"` y `.table-scroll` en estas páginas); sin scroll interno si el contenedor puede crecer; objetivos ≥ 44 px por debajo de 1024; texto ≥ 13 px (excepciones: rótulo mono en mayúsculas `--text-eyebrow`, códigos y cifras en mono a 12 px, `Badge`); tablas → tarjetas en ≤ 640; a ≥ 1920 el contenido se queda en `--content-max` salvo la ficha L3 (tarea 8).
- Cada vista tocada lleva su test por punto de corte con `simularPantalla(ancho | { ancho, alto, … })` de `test/pantalla.ts` (`afterEach(() => vi.unstubAllGlobals())`; los cambios en vivo con `act(() => ctl.cambiar({ ancho }))`). Lo que es CSS puro se fija leyendo la hoja con `readFileSync` (patrón de `PageBody.test.tsx`).
- Lo que dejó la fase 8 se reutiliza tal cual: `PageBody`, `MenuMas` (`ItemMenu`, `tactil`, `abreDialogo`), `TopBar` (`acciones: AccionBarra[]`, `extra`), `Sheet` (pantalla completa en móvil), `Button` (`default | outline | secondary | ghost | destructive | link`; `sm | md | lg | icon`), `Badge`, `Input`, `Select`, `Tabs`, `glass(kind)`.

## Review Focus

1. **Fecha de solo día en una zona negativa** (el dueño trabaja en UTC−5): «2026-10-30» de un caso o de un pedido debe verse «30/10/26», no «29/10/26» como daría `fecha()` al leerla como medianoche UTC. Test en la tarea 3 (`fechaDia`) y en la 9 (fila de caso).
2. **Pulsar una acción dentro de una fila o tarjeta pulsable** («⋯», «Reanudar», un enlace) no debe abrir además la fila. Test en la tarea 4 (`TablaTarjetas`, en tabla y en tarjeta).
3. **Cambio de tamaño en vivo con algo abierto**: un pedido elegido a 1707 que pasa a 1280 debe seguir elegido y verse en hoja; Usuarios que pasa de 1280 a 390 cambia tabla por tarjetas sin perder la búsqueda. Tests en las tareas 4, 12 y 14.
4. **Textos larguísimos** (HC tipo UUID, nombre de 80 caracteres, especialidad + hospital largos): elipsis con `title` o corte por palabra, nunca ensanchan la tabla ni la tarjeta. Tests en las tareas 4 (celda con `minWidth: 0` y `overflow-wrap: anywhere`) y 5 (HC).
5. **«Reanudar» que tarda o falla** (servidor caído, 20 s de restauración): la tarjeta enseña «Abriendo…» y se bloquea, y si la promesa falla vuelve a su estado y deja reintentar; nunca queda colgada. Test en la tarea 5 (promesa rechazada) y en la 9.

---

### Task 1: `Switch` (interruptor de cristal) y `Pastillas` (filtro con recuentos)

**Files:**
- Create: `frontend/src/components/Switch.tsx`, `frontend/src/components/Switch.test.tsx`
- Create: `frontend/src/components/Pastillas.tsx`, `frontend/src/components/Pastillas.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // Switch.tsx
  export function Switch(props: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Texto visible y nombre accesible. */
    label: ReactNode;
    /** Línea atenuada bajo el rótulo (aria-describedby). */
    descripcion?: ReactNode;
    disabled?: boolean;
  }): JSX.Element;
  // Pastillas.tsx
  export interface OpcionPastilla { id: string; label: string; cuenta?: number }
  export function Pastillas(props: {
    opciones: readonly OpcionPastilla[];
    valor: string;
    onCambiar: (id: string) => void;
    /** aria-label del grupo. */
    rotulo: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Tests que fallan**

```tsx
// Switch.test.tsx
afterEach(() => vi.unstubAllGlobals());
it("es un role=switch con el rótulo como nombre y alterna", () => {
  const onChange = vi.fn();
  render(<Switch checked label="Solo los abiertos" onChange={onChange} />);
  const sw = screen.getByRole("switch", { name: "Solo los abiertos" });
  expect(sw).toHaveAttribute("aria-checked", "true");
  fireEvent.click(sw);
  expect(onChange).toHaveBeenCalledWith(false);
});
it("deshabilitado no cambia", () => { /* disabled → click → onChange no llamado; aria-disabled o disabled */ });
it("la descripción es aria-describedby", () => { /* descripcion="x" → getByRole("switch") tiene accessibleDescription "x" */ });
it("≥ 44 px por debajo de 1024 y 36 px por encima", () => {
  simularPantalla(1024);
  const { unmount } = render(<Switch checked={false} label="A" onChange={() => {}} />);
  expect(screen.getByRole("switch")).toHaveStyle({ minHeight: "44px" });
  unmount(); vi.unstubAllGlobals(); simularPantalla(1280);
  render(<Switch checked={false} label="A" onChange={() => {}} />);
  expect(screen.getByRole("switch")).toHaveStyle({ minHeight: "36px" });
});
// Pastillas.test.tsx
it("grupo con aria-pressed en la activa, recuento en mono y clic cambia", () => {
  const onCambiar = vi.fn();
  render(<Pastillas rotulo="Filtrar por estado" valor="todos" onCambiar={onCambiar}
    opciones={[{ id: "todos", label: "Todos", cuenta: 3 }, { id: "firmado", label: "Firmado", cuenta: 0 }]} />);
  expect(screen.getByRole("group", { name: "Filtrar por estado" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Todos/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("3")).toHaveStyle({ fontFamily: "var(--font-mono)" });
  fireEvent.click(screen.getByRole("button", { name: /Firmado/ }));
  expect(onCambiar).toHaveBeenCalledWith("firmado");
});
it("envuelve en vez de desbordar y mide 44 px en ≤ 1024", () => { /* simularPantalla(390): el grupo tiene flexWrap "wrap"; cada botón minHeight 44px */ });
```

- [ ] **Step 2:** `npx vitest run src/components/Switch.test.tsx src/components/Pastillas.test.tsx` → FAIL (módulos no existen).
- [ ] **Step 3: Implementar.** `Switch`: un `<button type="button" role="switch" aria-checked>` que contiene la pista (36×20, `--radius-full`; encendida `--primary`, apagada `--glass` con borde `--glass-border`), el pomo (16 px, `--primary-foreground` encendido / `--foreground` apagado) y el rótulo a 14 px; `minHeight` 44 con `useTableta()`, 36 si no; el pomo se desplaza con `motion.span animate={{ x: checked ? 16 : 0 }}` y `transition={{ duration: reducido ? 0 : DUR.estado, ease: EASE }}` (`useReducedMotion`). `Pastillas`: `<div role="group" aria-label>` con `flexWrap: "wrap"` y `gap: 6`; cada opción un `<button aria-pressed>` pastilla (`--radius-full`, activa `--primary`/`--primary-foreground`, inactiva `glass("flat")`), 13 px, `whiteSpace: "nowrap"`, `minHeight` 44 con `useTableta()` y 32 si no; la cuenta en `<span>` mono atenuado.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** `git add frontend/src/components/Switch.tsx frontend/src/components/Switch.test.tsx frontend/src/components/Pastillas.tsx frontend/src/components/Pastillas.test.tsx` · «Gestión: interruptor de cristal y pastillas de filtro con recuento».

### Task 2: Controles comunes: `destructive-ghost`, marca de obligatorio, chevron del plegable, `EstadoVacio` y objetivos táctiles de la oficina

**Files:**
- Modify: `frontend/src/components/Button.tsx` (tipo `Variant`, `variantStyle`)
- Modify: `frontend/src/components/Input.tsx` (prop `obligatorio`)
- Modify: `frontend/src/components/PanelHead.tsx:85-118` (`Collapsible`: chevron)
- Create: `frontend/src/components/EstadoVacio.tsx`, `frontend/src/components/EstadoVacio.test.tsx`
- Modify: `frontend/src/components/Sheet.tsx` (atributo `data-hoja` en el panel)
- Modify: `frontend/src/components/shell/shell.css` (tras las reglas de `.page-body`, ~l. 525)
- Test: `frontend/src/components/Button.test.tsx`, `Input.test.tsx`, `PanelHead.test.tsx` (crear si no existe), `Sheet.test.tsx`, `shell/PageBody.test.tsx`

**Interfaces:**
- Produces: `Button variant="destructive-ghost"`: en reposo transparente con texto `--muted-foreground`; con hover o foco, texto `--destructive` y fondo `--destructive-bg`. Sirve a A41 (rojo solo al pasar) y A47 (Borrar).
- Produces: `Input obligatorio?: boolean` → el rótulo termina en `<span aria-hidden="true"> *</span>` y el campo lleva `aria-required="true"` (no el atributo `required`, para no disparar la validación nativa de los `<form>`).
- Produces: `export function EstadoVacio(props: { icono: IconName; titulo: string; children?: ReactNode; accion?: ReactNode }): JSX.Element` — tarjeta `glass("flat")` + `data-glass`, icono de 28 px en `--muted-foreground`, título 15 px 600, texto 13 px, acción debajo.
- Produces (CSS): dentro de `.page-body` y de `[data-hoja]`, por debajo de 1024, `--control-sm` y `--control-icon` valen 44 px: todos los `Button sm`/`icon` de la oficina miden 44 sin tocar cada llamada.

- [ ] **Step 1: Tests que fallan**

```tsx
// Button.test.tsx
it("destructive-ghost: gris en reposo, rojo al pasar", () => {
  render(<Button variant="destructive-ghost">Borrar</Button>);
  const b = screen.getByRole("button", { name: "Borrar" });
  expect(b).toHaveStyle({ color: "var(--muted-foreground)" });
  fireEvent.mouseEnter(b);
  expect(b).toHaveStyle({ color: "var(--destructive)", background: "var(--destructive-bg)" });
});
// Input.test.tsx
it("obligatorio: asterisco mudo y aria-required", () => {
  render(<Input label="Nombre" obligatorio />);
  const campo = screen.getByLabelText(/Nombre/);
  expect(campo).toHaveAttribute("aria-required", "true");
  expect(campo).not.toHaveAttribute("required");
  expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
});
// PanelHead.test.tsx
it("el plegable lleva un chevron de Icon que gira al abrir", () => {
  render(<Collapsible title="Más datos (opcional)" storageKey="t">x</Collapsible>);
  const b = screen.getByRole("button", { name: /Más datos/ });
  expect(b.querySelector("[data-chevron] svg")).not.toBeNull();
  expect(b.querySelector("[data-chevron]")!.textContent).toBe("");
  fireEvent.click(b);
  expect(b).toHaveAttribute("aria-expanded", "true");
  expect(b.querySelector("[data-chevron]")).toHaveAttribute("data-abierto", "true");
});
// EstadoVacio.test.tsx
it("icono, título, texto y acción", () => { /* render con accion=<Button>Nuevo taller</Button> → getByText(titulo), getByRole button, container svg */ });
// Sheet.test.tsx
it("el panel lleva data-hoja", () => { /* render open → getByRole("dialog") tiene data-hoja */ });
// PageBody.test.tsx
it("CSS: objetivos de 44 px en la oficina por debajo de 1024", () => {
  const css = readFileSync(join(__dirname, "shell.css"), "utf8").replace(/\r\n/g, "\n");
  expect(css).toMatch(/@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{\s*\.page-body,\s*\[data-hoja\]\s*\{\s*--control-sm:\s*44px;\s*--control-icon:\s*44px;/);
});
```

- [ ] **Step 2:** `npx vitest run src/components/Button.test.tsx src/components/Input.test.tsx src/components/PanelHead.test.tsx src/components/EstadoVacio.test.tsx src/components/Sheet.test.tsx src/components/shell/PageBody.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.** `destructive-ghost` también entra en la lente de cristal (`glass` de la línea 92 de `Button.tsx`) y con foco visible usa el mismo color que con hover (estado `hover || focus` con `onFocus`/`onBlur`). El chevron de `Collapsible`: `<motion.span data-chevron data-abierto={open} animate={{ rotate: open ? 90 : 0 }} transition={reducido ? { duration: 0 } : { duration: DUR.estado, ease: EASE }}>` con `<Icon name="CHEVRON_RIGHT" size={14} />` (lo usa también el quirófano: solo cambia el glifo, no el comportamiento). Regla CSS exacta: `@media (max-width: 1024px) { .page-body, [data-hoja] { --control-sm: 44px; --control-icon: 44px; } }`.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Gestión: botón destructivo atenuado, marca de obligatorio, chevron del plegable, estado vacío y objetivos de 44 px en la oficina».

### Task 3: Fechas es-ES de solo día y auditoría estática de las páginas de gestión

**Files:**
- Modify: `frontend/src/lib/fecha.ts`, `frontend/src/lib/fecha.test.ts`
- Create: `frontend/src/styles/gestion.audit.test.ts`

**Interfaces:**
- Produces (`lib/fecha.ts`):
  ```ts
  /** Un día sin hora («2026-10-30» o el DICOM «20261030») → «30/10/26», SIN cambio de zona.
   *  Con hora (ISO con «T») delega en `fecha()`. Vacío → «—». Texto libre que no es fecha → tal cual. */
  export function fechaDia(valor: string | null | undefined, o?: OpcionesFecha): string;
  /** Segundos Unix (los talleres y pedidos) → «26/10/24» o, con `conHora`, «26/10/24, 22:33». 0/null → «—». */
  export function fechaEpoch(seg: number | null | undefined, o?: OpcionesFecha & { conHora?: boolean }): string;
  ```
- Produces (`styles/gestion.audit.test.ts`): `const REVISADOS: string[] = []` (rutas relativas a `src/`, con `/`). Cada tarea de página añade ahí sus ficheros. Reglas por fichero revisado:
  - TSX: sin `type="checkbox"`; sin plural `(s)`/`(es)` en texto (`/[a-záéíóúñ]\((?:s|es)\)/i`); sin `overflowX:`; sin `className="table-scroll"`; sin `maxHeight: <número>`; sin `onMouseEnter=` (el hover va en CSS); sin `toLocaleDateString(` ni `toLocaleString(` (fechas por `lib/fecha`); sin `fontSize: 9|10|11`; `fontSize: 12` solo en la misma línea que `--font-mono`.
  - CSS: sin `overflow-x: auto`; sin `font-size: (9|10|11)(.\d+)?px`; `font-size: 12px` solo en un bloque que declara `--font-mono`.

- [ ] **Step 1: Tests que fallan**

```ts
// fecha.test.ts
const BOGOTA = { timeZone: "America/Bogota" };
it("fechaDia no desplaza un día sin hora en UTC−5", () => {
  expect(fechaDia("2026-10-30", BOGOTA)).toBe("30/10/26");
  expect(fechaDia("20261030", BOGOTA)).toBe("30/10/26");
  expect(fechaDia("2026-10-11T03:28:00", BOGOTA)).toBe("10/10/26");
  expect(fechaDia("", BOGOTA)).toBe("—");
  expect(fechaDia(null)).toBe("—");
  expect(fechaDia("antes del viernes")).toBe("antes del viernes");
});
it("fechaEpoch en la zona pedida", () => {
  expect(fechaEpoch(1730000000, BOGOTA)).toBe("26/10/24");
  expect(fechaEpoch(1730000000, { ...BOGOTA, conHora: true })).toBe("26/10/24, 22:33");
  expect(fechaEpoch(0)).toBe("—");
});
// gestion.audit.test.ts: el comprobador se prueba con muestras, y luego recorre REVISADOS
it("el comprobador detecta cada regla", () => {
  expect(revisarTsx('<input type="checkbox" />')).toContain("checkbox nativo");
  expect(revisarTsx('{n} pedido(s)')).toContain("plural (s)");
  expect(revisarTsx('style={{ fontSize: 11 }}')).toContain("texto < 13 px");
  expect(revisarTsx('style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}')).toEqual([]);
  expect(revisarCss(".a { font-size: 12px; }")).toContain("texto < 13 px");
  expect(revisarCss(".a { font-family: var(--font-mono); font-size: 12px; }")).toEqual([]);
  expect(revisarCss(".a { overflow-x: auto; }")).toContain("scroll horizontal");
});
it("los ficheros ya revisados cumplen", () => {
  const fallos = REVISADOS.flatMap((f) => (f.endsWith(".css") ? revisarCss : revisarTsx)(leer(f)).map((r) => `${f}: ${r}`));
  expect(fallos).toEqual([]);
});
```

- [ ] **Step 2:** `npx vitest run src/lib/fecha.test.ts src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `fechaDia`: con `/^(\d{4})-?(\d{2})-?(\d{2})$/` formatea con `timeZone: "UTC"` y `dateStyle: "short"` (el día escrito es el día); con «T» o hora, `fecha(valor, o)`; si `fecha` daría «—» para un texto no vacío, devuelve el texto. `fechaEpoch`: `new Date(seg * 1000)` con `dateStyle: "short"` (+ `timeStyle: "short"` con `conHora`). `revisarTsx`/`revisarCss` devuelven la lista de motivos (cadenas fijas de las muestras); quitan comentarios antes de revisar.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** `git add frontend/src/lib/fecha.ts frontend/src/lib/fecha.test.ts frontend/src/styles/gestion.audit.test.ts` · «Gestión: fechas de solo día sin desfase de zona y auditoría estática de las páginas».

### Task 4: `TablaTarjetas` (tabla que pasa a tarjetas en ≤ 640) y `office.css` en los puntos de corte comunes

**Files:**
- Create: `frontend/src/components/TablaTarjetas.tsx`, `frontend/src/components/TablaTarjetas.test.tsx`
- Modify: `frontend/src/styles/office.css` (reglas `.tabla-oficina` de fila pulsable/seleccionada, `.tt-*`; `.hoja-dos-columnas` a 640)
- Modify: `frontend/src/styles/puntosCorte.audit.test.ts` (quitar `"styles/office.css": [760]` de `LEGADO`)
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `components/TablaTarjetas.tsx`, `styles/office.css`)

**Interfaces:**
- Produces:
  ```ts
  export interface ColumnaTabla<T> {
    id: string;
    /** Cabecera en tabla; rótulo del dato en tarjeta. */
    titulo: string;
    celda: (fila: T) => ReactNode;
    /** En tarjeta: "titulo" (cabeza, una por tabla), "dato" (rótulo · valor; por defecto), "pie" (abajo: acciones), "oculta". */
    enTarjeta?: "titulo" | "dato" | "pie" | "oculta";
    alinear?: "inicio" | "fin";
    /** white-space: nowrap (fechas, códigos, acciones). */
    sinPartir?: boolean;
    /** Ancho CSS de la columna en la tabla («1%» encoge a su contenido). */
    ancho?: string;
  }
  export interface TablaTarjetasProps<T> {
    filas: readonly T[];
    columnas: readonly ColumnaTabla<T>[];
    clave: (fila: T) => string | number;
    /** Nombre accesible de la tabla o de la lista. */
    rotulo: string;
    /** Fila pulsable: cursor, hover de cristal, chevron final, Intro/Espacio. */
    onFila?: (fila: T) => void;
    seleccionada?: (fila: T) => boolean;
    claseFila?: (fila: T) => string | undefined;
    /** Desplegado bajo la fila (tabla: <tr class="fila-detalle">; tarjeta: dentro de ella). */
    detalle?: (fila: T) => ReactNode | null;
    /** Sustituye al cuerpo cuando no hay filas (vacío, error, carga). */
    vacio?: ReactNode;
  }
  export function TablaTarjetas<T>(p: TablaTarjetasProps<T>): JSX.Element;
  ```
  Raíz con `data-vista="tabla" | "tarjetas"`. Tabla (no móvil): `<div data-glass style={{ ...glass("dense"), borderRadius: "var(--radius-card-lg)" }}>` con `<table className="tabla-oficina" aria-label>` a `width: 100%`, celdas 13 px con `minWidth: 0` y `overflowWrap: "anywhere"` (salvo `sinPartir`), sin ningún `overflow-x`. Tarjetas (`useMovil()`): `<ul role="list" aria-label className="tt-tarjetas">` de `<li data-glass className="tt-tarjeta" style={glass("normal")}>`.

- [ ] **Step 1: Tests que fallan** (`TablaTarjetas.test.tsx`, con `afterEach(() => vi.unstubAllGlobals())`)

```tsx
type F = { id: number; nombre: string; rol: string };
const cols: ColumnaTabla<F>[] = [
  { id: "n", titulo: "Usuario", celda: (f) => f.nombre, enTarjeta: "titulo" },
  { id: "r", titulo: "Rol", celda: (f) => f.rol },
  { id: "x", titulo: "Interno", celda: () => "id-x", enTarjeta: "oculta" },
  { id: "a", titulo: "Acciones", celda: (f) => <button type="button">Editar {f.nombre}</button>, enTarjeta: "pie", sinPartir: true },
];
const filas: F[] = [{ id: 1, nombre: "Ana Prueba", rol: "Médico" }, { id: 2, nombre: "Luis Prueba", rol: "Observador" }];

it("≥ 641: tabla de cristal con cabeceras y sin scroll horizontal", () => {
  simularPantalla(1280);
  const { container } = render(<TablaTarjetas rotulo="Usuarios" filas={filas} columnas={cols} clave={(f) => f.id} />);
  expect(container.firstElementChild).toHaveAttribute("data-vista", "tabla");
  expect(screen.getByRole("table", { name: "Usuarios" })).toBeInTheDocument();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Usuario", "Rol", "Interno", "Acciones"]);
  expect(container.innerHTML).not.toMatch(/overflow-x/);
});
it("≤ 640: tarjetas con título, datos rotulados, pie y sin la columna oculta", () => {
  simularPantalla(390);
  render(<TablaTarjetas rotulo="Usuarios" filas={filas} columnas={cols} clave={(f) => f.id} />);
  const items = within(screen.getByRole("list", { name: "Usuarios" })).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0].querySelector(".tt-tarjeta-titulo")!.textContent).toBe("Ana Prueba");
  expect(within(items[0]).getByText("Rol")).toBeInTheDocument();          // <dt>
  expect(within(items[0]).queryByText("id-x")).toBeNull();
  expect(items[0].querySelector(".tt-tarjeta-pie button")).not.toBeNull();
  expect(items[0]).toHaveAttribute("data-glass");
});
it("fila pulsable: clic e Intro la abren; un botón de dentro no", () => {
  simularPantalla(1280);
  const onFila = vi.fn();
  render(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} onFila={onFila} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar Ana Prueba" }));
  expect(onFila).not.toHaveBeenCalled();
  const fila = screen.getByText("Luis Prueba").closest("tr")!;
  expect(fila).toHaveAttribute("tabindex", "0");
  fireEvent.keyDown(fila, { key: "Enter" });
  expect(onFila).toHaveBeenCalledWith(filas[1]);
});
it("tarjeta pulsable: el botón del pie tampoco la abre", () => { /* simularPantalla(390) + onFila → click en «Editar Ana Prueba» no llama; keyDown Enter en el <li> sí */ });
it("un texto larguísimo corta por palabra y no ensancha la celda", () => {
  simularPantalla(1280);
  render(<TablaTarjetas rotulo="U" filas={[{ id: 3, nombre: "x".repeat(80), rol: "Médico" }]} columnas={cols} clave={(f) => f.id} />);
  expect(screen.getByText("x".repeat(80)).closest("td")).toHaveStyle({ overflowWrap: "anywhere" });
  expect(screen.getAllByRole("cell").find((c) => c.textContent?.startsWith("Editar"))).toHaveStyle({ whiteSpace: "nowrap" });
});
it("seleccionada, detalle y vacío", () => { /* seleccionada={(f)=>f.id===2} → tr data-seleccionada="true"; detalle={(f)=>f.id===1?<p>Hash</p>:null} → tr.fila-detalle con td colSpan = 4 + 1 (chevron) si onFila; filas=[] + vacio={<p>Nada</p>} → getByText("Nada") y sin <table> */ });
it("cambia de tabla a tarjetas en vivo", () => {
  const ctl = simularPantalla(1280);
  const { container } = render(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} />);
  act(() => ctl.cambiar({ ancho: 390 }));
  expect(container.firstElementChild).toHaveAttribute("data-vista", "tarjetas");
});
it("CSS: hoja a dos columnas hasta 640 y fila pulsable con hover de cristal", () => {
  const css = readFileSync(join(__dirname, "../styles/office.css"), "utf8").replace(/\r\n/g, "\n");
  expect(css).toMatch(/@media\s*\(\s*max-width:\s*640px\s*\)\s*\{\s*\.hoja-dos-columnas\s*\{\s*grid-template-columns:\s*1fr;/);
  expect(css).not.toMatch(/760px/);
  expect(css).toMatch(/\.tabla-oficina tbody tr\[data-pulsable\]:hover[^{]*\{[^}]*var\(--glass-hover\)/);
});
```

- [ ] **Step 2:** `npx vitest run src/components/TablaTarjetas.test.tsx src/styles/puntosCorte.audit.test.ts src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Filas pulsables (tabla y tarjeta): `tabIndex={0}`, `data-pulsable`, `onClick` que ignora el clic si `(e.target as Element).closest("button, a, input, select, textarea, [role='menuitem'], [role='switch']")` es distinto del propio elemento, y `onKeyDown` Intro/Espacio solo si `e.target === e.currentTarget`; en tabla, última celda `aria-hidden` con `<Icon name="CHEVRON_RIGHT" size={14} />`. `data-seleccionada="true"` → fondo `--glass-hover` y borde izquierdo de 2 px `--primary` (sombra interior). CSS nuevo en `office.css`: `tr[data-pulsable] { cursor: pointer }`, `:hover`/`:focus-visible` con `--glass-hover`, `.tt-tarjetas { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px }`, `.tt-tarjeta { padding: 14px 16px; border-radius: var(--radius-card-lg); display: flex; flex-direction: column; gap: 10px; min-width: 0 }`, `.tt-tarjeta-titulo { font-size: 15px; font-weight: 600; overflow-wrap: anywhere }`, `.tt-tarjeta dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 13px }` (`dt` en `--muted-foreground`), `.tt-tarjeta-pie { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end }`; `.hoja-dos-columnas` pasa de 760 a 640. Borrar la entrada de `LEGADO`.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Gestión: tabla que pasa a tarjetas en móvil y office.css en los puntos de corte comunes».

### Task 5: Pacientes (A23–A29): panel lateral sin scroll propio, tarjeta, avisos y «Reanudar» con progreso

**Files:**
- Create: `frontend/src/hooks/useEnCurso.ts`, `frontend/src/hooks/useEnCurso.test.tsx`
- Modify: `frontend/src/pages/Patients.tsx`, `frontend/src/pages/Patients.test.tsx`
- Modify: `frontend/src/components/patients/PatientCard.tsx`, `PatientCard.test.tsx`
- Modify: `frontend/src/components/patients/PatientsSidePanel.tsx`, `PatientsSidePanel.test.tsx`
- Modify: `frontend/src/components/patients/patients.css`, `patients.css.test.ts`
- Modify: `frontend/src/lib/avisosOficina.ts`, `frontend/src/lib/avisosOficina.test.ts`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/Patients.tsx`, `components/patients/PatientCard.tsx`, `components/patients/PatientsSidePanel.tsx`, `components/patients/patients.css`)

**Interfaces:**
- Produces: `export function useEnCurso(): [enCurso: boolean, lanzar: (accion: () => unknown) => void]` — `lanzar` pone `enCurso` a `true`, espera `Promise.resolve(accion())` y lo devuelve a `false` al resolverse o rechazarse (si el componente sigue montado); mientras está en curso, `lanzar` no hace nada.
- Produces: `onResume` de `Patients` y `PatientCard` pasa a `(sessionId: string, p: PatientSummary) => void | Promise<unknown>` (App ya pasa `resumeSession`, que devuelve promesa). `PatientPageProps.onResume` cambia igual en la tarea 9.
- Produces (`lib/avisosOficina.ts`): `Aviso` gana `completo: string` (todos los nombres, para el `title`); `detalle` = dos primeros + « +N» si hay más (`"Ana · Luis +2"`).

- [ ] **Step 1: Tests que fallan**

```tsx
// patients.css.test.ts — sustituye el test de «max-height calc(100dvh…)»
it("el panel lateral crece con la página: sticky sin alto máximo ni scroll propio", () => {
  expect(regla(".pt-side")).toMatch(/position:\s*sticky/);
  expect(regla(".pt-side")).not.toMatch(/max-height|overflow-y/);
});
it("la HC va en una línea con elipsis", () => {
  expect(regla(".pt-card-meta")).toMatch(/white-space:\s*nowrap/);
  expect(regla(".pt-card-meta")).toMatch(/text-overflow:\s*ellipsis/);
});
// PatientsSidePanel.test.tsx
it("Actividad reciente enseña 5 y «Ver más» el resto", async () => { /* patientsActivity → 8 items; 5 botones .pt-side-activity; click «Ver más» → 8; el botón pasa a «Ver menos» */ });
// PatientCard.test.tsx
it("HC larga: title con el valor completo", () => { /* hospital_id = 36 caracteres → .pt-card-meta title lo contiene */ });
it("sin imagen ni sesión: iniciales y «Sin estudios aún», sin icono de paso", () => {
  render(<PatientCard patient={pac({ full_name: "Segura, Prueba", last_session_id: null, last_session_step: null, last_capture_id: null, last_imaging_study_id: null })} onOpen={vi.fn()} onResume={vi.fn()} onPlan={vi.fn()} />);
  expect(document.querySelector(".pt-card-iniciales")!.textContent).toBe("SP");
  expect(screen.getByText("Sin estudios aún")).toBeInTheDocument();
});
it("«Informe» (no «Abrir informe») y sin partir", () => { /* accion abrir-informe → getByRole("button", { name: "Informe" }) con whiteSpace nowrap */ });
it("Reanudar: «Abriendo…» y tarjeta bloqueada mientras dura; vuelve si falla", async () => {
  let rechazar!: (e: unknown) => void;
  const onResume = vi.fn(() => new Promise((_, r) => { rechazar = r; }));
  const onOpen = vi.fn();
  render(<PatientCard patient={pac({ last_session_id: "s1", last_session_step: 2 })} onOpen={onOpen} onResume={onResume} onPlan={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
  const b = screen.getByRole("button", { name: "Abriendo…" });
  expect(b).toBeDisabled();
  expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
  fireEvent.click(screen.getByRole("article"));
  expect(onOpen).not.toHaveBeenCalled();
  await act(async () => { rechazar(new Error("caído")); });
  expect(screen.getByRole("button", { name: "Reanudar" })).not.toBeDisabled();
});
it("botón de 44 px en ≤ 1024 (md) y sm por encima", () => { /* simularPantalla(1024) → data-size="md"; simularPantalla(1280) → "sm" */ });
// avisosOficina.test.ts
it("el detalle resume en dos nombres y +N; completo lleva todos", () => { /* 4 parados → detalle "A · B +2", completo "A · B · C · D" */ });
// Patients.test.tsx
it("pestañas con Tabs, aviso de creación de cristal y avisos con title completo", () => { /* role tab «Míos»; tras crear paciente el role=status tiene data-glass; .pt-aviso-detalle title = completo */ });
it("a ≤ 1280 el panel va debajo y compacto; a ≤ 640 la rejilla es de una columna", () => { /* simularPantalla(1280) → .pt-side-stats--fila; CSS: @media (max-width: 640px) .pt-grid grid-template-columns: 1fr */ });
```

- [ ] **Step 2:** `npx vitest run src/hooks/useEnCurso.test.tsx src/pages/Patients.test.tsx src/components/patients src/lib/avisosOficina.test.ts src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
  - `.pt-side`: `position: sticky; top: 24px` sin `max-height` ni `overflow-y` (A23). `PatientsSidePanel`: sigue pidiendo `LIMITE_ACTIVIDAD = 8`, enseña `VISIBLES_ACTIVIDAD = 5` y un `Button variant="link" size="sm"` «Ver más» / «Ver menos».
  - `PatientCard`: `.pt-card-meta` en una línea con elipsis y `title={hc}` (A25); sin imagen y sin sesión, `<span className="pt-card-iniciales">` (iniciales de las dos primeras palabras del nombre sin la coma, 28 px, 600, `--muted-foreground`) y «Sin estudios aún» bajo ella en 13 px (A28); texto del botón «Informe» con `whiteSpace: "nowrap"` (A26); `useEnCurso` para Reanudar/Informe: «Abriendo…» con `<Icon name="WAIT" />`, botón `disabled`, `<article aria-busy data-abriendo>` que ignora clic y teclado (A29). `size={useTableta() ? "md" : "sm"}`.
  - `Patients.tsx`: pestañas con `<Tabs tabs={["Todos","Míos","Compartidos conmigo"]}>` (fuera `.pt-tab*` de la hoja); el aviso de «Paciente creado» como pastilla `glass("normal")` + `data-glass` con el botón de cierre `Button size="icon" variant="ghost" aria-label="Cerrar aviso" title="Cerrar aviso"`; la pastilla de aviso usa `title={av.completo}` (A27). A24 ya lo resolvió la fase 8 (acción secundaria de la barra = `outline`): no se toca.
  - `patients.css`: `@media (max-width: 640px) { .pt-grid { grid-template-columns: 1fr; } .pt-search { width: 100%; } }`; toda regla por debajo de 13 px sin mono sube a 13 px (`.pt-side-activity`, `.pt-side-note`, `.pt-aviso-detalle`, `.pt-aviso-ver`, `.pt-card-foot`, `.pt-card-pill`); `.pt-side-activity-time` pasa a mono 12 px (lo vigila la auditoría de gestión).
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Pacientes: panel lateral sin scroll propio, tarjeta sin cortes y Reanudar con progreso (A23–A29)».

### Task 6: Hojas Nuevo paciente y Nuevo caso (A30–A33)

**Files:**
- Modify: `frontend/src/pages/NuevoCaso.tsx`, `frontend/src/pages/NuevoCaso.test.tsx`
- Modify: `frontend/src/components/PatientFormSheet.tsx`, `frontend/src/components/PatientFormSheet.test.tsx`
- Modify: `frontend/src/styles/office.css` (`.nc-fila`, `.nc-seccion`)
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/NuevoCaso.tsx`, `components/PatientFormSheet.tsx`)

**Interfaces:**
- Consumes: `Switch` (tarea 1), `Input obligatorio` (tarea 2), `.hoja-dos-columnas` (tarea 4).

- [ ] **Step 1: Tests que fallan**

```tsx
// NuevoCaso.test.tsx
it("elegir paciente: la lista crece y «Nuevo paciente» va en el pie fijo", () => {
  render(<CasePatientPicker open patients={[pac(1), pac(2)]} onPick={vi.fn()} onClose={vi.fn()} onCreatePatient={vi.fn()} />);
  const pie = document.querySelector("[data-sheet-footer]")!;
  const nuevo = within(pie as HTMLElement).getByRole("button", { name: "Nuevo paciente" });
  expect(nuevo.textContent).toBe("Nuevo paciente");                // sin «+ » escrito (A31)
  expect(nuevo.querySelector("svg")).not.toBeNull();
  const dialogo = screen.getByRole("dialog");
  expect(dialogo.innerHTML).not.toMatch(/max-height/);              // A30
  expect(within(dialogo).getAllByRole("button", { name: /Paciente Prueba/ })[0]).toHaveClass("nc-fila"); // A32
  expect(within(dialogo).getByRole("textbox", { name: "Buscar paciente o HC" })).toBeInTheDocument();
});
it("el caso usa interruptores, no casillas, y el diagnóstico es obligatorio", () => {
  render(<NuevoEstudioSheet open patientId={1} onClose={vi.fn()} onCreated={vi.fn()} />);
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getAllByRole("switch")).toHaveLength(10);           // 7 tratamientos + 3 modalidades
  expect(screen.getByLabelText(/Diagnóstico/, { selector: "input" })).toHaveAttribute("aria-required", "true");
  expect(document.querySelectorAll(".hoja-dos-columnas").length).toBeGreaterThan(0);
});
// PatientFormSheet.test.tsx
it("placeholders neutros y apellidos obligatorios", () => {
  render(<PatientFormSheet open patient={null} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.queryByPlaceholderText("Restrepo")).toBeNull();
  expect(screen.queryByPlaceholderText("María")).toBeNull();
  expect(screen.getByPlaceholderText("Apellidos o código")).toHaveAttribute("aria-required", "true");
  expect(screen.getByPlaceholderText("Nombre o iniciales")).toBeInTheDocument();
});
it("a ≤ 640 la hoja ocupa la pantalla y sus filas son de 44 px", () => {
  simularPantalla(390);
  render(<CasePatientPicker open patients={[pac(1)]} onPick={vi.fn()} onClose={vi.fn()} onCreatePatient={vi.fn()} />);
  expect(screen.getByRole("dialog")).toHaveStyle({ width: "100%" });
  const css = readFileSync(join(__dirname, "../styles/office.css"), "utf8").replace(/\r\n/g, "\n");
  expect(css).toMatch(/@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{[^}]*\.nc-fila\s*\{[^}]*min-height:\s*44px/);
});
```

- [ ] **Step 2:** `npx vitest run src/pages/NuevoCaso.test.tsx src/components/PatientFormSheet.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
  - `CasePatientPicker`: buscador `Input icon={<Icon name="SEARCH" />} aria-label="Buscar paciente o HC"`; la lista sin `maxHeight` ni `overflowY` (desplaza el cuerpo de la hoja; el buscador queda `position: sticky; top: 0` con fondo `--glass-dense`); filas `<button className="nc-fila">` con nombre 14 px 600 y HC/sexo/casos en mono 12 px; el estado vacío con `EstadoVacio icono="USER"`; `footer` de la hoja con `<Button variant="outline" leadingIcon={<Icon name="PLUS" />}>Nuevo paciente</Button>` (A30, A31, A32). `STEP_PATIENT` deja de usarse en gestión: su glifo es un cuadrado vacío, pero lo pinta también el dock del quirófano, así que su redibujo queda para la fase 12.
  - `NuevoEstudioSheet`: `checkRow` se sustituye por `<Switch>` (tratamientos en columna, modalidades en `.hoja-dos-columnas`); `SECTION`/`SUBTLE` pasan a clases `.nc-seccion` (rótulo mono `--text-eyebrow` en mayúsculas con borde inferior `--glass-border`) y `.nc-nota` (13 px); los pares Morfología/Tamaño y Marca/Tipo en `.hoja-dos-columnas`; `Diagnóstico` con `obligatorio` (fuera el «*» del rótulo).
  - `PatientFormSheet`: `fila` → `className="hoja-dos-columnas"`; placeholders «Apellidos o código» (con `obligatorio`) y «Nombre o iniciales» (A33).
  - CSS: `.nc-fila` (fila de cristal `glass("flat")` en CSS con tokens, `:hover` y `:focus-visible` con borde `--primary`), `@media (max-width: 1024px) { .nc-fila { min-height: 44px; } }`.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Hojas de paciente y caso: lista que crece, pie fijo, interruptores y ejemplos neutros (A30–A33)».

### Task 7: Estudios (A34–A36)

**Files:**
- Modify: `frontend/src/pages/Studies.tsx`, `frontend/src/pages/Studies.test.tsx`
- Modify: `frontend/src/styles/office.css` (`.es-insignia`, `.tarjeta-nueva`)
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/Studies.tsx`)

**Interfaces:**
- Consumes: `MenuMas`, `Badge`, `fechaDia`, `EstadoVacio`.

- [ ] **Step 1: Tests que fallan**

```tsx
it("insignias legibles: modalidad y riesgo sobre fondo sólido", async () => {
  listStudies.mockResolvedValue([card({ modality: "CT", n_slices: 621, rupture_risk_label: "Alto", has_thumbnail: true })]);
  render(<Studies onOpen={vi.fn()} onResume={vi.fn()} onOpenPatient={vi.fn()} onNew={vi.fn()} />);
  const mod = await screen.findByText("CT · 621 cortes");
  expect(mod.closest("[data-insignia='modalidad']")).toHaveStyle({ background: "var(--glass-solid)", color: "var(--foreground)" });
  expect(screen.getByText("Alto").closest("[data-insignia='riesgo']")).toHaveStyle({ background: "var(--glass-solid)" });
});
it("Reanudar como principal; lo demás en «⋯», con Borrar en rojo y separado", async () => {
  // resumable_session_id: "s1", owner_id = usuario → canDelete
  fireEvent.click(await screen.findByRole("button", { name: /Más acciones del estudio/ }));
  expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Nueva sesión", "Abrir ficha", "Borrar estudio"]);
  expect(screen.getByRole("menuitem", { name: "Borrar estudio" })).toHaveAttribute("data-danger", "true");
  expect(screen.getByRole("button", { name: "Reanudar" })).toHaveAttribute("data-variant", "default");
});
it("sin sesión que reanudar, la principal es «Abrir»", async () => { /* resumable_session_id null → button «Abrir» data-variant default; menú sin «Nueva sesión» */ });
it("la tarjeta «Subir un estudio nuevo» se estira como las demás", async () => { /* getByRole("button", { name: "Subir un estudio nuevo" }) style alignSelf "stretch", height "100%" */ });
it("buscador con icono y sin rótulo; el borrado nombra la fecha en dd/mm/aa", async () => { /* textbox name "Buscar por paciente, HC o diagnóstico"; acquired_at "2026-10-30" → el diálogo dice «30/10/26» */ });
it("a ≤ 640 una columna y menú táctil; a 1280 varias", async () => {
  simularPantalla(390);
  // ... la rejilla lleva gridTemplateColumns "repeat(auto-fill, minmax(min(220px, 100%), 1fr))"
  // y el botón «⋯» mide 44 (MenuMas tactil)
  expect(await screen.findByRole("button", { name: /Más acciones del estudio/ })).toHaveStyle({ width: "44px" });
});
```

- [ ] **Step 2:** `npx vitest run src/pages/Studies.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Insignias en `<span className="es-insignia" data-insignia="modalidad|riesgo">` con `background: var(--glass-solid)`, `color: var(--foreground)`, borde `--glass-border`, mono 12 px para la modalidad; el riesgo es `<Badge variant={riskVariant(...)}>` dentro de una `.es-insignia` (A34). Acciones de la tarjeta: una fila con el botón principal a lo ancho («Reanudar» si `canResume`, si no «Abrir») y `<MenuMas label={`Más acciones del estudio de ${s.patient_name}`} tactil={useTableta()}>` con `Nueva sesión` (solo si `canResume`, `title` de que la anterior se conserva), `Abrir ficha` (si `onOpenPatient`), `Borrar estudio` (`destructive`, `separadoAntes`, `abreDialogo`, si `canDelete`) (A35). La tarjeta nueva: `alignSelf: "stretch"`, `height: "100%"`, sin `minHeight: 300` (A36). Rejilla `minmax(min(220px, 100%), 1fr)`. Textos de la tarjeta: nombre 15 px 600, HC mono 12 px, descripción y paso 13 px. Buscador `Input icon={<Icon name="SEARCH" />} aria-label=…` a `maxWidth: 420`, `width: 100%`. Carga y vacío con `LoadState`/`EstadoVacio icono="STUDIES"`. El diálogo de borrado usa `fechaDia(toDelete.acquired_at)`. Se retira la rama `compact` de `StudyGallery` (nadie la pasa ya: la ficha usa `ColumnaEstudios`) para no mantener dos tamaños de texto.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Estudios: insignias legibles, Reanudar como principal y lo demás en ⋯ (A34–A36)».

### Task 8: Ficha L3 — cascada por punto de corte, sin scroll horizontal

**Files:**
- Modify: `frontend/src/components/ficha/Cascada.tsx`, `Cascada.test.tsx`
- Modify: `frontend/src/components/ficha/ficha.css`
- Modify: `frontend/src/components/shell/PageBody.tsx`, `PageBody.test.tsx`, `shell.css` (regla `data-lienzo`)
- Modify: `frontend/src/pages/PatientPage.tsx` (solo el `<PageBody …>`), `frontend/src/pages/PatientPage.test.tsx`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `components/ficha/Cascada.tsx`, `components/ficha/ficha.css`)

**Decisión de ancho (A37):** con `--content-max` (1280 − 64 de margen = 1216 px útiles) caben tres columnas, no cinco (320 + 380 + 300 + 300 + 300 = 1600). Por eso la cascada no desplaza en horizontal: enseña las **últimas N columnas** según el tramo y las anteriores quedan como migas (el patrón que ya usaba ≤ 1280), y la ficha se sale de `--content-max` **solo a ≥ 1920** (`PageBody lienzo`), donde caben las cinco.

| tramo | columnas visibles | `PageBody` |
|---|---|---|
| móvil ≤ 640 | 1 (a todo el ancho) | `modo="lista"`: desplaza la página, la columna crece (sin scroll interno) |
| tableta ≤ 1024 | 2 | `modo="pantalla"` |
| estrecho ≤ 1280 | 2 | `modo="pantalla"` |
| ancho 1281–1919 | 3 | `modo="pantalla"` |
| grande ≥ 1920 | 5 (todas) | `modo="pantalla" lienzo` |

**Interfaces:**
- Produces: `export const COLUMNAS_VISIBLES: Record<Tramo, number> = { movil: 1, tableta: 2, estrecho: 2, ancho: 3, grande: 5 }` en `Cascada.tsx`; `.fc-wrap` lleva `data-tramo`.
- Produces: `PageBody` gana `lienzo?: boolean` → `data-lienzo="true"` en `.page-body`; CSS `.page-body[data-lienzo="true"] > .page-body__ancho { max-width: none; }`.
- Tamaños de columna: visibles no últimas `flex: 0 1 ${ancho}px; minWidth: 0`; la última `flex: 1 1 0; minWidth: "min(300px, 100%)"`; en móvil la única columna `flex: 1 1 auto; width: 100%`.

- [ ] **Step 1: Tests que fallan**

```tsx
// Cascada.test.tsx (sustituye simulaEstrecho por simularPantalla; afterEach unstubAllGlobals)
it.each([[390, 1], [768, 2], [1024, 2], [1280, 2], [1707, 3], [1920, 5]])("a %i px se ven %i columnas y el resto son migas", (ancho, n) => {
  simularPantalla(ancho);
  render(<Cascada columnas={cols(5)} onVolver={() => {}} />);
  expect(screen.getAllByRole("region")).toHaveLength(n);
  const migas = screen.queryByRole("navigation", { name: "Volver a una columna anterior" });
  if (n === 5) expect(migas).toBeNull();
  else expect(within(migas!).getAllByRole("button")).toHaveLength(5 - n);
});
it("cambia en vivo de 1707 a 390", () => { /* ctl.cambiar({ ancho: 390 }) → 1 región; .fc-wrap data-tramo="movil" */ });
it("la última columna llena y las demás encogen sin desbordar", () => {
  simularPantalla(1707);
  render(<Cascada columnas={cols(3)} onVolver={() => {}} />);
  const [a, , c] = screen.getAllByRole("region");
  expect(a).toHaveStyle({ flex: "0 1 320px", minWidth: "0" });
  expect(c).toHaveStyle({ flex: "1 1 0" });
});
it("CSS: la cascada no desplaza en horizontal y en móvil el cuerpo no desplaza", () => {
  const css = readFileSync(join(__dirname, "ficha.css"), "utf8").replace(/\r\n/g, "\n");
  expect(css).not.toMatch(/overflow-x:\s*auto/);
  expect(css).toMatch(/\.fc-cascada\s*\{[^}]*overflow-x:\s*clip/);
  expect(css).toMatch(/\.fc-wrap\[data-tramo="movil"\]\s+\.fc-cuerpo\s*\{[^}]*overflow-y:\s*visible/);
});
// PageBody.test.tsx
it("lienzo quita el tope de --content-max", () => { /* <PageBody lienzo> → .page-body data-lienzo="true"; CSS con la regla max-width: none */ });
// PatientPage.test.tsx
it("modo de la ficha por tramo: lista en móvil, pantalla y lienzo a ≥ 1920", async () => { /* 390 → .page-body data-modo="lista"; 1280 → "pantalla" sin data-lienzo; 1920 → "pantalla" + data-lienzo="true" */ });
```

- [ ] **Step 2:** `npx vitest run src/components/ficha/Cascada.test.tsx src/components/shell/PageBody.test.tsx src/pages/PatientPage.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `Cascada` usa `useTramo()` y `desde = Math.max(0, columnas.length - COLUMNAS_VISIBLES[tramo])`; migas como hoy (botones `.fc-miga` de 44 px de alto en ≤ 1024). `ficha.css`: `.fc-cascada { overflow-x: clip }` (fuera `scroll-snap`), móvil `.fc-wrap[data-tramo="movil"] .fc-cuerpo { overflow-y: visible }` y `.fc-wrap[data-tramo="movil"] .fc-columna, .fc-wrap[data-tramo="movil"] .fc-cascada { min-height: auto }`; tamaños de texto: `.fc-fila-titulo` 14 px, `.fc-fila-meta`, `.fc-vacio`, `.fc-datos-nota`, `.fc-datos-antecedentes`, `.fc-datos-aviso` a 13 px; `.fc-miniatura` pequeña solo con icono (el texto «Sin vista previa» pasa a `aria-label`/`title` del `<span role="img">`), la grande con texto a 13 px. `PatientPage`: `<PageBody modo={tramo === "movil" ? "lista" : "pantalla"} lienzo={tramo === "grande"}>`.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Ficha L3: columnas visibles por punto de corte, sin scroll horizontal y a lo ancho en pantalla grande (A37)».

### Task 9: Ficha L3 — Casos con miniatura, paso, riesgo y Reanudar; vista previa por defecto; Estudios con Reanudar (A37–A39, A41)

**Files:**
- Modify: `frontend/src/components/ficha/ColumnaCasos.tsx`, `ColumnaCasos.test.tsx`
- Modify: `frontend/src/components/ficha/ColumnaEstudios.tsx`, `ColumnaEstudios.test.tsx`
- Modify: `frontend/src/components/ficha/VistaPrevia.tsx`, `VistaPrevia.test.tsx`
- Modify: `frontend/src/pages/PatientPage.tsx` (y `PatientPageProps.onResume` → `void | Promise<unknown>`), `frontend/src/pages/PatientPage.test.tsx`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `components/ficha/ColumnaCasos.tsx`, `components/ficha/ColumnaEstudios.tsx`, `components/ficha/VistaPrevia.tsx`)

**Interfaces:**
- Consumes: `useEnCurso` (tarea 5), `fechaDia` (tarea 3), `Button destructive-ghost` y `EstadoVacio` (tarea 2), `MenuMas`.
- Produces (`ColumnaCasos.tsx`):
  ```ts
  /** El caso elegido o, sin elegir, el más reciente (id más alto). */
  export function casoEnFoco(casos: readonly StudySummary[], sel: SeleccionCaso | null): StudySummary | null;
  /** La sesión guardada más reciente (updated_at) de un caso, o null. */
  export function ultimaSesionDelCaso(sesiones: readonly PatientSessionInfo[], casoId: number): PatientSessionInfo | null;
  ```
  y dos props nuevas: `sesiones: PatientSessionInfo[]`, `onResume?: (sessionId: string) => void | Promise<unknown>`.
- Produces: `MiniaturaEstudio` acepta `estudioId?: number | null` (si viene, pide la miniatura de ese id aunque no haya `StudyCard`); `VistaPrevia` acepta `estudioId?: number | null` y lo pasa. `ColumnaEstudios` gana `onResume?: (sessionId: string) => void | Promise<unknown>`.
- Produces (`PatientPage`): la columna Casos va con `ancho: 380`; si no hay caso elegido y hay casos, se añade al final la columna `{ key: "vista-caso", titulo: "Vista previa" }`: `VistaPrevia` de `ultimaSesionDelCaso(sesiones, casoEnFoco(...).id)` con `estudioId` = su `imaging_study_id`, o `EstadoVacio icono="STUDIES" titulo="Sin sesiones guardadas"` con «Elige un caso para ver sus estudios de imagen y sus sesiones guardadas.».

- [ ] **Step 1: Tests que fallan**

```tsx
// ColumnaCasos.test.tsx
const ses = (o: Partial<PatientSessionInfo>) => ({ session_id: "s1", label: "", current_step: 2, max_diameter_mm: null, rupture_risk_label: "Alto", created_at: "2026-10-30T10:00:00", updated_at: "2026-10-30T10:00:00", size_bytes: 1, case_id: 7, imaging_study_id: 40, ...o });
it("cada caso: fecha dd/mm/aa sin desfase, paso, riesgo, miniatura y Reanudar", async () => {
  const onResume = vi.fn(() => Promise.resolve());
  render(<ColumnaCasos {...base} casos={[caso({ id: 7, acquired_at: "2026-10-30" })]} sesiones={[ses({}), ses({ session_id: "s0", updated_at: "2026-10-01T10:00:00" })]} onResume={onResume} />);
  expect(screen.getByText(/30\/10\/26/)).toBeInTheDocument();
  expect(screen.getByText("Paso 3 · Detección")).toBeInTheDocument();
  expect(screen.getByText("Riesgo alto")).toBeInTheDocument();
  expect(studyThumbnailObjectUrl).toHaveBeenCalledWith(40);
  fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
  expect(onResume).toHaveBeenCalledWith("s1");                        // la más reciente
});
it("borrar caso: gris con rótulo, rojo solo al pasar (A41)", () => { /* button «Eliminar caso «X»» data-variant="destructive-ghost" y title "Eliminar caso" */ });
it("el aviso de borrado no escribe «sesión(es)»", () => { /* session_count 2 → «Sus 2 sesiones de planificación…»; 1 → «Su sesión de planificación…» */ });
it("casoEnFoco y ultimaSesionDelCaso", () => { /* sin selección → id mayor; con selección → ese; sesiones de otro caso no cuentan; [] → null */ });
// ColumnaEstudios.test.tsx
it("fecha dd/mm/aa, «1 sesión guardada ›» y Reanudar directo (A38, A39)", async () => {
  // listStudies → [card({ id: 40, acquired_at: "20261030", resumable_session_id: "s1" })]
  expect(await screen.findByText(/30\/10\/26/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
  expect(onResume).toHaveBeenCalledWith("s1");
  fireEvent.click(screen.getByRole("button", { name: /Más acciones del estudio/ }));
  expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Abrir estudio", "Borrar estudio"]);
});
// PatientPage.test.tsx
it("sin caso elegido: Casos a 380 px y una vista previa del caso más reciente", async () => { /* regiones «Paciente», «Casos», «Vista previa»; la de Casos style flex "0 1 380px"; en Vista previa el botón «Reanudar» */ });
it("sin sesiones, la vista previa explica qué elegir", async () => { /* getByText("Elige un caso para ver sus estudios de imagen y sus sesiones guardadas.") */ });
it("Reanudar desde la ficha enseña «Abriendo…» mientras dura", async () => { /* onResume que devuelve promesa pendiente → «Abriendo…» deshabilitado */ });
```

- [ ] **Step 2:** `npx vitest run src/components/ficha src/pages/PatientPage.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Fila de caso (`ColumnaCasos`): miniatura `MiniaturaEstudio estudioId={ultima?.imaging_study_id ?? null}` a la izquierda (64 px), y en el texto el diagnóstico, `fechaDia(st.acquired_at)`, una fila de `Badge`: `Paso N · etiqueta` (`variant="data"`, de `STEP_LABELS[clampStep(ultima.current_step)]`) y `Riesgo …` (`riskVariant`); bajo la fila, `Button size="sm"` «Reanudar» con `useEnCurso` («Abriendo…») si hay `ultima` y `onResume` (A37). Iconos editar/borrar con `title` y `aria-label`; borrar en `destructive-ghost` sin `color` forzado en el icono (A41). Textos del aviso de borrado con plural escrito. `ColumnaEstudios`: `detalle` con `fechaDia`; el recuento de sesiones como texto con `<Icon name="CHEVRON_RIGHT" size={12} />` (la fila entera ya abre Sesiones); acciones: «Reanudar» (`default`, si `img.resumable_session_id && onResume`, con `useEnCurso`) + `MenuMas label={`Más acciones del estudio ${img.description || img.modality}`} tactil={useTableta()}` con «Abrir estudio» (`OPEN`) y «Borrar estudio» (`destructive`, `separadoAntes`, `abreDialogo`) (A39); el diálogo con `fechaDia`. `PatientPage`: pasa `sesiones` y `onResume` a las dos columnas y monta la columna «Vista previa» por defecto; `VistaPrevia` usa `useEnCurso` en su «Reanudar».
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Ficha L3: casos con miniatura, paso, riesgo y Reanudar, vista previa por defecto y fechas dd/mm/aa (A37–A39, A41)».

### Task 10: Capturas de la ficha (A40)

**Files:**
- Modify: `frontend/src/components/CaptureGallery.tsx`, `frontend/src/components/CaptureGallery.test.tsx`
- Modify: `frontend/src/lib/fecha.ts`, `frontend/src/lib/fecha.test.ts` (`selloArchivo`)
- Modify: `frontend/src/styles/office.css` (`.cg-*`)
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `components/CaptureGallery.tsx`)

**Interfaces:**
- Produces: `export function etiquetaPaso(clave: string): string` en `CaptureGallery.tsx` — la `label` de `STEPS` cuyo `key` coincide («detect» → «Detección»); clave desconocida → tal cual.
- Produces (`lib/fecha.ts`): `export function selloArchivo(iso: string, o?: OpcionesFecha): string` → «20261030-0905» en la zona de quien mira, o «sin-fecha» si no se puede leer; es el sello que hoy calcula `downloadName` con `toLocaleDateString("sv-SE")` dentro de `CaptureGallery.tsx` (la auditoría de gestión prohíbe `toLocale*` en los ficheros revisados). `downloadName` lo usa y su test actual no cambia de resultado.

- [ ] **Step 1: Tests que fallan**

```tsx
it("un solo título: la galería no repite «Capturas (N)»", async () => { /* render con 1 captura → queryByText(/^Capturas \(/) null */ });
it("el paso en castellano, no el código", async () => { /* step "detect" → getByText("Detección"); queryByText("detect") null; etiquetaPaso("xyz") === "xyz" */ });
it("Descargar con icono de descarga y borrar con nombre y confirmación", async () => {
  const descargar = await screen.findByRole("button", { name: "Descargar" });
  expect(descargar.querySelector("path")!.getAttribute("d")).toBe(PATH_EXPORT);   // el de Icon EXPORT, no STEP_EXPORT
  const borrar = screen.getByRole("button", { name: "Borrar la captura «Vista 1»" });
  expect(borrar).toHaveAttribute("data-variant", "destructive-ghost");
  expect(borrar.textContent).not.toContain("✕");
  fireEvent.click(borrar);
  expect(screen.getByRole("dialog", { name: "¿Borrar la captura?" })).toBeInTheDocument();
});
it("la rejilla nunca desborda a 360 px", async () => {
  simularPantalla(360);
  // contenedor de tarjetas con gridTemplateColumns "repeat(auto-fill, minmax(min(190px, 100%), 1fr))"
});
```

- [ ] **Step 2:** `npx vitest run src/components/CaptureGallery.test.tsx src/lib/fecha.test.ts src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Fuera el `SectionLabel` de la galería (el título lo da la columna; el recuento ya está en la entrada «Capturas · N» de Datos). Cada captura con `Card` (`glass("flat")`); el rótulo renombrable como botón de texto 13 px 600 con `title="Renombrar"` y el campo de renombrar con el estilo de `Input` sin rótulo (`aria-label="Nuevo nombre de la captura"`); meta: `Badge variant="outline"` con `etiquetaPaso(c.step)` y vídeo, fecha `fechaHora` en 13 px, dimensiones y peso en mono 12 px; «Descargar» `outline sm` con `<Icon name="EXPORT" />`; borrar `size="icon" variant="destructive-ghost" aria-label={`Borrar la captura «${c.label}»`} title="Borrar la captura"` con `<Icon name="DELETE" />` (A40). Textos «CARGANDO…» → «Cargando…» 13 px.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Capturas: un solo título, paso en castellano, icono de descarga y borrado con nombre (A40)».

### Task 11: Pedidos de clips — la lista (A42, A45, A46, A13)

**Files:**
- Modify: `frontend/src/pages/ClipOrders.tsx` (pantalla y `Row` → columnas de `TablaTarjetas`), `frontend/src/pages/ClipOrders.test.tsx`
- Modify: `frontend/src/components/planning/ClipOrderForm.tsx:88-93` (rótulos de serie), `ClipOrderForm.test.tsx:240`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/ClipOrders.tsx`)

**Interfaces:**
- Consumes: `TablaTarjetas`, `Pastillas`, `Switch`.
- Produces (`ClipOrders.tsx`): `export function nombrePieza(o: Pick<ClipOrder, "series" | "shape" | "angle_deg" | "window_mm">): string` → `"T1 recto"`, `"T3 angulado 60°"`, `"T4 fenestrado ventana 5 mm"` (serie + `shapeLabel` con la inicial en minúscula; `clipShape.ts` no se toca porque lo usa el quirófano).
- Produces: `useDetalleLateral(): boolean` local = `!useEstrecho()` (> 1280: detalle al lado; ≤ 1280: en `Sheet`, tarea 12).

- [ ] **Step 1: Tests que fallan**

```tsx
it("buscador sin rótulo y con icono; «Solo los abiertos» es un interruptor", async () => {
  render(<ClipOrdersPage />);
  expect(screen.queryByText("Buscar")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Buscar pedidos" })).toBeInTheDocument();
  const sw = screen.getByRole("switch", { name: "Solo los abiertos" });
  expect(sw).toHaveAttribute("aria-checked", "true");
  fireEvent.click(sw);
  await waitFor(() => expect(listClipOrders).toHaveBeenCalledWith(expect.objectContaining({ openOnly: false })));
});
it.each([[1, "1 pedido pide atención"], [2, "2 pedidos piden atención"]])("plural escrito con %i", async (n, texto) => { /* n pedidos fuera de especificación → getByText(texto, { exact: false }) */ });
it("filtro por estado con pastillas y recuentos", async () => { /* getByRole("group", { name: "Filtrar por estado" }); pulsar «Firmado» → aria-pressed true */ });
it("la pieza se llama «T1 recto»", () => { expect(nombrePieza({ series: "T1", shape: "straight", angle_deg: 0, window_mm: 0 })).toBe("T1 recto"); });
it("fila pulsable con Intro y chevron (A45)", async () => { /* fila del pedido tabindex 0 → keyDown Enter → aparece el detalle (región o diálogo con el nº de pieza) */ });
it("a 390 tarjetas con el nº de pieza de título (A46)", async () => { simularPantalla(390); /* data-vista="tarjetas"; .tt-tarjeta-titulo = part_no */ });
it("a 1707 la tabla oculta «Taller» mientras hay un pedido abierto al lado", async () => {
  simularPantalla(1707);
  // sin selección: columnheaders incluyen «Taller»; tras elegir uno: no, y hay un <aside aria-label="Detalle del pedido …">
});
it("ClipOrderForm: series en masculino", () => { /* ["T1 · Recto", "T2 · Curvo", "T3 · Angulado", "T4 · Fenestrado"] */ });
```

- [ ] **Step 2:** `npx vitest run src/pages/ClipOrders.test.tsx src/components/planning/ClipOrderForm.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Columnas de `TablaTarjetas<ClipOrder>`: «Nº de pieza» (mono 13 px 600, `enTarjeta: "titulo"`, `sinPartir`), «Estado» (Badge + aviso), «Paciente y caso» (nombre 13 px con elipsis y `title`, caso 13 px atenuado), «Pieza» (`nombrePieza` + «mordaza X mm · N piezas» con `cifra`, cifras en mono), «Taller» (nombre + «para dd/mm/aa» con `fechaDia(needed_by)`; se quita de las columnas cuando hay un pedido abierto y el detalle va al lado). `onFila` alterna la selección; `seleccionada` marca la fila. Encima: `Pastillas rotulo="Filtrar por estado"` con «Todos» + `labels` y sus recuentos (al elegir un estado cerrado apaga «Solo los abiertos», como hoy); fila con el buscador (`Input icon={<Icon name="SEARCH" />} aria-label="Buscar pedidos" placeholder="Nº de pieza, paciente, caso, cirujano o taller"`, `flex: 1 1 260px`) y `<Switch label="Solo los abiertos">`. Aviso de atención: «1 pedido pide atención: está arriba del todo» / «N pedidos piden atención: están arriba del todo» con `<Icon name="STATUS_WARN" />`. Vacío/error con `EstadoVacio`/`LoadState` dentro de `vacio`. «← Volver a la ficha» → `Button variant="ghost" leadingIcon={<Icon name="BACK" />}`; «Filtrado por …» como pastilla `glass("normal")` + `data-glass` con «Ver todos». Fuera `chip()`, `cell`, `cellHead` y el contenedor con `overflowX`. Disposición: a > 1280 rejilla `minmax(0, 1fr) 360px` con el detalle en `<aside aria-label={`Detalle del pedido ${part_no}`}>` (sticky `top: 16px`); a ≤ 1280 solo la lista (la hoja es la tarea 12; hasta entonces el detalle se pinta debajo de la lista para no perder la función). `ClipOrderForm`: rótulos «T1 · Recto», «T2 · Curvo», «T3 · Angulado», «T4 · Fenestrado».
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Pedidos: tabla que pasa a tarjetas, pastillas de estado, interruptor y plural correcto; serie «T1 recto» (A42, A45, A46, A13)».

### Task 12: Pedidos de clips — el detalle (A43, A44)

**Files:**
- Modify: `frontend/src/pages/ClipOrders.tsx` (`Detail` y su montaje), `frontend/src/pages/ClipOrders.test.tsx`
- Modify: `frontend/src/styles/office.css` (`.po-datos`, `.po-acciones`)

**Interfaces:**
- Produces: `Detail` gana `enHoja?: boolean` (sin su botón de cerrar: la hoja trae el suyo). A ≤ 1280 el detalle se monta en `<Sheet open title={`Pedido ${part_no}`} width={460} onClose={() => setSel(null)}>`; a > 1280, en el `<aside>` de la tarea 11. Cambiar de tamaño con un pedido elegido conserva `sel`.

- [ ] **Step 1: Tests que fallan**

```tsx
it("textos en sans; mono solo en nº de pieza y medidas (A43)", async () => {
  // abrir un pedido con surgeon "Administrador", needed_by "" , intended_use "implante"
  expect(screen.getByText("Administrador")).not.toHaveStyle({ fontFamily: "var(--font-mono)" });
  expect(screen.getByText("sin comprometer")).not.toHaveStyle({ fontFamily: "var(--font-mono)" });
  expect(screen.getByText(/mordaza 10,0 mm/).closest("[data-mono]")).not.toBeNull();
});
it("descargas con icono y «Marcar enviado» como principal junto a «Abrir el caso» (A44)", async () => {
  const grupo = screen.getByRole("group", { name: "Descargas" });
  for (const n of ["Paquete del taller (ZIP)", "Copia interna (PDF)", "STL"]) {
    const b = within(grupo).getByRole("button", { name: n });
    expect(b).toHaveAttribute("data-variant", "outline");
    expect(b.querySelector("svg")).not.toBeNull();
  }
  const acciones = screen.getByTestId("po-acciones");
  expect(within(acciones).getByRole("button", { name: "Marcar enviado" })).toHaveAttribute("data-variant", "default");
  expect(within(acciones).getByRole("button", { name: "Abrir el caso" })).toHaveAttribute("data-variant", "outline");
});
it("fecha necesaria en dd/mm/aa y fuerza con coma", async () => { /* needed_by "2026-11-20" → «20/11/26»; recibida con measured_force_g 150.4 → «150 g» */ });
it("a 1280 el detalle es una hoja; a 1707 va al lado; el pedido sigue elegido al cambiar", async () => {
  const ctl = simularPantalla(1707);
  // elegir → aside «Detalle del pedido P-1»
  act(() => ctl.cambiar({ ancho: 1280 }));
  expect(screen.getByRole("dialog", { name: "Pedido P-1" })).toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: /Detalle del pedido/ })).toBeNull();
});
```

- [ ] **Step 2:** `npx vitest run src/pages/ClipOrders.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `Detail`: cabecera con el nº de pieza (mono 15 px 600) y el estado; en el `aside`, cierre `Button size="icon" variant="ghost" aria-label="Cerrar el detalle" title="Cerrar el detalle"` con `<Icon name="CLOSE" />`. Datos en `<dl className="po-datos">` (rejilla `max-content minmax(0, 1fr)`, 13 px, `dt` atenuado); `data-mono` (y fuente mono) solo en «Pieza» (medidas) y «Piezas» (A43). Descargas en `<div role="group" aria-label="Descargas">` con `Button size="sm" variant="outline" leadingIcon={<Icon name="EXPORT" />}` y rótulos «Paquete del taller (ZIP)», «Copia interna (PDF)», «STL». Acciones en una fila `<div className="po-acciones" data-testid="po-acciones">`: el siguiente estado de `ADVANCE_LABEL` como principal (`default`; «Firmar» sigue pidiendo confirmación y respetando `cannotSign`), «Aceptar la pieza» principal y «Rechazar» `destructive` cuando está recibida, y «Abrir el caso» `outline` al final (A44). Notas (desviación, recepción, motivo de firma) a 13 px; «Medido: …» con `cifra(r.measured_force_g, 0)`. `.po-acciones { display: flex; flex-wrap: wrap; gap: 8px }`.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Pedidos: detalle en sans, descargas con icono, acción principal y hoja a ≤ 1280 (A43, A44)».

### Task 13: Talleres (A47–A50)

**Files:**
- Modify: `frontend/src/pages/Workshops.tsx`, `frontend/src/pages/Workshops.test.tsx`
- Modify: `frontend/src/styles/office.css` (`.tl-rejilla`, `.tl-tarjeta`, `.pista`)
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/Workshops.tsx`)

- [ ] **Step 1: Tests que fallan**

```tsx
it("cada taller es una tarjeta de cristal con Editar y Borrar del mismo sistema (A47, A48)", async () => {
  const tarjeta = (await screen.findByText("Taller Uno")).closest("article")!;
  expect(tarjeta).toHaveAttribute("data-glass");
  expect(within(tarjeta).getByRole("button", { name: "Editar" })).toHaveAttribute("data-variant", "outline");
  expect(within(tarjeta).getByRole("button", { name: "Borrar" })).toHaveAttribute("data-variant", "destructive-ghost");
});
it("fechas de alta y uso en dd/mm/aa", async () => { /* created_at 1730000000 → texto con fechaEpoch(1730000000) */ });
it("hoja: nombre obligatorio, notas en varias líneas y registrar apagado sin nombre (A49)", async () => {
  fireEvent.click(screen.getByRole("button", { name: "Nuevo taller" }));
  expect(screen.getByLabelText(/Nombre/)).toHaveAttribute("aria-required", "true");
  expect(screen.getByLabelText("Notas").tagName).toBe("TEXTAREA");
  expect(screen.getByRole("button", { name: "Registrar taller" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Taller Dos" } });
  expect(screen.getByRole("button", { name: "Registrar taller" })).not.toBeDisabled();
});
it("«Cómo se usa» es una pista con icono; sin talleres, estado vacío con la explicación (A50)", async () => { /* role note con svg; listWorkshops [] → título «Todavía no hay talleres» y botón «Nuevo taller» dentro */ });
it("rejilla que no desborda a 360 y hoja a dos columnas hasta 640", async () => {
  simularPantalla(360);
  // .tl-rejilla en CSS: grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr))
  // la hoja usa .hoja-dos-columnas
});
```

- [ ] **Step 2:** `npx vitest run src/pages/Workshops.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Lista como `<div className="tl-rejilla">` de `<article data-glass className="tl-tarjeta" style={glass("normal")}>` (A48): nombre 15 px 600 + `Badge` «N pedidos» (plural escrito), contacto/correo/teléfono 13 px, dirección y notas 13 px atenuadas, y una línea mono 12 px con «NIF … · alta dd/mm/aa · último pedido dd/mm/aa» (`fechaEpoch`; fuera `fmtDate`); pie con `Button size="sm" variant="outline" leadingIcon={<Icon name="EDIT" />}` «Editar» y, para admin, `variant="destructive-ghost" leadingIcon={<Icon name="DELETE" />}` «Borrar» (A47). Hoja: `Nombre` con `obligatorio`; filas en `.hoja-dos-columnas`; `Notas` con `multiline`; el botón principal `disabled={busy || nameMissing}` y la pista del nombre a la vista (A49). «Cómo se usa» → `<p className="pista" role="note">` con `<Icon name="INFO" />` (fondo `--glass`, borde `--glass-border`, 13 px); sin talleres, `EstadoVacio icono="WORKSHOP" titulo="Todavía no hay talleres"` con el texto de hoy y un botón «Nuevo taller» (A50). La nota de «solo el administrador borra» a 13 px.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Talleres: tarjetas de cristal, botones del sistema, hoja con obligatorio y textarea (A47–A50)».

### Task 14: Usuarios (A51–A55)

**Files:**
- Modify: `frontend/src/pages/UsersAdmin.tsx`, `frontend/src/pages/UsersAdmin.test.tsx`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/UsersAdmin.tsx`)

**Interfaces:**
- Consumes: `TablaTarjetas`, `MenuMas`, `Switch`, `Input obligatorio`, `Collapsible` (chevron de la tarea 2).

- [ ] **Step 1: Tests que fallan**

```tsx
afterEach(() => vi.unstubAllGlobals());
it("> 1024: acciones como iconos con nombre y sin scroll horizontal (A51, A52)", async () => {
  simularPantalla(1707);
  render(<UsersAdmin onBack={() => {}} />);
  expect(await screen.findByRole("button", { name: "Editar a María Prueba" })).toHaveAttribute("title", "Editar");
  expect(screen.getByRole("button", { name: "Restablecer la contraseña de María Prueba" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Eliminar a María Prueba" })).toHaveAttribute("data-variant", "destructive-ghost");
  expect(document.body.innerHTML).not.toMatch(/overflow-x/);
});
it("«Creado» en una línea (A53)", async () => { /* la celda con fechaHora(created_at) tiene whiteSpace nowrap */ });
it("≤ 1024: acciones en «⋯» táctil y sin la columna de especialidad", async () => {
  simularPantalla(1024);
  // getByRole("button", { name: "Acciones de María Prueba" }) mide 44; columnheaders sin «Especialidad / Hospital»
});
it("≤ 640: tarjetas con el usuario de título", async () => { simularPantalla(390); /* data-vista="tarjetas" */ });
it("la búsqueda se conserva al pasar de 1280 a 390", async () => { /* escribir «ana» → cambiar ancho → el textbox sigue con «ana» y solo esa tarjeta */ });
it("editar: misma rejilla de dos columnas que el alta e interruptor de cuenta activa (A55)", async () => {
  // abrir «Editar a …»: getByRole("switch", { name: "Cuenta activa (puede iniciar sesión)" }); sin checkbox; .hoja-dos-columnas presente
});
it("alta: obligatorios con la marca común y «Más datos» con chevron (A54)", async () => {
  // Nombre completo, Usuario, Contraseña, Confirmar con aria-required; la etiqueta ya no lleva «*» escrito; [data-chevron] svg
});
```

- [ ] **Step 2:** `npx vitest run src/pages/UsersAdmin.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Fuera el contenedor con `overflowX` (A51). `TablaTarjetas<UserAdminInfo> rotulo="Usuarios"` con columnas: «Usuario» (avatar de iniciales 34 px en `--brand-subtle`/`--brand-subtle-foreground`, nombre 14 px 600 + «(tú)», `@usuario` mono 12 px; `enTarjeta: "titulo"`), «Rol» (`Badge`), «Especialidad / Hospital» (13 px con `title`; se omite del array con `useTableta()` y sin `useMovil()`), «Estado», «Creado» (`fechaHora`, `sinPartir`, A53), «Acciones» (`alinear: "fin"`, `ancho: "1%"`, `sinPartir`, `enTarjeta: "pie"`). Acciones > 1024: tres `Button size="icon" variant="ghost"` (`EDIT`, `PASSWORD`, y `DELETE` en `destructive-ghost`) con `aria-label` «Editar a …», «Restablecer la contraseña de …», «Eliminar a …» y `title` corto («Editar», «Restablecer contraseña», «Eliminar»; el propio: «No puedes eliminar tu propia cuenta», deshabilitado); ≤ 1024: `MenuMas label={`Acciones de ${nombre}`} tactil` con los tres ítems (`abreDialogo`; Eliminar `destructive`, `separadoAntes`, `disabled` si es uno mismo). Vacío/carga/error en `vacio` (A52 lo cubre el botón `outline` de la fase 8 y ahora no queda ninguno). Hoja de edición: campos en `.hoja-dos-columnas` igual que el alta, `<Switch label="Cuenta activa (puede iniciar sesión)">` (A55). Alta: `obligatorio` en Nombre completo, Usuario, Contraseña («Contraseña (mín. 8)») y Confirmar, sin «*» en los rótulos (A54 con el chevron de la tarea 2). El aviso «Contraseña de @x restablecida» pasa a pastilla `glass("dense")` + `data-glass`, `role="status"`, 13 px.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Usuarios: sin tope ni scroll horizontal, acciones en iconos o ⋯, tarjetas en móvil y hojas iguales (A51–A55)».

### Task 15: Cuentas pendientes (A56, A57)

**Files:**
- Modify: `frontend/src/pages/PendingRequests.tsx`, `frontend/src/pages/PendingRequests.test.tsx`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/PendingRequests.tsx`)

- [ ] **Step 1: Tests que fallan**

```tsx
it("«Aprobadas» sin la nota técnica (A56)", async () => {
  // pestaña Aprobadas → getByText("Cuentas activas con acceso médico."); queryByText(/El servidor no distingue/) null
});
it("historial como tabla que pasa a tarjetas", async () => { /* a 1280 role table «Cuentas aprobadas»; a 390 data-vista="tarjetas" */ });
it("sin pendientes: estado vacío que explica qué pasará (A57)", async () => {
  listPending.mockResolvedValue([]);
  // getByText("No hay cuentas pendientes"); getByText(/Cuando alguien pida una cuenta desde «Crear cuenta»/)
});
it("«Actualizar» es un botón de icono junto a las pestañas (A57)", async () => {
  const b = await screen.findByRole("button", { name: "Actualizar la lista" });
  expect(b).toHaveAttribute("title", "Actualizar la lista");
  fireEvent.click(b);
  expect(listPending).toHaveBeenCalledTimes(2);
});
it("solicitud: tarjeta de cristal, CV como botón con icono y a ≤ 640 Aprobar/Rechazar debajo", async () => {
  simularPantalla(390);
  // article data-glass; getByRole("button", { name: "Descargar CV" }) data-variant outline; [data-acciones] con flexDirection "row" tras el contenido
});
```

- [ ] **Step 2:** `npx vitest run src/pages/PendingRequests.test.tsx src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Barra de la página: `Tabs` + (en «Pendientes») `Button size="icon" variant="ghost" aria-label="Actualizar la lista" title="Actualizar la lista"` con `<Icon name="REFRESH" />`; se quita la acción «Actualizar» de `acciones` (A57). `History` con `TablaTarjetas` (`rotulo` «Cuentas aprobadas» / «Cuentas rechazadas»; columnas Nombre (`titulo`), Usuario mono 12 px, Especialidad, Rol (solo Aprobadas), Fecha con `fechaHora` y `sinPartir`); nota de Aprobadas «Cuentas activas con acceso médico.» (A56); la de Rechazadas, igual que hoy a 13 px. Vacío de Pendientes: `EstadoVacio icono="PENDING" titulo="No hay cuentas pendientes"` con «Cuando alguien pida una cuenta desde «Crear cuenta», aparecerá aquí para que la apruebes o la rechaces.». Cada solicitud: `<article data-glass style={glass("normal")}>`; datos en rejilla `repeat(auto-fit, minmax(min(220px, 100%), 1fr))` a 13 px; «Descargar CV» `Button size="sm" variant="outline" leadingIcon={<Icon name="EXPORT" />}`; acciones en `<div data-acciones>`: columna a la derecha en > 640 y fila a lo ancho debajo en ≤ 640 (`useMovil`).
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Cuentas pendientes: texto para el médico, estado vacío, Actualizar como icono y tarjetas (A56, A57)».

### Task 16: Servidor — el paciente de cada bloque de auditoría (A59)

**Files:**
- Modify: `backend/models/audit.py` (`AuditBlock`)
- Modify: `backend/routers/audit.py` (`list_blocks`)
- Modify: `backend/test_audit_patient_filter.py`
- Modify: `frontend/openapi.json`, `frontend/src/api/schema.gen.ts` (regenerados), `frontend/src/api/types.ts` (`AuditBlock`)

**Interfaces:**
- Produces: `AuditBlock` gana `patient_id: int | None = None` y `patient_name: str = ""`. `GET /api/audit/blocks` (con o sin `patient_id`) los rellena invirtiendo el hash como hace `routers/patients.py:140-160`: `patient_hash_for(**audit_patient(p))` de cada paciente, ordenados por id, gana el primero. Sin coincidencia (paciente borrado, o HC/fecha editadas) → `None` y `""`.
- Produces (`types.ts`): `AuditBlock { …; patient_id: number | null; patient_name: string }`.

- [ ] **Step 1: Test que falla** (en `test_audit_patient_filter.py`)

```python
def test_cada_bloque_trae_su_paciente_y_el_borrado_queda_vacio():
    p = _paciente()
    _bloque(p, "CON_PACIENTE")
    SkullChain.instance().append("SIN_COINCIDENCIA", {}, "admin", patient_id="HC-NO-EXISTE", patient_dob="1900-01-01")
    todos = {b["action"]: b for b in admin.get("/api/audit/blocks").json()}
    assert todos["CON_PACIENTE"]["patient_id"] == p.id
    assert todos["CON_PACIENTE"]["patient_name"] != ""
    assert todos["SIN_COINCIDENCIA"]["patient_id"] is None
    assert todos["SIN_COINCIDENCIA"]["patient_name"] == ""
    filtrado = admin.get(f"/api/audit/blocks?patient_id={p.id}").json()
    assert all(b["patient_id"] == p.id for b in filtrado)
```

- [ ] **Step 2:** desde `backend/` del worktree: `C:/UniNavarra/Proyectos/Prospective/ProspectiveWeb/backend/.venv/Scripts/python.exe -m pytest test_audit_patient_filter.py -q` → FAIL (KeyError `patient_id`).
- [ ] **Step 3: Implementar** el mapa hash → paciente en `list_blocks` (una consulta por petición; la página es solo de administrador) y los dos campos en el modelo.
- [ ] **Step 4:** el mismo comando → PASS; también `-m pytest test_audit.py test_audit_access.py test_openapi_contract.py -q` → PASS.
- [ ] **Step 5: Regenerar el contrato.** Desde `backend/`: `…/python.exe scripts/export_openapi.py ../frontend/openapi.json`; desde `frontend/`: `npm run gen:api`; añadir los dos campos a `AuditBlock` en `types.ts`; `npx tsc -b` → sin errores (lo vigila `src/api/contract.check.ts`).
- [ ] **Step 6: Commit** `git add backend/models/audit.py backend/routers/audit.py backend/test_audit_patient_filter.py frontend/openapi.json frontend/src/api/schema.gen.ts frontend/src/api/types.ts` · «Auditoría: cada bloque trae el paciente que le corresponde (A59, servidor)».

### Task 17: Auditoría (A58–A60)

**Files:**
- Modify: `frontend/src/pages/AuditTrail.tsx`, `frontend/src/pages/AuditTrail.test.tsx`
- Modify: `frontend/src/lib/auditoria.ts`, `frontend/src/lib/auditoria.test.ts`
- Modify: `frontend/src/styles/gestion.audit.test.ts` (`REVISADOS` += `pages/AuditTrail.tsx`)

**Interfaces:**
- Consumes: `AuditBlock.patient_name` / `patient_id` (tarea 16), `TablaTarjetas` con `detalle`.
- Produces (`lib/auditoria.ts`): `export function etiquetaClave(clave: string): string` con `target` «Cuenta», `session_id` «Sesión», `part_no` «Nº de pieza», `role` «Rol», `workshop` «Taller», `username` «Usuario», `user_ids` «Usuarios», `status` «Estado», `reason` «Motivo», `patient_id` y `patient` «Paciente», `pages` «Páginas», `ok` «Correcto», `broken` «Bloques rotos», `label` «Nombre», `kind` «Tipo», `case` «Caso», `capture` «Captura», `step` «Paso», `study` «Estudio», `detalle` «Detalle»; desconocida → con «_» cambiado por espacio y la inicial en mayúscula. `detalleDelBloque` devuelve las claves ya traducidas y `true`/`false` como «Sí»/«No».

- [ ] **Step 1: Tests que fallan**

```tsx
// auditoria.test.ts
it("claves y booleanos en castellano", () => {
  expect(detalleDelBloque('{"capture": 3, "case": 7, "ok": true}')).toEqual([["Captura", "3"], ["Caso", "7"], ["Correcto", "Sí"]]);
  expect(etiquetaClave("algo_raro")).toBe("Algo raro");
});
// AuditTrail.test.tsx
it("la acción a la vista en castellano; el código solo en tooltip y en el detalle (A58)", async () => {
  // bloque LOGIN: getByText("Inicio de sesión") con title "LOGIN"; queryByText("LOGIN") null hasta desplegar;
  // al desplegar: <dt>Código</dt> con <dd> mono «LOGIN»; el desplegable de acciones no muestra «· LOGIN»
});
it("Paciente: el nombre, o «Paciente borrado o editado» (A59)", async () => {
  // patient_hash "h1", patient_name "Ana Prueba" → «Ana Prueba»; patient_hash "h2", patient_name "" → «Paciente borrado o editado» con title explicativo; sin hash → «—»
});
it("a 390 tarjetas con la acción de título y el resto a la vista (A60)", async () => {
  simularPantalla(390);
  // data-vista="tarjetas"; .tt-tarjeta-titulo contiene «Inicio de sesión»; dt «Fecha y hora», «Usuario», «Paciente»
});
it("verificación con plural escrito", async () => { /* broken 1 → «1 bloque corrupto»; 2 → «2 bloques corruptos» */ });
it("a 1024 la tabla cabe sin minWidth ni scroll horizontal", async () => { simularPantalla(1024); /* role table sin style minWidth; document.body.innerHTML sin overflow-x ni table-scroll */ });
```

- [ ] **Step 2:** `npx vitest run src/pages/AuditTrail.test.tsx src/lib/auditoria.test.ts src/styles/gestion.audit.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `TablaTarjetas<AuditBlock> rotulo="Bloques de la cadena"` con columnas «Fecha y hora» (`fechaHora`, mono 12 px, `title` UTC, `sinPartir`), «Usuario», «Acción» (`enTarjeta: "titulo"`: el botón que despliega, con chevron y `Badge title={b.action}` con `etiquetaAccion`; fuera el `<span>` del código) y «Paciente» (`patient_name`, o «Paciente borrado o editado» con `title="La cadena solo guarda una huella del paciente; no coincide con ningún paciente actual (borrado, o se cambió su HC o su fecha de nacimiento)."`, o «—»). `detalle`: `<dl>` con «Código» (mono), los pares de `detalleDelBloque`, «Hash» y «Hash anterior» (mono 12 px, `overflow-wrap: anywhere`). Filtros: buscador `Input icon={<Icon name="SEARCH" />} aria-label="Buscar en la cadena"` sin rótulo; selects con opciones solo en castellano. Tarjeta de verificación: plural escrito («1 bloque corrupto», «N bloques corruptos»), la lista de rotos con `etiquetaAccion`. Carga/vacío/error dentro de `vacio`. «Mostrar N más» se queda.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Commit** con los ficheros de la lista · «Auditoría: códigos solo en el detalle, paciente resuelto y tarjetas en móvil (A58–A60)».

### Task 18: Verificación final (la hace el controlador)

**Files:** ninguno nuevo; solo arreglos de lo que se encuentre, cada uno con su test y su commit.

- [ ] **Step 1:** desde `frontend/`: `npx tsc -b` → sin errores; `npx vitest run` (5–7 min) → todo verde, incluidas `styles/gestion.audit.test.ts` (con los 20 ficheros revisados), `styles/puntosCorte.audit.test.ts` (sin `office.css` en `LEGADO`), `styles/cristal.audit.test.ts` y `styles/tokens.test.ts`.
- [ ] **Step 2:** desde `backend/`: `…/.venv/Scripts/python.exe -m pytest test_audit_patient_filter.py test_audit.py test_openapi_contract.py -q` → verde.
- [ ] **Step 3: Navegador por la matriz** (servidores locales con `Start-Process`; ventana por debajo de la máxima con iframes del mismo origen si `resize_window` no encoge): anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560 y altos 600, 768, 900, 1080, en claro y oscuro, en Pacientes, hoja Nuevo paciente, hoja Nuevo caso (elegir paciente y formulario), Estudios, ficha L3 (Casos sin elegir; caso → estudio → sesión → vista previa; Capturas), Pedidos (lista, detalle al lado a 1707 y en hoja a 1280; tarjetas a 390), Talleres (lista y hoja), Usuarios (tabla a 1707 y 1024, tarjetas a 390, hojas de alta y edición), Cuentas pendientes (las tres pestañas) y Auditoría (tabla y tarjetas, detalle desplegado). En cada captura: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), nada cortado ni pisado, ningún scroll interno donde el contenedor podía crecer, objetivos ≥ 44 px por debajo de 1024, texto ≥ 13 px salvo las excepciones de Global Constraints. Comprobar también A24 (prueba rápida en `outline`), A61 y A62 (fase 8) y los cinco puntos de Review Focus. Capturas en el scratchpad.
- [ ] **Step 4:** lo que falle → tarea de arreglo (test + cambio + commit). Cuando todo esté verde, fusión local `git merge --no-ff fase9-gestion` en `main`, sin push.
