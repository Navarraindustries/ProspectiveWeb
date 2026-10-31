# Rediseño visual · Fase 5 (landing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la landing de diez escenas three.js por la del lienzo: hero con los cortes axiales reales del caso Zenodo 036 atados al scroll que cruzan al render 3D con el dial de medida, nav de cristal flotante, «Cómo funciona» con ventana fija y el índice de pasos, secciones como listas con reglas y una figura cada una, y retirada de three.js, del shader y de `border-beam`.

**Architecture:** Los assets se generan una vez con un script Python del backend (`backend/scripts/landing_hero_assets.py`, SimpleITK + VTK fuera de pantalla) y se commitean en `frontend/public/media/landing/` (WebP + `hero.json`). La landing (`pages/Landing.tsx`) se reescribe por secciones con componentes nuevos en `components/landing/` (`HeroCortes`, `NavPildora`, `ComoFunciona`, `Figura`, `ListaConReglas`) y estilos en `styles/landing.css`. El scroll-linked usa `useScroll`/`useTransform`/`useMotionValueEvent` de `motion` (ya es dependencia): no se añade GSAP. Con `prefers-reduced-motion` el hero muestra el fotograma final estático y las secciones solo aparecen con opacidad.

**Tech Stack:** React 19, Vite 7, TypeScript 5.8, vitest + Testing Library, `motion` 12 (barrel `frontend/src/motion`), Python 3 (`backend/.venv`: SimpleITK 2.5, Pillow 12, VTK) para los assets.

**Spec:** `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (§3 datos públicos, §4.2 escala de títulos, §4.3, §4.5, §4.7, §5.4, §6, §8.8).

## Global Constraints

- Datos: solo el caso Zenodo 036 (CC-BY, anonimizado). Ningún asset lleva nombre, fecha ni identificador de paciente; los WebP se recortan a la cabeza y no incluyen cabeceras DICOM. Presupuesto total de `public/media/landing/` ≤ 6 MB.
- `Landing.test.tsx` fija: sin colores literales (`#hex`, `rgb(`) en `Landing.tsx` (los colores van a `landing.css` o a tokens); el lema «Planificación neurovascular con datos» exactamente UNA vez en el DOM; ninguna aparición de «pipeline» salvo «Pipeline (Medtronic)»; todos los `STEPS` visibles con «Fabricación»; «Sin instalar nada» una sola vez; ≥ 2 botones «Entrar» y «Crear cuenta» (sin «Iniciar sesión»); «Ver cómo funciona»; umbrales con coma desde `morphometry/thresholds` y «Greving 2014»; sin lista de librerías (`/VTK|SimpleITK|three/`); «NAVARRO», «T1 recta», «T2 curva», «T3 angulada», «T4 fenestrada», «taller»; registro con «iniciales o un código»; el correo sale de `CONTACTO_ADMIN`; no hay `video[src="/media/intro.mp4"]`; `data-theme="dark"` en el contenedor `.landing-stitch`.
- Escala: hero 76 px (`clamp(40px, 6.4vw, 76px)`) / tracking −0,035 em / 600; títulos de sección 40–44 px; cuerpo 14–16 px.
- Movimiento: una entrada autorizada por pantalla (la del hero); scroll-linked antes que scroll-triggered; `--dur-4` solo aquí; con movimiento reducido solo opacidad y el hero estático.
- Sin WebGL continuo; sin bucles `requestAnimationFrame` propios (los de `motion` sí); la landing debe funcionar a 390 px (una columna, nav plegada).
- `three`, `@types/three` y `border-beam` salen de `package.json`; `components/landing/scenes/*`, `NeuralShader.tsx`, `sceneHost.ts`, `LandingScene.tsx` se borran. `Button` ya no usa `BorderBeam` (fase 1).
- Suite completa verde; `npx tsc -b` limpio; commits por lista; comentarios en castellano. Scripts Python con `backend/.venv/Scripts/python.exe -X utf8`.

## Review Focus

1. **Scroll rápido y saltos:** el índice de corte se deriva del progreso (no de deltas), así que un salto con la barra de scroll aterriza en el fotograma correcto; test puro de la función de mapeo en T3.
2. **Movimiento reducido:** el hero muestra el 3D con el dial desde el primer fotograma y no bloquea 320 vh de scroll; test en T3.
3. **Imágenes que no han llegado:** mientras no se haya descargado el corte N, se mantiene el último decodificado (nada de parpadeos a vacío); test en T3 (estado `cargados`).
4. **Pantalla de 390 px:** nav plegada en botón «Menú», hero en una columna, listas legibles; regla CSS en T5 (sin test) + test de que el botón «Menú» existe bajo 760 px (matchMedia mock).
5. **Textos fijados:** `Landing.test.tsx` entero sigue verde en cada tarea (T2–T5 lo corren).

