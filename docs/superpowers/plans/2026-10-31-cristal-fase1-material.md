# Cristal D · Fase 1 (material) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar el material de toda la interfaz a la dirección D (tokens de color y cristal, Inter + JetBrains Mono autoalojadas, formas, movimiento `glide`/lente, `Entorno`) y vestir con él los componentes base, sin tocar todavía la distribución de ninguna pantalla.

**Architecture:** Los tokens CSS de `frontend/src/styles/tokens/*.css` cambian de valor y ganan los de cristal; un helper TS `glass()` da el estilo en línea de una pieza de cristal a partir de esos tokens; el módulo `src/motion` gana los presets `glide` y `lens`; los componentes base (`Button`, `Badge`, `Input`, `Select`, `Tabs`, `Sheet`, `ConfirmDialog`, `PanelHead`/`Collapsible`/`Card`/`SectionLabel`, toast de `App.tsx`) usan solo tokens y el helper. `Entorno` se crea pero lo montan las fases 2 y 5.

**Tech Stack:** React 19, Vite 7, TypeScript, `motion` 12 (barrel `src/motion`), vitest + Testing Library, CSS plano con custom properties.

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` (§3, §4, §8.1, §8.2, §9 fase 1). Tablero de referencia del sistema: `docs/superpowers/specs/assets/2026-10-31-cristal-d/D-Sistema.dc.html`.

## Global Constraints

- Commits por lista explícita de ficheros; nunca `git add -A`; nunca `docs/Informe-Ejecutivo-Zenodo.html` ni `frontend/data/`.
- Sin color literal (`#…`, `rgb(`, `rgba(`) en `pages/`, `components/shell/`, `components/patients/` (lo vigila `styles/tokens.test.ts`); los literales viven en `styles/tokens/*.css`.
- Los bloques oscuro (`:root,\n[data-theme="dark"]`) y claro (`[data-theme="light"]`) de `colors.css` definen exactamente los mismos nombres.
- Fuentes autoalojadas en `frontend/src/assets/fonts/` con su licencia OFL; nada de Google Fonts ni CDN.
- Duraciones `--dur-1 120ms`, `--dur-2 240ms`, `--dur-3 480ms`, `--dur-4 900ms`, curva `cubic-bezier(0.16, 1, 0.3, 1)`: no cambian.
- `prefers-reduced-motion: reduce` → solo opacidad; `prefers-reduced-transparency: reduce` → cristal opaco sin desenfoque.
- Textos visibles en español; los que prueban tests no cambian salvo que el test cambie en la misma tarea.
- Verificación de cada tarea: `npx vitest run <ficheros>` y, al final de la tarea, `npx tsc -b` limpio. Suite completa (`npx vitest run`, 4–6 min) al cerrar la fase. Flaky conocido: AnnotationsPanel «un marcador recién puesto enfoca su nota» bajo carga.

## Review Focus

1. Texto secundario `#B8C0CC` sobre cristal encima de la zona más clara del corte de TC: debe seguir ≥ 4,5:1 (test en la tarea 2 calculando el peor caso: cristal `rgba(5,6,8,.55)` sobre blanco puro `#FFFFFF` bajo el velo `.55`).
2. Navegador sin `backdrop-filter`: el cristal no puede quedar transparente sobre la imagen (test en la tarea 3: `glass()` declara un fondo que ya es oscuro por sí solo).
3. `prefers-reduced-transparency: reduce`: piezas opacas y `Entorno` sin imagen (tests en tareas 3 y 4).
4. Tema claro: ninguna superficie de cristal transparente ni texto blanco sobre blanco (test en la tarea 2 de pares de contraste del bloque claro, ampliado con `--foreground` sobre `--glass-solid`).
5. Componentes que hoy fijan alturas por token (`Button` lg, textarea de `Input`) siguen funcionando con las alturas nuevas 32/44/54 y el campo de 48 (tests actualizados en tareas 5 y 6).

---

### Task 1: Fuentes Inter y JetBrains Mono autoalojadas y escala tipográfica D

