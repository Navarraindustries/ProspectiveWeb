# Rediseño visual · Fase 2 (shell de la oficina) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar la oficina (barra lateral, barra superior, Pacientes, hojas laterales, Estudios, Usuarios y el resto de administración) a la dirección «Obsidiana clínica» usando los tokens, el módulo de movimiento y los componentes base de la fase 1, sin cambiar la API ni el pipeline.

**Architecture:** El shell sigue siendo `components/shell/*` (AppShell → SideNav + TopBar). Cambian valores y disposición: barra lateral fijada a 220 px por defecto sobre `--surface-2` con barra activa que se desliza (`motion` + `layoutId`), barra superior de 56 px con título (miga), subtítulo, acciones y avatar-menú; «Cerrar sesión» pasa al pie de la barra lateral. Las páginas de oficina no pintan título propio: el título es la miga y el recuento va al hueco `subtitle` de la barra. Pacientes sustituye las cuatro métricas por tres avisos clínicos calculados en el cliente (`lib/avisosOficina.ts`). Las hojas usan el `footer` de `Sheet` y la ficha pasa a 620 px con dos columnas. Un único `styles/office.css` lleva las reglas de fila (atenuado de botones, fila nueva iluminada) y de tarjeta de estudio (elevación, zoom 3 %).

**Tech Stack:** React 19, Vite 7, TypeScript 5.8, vitest + Testing Library, `motion` 12 (barrel `frontend/src/motion`), CSS plano con tokens.