---

### Task 1: Assets del hero (cortes WebP, render 3D y `hero.json`)

**Files:**
- Create: `backend/scripts/landing_hero_assets.py`
- Create: `frontend/public/media/landing/hero/000.webp … NNN.webp` (60), `frontend/public/media/landing/hero-3d.webp`, `frontend/public/media/landing/hero.json`
- Create: `frontend/src/components/landing/heroAssets.test.ts`

**Interfaces:**
- Produces: `hero.json` = `{ "count": 60, "total": 594, "lesionFrame": <índice del corte del aneurisma dentro de los 60>, "window": { "w": 600, "l": 60 }, "frames": ["000.webp", …], "sliceOf": [<índice real del corte por fotograma>], "lesion": { "diameterMm": <extensión máxima de an_036.stl>, "neckMm": null } }`. Script: lee `Archivos DICOM/Studies/036` con `SimpleITK.ImageSeriesReader` (ordenado por posición), calcula el índice del corte de la lesión a partir del centroide de `Archivos DICOM/Annotations/an_036.stl` (`vtkSTLReader` → centro de la caja; convertir mm → índice con `TransformPhysicalPointToIndex`), elige 60 cortes equiespaciados entre el corte 40 y el 560 asegurando que el del aneurisma es uno de ellos (`lesionFrame`), aplica ventana W 600 / L 60 → uint8, recorta al cuadrado que envuelve la cabeza (umbral > −500 HU, margen 6 %), redimensiona a 1024 px (`Image.LANCZOS`) y guarda WebP calidad 78. El render 3D: `vtk` fuera de pantalla sobre `backend/data/zenodo_eval_full_p6_head/meshes/036.vtp` (si no existe, `zenodo_eval_shell/meshes/036.vtp`), vaso en gris claro (0.82, 0.84, 0.88), lesión (`an_036.stl`) en rojo (1.0, 0.30, 0.37), fondo (0.043, 0.047, 0.059) = #0B0C0F, cámara frontal como en `render_eval_mesh.py`, 1400 × 1000, guardado como `hero-3d.webp` calidad 82. Imprime el tamaño total.
- Test `heroAssets.test.ts`: lee `public/media/landing/hero.json` con `readFileSync`, comprueba `count === frames.length`, que cada `frames[i]` existe en disco, `0 <= lesionFrame < count`, `window = {600, 60}` y que el total de bytes de la carpeta `landing/` es < 6 MB.

- [ ] **Step 1: Test que falla** (`heroAssets.test.ts` como arriba) → `npx vitest run src/components/landing/heroAssets.test.ts` FAIL (no existe el JSON).
- [ ] **Step 2: Escribir y ejecutar el script** desde `backend`: `./.venv/Scripts/python.exe -X utf8 scripts/landing_hero_assets.py --out ../frontend/public/media/landing` (ruta del dataset por defecto `../Archivos DICOM`). Ver 60 WebP + `hero-3d.webp` + `hero.json`; mirar dos cortes y el render con el visor de imágenes (Read) para confirmar que se ve cabeza y vaso y nada de texto DICOM.
- [ ] **Step 3: Run** → PASS.
- [ ] **Step 4: Commit** (por lista: el script, el test, `hero.json`, `hero-3d.webp` y `hero/*.webp` nombrados con `git add frontend/public/media/landing/hero/*.webp` — es una carpeta nueva solo con esos ficheros)

```bash
git add backend/scripts/landing_hero_assets.py frontend/src/components/landing/heroAssets.test.ts frontend/public/media/landing/hero.json frontend/public/media/landing/hero-3d.webp frontend/public/media/landing/hero/*.webp
git commit -m "Landing: cortes axiales y render 3D del caso Zenodo 036 para el hero"
```

---

### Task 2: Retirada de three.js, nav de cristal flotante y figuras SVG

