# Cristal D · Fase 5 (entrada: Entrar, Crear cuenta, cambio de contraseña y carga) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vestir con el material D las pantallas públicas y la transición de carga, conservando `intro.mp4` y `loading.mp4` y todo el comportamiento probado.

**Architecture:** `AuthBrand` (panel de vídeo) se queda con su vídeo y su velo, y gana el lema secundario; el formulario de `Login`, `Signup` y `ForcePasswordChange` pasa a una ventana de cristal denso sobre el `Entorno`; un componente compartido `AuthWindow` da esa ventana para no repetirla. `LoadingScreen` conserva vídeo, duración y fundido, con la marca y la barra en una pastilla de cristal; al terminar, la oficina entra con `glide`.

**Tech Stack:** React 19, `motion` 12 vía `src/motion`, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §5.7, §9 fase 5. Tablero: `docs/superpowers/specs/assets/2026-10-31-cristal-d/D-Entrar.dc.html`.

## Global Constraints

- Ficheros de vídeo sin cambios: `public/media/intro.mp4` (Entrar y Crear cuenta, en bucle, silenciado, autoplay) y `public/media/loading.mp4` (carga). `SHOW_MS = 2200` y `FADE_MS = 450` no cambian.
- Lema exacto «Planificación neurovascular con datos»; frase secundaria exacta «Del DICOM al clip, en un solo espacio de trabajo.».
- Todos los textos que prueban `Login.test.tsx`, `Signup.test.tsx`, `ForcePasswordChange.test.tsx`, `LoadingScreen.test.tsx` y `AuthBrand.test.tsx` se mantienen.
- Material de la fase 1 (`glass("dense")`, `data-glass`, `Input`, `Button`, `glide`), `Entorno` de la fase 1.
- Commits por lista explícita; nunca `git add -A`.
- Con `prefers-reduced-motion`: sin escala ni desplazamiento en las entradas, solo opacidad.

## Review Focus

1. Pantalla estrecha (≤ 820 px): el panel de vídeo se oculta como hoy (`login-media` en `responsive.css`) y la ventana del formulario ocupa el ancho con márgenes de 16 px (test en la tarea 2).
2. Error de credenciales: el campo de contraseña sigue con `aria-invalid` y el mensaje es legible sobre el cristal (≥ 4,5:1 por los tokens de la fase 1) (tests existentes de `Login.test.tsx`).
3. Tema claro: la ventana del formulario es blanca esmerilada y el panel de vídeo sigue con texto blanco (tests existentes de `AuthBrand.test.tsx`).
4. `ForcePasswordChange` sin vídeo: usa la misma ventana sobre el `Entorno` (test en la tarea 3).
5. La carga se desmonta antes de tiempo: no llama a `onDone` (test existente).

---

### Task 1: `AuthWindow` y panel de marca D

**Files:**
- Create: `frontend/src/components/shell/AuthWindow.tsx`, `AuthWindow.test.tsx`
- Modify: `frontend/src/components/shell/AuthBrand.tsx`, `AuthBrand.test.tsx`

**Interfaces:**
- Produces: `AuthWindow({ titulo, subtitulo, children, pie }: { titulo: string; subtitulo?: string; children: ReactNode; pie?: ReactNode })` — `section` con `aria-labelledby` al título, ancho 440 (máx. `calc(100vw - 32px)`), `glass("dense")` + `data-glass`, radio `--radius-xl`, padding 40, título 26/600 (`--text-window`), subtítulo en `--muted-foreground`, entrada `glide` (solo opacidad con movimiento reducido).
- Produces en `AuthBrand`: mismo vídeo y velo; bajo el lema, la frase secundaria «Del DICOM al clip, en un solo espacio de trabajo.» en `--on-media-muted`; el rótulo superior «PROSPECTIVE» en mono con `--tracking-eyebrow`.

- [ ] **Step 1: Tests.** `AuthWindow.test.tsx`: el `section` se nombra por su título y tiene `data-glass`. `AuthBrand.test.tsx`: aparece «Del DICOM al clip, en un solo espacio de trabajo.»; los casos existentes siguen.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Entrada D: ventana de cristal compartida y panel de marca».

### Task 2: Entrar y Crear cuenta sobre el `Entorno`

**Files:**
- Modify: `frontend/src/pages/Login.tsx`, `Login.test.tsx`, `frontend/src/pages/Signup.tsx`, `Signup.test.tsx`, `frontend/src/styles/responsive.css` (si hace falta el ancho a ≤ 820)

**Interfaces:**
- Consumes: `AuthWindow`, `AuthBrand`, `Entorno`.
- Produces: disposición en dos zonas a > 820 px: `AuthBrand` a la izquierda (como hoy) y, a la derecha, el `Entorno` con `AuthWindow` centrada (título «Iniciar sesión», subtítulo «Accede con tu cuenta de Prospective.»; en Signup el título actual). Campos con el `Input` de la fase 1; «Entrar» botón primario de ancho completo y alto `--control-md`; el resto (enlace «Crear cuenta», aviso del administrador, avisos de bloqueo y de aprobación) dentro de la ventana con sus textos actuales. A ≤ 820 px solo la ventana sobre el `Entorno`.

- [ ] **Step 1: Tests.** `Login.test.tsx`: el formulario está dentro de una región «Iniciar sesión» con `data-glass`; los casos existentes siguen. `Signup.test.tsx`: el formulario está dentro de una región con `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Entrada D: Entrar y Crear cuenta en ventana de cristal».

### Task 3: Cambio de contraseña obligatorio y pantalla de carga

**Files:**
- Modify: `frontend/src/components/ForcePasswordChange.tsx`, `ForcePasswordChange.test.tsx`, `frontend/src/components/LoadingScreen.tsx`, `LoadingScreen.test.tsx`, `frontend/src/App.tsx` (la entrada de la oficina tras la carga)

**Interfaces:**
- Produces: `ForcePasswordChange` dentro de `<Entorno>` con su contenido en `AuthWindow` (textos actuales). `LoadingScreen`: vídeo y velo iguales; logotipo, «PROSPECTIVE», barra indeterminada y el texto en una pastilla `glass("dense")` + `data-glass` centrada (radio `--radius-full` para la barra, `--radius-xl` para la pastilla). En `App.tsx`, cuando `loadingIn` pasa a `false`, el contenido de la oficina entra con `glide` una vez (envolver en `motion.div` con `key` estable; sin animación con movimiento reducido).

- [ ] **Step 1: Tests.** `ForcePasswordChange.test.tsx`: el formulario está dentro de un elemento con `data-glass` y hay un `img` del `Entorno` en tema oscuro. `LoadingScreen.test.tsx`: la pastilla con el texto «Preparando el espacio de trabajo…» tiene `data-glass`; los casos existentes siguen.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Entrada D: cambio de contraseña y carga en cristal».

### Task 4: Cierre de la fase

- [ ] **Step 1:** `npx vitest run` completo y `npx tsc -b` verdes.
- [ ] **Step 2:** Nota «Fase 5 completada el …» en §9 del documento de diseño.
- [ ] **Step 3: Commit** — «Diseño: fase 5 del cristal D completada».
