# Cristal D · Fase 6 (landing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la landing de diez escenas three.js por la landing D: nav en pastilla de cristal, hero con los cortes reales del caso Zenodo 036 atados al scroll que cruzan al render 3D con una ventana de cristal «Detección · 5 candidatos», y las secciones del tablero D como listas con reglas.

**Architecture:** Los assets ya están en `frontend/public/media/landing/` (60 WebP, `hero-3d.webp`, `hero-3d-wide.webp`, `hero.json`; script en `backend/scripts/landing_hero_assets.py`): no se regeneran. `pages/Landing.tsx` se reescribe por secciones con componentes en `components/landing/` (`NavPildora`, `HeroCortes`, `VentanaDeteccion`, `ListaConReglas`) y estilos en `styles/landing.css`. El scroll-linked usa `useScroll`/`useTransform`/`useMotionValueEvent` de `motion` (vía `src/motion`, añadiéndolos al barrel); no se añade GSAP.

**Tech Stack:** React 19, Vite 7, TypeScript, `motion` 12, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §5.8, §2 (anti-objetivos de GPU), §9 fase 6. Tablero: `docs/superpowers/specs/assets/2026-10-31-cristal-d/D-Landing.dc.html` (copia y orden de secciones).

## Global Constraints

- `Landing.test.tsx` sigue fijando, y debe seguir verde en cada tarea: sin colores literales en `Landing.tsx`; el lema «Planificación neurovascular con datos» exactamente una vez; ninguna aparición de «pipeline» salvo «Pipeline (Medtronic)»; todos los pasos de `STEPS` visibles con «Fabricación»; «Sin instalar nada» una sola vez; ≥ 2 botones «Entrar» y «Crear cuenta» (sin «Iniciar sesión»); «Ver cómo funciona»; umbrales con coma desde `morphometry/thresholds` y «Greving 2014»; sin lista de librerías (`/VTK|SimpleITK|three/`); «NAVARRO», «T1 recta», «T2 curva», «T3 angulada», «T4 fenestrada», «taller»; registro con «iniciales o un código»; correo de `CONTACTO_ADMIN`; sin `video[src="/media/intro.mp4"]`; `data-theme="dark"` en el contenedor `.landing-stitch`.
- Sin WebGL; sin bucles `requestAnimationFrame` propios; funciona a 390 px (una columna, nav plegada en «Menú»).
- `three`, `@types/three` (y `border-beam` si sigue en `package.json`) salen de las dependencias si nada más los usa; se borran `components/landing/scenes/*`, `NeuralShader.tsx`, `sceneHost.ts`, `LandingScene.tsx`.
- Material D (`glass()`, `data-glass`, tokens, `glide`); tipografía display 40 px de los tokens, hero `clamp(40px, 6.4vw, 76px)`.
- Con `prefers-reduced-motion`: el hero muestra el fotograma final (render 3D con la ventana de detección) desde el principio y no reserva altura de scroll extra.
- Aviso del pie exacto: «Herramienta de apoyo a la decisión clínica. No sustituye el criterio del cirujano.».
- Commits por lista explícita; nunca `git add -A`.

## Review Focus

1. Scroll rápido o salto con la barra: el fotograma se deriva del progreso, no de deltas (test puro en la tarea 3).
2. Movimiento reducido: hero estático y sin 300 vh de scroll vacío (test en la tarea 3).
3. Imagen aún no descargada: se mantiene el último fotograma decodificado, sin parpadeo a vacío (test en la tarea 3).
4. 390 px: botón «Menú» presente y nav plegada (test con `matchMedia` en la tarea 2).
5. Textos fijados de `Landing.test.tsx` (lo corren todas las tareas).

---

### Task 1: Test de los assets del hero y barrel de scroll

**Files:**
- Create: `frontend/src/components/landing/heroAssets.test.ts`
- Modify: `frontend/src/motion/index.ts` (exporta `useScroll`, `useTransform`, `useMotionValueEvent` de `motion/react`)

**Interfaces:**
- Produces: `heroAssets.test.ts` lee `public/media/landing/hero.json` y comprueba `count === frames.length === 60`, que cada fotograma existe en disco, `0 <= lesionFrame < count`, `window` = `{ w: 600, l: 60 }`, y que `landing/` pesa < 6 MB.

- [ ] **Step 1: Escribir el test;** ver que pasa ya con los assets del repo (es un test de guarda) y que `npx tsc -b` sigue limpio tras ampliar el barrel.
- [ ] **Step 2: Commit** — «Landing D: guarda de los assets del hero y scroll en el barrel de movimiento».