**Files:**
- Delete: `frontend/src/components/landing/scenes/*`, `frontend/src/components/landing/NeuralShader.tsx`, `frontend/src/components/landing/sceneHost.ts`, `frontend/src/components/landing/LandingScene.tsx`
- Modify: `frontend/package.json` (+ `package-lock.json` vía `npm uninstall three @types/three border-beam`)
- Create: `frontend/src/components/landing/NavPildora.tsx` (+ test), `frontend/src/components/landing/Figura.tsx` (+ test)
- Modify: `frontend/src/pages/Landing.tsx` (quita `lazy()` de escenas, `NeuralShader`, `BorderBeam`; usa `NavPildora`; las `Figure` pasan a `Figura`)
- Modify: `frontend/src/styles/landing.css` (`.landing-nav-pildora`, `.landing-figura`; quitar `.landing-hero-model`, `.stitch-shell`, `.stitch-glass`)
- Test: `frontend/src/pages/Landing.test.tsx` (sigue entero; añadir «no queda three.js ni border-beam»)

**Interfaces:**
- Produces: `NavPildora({ links: readonly (readonly [label, id])[], onEnter })` → `<nav aria-label="Secciones de la portada" className="landing-nav-pildora" data-encogida={scrolled}>` fija (`position: fixed; top: 16px; left: 50%; transform: translateX(-50%) scale(1|0.9)`, píldora 999 px, cristal: `background: color-mix(in srgb, var(--card) 72%, transparent); backdrop-filter: blur(18px)`, borde `--border`, sombra `--shadow-sheet` invertida en `landing.css`), `Logo compact` + enlaces + `Button size="sm"` «Entrar»; `scrolled` = `window.scrollY > 20` (listener pasivo); bajo 760 px los enlaces se ocultan tras un botón «Menú» (`aria-expanded`) que los despliega en una lista debajo de la píldora. `Figura({ tipo: "dial" | "mordaza" | "stent" | "cortes" | "boveda" | "nube" | "pasos", caption, dashed? })` → `<figure className="landing-figura">` con un SVG en línea (trazo 1,5, `stroke="currentColor"`, color `--data`; el `dial` = circunferencia con marcas cada 2 mm y una cifra en mono; `mordaza` = dos brazos de clip; `stent` = malla cilíndrica; `cortes` = tres rectángulos apilados; `boveda` = candado con llave; `nube` = nube con nodos; `pasos` = ocho puntos unidos) y `<figcaption>` con `caption`.

- [ ] **Step 1: Tests que fallan**