**Files:**
- Create: `frontend/src/assets/fonts/InterVariable-latin.woff2`, `InterVariable-latin-ext.woff2`, `JetBrainsMonoVariable-latin.woff2`, `JetBrainsMonoVariable-latin-ext.woff2`, `OFL-Inter.txt`, `OFL-JetBrainsMono.txt`
- Delete: `frontend/src/assets/fonts/GeistVF.woff2`, `GeistMonoVF.woff2`, `OFL-Geist.txt`
- Modify: `frontend/src/styles/tokens/fonts.css`, `frontend/src/styles/tokens/typography.css`, `frontend/src/styles/tokens.test.ts`
- Grep and fix: cualquier `"Geist"` literal fuera de tokens (`grep -rn "Geist" frontend/src --include=*.ts* --include=*.css`)

**Interfaces:**
- Produces: `--font-sans: "Inter", system-ui, sans-serif`; `--font-mono: "JetBrains Mono", ui-monospace, monospace`; tokens nuevos `--text-display: 40px`, `--text-window: 26px`, `--text-subtitle: 17px`, `--text-reading: 15px`, `--text-eyebrow: 11px`, `--tracking-display: -0.035em`, `--tracking-eyebrow: 0.14em`, `--leading-reading: 1.53`. Se conservan con estos valores: `--text-title 20px`, `--text-body 14px`, `--text-desc 13px`, `--text-label 13px`, `--text-micro 12px`, `--text-page 28px`, `--text-hero 28px`, `--weight-*` actuales.

- [ ] **Step 1: Obtener los woff2.** En una carpeta del scratchpad, `npm pack @fontsource-variable/inter@5.3.0 @fontsource-variable/jetbrains-mono@5.3.0`, extraer y copiar `files/inter-latin-wght-normal.woff2`, `files/inter-latin-ext-wght-normal.woff2`, `files/jetbrains-mono-latin-wght-normal.woff2`, `files/jetbrains-mono-latin-ext-wght-normal.woff2` con los nombres de arriba, y el `LICENSE` de cada paquete como `OFL-*.txt`.

- [ ] **Step 2: Reescribir el test de fuentes en `tokens.test.ts`** (sustituye a «las fuentes son Geist y Geist Mono, autoalojadas»):

```ts
it("las fuentes son Inter y JetBrains Mono, autoalojadas", () => {
  const fonts = readFileSync(join(__dirname, "tokens/fonts.css"), "utf8");
  expect(fonts).toMatch(/font-family:\s*"Inter"/);
  expect(fonts).toMatch(/font-family:\s*"JetBrains Mono"/);
  expect(fonts).toMatch(/InterVariable-latin\.woff2/);
  expect(fonts).toMatch(/unicode-range:/);
  expect(fonts).not.toMatch(/googleapis|Geist/);
  const typo = readFileSync(join(__dirname, "tokens/typography.css"), "utf8");
  expect(typo).toMatch(/--font-sans:\s*"Inter"/);
  expect(typo).toMatch(/--font-mono:\s*"JetBrains Mono"/);
  expect(typo).toMatch(/--text-eyebrow:\s*11px/);
  expect(typo).toMatch(/--tracking-eyebrow:\s*0\.14em/);
  expect(typo).toMatch(/--text-display:\s*40px/);
});
```

- [ ] **Step 3: Ver que falla.** `npx vitest run src/styles/tokens.test.ts` → FAIL en el test nuevo.

- [ ] **Step 4: `fonts.css`**: cuatro `@font-face` (`font-weight: 100 900`, `font-display: swap`), dos por familia, con el `unicode-range` latín y latín extendido que publica fontsource en su `index.css` de cada paquete. **`typography.css`**: familias y tokens de *Produces*; actualizar el comentario de cabecera.

