> **SUSTITUIDO (31-10-2026):** este plan pertenece a la dirección A y no se ejecuta. Lo reemplazan los planes del documento `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` (dirección D, «Quirófano de cristal»).

# Rediseño visual · Fase 4 (entrada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Entrar y la pantalla de carga sean «espectaculares» sin cambiar los vídeos ni los textos: fundido desde negro, viñeta que se abre y lema que se compone palabra a palabra en el panel de marca; sacudida corta y botón «comprobando» con barra interna en el formulario; precarga del vídeo de carga durante Entrar y desvelado circular hacia el panel al terminar.

**Architecture:** Todo es presentación aditiva sobre `components/shell/AuthBrand.tsx`, `pages/Login.tsx`, `components/Button.tsx` y `components/LoadingScreen.tsx`. Las animaciones de entrada son CSS (keyframes con `--dur-*`/`--ease-out`) o `motion` donde hay secuencia (lema); todas respetan `prefers-reduced-motion` (regla global de `base.css` + `useReducedMotion`). Los ficheros `intro.mp4` y `loading.mp4` no se tocan (§5.3).

**Tech Stack:** React 19, Vite 7, TypeScript 5.8, vitest + Testing Library, `motion` 12 (barrel `frontend/src/motion`), CSS plano con tokens.