`NavPildora.test.tsx`: «lleva los enlaces, «Entrar» y se encoge al bajar» (`fireEvent.scroll(window)` con `scrollY = 40` → `data-encogida="true"`); «bajo 760 px esconde los enlaces tras «Menú»» (mock de `matchMedia` → `matches: true` para `(max-width: 760px)`; `getByRole("button", { name: "Menú" })`, enlaces visibles tras pulsar).
`Figura.test.tsx`: «cada tipo pinta un svg y el pie» (`it.each` de los siete tipos → `figure svg` existe y `figcaption` con el texto).
`Landing.test.tsx` (añadir): «no queda three.js, el shader ni border-beam» (`readFileSync` de `Landing.tsx` sin `three`, `NeuralShader`, `BorderBeam`; `existsSync("src/components/landing/scenes")` false).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar**; `npm uninstall three @types/three border-beam`; borrar ficheros con `git rm -r`. **Step 4: Run** `npx vitest run src/components/landing src/pages/Landing.test.tsx src/components/Button.test.tsx` → PASS; `npx tsc -b` limpio; `grep -rn "from \"three\"\|border-beam" src` vacío.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/landing/NavPildora.tsx frontend/src/components/landing/NavPildora.test.tsx frontend/src/components/landing/Figura.tsx frontend/src/components/landing/Figura.test.tsx frontend/src/pages/Landing.tsx frontend/src/pages/Landing.test.tsx frontend/src/styles/landing.css
git rm -r frontend/src/components/landing/scenes frontend/src/components/landing/NeuralShader.tsx frontend/src/components/landing/sceneHost.ts frontend/src/components/landing/LandingScene.tsx
git commit -m "Landing: fuera three.js, el shader y border-beam; nav de cristal flotante y figuras SVG"
```

---

### Task 3: Hero con los cortes atados al scroll que cruzan al 3D con el dial

**Files:**
- Create: `frontend/src/components/landing/heroScroll.ts` (+ `heroScroll.test.ts`): funciones puras
- Create: `frontend/src/components/landing/HeroCortes.tsx` (+ `HeroCortes.test.tsx`)
- Create: `frontend/src/hooks/useMagnetico.ts` (+ test)
- Modify: `frontend/src/pages/Landing.tsx` (la sección `Hero` usa `HeroCortes`; el texto del hero se conserva: pill del lema, `h1`, párrafo, botones «Entrar»/«Crear cuenta», «Ver cómo funciona ↓», fila «Sin instalar nada · Modelo 3D en el navegador · Medidas objetivas en milímetros»)
- Modify: `frontend/src/styles/landing.css` (`.landing-hero`, `.landing-hero-cortes`, `.landing-hero-rotulo`, `.landing-hero-dial`)

**Interfaces:**
- Produces en `heroScroll.ts`: `frameFor(progress: number, count: number, lesionFrame: number, cutAt = 0.78): number` — mapea `progress ∈ [0, cutAt]` linealmente a `[0, lesionFrame]` (redondeo) y devuelve `lesionFrame` a partir de `cutAt`; `crossFor(progress, cutAt = 0.78, dialAt = 0.9): { imagen: number; tres: number; dial: number }` — opacidad del corte (1 → 0 entre `cutAt` y `dialAt`), del 3D (0 → 1 en el mismo tramo) y progreso del dial (0 → 1 entre `dialAt` y 1); `rotuloVentana(slice: number, total: number, w: number, l: number): string` → `W 600 · L 60 · corte 312/594`.
- `HeroCortes({ children })`: `<section className="landing-hero">` de `height: 320vh` con un `<div className="landing-hero-sticky">` (`position: sticky; top: 0; height: 100vh`) que contiene a la izquierda `children` (el texto del hero, visible desde el primer fotograma) y a la derecha la tarjeta de imagen (`radius 28`, sombra `0 40px 90px` vía `--shadow-hero` definido en `landing.css`) con: `<img data-corte src={/media/landing/hero/${frames[frame]}} alt="">` (solo se cambia `src` cuando el fotograma ya está decodificado: un `Set` de cargados alimentado por `new Image()` en un efecto que precarga los 60 en orden, empezando por los 8 primeros), rótulo mono `.landing-hero-rotulo` con `rotuloVentana(...)`, `<img data-tres src="/media/landing/hero-3d.webp">` con `opacity` del cruce, y `<svg data-dial>` (circunferencia + marcas cada 2 mm, `stroke-dasharray`/`dashoffset` según `dial`, cifra `lesion.diameterMm` en mono con «mm» al completarse). El progreso viene de `useScroll({ target: ref, offset: ["start start", "end end"] })` y se lee con `useMotionValueEvent(scrollYProgress, "change", …)`. Parallax: `useMotionValue` x/y desde `onMouseMove` sobre la tarjeta, limitado a ±12 px, con `useSpring`. Con `useReducedMotion()` true: `height: 100vh`, sin sticky, `frame = lesionFrame`, `cross = { imagen: 0, tres: 1, dial: 1 }`. `hero.json` se carga con `fetch("/media/landing/hero.json")` (no se importa como módulo) y, hasta que llega, se muestra el 3D estático.
- `useMagnetico(ref, fuerzaPx = 4)`: desplaza el elemento hacia el puntero hasta `fuerzaPx` mientras está encima y vuelve a 0 al salir (`transform: translate`), inactivo con movimiento reducido. Se aplica a los dos botones primarios «Entrar» de la landing.

- [ ] **Step 1: Tests que fallan**

`heroScroll.test.ts`:
```ts
it("frameFor avanza linealmente hasta el corte de la lesión y se queda ahí", () => {
  expect(frameFor(0, 60, 48)).toBe(0);
  expect(frameFor(0.39, 60, 48)).toBe(24);
  expect(frameFor(0.78, 60, 48)).toBe(48);
  expect(frameFor(1, 60, 48)).toBe(48);
});
it("crossFor cruza la imagen al 3D entre 0,78 y 0,9 y dibuja el dial después", () => {
  expect(crossFor(0.5)).toEqual({ imagen: 1, tres: 0, dial: 0 });
  expect(crossFor(0.84).imagen).toBeCloseTo(0.5, 5);
  expect(crossFor(0.84).tres).toBeCloseTo(0.5, 5);
  expect(crossFor(0.95).dial).toBeCloseTo(0.5, 5);
  expect(crossFor(1)).toEqual({ imagen: 0, tres: 1, dial: 1 });
});
it("rotuloVentana", () => { expect(rotuloVentana(312, 594, 600, 60)).toBe("W 600 · L 60 · corte 312/594"); });
```
`HeroCortes.test.tsx`: «con movimiento reducido muestra el 3D y el dial completos sin sección de 320 vh» (mock `useReducedMotion` → true y `fetch` del JSON; `section.style.height === "100vh"`, `img[data-tres].style.opacity === "1"`); «no cambia el src a un corte que aún no está decodificado» (el `Set` de cargados vacío → `img[data-corte]` conserva el primer src tras simular progreso). `useMagnetico.test.ts`: «con movimiento reducido no desplaza»; «desplaza como máximo la fuerza».

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/landing src/hooks src/pages/Landing.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/heroScroll.ts frontend/src/components/landing/heroScroll.test.ts frontend/src/components/landing/HeroCortes.tsx frontend/src/components/landing/HeroCortes.test.tsx frontend/src/hooks/useMagnetico.ts frontend/src/hooks/useMagnetico.test.ts frontend/src/pages/Landing.tsx frontend/src/styles/landing.css
git commit -m "Landing: hero con los cortes reales atados al scroll que cruzan al 3D con el dial"
```