- [ ] **Step 5: Ver que pasa** el fichero de tokens y `npx tsc -b`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/assets/fonts frontend/src/styles/tokens/fonts.css frontend/src/styles/tokens/typography.css frontend/src/styles/tokens.test.ts
git commit -m "Cristal D: Inter y JetBrains Mono autoalojadas y escala tipográfica"
```

### Task 2: Tokens de color, cristal, formas y sombras D (oscuro y claro)

**Files:**
- Modify: `frontend/src/styles/tokens/colors.css`, `frontend/src/styles/tokens/spacing.css`, `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Produces (oscuro → claro): `--canvas #050608 → #F3F5F8`; `--background #0B0C0F → #FFFFFF`; `--card #12141A → #FFFFFF`; `--popover` = `--card`; `--surface-2 #0A0B0E → #FFFFFF`; `--foreground #FFFFFF → #0B0C0F`; `--muted-foreground #B8C0CC → #4A5361`; `--primary #5AA9FF → #0A66FF`; `--primary-foreground #06121F → #FFFFFF`; `--primary-hover #7DBBFF → #0047B3`; `--data #5AA9FF → #1F5FC0`; `--accent rgba(90,169,255,.16) → #EEF4FF`; `--accent-foreground #8CC4FF → #1F5FC0`; `--ring` = `--primary`; `--destructive #FF5A6A → #B91C1C`; `--destructive-text #FF8A96 → #B91C1C` (nuevo); `--destructive-bg rgba(255,90,106,.12) → #FEE2E2`; `--success #3DDC97 → #15803D`; `--success-bg rgba(61,220,151,.14) → #DCFCE7`; `--warning #FFC247 → #92400E`; `--warning-bg rgba(255,194,71,.14) → #FEF3C7`; `--border rgba(255,255,255,.14) → rgba(0,0,0,.08)`; `--input rgba(255,255,255,.24) → rgba(0,0,0,.14)`; `--field-bg rgba(5,6,8,.5) → #FFFFFF` (nuevo); cristal (nuevos salvo `--glass`): `--veil rgba(5,6,8,.55) → rgba(243,245,248,.0)`, `--veil-dense rgba(5,6,8,.72) → rgba(243,245,248,.0)`, `--glass linear-gradient(rgba(5,6,8,.55), rgba(5,6,8,.55)), rgba(255,255,255,.08) → rgba(255,255,255,.72)`, `--glass-dense linear-gradient(rgba(8,9,12,.72), rgba(8,9,12,.72)), rgba(255,255,255,.08) → rgba(255,255,255,.86)`, `--glass-solid #101217 → #FFFFFF` (fondo opaco de reserva), `--glass-border rgba(255,255,255,.2) → rgba(0,0,0,.08)`, `--glass-highlight inset 0 1px 0 rgba(255,255,255,.35) → inset 0 1px 0 rgba(255,255,255,.9)`, `--glass-hover rgba(255,255,255,.14) → rgba(0,0,0,.04)`, `--glass-blur 30px` (ambos), `--glass-blur-viewer 12px` (ambos). Alias de marca `--brand-*` apuntan al acento nuevo. `--chart-1` = `--primary`. Visor, HUD, planos y vídeo: sin cambios.
- Produces en `spacing.css`: `--radius-sm 8px`, `--radius-md 14px` (campos), `--radius-lg 16px` (tarjetas), `--radius-xl 24px` (ventanas, hojas, inspector), `--radius-card-lg 20px` (tarjeta de paciente), `--radius-full 9999px`; `--control-sm 32px`, `--control-md 44px`, `--control-lg 54px`, `--field-h 48px`; `--shadow-md 0 14px 40px rgba(0,0,0,.5)`, `--shadow-lg 0 40px 90px rgba(0,0,0,.6)`, `--shadow-primary inset 0 1px 0 rgba(255,255,255,.5), 0 8px 24px rgba(90,169,255,.28)`, `--shadow-sheet -30px 0 80px rgba(0,0,0,.6)`; claro: `--shadow-md 0 10px 30px rgba(11,12,15,.10)`, `--shadow-lg 0 30px 60px rgba(11,12,15,.14)`, `--shadow-primary 0 8px 22px rgba(10,102,255,.26)`, `--shadow-sheet -30px 0 80px rgba(11,12,15,.18)`; el bloque `[data-theme="dark"]` repite los oscuros (la landing lo fija).

- [ ] **Step 1: Reescribir en `tokens.test.ts`** los tests «el oscuro es el de la identidad A», «los tokens nuevos existen…», «radios, sombras y alturas…» y «la sombra oscura también se declara…» con los valores de *Produces* (mismas formas de aserción que hoy), renombrar el `describe` a «tokens de la dirección D», y añadir:

```ts
it("el texto secundario aguanta 4,5:1 sobre cristal encima de lo más claro del corte", () => {
  // peor caso: blanco puro bajo el velo .55 y bajo el cristal .55 + blanco .08
  const mix = (top: number[], a: number, under: number[]) => under.map((u, i) => u * (1 - a) + top[i] * a);
  let bg = [255, 255, 255];
  bg = mix([5, 6, 8], 0.55, bg);          // --veil
  bg = mix([255, 255, 255], 0.08, bg);    // tinte del cristal
  bg = mix([5, 6, 8], 0.55, bg);          // velo del propio cristal
  const hexBg = "#" + bg.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
  expect(ratio("#B8C0CC", hexBg)).toBeGreaterThanOrEqual(4.5);
  expect(ratio("#FFFFFF", hexBg)).toBeGreaterThanOrEqual(7);
});
it("el cristal tiene fondo de reserva opaco y desenfoque en los dos temas", () => {
  for (const b of [block(DARK), block('[data-theme="light"]')]) {
    expect(b).toMatch(/--glass-solid:\s*#[0-9A-F]{6}/i);
    expect(b).toMatch(/--glass-blur:\s*30px/);
    expect(b).toMatch(/--glass-blur-viewer:\s*12px/);
  }
});
```

(`ratio` y `l` se suben a funciones del módulo para compartirlas con el test de contraste del claro, al que se añade el par `["--foreground", "--glass-solid"]`.)

- [ ] **Step 2: Ver que falla.** `npx vitest run src/styles/tokens.test.ts`.
- [ ] **Step 3: Escribir los valores** de *Produces* en `colors.css` y `spacing.css`; cabeceras de comentario a «dirección D, Quirófano de cristal».
- [ ] **Step 4: Ver que pasa** el fichero de tokens; correr `npx vitest run src/components src/pages` y anotar (no arreglar aquí) los fallos que dependan de valores viejos; los de componentes base se arreglan en sus tareas, el resto en la tarea 8.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/tokens/colors.css frontend/src/styles/tokens/spacing.css frontend/src/styles/tokens.test.ts
git commit -m "Cristal D: tokens de color, cristal, radios, alturas y sombras"
```

### Task 3: Helper de cristal, presets de movimiento `glide` y `lens`, y reglas globales

**Files:**
- Create: `frontend/src/styles/glass.ts`, `frontend/src/styles/glass.test.ts`
- Modify: `frontend/src/motion/presets.ts`, `frontend/src/motion/index.ts`, `frontend/src/motion/presets.test.ts`, `frontend/src/styles/base.css`, `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Produces: `type GlassKind = "normal" | "dense" | "viewer"`; `glass(kind?: GlassKind): React.CSSProperties` → `{ background: "var(--glass)" | "var(--glass-dense)" (viewer también dense), backgroundColor: "var(--glass-solid)" no (ver paso 3), backdropFilter: "blur(var(--glass-blur)) saturate(130%)" (viewer: "blur(var(--glass-blur-viewer)) saturate(130%)"), WebkitBackdropFilter: igual, border: "1px solid var(--glass-border)", boxShadow: "var(--glass-highlight), var(--shadow-md)" }`.
- Produces: `glide: Variants` = `{ initial: { opacity: 0, scale: 0.96, y: 14 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: 8 } }`, `glideTransition = { duration: DUR.panel, ease: EASE }`; `lens = { whileHover: { scale: 1.06 }, transition: { duration: DUR.estado, ease: EASE } }`; `lensCard = { whileHover: { scale: 1.02 }, transition: … }`. Exportados desde `src/motion`.
- Produces en `base.css`: clase `.glass-fallback` no; en su lugar dos reglas globales: `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` y `@media (prefers-reduced-transparency: reduce)` que fijan `[data-glass] { background: var(--glass-solid) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`. `glass()` no puede poner atributos: los componentes que lo usan añaden `data-glass` a su elemento.

- [ ] **Step 1: Tests.** `glass.test.ts`:

```ts
import { glass } from "./glass";
it("el cristal normal usa los tokens y desenfoque de 30", () => {
  const s = glass();
  expect(s.background).toBe("var(--glass)");
  expect(s.backdropFilter).toBe("blur(var(--glass-blur)) saturate(130%)");
  expect(s.WebkitBackdropFilter).toBe(s.backdropFilter);
  expect(s.border).toBe("1px solid var(--glass-border)");
  expect(String(s.boxShadow)).toContain("var(--glass-highlight)");
});
it("denso y visor", () => {
  expect(glass("dense").background).toBe("var(--glass-dense)");
  expect(glass("viewer").background).toBe("var(--glass-dense)");
  expect(glass("viewer").backdropFilter).toBe("blur(var(--glass-blur-viewer)) saturate(130%)");
});
it("ningún valor lleva un color literal", () => {
  for (const k of ["normal", "dense", "viewer"] as const)
    expect(JSON.stringify(glass(k))).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
});
```

