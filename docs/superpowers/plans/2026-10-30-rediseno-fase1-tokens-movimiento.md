# Rediseño visual · Fase 1: tokens, movimiento y componentes base — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en el frontend los tokens de color, tipografía, radio, sombra y movimiento de la dirección elegida, y rehacer los cinco componentes base (Button, Badge, Input, Tabs, Sheet) sobre ellos, sin cambiar ninguna pantalla todavía.

**Architecture:** Los tokens viven en `frontend/src/styles/tokens/*.css` (CSS plano, nombres actuales conservados, valores nuevos, tres tokens añadidos) y las reglas globales en `styles/base.css`. El movimiento entra con la librería `motion` (React) encapsulada en `frontend/src/motion/` (duraciones, curva y presets), y los componentes base la usan para prensado, deslizamiento del subrayado y entrada de hojas. Nada de Tailwind ni librería de componentes; estilos inline como hasta ahora.

**Tech Stack:** React 19, Vite 7, TypeScript 5.8, vitest + @testing-library/react (jsdom), CSS custom properties, `motion` (^12).

**Spec:** `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§4.1 color, §4.2 tipografía, §4.3 superficies y controles, §4.7 movimiento, §8 decisiones 3, 9 y 11).

## Global Constraints

- Nombres de token existentes se conservan (`--canvas`, `--background`, `--card`, `--muted`, `--muted-foreground`, `--destructive`, `--success`, `--warning`, `--primary`, `--border`, `--ring`); se añaden solo `--surface-2`, `--data` y los de movimiento `--dur-1..4`. (§8.11)
- Oscuro por defecto en `:root, [data-theme="dark"]`; claro bajo `[data-theme="light"]`; los dos bloques declaran exactamente los mismos nombres (`tokens.test.ts`).
- Geist y Geist Mono autoalojadas; ninguna fuente de Google en la app. (`tokens.test.ts`)
- Duraciones: 120 ms respuesta, 240 ms cambio de estado, 480 ms entrada de panel u hoja, 900 ms solo landing; curva única `cubic-bezier(0.16, 1, 0.3, 1)`; `prefers-reduced-motion: reduce` deja solo cambios de opacidad. (§4.7)
- Radios: 11 px controles, 12 px tarjetas y hojas, 999 px píldoras. Sombras con desplazamiento: primario `0 8px 24px rgba(59,139,255,.30)`, hoja `-30px 0 80px rgba(0,0,0,.50)`. (§4.3)
- Alturas de control: 34 / 38 / 44 px (barras / normal / acción principal). (§4.3)
- Etiquetas de campo: 13 px, peso 500, `--muted-foreground`, sin mayúsculas. (§4.2)
- Rojo (`--destructive`) nunca es acción salvo destructiva; `--data` para cifras y enlaces en oscuro. (§4.1)
- Ninguna pantalla de gestión ni el shell usa un color literal (`tokens.test.ts`); los componentes base tampoco: todo por `var(--…)`.
- Los tests existentes del frontend siguen verdes; los que fijan valores viejos se actualizan en la misma tarea que cambia el valor.
- Commits por lista explícita de ficheros; nunca `git add -A`.

## Review Focus

1. **Usuario con `prefers-reduced-motion`:** las hojas y pestañas deben aparecer en su sitio sin deslizarse y sin quedarse invisibles (opacidad final 1). Test en Tarea 8 (Sheet) y regla global en Tarea 2.
2. **Tema claro:** los grises nuevos (`#3C4450`, `#5B6470`) sobre `#F6F7F9` y los estados oscuros sobre fondos pálidos deben cumplir 4,5:1. Test de contraste en Tarea 1.
3. **Foco por teclado:** el anillo de 2 px en `--ring` debe seguir visible sobre un botón primario azul (mismo tono) → offset de 2 px y sombra del botón no lo tapan. Test en Tarea 4.
4. **Botón con `style={{ flex: 1 }}`:** al quitar el envoltorio BorderBeam, las propiedades de layout deben seguir aplicándose al propio botón. Test en Tarea 4.
5. **Dos hojas abiertas (ficha del paciente encima de la del caso):** Escape sigue cerrando solo la de encima aunque ahora la hoja se anime al salir. Test en Tarea 8.

