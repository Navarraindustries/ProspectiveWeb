# Cristal D · Fase 2 (oficina L1 + paleta ⌘K) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar la oficina (Pacientes, Estudios, Pedidos de clips, Talleres, Usuarios, Cuentas pendientes, Auditoría) a la distribución L1 de cristal sobre el `Entorno` y añadir la paleta de mandos ⌘K global.

**Architecture:** `AppShell` monta el `Entorno` (fase 1) y una rejilla barra lateral 240/64 · contenido; `SideNav` y `TopBar` pasan a cristal con `glass()`; las pantallas cambian sus superficies a `Card`/`glass()` sin tocar su lógica. La paleta es un componente global montado una vez en `App.tsx`, alimentado por un registro de mandos (`lib/commands.ts`) donde cada pantalla registra los suyos con un hook; las acciones que abren hojas de Pacientes viajan como parámetros de URL (`?nuevo=paciente`, `?nuevo=caso`, `?paciente=<id>`).

**Tech Stack:** React 19, react-router-dom (data router), `motion` 12 vía `src/motion`, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §5.1, §5.3, §5.5 (oficina), §5.6, §9 fase 2. Tableros: `docs/superpowers/specs/assets/2026-10-31-cristal-d/L1-Pacientes.dc.html`, `L1-Esquema.dc.html`, `D-Pacientes.dc.html` (paleta abierta).

## Global Constraints

- Todo lo de la fase 1 sigue: tokens y `glass()` de `src/styles/glass.ts`, presets `glide`, `lens`, `lensCard` de `src/motion`, atributo `data-glass` en todo elemento con `glass()`.
- Commits por lista explícita; nunca `git add -A`; nunca `docs/Informe-Ejecutivo-Zenodo.html`, `frontend/data/`.
- Sin color literal en `pages/`, `components/shell/`, `components/patients/` (test de tokens).
- No cambia la lógica de datos de ninguna pantalla ni la API. Los textos que prueban los tests se mantienen salvo que el test cambie en la misma tarea.
- Las tablas densas no llevan desenfoque propio: van dentro de un panel `glass("dense")`.
- Barra lateral: 240 px fijada, 64 px plegada; se conservan chincheta, Alt+B, expansión al pasar y sus tests.
- Breakpoints: ≤ 1280 px barra lateral plegada por defecto e inspector de Pacientes bajo la rejilla; ≤ 820 px el comportamiento responsive actual.
- La paleta es un atajo: todo lo que hace tiene otro camino visible.

## Review Focus

1. ⌘K / Ctrl+K mientras el foco está en un campo de texto: la paleta se abre igualmente y, al cerrarla con Esc, el foco vuelve al campo (test en la tarea 3).
2. Un Médico (no administrador) abre la paleta: no ve Usuarios, Cuentas pendientes ni Auditoría (test en la tarea 3).
3. `?nuevo=paciente` en la URL abre la hoja una sola vez y el parámetro desaparece de la URL (recargar no la reabre) (test en la tarea 4).
4. La lista de pacientes falla al cargar en la paleta: el grupo «Pacientes» dice que no se pudo cargar, los demás grupos siguen (test en la tarea 3).
5. Con la barra lateral plegada a 64 px, cada sección conserva su nombre accesible (tooltip y `aria-label`) (test en la tarea 1).

---

### Task 1: `AppShell` sobre el `Entorno` y barra lateral de cristal 240/64

**Files:**
- Modify: `frontend/src/components/shell/AppShell.tsx`, `AppShell.test.tsx`, `SideNav.tsx`, `SideNav.test.tsx`, `shell.css`, `useShellState.ts` (si el plegado por defecto a ≤ 1280 vive ahí)

**Interfaces:**
- Consumes: `Entorno` (`components/Entorno.tsx`), `glass()`.
- Produces: misma API de `AppShell` (`crumbs`, `subtitle`, `status`, `actions`, `children`). La raíz `.shell` va dentro de `<Entorno>`; columnas `64px 1fr` / `240px 1fr` fijada; `.shell-main` sin fondo propio (transparente sobre el `Entorno`). `.shell-nav`: `glass("normal")` + `data-glass`, sin `border-right` opaco, radio 0; la barra activa que se desliza se queda, en `--primary`. A ≤ 1280 px (`matchMedia("(max-width: 1280px)")`) arranca plegada aunque la preferencia guardada diga fijada, sin sobrescribir la preferencia.