En `presets.test.ts`: `glide.initial` es `{ opacity: 0, scale: 0.96, y: 14 }`, `glideTransition.duration === 0.48`, `lens.whileHover.scale === 1.06`, `lensCard.whileHover.scale === 1.02`. En `tokens.test.ts`: `base.css` contiene `@media (prefers-reduced-transparency: reduce)` y `@supports not` con `[data-glass]` y `background: var(--glass-solid) !important`.

- [ ] **Step 2: Ver que fallan** los tres ficheros.
- [ ] **Step 3: Implementar** `glass.ts` (sin `backgroundColor`: el fondo de reserva lo pone la regla de `base.css`), los presets y las reglas de `base.css`.
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/glass.ts frontend/src/styles/glass.test.ts frontend/src/motion/presets.ts frontend/src/motion/index.ts frontend/src/motion/presets.test.ts frontend/src/styles/base.css frontend/src/styles/tokens.test.ts
git commit -m "Cristal D: helper de cristal, presets glide y lente, reserva opaca"
```

### Task 4: `Entorno` (imagen de fondo con velo)

**Files:**
- Create: `frontend/public/media/entorno/corte-036.webp` (copia de `docs/superpowers/specs/assets/2026-10-31-cristal-d/corte-036.webp`), `frontend/src/components/Entorno.tsx`, `frontend/src/components/Entorno.test.tsx`

**Interfaces:**
- Consumes: `useThemeContext()` de `frontend/src/store/theme.tsx` (o `useTheme(): [Theme, () => void]` de `hooks/useTheme.ts`; leer ambos y usar el que dé el tema efectivo dentro del `ThemeProvider`).
- Produces: `Entorno({ dense?: boolean, children?: ReactNode }): JSX.Element` — contenedor `position: relative; min-height: 100%` cuyo primer hijo es una capa `position: fixed; inset: 0; z-index: 0; pointer-events: none` con `<img src="/media/entorno/corte-036.webp" alt="" aria-hidden>` (`object-fit: cover; object-position: 50% 40%`) y encima un velo `background: var(--veil)` (`var(--veil-dense)` con `dense`); los `children` van en una capa `position: relative; z-index: 1`. Sin imagen en tema claro ni con `prefers-reduced-transparency: reduce` (se lee con `window.matchMedia`, protegido si no existe). Exporta `ENTORNO_SRC = "/media/entorno/corte-036.webp"`.

- [ ] **Step 1: Tests** en `Entorno.test.tsx`: (a) en oscuro pinta un `img` con `src` `ENTORNO_SRC`, `alt=""` y `aria-hidden="true"`, y los hijos; (b) con `dense` el velo usa `var(--veil-dense)`; (c) en tema claro no hay `img`; (d) con `matchMedia("(prefers-reduced-transparency: reduce)").matches === true` (simular con `vi.spyOn(window, "matchMedia")`) no hay `img`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar** y copiar la imagen.
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit**

```bash
git add frontend/public/media/entorno/corte-036.webp frontend/src/components/Entorno.tsx frontend/src/components/Entorno.test.tsx
git commit -m "Cristal D: Entorno con el corte de TC del 036 bajo un velo"
```

### Task 5: `Button` y `Badge` en pastilla de cristal

**Files:**
- Modify: `frontend/src/components/Button.tsx`, `Button.test.tsx`, `Badge.tsx`, `Badge.test.tsx`

**Interfaces:**
- Consumes: `lens` de `src/motion`; tokens de la tarea 2.
- Produces: misma API de `Button` (variantes `default | outline | secondary | ghost | destructive | link`, tamaños `sm | md | lg | icon`) y de `Badge` (sus variantes actuales). Cambios de aspecto: `borderRadius: var(--radius-full)` en todas salvo `link`; alturas por `--control-*` (32/44/54; `icon` = `--control-sm` cuadrado redondo); `default`: fondo `--primary`, texto `--primary-foreground`, peso 600, sombra `--shadow-primary`; `outline` y `secondary`: fondo `--glass-hover` al pasar y `color-mix(in srgb, var(--foreground) 8%, transparent)` en reposo, borde `1px solid color-mix(in srgb, var(--foreground) 30%, transparent)`, con `lens` (escala 1,06) al pasar; `ghost`: sin borde, `--glass-hover` al pasar, con `lens`; `destructive`: borde y texto `--destructive` sobre `--destructive-bg`; deshabilitado `opacity: .4` y sin lente ni prensado. `Badge`: pastilla `--radius-full`, `font-size: 11px`, peso 500, borde `1px solid color-mix(in srgb, <color> 60%, transparent)`, texto del color, fondo transparente; variantes de riesgo usan `--destructive`/`--warning`/`--success`; `data` usa `--data`; `subtle` usa `--muted-foreground`.

- [ ] **Step 1: Tests nuevos/actualizados.** `Button.test.tsx`: la altura de `lg` contiene `--control-lg` (ya existe); el radio de `default` es `var(--radius-full)`; `outline` deshabilitado tiene `opacity: 0.4`; `variant="link"` no tiene radio `--radius-full`. `Badge.test.tsx`: `<Badge variant="destructive">Alto</Badge>` tiene `border-radius: var(--radius-full)` y su borde contiene `var(--destructive)`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/components/Button.test.tsx src/components/Badge.test.tsx` y `npx tsc -b`.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Button.tsx frontend/src/components/Button.test.tsx frontend/src/components/Badge.tsx frontend/src/components/Badge.test.tsx
git commit -m "Cristal D: botones en pastilla con lente e insignias de borde"
```

### Task 6: `Input`, `Select` y campos de texto largo

**Files:**
- Modify: `frontend/src/components/Input.tsx`, `Input.test.tsx`, `Select.tsx`, `Select.test.tsx`

**Interfaces:**
- Produces: misma API (`label`, `icon`, `hint`, `invalid`, `multiline` en `Input`; `label`, `options` en `Select`). Aspecto: contorno de `--field-h` (48 px) de alto, `border-radius: var(--radius-md)` (14), fondo `--field-bg`, borde `1px solid var(--input)`; con foco borde `--primary` y `box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent)`; con `invalid` borde `--destructive` y anillo `color-mix(in srgb, var(--destructive) 22%, transparent)`, y el `hint` pasa a mensaje de error en `--destructive-text` con icono `STATUS_WARN` 14 px y `role="alert"`; textarea con `min-height: calc(var(--field-h) * 2)`; `Select` con `appearance: none` y chevron SVG propio a la derecha (`aria-hidden`), misma altura y estados.

- [ ] **Step 1: Tests.** `Input.test.tsx`: el textarea `minHeight` contiene `--field-h` (sustituye la aserción de `--control-md`); con `invalid` y `hint="Los apellidos son obligatorios."` existe `getByRole("alert")` con ese texto; el contorno tiene `height: var(--field-h)` cuando no es `multiline`. `Select.test.tsx`: el `select` tiene `appearance: none` y hay un `svg[aria-hidden="true"]` hermano.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Input.tsx frontend/src/components/Input.test.tsx frontend/src/components/Select.tsx frontend/src/components/Select.test.tsx
git commit -m "Cristal D: campos de 48 px con foco y error en anillo"
```