### Task 2: Retirada de three.js y nav en pastilla de cristal

**Files:**
- Create: `frontend/src/components/landing/NavPildora.tsx`, `NavPildora.test.tsx`
- Delete: `frontend/src/components/landing/scenes/` (entera), `NeuralShader.tsx`, `sceneHost.ts`, `LandingScene.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita las escenas; monta `NavPildora`), `frontend/package.json` y `package-lock.json` (`npm uninstall three @types/three` y `border-beam` si existe y nada lo importa), `frontend/src/styles/landing.css`

**Interfaces:**
- Produces: `NavPildora({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void })` — `nav aria-label="Principal"` fija arriba al centro, pastilla `glass("normal")` + `data-glass`, con marca, enlaces de ancla «Qué es», «Cómo funciona», «Índices», «Dispositivos» y los botones «Entrar» (secundario) y «Crear cuenta» (primario); al bajar más de 40 px se encoge al 90 % (`useScroll`, `--dur-2`); a ≤ 760 px los enlaces se pliegan tras un botón «Menú» (`aria-expanded`).

- [ ] **Step 1: Tests.** `NavPildora.test.tsx`: tiene los cuatro enlaces de ancla y los dos botones, con `data-glass`; con `matchMedia("(max-width: 760px)")` a `true` hay un botón «Menú» con `aria-expanded="false"` que al pulsarlo pasa a `"true"` y enseña los enlaces. `Landing.test.tsx` entero.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar y borrar;** `grep -rn "three\|LandingScene\|NeuralShader" frontend/src` sin resultados de código.
- [ ] **Step 4: Ver que pasan** `npx vitest run src/pages/Landing.test.tsx src/components/landing` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Landing D: fuera three.js; nav en pastilla de cristal».

### Task 3: Hero de cortes reales atados al scroll con la ventana de detección

**Files:**
- Create: `frontend/src/components/landing/HeroCortes.tsx`, `HeroCortes.test.tsx`, `frontend/src/components/landing/heroFrames.ts`, `heroFrames.test.ts`, `frontend/src/components/landing/VentanaDeteccion.tsx`
- Modify: `frontend/src/pages/Landing.tsx`, `frontend/src/styles/landing.css`

**Interfaces:**
- Produces en `heroFrames.ts`: `fotogramaPara(progreso: number, count: number): number` (progreso 0–1 recortado; `Math.round(p * (count - 1))`); `ultimoCargado(objetivo: number, cargados: ReadonlySet<number>): number | null` (el mayor índice cargado ≤ objetivo; si no hay, el menor cargado; `null` si ninguno).
- Produces: `HeroCortes()` — sección de 300 vh con un escenario `position: sticky; top: 0; height: 100vh`; fondo: el `img` del fotograma `ultimoCargado(fotogramaPara(p, count), cargados)` (precarga de los 60 con `new Image()` al montar, marcando `cargados`); rótulo mono «W 600 · L 60 · corte {sliceOf o índice}/{total}»; cuando `p` pasa del 85 %, fundido (`--dur-4`) al `hero-3d.webp` con la `VentanaDeteccion` encima; titular (lema, una sola vez en el DOM), subtítulo del tablero D y botones «Entrar»/«Crear cuenta» visibles desde el primer fotograma, a la izquierda sobre un velo. Con `useReducedMotion()`: sección de 100 vh con el render 3D y la ventana, sin cortes.
- Produces: `VentanaDeteccion()` — ventana `glass("dense")` + `data-glass` con «Detección · 5 candidatos», cinco filas (canales «calibre», «cociente», «curvatura»; la primera «lesión · ≈9,8 mm»), y las balizas 1–5 sobre el render (posiciones relativas en %, la 1 roja con halo).

- [ ] **Step 1: Tests.** `heroFrames.test.ts`: `fotogramaPara(0, 60) === 0`, `fotogramaPara(1, 60) === 59`, `fotogramaPara(0.5, 60) === 30`, `fotogramaPara(1.7, 60) === 59`, `fotogramaPara(-1, 60) === 0`; `ultimoCargado(30, new Set([0, 10, 29])) === 29`, `ultimoCargado(5, new Set([10, 20])) === 10`, `ultimoCargado(5, new Set()) === null`. `HeroCortes.test.tsx`: el lema aparece una vez; con movimiento reducido no hay `img` de cortes y sí la ventana «Detección · 5 candidatos» y el render 3D; sin movimiento reducido el primer `img` es `/media/landing/hero/000.webp`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/components/landing src/pages/Landing.test.tsx` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Landing D: hero con cortes reales del 036 atados al scroll y ventana de detección».