- [ ] **Step 1: Tests.** `SideNav.test.tsx`: plegada, cada enlace de sección tiene `aria-label` igual a su rótulo de `sections.ts`; la raíz de la barra tiene `data-glass`. `AppShell.test.tsx`: renderiza un `img` del `Entorno` (`src` = `ENTORNO_SRC`) en tema oscuro; con la barra fijada la rejilla es `240px 1fr` (leer `data-pinned="true"` y la regla de `shell.css` por contenido del fichero, como hace `tokens.test.ts`); con `matchMedia` de 1280 a `true` arranca con `data-pinned="false"`.
- [ ] **Step 2: Ver que fallan.** `npx vitest run src/components/shell`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/components/shell` y `npx tsc -b`.
- [ ] **Step 5: Commit** — `git add` de los ficheros listados; mensaje «Oficina D: shell sobre el Entorno y barra lateral de cristal 240/64».

### Task 2: Barra superior de cristal y botón ⌘K

**Files:**
- Create: `frontend/src/lib/commands.ts`, `frontend/src/lib/commands.test.ts`
- Modify: `frontend/src/components/shell/TopBar.tsx`, `shell.css`, `frontend/src/components/shell/AppShell.test.tsx` (o un `TopBar.test.tsx` nuevo)

**Interfaces:**
- Produces en `lib/commands.ts`:
  - `export const OPEN_PALETTE_EVENT = "prospective:command-palette"`; `openCommandPalette(): void` (despacha el evento en `window`).
  - `export interface Command { id: string; group: "ir" | "acciones" | "pasos"; label: string; hint?: string; keywords?: string[]; run: () => void; disabled?: boolean }`.
  - `registerCommands(owner: string, cmds: Command[]): () => void` (sustituye los del mismo `owner`; devuelve el desregistro); `getCommands(): Command[]`; `subscribeCommands(fn: () => void): () => void`.
  - `useRegisterCommands(owner: string, cmds: Command[]): void` (registra al montar y al cambiar `cmds` por `id`/`label`/`disabled`, desregistra al desmontar).
- Produces en `TopBar`: `.shell-top` con `glass("normal")` + `data-glass`, alto 56; botón redondo «⌘K» (`aria-label="Abrir la paleta de mandos (Ctrl+K)"`, texto visible `⌘K` en mono) entre las acciones y el conmutador de tema, que llama `openCommandPalette()`.

- [ ] **Step 1: Tests.** `commands.test.ts`: registrar dos mandos con owner «a» y uno con «b» → `getCommands()` tiene 3; volver a registrar «a» con uno → 2; el desregistro de «b» deja 1; `subscribeCommands` recibe una llamada por cambio; `openCommandPalette()` despacha `OPEN_PALETTE_EVENT` (escuchar en `window`). Test de `TopBar`: pulsar el botón «Abrir la paleta de mandos (Ctrl+K)» despacha el evento; la barra tiene `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar** (`useRegisterCommands` con `useEffect`; clave de dependencias = `JSON.stringify(cmds.map(c => [c.id, c.label, c.disabled]))`).
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Oficina D: barra superior de cristal, botón ⌘K y registro de mandos».

### Task 3: Paleta de mandos ⌘K global

**Files:**
- Create: `frontend/src/components/CommandPalette.tsx`, `frontend/src/components/CommandPalette.test.tsx`
- Modify: `frontend/src/App.tsx` (montarla una vez dentro del `Router`, solo con usuario; registrar los mandos globales)