---

### Task 1: Tokens de color (oscuro y claro) y radios, sombras, alturas

**Files:**
- Modify: `frontend/src/styles/tokens/colors.css`
- Modify: `frontend/src/styles/tokens/spacing.css`
- Modify: `frontend/src/styles/tokens/typography.css`
- Test: `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Produces: tokens CSS `--surface-2`, `--data` (ambos temas); valores nuevos de `--canvas` claro, `--primary` claro, `--accent`, `--muted-foreground` claro, `--destructive-bg` oscuro; `--radius-md: 11px`, `--radius-lg: 12px`, `--radius-xl: 12px`; `--shadow-primary`, `--shadow-sheet`; `--control-sm: 34px`, `--control-md: 38px`, `--control-lg: 44px`; `--text-label: 13px`, `--weight-label: 500`.

- [ ] **Step 1: Añadir a `tokens.test.ts` los tests que fallan**

```ts
it("los tokens nuevos existen en los dos temas con los valores de la dirección A", () => {
  const dark = block(DARK), light = block('[data-theme="light"]');
  expect(dark).toMatch(/--surface-2:\s*#0E1014/i);
  expect(light).toMatch(/--surface-2:\s*#FFFFFF/i);
  expect(dark).toMatch(/--data:\s*#8CBBFF/i);
  expect(light).toMatch(/--data:\s*#1F5FC0/i);
  expect(light).toMatch(/--canvas:\s*#F6F7F9/i);
  expect(light).toMatch(/--primary:\s*#0A66FF/i);
  expect(light).toMatch(/--muted-foreground:\s*#5B6470/i);
  expect(light).toMatch(/--accent:\s*#EEF4FF/i);
});
it("radios, sombras y alturas son los de la dirección A", () => {
  const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8");
  expect(spacing).toMatch(/--radius-md:\s*11px/);
  expect(spacing).toMatch(/--radius-lg:\s*12px/);
  expect(spacing).toMatch(/--radius-xl:\s*12px/);
  expect(spacing).toMatch(/--shadow-primary:\s*0 8px 24px rgba\(59, ?139, ?255, ?0?\.30?\)/);
  expect(spacing).toMatch(/--shadow-sheet:\s*-30px 0 80px rgba\(0, ?0, ?0, ?0?\.50?\)/);
  expect(spacing).toMatch(/--control-sm:\s*34px/);
  expect(spacing).toMatch(/--control-md:\s*38px/);
  expect(spacing).toMatch(/--control-lg:\s*44px/);
});
it("la etiqueta de campo es de 13 px y peso 500", () => {
  const typo = readFileSync(join(__dirname, "tokens/typography.css"), "utf8");
  expect(typo).toMatch(/--text-label:\s*13px/);
  expect(typo).toMatch(/--weight-label:\s*500/);
});
it("el claro cumple 4,5:1 en texto secundario y estados sobre sus fondos", () => {
  // contraste WCAG calculado sobre los hex del bloque claro
  const l = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a: string, b: string) => { const [x, y] = [l(a), l(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  expect(ratio("#5B6470", "#F6F7F9")).toBeGreaterThanOrEqual(4.5);
  expect(ratio("#15803D", "#DCFCE7")).toBeGreaterThanOrEqual(4.5);
  expect(ratio("#B91C1C", "#FEE2E2")).toBeGreaterThanOrEqual(4.5);
  expect(ratio("#92400E", "#FEF3C7")).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd frontend && npx vitest run src/styles/tokens.test.ts`
Expected: FAIL en los cuatro tests nuevos (tokens ausentes o con valor viejo).

- [ ] **Step 3: Editar `colors.css`**

Oscuro: añadir `--surface-2: #0E1014;` y `--data: #8CBBFF;`; `--destructive-bg: rgba(255, 90, 95, 0.16)`. Claro: añadir `--surface-2: #FFFFFF;`, `--data: #1F5FC0;`; cambiar `--canvas: #F6F7F9`, `--primary: #0A66FF`, `--primary-hover: #0047B3`, `--accent: #EEF4FF`, `--accent-foreground: #0A66FF`, `--brand-subtle: #EEF4FF`, `--brand-subtle-foreground: #0A66FF`, `--muted-foreground: #5B6470`, `--destructive: #B91C1C`, `--ring: #0A66FF`. Actualizar el comentario de cabecera (los nombres se conservan; `--data` para cifras y enlaces en oscuro).

- [ ] **Step 4: Editar `spacing.css`**

`--radius-md: 11px`, `--radius-lg: 12px`, `--radius-xl: 12px`; añadir `--shadow-primary: 0 8px 24px rgba(59, 139, 255, 0.30);` y `--shadow-sheet: -30px 0 80px rgba(0, 0, 0, 0.50);` (en `:root`, y en `[data-theme="light"]` `--shadow-primary: 0 8px 22px rgba(10, 102, 255, 0.26);`, `--shadow-sheet: -30px 0 80px rgba(11, 12, 15, 0.22);`); `--control-sm: 34px`, `--control-md: 38px`, `--control-lg: 44px`.

- [ ] **Step 5: Editar `typography.css`**

`--text-label: 13px;` y añadir `--weight-label: 500;` junto a los pesos. Actualizar el comentario de escala.

- [ ] **Step 6: Ejecutar los tests de tokens y la suite entera**

Run: `cd frontend && npx vitest run src/styles/tokens.test.ts` → PASS.
Run: `cd frontend && npx vitest run` → todos verdes (ningún test fija los radios o alturas viejos; si alguno falla por `--control-*`, ajustarlo en esta tarea).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/tokens/colors.css frontend/src/styles/tokens/spacing.css frontend/src/styles/tokens/typography.css frontend/src/styles/tokens.test.ts
git commit -m "Tokens: valores de la dirección A (claro afinado, --surface-2, --data, radios 11/12, sombras con desplazamiento, alturas 34/38/44)"
```

---

### Task 2: Tokens de movimiento y reducción de movimiento global

**Files:**
- Modify: `frontend/src/styles/tokens/spacing.css` (bloque Motion)
- Modify: `frontend/src/styles/base.css`
- Test: `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Produces: `--dur-1: 120ms`, `--dur-2: 240ms`, `--dur-3: 480ms`, `--dur-4: 900ms`; alias `--dur-fast: var(--dur-1)`, `--dur-base: var(--dur-2)`, `--dur-slow: var(--dur-3)`, `--dur-slowest: var(--dur-4)`; `--ease-out` sin cambios; regla global `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 1: Test que falla**

```ts
it("las duraciones son 120/240/480/900 y los nombres viejos son alias", () => {
  const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8");
  expect(spacing).toMatch(/--dur-1:\s*120ms/); expect(spacing).toMatch(/--dur-2:\s*240ms/);
  expect(spacing).toMatch(/--dur-3:\s*480ms/); expect(spacing).toMatch(/--dur-4:\s*900ms/);
  expect(spacing).toMatch(/--dur-base:\s*var\(--dur-2\)/);
  expect(spacing).toMatch(/--ease-out:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
});
it("con prefers-reduced-motion solo queda la opacidad", () => {
  const base = readFileSync(join(__dirname, "base.css"), "utf8").replace(/\r\n/g, "\n");
  const i = base.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(i).toBeGreaterThan(-1);
  const rule = base.slice(i, base.indexOf("\n}\n", i));
  expect(rule).toMatch(/animation-duration:\s*0\.01ms !important/);
  expect(rule).toMatch(/transition-property:\s*opacity, color, background-color !important/);
  expect(rule).toMatch(/scroll-behavior:\s*auto !important/);
});
```

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npx vitest run src/styles/tokens.test.ts` → FAIL.

- [ ] **Step 3: Editar el bloque Motion de `spacing.css`** con los cuatro tokens nuevos y los alias; conservar `--ease-in-out`.

- [ ] **Step 4: Añadir al final de `base.css`** una regla `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; transition-property: opacity, color, background-color !important; scroll-behavior: auto !important; } }` con el comentario de §4.7. Quitar el `@media (prefers-reduced-motion: no-preference)` anidado de `.reveal` solo si la regla global ya lo cubre (lo cubre: dejarlo es redundante pero inocuo; se quita).

- [ ] **Step 5: Tests** — Run: `npx vitest run src/styles/tokens.test.ts` → PASS; `npx vitest run` → verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/tokens/spacing.css frontend/src/styles/base.css frontend/src/styles/tokens.test.ts
git commit -m "Movimiento: tokens 120/240/480/900 con alias y regla global de prefers-reduced-motion"
```

---

### Task 3: Superficies del navegador (selección, caret, scrollbar, foco)

**Files:**
- Modify: `frontend/src/styles/base.css`
- Test: `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Produces: reglas globales `::selection`, `caret-color`, `scrollbar-color`/`::-webkit-scrollbar*`, `:focus-visible` con `outline: 2px solid var(--ring); outline-offset: 2px`.

- [ ] **Step 1: Test que falla**

```ts
it("las superficies del navegador salen de la paleta", () => {
  const base = readFileSync(join(__dirname, "base.css"), "utf8");
  expect(base).toMatch(/::selection\s*\{[^}]*background:\s*var\(--accent\)/);
  expect(base).toMatch(/caret-color:\s*var\(--primary\)/);
  expect(base).toMatch(/scrollbar-color:\s*var\(--border\) transparent/);
  expect(base).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
});
```

- [ ] **Step 2: Run** `npx vitest run src/styles/tokens.test.ts` → FAIL.

- [ ] **Step 3: Editar `base.css`**: `::selection { background: var(--accent); color: var(--foreground); }`; `input, textarea { caret-color: var(--primary); }`; `* { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }`; `::-webkit-scrollbar { width: 10px; height: 10px; } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: var(--radius-full); border: 2px solid transparent; background-clip: padding-box; } ::-webkit-scrollbar-track { background: transparent; }`. El `:focus-visible` actual ya cumple; no se toca.

- [ ] **Step 4: Run** tests → PASS. **Step 5: Commit**

```bash
git add frontend/src/styles/base.css frontend/src/styles/tokens.test.ts
git commit -m "Base: selección, caret y barras de desplazamiento con la paleta"
```

---

### Task 4: Módulo de movimiento (`motion`) con duraciones, curva y presets

**Files:**
- Modify: `frontend/package.json` (dependencia `motion`)
- Create: `frontend/src/motion/tokens.ts`
- Create: `frontend/src/motion/presets.ts`
- Create: `frontend/src/motion/index.ts`
- Test: `frontend/src/motion/presets.test.ts`

**Interfaces:**
- Produces:
  - `DUR = { respuesta: 0.12, estado: 0.24, panel: 0.48, landing: 0.9 } as const` (segundos, como usa `motion`).
  - `EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]`.
  - `pressable = { whileTap: { scale: 0.98 }, transition: { duration: DUR.respuesta, ease: EASE } }`.
  - `panelSwap: Variants = { initial: { opacity: 0, x: 8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 } }` con `panelTransition = { duration: DUR.estado, ease: EASE }`.
  - `sheetSlide: Variants = { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } }` con `sheetTransition = { duration: DUR.panel, ease: EASE }`.
  - `scrimFade: Variants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }`.
  - `index.ts` reexporta `motion`, `AnimatePresence`, `useReducedMotion`, `MotionConfig` de `motion/react` junto con lo anterior, para que el resto de la app importe solo de `../motion`.

- [ ] **Step 1: Instalar** — Run: `cd frontend && npm install motion@^12` ; comprobar que `package.json` lista `"motion": "^12.x"`.

- [ ] **Step 2: Test que falla**

```ts
import { describe, expect, it } from "vitest";
import { DUR, EASE, panelSwap, panelTransition, pressable, sheetSlide, sheetTransition } from "./presets";

describe("presets de movimiento", () => {
  it("usa las duraciones y la curva de la especificación", () => {
    expect(DUR).toEqual({ respuesta: 0.12, estado: 0.24, panel: 0.48, landing: 0.9 });
    expect(EASE).toEqual([0.16, 1, 0.3, 1]);
    expect(pressable.whileTap).toEqual({ scale: 0.98 });
    expect(pressable.transition.duration).toBe(0.12);
    expect(panelTransition.duration).toBe(0.24);
    expect(sheetTransition.duration).toBe(0.48);
  });
  it("el panel cruza con 8 px y la hoja entra desde el borde derecho", () => {
    expect(panelSwap.initial).toEqual({ opacity: 0, x: 8 });
    expect(panelSwap.exit).toEqual({ opacity: 0, x: -8 });
    expect(sheetSlide.initial).toEqual({ x: "100%" });
    expect(sheetSlide.animate).toEqual({ x: 0 });
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/motion` → FAIL (módulo no existe).

- [ ] **Step 4: Crear `tokens.ts`, `presets.ts`, `index.ts`** con las firmas del bloque Interfaces (tipos `Variants` y `Transition` de `motion/react`).

- [ ] **Step 5: Run** `npx vitest run src/motion` → PASS; `npx tsc -b` sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/motion/tokens.ts frontend/src/motion/presets.ts frontend/src/motion/index.ts frontend/src/motion/presets.test.ts
git commit -m "Movimiento: módulo motion con duraciones, curva y presets (prensado, cruce de panel, hoja)"
```

---

### Task 5: Button sin halo, con sombra, prensado y propiedades de layout en el propio botón

**Files:**
- Modify: `frontend/src/components/Button.tsx`
- Test: `frontend/src/components/Button.test.tsx`

**Interfaces:**
- Consumes: `pressable`, `motion` de `../motion`.
- Produces: `Button` con la misma `ButtonProps` menos `beam` (se elimina; los llamadores que pasen `beam` fallan en `tsc`, y se corrigen en esta tarea con `grep -rn "beam=" src`). Variantes: `default` (fondo `--primary`, `boxShadow: var(--shadow-primary)`, hover `--primary-hover` y `translateY(-1px)`), `outline` (borde `--border`, fondo `rgba(255,255,255,0.03)` → usar `var(--glass)`? no: `transparent`), `secondary` (fondo `--card`, borde `--border`, sin blur), `ghost`, `destructive` (borde `--destructive` al 35 %, texto `--destructive`, fondo transparente; relleno solo en hover), `link` (texto `--data`). Tamaños: `sm` 34, `md` 38, `lg` 44, `icon` 38. Peso 600 en `default`/`destructive`, 500 en el resto. Radio `--radius-md`.

- [ ] **Step 1: Tests que fallan (sustituir el test del halo si lo hubiera y añadir)**

```ts
it("el primario lleva la sombra con desplazamiento y no un halo", () => {
  render(<ThemeProvider><Button>Guardar</Button></ThemeProvider>);
  const b = screen.getByRole("button", { name: "Guardar" });
  expect(b.style.boxShadow).toContain("--shadow-primary");
  expect(b.parentElement?.tagName).not.toBe("DIV"); // sin envoltorio BorderBeam
});
it("las propiedades de layout se aplican al propio botón", () => {
  render(<ThemeProvider><Button style={{ flex: 1, marginTop: 6 }}>Entrar</Button></ThemeProvider>);
  const b = screen.getByRole("button", { name: "Entrar" });
  expect(b.style.flex).toBe("1");
  expect(b.style.marginTop).toBe("6px");
});
it("el enlace usa el color de dato y el destructivo no va relleno en reposo", () => {
  render(<ThemeProvider><Button variant="link">Ver</Button><Button variant="destructive">Borrar</Button></ThemeProvider>);
  expect(screen.getByRole("button", { name: "Ver" }).style.color).toContain("--data");
  expect(screen.getByRole("button", { name: "Borrar" }).style.background).toBe("transparent");
});
it("las alturas salen de los tokens de control", () => {
  render(<ThemeProvider><Button size="lg">Acción</Button></ThemeProvider>);
  expect(screen.getByRole("button").style.height).toContain("--control-lg");
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/Button.test.tsx` → FAIL.

- [ ] **Step 3: Reescribir `Button.tsx`**: `motion.button` con `{...pressable}` cuando no está deshabilitado; quitar `BorderBeam`, `splitLayout`, `LAYOUT_KEYS` y la prop `beam`; `variantStyle` con los valores del bloque Interfaces; transición CSS `transform var(--dur-1) var(--ease-out), background var(--dur-1) …, box-shadow var(--dur-1) …`; hover del primario con `transform: translateY(-1px)` y `boxShadow: var(--shadow-primary)`. Mantener `data-variant`, `data-size`, `leadingIcon`, `trailingIcon`. Buscar y quitar `beam=` en los llamadores.

- [ ] **Step 4: Run** `npx vitest run src/components/Button.test.tsx` → PASS; `npx vitest run` → verde; `npx tsc -b` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Button.tsx frontend/src/components/Button.test.tsx
git commit -m "Button: sombra con desplazamiento y prensado en lugar del halo; layout en el propio botón"
```

---

### Task 6: Badge con el peso y los colores de la dirección

**Files:**
- Modify: `frontend/src/components/Badge.tsx`
- Test: `frontend/src/components/Badge.test.tsx` (crear)

**Interfaces:**
- Produces: `Badge` con las mismas variantes; añade `"data"` (fondo `--accent`, texto `--data`); `fontWeight: 600`, `padding: "3px 8px"`, `fontSize: 11`.

- [ ] **Step 1: Test que falla**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, riskVariant } from "./Badge";

describe("Badge", () => {
  it("peso 600 y la variante data usa --data sobre --accent", () => {
    render(<Badge variant="data">1.º</Badge>);
    const b = screen.getByText("1.º");
    expect(b.style.fontWeight).toBe("600");
    expect(b.style.color).toContain("--data");
    expect(b.style.background).toContain("--accent");
  });
  it("mapea el riesgo clínico", () => {
    expect(riskVariant("Alto")).toBe("destructive");
    expect(riskVariant("Moderado")).toBe("warning");
    expect(riskVariant("Bajo")).toBe("success");
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Editar `Badge.tsx`** (variante `data`, peso 600, padding). **Step 4: Run** → PASS. **Step 5: Commit**

```bash
git add frontend/src/components/Badge.tsx frontend/src/components/Badge.test.tsx
git commit -m "Badge: peso 600, variante data"
```

---

### Task 7: Input con etiqueta en minúscula, fondo de lienzo y anillo de foco en el contorno

**Files:**
- Modify: `frontend/src/components/Input.tsx`
- Test: `frontend/src/components/Input.test.tsx`

**Interfaces:**
- Produces: misma `InputProps`; etiqueta `fontSize: "var(--text-label)"`, `fontWeight: "var(--weight-label)"`, sin `textTransform`, sin `letterSpacing`; contorno con fondo `var(--canvas)`, borde `var(--input)`; con foco dentro (`onFocus`/`onBlur` en el campo → estado `focused`) el contorno pasa a `border: 1px solid var(--primary)` y `boxShadow: 0 0 0 4px var(--accent)`; el campo sigue sin `outline`/`boxShadow` propios (el test del anillo global se mantiene: el anillo va en el **contorno**, no en el campo, y no usa `--ring`).

- [ ] **Step 1: Tests que fallan (añadir; mantener los existentes)**

```ts
it("la etiqueta va en minúscula, 13 px y peso 500", () => {
  render(<Input label="Historia clínica" />);
  const label = screen.getByText("Historia clínica");
  expect(label.style.textTransform).toBe("");
  expect(label.style.fontSize).toContain("--text-label");
  expect(label.style.fontWeight).toContain("--weight-label");
});
it("al enfocar, el contorno toma el borde primario y el anillo de acento", () => {
  render(<Input label="Nombre" />);
  const field = screen.getByLabelText("Nombre");
  const wrapper = field.parentElement as HTMLElement;
  fireEvent.focus(field);
  expect(wrapper.style.border).toContain("--primary");
  expect(wrapper.style.boxShadow).toContain("--accent");
  fireEvent.blur(field);
  expect(wrapper.style.border).toContain("--input");
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/Input.test.tsx` → FAIL.

- [ ] **Step 3: Editar `Input.tsx`** según Interfaces (estado `focused` con `useState`; encadenar `onFocus`/`onBlur` del llamador).

- [ ] **Step 4: Run** → PASS (incluido «leaves the focus ring to the global rule», que no comprueba `--accent`). **Step 5: Commit**

```bash
git add frontend/src/components/Input.tsx frontend/src/components/Input.test.tsx
git commit -m "Input: etiqueta en minúscula y anillo de foco en el contorno"
```

---

### Task 8: Tabs con subrayado que se desliza

**Files:**
- Modify: `frontend/src/components/Tabs.tsx`
- Test: `frontend/src/components/Tabs.test.tsx` (crear)

**Interfaces:**
- Consumes: `motion` de `../motion`.
- Produces: misma firma de `Tabs`; el botón activo lleva `aria-selected="true"` y `role="tab"`, el contenedor `role="tablist"`; el subrayado es un `motion.span` con `layoutId` único por instancia (`useId()`), `height: 2px` (1,5 en `sm`), `background: var(--primary)`, `transition={{ duration: DUR.estado, ease: EASE }}`; el botón activo pesa 600, el resto 500; el color activo `--foreground`, inactivo `--muted-foreground`.

- [ ] **Step 1: Test que falla**

```ts
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  it("expone la pestaña activa y cambia al pulsar", () => {
    let value = "Métricas";
    const { rerender } = render(<Tabs tabs={["Métricas", "Índices"]} value={value} onChange={(t) => { value = t; }} />);
    expect(screen.getByRole("tab", { name: "Métricas" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Índices" }));
    rerender(<Tabs tabs={["Métricas", "Índices"]} value={value} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Índices" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Índices" }).style.fontWeight).toBe("600");
  });
  it("el subrayado es un solo elemento que vive bajo la pestaña activa", () => {
    render(<Tabs tabs={["A", "B", "C"]} value="B" onChange={() => {}} />);
    const under = document.querySelectorAll("[data-tab-underline]");
    expect(under).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "B" }).contains(under[0])).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Reescribir `Tabs.tsx`** según Interfaces (el `motion.span` con `data-tab-underline` dentro del botón activo, `position: absolute; left: 0; right: 0; bottom: -1px`; botones con `position: relative`). **Step 4: Run** → PASS; `npx vitest run` → verde (Morfometría y Dispositivos usan Tabs: ningún test suyo fija el borde). **Step 5: Commit**

```bash
git add frontend/src/components/Tabs.tsx frontend/src/components/Tabs.test.tsx
git commit -m "Tabs: subrayado deslizante, roles de pestaña"
```

---

### Task 9: Sheet sólida que entra desde la derecha y enfoca el primer campo

**Files:**
- Modify: `frontend/src/components/Sheet.tsx`
- Test: `frontend/src/components/Sheet.test.tsx`

**Interfaces:**
- Consumes: `AnimatePresence`, `motion`, `sheetSlide`, `sheetTransition`, `scrimFade`, `useReducedMotion` de `../motion`.
- Produces: misma firma de `Sheet`; `width` por defecto 460; panel `background: var(--card)` sin `backdropFilter`, `borderRadius: 0`, `boxShadow: var(--shadow-sheet)`; scrim `rgba(0,0,0,0.55)` → usar `color-mix(in srgb, var(--canvas) 55%, transparent)`; cabecera con título 18 px / 600; pie opcional: nueva prop `footer?: ReactNode` que se pinta fijo abajo con `borderTop: 1px solid var(--border)`; al abrir, foco en el primer `input, textarea, select, button:not([aria-label="Cerrar"])` del contenido y, si no hay, en el panel. Con `AnimatePresence` el componente devuelve el portal también cuando `open` pasa a `false` hasta que termina la salida; `renders nothing while closed` sigue válido porque el montaje inicial con `open=false` no pinta nada.

- [ ] **Step 1: Tests que fallan (añadir)**

```ts
it("enfoca el primer campo al abrir", () => {
  render(<Sheet open onClose={() => {}} title="Nuevo paciente"><input aria-label="Apellidos" /><input aria-label="Nombre" /></Sheet>);
  expect(document.activeElement).toBe(screen.getByLabelText("Apellidos"));
});
it("pinta el pie fijo cuando se le pasa", () => {
  render(<Sheet open onClose={() => {}} title="Nuevo paciente" footer={<button>Crear paciente</button>}><p>campos</p></Sheet>);
  expect(screen.getByRole("button", { name: "Crear paciente" })).toBeInTheDocument();
});
it("la superficie es sólida y la sombra tiene desplazamiento", () => {
  render(<Sheet open onClose={() => {}} title="Ficha"><p>x</p></Sheet>);
  const panel = screen.getByRole("dialog");
  expect(panel.style.background).toContain("--card");
  expect(panel.style.backdropFilter).toBe("");
  expect(panel.style.boxShadow).toContain("--shadow-sheet");
});
it("con dos hojas abiertas, Escape cierra solo la de encima", () => {
  const closed: string[] = [];
  render(<>
    <Sheet open onClose={() => closed.push("abajo")} title="Abajo"><p>a</p></Sheet>
    <Sheet open onClose={() => closed.push("arriba")} title="Arriba"><p>b</p></Sheet>
  </>);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(closed).toEqual(["arriba"]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/Sheet.test.tsx` → FAIL.

- [ ] **Step 3: Reescribir `Sheet.tsx`** según Interfaces: `createPortal(<AnimatePresence>{open && (<div …><motion.div variants={scrimFade} …/><motion.div role="dialog" variants={sheetSlide} transition={reduced ? { duration: 0 } : sheetTransition} …/></div>)}</AnimatePresence>, document.body)`; conservar la pila `openSheets` y el efecto de Escape; el enfoque inicial busca el primer campo con `panelRef.current?.querySelector(...)`.

- [ ] **Step 4: Run** → PASS; `npx vitest run` → verde (AttachCaseSheet, ShareSheet, ChangePasswordSheet usan Sheet).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sheet.tsx frontend/src/components/Sheet.test.tsx
git commit -m "Sheet: superficie sólida, entrada deslizante, pie fijo y foco en el primer campo"
```

---

### Task 10: Comprobación de conjunto y nota en el documento de diseño

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (añadir al final de §7 una línea: «Fase 1 completada el <fecha>: tokens, movimiento y componentes base; ver plan …»)

- [ ] **Step 1: Suite completa, tipos y lint**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src --max-warnings=0`
Expected: todo verde.

- [ ] **Step 2: Arrancar la app y mirar tres pantallas** (`npm run dev` ya corre en :5173): Pacientes (botones y tabla con las alturas nuevas), Nuevo paciente (hoja sólida entrando, foco en Apellidos) y Morfometría (pestañas con subrayado deslizante). Corregir en esta tarea cualquier desbordamiento que provoquen las alturas 34/38/44 en barras existentes (la barra superior del workspace tiene 66 px; cabe).

- [ ] **Step 3: Commit de la nota**

```bash
git add docs/superpowers/specs/2026-10-30-rediseno-visual-design.md
git commit -m "Diseño: fase 1 (tokens, movimiento, componentes base) completada"
```

---

## Autorrevisión

- **Cobertura de la especificación (fase 1):** §4.1 color → T1; §4.2 tipografía (etiquetas) → T1 y T7; §4.3 radios, sombras, botones, insignias → T1, T5, T6; §4.7 movimiento → T2 y T4; superficies del navegador (craft) → T3; hojas → T9; pestañas → T8. La escala de títulos (76/40/28/18) y el HUD no se tocan en esta fase: pertenecen a landing (fase 5) y pipeline (fase 3).
- **Pasos:** cada test lleva nombre y aserciones con valores; cada paso de código lleva firma y valores; ningún paso dice «ajustar según convenga».
- **Consistencia de nombres:** `DUR`, `EASE`, `pressable`, `panelSwap`, `panelTransition`, `sheetSlide`, `sheetTransition`, `scrimFade` se definen en T4 y se consumen en T5, T8 y T9 con esos nombres; `--shadow-primary`, `--shadow-sheet`, `--surface-2`, `--data`, `--weight-label` se definen en T1 y se usan en T5–T9.
- **Review Focus:** los cinco riesgos tienen test en T1, T2 (regla global), T5 (layout y foco), T9 (dos hojas, movimiento reducido vía `useReducedMotion`).
- **Proporción:** el plan tiene unas 300 líneas para unos 8 ficheros de producto y 6 de test; los cuerpos de función no están escritos.