### Task 7: `Sheet`, `ConfirmDialog` y `Tabs` de cristal

**Files:**
- Modify: `frontend/src/components/Sheet.tsx`, `Sheet.test.tsx`, `ConfirmDialog.tsx`, `ConfirmDialog.test.tsx`, `Tabs.tsx`, `Tabs.test.tsx`

**Interfaces:**
- Consumes: `glass("dense")`, `glide`, `glideTransition`, `sheetSlide`, `scrimFade` de tareas 3 y anteriores.
- Produces: misma API de las tres piezas. `Sheet`: panel con `glass("dense")` + `data-glass`, `border-radius: var(--radius-xl) 0 0 var(--radius-xl)`, sombra `--shadow-sheet`, velo `var(--veil)`; cabecera con el `eyebrow` como rótulo mono (`--font-mono`, `--text-eyebrow`, mayúsculas, `--tracking-eyebrow`) y título 20 px; botón cerrar redondo de 40 px (`aria-label="Cerrar"`, se conserva); pie igual que hoy. `ConfirmDialog`: ventana centrada de 420 px con `glass("dense")`, radio `--radius-xl`, entrada `glide` (solo opacidad con movimiento reducido), velo `var(--veil-dense)`. `Tabs`: pastilla segmentada (contenedor `--radius-full` con fondo `color-mix(in srgb, var(--foreground) 6%, transparent)`, pestaña activa con fondo `--primary` y texto `--primary-foreground` que se desliza con `layoutId` como el subrayado actual); `role="tab"`/`aria-selected` se conservan.

