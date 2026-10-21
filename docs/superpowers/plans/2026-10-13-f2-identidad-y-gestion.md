# F2 · Identidad nueva, shell C y pantallas de gestión — plan de ejecución

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la gestión de PROSPECTIVE Web (portada, entrar, pacientes, ficha, casos, estudios, pedidos, talleres y administración) se lea como un solo producto oscuro «Pro» con la identidad A y el shell C, con las 75 filas F2 de la auditoría, las 32 filas F1 dejadas para F2, las fusiones aprobadas de gestión y cuatro piezas de servidor (compartir por paciente, guardados, auditoría por paciente, borrar cuenta con reasignación).

**Architecture:** Vía A: los tokens cambian de valor (oscuro en `:root`, claro bajo `[data-theme="light"]`), Geist se autoaloja, los componentes base se rehacen por dentro con la misma API, y un `AppShell` (barra lateral de iconos + barra superior fina) envuelve cada pantalla de gestión, que se reescribe dentro de él. El espacio de trabajo hereda colores y fuentes y conserva su `Topbar` y su carril hasta F3. El backend gana una tabla de compartidos, dos rutas de guardados, un filtro de auditoría y la reasignación al borrar una cuenta.

**Tech Stack:** React 19 + Vitest + Testing Library; CSS con tokens (sin Tailwind); FastAPI + SQLAlchemy + Alembic (`migrations/versions`, revisión a mano con `python -m services.database revision "…"`) + pytest (un fichero por proceso); contrato OpenAPI regenerado cuando cambie el backend.

**Spec:** `docs/superpowers/specs/2026-10-13-f2-identidad-y-gestion-design.md` (secciones 3–8). **Anexo de filas:** `docs/superpowers/plans/2026-10-13-f2-identidad-y-gestion-filas.md` (A: F2-1…F2-75 por pantalla; B: las 32 filas F1 dejadas para F2; C: fusiones 1–14 y 25; D: menores F2-T1…T6). **El texto del anexo manda** sobre cualquier resumen de este plan; cada tarea cita sus filas.

## Global Constraints