**Interfaces:**
- Consumes: `OPEN_PALETTE_EVENT`, `getCommands`, `subscribeCommands`, `registerCommands`/`useRegisterCommands` (tarea 2); `SECTIONS`, `ADMIN_GROUP_LABEL` (`components/shell/sections.ts`); `useAuth()` (rol); `api.listPatients()`; `glass("dense")`, `glide`, `useReducedMotion`.
- Produces: `CommandPalette({ onOpenPatient, onResume }: { onOpenPatient: (id: number) => void; onResume: (sessionId: string, p: PatientSummary) => void }): JSX.Element`. Abre con el evento, con `Ctrl+K` y `Meta+K` (aunque el foco esté en un campo; `preventDefault`). Ventana centrada de 640 px, `role="dialog"`, `aria-label="Paleta de mandos"`, buscador con `aria-label="Buscar en la paleta"` enfocado al abrir; velo `--veil-dense`; entra con `glide` (solo opacidad con movimiento reducido). Grupos en este orden, cada uno con su rótulo mono: **Ir a** (secciones de `SECTIONS`, las del grupo admin solo con rol admin; `run` = `nav.go(key)`), **Pasos** y **Acciones** (los registrados con ese `group`), **Pacientes** (la lista se pide la primera vez que se abre y se guarda mientras viva el componente; filtra por nombre o HC sin distinguir mayúsculas ni tildes; Enter → `onOpenPatient(id)`; si falla, una línea «No se pudo cargar la lista de pacientes»), **Recientes** (los cinco pacientes con `last_session_id` más reciente por `last_session_at`; rótulo «Reanudar · <nombre>»; Enter → `onResume(last_session_id, p)`). ↑/↓ mueven la selección por la lista aplanada, Enter ejecuta y cierra, Esc cierra y devuelve el foco al elemento que lo tenía. Sin resultados: «Nada coincide con «<texto>»».
- Mandos globales que registra `App.tsx` (owner `"app"`, group `"acciones"`): «Nuevo paciente» → `navigate("/app/pacientes?nuevo=paciente")`; «Nuevo caso» → `navigate("/app/pacientes?nuevo=caso")`; «Prueba rápida sin paciente» → `startWithoutPatient()`. `onOpenPatient` en `App.tsx` → `navigate("/app/pacientes?paciente=<id>")` (la fase 3 lo cambia a la ruta de la ficha); `onResume` → `resumeSession`.

- [ ] **Step 1: Tests** en `CommandPalette.test.tsx` (con `api.listPatients` simulado y `useAuth` con rol):
  - `Ctrl+K` abre el diálogo «Paleta de mandos» con el foco en «Buscar en la paleta»; Esc lo cierra y el foco vuelve al `input` que lo tenía antes.
  - Con rol `medico` no aparece «Usuarios» ni «Auditoría»; con `admin` sí.
  - Escribir «zenodo 096» (o la HC «ZENODO-096») deja la fila «Zenodo, Caso 096» en Pacientes; Enter llama `onOpenPatient(96)` (id del simulado).
  - «Recientes» lista «Reanudar · Zenodo, Caso 002» primero si su `last_session_at` es el más reciente; Enter llama `onResume("s-002", p)`.
  - Con `listPatients` rechazado aparece «No se pudo cargar la lista de pacientes» y «Ir a» sigue.
  - Un mando registrado con `registerCommands("t", [{ id: "x", group: "acciones", label: "Guardar progreso", run }])` aparece y Enter llama `run`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar** el componente y el montaje en `App.tsx`.
- [ ] **Step 4: Ver que pasan** `npx vitest run src/components/CommandPalette.test.tsx src/App.resume.test.tsx` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Paleta de mandos ⌘K global: ir a, acciones, pacientes y recientes».

### Task 4: Pacientes en L1 (avisos en franja, tarjetas de cristal, inspector derecho)

**Files:**
- Modify: `frontend/src/pages/Patients.tsx`, `Patients.test.tsx`, `frontend/src/components/patients/patients.css`, `PatientCard.tsx`, `PatientCard.test.tsx`, `PatientsSidePanel.tsx`, `PatientsSidePanel.test.tsx`

