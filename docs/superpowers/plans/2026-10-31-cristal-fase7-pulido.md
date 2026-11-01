# Cristal D · Fase 7 (pulido) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el rediseño D: contraste y foco en todo el cristal, movimiento y transparencia reducidos, coste del desenfoque, coma decimal en las cifras del panel y documentación.

**Architecture:** Auditorías con tests estáticos (lectura de ficheros como `tokens.test.ts`) y tests de componentes; un interruptor de rendimiento por token (`--glass-blur-viewer`) en vez de lógica por pantalla; un formateador numérico único en `lib/`.

**Tech Stack:** React 19, vitest + Testing Library, CSS con tokens.

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §2, §4, §9 fase 7; §8.6 del documento anterior (coma/punto en Métricas).

## Global Constraints

- Texto ≥ 4,5:1 contra el peor fondo detrás del cristal; foco visible (anillo `--ring` de 2 px) en todo control.
- `prefers-reduced-motion: reduce` → solo opacidad; `prefers-reduced-transparency: reduce` → cristal opaco (`--glass-solid`) y sin imagen de `Entorno`.
- No se cambian textos clínicos salvo el separador decimal, y cada test afectado cambia en la misma tarea.
- Commits por lista explícita; nunca `git add -A`.

## Review Focus

1. Una cifra negativa o nula en Métricas (`null`, `NaN`) no se pinta como «NaN» ni «-0,0» (test en la tarea 3).
2. Un control de solo icono sin nombre accesible (test estático en la tarea 1).
3. Un `backdrop-filter` en línea sin `data-glass` (no tendría reserva opaca) (test estático en la tarea 1).
4. El visor con el dock encima en un portátil sin GPU: el desenfoque del dock puede bajarse a 0 sin tocar componentes (tarea 2).
5. Animaciones de `motion` que ignoran el movimiento reducido (test en la tarea 2).

---

### Task 1: Auditoría estática de cristal, contraste y nombres accesibles

**Files:**
- Create: `frontend/src/styles/cristal.audit.test.ts`
- Modify: los componentes que la auditoría señale

**Interfaces:**
- Produces: test que recorre `src/**/*.tsx` (sin tests) y falla si: (a) un estilo con `backdropFilter` no está en un elemento con `data-glass` en el mismo JSX o no usa `glass()`; (b) un `<button` cuyo contenido es solo `<Icon` no tiene `aria-label`; (c) aparece `var(--hud)` o `var(--hud-dim)` fuera de los ficheros permitidos de la fase 4. Más un test de contraste que, con los hex de `colors.css`, comprueba en oscuro `--muted-foreground`, `--data`, `--destructive-text`, `--warning` y `--success` contra el peor fondo de cristal (cálculo de la tarea 2 de la fase 1) y en claro contra `--glass-solid`.

- [ ] **Step 1: Escribir el test y verlo fallar** donde haya incumplimientos.
- [ ] **Step 2: Arreglar cada incumplimiento** en su componente.
- [ ] **Step 3: Ver que pasa;** `npx tsc -b`.
- [ ] **Step 4: Commit** — «Pulido D: auditoría de cristal, contraste y nombres accesibles».

### Task 2: Movimiento reducido, transparencia reducida y coste del desenfoque

**Files:**
- Modify: `frontend/src/styles/base.css`, `frontend/src/styles/tokens/colors.css`, `frontend/src/styles/tokens.test.ts`, los componentes con `motion` que no respeten `MotionConfig reducedMotion="user"` (buscar `animate=` con `scale`/`x`/`y` fuera de `MotionConfig`)

**Interfaces:**
- Produces: regla `@media (prefers-reduced-transparency: reduce)` que además fija `--glass-blur: 0px; --glass-blur-viewer: 0px`; clase raíz `html[data-blur="bajo"]` que fija `--glass-blur-viewer: 0px` y `--glass-blur: 12px` (preparada para un interruptor de rendimiento; se documenta, sin UI nueva).
- Test: `tokens.test.ts` comprueba ambas reglas; un test que renderiza `StepDock` y `CommandPalette` con `useReducedMotion` a `true` y verifica que no hay transformaciones de escala aplicadas.

- [ ] **Step 1: Tests que fallan.**
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Ver que pasan;** `npx tsc -b`.
- [ ] **Step 4: Commit** — «Pulido D: transparencia y movimiento reducidos, desenfoque ajustable».

### Task 3: Coma decimal única en las cifras del panel

**Files:**
- Create: `frontend/src/lib/numero.ts`, `numero.test.ts`
- Modify: los componentes de `components/morphometry/` (Métricas, Odómetro si formatea), `components/planning/` y `components/patients/` que formatean milímetros o índices con `toFixed`; sus tests