- Copia en español; textos nuevos copiados del anexo **literalmente**; nombres de pantallas y botones entre « ». Comentarios con el porqué (qué fallaba, qué espera la persona).
- Identidad A exacta (spec §3.1): `--canvas #0B0C0F`, `--background #141519`, `--card #1C1D22`, `--foreground #F2F3F5`, `--muted-foreground #9AA3AF`, `--border rgba(255,255,255,.08)`, `--primary #3B8BFF`, `--success #2ECC8A`, `--destructive #FF5A5F`, `--warning #F5B942`, vidrio `rgba(28,29,34,.72)` + `blur(18px)`, radios 16/10/8. El acento solo para interacción; ningún color literal nuevo en `pages/` ni en `components/shell/` (test de tokens, Tarea 1).
- Fuentes Geist y Geist Mono autoalojadas (woff2 variables, SIL OFL con su `OFL.txt` junto a los ficheros) en `frontend/src/assets/fonts/`; ninguna CDN; sin dependencia npm nueva (nunca se toca `frontend/package-lock.json`).
- Umbrales y cifras citados del código (`frontend/src/components/morphometry/thresholds.ts`, `backend/services/index_thresholds.py`), nunca de memoria.
- Backend: pytest un fichero por proceso (`cd backend && .venv/Scripts/python -m pytest <fichero> -q`); patrón de `backend/test_access_control.py` para clientes con rol; `test_auth_coverage.py` debe seguir en verde (toda ruta nueva exige sesión).
- Frontend: Vitest + Testing Library con `vi.mock` del store y del cliente como en `pages/AdminOnly.test.tsx`; `npx tsc --noEmit` limpio en cada tarea; `npm run build` en la Tarea 18.
- Contrato: si cambia un modelo o una ruta, `cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json && cd ../frontend && npm run gen:api`; `types.ts` se escribe a mano; `pytest test_openapi_contract.py`.
- Nunca `git push`; nunca commit de `backend/data/`; rama `f2-identidad-gestion` desde master dc24260. Commits en español con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM`.
- Servidores de desarrollo: no se arrancan ni se reinician desde las tareas (lo hace el propietario).
- Reglas de la auditoría: perder trabajo hecho a mano sin aviso = bloquea; exponer datos de otro profesional = bloquea; callejón sin salida = bloquea.
- El espacio de trabajo (`pages/Workspace.tsx`, `vtk/`, `components/planning|morphometry|segmentation|upload|annotations|vessels|perforators`) no se toca en F2 salvo lo que exija el cambio de `Icon` (misma API) y de tokens.

## Review Focus

1. **Una cuenta con la que se compartió un paciente intenta compartirlo con un tercero** (`PUT /api/patients/{id}/shares` como compartido): 403 «Solo quien creó al paciente o un administrador puede compartirlo», y la ficha no le ofrece «Compartir con…» (Tareas 7 y 11).
2. **Borrar el guardado que es el origen de la sesión viva** que se tiene abierta: 409 con motivo y la ficha lo dice sin borrar nada (Tareas 8 y 11).
3. **Tema claro**: todo token que exista en el oscuro existe en el claro; con `[data-theme="light"]` ninguna superficie queda transparente ni ningún texto invisible (Tarea 1, test de paridad).
4. **Un Médico escribe `/app/usuarios` a mano**: ve la tarjeta de solo administradores dentro del shell, con la barra lateral sin el grupo Administración, y puede volver (Tarea 4).
5. **Alt+B con el foco en un campo de texto**: pliega o despliega la barra lateral sin escribir nada en el campo ni robar el foco; en el espacio de trabajo no hace nada (Tarea 4).

---

### Task 1: Tokens de la identidad A, Geist autoalojada y oscuro por defecto

**Filas:** ninguna del anexo; spec §3.1 y §3.2.

**Files:**
- Modify: `frontend/src/styles/tokens/colors.css` (toda la paleta), `frontend/src/styles/tokens/fonts.css` (Geist), `frontend/src/styles/tokens/typography.css` (escala 12/13/14/16/20/28, pesos 400/500/600), `frontend/src/styles/tokens/spacing.css` (radios 16/10/8 como `--radius-lg|md|sm`, `--shadow-lg`, `--glass`), `frontend/src/styles/base.css` (`body` con `--canvas`), `frontend/src/styles/landing.css` (quita su paleta y sus `@font-face`; usa los tokens), `frontend/src/hooks/useTheme.ts` (por defecto `dark` cuando no hay nada guardado ni preferencia del sistema; la preferencia del sistema sigue mandando si existe), `frontend/src/store/theme.tsx` (valor por defecto del contexto `dark`)
- Create: `frontend/src/assets/fonts/GeistVF.woff2`, `frontend/src/assets/fonts/GeistMonoVF.woff2`, `frontend/src/assets/fonts/OFL-Geist.txt`
- Delete: `frontend/src/assets/fonts/Inter-*.ttf`, `JetBrainsMono-Regular.ttf`, `SpaceGrotesk-Variable.ttf`, `PlusJakartaSans-*.ttf` (y sus `@font-face`)
- Test: `frontend/src/styles/tokens.test.ts` (nuevo)

**Interfaces:**
- Produces: los nombres de token de la spec §3.1 más `--glass`, `--glass-blur`, `--shadow-lg`, `--radius-lg|md|sm`, `--font-sans: "Geist", system-ui, sans-serif`, `--font-mono: "Geist Mono", ui-monospace, monospace`. Los nombres actuales que siguen en uso en el visor (`--background`, `--card`, `--border`, `--muted-foreground`, `--brand-subtle`, `--success-bg`, `--warning-bg`, `--destructive`, `--hud`, `--chart-*`) se conservan con el valor nuevo.

- [ ] **Step 1: Prueba de paridad y de ausencia de colores literales (falla)**

```ts
// frontend/src/styles/tokens.test.ts
/* Identidad A (F2): el oscuro vive en :root y el claro bajo [data-theme="light"].
   Un token que exista solo en un tema deja una superficie transparente en el otro. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "tokens/colors.css"), "utf8");
const block = (sel: string) => {
  const i = css.indexOf(sel + " {");
  return css.slice(i, css.indexOf("}", i));
};
const names = (b: string) => new Set([...b.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

describe("tokens de la identidad A", () => {
  it("el claro define exactamente los mismos nombres que el oscuro", () => {
    const dark = names(block(":root")), light = names(block('[data-theme="light"]'));
    expect([...dark].filter((n) => !light.has(n))).toEqual([]);
    expect([...light].filter((n) => !dark.has(n))).toEqual([]);
  });
  it("el oscuro es el de la identidad A", () => {
    const r = block(":root");
    expect(r).toMatch(/--canvas:\s*#0B0C0F/i);
    expect(r).toMatch(/--background:\s*#141519/i);
    expect(r).toMatch(/--card:\s*#1C1D22/i);
    expect(r).toMatch(/--foreground:\s*#F2F3F5/i);
    expect(r).toMatch(/--primary:\s*#3B8BFF/i);
    expect(r).toMatch(/--success:\s*#2ECC8A/i);
    expect(r).toMatch(/--destructive:\s*#FF5A5F/i);
    expect(r).toMatch(/--warning:\s*#F5B942/i);
  });
  it("las fuentes son Geist y Geist Mono, autoalojadas", () => {
    const fonts = readFileSync(join(__dirname, "tokens/fonts.css"), "utf8");
    expect(fonts).toMatch(/font-family:\s*"Geist"/);
    expect(fonts).toMatch(/font-family:\s*"Geist Mono"/);
    expect(fonts).not.toMatch(/googleapis|Inter|JetBrains|Space Grotesk|Plus Jakarta/);
  });
  it("ninguna pantalla de gestión usa un color literal", () => {
    const dir = join(__dirname, "../pages");
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src.match(literal), `${f} lleva un color escrito a mano`).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `cd frontend && npx vitest run src/styles/tokens.test.ts` → falla en los valores del oscuro y en las fuentes (y en `pages/` con colores literales: anotarlos, los quita cada tarea de pantalla; hasta entonces la cuarta prueba puede quedar `it.skip` con el comentario «se activa en la Tarea 17»).

- [ ] **Step 3: Escribir los tokens.** `colors.css`: `:root` con la tabla de la spec §3.1 (incluidos `--primary-foreground #FFFFFF`, `--brand-subtle rgba(59,139,255,.16)`, `--brand-subtle-foreground #8CBBFF`, `--success-bg rgba(46,204,138,.14)`, `--destructive-bg rgba(255,90,95,.14)`, `--warning-bg rgba(245,185,66,.14)`, `--popover` = `--card`, `--input` = `--border`, `--ring` = `--primary`, `--secondary #1C1D22`, `--secondary-foreground #F2F3F5`, `--muted #141519`, `--accent` = `--brand-subtle`, `--hud #9AA3AF`, `--chart-1..5` derivados del azul y los grises) y `[data-theme="light"]` con los claros de la spec; `spacing.css` con `--radius-lg: 16px; --radius-md: 10px; --radius-sm: 8px; --glass: rgba(28,29,34,.72); --glass-blur: 18px; --shadow-lg: 0 30px 60px rgba(0,0,0,.45)` (claro: `--glass: rgba(255,255,255,.72); --shadow-lg: 0 20px 40px rgba(0,0,0,.12)`); `fonts.css` con dos `@font-face` variables (`font-weight: 100 900`) apuntando a `../../assets/fonts/GeistVF.woff2` y `GeistMonoVF.woff2`; `typography.css` con la escala. Descargar los woff2 de la última release de `vercel/geist-font` (en la 1.x se llaman `GeistVF.woff2` y `GeistMonoVF.woff2`) junto con `OFL.txt`; si la máquina no tiene red, parar y pedírselos al propietario (no inventar un sustituto).

- [ ] **Step 4: Tema por defecto.** `useTheme.ts`: sin valor guardado ni preferencia del sistema → `"dark"`; `theme.tsx`: contexto por defecto `dark`. Prueba en `hooks/useTheme.test.ts` (nuevo): con `localStorage` vacío y `matchMedia` sin preferencia, el tema inicial es `dark`.

- [ ] **Step 5: Ejecutar** `npx vitest run src/styles src/hooks` y `npx tsc --noEmit`; luego `npx vitest run` entero: las pruebas que afirmaban colores concretos del tema antiguo se actualizan al token, no al valor.

- [ ] **Step 6: Commit** — `F2 (1): tokens de la identidad A, Geist autoalojada y oscuro por defecto`.

---

### Task 2: Iconos SVG propios y logotipo

**Filas:** F2-66, F2-67 (iconos cruzados del menú), spec §3.3.

**Files:**
- Modify: `frontend/src/components/Icon.tsx` (los `GLYPHS` de texto pasan a `paths` SVG; misma `IconName` y misma firma `Icon({ name, size = 16, color, style })`)
- Create: `frontend/src/components/shell/Logo.tsx`, `frontend/src/components/Icon.test.tsx`
- Delete: `frontend/src/components/VideoSplash.tsx` (y su uso en `Landing.tsx` queda para la Tarea 5; aquí solo se crea el logotipo)

**Interfaces:**
- Produces: `IconName` conserva todos los nombres actuales y añade `PATIENTS, STUDIES, ORDER, WORKSHOP, PENDING, SHARE, RESUME, OPEN, DELETE, RENAME, UPLOAD, LOGOUT, PASSWORD, MENU, FILTER, EXPORT, PLUS, CLOSE, BACK, CHEVRON_RIGHT, CHEVRON_DOWN, PIN`; `Logo({ compact?: boolean; size?: number })` (compacto = solo la marca «P»).

- [ ] **Step 1: Prueba (falla)**

```tsx
// frontend/src/components/Icon.test.tsx
/* Los iconos son SVG propios (F2): un glifo de texto cambiaba con la fuente y
   «engranaje» ilustraba «Pedidos de clips». Todo nombre usado en el código existe. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "./Icon";

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !f.includes(".test.")) out.push(p);
  }
  return out;
}

describe("Icon", () => {
  it("dibuja un SVG con currentColor, no un carácter", () => {
    const { container } = render(<Icon name="ORDER" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("stroke")).toBe("currentColor");
    expect(container.textContent).toBe("");
  });
  it("todo name=\"…\" e icon=\"…\" del código existe", () => {
    const used = new Set<string>();
    for (const f of walk(join(__dirname, ".."))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:name|icon)=\{?"([A-Z_0-9]+)"\}?/g)) used.add(m[1]);
    }
    expect([...used].filter((n) => !ICON_NAMES.includes(n))).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementar.** `Icon.tsx`: `const PATHS: Record<IconName, string>` con el `d` de cada icono en una rejilla de 16 (trazo 1,5, `fill="none"`, `stroke-linecap="round"`); `export const ICON_NAMES = Object.keys(PATHS)`; el componente devuelve `<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} …><path d={PATHS[name]} /></svg>`. Dibujar los iconos a mano (sin librería): trazos sencillos, reconocibles a 16 px. `Logo.tsx`: marca «P» blanca sobre cuadrado redondeado `--primary` (SVG) y, si no es compacto, «PROSPECTIVE» en `--font-sans` 600 con «por SkullApp» debajo en `--muted-foreground`.

- [ ] **Step 3: Ejecutar** `npx vitest run src/components/Icon.test.tsx` y las suites que renderizan iconos (`npx vitest run` entero); `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `F2 (2): iconos SVG propios y logotipo`.

---

### Task 3: Componentes base rehechos por dentro

**Filas:** F2-63 (campo en rojo antes de escribir: `Input` solo marca `invalid` cuando se le pasa), spec §3.3.

**Files:**
- Modify: `frontend/src/components/Button.tsx`, `Input.tsx` (añade `multiline?: boolean` → `<textarea>`; `hint` bajo el campo; `invalid` solo si se pasa), `Select.tsx`, `Slider.tsx`, `Tabs.tsx`, `Badge.tsx` (variantes `default|success|warning|destructive|muted|brand`; `riskVariant` igual), `Sheet.tsx` (vidrio, `--shadow-lg`, cierre con Escape ya existente), `ConfirmDialog.tsx`, `PanelHead.tsx` (`PanelHead`, `SectionLabel`, `Collapsible`, `ErrorNote`, `Card`), `Metric.tsx`, `LoadState.tsx`, `Separator.tsx`, `ProgressBar.tsx`, `ThemeToggle.tsx` (icono `THEME_LIGHT|THEME_DARK`)
- Test: los `*.test.tsx` existentes de cada componente siguen; se añade `frontend/src/components/Input.test.tsx` (multiline y `invalid` solo explícito) y `Button.test.tsx` (seis variantes renderizan y la `default` lleva `--primary`).

**Interfaces:**
- Produces: mismas firmas; `Input` gana `multiline`; `Badge` gana `brand` y `muted`. Ningún consumidor cambia de código salvo para usar `multiline`.

- [ ] **Step 1: Pruebas (fallan)** — `Input.test.tsx`: `render(<Input label="Notas" multiline />)` produce un `textarea` con el `label` asociado; `render(<Input label="Nombre" />)` no tiene `aria-invalid`; con `invalid` sí. `Button.test.tsx`: cada variante renderiza; `getComputedStyle` no se usa (jsdom): se comprueba el `data-variant` que el botón expone.
- [ ] **Step 2: Implementar** los estilos con los tokens (altura 32/36, anillo de foco 2 px `--ring`, transiciones 120 ms, `--radius-md` en controles, `--radius-lg` en tarjetas y hojas, vidrio en hojas y menús). `Button` expone `data-variant` y `data-size`.
- [ ] **Step 3: Ejecutar** `npx vitest run src/components` y la suite entera; `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — `F2 (3): componentes base con la identidad A`.

---

### Task 4: AppShell — barra lateral de iconos, barra superior, menú de usuario y rutas

**Filas:** F2-20, F2-21, F2-32, F2-42, F2-43, F2-49, F2-50, F2-52, F2-55, F2-56, F2-61, F2-65, F2-66, F2-67, F2-68, F2-69, F2-70, F2-71; fusiones nº 7, 10, 11, 12, 14 y 25; F1-253 del anexo B si aplica al menú; F2-T6 (línea del rol «cuentas pendientes»).

**Files:**
- Create: `frontend/src/components/shell/AppShell.tsx`, `SideNav.tsx`, `TopBar.tsx`, `UserMenu.tsx`, `sections.ts`, `useShellState.ts`, `shell.css`, `AppShell.test.tsx`, `SideNav.test.tsx`, `UserMenu.test.tsx`
- Modify: `frontend/src/store/nav.tsx` (`pending: "/app/cuentas-pendientes"`; `screenFromPath` acepta `/app/solicitudes` como alias y `App.tsx` redirige a la nueva), `frontend/src/App.tsx` (cada pantalla de gestión se envuelve en `<AppShell>`; `AdminOnlyCard` recibe el shell por estar dentro; se quita `LoadingScreen` y `loadingIn`), `frontend/src/components/AdminOnly.tsx` (deja de montar `Topbar`: el shell ya lo pone; conserva «Volver a pacientes»), `frontend/src/lib/roles.ts:19` («cuentas pendientes»), `frontend/src/components/Topbar.tsx` (queda solo para el espacio de trabajo; se eliminan de su menú las entradas de gestión y administración, que ahora viven en la barra lateral — el menú del visor conserva «Pacientes», «Cambiar contraseña», «Cerrar sesión»)
- Delete: `frontend/src/components/LoadingScreen.tsx` y su test
- Test: los nuevos más `pages/AdminOnly.test.tsx` (la tarjeta dentro del shell), `components/Topbar.test.tsx` (menú reducido)

**Interfaces:**
- Produces: `AppShell({ crumbs?: Crumb[]; actions?: ReactNode; children })`; `SECTIONS: { key: Screen; label: string; icon: IconName; group: "clinica" | "admin" }[]` en `sections.ts` (Pacientes, Estudios, Pedidos de clips, Talleres; Usuarios, Cuentas pendientes, Auditoría); `useShellState(): { expanded: boolean; pinned: boolean; setPinned; hoverIn; hoverOut }` con `localStorage` clave `shell.sidebar` (`"pinned" | "collapsed"`); `UserMenu` lee `useAuth().user` y muestra nombre completo, `@usuario · rol`, institución si la hay, línea del rol (`ROLE_PERMITE`), «Cambiar contraseña» (abre `ChangePasswordSheet`), «Cerrar sesión». La insignia de Cuentas pendientes viene de `api.listPending()` cada 60 s, solo para admin.
- Consumes: `Crumb` de `Topbar.tsx` (se mueve a `shell/TopBar.tsx` y `Topbar.tsx` lo reexporta).

- [ ] **Step 1: Pruebas (fallan)**

```tsx
// frontend/src/components/shell/AppShell.test.tsx
/* Shell C (F2): una sola barra lateral para todo; el administrador ve su
   grupo, el médico no; Alt+B pliega y despliega sin robar el foco. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { user: { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" } as { role: string; [k: string]: unknown } | null };
const nav = { screen: "patients", go: vi.fn() };
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: auth.user, logout: vi.fn() }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => nav }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../api/client", () => ({ api: { listPending: vi.fn().mockResolvedValue([{ id: 9 }, { id: 10 }]) } }));

import { AppShell } from "./AppShell";

beforeEach(() => { localStorage.clear(); auth.user = { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" }; });

describe("AppShell", () => {
  it("el administrador ve Administración con la insignia de pendientes", async () => {
    render(<AppShell crumbs={[{ label: "Pacientes" }]}><p>contenido</p></AppShell>);
    expect(screen.getByRole("navigation", { name: "Secciones" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Usuarios/ })).toBeTruthy();
    expect(await screen.findByText("2")).toBeTruthy();           // insignia de Cuentas pendientes
  });
  it("un médico no ve el grupo Administración", () => {
    auth.user = { id: 2, username: "med", full_name: "Dra. Navarro", role: "medico", institution: "" };
    render(<AppShell><p>x</p></AppShell>);
    expect(screen.queryByRole("link", { name: /Usuarios/ })).toBeNull();
    expect(screen.queryByText(/Auditoría/)).toBeNull();
  });
  it("Alt+B despliega y pliega sin tocar el campo con foco", () => {
    render(<AppShell><input aria-label="campo" /></AppShell>);
    const campo = screen.getByLabelText("campo") as HTMLInputElement;
    campo.focus();
    fireEvent.keyDown(document, { key: "b", altKey: true });
    expect(screen.getByRole("navigation", { name: "Secciones" }).getAttribute("data-expanded")).toBe("true");
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe("");
    fireEvent.keyDown(document, { key: "b", altKey: true });
    expect(screen.getByRole("navigation", { name: "Secciones" }).getAttribute("data-expanded")).toBe("false");
  });
  it("la miga solo lleva lo que existe y las acciones del contexto", () => {
    render(<AppShell crumbs={[{ label: "Pacientes", onClick: () => {} }, { label: "segura, Juan" }]} actions={<button>Nuevo caso</button>}><p>x</p></AppShell>);
    expect(screen.getByText("segura, Juan")).toBeTruthy();
    expect(screen.queryByText("Administración")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuevo caso" })).toBeTruthy();
  });
});
```

`UserMenu.test.tsx`: nombre completo, `@admin · Administrador`, la línea del rol de `ROLE_PERMITE`, institución solo si no está vacía, «Cambiar contraseña» y «Cerrar sesión». `SideNav.test.tsx`: la sección activa lleva `aria-current="page"`; al pasar el ratón 150 ms se expande; fijar con el botón de chincheta guarda `shell.sidebar = "pinned"`.

- [ ] **Step 2: Implementar** `AppShell` (grid `40px 1fr` / `220px 1fr` cuando expandida; `TopBar` de 48 px en vidrio con `crumbs` y `actions`; `main` con `--canvas`), `SideNav` (`<nav aria-label="Secciones" data-expanded>`; `Logo compact` arriba; enlaces `<a href={SCREEN_PATH[key]}>` con `onClick` → `nav.go(key)`; grupo Administración solo con `role === "admin"`; abajo `ThemeToggle` y el avatar que abre `UserMenu`), `useShellState` (hover con temporizador de 150 ms; `Alt+B` escuchado en `document` con `keydown`, ignorado si `location.pathname === SCREEN_PATH.workspace`; `preventDefault` para que la tecla no llegue al campo), `UserMenu` (vidrio, `role="menu"`). En `App.tsx` cada `view` de gestión se envuelve: `<AppShell crumbs={…} actions={…}>` con la miga declarada por la pantalla (las pantallas exponen `crumbs`/`actions` por props que `App.tsx` pasa al shell, o renderizan el shell ellas mismas — elegir una y aplicarla a todas; recomendado: cada página devuelve `<AppShell crumbs=… actions=…>…</AppShell>` para que la acción viva junto a su estado). Redirección `/app/solicitudes` → `/app/cuentas-pendientes`.

- [ ] **Step 3: Ejecutar** `npx vitest run src/components/shell src/pages/AdminOnly.test.tsx src/components/Topbar.test.tsx`, suite entera, `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `F2 (4): AppShell con barra lateral de iconos, barra superior y menú de usuario`.

---

### Task 5: Portada

**Filas:** F2-1…F2-9; anexo B: F1-35, F1-36, F1-37, F1-38 y el resto de filas «Landing» del anexo B; fusiones nº 1, 2, 3, 4; F2-T2.

**Files:**
- Modify: `frontend/src/pages/Landing.tsx` (sin `VideoSplash`; marca `Logo`; un solo lema literal del anexo; «Entrar» y «Crear cuenta»; «Ver cómo funciona»; «Sin instalar nada» una vez; sin librerías en «Tecnología»; umbrales con coma y nombres en español en «Índices», citados de `thresholds.ts`; «Qué es» sin glosario de divulgación; contacto desde `CONTACTO_ADMIN`), `frontend/src/components/landing/*` (lo que use fuentes o colores propios pasa a tokens)
- Delete: `frontend/src/components/VideoSplash.tsx`, `frontend/src/assets/video/*marca*` si solo lo usaba la portada
- Test: `frontend/src/pages/Landing.test.tsx` (textos literales: sin «pipeline», sin «Neurovascular AI», sin «Suite clínica activa», «Entrar» único, coma decimal en «≥ 2,0», sin «VTK»)

- [ ] **Step 1–3:** pruebas con los textos literales del anexo, implementación, commit — `F2 (5): portada con la identidad nueva`.

---

### Task 6: Entrar y Crear cuenta

**Filas:** F2-10…F2-17; anexo B: filas «Entrar» y «Crear cuenta»; fusiones nº 5 y 6; F2-T4.

**Files:**
- Modify: `frontend/src/pages/Login.tsx` (panel de marca con `Logo`, sin «VTK · SimpleITK»; línea literal del anexo sobre la aprobación: no se notifica, vuelve a intentar entrar), `frontend/src/pages/Signup.tsx` («Volver a Entrar»; «DNI / NIE (opcional)», «Número de colegiado (opcional)», «ORCID (opcional)» con ayuda «Identificador de investigador, si lo tienes» y marcador `0000-0000-0000-0000`; «Repite la contraseña»; validación junto al campo con `invalid` + `hint`), `frontend/src/App.tsx` (ya sin `LoadingScreen`, Tarea 4)
- Test: `Login.test.tsx`, `Signup.test.tsx` (textos literales; el error de un campo aparece junto a él)

- [ ] **Step 1–3:** commit — `F2 (6): entrar y crear cuenta`.

---

### Task 7: Servidor — compartir por paciente

**Filas:** F2-75; anexo B: filas de «Usuario no administrador» si las hay; spec §6.1.

**Files:**
- Modify: `backend/services/db_models.py` (clase `PatientShare`: `__tablename__ = "patient_shares"`, `id`, `patient_id` FK `patients.id` `ondelete="CASCADE"`, `user_id` FK `users.id` `ondelete="CASCADE"`, `shared_by` FK `users.id`, `created_at`; `UniqueConstraint("patient_id", "user_id")`), `backend/services/access.py` (`can_access_patient`: creador, compartido o admin; `own_patient_ids`: `union` de creados y compartidos; nueva `can_share_patient(db, user, patient_id)` = creador o admin), `backend/routers/patients.py` (rutas `GET /{patient_id}/shares` y `PUT /{patient_id}/shares`; `PatientSummary` gana `owner_id: int | None`, `shared_with_count: int`, `is_shared_with_me: bool`), `backend/routers/auth.py` (`GET /users/brief` para cualquier sesión: `id, username, full_name, role` de cuentas activas), `backend/models/patient.py` (`PatientShareOut {user_id, username, full_name, role, shared_at}`, `PatientSharesIn {user_ids: list[int]}`), `backend/models/auth.py` (`UserBrief`), `backend/services/audit.py` o `routers/audit.py` (acción `PATIENT_SHARED` con `{patient_id, user_ids}`)
- Create: `backend/migrations/versions/<rev>_patient_shares.py` (con `python -m services.database revision "tabla patient_shares"` y luego editar `upgrade`/`downgrade`), `backend/test_patient_shares.py`
- Test: `backend/test_patient_shares.py`, `backend/test_access_control.py` (ampliar: el compartido ve la ficha, los estudios, las sesiones y los pedidos del paciente; un tercero no), `backend/test_migrations.py` (ya cubre que la base de la suite esté en la última revisión), `backend/test_auth_coverage.py`

**Interfaces:**
- Produces: `GET /api/patients/{id}/shares → list[PatientShareOut]`; `PUT /api/patients/{id}/shares` body `{"user_ids": [..]}` → `list[PatientShareOut]` (sustituye la lista entera; ignora al creador y al propio administrador si vienen); `GET /api/auth/users/brief → list[UserBrief]`; `PatientSummary.owner_id | shared_with_count | is_shared_with_me`.

- [ ] **Step 1: Prueba (falla)**

```python
# backend/test_patient_shares.py
"""Compartir por paciente (F2): quien creó al paciente, o un administrador, elige
con qué cuentas lo comparte; el compartido lo ve pero no lo comparte; un tercero
sigue sin verlo. Patrón de clientes con rol de test_access_control.py."""
# Mismo patrón que test_access_control.py: `_medico()` crea una cuenta «medico»
# con uuid y devuelve (id, TestClient con Bearer); `admin` es el TestClient del
# administrador de la suite; `anonymous_client(app)` el cliente sin sesión.
import uuid
from main import app
from services.database import SessionLocal
from services.db_models import Patient
from test_access_control import _medico, admin, anonymous_client


def _paciente_de(uid: int) -> int:
    db = SessionLocal()
    p = Patient(surname="Compartido", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def test_el_creador_comparte_y_el_compartido_ve_pero_no_comparte():
    a_id, a = _medico(); b_id, b = _medico(); c_id, c = _medico()
    pid = _paciente_de(a_id)
    r = a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]})
    assert r.status_code == 200 and [s["user_id"] for s in r.json()] == [b_id]
    assert b.get(f"/api/patients/{pid}").status_code == 200
    assert c.get(f"/api/patients/{pid}").status_code == 403
    r = b.put(f"/api/patients/{pid}/shares", json={"user_ids": [c_id]})
    assert r.status_code == 403
    assert "creó al paciente" in r.json()["detail"]


def test_la_lista_de_pacientes_marca_lo_compartido():
    a_id, a = _medico(); b_id, b = _medico()
    pid = _paciente_de(a_id)
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]})
    mine = next(p for p in a.get("/api/patients").json() if p["id"] == pid)
    theirs = next(p for p in b.get("/api/patients").json() if p["id"] == pid)
    assert mine["shared_with_count"] == 1 and mine["is_shared_with_me"] is False
    assert theirs["is_shared_with_me"] is True and theirs["owner_id"] == a_id


def test_quitar_de_la_lista_quita_el_acceso_y_el_admin_siempre_puede():
    a_id, a = _medico(); b_id, b = _medico()
    pid = _paciente_de(a_id)
    assert admin.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]}).status_code == 200
    assert b.get(f"/api/patients/{pid}/sessions").status_code == 200
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": []})
    assert b.get(f"/api/patients/{pid}").status_code == 403


def test_anonimo_y_cuentas_breves():
    assert anonymous_client(app).get("/api/patients/1/shares").status_code == 401
    _id, m = _medico()
    r = m.get("/api/auth/users/brief")
    assert r.status_code == 200 and {"id", "username", "full_name", "role"} <= set(r.json()[0])
```

- [ ] **Step 2: Ejecutar** `cd backend && .venv/Scripts/python -m pytest test_patient_shares.py -q` → falla (404 en las rutas).
- [ ] **Step 3: Implementar** modelo, migración, `access.py`, rutas y modelos; `PatientSummary` ampliado en `GET /api/patients` (una consulta agrupada para `shared_with_count`, no una por paciente). Regenerar el contrato.
- [ ] **Step 4: Ejecutar** `test_patient_shares.py`, `test_access_control.py`, `test_migrations.py`, `test_auth_coverage.py`, `test_openapi_contract.py` (cada uno en su proceso).
- [ ] **Step 5: Commit** — `F2 (7): compartir pacientes con otras cuentas`.

---

### Task 8: Servidor — guardados: renombrar, borrar y tamaño

**Filas:** F2-73, F2-74 (parte servidor), anexo B: filas de «Guardar y reanudar» dejadas para F2; spec §6.2.

**Files:**
- Modify: `backend/routers/session_state.py` (rutas `PATCH /api/sessions/saved/{session_id}` body `{label}` y `DELETE /api/sessions/saved/{session_id}`), `backend/routers/patients.py:443` (`GET /{patient_id}/sessions` devuelve `size_bytes`), `backend/models/session_state.py` o `models/patient.py` (`SavedSessionRenameIn {label: str}`; `PatientSessionItem.size_bytes: int`), `backend/services/sessions.py` (`saved_session_size(session_id) -> int`, `delete_saved_session` también borra el `.reapuntada` y toda carpeta cuyo `.reapuntada` apunte a él), `backend/services/db_models.py` (`PlanningSession.size_bytes` nullable, cacheado al guardar; migración)
- Create: `backend/migrations/versions/<rev>_planning_sessions_size.py`, `backend/test_saved_sessions_manage.py`
- Test: `backend/test_saved_sessions_manage.py`, `backend/test_auth_coverage.py`, `backend/test_openapi_contract.py`

**Interfaces:**
- Produces: `PATCH /api/sessions/saved/{id}` → `SessionListItem`; `DELETE /api/sessions/saved/{id}` → 204; 409 `{"detail": "Esta sesión guardada es el origen de una sesión abierta: ciérrala antes de borrarla."}` cuando `origin.saved_session_id` de alguna sesión viva del mismo usuario apunta a ella; 403 si el paciente no es visible; `PatientSessionItem.size_bytes`.

- [ ] **Step 1: Prueba (falla)** — `test_saved_sessions_manage.py`: (a) renombrar cambia `label` y la lista del paciente lo devuelve; (b) borrar elimina la fila, la carpeta `data/session_saves/<id>` y el `<id>.reapuntada`, y la lista ya no lo trae; (c) borrar el origen de una sesión viva (crear sesión, guardar, reanudar → vivo con `origin.saved_session_id`) → 409 y nada borrado; (d) `size_bytes > 0` tras guardar y coincide con la suma de ficheros de la carpeta; (e) un Médico sin acceso al paciente → 403; anónimo → 401. Usar `create_session`, `write_state`, el `POST /api/sessions` de guardar y el `POST /api/sessions/{id}/restore` existentes (ver `test_session_restore_state.py`).
- [ ] **Step 2–4:** implementar, regenerar contrato, ejecutar los cuatro ficheros, commit — `F2 (8): guardados con nombre editable, borrado y tamaño`.

---

### Task 9: Servidor — auditoría por paciente, exportación en español y borrar cuenta con reasignación

**Filas:** F2-46, F2-58, F2-59, F2-60 (parte servidor); spec §6.3 y §6.4.

**Files:**
- Modify: `backend/routers/audit.py` (`GET /blocks?patient_id=` calcula `sha256(str(patient.id) + patient.dob)` con el paciente leído de la base — exactamente como `SkullChain.append` en `services/audit.py:121-123` — y filtra por `patient_hash`; `GET /export` con cabecera «Registro de auditoría de PROSPECTIVE Web — exportado el {fecha} por {usuario}» y columnas en español), `backend/services/audit.py` (`get_blocks(patient_hash: str | None)`), `backend/routers/auth.py:487` (`DELETE /users/{user_id}?reassign_to=` traspasa `Patient.created_by` y `PatientShare.shared_by`; sin parámetro, al administrador que borra; 400 si `reassign_to` no existe o es el propio borrado; bloque `USER_DELETED {deleted, reassigned_to, patients}`)
- Create: `backend/test_audit_patient_filter.py`, `backend/test_users_delete_reassign.py`
- Test: los dos nuevos, `test_auth_coverage.py`, `test_openapi_contract.py`

**Interfaces:**
- Produces: `GET /api/audit/blocks?patient_id=<int>`; `DELETE /api/auth/users/{id}?reassign_to=<int>`.

- [ ] **Step 1: Pruebas (fallan)** — auditoría: dos bloques con `patient_id`/`patient_dob` de dos pacientes distintos, `?patient_id=` devuelve solo los suyos, sin parámetro todos; `export` contiene «Registro de auditoría» y no «SkullChain Audit Trail Export»; un paciente inexistente → 404. Borrar cuenta: crear médico con dos pacientes, borrarlo con `reassign_to` de otro médico → los pacientes pasan a él y el otro médico los lista; sin `reassign_to` → al administrador; ningún paciente queda con `created_by` nulo; `reassign_to` igual al borrado → 400.
- [ ] **Step 2–4:** implementar, contrato, ejecutar, commit — `F2 (9): auditoría por paciente y borrar cuenta reasignando sus pacientes`.

---

### Task 10: Pacientes

**Filas:** F2-18, F2-19, F2-22, F2-23, F2-24; anexo B: filas «Pacientes» (F1-53/54/55 ya hechas en F1a: no repetir); fusión nº 8; spec §5 «Pacientes».

**Files:**
- Modify: `frontend/src/pages/Patients.tsx` (cabecera `PanelHead` con «Pacientes» y «N paciente(s)» con concordancia; búsqueda `Input` junto a la tabla; orden por última actividad: `max(last_session_at, created_at)`; `PatientSummary` no trae hoy nada de eso (`backend/models/patient.py:42-49`), así que `GET /api/patients` añade `last_session_at`, `last_session_step` y `last_case_label` con una consulta agrupada sobre `planning_sessions` y `studies` (no una consulta por paciente) y se regenera el contrato; columnas «Paciente · HC · Edad · Institución · Último caso · Última sesión · Acciones» con `patientAge` (`components/patientAge.ts`), «Último caso» = diagnóstico del caso más reciente, «Última sesión» = paso y fecha local (`lib/fecha.ts`), acciones «Reanudar» (si hay sesión) y «Abrir ficha»; clic en la fila abre la ficha; insignia `Badge brand` «Compartido» si `is_shared_with_me`, «Compartido con N» si `shared_with_count`; contadores «Pacientes», «Casos», «Con caso», «Sin caso»; «Nuevo paciente» al guardar ofrece «Crear un caso para {nombre}» que abre `NuevoCaso` con el paciente fijado; sin botones «Usuarios» ni «Solicitudes»; acciones del shell: «Nuevo paciente», «Nuevo caso», «Empezar sin paciente»), `frontend/src/api/types.ts` (`PatientSummary` con `owner_id`, `shared_with_count`, `is_shared_with_me`, `last_session_at`, `last_session_step`, `last_case_label`), `frontend/src/api/client.ts`
- Test: `Patients.test.tsx` (concordancia, orden, columnas, «Reanudar» y «Abrir ficha», insignias, sin «Usuarios»)

- [ ] **Step 1–3:** pruebas, implementación (contrato si el backend cambia), commit — `F2 (10): lista de pacientes`.

---

### Task 11: Ficha del paciente — compartir, guardados y entrada al paso 1

**Filas:** F2-25, F2-26, F2-27, F2-28, F2-29, F2-30, F2-31, F2-72, F2-73, F2-74; anexo B: filas «Ficha del paciente»; fusión nº 9; F2-T1, F2-T5; spec §5 «Ficha».

**Files:**
- Modify: `frontend/src/pages/Patients.tsx` (`PatientSheet` → extraer a `frontend/src/pages/PatientSheet.tsx`, ~400 líneas hoy dentro de `Patients.tsx`): título con el nombre y rótulo «Ficha de paciente» («Paciente no autorizado» con 403); edad junto a la fecha; `Input multiline` en «Notas»; «Guardar cambios» fijo al pie del bloque de datos; «Planificar este caso» como acción principal arriba (caso más reciente; selector si hay varios); «Subir DICOM de este paciente» → `onPlanCase` con el caso y paso 1; «Pedidos» navega con `returnTo` y `ClipOrdersPage` muestra «← Volver a la ficha»; «Nuevo caso» (no «Nuevo estudio»), «Editar caso»; sección «Compartido con» (lista de cuentas; botón «Compartir con…» solo si `owner_id === user.id || role === "admin"`; hoja con `api.usersBrief()` filtrado por nombre y casillas; guarda con `api.setPatientShares`); guardados: una fila por sesión con nombre editable en línea (lápiz → `Input` → Enter guarda con `api.renameSavedSession`), fecha y hora local, paso, tamaño («342 MB» con `lib/tamano.ts` nuevo: `formatBytes`), «Reanudar» y «Borrar» (confirmación con el nombre; el 409 se muestra literal bajo la fila)
- Create: `frontend/src/pages/PatientSheet.tsx`, `frontend/src/pages/PatientSheet.test.tsx`, `frontend/src/components/ShareSheet.tsx` + test, `frontend/src/lib/tamano.ts` + test
- Modify: `frontend/src/api/client.ts` (`patientShares`, `setPatientShares`, `usersBrief`, `renameSavedSession`, `deleteSavedSession`), `frontend/src/api/types.ts`, `frontend/src/App.tsx` (`returnTo` de pedidos)
- Test: `PatientSheet.test.tsx` (título, edad, notas multilinea, compartir visible solo para creador/admin, renombrar, borrar con 409 literal, «Subir DICOM»), `ShareSheet.test.tsx`, `Patients.test.tsx` (ajustes)

- [ ] **Step 1–3:** commit — `F2 (11): ficha del paciente con compartir, guardados y subida de DICOM`.

---

### Task 12: Nuevo caso

**Filas:** F2-36…F2-41; anexo B: filas «Nuevo caso»; spec §5 «Nuevo caso».

**Files:**
- Modify: `frontend/src/pages/NuevoCaso.tsx` («Diagnóstico *» con marcador «Aneurisma basilar sacular» y ayuda «Da nombre al caso en toda la aplicación»; «Clínica»; «Morfología» (Sacular, Fusiforme, Disecante, Blíster) y «Tamaño» (Pequeño < 10 mm, Grande 10–25 mm, Gigante > 25 mm) en dos `Select`; se guardan en la columna existente `tipo_aneurisma` como «{Morfología} · {Tamaño}» (sin migración; al cargar, el formulario los separa por « · » y un valor antiguo de una sola palabra cae en el campo que le corresponde); «Imágenes diagnósticas» con TAC, Angiografía por catéter, Resonancia y la nota «El DICOM se sube en el paso 1 al abrir el caso»; error junto al campo; al guardar, «Planificar este caso» o «Volver a la lista»; «Nuevo paciente» desde aquí vuelve al caso con el paciente elegido)
- Test: `NuevoCaso.test.tsx`

- [ ] **Step 1–3:** commit — `F2 (12): formulario de caso`.

---

### Task 13: Estudios

**Filas:** F2-33, F2-34, F2-35; anexo B: filas «Estudios»; fusión nº 10 (ya por el shell).

**Files:**
- Modify: `frontend/src/pages/Studies.tsx` (búsqueda «Buscar por paciente, HC o diagnóstico…»; tarjeta con «Abrir ficha» y «Borrar estudio» con confirmación — `DELETE /api/patients/{pid}/studies/{sid}` ya existe en `routers/patients.py:325` —; «Nueva sesión» con ayuda «La sesión anterior se conserva en la ficha»), `Studies.test.tsx`

- [ ] **Step 1–3:** commit — `F2 (13): estudios`.

---

### Task 14: Pedidos de clips y Talleres

**Filas:** F2-53, F2-54, F2-62, F2-63, F2-64; anexo B: filas «Pedidos de clips» y «Talleres»; fusión nº 13.

**Files:**
- Modify: `frontend/src/pages/ClipOrders.tsx` (dentro del shell; miga «Pacientes / segura, Juan / Pedidos» con «← Volver a la ficha» cuando llega filtrado; vacío «No hay pedidos todavía. Los pedidos se crean en el paso Fabricación de un caso.» cuando no hay ninguno y «Ningún pedido encaja con este filtro.» cuando hay pero no coinciden; detalle con enlace «Abrir el caso» → reanudar la sesión que creó el pedido si existe), `frontend/src/pages/Workshops.tsx` (campo «Nombre» sin `invalid` hasta enviar; aviso de la copia solo en «Cómo se usa»), `ClipOrders.test.tsx`, `Workshops.test.tsx`

- [ ] **Step 1–3:** commit — `F2 (14): pedidos de clips y talleres`.

---

### Task 15: Usuarios y Cuentas pendientes

**Filas:** F2-44, F2-45, F2-46, F2-47, F2-48, F2-51; anexo B: filas «Usuarios» y «Solicitudes»; F2-T3, F2-T6; spec §5.

**Files:**
- Modify: `frontend/src/pages/UsersAdmin.tsx` (insignia de rol `Badge muted`; «Editar usuario» con todos los campos del alta; alta corta: nombre, usuario, rol, contraseña, y un `Collapsible` «Más datos (opcional)» con el resto sin preselección; validación junto al campo; «Eliminar usuario» con `Select` «Reasignar sus pacientes a…» (por defecto «A mí») → `api.deleteUser(id, reassignTo)`), `frontend/src/pages/PendingRequests.tsx` («No hay cuentas pendientes.»; pestañas «Pendientes · Aprobadas · Rechazadas»: hoy `reject_user` (`services/auth_service.py`) solo desactiva la cuenta, igual que una desactivación manual, así que el backend añade `User.rejected_at` (nullable, migración `<rev>_users_rejected_at.py`) que `reject` rellena, y `GET /api/auth/users?status=pending|approved|rejected` filtra; `UserAdminInfo` devuelve `rejected_at` y la pestaña «Rechazadas» lo muestra con fecha local), `backend/services/db_models.py`, `backend/services/auth_service.py`, `backend/routers/auth.py`, `frontend/src/api/client.ts`, `UsersAdmin.test.tsx`, `PendingRequests.test.tsx`
- Create: `backend/migrations/versions/<rev>_users_rejected_at.py`, `backend/test_pending_history.py` (rechazar marca `rejected_at` y aprobar no; `?status=` devuelve lo suyo; anónimo 401)
- Test: los anteriores más `test_auth_coverage.py` y `test_openapi_contract.py`

- [ ] **Step 1–3:** pruebas, implementación, contrato, commit — `F2 (15): usuarios y cuentas pendientes`.

---

### Task 16: Auditoría

**Filas:** F2-57, F2-58, F2-59, F2-60; anexo B: filas «Auditoría»; spec §5 «Auditoría».

**Files:**
- Modify: `frontend/src/pages/AuditTrail.tsx` (título «Registro de auditoría» y subtítulo «Cadena de bloques con firma; alterar un bloque invalida todos los siguientes.»; filtro por paciente con `Select` de `api.listPatients()` → `api.auditBlocks({ patientId })`; filas desplegables con el detalle (`payload_json` formateado como lista clave · valor) y el hash dentro del detalle; columnas «Fecha · Usuario · Acción · Paciente»; «Exportar» siempre visible), `frontend/src/api/client.ts`, `AuditTrail.test.tsx`

- [ ] **Step 1–3:** commit — `F2 (16): registro de auditoría`.

---

### Task 17: Limpieza, README y guarda de copia

**Filas:** F2-T6 (guarda); spec §3.2, §7.

**Files:**
- Delete: fuentes antiguas y sus `@font-face` (si quedó alguna), `VideoSplash.tsx`, `LoadingScreen.tsx`, `landing.css` (lo que quede se funde en `index.css`), `components/landing/*` sin uso
- Modify: `frontend/src/copy.glosario.test.ts` (rastrea también `components/shell/`, `components/` y `lib/`), `frontend/src/styles/tokens.test.ts` (activar la prueba de colores literales), `README.md` (secciones de identidad, shell, compartir, guardados, auditoría, y la tabla de rutas), `frontend/src/lib/roles.ts`
- Test: suite entera

- [ ] **Step 1–3:** commit — `F2 (17): limpieza y README`.

---

### Task 18: Cierre — suites, contrato y lista manual

**Files:**
- Modify: `docs/superpowers/audits/2026-10-13-lista-manual-f2.md` (nuevo: la lista de la spec §7 con una fila por comprobación y su resultado)

- [ ] **Step 1:** `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`.
- [ ] **Step 2:** backend, cada fichero en su proceso: todos los `test_*.py` tocados en la rama (`git diff --name-only dc24260..HEAD -- 'backend/test_*.py'`) más `test_access_control.py`, `test_auth_coverage.py`, `test_migrations.py`, `test_openapi_contract.py`.
- [ ] **Step 3:** contrato regenerado y sin diff pendiente.
- [ ] **Step 4:** lista manual de la spec §7 sobre Case 3 con los servidores del propietario (pedirle que los levante): entrar como `admin` sin pantalla de carga; Pacientes; ficha con guardados (renombrar, borrar uno viejo, tamaño); compartir con `auditora` y comprobar como `auditora` (contraseña `Auditora2027!`) que lo ve y no puede compartirlo; Pedidos con vuelta; Usuarios, Cuentas pendientes, Auditoría con filtro por paciente y detalle; tema claro; espacio de trabajo con colores nuevos y carril intacto. Resultados en el fichero.
- [ ] **Step 5: Commit** — `F2 (18): cierre con suites y lista manual` y menú de cierre (finishing-a-development-branch).
