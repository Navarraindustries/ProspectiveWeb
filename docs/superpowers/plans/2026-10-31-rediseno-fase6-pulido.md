> **SUSTITUIDO (31-10-2026):** este plan pertenece a la dirección A y no se ejecuta. Lo reemplazan los planes del documento `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` (dirección D, «Quirófano de cristal»).

# Rediseño visual · Fase 6 (pulido, accesibilidad, rendimiento y tests) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar lo que las fases 1–5 dejaron «aparcado para la fase 6»: contraste 4,5:1 en los dos temas, foco visible en todo control nuevo, movimiento reducido completo, teclado en pestañas, `type="button"` donde falta, `LazyMotion` para no cargar `motion` entero en el bundle principal, encabezados accesibles en la oficina, y una pasada de tests que pinen lo que quedó sin cubrir.

**Architecture:** Cambios pequeños y transversales sobre lo ya construido; ninguna pantalla cambia de disposición. Un test de contraste único (`styles/contraste.test.ts`) calcula WCAG sobre los pares de tokens reales de `colors.css` en los dos temas. `motion` pasa a `LazyMotion` + `m` con `domAnimation` en el barrel. Los encabezados de página de la oficina se dan por la miga (`h1` visualmente oculto en `TopBar`).

**Tech Stack:** React 19, Vite 7, TypeScript 5.8, vitest + Testing Library, `motion` 12.

**Spec:** `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§7.6, §8.12, y los «aparcado para la fase 6» de los libros de las fases 1–5).

## Global Constraints

- Nada cambia de sitio ni de texto salvo lo que un test de esta fase pida; suite completa verde; `npx tsc -b` limpio; `npm run build` sin `three` en `dist`.
- Contraste mínimo 4,5:1 para texto normal sobre su fondo en claro y oscuro; si un token no llega, se ajusta el token (no el consumidor) y se anota el valor nuevo en §8 de la spec.
- Commits por lista; comentarios en castellano.

## Review Focus

1. **Texto blanco sobre `--primary` (#3B8BFF) = 3,3:1:** el primario oscuro no cumple para texto de 13–14 px; decidir token (`--primary` más oscuro en oscuro, o `--primary-foreground` oscuro) y medirlo en el test; T1.
2. **Pestañas con teclado:** flechas izquierda/derecha mueven el foco y seleccionan; `Home`/`End`; tabindex itinerante; T2.
3. **LazyMotion:** ningún `import { motion } from "motion/react"` fuera del barrel; `m` en lugar de `motion`; `strict` activado en desarrollo para cazar usos fuera; T3.
4. **Encabezado accesible de oficina:** cada página de oficina tiene exactamente un `h1` (el último segmento de la miga) y `AdminOnly.test` sigue verde; T4.
5. **Movimiento reducido en vtk:** encendido y dial saltan al estado final (ya en fase 3); un test de `litSequence`/`measureDial` con `reduce` no es posible (puro), así que T5 añade un test del hook/efecto que lee `matchMedia`.

---

### Task 1: Contraste en los dos temas, medido sobre los tokens reales

**Files:**
- Create: `frontend/src/styles/contraste.test.ts`
- Modify: `frontend/src/styles/tokens/colors.css` (solo los tokens que no lleguen)
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§8: punto 13 con los valores ajustados)

**Interfaces:**
- Produces: `contraste.test.ts` lee `colors.css`, extrae los bloques claro (`:root`/`[data-theme="light"]`) y oscuro (`[data-theme="dark"]`), resuelve `var(--x)` anidados y calcula WCAG para los pares: `--foreground`/`--canvas`, `--foreground`/`--card`, `--muted-foreground`/`--card`, `--primary-foreground`/`--primary`, `--data`/`--canvas`, `--accent-foreground`/`--accent`, `--success`/`--success-bg`, `--warning`/`--warning-bg`, `--destructive`/`--destructive-bg`, `--hud-text`/`--viewer-bg`, `--hud-text-dim`/`--viewer-bg`. Exige ≥ 4,5 en todos (≥ 3,0 para `--hud-text-dim`, texto de 10 px que se considera decorativo: anotarlo). Si `--primary-foreground`/`--primary` falla en oscuro: `--primary` oscuro pasa a `#2F7DF0` o `--primary-foreground` a `#0B0C0F` — el implementador mide ambas y elige la que no baje otros pares; se anota.