**Interfaces:**
- Consumes: `Card`, `glass()`, `lensCard`, `useSearchParams` de react-router-dom.
- Produces:
  - Acciones de la barra en este orden y peso: «Nuevo paciente» (`Button` primario), «Nuevo caso» (`outline`), «Prueba rápida sin paciente» (`ghost`).
  - Avisos (`avisosOficina`) como **franja de chips** bajo la barra: cada aviso es una pastilla de cristal con icono del tono, título, detalle (truncado con `title`) y «Ver» cuando tiene destino; ya no tarjetas en rejilla.
  - `.pt-layout`: rejilla `1fr 380px` a > 1280 px; el `PatientsSidePanel` es un inspector de cristal denso (`glass("dense")`, radio `--radius-xl`, `position: sticky; top: 24px`); a ≤ 1280 px pasa debajo de la rejilla a todo el ancho.
  - `.pt-grid`: 3 columnas a 1440 (`repeat(auto-fill, minmax(260px, 1fr))` se queda si ya da 3); `.pt-card` de cristal (`var(--glass)` + borde `--glass-border` + `backdrop-filter`), radio `--radius-card-lg`, lente `scale(1.02)` al pasar (CSS con `--dur-2`, sin lente con movimiento reducido), foco visible.
  - Parámetros de URL: `?nuevo=paciente` abre la hoja de nuevo paciente (`openCreate`), `?nuevo=caso` abre el selector de caso (`setCaseSheet(true)`), `?paciente=<id>` abre la ficha de ese id (`openSheet(id)`); cada uno se consume una vez y se borra con `setSearchParams(…, { replace: true })`.

- [ ] **Step 1: Tests.** `Patients.test.tsx`: el primer botón de acción es «Nuevo paciente» y tiene `data-variant="default"`; los avisos se pintan como elementos con `data-aviso` dentro de un contenedor `role="list"` con `aria-label="Avisos clínicos"`; renderizar en `/app/pacientes?nuevo=paciente` abre la hoja «Nuevo paciente» y la URL queda sin `nuevo`; `?paciente=7` abre la ficha del paciente 7. `PatientCard.test.tsx`: la tarjeta tiene la clase `pt-card` y conserva rol y nombre accesible actuales. `PatientsSidePanel.test.tsx`: la raíz tiene `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/pages/Patients.test.tsx src/components/patients` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Pacientes D: avisos en franja, tarjetas de cristal e inspector derecho».

### Task 5: Estudios, Pedidos de clips y Talleres de cristal

**Files:**
- Modify: `frontend/src/pages/Studies.tsx`, `ClipOrders.tsx`, `Workshops.tsx`, sus tests si alguna aserción depende del aspecto, `frontend/src/styles/office.css`

**Interfaces:**
- Produces: cada pantalla pone su contenido en paneles `Card` (cristal) sobre el `Entorno`; las tablas de Pedidos y Talleres dentro de un panel `glass("dense")` + `data-glass` con cabecera de tabla en rótulo mono (`--text-eyebrow`, mayúsculas, `--tracking-eyebrow`) y filas con separador `--border`, sin fondo propio; `.tarjeta-estudio` pasa a cristal con lente `scale(1.02)` en vez de elevación; `.tarjeta-nueva` conserva el borde punteado sobre cristal; las acciones de fila atenuadas (`.fila-acciones`) se conservan.

- [ ] **Step 1: Tests.** En `Studies.test.tsx`: cada tarjeta de estudio tiene `data-glass` o la clase `tarjeta-estudio` (la que se use); en `ClipOrders.test.tsx` y `Workshops.test.tsx`: la tabla está dentro de un elemento con `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** los tres tests y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Oficina D: Estudios, Pedidos y Talleres de cristal».

### Task 6: Usuarios, Cuentas pendientes y Auditoría de cristal

**Files:**
- Modify: `frontend/src/pages/UsersAdmin.tsx`, `PendingRequests.tsx`, `AuditTrail.tsx`, sus tests si alguna aserción depende del aspecto

**Interfaces:**
- Produces: el mismo tratamiento de la tarea 5 (tabla en panel `glass("dense")` + `data-glass`, cabeceras en rótulo mono, filas sin fondo propio, acciones con palabra); las insignias de rol y estado con `Badge` de la fase 1.

- [ ] **Step 1: Tests.** En cada test de página: la tabla (o lista) está dentro de un elemento con `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Administración D: Usuarios, Cuentas pendientes y Auditoría de cristal».

### Task 7: Cierre de la fase

- [ ] **Step 1:** `npx vitest run` completo y `npx tsc -b` verdes.
- [ ] **Step 2:** Nota «Fase 2 completada el …» en §9 del documento de diseño, con desviaciones.
- [ ] **Step 3: Commit** — «Diseño: fase 2 del cristal D completada».