- [ ] **Step 1: Tests.** `Sheet.test.tsx`: el `role="dialog"` tiene `data-glass` y su `borderRadius` contiene `var(--radius-xl)`; el rótulo del `eyebrow` usa `var(--font-mono)`. `ConfirmDialog.test.tsx`: el diálogo tiene `data-glass` y ancho 420. `Tabs.test.tsx`: la pestaña activa tiene `aria-selected="true"` y un hijo con `data-tab-indicator` (renombrar el `layoutId` actual si el test lo nombra).
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** los tres ficheros y `npx tsc -b`.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sheet.tsx frontend/src/components/Sheet.test.tsx frontend/src/components/ConfirmDialog.tsx frontend/src/components/ConfirmDialog.test.tsx frontend/src/components/Tabs.tsx frontend/src/components/Tabs.test.tsx
git commit -m "Cristal D: hojas, diálogos y pestañas de cristal"
```

### Task 8: Tarjetas, plegables, rótulos, toast y barrido de la suite

**Files:**
- Modify: `frontend/src/components/PanelHead.tsx` (`Card`, `Collapsible`, `SectionLabel`, `PanelHead`, `ErrorNote`) y su test si existe; `frontend/src/App.tsx` (el bloque del toast, líneas ~311–330); los tests de `src/components` y `src/pages` que fallen por valores viejos de tokens (radios, alturas, fuentes) detectados en la tarea 2.

**Interfaces:**
- Consumes: `glass()`, `lensCard`, tokens.
- Produces: `Card`: `glass()` + `data-glass`, radio `--radius-lg`, sin sombra de color; `Collapsible`: cabecera con el título en 14/600 y el subtítulo en `--muted-foreground`, chevron que gira 90° en `--dur-2`, cuerpo sin cristal propio (va dentro de un panel); `SectionLabel`: mono, `--text-eyebrow`, mayúsculas, `--tracking-eyebrow`, `--muted-foreground`; `ErrorNote`: borde y texto `--destructive-text` sobre `--destructive-bg`, radio `--radius-md`. Toast de `App.tsx`: pastilla de cristal (`glass("dense")` + `data-glass`), abajo a la derecha a 24 px, radio `--radius-full`, con el botón «Reintentar» que ya tiene; entra con `glide`.

- [ ] **Step 1: Tests.** En el test de `PanelHead` (crear `PanelHead.test.tsx` si no cubre `SectionLabel`/`Card`): `SectionLabel` usa `var(--font-mono)` y `textTransform: uppercase`; `Card` tiene `data-glass`. En `App.resume.test.tsx` o un test nuevo de toast si ya hay uno que muestre el toast: el toast tiene `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar**; después `npx vitest run src/components src/pages` y arreglar cada fallo que venga de un valor viejo (actualizar la aserción al valor D, nunca borrar el test).
- [ ] **Step 4: Ver que pasan** `npx vitest run src/components src/pages src/styles src/motion` y `npx tsc -b`.
- [ ] **Step 5: Commit** (lista exacta de los ficheros tocados, sin comodines)

```bash
git add frontend/src/components/PanelHead.tsx frontend/src/components/PanelHead.test.tsx frontend/src/App.tsx <tests actualizados uno a uno>
git commit -m "Cristal D: tarjetas, plegables, rótulos y toast de cristal; tests al material nuevo"
```

### Task 9: Cierre de la fase

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` (§9: línea «Fase 1 completada el 2026-10-31…» con lo hecho y cualquier desviación)

- [ ] **Step 1:** `npx vitest run` completo y `npx tsc -b`: todo verde (salvo el flaky conocido, que debe pasar al repetirlo solo).
- [ ] **Step 2:** Añadir la nota de cierre al documento de diseño.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md
git commit -m "Diseño: fase 1 del cristal D completada"
```