- [ ] **Step 1: Test que falla** (el par primario oscuro falla hoy a 3,3). **Step 2: Ajustar tokens.** **Step 3: Run** `npx vitest run src/styles` → PASS (incluido `tokens.test.ts`). **Step 4: Commit**

```bash
git add frontend/src/styles/contraste.test.ts frontend/src/styles/tokens/colors.css docs/superpowers/specs/2026-10-30-rediseno-visual-design.md
git commit -m "Pulido: contraste 4,5:1 medido sobre los tokens de los dos temas"
```

---

### Task 2: Teclado en Tabs y `type="button"` donde falta

**Files:**
- Modify: `frontend/src/components/Tabs.tsx`, `frontend/src/components/Tabs.test.tsx`
- Modify: `frontend/src/components/Button.tsx` (`type` por defecto `"button"` salvo que se pase `type="submit"`), `frontend/src/components/Button.test.tsx`

**Interfaces:**
- Produces: `Tabs` con tabindex itinerante (`tabIndex={active ? 0 : -1}`), `onKeyDown` en el `tablist`: `ArrowRight`/`ArrowLeft` (circular), `Home`, `End` mueven el foco y llaman `onChange`; `aria-controls` opcional no se añade (no hay paneles con id). `Button` pone `type="button"` por defecto.

- [ ] **Step 1: Tests que fallan:** Tabs «las flechas mueven la selección y el foco de forma circular» y «Home/End»; Button «por defecto es type=button y respeta type=submit». **Step 2: Implementar.** **Step 3: Run** `npx vitest run src/components/Tabs.test.tsx src/components/Button.test.tsx src/pages src/components/planning` → PASS (ningún formulario dependía de un `Button` sin `type` para enviar: comprobar con `grep -rn "<Button" src | grep -v type` en formularios con `onSubmit`; si alguno enviaba por defecto, añadirle `type="submit"` en esta tarea). **Step 4: Commit**

```bash
git add frontend/src/components/Tabs.tsx frontend/src/components/Tabs.test.tsx frontend/src/components/Button.tsx frontend/src/components/Button.test.tsx
git commit -m "Pulido: pestañas con teclado y type=button por defecto"
```

---

### Task 3: `LazyMotion` y `m` en el barrel

**Files:**
- Modify: `frontend/src/motion/index.ts` (reexporta `m as motion` para no tocar consumidores, más `LazyMotion` y `domAnimation`)
- Modify: `frontend/src/main.tsx` (`<LazyMotion features={domAnimation} strict>` envolviendo `MotionConfig`)
- Create: `frontend/src/motion/lazy.test.ts`

**Interfaces:**
- Produces: `index.ts` reexporta `m as motion` (así `motion.button`, `motion.span`, `motion.div` siguen funcionando con `LazyMotion`), `LazyMotion`, `domAnimation`, y conserva `AnimatePresence`, `useReducedMotion`, `MotionConfig`, `animate`, `useScroll`, `useTransform`, `useMotionValueEvent`, `useMotionValue`, `useSpring` (los que usen las fases 3 y 5). `lazy.test.ts`: `grep` sobre `src/**/*.tsx` (sin `src/motion`) de `from "motion/react"` → ninguno; `main.tsx` contiene `LazyMotion` y `strict`.

- [ ] **Step 1: Test que falla.** **Step 2: Implementar.** **Step 3: Run** `npx vitest run src/motion src/components src/pages` → PASS; `npm run build` y anotar en el informe el tamaño del chunk principal antes/después. **Step 4: Commit**

```bash
git add frontend/src/motion/index.ts frontend/src/motion/lazy.test.ts frontend/src/main.tsx
git commit -m "Pulido: LazyMotion con domAnimation; motion fuera del bundle principal"
```

---

### Task 4: Encabezado accesible en la oficina, `aria-label` de «Ver» y errores de hoja a la vista