---

### Task 4: Secciones como listas con reglas, «Cómo funciona» con ventana fija e índice de pasos

**Files:**
- Create: `frontend/src/components/landing/ComoFunciona.tsx` (+ test), `frontend/src/components/landing/ListaConReglas.tsx` (+ test)
- Modify: `frontend/src/pages/Landing.tsx` (secciones en el orden de §4.5: hero → fotograma final (ya en el hero) → Qué es → Cómo funciona → Funcionalidades → Índices → Dispositivos → Tecnología y Seguridad → Próximamente → Contacto/CTA → pie; `UseCases`, `HowItWorks` («Tres pasos») y `Security` se funden en «Qué es», «Cómo funciona» y «Tecnología y Seguridad»)
- Modify: `frontend/src/styles/landing.css`
- Test: `frontend/src/pages/Landing.test.tsx` (sigue entero; añadir «las secciones van en el orden de la spec»)

**Interfaces:**
- Produces: `ComoFunciona({ steps: PipelineStep[], videoSrc })` → sección de `height: ${steps.length * 60}vh` con ventana `sticky` (vídeo `pipeline-hf.mp4` `autoPlay muted loop playsInline`, marco radio 12, sombra `--shadow-hero`) y, a la izquierda, `<ol>` con los `steps.length` pasos (`label`, numerados) donde el activo (`aria-current="step"`) se decide por `useScroll` del contenedor: `activo = min(floor(progress * steps.length), steps.length − 1)`; cada paso lleva una línea de una frase (texto nuevo, sin la palabra «pipeline»). Con movimiento reducido: altura normal, sin sticky, todos los pasos listados. `ListaConReglas({ items: { titulo, texto, figura?: FiguraProps }[] })` → `<ul>` con filas separadas por `1px solid var(--border)`, `titulo` 18 px / 600, `texto` 15 px `--muted-foreground`, figura opcional a la derecha (`Figura`). Títulos de sección `clamp(32px, 4vw, 44px)` / 600 / −0,02 em; kickers 12 px mono `--data`. Contenidos: «Qué es» (3 filas: datos no a ojo, en el navegador, para la consulta/quirófano/aula — fusiona UseCases), «Funcionalidades» (6 filas con figuras `cortes`, `dial`, `mordaza`, `stent`, `pasos`, `boveda`), «Índices» (las 8 filas actuales con sus umbrales `es(THRESH, n)` y «Greving 2014», figura `dial`), «Dispositivos» (NAVARRO™ T1–T4 + «fabricados bajo pedido» + taller; coils; stents con «Pipeline (Medtronic)», «Surpass (Stryker)», «FRED · Enterprise 2 · Leo+»; figuras `mordaza`, `stent`), «Tecnología y Seguridad» (fusión de Technology + Security, figura `boveda`), «Próximamente» (SkullCloud, AR / VR, Analítica, `dashed`, figura `nube`), «Contacto» (mailto `CONTACTO_ADMIN`, «iniciales o un código»), CTA, pie. La fila «Sin instalar nada · …» solo en el hero.

- [ ] **Step 1: Tests que fallan**