**Interfaces:**
- Produces: `cifra(v: number | null | undefined, decimales = 1): string` → `"11,0"`; `null`/`undefined`/`NaN` → `"—"`; `-0` → `"0,0"`; `mm(v, decimales = 1): string` → `"11,0 mm"` o `"—"`.

- [ ] **Step 1: Tests** de `numero.test.ts` con esos casos; en los tests de Métricas, la cifra del Ø máximo se lee «11,0».
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar y sustituir** cada `toFixed` de cifras clínicas visibles por `cifra`/`mm` (no tocar valores que viajan a la API ni a ficheros).
- [ ] **Step 4: Ver que pasan;** `npx tsc -b`.
- [ ] **Step 5: Commit** — «Pulido D: coma decimal única en las cifras clínicas».

### Task 4: Documentación y cierre del rediseño

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` (§9 con la nota de cierre de la fase 7 y la lista de desviaciones de las siete fases), `frontend/README.md` o el README del repositorio si describe la interfaz (sección breve «Interfaz: dirección D, Quirófano de cristal» con tokens, `glass()`, `Entorno`, paleta ⌘K y breakpoints)

- [ ] **Step 1:** `npx vitest run` completo, `npx tsc -b` y `npm run build` verdes.
- [ ] **Step 2:** Escribir la documentación.
- [ ] **Step 3: Commit** — «Diseño: rediseño D completado; documentación de la interfaz».

### Task 5: Restos diferidos de las fases 1–6 (se ejecuta antes de la tarea 4)

Añadida por el controlador el 2026-10-31 con los menores visibles que las revisiones de las fases 1–6 aparcaron para el pulido.

**Files:**
- Modify: los componentes nombrados; sus tests

**Interfaces:**
- Consumes: tokens de `styles/tokens/*.css` (fase 1), `--hud-text`/`--hud-text-dim` (fase 4), `useMediaQuery` (fase 4).

- [ ] **Step 1: Tokens y literales.** `components/planning/DevicesPanel.tsx` usa `var(--text-muted)`, que no existe (≈ líneas 1071, 1104, 1117, 1295): cámbialo por `var(--muted-foreground)`. Los `#000` que quedan en `HudLadder`, `ShortcutsSheet`, `MipView`, `ObliqueView` y la celda de `ViewerGrid` (y `CapturePicker` si es fondo de imagen) pasan a un token (`--viewer-bg` u otro existente del visor; si no hay, se crea en `colors.css` con el mismo valor en los dos temas). Añade a `tokens.test.ts` un test que falle si un `var(--nombre)` usado en `src/**/*.tsx|ts|css` no está definido en `styles/tokens/*.css` ni en otra hoja (`base.css`, `landing.css`, `office.css`…) ni en un `style` en línea (`"--nombre":`).
- [ ] **Step 2: Glifos.** Las flechas y `≥ ≤ ≈ → ←` caen a la fuente del sistema porque los paquetes de fontsource cargan solo el subconjunto latín: importa además el subconjunto que los contiene (`latin-ext` no basta; fontsource expone `symbols`/`math` o el fichero «-all» según el paquete; comprueba qué hay en `node_modules/@fontsource*/inter` y `jetbrains-mono`). Si el subconjunto no existe, documenta el hallazgo en el informe y no hagas nada más.
- [ ] **Step 3: Migas del quirófano.** La fase 4 dejó de enseñar el número de historia clínica (HC) del paciente en las migas del pipeline: vuelve a mostrarlo junto al nombre si el paciente lo tiene (mira cómo lo pintaba `main` antes de la fase 4 con `git log -S "hc" -- frontend/src/pages`), con test.
- [ ] **Step 4: Oficina.** El `aria-label` de la sección «Cuentas pendientes» tapa su contador para lectores de pantalla (que el nombre accesible incluya la cifra, o quitar el aria-label si el texto visible basta); doble línea bajo la cabecera de la tabla de Usuarios (`borderBottom` del `th` + `border-top` de `office.css`): deja una.
- [ ] **Step 5: Landing.** Entre 761 y ~800 px la pastilla de la nav se parte en dos filas: sube el punto de plegado a la anchura donde ya no cabe (actualiza `NavPildora.test` y el `@media` correspondiente); el menú plegado se cierra también al tocar fuera y al hacer scroll.
- [ ] **Step 6: Tests** de cada arreglo; `npx vitest run` de los ficheros tocados y `npx tsc -b`.
- [ ] **Step 7: Commit** — «Pulido D: restos de las fases 1–6».