**Spec:** `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§4.1–4.4, §4.7, §8.3, §8.5, §8.9, §8.11).

## Global Constraints

- Tokens con sus nombres actuales: lienzo `--canvas`, superficie `--card`, rails `--surface-2`, texto secundario `--muted-foreground`, acción `--primary`, cifras/enlaces `--data`, hecho `--success`, aviso `--warning`, lesión/destructivo `--destructive`; borde `--border`.
- Duraciones solo por token (`--dur-1` 120 ms, `--dur-2` 240 ms, `--dur-3` 480 ms) y curva `--ease-out`; en JS, `DUR`/`EASE` de `../motion`. Con `prefers-reduced-motion` solo queda la opacidad (regla global de base.css + `MotionConfig reducedMotion="user"` ya en `main.tsx`).
- Botones de barra 34–38 px (`size="sm"` = 34, `md` = 38); acciones de fila `size="sm"`; «cada acción lleva palabra, no solo icono» en tablas de administración; borrar en rojo apagado con borde (`variant="destructive"`).
- Etiquetas de campo y rótulos de sección en minúscula, 13 px / 500 (`--text-label` / `--weight-label`); la cabecera de tabla sigue en 11 px / 600 / mayúsculas con `letter-spacing: 0.06em`.
- El rojo nunca es acción. El visor no se toca. La API no cambia (§8.5).
- Los textos que ya prueban los tests no cambian salvo que el test se actualice en la misma tarea; la suite completa (≈1 626) queda verde; `npx tsc -b` limpio. No hay lint configurado.
- Commits por lista explícita de ficheros, nunca `git add -A`. Comentarios en castellano.
- La barra lateral conserva plegado, hover de 150 ms, Alt+B, chincheta y sus tests (§8.9): solo cambia el valor por defecto a fijada.

## Nota sobre los tests de página

Los tests de `pages/*.test.tsx` sustituyen `AppShell` por un mock. Para que las aserciones sobre la barra (`screen.getByRole("banner")`) funcionen, cada tarea que las necesite actualiza ese mock a `AppShell: (p) => <><header>{p.subtitle}{p.status}{p.actions}</header>{p.children}</>` (un `<header>` suelto tiene rol `banner`). Los mocks de `api` de esos ficheros se amplían con los métodos nuevos que la página llame (p. ej. `listClipOrders`).

## Review Focus

1. **Pantalla estrecha (< 1024 px):** la barra fijada por defecto no debe comerse el contenido; por debajo de 1024 el valor por defecto sigue siendo plegada. Test en T1.
2. **Un Médico sin acceso a pedidos:** `listClipOrders` puede fallar (403) o venir vacío; los avisos de Pacientes no deben romper la página ni mostrar «0 pedidos parados» como dato falso: el aviso se oculta. Test en T3.
3. **«Sesiones de hoy» en hora local:** `last_session_at` llega en UTC sin zona; una sesión de las 23:30 UTC de ayer puede ser «hoy» en Madrid. Test en T3 con `desdeServidor`.
4. **Primario solo en la fila de la sesión más reciente, también con filtro:** la fila primaria se decide sobre la lista completa ordenada, no sobre la filtrada. Test en T3.
5. **Hoja de 620 px en una ventana de 700 px:** `maxWidth: 94vw` ya existe; las dos columnas deben apilarse por debajo de 760 px. Regla CSS en T4 (sin test: media query).

---

### Task 1: Barra lateral fijada por defecto, sobre `--surface-2`, con barra activa que se desliza y «Cerrar sesión» en el pie

**Files:**
- Modify: `frontend/src/components/shell/useShellState.ts`
- Modify: `frontend/src/components/shell/SideNav.tsx`
- Modify: `frontend/src/components/shell/shell.css`
- Modify: `frontend/src/components/shell/LogoutButton.tsx` (solo el comentario de cabecera y la clase)
- Test: `frontend/src/components/shell/SideNav.test.tsx` (añadir), `frontend/src/components/shell/LogoutButton.test.tsx` (modificar el tercer test)

**Interfaces:**
- Consumes: `motion` de `../../motion`; `Badge`, `Icon`, `Logo`, `useAuth`, `useNav` como hoy.
- Produces: `readPinned()` devuelve `true` por defecto cuando no hay valor guardado **y** `window.innerWidth >= 1024`; `SideNav` pinta en el pie un bloque `.shell-nav-user` con avatar (iniciales), nombre, rol y el `LogoutButton` (icono + texto expandida; solo icono plegada, con `aria-label="Cerrar sesión"`). `UserMenu` deja de pintarse en la barra lateral (T2 lo lleva a la barra superior). El enlace activo lleva un `motion.span` con `data-nav-bar` y `layoutId="shell-nav-bar"`.

- [ ] **Step 1: Tests que fallan (añadir a SideNav.test.tsx; conservar los existentes)**

```ts
it("sin valor guardado y con ventana ancha arranca fijada", () => {
  localStorage.removeItem("shell.sidebar");
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  renderNav(); // helper del fichero
  expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-expanded", "true");
});
it("sin valor guardado y con ventana estrecha arranca plegada", () => {
  localStorage.removeItem("shell.sidebar");
  Object.defineProperty(window, "innerWidth", { value: 900, configurable: true });
  renderNav();
  expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-expanded", "false");
});
it("la barra activa es un solo elemento y vive en el enlace activo", () => {
  renderNav({ screen: "studies" });
  const bars = document.querySelectorAll("[data-nav-bar]");
  expect(bars).toHaveLength(1);
  expect(screen.getByRole("link", { name: /Estudios/ }).contains(bars[0])).toBe(true);
});
it("el pie lleva nombre, rol y «Cerrar sesión»", () => {
  renderNav();
  expect(screen.getByText("Administrador")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
});
```

Modificar en `LogoutButton.test.tsx` el test «la barra superior lo lleva siempre, detrás de las acciones de la pantalla» → «la barra lateral lo lleva siempre en el pie»: renderizar `AppShell` y comprobar que el botón «Cerrar sesión» está dentro del `nav[aria-label="Secciones"]` y no dentro del `header`.

- [ ] **Step 2: Run** `npx vitest run src/components/shell` → FAIL (los nuevos).

- [ ] **Step 3: Implementar**

`useShellState.ts`: `readPinned()` → `localStorage.getItem(SIDEBAR_KEY)`: `"pinned"` → true; `"collapsed"` → false; sin valor → `typeof window !== "undefined" && window.innerWidth >= 1024`. Actualizar el comentario de cabecera («fijada a 220 px por defecto»).

`SideNav.tsx`: en `SectionLink`, cuando `active`, dentro del `<a>` añadir `<motion.span data-nav-bar layoutId="shell-nav-bar" className="shell-nav-bar" transition={{ duration: DUR.estado, ease: EASE }} />`. Pie: sustituir `<ThemeToggle/> + <UserMenu/>` por `<div className="shell-nav-user">` con avatar de iniciales (`user.avatar_initials`, 28 px, clase `shell-avatar` ya existente), `<span className="shell-nav-user-name">{user.full_name || user.username}</span>`, `<span className="shell-nav-user-role">{ROLE_LABEL[user.role]}</span>` y `<LogoutButton compact={!expanded} />`. (ThemeToggle y UserMenu pasan a la barra superior en T2; en esta tarea `SideNav` deja de importarlos.)

`LogoutButton.tsx`: prop `compact?: boolean`; plegado pinta solo el icono con `aria-label="Cerrar sesión"`; el texto visible sigue siendo «Cerrar sesión» expandido. Clase `shell-logout` se conserva.

`shell.css`: `.shell-nav { background: var(--surface-2); }`; enlace `height: 38px; margin: 2px 8px; padding: 0 10px; border-radius: 10px; font-weight: 500;` activo `background: var(--brand-subtle); color: var(--foreground); font-weight: 600;` sin `box-shadow`; `.shell-nav-bar { position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; border-radius: 2px; background: var(--primary); }`; transiciones con `var(--dur-1)`; `.shell-nav-user { display: flex; align-items: center; gap: 10px; margin: 8px; padding: 8px 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); }` y plegada (`[data-expanded="false"]`) solo avatar + icono de salir apilados; `.shell-nav-user-name` 13 px / 600 con elipsis; `.shell-nav-user-role` 11 px `--muted-foreground`. Grupo «Administración» se queda en mayúsculas (11 px, 0.08em, `--muted-foreground`).

- [ ] **Step 4: Run** `npx vitest run src/components/shell src/pages/Patients.test.tsx` → PASS. `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/useShellState.ts frontend/src/components/shell/SideNav.tsx frontend/src/components/shell/shell.css frontend/src/components/shell/LogoutButton.tsx frontend/src/components/shell/SideNav.test.tsx frontend/src/components/shell/LogoutButton.test.tsx
git commit -m "Shell: barra lateral fijada por defecto, barra activa deslizante y salida en el pie"
```

---

### Task 2: Barra superior de 56 px con título, subtítulo, acciones, tema y avatar-menú

**Files:**
- Modify: `frontend/src/components/shell/TopBar.tsx`
- Modify: `frontend/src/components/shell/AppShell.tsx`
- Modify: `frontend/src/components/shell/shell.css`
- Modify: `frontend/src/components/shell/UserMenu.tsx` (el menú se abre hacia abajo-izquierda bajo el avatar)
- Test: `frontend/src/components/shell/AppShell.test.tsx` (añadir), `frontend/src/components/shell/UserMenu.test.tsx` (sin cambios de texto)

**Interfaces:**
- Produces: `AppShell({ crumbs, subtitle, actions, status, children })` con `subtitle?: ReactNode` (texto en `--muted-foreground` 13 px a la derecha del último segmento de la miga) y `status?: ReactNode` (hueco antes de las acciones, para el estado de guardado del pipeline en la fase 3; hoy vacío). `TopBar` pinta, de izquierda a derecha: miga (último segmento 15 px / 600, `aria-current="page"`), subtítulo, espacio, `status`, `actions`, `ThemeToggle size="sm"`, `UserMenu`. Sin `LogoutButton` (vive en la barra lateral desde T1).

- [ ] **Step 1: Tests que fallan (añadir a AppShell.test.tsx)**

```ts
it("la barra superior lleva subtítulo, acciones, tema y avatar, y no «Cerrar sesión»", () => {
  renderShell({ crumbs: [{ label: "Pacientes" }], subtitle: "14 pacientes", actions: <button>Nuevo caso</button> });
  const header = screen.getByRole("banner");
  expect(within(header).getByText("14 pacientes")).toBeInTheDocument();
  expect(within(header).getByRole("button", { name: "Nuevo caso" })).toBeInTheDocument();
  expect(within(header).getByRole("button", { name: /tema/i })).toBeInTheDocument();
  expect(within(header).getByRole("button", { name: "Menú de usuario" })).toBeInTheDocument();
  expect(within(header).queryByText("Cerrar sesión")).toBeNull();
});
it("la altura de la barra sale del CSS: la clase es shell-top y mide 56 px", () => {
  renderShell({ crumbs: [{ label: "Pacientes" }] });
  expect(screen.getByRole("banner")).toHaveClass("shell-top");
  const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");
  expect(css).toMatch(/\.shell-top\s*\{[^}]*height:\s*56px/);
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/shell` → FAIL.

- [ ] **Step 3: Implementar**

`TopBar.tsx`: firma `TopBar({ crumbs, subtitle, status, actions })`; `<header className="shell-top">` con la miga (`nav aria-label="Miga de pan"`), `{subtitle && <span className="shell-subtitle">{subtitle}</span>}`, `<div className="shell-actions">{status}{actions}<ThemeToggle size="sm" /><UserMenu /></div>`. Quitar `LogoutButton`.

`AppShell.tsx`: pasar `subtitle` y `status`.

`shell.css`: `.shell-top { height: 56px; padding: 0 24px; gap: 12px; background: var(--glass); backdrop-filter: blur(var(--glass-blur)); }` (el cristal se permite en cabeceras de barra, §4.3); `.shell-crumb[aria-current="page"] { font-size: 15px; font-weight: 600; color: var(--foreground); }`; `.shell-subtitle { font-size: 13px; color: var(--muted-foreground); white-space: nowrap; }`; `.shell-nav-head { height: 56px; }` para alinear con la barra; `.shell-user-menu { left: auto; right: 0; top: calc(100% + 8px); bottom: auto; }` (se abre bajo el avatar, hacia la izquierda), fondo `var(--card)` sin `backdrop-filter`, sombra `var(--shadow-sheet)`.

`UserMenu.tsx`: sin cambios de texto ni de comportamiento (los seis tests siguen); solo el comentario de cabecera («arriba, en la barra superior»).

- [ ] **Step 4: Run** `npx vitest run src/components/shell src/pages` → PASS (las páginas siguen pasando `crumbs`/`actions`). `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/AppShell.tsx frontend/src/components/shell/shell.css frontend/src/components/shell/UserMenu.tsx frontend/src/components/shell/AppShell.test.tsx
git commit -m "Shell: barra superior de 56 px con subtítulo, acciones, tema y avatar"
```

---

### Task 3: Pacientes con tres avisos clínicos, tabla con acciones atenuadas y primario en la sesión más reciente

**Files:**
- Create: `frontend/src/lib/avisosOficina.ts`
- Create: `frontend/src/lib/avisosOficina.test.ts`
- Create: `frontend/src/lib/pedidosParados.ts` (extraído de `pages/ClipOrders.tsx`: `daysSince`, `STALE_DAYS`, `isStale`)
- Create: `frontend/src/styles/office.css`
- Modify: `frontend/src/pages/ClipOrders.tsx` (importa `isStale`/`daysSince` de `../lib/pedidosParados`; sin otros cambios)
- Modify: `frontend/src/pages/Patients.tsx`
- Test: `frontend/src/pages/Patients.test.tsx` (modificar los tests de contadores; añadir)

**Interfaces:**
- Produces en `lib/avisosOficina.ts`:
  - `casosParados(patients: PatientSummary[], ahora: Date, dias = 7): PatientSummary[]` — pacientes con `last_session_at` y `last_session_step !== null` y `last_session_step < INFORME_STEP` (índice del paso «Informe» importado de `pipeline/steps`) cuya última sesión es anterior a `ahora - dias`.
  - `pedidosParados(orders: ClipOrder[]): ClipOrder[]` — `orders.filter(isStale)`.
  - `sesionesDeHoy(patients: PatientSummary[], ahora: Date): PatientSummary[]` — `desdeServidor(last_session_at)` cae en el mismo día local que `ahora`.
  - `type Aviso = { tono: "warning" | "destructive" | "success"; titulo: string; detalle: string; destino: "orders" | "studies" | null }` y `avisosOficina({ patients, orders, ahora }): Aviso[]` — hasta tres: casos parados (`"warning"`, «N casos parados antes del informe más de 7 días», detalle = hasta tres apellidos separados por « · »), pedidos parados (`"warning"`, «N pedidos de clip parados», detalle = hasta tres `part_no`), sesiones de hoy (`"success"`, «N sesiones de hoy», detalle = hasta tres apellidos). Con N = 0 el aviso no se incluye. `orders === null` (sin acceso) → sin aviso de pedidos.
- Produces en `styles/office.css`: `.tabla-oficina tbody tr .fila-acciones { opacity: .6; transition: opacity var(--dur-1) var(--ease-out); }`, `.tabla-oficina tbody tr:hover .fila-acciones, .tabla-oficina tbody tr:focus-within .fila-acciones { opacity: 1; }`, `@keyframes fila-nueva { from { background: var(--brand-subtle); } to { background: transparent; } }`, `.fila-nueva { animation: fila-nueva 1.2s var(--ease-out) 1; }`, `.tarjeta-estudio { transition: transform var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out); }`, `.tarjeta-estudio:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }`, `.tarjeta-estudio img { transition: transform var(--dur-3) var(--ease-out); }`, `.tarjeta-estudio:hover img { transform: scale(1.03); }`, `.hoja-dos-columnas { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; } @media (max-width: 760px) { .hoja-dos-columnas { grid-template-columns: 1fr; } }`.

- [ ] **Step 1: Tests que fallan**

`lib/avisosOficina.test.ts`:
```ts
const p = (o: Partial<PatientSummary>): PatientSummary => ({ id: 1, full_name: "Segura, Prueba", hospital_id: "1", dob: "1999-01-01", sex: "", institution: "", study_count: 1, created_at: "2026-10-01T10:00:00", owner_id: 1, shared_with_count: 0, is_shared_with_me: false, last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "", ...o });
const ahora = new Date(2026, 9, 31, 12, 0); // 31-10-2026 12:00 local
it("casosParados: sesión de hace 8 días antes del informe sí; de hace 2 no; en el informe no", () => {
  const viejo = p({ id: 1, last_session_at: "2026-10-20T10:00:00", last_session_step: 2 });
  const reciente = p({ id: 2, last_session_at: "2026-10-29T10:00:00", last_session_step: 2 });
  const informe = p({ id: 3, last_session_at: "2026-10-20T10:00:00", last_session_step: INFORME_STEP });
  expect(casosParados([viejo, reciente, informe], ahora).map((x) => x.id)).toEqual([1]);
});
it("sesionesDeHoy usa la hora local: 23:30 UTC de ayer puede ser hoy", () => {
  const tz = new Date().getTimezoneOffset(); // en Madrid (UTC+1/+2) es negativo
  const s = p({ id: 1, last_session_at: "2026-10-30T23:30:00" });
  const esperado = tz < 0 ? [1] : [];
  expect(sesionesDeHoy([s], ahora).map((x) => x.id)).toEqual(esperado);
});
it("avisosOficina sin pedidos (null) no incluye el aviso de pedidos y omite los que dan 0", () => {
  const a = avisosOficina({ patients: [], orders: null, ahora });
  expect(a).toEqual([]);
});
it("avisosOficina nombra hasta tres y cuenta todos", () => {
  const ps = [1, 2, 3, 4].map((i) => p({ id: i, full_name: `P${i}, X`, last_session_at: "2026-10-10T10:00:00", last_session_step: 2 }));
  const [a] = avisosOficina({ patients: ps, orders: [], ahora });
  expect(a.titulo).toBe("4 casos parados antes del informe más de 7 días");
  expect(a.detalle).toBe("P1, X · P2, X · P3, X");
});
```

`pages/Patients.test.tsx` (modificar «los contadores cuentan casos…», «al Médico el contador le dice…», «el administrador ve «en la base de datos»…», «el contador dice «Pacientes · tuyos o compartidos contigo»»): el texto «tuyos o compartidos contigo» / «en la base de datos» ahora acompaña al recuento en el subtítulo de la barra (`screen.getByRole("banner")` contiene «7 pacientes · tuyos o compartidos contigo» o «7 pacientes · en la base de datos»); ya no existen las tarjetas «Casos», «Con caso», «Sin caso». Añadir:
```ts
it("muestra los avisos clínicos en vez de las métricas, y oculta el de pedidos si fallan", async () => {
  api.listPatients.mockResolvedValue([p({ id: 1, last_session_at: "2026-10-10T10:00:00", last_session_step: 2 })]);
  api.listClipOrders.mockRejectedValue(new ApiError(403, "no"));
  render(<Patients {...props} />);
  expect(await screen.findByText(/1 caso parado antes del informe/)).toBeInTheDocument();
  expect(screen.queryByText(/pedidos de clip parados/)).toBeNull();
  expect(screen.queryByText("Con caso")).toBeNull();
});
it("«Reanudar» primario solo en la fila de la sesión más reciente, aunque se filtre", async () => {
  api.listPatients.mockResolvedValue([
    p({ id: 1, full_name: "Antiguo, A", last_session_id: "s1", last_session_at: "2026-10-01T10:00:00", last_session_step: 2 }),
    p({ id: 2, full_name: "Reciente, R", last_session_id: "s2", last_session_at: "2026-10-30T10:00:00", last_session_step: 2 }),
  ]);
  render(<Patients {...props} />);
  const botones = await screen.findAllByRole("button", { name: "Reanudar" });
  expect(botones[0]).toHaveAttribute("data-variant", "default"); // Reciente va primero
  expect(botones[1]).toHaveAttribute("data-variant", "outline");
  fireEvent.change(screen.getByLabelText("Buscar paciente o HC"), { target: { value: "antiguo" } });
  expect(screen.getByRole("button", { name: "Reanudar" })).toHaveAttribute("data-variant", "outline");
});
it("las acciones de arriba: «Nuevo paciente», «Nuevo caso» y, la última, «Prueba rápida sin paciente»", async () => {
  render(<Patients {...props} onStartWithoutPatient={() => {}} />);
  const header = screen.getByRole("banner");
  const nombres = within(header).getAllByRole("button").map((b) => b.textContent);
  expect(nombres.indexOf("Nuevo paciente")).toBeLessThan(nombres.indexOf("Nuevo caso"));
  expect(nombres.indexOf("Nuevo caso")).toBeLessThan(nombres.indexOf("Prueba rápida sin paciente"));
  expect(within(header).queryByText("Empezar sin paciente")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/avisosOficina.test.ts src/pages/Patients.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

`lib/pedidosParados.ts`: mover `daysSince`, el umbral por estado y `isStale` de `ClipOrders.tsx` tal cual (exportados); `ClipOrders.tsx` los importa. `INFORME_STEP`: en `lib/avisosOficina.ts`, `export const INFORME_STEP = stepIndex("report")` (de `pipeline/steps`).

`Patients.tsx`: cargar también `api.listClipOrders({ ...sin filtro, solo abiertos si la firma lo permite })` en `load()` con `.catch(() => null)` → estado `orders: ClipOrder[] | null`. Avisos: `avisosOficina({ patients, orders, ahora: new Date() })` pintados como tres tarjetas en una fila (`Card` con icono en cuadrado de 36 px con fondo `color-mix(in srgb, var(--<tono>) 14%, transparent)` y color `--<tono>`; título 14 px / 600; detalle 12 px `--muted-foreground`; enlace «Ver» en `--data` que llama a `nav.go(destino)` cuando `destino !== null`). Sin avisos: nada (no se pinta la fila). Quitar las cuatro `tiles`. `AppShell subtitle={recuento + " · " + (isAdmin ? "en la base de datos" : "tuyos o compartidos contigo")}` (con `loading`/`loadError` como hoy en `PanelHead.desc`); quitar `PanelHead` de la página. Acciones de la barra en este orden: «Nuevo paciente» (outline), «Nuevo caso» (primario), «Prueba rápida sin paciente» (outline, `title` como hoy). Tabla: `className="tabla-oficina"`; la celda de acciones envuelve los botones en `<span className="fila-acciones">`; «Reanudar» es `variant="default"` solo si `p.id === masReciente?.id` donde `masReciente` = primer elemento de `patients` ordenados por `ultimaActividad` con `last_session_id`; el resto `variant="outline"`. Fila recién creada: `className={p.id === nuevaId ? "fila-nueva" : undefined}` donde `nuevaId` se fija al crear (`onSaved(creado)`) y se limpia a los 1 200 ms. Importar `../styles/office.css`. El botón «Abrir ficha» conserva su texto (test existente).

- [ ] **Step 4: Run** `npx vitest run src/lib src/pages/Patients.test.tsx src/pages/ClipOrders.test.tsx` → PASS. `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/avisosOficina.ts frontend/src/lib/avisosOficina.test.ts frontend/src/lib/pedidosParados.ts frontend/src/styles/office.css frontend/src/pages/ClipOrders.tsx frontend/src/pages/Patients.tsx frontend/src/pages/Patients.test.tsx
git commit -m "Pacientes: avisos clínicos en vez de métricas, acciones de fila atenuadas y primario en la sesión más reciente"
```

---

### Task 4: Ficha de paciente a 620 px con dos columnas y pie fijo

**Files:**
- Modify: `frontend/src/pages/PatientSheet.tsx`
- Test: `frontend/src/pages/PatientSheet.test.tsx` (añadir), `frontend/src/pages/Patients.test.tsx` (sin cambios esperados)

**Interfaces:**
- Consumes: `Sheet` con `footer` (fase 1), `.hoja-dos-columnas` de `styles/office.css` (T3).
- Produces: la ficha (edición) abre con `width={620}`; el alta («Nuevo paciente») con `width={460}` y una columna. En edición, columna izquierda = datos del paciente (formulario) y antecedentes; columna derecha = casos, sesiones guardadas, compartido con. La barra de acciones `position: sticky` desaparece: «Guardar cambios»/«Crear paciente» (primario) y «Cancelar» van al `footer` de la hoja; «Eliminar paciente» se queda al final de la columna izquierda. El encabezado «Antecedentes» pasa a `SectionLabel` en minúscula (T5 cambia `SectionLabel`; aquí solo se usa).

- [ ] **Step 1: Tests que fallan (añadir a PatientSheet.test.tsx)**

```ts
it("la ficha abre a 620 px en dos columnas y el alta a 460 en una", async () => {
  renderSheet({ patientId: 7 }); // helper del fichero
  const dialog = await screen.findByRole("dialog");
  expect(dialog.style.width).toBe("620px");
  expect(dialog.querySelector(".hoja-dos-columnas")).not.toBeNull();
  cleanup();
  renderSheet({ patientId: null });
  expect((await screen.findByRole("dialog")).style.width).toBe("460px");
  expect(screen.getByRole("dialog").querySelector(".hoja-dos-columnas")).toBeNull();
});
it("«Guardar cambios» y «Cancelar» viven en el pie de la hoja, no en una barra pegajosa", async () => {
  renderSheet({ patientId: 7 });
  const dialog = await screen.findByRole("dialog");
  const guardar = within(dialog).getByRole("button", { name: /Guardar cambios/ });
  expect(guardar.closest("[data-sheet-footer]")).not.toBeNull();
  expect(dialog.querySelector('[style*="sticky"]')).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/pages/PatientSheet.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

`Sheet.tsx` **no** cambia salvo añadir `data-sheet-footer` al `div` del pie (una línea; incluir en el commit). En `PatientSheet.tsx`: `width={editing ? 620 : 460}`; el cuerpo en edición se envuelve en `<div className="hoja-dos-columnas">` con dos `<div>`; el formulario y «Antecedentes» a la izquierda; «Casos (n)», «Sesiones guardadas (n)», «Compartido con» a la derecha; el bloque `position: "sticky"` se elimina y sus botones pasan a `footer={<>…</>}` de `Sheet` (misma lógica `busy`, `disabled`, `title` de «Guardar cambios» (F2-31) y `requestClose`). Todos los textos y `aria` actuales se conservan (40 tests).

- [ ] **Step 4: Run** `npx vitest run src/pages/PatientSheet.test.tsx src/pages/Patients.test.tsx src/components/Sheet.test.tsx` → PASS. `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PatientSheet.tsx frontend/src/pages/PatientSheet.test.tsx frontend/src/components/Sheet.tsx
git commit -m "Ficha de paciente: 620 px en dos columnas y acciones en el pie de la hoja"
```

---

### Task 5: Pie fijo en el resto de hojas y rótulos de sección en minúscula

**Files:**
- Modify: `frontend/src/pages/NuevoCaso.tsx` (NuevoEstudioSheet y CasePatientPicker)
- Modify: `frontend/src/pages/UsersAdmin.tsx` (EditUserSheet, NewUserSheet)
- Modify: `frontend/src/pages/Workshops.tsx` (WorkshopSheet)
- Modify: `frontend/src/components/ShareSheet.tsx`
- Modify: `frontend/src/components/AttachCaseSheet.tsx`
- Modify: `frontend/src/components/ChangePasswordSheet.tsx`
- Modify: `frontend/src/components/PanelHead.tsx` (`SectionLabel`)
- Test: `frontend/src/components/PanelHead.test.tsx` (crear), `frontend/src/pages/NuevoCaso.test.tsx` (añadir uno)

**Interfaces:**
- Produces: en cada hoja con acciones de guardar/cancelar, esos botones van en `footer` (primario + «Cancelar» outline, en ese orden, a la derecha), y el cuerpo deja de llevarlos. `SectionLabel` pasa a `fontSize: "var(--text-label)"`, `fontWeight: "var(--weight-label)"`, sin `textTransform` ni `letterSpacing`, `color: var(--muted-foreground)`, `marginBottom: 8`. Anchos: hojas de formulario 460 (`NuevoEstudioSheet`, `NewUserSheet`, `EditUserSheet`, `WorkshopSheet`, `AttachCaseSheet`, `CasePatientPicker`), `ShareSheet` 440, `ChangePasswordSheet` 400 (sin cambio).

- [ ] **Step 1: Tests que fallan**

`components/PanelHead.test.tsx`:
```ts
it("SectionLabel va en minúscula, 13 px y peso 500", () => {
  render(<SectionLabel>Antecedentes</SectionLabel>);
  const el = screen.getByText("Antecedentes");
  expect(el.style.textTransform).toBe("");
  expect(el.style.fontSize).toContain("--text-label");
  expect(el.style.fontWeight).toContain("--weight-label");
});
```
`pages/NuevoCaso.test.tsx` (añadir): «el botón de crear el caso está en el pie de la hoja» → `getByRole("button", { name: /Crear caso|Guardar/ }).closest("[data-sheet-footer]")` no nulo (usar el texto real del botón que ya prueba el fichero).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** según Interfaces (mover los botones existentes al `footer`, sin cambiar textos, `disabled`, `busy` ni handlers). **Step 4: Run** `npx vitest run src/pages src/components` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NuevoCaso.tsx frontend/src/pages/UsersAdmin.tsx frontend/src/pages/Workshops.tsx frontend/src/components/ShareSheet.tsx frontend/src/components/AttachCaseSheet.tsx frontend/src/components/ChangePasswordSheet.tsx frontend/src/components/PanelHead.tsx frontend/src/components/PanelHead.test.tsx frontend/src/pages/NuevoCaso.test.tsx
git commit -m "Hojas: acciones en el pie fijo; rótulos de sección en minúscula"
```

---

### Task 6: Estudios con tarjetas elevadas, chip de modalidad sobre la miniatura y tarjeta punteada «Subir un estudio nuevo»

**Files:**
- Modify: `frontend/src/pages/Studies.tsx`
- Modify: `frontend/src/App.tsx` (pasa `onNew={startWithoutPatient}` a `Studies`)
- Create: `frontend/src/lib/viewTransition.ts`
- Test: `frontend/src/pages/Studies.test.tsx` (añadir), `frontend/src/lib/viewTransition.test.ts` (crear)

**Interfaces:**
- Produces: `Studies({ onOpen, onResume, onOpenPatient, onNew })` con `onNew: () => void`; `StudyGallery` acepta `onNew?: () => void` y, cuando lo recibe y no es `compact`, pinta al final de la rejilla un `<button className="tarjeta-nueva">` «Subir un estudio nuevo» (borde `1px dashed color-mix(in srgb, var(--foreground) 18%, transparent)`, radio 12, color `--data`, `minHeight: 300`). Cada tarjeta lleva `className="tarjeta-estudio"`; sobre la miniatura (altura fija 170 px, `objectFit: cover`, fondo `--viewer-bg`) un chip mono arriba-izquierda «{modalidad} · {n} cortes» (11 px, `rgba(0,0,0,.6)`, color `--data`) y, arriba-derecha, la insignia de riesgo si la hay; en el cuerpo: nombre 14/600, línea mono «HC · sexo · edad» si existen, «Último paso: …» 12 px. `lib/viewTransition.ts`: `export function conTransicion(fn: () => void): void` — si `document.startViewTransition` existe lo usa, si no llama a `fn()`; `Studies.onOpen`/`onResume` se envuelven con ella. El subtítulo de la barra: «N estudios de imagen archivados» (N de la lista cargada; «Cargando…» mientras carga).

- [ ] **Step 1: Tests que fallan**

`lib/viewTransition.test.ts`:
```ts
it("sin startViewTransition llama directamente", () => { let n = 0; conTransicion(() => { n++; }); expect(n).toBe(1); });
it("con startViewTransition lo usa", () => {
  const start = vi.fn((cb: () => void) => { cb(); return {} as ViewTransition; });
  (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
  let n = 0; conTransicion(() => { n++; });
  expect(start).toHaveBeenCalledTimes(1); expect(n).toBe(1);
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});
```
`pages/Studies.test.tsx` (añadir):
```ts
it("la tarjeta lleva el chip «TC · 621 cortes» sobre la miniatura y la clase de elevación", async () => {
  api.listStudies.mockResolvedValue([study({ modality: "TC", n_slices: 621 })]);
  render(<Studies {...props} />);
  expect(await screen.findByText("TC · 621 cortes")).toBeInTheDocument();
  expect(document.querySelector(".tarjeta-estudio")).not.toBeNull();
});
it("«Subir un estudio nuevo» cierra la rejilla y llama a onNew", async () => {
  const onNew = vi.fn();
  api.listStudies.mockResolvedValue([study({})]);
  render(<Studies {...props} onNew={onNew} />);
  fireEvent.click(await screen.findByRole("button", { name: "Subir un estudio nuevo" }));
  expect(onNew).toHaveBeenCalledTimes(1);
});
```
(`study()` = helper del fichero o uno nuevo con los campos mínimos de `StudyCard`.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** según Interfaces; el texto «N cortes» suelto de hoy desaparece (sustituido por el chip); los tests existentes de botones y borrado siguen. **Step 4: Run** `npx vitest run src/pages/Studies.test.tsx src/lib/viewTransition.test.ts src/pages/PatientSheet.test.tsx src/App.test.tsx` → PASS (si `App.test.tsx` no existe, omitir); `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Studies.tsx frontend/src/pages/Studies.test.tsx frontend/src/App.tsx frontend/src/lib/viewTransition.ts frontend/src/lib/viewTransition.test.ts
git commit -m "Estudios: tarjetas elevadas con chip de modalidad, tarjeta punteada de subida y transición de vista"
```

---

### Task 7: Usuarios con acciones con palabra, avatar en la fila, estado con punto y «Nuevo usuario» en la barra

**Files:**
- Modify: `frontend/src/pages/UsersAdmin.tsx`
- Test: `frontend/src/pages/UsersAdmin.test.tsx` (añadir; actualizar los que buscan botones por `title`)

**Interfaces:**
- Consumes: `.tabla-oficina`, `.fila-acciones`, `.fila-nueva` de `styles/office.css`.
- Produces: en la barra, `subtitle` = «N usuarios · M activos», `actions` = buscador (220 px) + `Button` «Nuevo usuario» (primario, `size="sm"`); desaparecen el título «Gestión de usuarios» y los botones «Actualizar»/«Nuevo usuario» del cuerpo (la recarga sigue tras cada cambio). Celda «Usuario»: avatar de iniciales 34 px + nombre 600 + `@usuario` mono 12 px `--muted-foreground`; «(tú)» tras el nombre de la cuenta propia. Columna «Estado»: punto de 7 px + texto (`estadoCuenta`): Activo `--success`, Pendiente `--warning`, Rechazada/Desactivada `--muted-foreground`. Acciones de fila (`<span className="fila-acciones">`): `Button size="sm" variant="outline"` «Editar», «Restablecer contraseña», y `Button size="sm" variant="destructive"` «Eliminar» (deshabilitado con el `title` de siempre para la cuenta propia). Fila nueva iluminada 1,2 s al crear (`fila-nueva`).

- [ ] **Step 1: Tests que fallan (añadir)**

```ts
it("cada acción de fila lleva palabra: Editar, Restablecer contraseña y Eliminar", async () => {
  renderUsers(); // helper del fichero
  const fila = (await screen.findAllByRole("row"))[1];
  expect(within(fila).getByRole("button", { name: "Editar" })).toBeInTheDocument();
  expect(within(fila).getByRole("button", { name: "Restablecer contraseña" })).toBeInTheDocument();
  expect(within(fila).getByRole("button", { name: "Eliminar" })).toHaveAttribute("data-variant", "destructive");
});
it("el estado va con punto y texto, y el subtítulo cuenta usuarios y activos", async () => {
  renderUsers();
  expect(await screen.findByText("Activo")).toBeInTheDocument();
  expect(within(screen.getByRole("banner")).getByText(/\d+ usuarios? · \d+ activos?/)).toBeInTheDocument();
  expect(screen.queryByText("Gestión de usuarios")).toBeNull();
});
```
Actualizar los tests existentes que pulsan por `title` («Editar», «Restablecer contraseña», «Eliminar») a `getByRole("button", { name })`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** según Interfaces. **Step 4: Run** `npx vitest run src/pages/UsersAdmin.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/UsersAdmin.tsx frontend/src/pages/UsersAdmin.test.tsx
git commit -m "Usuarios: acciones con palabra, avatar y estado con punto; alta desde la barra"
```

---

### Task 8: Pedidos, Talleres, Cuentas pendientes y Auditoría con el mismo patrón de cabecera

**Files:**
- Modify: `frontend/src/pages/ClipOrders.tsx`, `frontend/src/pages/Workshops.tsx`, `frontend/src/pages/PendingRequests.tsx`, `frontend/src/pages/AuditTrail.tsx`
- Test: los cuatro `*.test.tsx` (actualizar donde el título o el subtítulo cambien de sitio)

**Interfaces:**
- Produces: en las cuatro páginas el título es la miga y la descripción que hoy pinta `PanelHead.desc` (o el subtítulo propio) pasa a `AppShell subtitle`; el `PanelHead` de la página se elimina. Las acciones principales («Nuevo taller», «Exportar», «Actualizar» donde exista) pasan a `actions` de la barra con `size="sm"`. Tablas: `className="tabla-oficina"` y acciones de fila en `.fila-acciones`; cabecera de tabla 11 px / 600 / mayúsculas / 0.06em; filas con `padding: 13px 14px`. Los textos que prueban los tests se conservan (p. ej. el subtítulo «pedidos» de F1-93, «Exportar» visible antes de verificar en Auditoría, los vacíos de Talleres).

- [ ] **Step 1: Tests que fallan:** en cada fichero añadir un test «el título está en la miga y el subtítulo en la barra» (`within(screen.getByRole("banner")).getByText(<subtítulo real>)` y `queryByRole("heading", { level: 1 })` fuera de la barra nulo); actualizar las aserciones existentes que localizaban el subtítulo o un botón por su posición en el cuerpo.

- [ ] **Step 2: Run** `npx vitest run src/pages/ClipOrders.test.tsx src/pages/Workshops.test.tsx src/pages/PendingRequests.test.tsx src/pages/AuditTrail.test.tsx` → FAIL (los nuevos). **Step 3: Implementar** página a página. **Step 4: Run** → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ClipOrders.tsx frontend/src/pages/Workshops.tsx frontend/src/pages/PendingRequests.tsx frontend/src/pages/AuditTrail.tsx frontend/src/pages/ClipOrders.test.tsx frontend/src/pages/Workshops.test.tsx frontend/src/pages/PendingRequests.test.tsx frontend/src/pages/AuditTrail.test.tsx
git commit -m "Administración: cabecera única de 56 px y tablas con el ritmo de la oficina"
```

---

### Task 9: Comprobación de conjunto y nota en el documento de diseño

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (al final de §7: «Fase 2 completada el <fecha>: shell de la oficina; ver plan …»)

- [ ] **Step 1:** `cd frontend && npx vitest run && npx tsc -b` → todo verde.
- [ ] **Step 2:** Arrancar Vite desde el worktree en otro puerto y mirar: Pacientes (avisos, barra lateral fijada con barra deslizante al cambiar de sección, acciones de fila atenuadas), Nuevo paciente (460, pie), Ficha (620, dos columnas), Estudios (tarjetas, punteada), Usuarios (acciones con palabra). Corregir en esta tarea cualquier desborde.
- [ ] **Step 3: Commit de la nota**

```bash
git add docs/superpowers/specs/2026-10-30-rediseno-visual-design.md
git commit -m "Diseño: fase 2 (shell de la oficina) completada"
```

---

## Autorrevisión

- **Cobertura (fase 2):** §4.4 barra superior única → T2 (el pipeline la adopta en la fase 3 vía `status`); barra lateral → T1; Pacientes (avisos + tabla + «Prueba rápida») → T3; hojas 460/620, foco, pie, fila iluminada → T4/T5 (+ T3/T7 para la fila); Estudios → T6; Usuarios y administración → T7/T8; §4.3 botones de fila atenuados y primario único → T3; §8.5 avisos sin API → T3; §8.9 barra lateral → T1; §4.7 FLIP/View Transitions → T1 (layoutId) y T6.
- **Nombres:** `subtitle`/`status`/`actions` (T2) se consumen en T3, T6, T7, T8; `.tabla-oficina`, `.fila-acciones`, `.fila-nueva`, `.tarjeta-estudio`, `.hoja-dos-columnas` nacen en T3 y se usan en T4, T6, T7, T8; `data-sheet-footer` nace en T4 y lo usa T5; `isStale` se mueve en T3 y lo sigue usando ClipOrders.
- **Review Focus:** 1 → T1; 2, 3, 4 → T3; 5 → T3 (CSS) sin test.
- **Proporción:** nueve tareas, unas 330 líneas para ~16 ficheros de producto; los cuerpos no están escritos.