`ComoFunciona.test.tsx`: «lista todos los pasos y marca el activo por el progreso» (con `steps = STEPS`, mock de `useScroll` → progreso 0.5 → el paso `floor(0.5 * 8) = 4` lleva `aria-current="step"`); «con movimiento reducido no hay sticky» (`style.position !== "sticky"`). `ListaConReglas.test.tsx`: «pinta título, texto y figura por fila con regla entre filas». `Landing.test.tsx` (añadir): «el orden de las secciones es el de la spec» (ids en orden: `que-es`, `como-funciona`, `funcionalidades`, `indices`, `dispositivos`, `tecnologia`, `proximamente`, `contacto`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** `npx vitest run src/components/landing src/pages/Landing.test.tsx` → PASS; `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/ComoFunciona.tsx frontend/src/components/landing/ComoFunciona.test.tsx frontend/src/components/landing/ListaConReglas.tsx frontend/src/components/landing/ListaConReglas.test.tsx frontend/src/pages/Landing.tsx frontend/src/pages/Landing.test.tsx frontend/src/styles/landing.css
git commit -m "Landing: secciones como listas con reglas y «Cómo funciona» con ventana fija e índice de pasos"
```

---

### Task 5: Rendimiento y 390 px

**Files:**
- Modify: `frontend/src/components/landing/HeroCortes.tsx` (`decoding="async"`, `fetchPriority="high"` en los 8 primeros, `<link rel="preload">` del primer corte y del 3D desde `Landing`), `frontend/src/styles/landing.css` (media queries 760 px y 390 px: una columna, nav plegada, hero con la tarjeta debajo del texto, listas sin figura lateral)
- Create: `frontend/src/components/landing/landingPerf.test.ts`

**Interfaces:**
- Produces: `landingPerf.test.ts` lee `Landing.tsx` y `components/landing/*.tsx` y comprueba que no hay `requestAnimationFrame(`, `new THREE`, `WebGL` ni `canvas` creados a mano; que `HeroCortes.tsx` usa `decoding="async"`; y que `landing.css` tiene reglas `@media (max-width: 760px)` y `@media (max-width: 420px)`.

- [ ] **Step 1: Test que falla.** **Step 2: Implementar.** **Step 3: Run** `npx vitest run src/components/landing src/pages/Landing.test.tsx` → PASS.
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/landing/HeroCortes.tsx frontend/src/components/landing/landingPerf.test.ts frontend/src/pages/Landing.tsx frontend/src/styles/landing.css
git commit -m "Landing: precarga, decodificación asíncrona y maquetación a 760 y 390 px"
```

---

### Task 6: Comprobación de conjunto y notas en el documento de diseño

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-rediseno-visual-design.md` (al final de §7: «Fase 5 completada el <fecha>: landing; ver plan …»; en §4.7 anotar que el scroll-linked se hizo con `motion` (`useScroll`) y no con GSAP; en §8.8 anotar que los vídeos por paso no se grabaron (requieren una sesión abierta con el visor) y `pipeline-hf.mp4` sigue en «Cómo funciona»)

- [ ] **Step 1:** `cd frontend && npx vitest run && npx tsc -b && npm run build` → verde (el build confirma que three.js ya no entra en el bundle: `ls dist/assets | grep -i three` vacío).
- [ ] **Step 2:** Navegador: la landing no requiere sesión → mirar hero (scroll, cruce, dial), nav, «Cómo funciona», listas, 390 px (ventana estrecha). Corregir desbordes.
- [ ] **Step 3: Commit de la nota**

```bash
git add docs/superpowers/specs/2026-10-30-rediseno-visual-design.md
git commit -m "Diseño: fase 5 (landing) completada"
```

---

## Autorrevisión

- **Cobertura (fase 5):** assets → T1; retirada de three.js/shader y nav píldora → T2; hero scroll-linked con cruce y dial, parallax y botones magnéticos → T3; secciones en el orden de §4.5, «Cómo funciona» fijo con índice, listas con reglas y figuras, Índices/NAVARRO/Próximamente conservados (§8.8) → T4; 390 px y CPU → T5. Vídeos por paso: no grabables sin sesión → §8.8 ya prevé conservar `pipeline-hf.mp4`.
- **Nombres:** `hero.json` (campos `count`, `total`, `lesionFrame`, `window`, `frames`, `sliceOf`, `lesion`) lo producen T1 y lo consumen T3; `Figura` (T2) la usan T4; `frameFor`/`crossFor`/`rotuloVentana` (T3).
- **Review Focus:** 1, 2, 3 → T3; 4 → T2/T5; 5 → todas.
- **Proporción:** seis tareas, ~260 líneas; los cuerpos no están escritos.