**Spec:** `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§4.6, §4.7, §5.3).

## Global Constraints

- `public/media/intro.mp4` y `loading.mp4` sin cambios; `VIDEO_MARCA`, `VIDEO_SRC`, `LEMA` conservan nombre y valor.
- Textos fijados por tests intactos: «Planificación neurovascular con datos» (una sola vez en el DOM: si se parte en palabras, los `span` van dentro de un único contenedor cuyo `textContent` es el lema exacto), «Iniciar sesión», «Usuario», «Contraseña», «Entrar», «Verificando…», «Crear cuenta», «Preparando el espacio de trabajo…», «PROSPECTIVE», los avisos de F1-40/41/42/43 y F2-10/11.
- Duraciones por token/`DUR`; curva `EASE`; con movimiento reducido solo queda la opacidad (y el lema aparece entero).
- Sin colores literales nuevos en TSX; los tokens de medios existentes (`--media-bg`, `--on-media`, `--media-vignette`, `--media-track`, `--primary`) se reutilizan.
- Suite completa verde; `npx tsc -b` limpio; commits por lista; comentarios en castellano.

## Review Focus

1. **Movimiento reducido:** el lema debe estar completo desde el primer fotograma y el vídeo visible sin fundido; test en T1.
2. **Error de credenciales repetido:** la sacudida tiene que volver a dispararse en el segundo fallo (reinicio de la animación), no solo en el primero; test en T2.
3. **`onDone` de la pantalla de carga:** el desvelado circular no cambia el momento en que se llama `onDone` respecto a hoy (`SHOW_MS + FADE_MS`); test existente «dura lo mismo que antes de F2» se mantiene o se actualiza con la nueva constante en la misma tarea.
4. **Precarga del vídeo:** no debe descargarse dos veces ni reproducirse en Entrar; el elemento de precarga va oculto, `muted`, sin `autoplay`; test en T3.
5. **Botón «comprobando»:** la barra interna no cambia la altura del botón ni su texto; test en T2.

---

### Task 1: Panel de marca con fundido desde negro, viñeta que se abre y lema palabra a palabra

**Files:**
- Modify: `frontend/src/components/shell/AuthBrand.tsx`
- Modify: `frontend/src/styles/base.css` (keyframes `marca-fundido` y `marca-vineta`)
- Test: `frontend/src/components/shell/AuthBrand.test.tsx` (añadir; conservar los dos existentes)

**Interfaces:**
- Produces: `AuthBrand({ flex })` sin cambio de firma. El `div.login-media` lleva una capa `<div data-marca-fundido aria-hidden>` de fondo `var(--media-bg)` (nunca un color literal) con `animation: marca-fundido 600ms var(--ease-out) forwards` (opacidad 1 → 0); la viñeta existente pasa a `animation: marca-vineta var(--dur-4) var(--ease-out) forwards` (de `--media-vignette-centro` cerrada a la viñeta final: implementar como `opacity` 1 → 0.55 de una capa de viñeta más cerrada superpuesta). El lema se pinta como `<h1 data-lema aria-label={LEMA}>` con un `<span aria-hidden>` por palabra, cada uno `motion.span` con `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.estado, ease: EASE, delay: i * 0.06 }}`; con `useReducedMotion()` true, los `span` se pintan sin `initial` (visibles de entrada). El `textContent` del `h1` sigue siendo exactamente `LEMA` (las palabras se unen con espacios normales dentro de los spans: `palabra + " "` salvo la última).

- [ ] **Step 1: Tests que fallan (añadir)**

```ts
it("el lema se compone palabra a palabra y su texto sigue siendo el lema exacto", () => {
  render(<MemoryRouter><AuthBrand flex="1" /></MemoryRouter>);
  const h1 = screen.getByRole("heading", { level: 1 });
  expect(h1.textContent).toBe(LEMA);
  expect(h1.querySelectorAll("span[aria-hidden]")).toHaveLength(LEMA.split(" ").length);
});
it("hay una capa de fundido desde el fondo de medios con su animación", () => {
  render(<MemoryRouter><AuthBrand flex="1" /></MemoryRouter>);
  const capa = document.querySelector("[data-marca-fundido]") as HTMLElement;
  expect(capa.style.animation).toContain("marca-fundido");
  expect(capa.style.background).toContain("--media-bg");
});
it("con movimiento reducido las palabras no arrancan invisibles", () => {
  vi.mocked(useReducedMotion).mockReturnValue(true); // mock de ../../motion
  render(<MemoryRouter><AuthBrand flex="1" /></MemoryRouter>);
  const first = screen.getByRole("heading", { level: 1 }).querySelector("span") as HTMLElement;
  expect(first.style.opacity === "" || first.style.opacity === "1").toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/shell/AuthBrand.test.tsx src/pages/Login.test.tsx` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS (incluido «lleva el logotipo y el lema único»); `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/AuthBrand.tsx frontend/src/styles/base.css frontend/src/components/shell/AuthBrand.test.tsx
git commit -m "Entrar: panel de marca con fundido desde negro, viñeta que se abre y lema palabra a palabra"
```

---

### Task 2: Formulario de Entrar con sacudida corta y botón «comprobando» con barra interna

**Files:**
- Modify: `frontend/src/components/Button.tsx` (prop `busy?: boolean`)
- Modify: `frontend/src/components/Button.test.tsx` (añadir)
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/styles/base.css` (keyframes `shake` → 8 px / 380 ms; `boton-barra`)
- Test: `frontend/src/pages/Login.test.tsx` (añadir)

**Interfaces:**
- Produces: `Button` acepta `busy?: boolean`: con `busy` pinta dentro, pegado al borde inferior, `<span data-boton-barra aria-hidden>` de 2 px (`background: var(--primary-foreground)` en el primario, `var(--primary)` en el resto, `opacity: .7`) con `animation: boton-barra 1.1s var(--ease-out) infinite` (barrido 0 → 100 % de `left` con anchura 35 %), `position: relative; overflow: hidden` en el botón; la altura y el texto no cambian; `aria-busy="true"`. `Login` pasa `busy={busy}` al botón «Entrar»/«Verificando…». La sacudida: keyframes `shake` en `base.css` con amplitud 8 px y duración 380 ms (`translateX(-8px) … 8px`), y `Login` reinicia la animación en cada fallo (clave `shakeKey` incrementada por error → `key={shakeKey}` en el contenedor del formulario o `animation: none` + reflow).

- [ ] **Step 1: Tests que fallan**

`Button.test.tsx`:
```ts
it("busy pinta la barra interna, marca aria-busy y no cambia el texto", () => {
  render(<ThemeProvider><Button busy>Verificando…</Button></ThemeProvider>);
  const b = screen.getByRole("button", { name: "Verificando…" });
  expect(b).toHaveAttribute("aria-busy", "true");
  expect(b.querySelector("[data-boton-barra]")).not.toBeNull();
  expect(b.style.height).toContain("--control-md");
});
```
`Login.test.tsx`:
```ts
it("cada fallo de credenciales vuelve a sacudir el formulario", async () => {
  api.login.mockRejectedValue(new ApiError(401, "no"));
  render(<Login onLogin={() => {}} onSignup={() => {}} />);
  // rellenar y enviar dos veces (helper del fichero)
  await enviar("u", "p");
  const k1 = document.querySelector("[data-shake]")!.getAttribute("data-shake");
  await enviar("u", "p");
  const k2 = document.querySelector("[data-shake]")!.getAttribute("data-shake");
  expect(k2).not.toBe(k1);
});
it("mientras verifica, el botón lleva la barra interna", async () => {
  let resolve!: () => void;
  api.login.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
  render(<Login onLogin={() => {}} onSignup={() => {}} />);
  await enviar("u", "p");
  expect(screen.getByRole("button", { name: "Verificando…" })).toHaveAttribute("aria-busy", "true");
  resolve();
});
```
(`data-shake` = atributo del contenedor que lleva la clase `shake`, con el valor de `shakeKey`.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/Button.test.tsx src/pages/Login.test.tsx src/pages/Signup.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Button.tsx frontend/src/components/Button.test.tsx frontend/src/pages/Login.tsx frontend/src/pages/Login.test.tsx frontend/src/styles/base.css
git commit -m "Entrar: sacudida de 8 px en 380 ms y botón «comprobando» con barra interna"
```

---

### Task 3: Pantalla de carga precargada en Entrar y desvelado circular al terminar

**Files:**
- Modify: `frontend/src/components/LoadingScreen.tsx`
- Modify: `frontend/src/pages/Login.tsx` (precarga)
- Test: `frontend/src/components/LoadingScreen.test.tsx` (añadir/actualizar), `frontend/src/pages/Login.test.tsx` (añadir)

**Interfaces:**
- Produces: `LoadingScreen({ onDone, label?, progress?: number | null })`: `FADE_MS` pasa a 480; el final ya no es un fundido de opacidad sino `clip-path: circle(0 at 50% 50%)` animado desde `circle(150% at 50% 50%)` en `FADE_MS` con `--ease-out` (atributo `data-fase="desvelando"` durante esa etapa); con `useReducedMotion()` true vuelve a ser un fundido de opacidad. Con `progress` numérico (0–100) la barra es determinada (`role="progressbar"` con `aria-valuenow`), si no, el barrido actual. `onDone` se llama en `SHOW_MS + FADE_MS` como hoy. `Login` añade `<video src={VIDEO_SRC} preload="auto" muted hidden aria-hidden />` (importando `VIDEO_SRC` de `LoadingScreen`) para que el navegador lo tenga listo.

- [ ] **Step 1: Tests que fallan**

`LoadingScreen.test.tsx`: actualizar «dura lo mismo que antes de F2» a `SHOW_MS + FADE_MS` con `FADE_MS === 480`; añadir «al terminar desvela con clip-path circular» (`data-fase="desvelando"` y `style.clipPath` contiene `circle`), «con progreso numérico la barra es determinada» (`role="progressbar"` con `aria-valuenow="40"`), «con movimiento reducido funde en vez de desvelar» (mock `useReducedMotion` → true; sin `clipPath`, `opacity` baja).
`Login.test.tsx`: «precarga el vídeo de la pantalla de carga sin reproducirlo» (`document.querySelector('video[src="/media/loading.mp4"]')` existe, `hidden`, `muted`, sin `autoplay`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/LoadingScreen.test.tsx src/pages/Login.test.tsx src/App.test.tsx` → PASS (si `App.test.tsx` no existe, omitir); `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoadingScreen.tsx frontend/src/components/LoadingScreen.test.tsx frontend/src/pages/Login.tsx frontend/src/pages/Login.test.tsx
git commit -m "Carga: vídeo precargado en Entrar y desvelado circular hacia el panel"
```

---

### Task 4: Comprobación de conjunto y nota en el documento de diseño

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (al final de §7: «Fase 4 completada el <fecha>: entrada; ver plan …»)

- [ ] **Step 1:** `cd frontend && npx vitest run && npx tsc -b` → verde.
- [ ] **Step 2:** Navegador: la pantalla de Entrar no requiere sesión → mirar el fundido, el lema y la sacudida con credenciales falsas (sin introducir credenciales reales). Corregir desbordes.
- [ ] **Step 3: Commit de la nota**

```bash
git add docs/superpowers/specs/2026-10-30-rediseno-visual-design.md
git commit -m "Diseño: fase 4 (entrada) completada"
```

---

## Autorrevisión

- **Cobertura (fase 4):** §4.6 Entrar (fundido 600 ms, viñeta, lema 60 ms, etiquetas 13 px y anillo ya de la fase 1, sacudida 8 px / 380 ms, botón «comprobando» con barra) → T1, T2; pantalla de carga (precarga, logo/marca/barra real si hay progreso/texto, desvelado circular 480 ms) → T3.
- **Nombres:** `busy` (Button) lo consume Login; `VIDEO_SRC` se reexporta de LoadingScreen; `FADE_MS` cambia a 480 y el test se actualiza en T3.
- **Review Focus:** 1 → T1; 2, 5 → T2; 3, 4 → T3.
- **Proporción:** cuatro tareas, ~150 líneas.