**Files:**
- Modify: `frontend/src/components/shell/TopBar.tsx` (el último segmento de la miga se pinta como `<h1 className="shell-crumb" aria-current="page">`), `frontend/src/components/shell/shell.css`
- Modify: `frontend/src/pages/Patients.tsx` («Ver» → `aria-label={`Ver ${aviso.titulo}`}`)
- Test: `frontend/src/components/shell/AppShell.test.tsx` (añadir «la miga termina en un h1»), `frontend/src/pages/AdminOnly.test.tsx` (sin cambios esperados), `frontend/src/pages/Patients.test.tsx` (añadir el `aria-label`)

- [ ] **Step 1: Tests que fallan.** **Step 2: Implementar.** **Step 3: Run** `npx vitest run src/components/shell src/pages` → PASS. **Step 4: Commit**

```bash
git add frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/shell.css frontend/src/components/shell/AppShell.test.tsx frontend/src/pages/Patients.tsx frontend/src/pages/Patients.test.tsx
git commit -m "Pulido: h1 en la miga de la oficina y «Ver» con nombre accesible"
```

---

### Task 5: Movimiento reducido en el visor y cobertura que quedó pendiente

**Files:**
- Create: `frontend/src/vtk/reducedMotion.ts` (+ test): `prefiereMenosMovimiento(): boolean` (lee `matchMedia`; `false` si no existe) — y `Viewer.tsx` lo usa en el encendido y el dial en vez de leer `matchMedia` en línea
- Modify: `frontend/src/components/stepper/StepRail.test.tsx` (test «se detiene en el primer paso no completado»), `frontend/src/pages/UsersAdmin.test.tsx` (tests de `fila-nueva` y «(tú)»), `frontend/src/components/shell/SideNav.test.tsx` (rol con etiqueta distinta del nombre), `frontend/src/components/Input.test.tsx` (encadenado de `onFocus` en `multiline`)

- [ ] **Step 1: Tests que fallan (los nuevos).** **Step 2: Implementar.** **Step 3: Run** `npx vitest run src/vtk src/components src/pages` → PASS. **Step 4: Commit**

```bash
git add frontend/src/vtk/reducedMotion.ts frontend/src/vtk/reducedMotion.test.ts frontend/src/vtk/Viewer.tsx frontend/src/components/stepper/StepRail.test.tsx frontend/src/pages/UsersAdmin.test.tsx frontend/src/components/shell/SideNav.test.tsx frontend/src/components/Input.test.tsx
git commit -m "Pulido: movimiento reducido del visor en un solo sitio y tests que faltaban"
```

---

### Task 6: Comprobación de conjunto, build y cierre del documento

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§7: «Fase 6 completada el <fecha>»; §9 nuevo «Estado final» con lo que queda fuera: vídeos por paso de la landing, baldosas de la banda nativa, cuota de disco, y la comprobación en navegador de las fases 2–3 pendiente del dueño)
- Modify: `README.md` (una sección corta «Rediseño visual 2026-10» con los seis planes y cómo regenerar los assets del hero)

- [ ] **Step 1:** `cd frontend && npx vitest run && npx tsc -b && npm run build` → verde; `ls dist/assets | grep -i three` vacío.
- [ ] **Step 2:** Navegador: landing y Entrar (no requieren sesión); el resto queda para el dueño.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-30-rediseno-visual-design.md README.md
git commit -m "Diseño: fase 6 (pulido) completada; estado final del rediseño"
```

---

## Autorrevisión

- **Cobertura:** §7.6 contraste → T1; foco visible (ya global) + teclado → T2; rendimiento (bundle sin three, LazyMotion) → T3/T6; accesibilidad de oficina → T4; `reduced-motion` → T5; actualización de tests → T5.
- **Nombres:** `m as motion` mantiene a todos los consumidores; `prefiereMenosMovimiento` lo consume `Viewer.tsx`.
- **Review Focus:** 1 → T1; 2 → T2; 3 → T3; 4 → T4; 5 → T5.
- **Proporción:** seis tareas, ~150 líneas.