### Task 4: Secciones del tablero D

**Files:**
- Create: `frontend/src/components/landing/ListaConReglas.tsx`, `frontend/src/components/landing/FranjaCasos.tsx` (los WebP `aneurismas.webp` y `aneurismas-movil.webp` y su script `backend/scripts/landing_aneurismas.py` ya están en el repositorio)
- Modify: `frontend/src/pages/Landing.tsx`, `frontend/src/styles/landing.css`, `frontend/src/pages/Landing.test.tsx` solo si un texto fijado cambia por la copia del tablero (en ese caso el test cambia en esta tarea y el informe lo justifica)

**Interfaces:**
- Produces: `ListaConReglas({ items }: { items: { titulo: ReactNode; detalle?: ReactNode; cifra?: ReactNode }[] })` — lista con separadores de 1 px `--border`, título 17/600, detalle en `--muted-foreground`, cifra en mono a la derecha.
- Produces: `FranjaCasos()` en `frontend/src/components/landing/FranjaCasos.tsx` — sección `aria-label="Casos reales"` a todo el ancho con `<picture>`: `source media="(max-width: 760px)" srcSet="/media/landing/aneurismas-movil.webp"` y `img src="/media/landing/aneurismas.webp"` con `alt="Modelos 3D de aneurismas intracraneales: sacos en rojo sobre sus vasos"`, `loading="lazy"`, `width`/`height` declarados (2400 × 1080); velo `var(--veil)` en degradado desde la izquierda con el rótulo mono «CASOS REALES» y la frase exacta «Cada pieza es un aneurisma real: el saco en rojo, el vaso que lo lleva en gris.»; crédito pequeño abajo a la derecha «Figura: [fuente de la figura]»; paralaje de 24 px máx. con `useScroll`/`useTransform` (ninguno con `useReducedMotion()`).
- Secciones, en orden y con la copia de `D-Landing.dc.html`: «Qué es» (dos bloques de texto, sin glosario), «Cómo funciona» (los 8 pasos de `STEPS` numerados 01–08 con su línea; incluye «Ver cómo funciona» como ancla desde el hero), «Funcionalidades» (lista con reglas y la frase «La herramienta propone; el cirujano decide.»), la franja `FranjaCasos`, «Índices morfométricos» (los ocho con los umbrales importados de `morphometry/thresholds`, coma decimal, y «Greving 2014» como hoy), «Dispositivos NAVARRO™» (T1 recta, T2 curva, T3 angulada, T4 fenestrada; «fabricados bajo pedido en taller»), «Próximamente» (SkullCloud, AR/VR, Analítica), contacto («Hablemos de tu servicio», correo de `CONTACTO_ADMIN`, «Crear cuenta», «Entrar») y pie con el aviso exacto. Cada sección entra una vez con opacidad al aparecer (sin desplazamiento). Se conservan los textos fijados por el test («Sin instalar nada» una vez, registro «iniciales o un código», «Pipeline (Medtronic)» si estaba).

- [ ] **Step 1: Tests.** En `Landing.test.tsx` añadir: aparece «Herramienta de apoyo a la decisión clínica. No sustituye el criterio del cirujano.»; aparecen «SkullCloud», «AR / VR» y «Analítica»; aparecen los ocho rótulos DNR, AR, BF, UI, EI, NSI, SR y PHASES; la región «Casos reales» existe, está entre «Funcionalidades» e «Índices morfométricos» en el orden del DOM, su `img` apunta a `/media/landing/aneurismas.webp` con el `alt` dado y hay un `source` con `aneurismas-movil.webp`. En `heroAssets.test.ts`: los dos WebP de la franja existen y la carpeta sigue por debajo de 6 MB.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Landing D: secciones del tablero como listas con reglas».

### Task 5: Cierre de la fase

- [ ] **Step 1:** `npx vitest run` completo, `npx tsc -b` y `npm run build` (el build no debe arrastrar three) verdes.
- [ ] **Step 2:** Nota «Fase 6 completada el …» en §9 del documento de diseño.
- [ ] **Step 3: Commit** — «Diseño: fase 6 del cristal D completada».
