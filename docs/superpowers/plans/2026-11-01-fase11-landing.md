# Fase 11 — Landing: Case 3, movimiento y visuales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La portada pública deja de ser texto plano bajo el hero: hero con Case 3 (3DRA), desplazamiento animado a las secciones, revelado al entrar, sección activa en la nav, un visual por sección y comportamiento fijado por punto de corte.

**Architecture:** La raíz `.landing-stitch` recibe `data-tramo` (de `useTramo()`, puntos de corte comunes) y TODA la disposición responsive de `landing.css` cuelga de ese atributo: el CSS de la landing se queda sin consultas de anchura y los tests fijan cada tramo. El movimiento vive en piezas pequeñas (`desplazamiento.ts`, `useSeccionActiva.ts`, `Seccion.tsx` con `Revelar`/`RevelarItem`) que usan solo el barrel `src/motion`. Cada sección pasa a su propio fichero en `components/landing/`; `Landing.tsx` solo compone.

**Tech Stack:** React 19, Vite 7, TypeScript, `motion` 12 (vía `src/motion`), vitest + Testing Library (jsdom), CSS plano con tokens.

**Spec:** `docs/superpowers/specs/2026-11-01-correcciones-dueno-design.md` (secciones «Responsive» y «Landing», decisiones 1 y 4) y `docs/superpowers/specs/2026-11-01-auditoria-visual.md` §1 (A1–A13). Assets ya generados: `INFORME.md` de la carpeta de la Tarea 1.

## Global Constraints

- Worktree `fase11-landing` creado desde `main` (ya trae las fases 8 y 10); fusión local `--no-ff`; sin push. Tests desde `frontend/`: `npx vitest run <ruta>` y `npx tsc -b`.
- Commits: nunca `git add -A` ni `git add .`; siempre rutas explícitas y `git status --short` antes de cada commit. Los mensajes terminan con las líneas de atribución que dé la sesión.
- Nunca entran en git `work/` del scratchpad, `backend/data/` ni nada que no sea `.webp` o `hero.json` bajo `frontend/public/media/landing/` (datos de paciente; el repositorio es público).
- No `sed -i` sobre ficheros CRLF; no heredocs de Python con barras invertidas; editar con Edit/Write y comprobar imports en su propio comando.
- Textos en español; cifras con coma decimal vía `cifra()` de `lib/numero`.
- Movimiento solo desde `src/motion` (barrel). Con movimiento reducido: salto directo, sin revelado, sin pulsos, sin rellenos ligados al scroll: todo se pinta en su estado final.
- Textos ≥ 13 px, salvo rótulos en monoespaciada Y mayúsculas (`text-transform: uppercase`), ya aceptados.
- Objetivos táctiles ≥ 44 px por debajo de 1024 px (los enlaces en línea dentro de una frase quedan exentos, como en WCAG 2.5.8).
- Sin scroll horizontal; nada se corta ni se pisa en la matriz de anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560 y altos 600, 768, 900, 1080.
- Puntos de corte solo de `styles/puntosCorte.ts` (640 / 1024 / 1280 / 1920). `landing.css` no lleva ninguna consulta de anchura; de alto solo 600/768/900/1080.
- Tramos: `movil` ≤ 640 < `tableta` ≤ 1024 < `estrecho` ≤ 1280 < `ancho` < 1920 ≤ `grande`. Selectores CSS: `.landing-stitch[data-tramo="movil"]`, `.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"])` (≤ 1024), `.landing-stitch[data-tramo="grande"]`. Escritos siempre así (los tests los buscan literalmente).
- La landing sigue el tema de la app (pedido del dueño 01-11; Tarea 12): hasta la Tarea 12 sigue anclada en oscuro, pero todo lo nuevo usa tokens de tema para funcionar en los dos. En los `.tsx` de `components/landing/` y en `pages/Landing.tsx` no hay colores escritos a mano (ni `#hex` ni `rgb(`): solo tokens.
- Imágenes bajo el hero: `loading="lazy"`, `decoding="async"`, `width` y `height` explícitos. El hero sigue cargando en el acto. Sin librerías nuevas. `pipeline-hf.mp4` no se usa (5 MB).
- No tocar el quirófano, las páginas de gestión ni `components/Icon.tsx` (el glifo de `STEP_PATIENT` es de la fase 9; la landing usa `UPLOAD` para el paso de carga).
- Case 3 es publicable (confirmado por el dueño). En esta fase no se regenera ningún asset ni se ejecuta ningún script VTK.

## Review Focus

1. **Rueda o toque durante el desplazamiento animado:** quien gira la rueda a mitad del viaje recupera el control al instante; la animación no pelea con él. Test en la Tarea 3 («la rueda, un toque o una tecla cortan la animación»).
2. **Ctrl/Cmd/Mayús-clic o botón central en un ancla:** el navegador hace lo suyo (pestaña nueva); ni `preventDefault` ni animación. Test en la Tarea 3.
3. **Sin IntersectionObserver (navegador viejo) o con movimiento reducido:** el contenido nunca se queda invisible; se pinta ya entero. Test en la Tarea 4.
4. **Girar la tableta o redimensionar cruzando 640/1024 en vivo:** `data-tramo`, el plegado de la nav y la orientación del riel cambian sin recargar. Tests con `simularPantalla(...).cambiar` en las Tareas 2, 5 y 7.
5. **Datos de paciente al copiar assets:** en `public/media/landing` solo hay `.webp` y `hero.json`; nada de `.vtp`, `.npy`, `.png` de trabajo ni `.json` sueltos. Test en la Tarea 1.

---

### Task 1: Hero con Case 3 — assets, datos y ventana de detección (A11)

**Files:**
- Copy (assets): carpeta `media/landing/` de los assets → `frontend/public/media/landing/` (sobrescribe `hero/000–059.webp`, `hero-3d.webp`, `hero.json`; añade `secciones/` y `clips/`)
- Create: `backend/scripts/landing_case3/rutas.py` y copias de `explore_case3.py`, `seg_detect_case3.py`, `hero_slices_case3.py`, `render_case3.py`, `render_clips.py`, `render_util.py`
- Modify: `frontend/src/components/landing/heroFrames.ts`, `frontend/src/components/landing/VentanaDeteccion.tsx`, `frontend/src/components/landing/HeroCortes.tsx`, `frontend/src/styles/landing.css` (bloque de la ventana de detección)
- Test: `frontend/src/components/landing/heroAssets.test.ts`, `frontend/src/components/landing/heroFrames.test.ts`, `frontend/src/components/landing/HeroCortes.test.tsx`

Carpeta de los assets: `C:\Users\juesn\AppData\Local\Temp\claude\C--UniNavarra-Proyectos-Prospective\ca88ebdd-7623-4fb4-baac-076e448b24ca\scratchpad\landing-case3\`. Leer su `INFORME.md` (§2–§4 y §7) antes de empezar.

**Interfaces:**
- Produces (en `heroFrames.ts`): `MANIFIESTO` (count 60, total 384, lesionFrame 59, window `{ w: 3000, l: 1800 }`, `sliceOf` del INFORME §2); `DETECCION_CASE3: readonly CandidatoDetectado[]` (sustituye a `DETECCION_036`, mismo contrato); `GROSOR_LOSA_MM = 4.2`.
- Produces (assets que usan las Tareas 6, 8 y 10): `/media/landing/secciones/case3-frontal.webp`, `case3-oblicua.webp`, `case3-saco.webp` (1600×1200 RGBA, se pintan a 800×600); `/media/landing/clips/navarro-t1-recto.webp`, `navarro-t2-curvo.webp`, `navarro-t3-angulado-45.webp`, `navarro-t4-fenestrado.webp` (1200×1200 RGBA, se pintan a 600×600). Lesión en % del render: frontal (44, 37), oblicua (60, 40), saco (50, 50).

- [ ] **Step 1: Escribir los tests que fallan**

`heroAssets.test.ts`: «la ventana de detección es 600/60» pasa a:
```ts
it("la ventana es la de la 3DRA de Case 3 (unidades crudas, no HU)", () => {
  expect(hero.window).toEqual({ w: 3000, l: 1800 });
});
it("existen los renders de las secciones y de los cuatro clips", () => {
  for (const f of ["secciones/case3-frontal.webp", "secciones/case3-oblicua.webp", "secciones/case3-saco.webp",
    "clips/navarro-t1-recto.webp", "clips/navarro-t2-curvo.webp", "clips/navarro-t3-angulado-45.webp",
    "clips/navarro-t4-fenestrado.webp"]) expect(existsSync(join(DIR, f)), f).toBe(true);
});
it("en la carpeta pública solo hay .webp y hero.json (nada de datos de trabajo)", () => {
  // recorrido recursivo de DIR: cada fichero termina en .webp, o es "hero.json" en la raíz de DIR
});
```
`heroFrames.test.ts`: `DETECCION_036` → `DETECCION_CASE3`; puestos `[1, 2, 3, 4, 5]`, solo el 1 es lesión, diámetros `[3.7, 5.4, 5.8, 5.1, 2.7]`, `DETECCION_CASE3[0].canales` igual a `["curvatura"]`.
`HeroCortes.test.tsx`: `/^W 600 · L 60/` → `/^W 3000 · L 1800/`; rótulo inicial `"W 3000 · L 1800 · MIP 4,2 mm · corte 95/384"`; la fila 1 contiene `"candidato 1 · ≈3,7 mm · coincide con la lesión confirmada (tronco basilar)"` y `"curvatura"`; la fila 2 contiene `"≈5,4 mm"`; ninguna fila contiene `"saco pequeño"`; el test de «coincide con la lesión anotada» pasa a «confirmada»; el nombre «…candidatos reales del 036…» pasa a «…de Case 3…»; y el crédito va DENTRO de la ventana (A11):
```ts
const ventana = screen.getByText("Detección · 5 candidatos").closest("[data-glass]") as HTMLElement;
expect(within(ventana).getByText("Case 3 · 3DRA · detector de Prospective")).toBeInTheDocument();
expect(within(ventana).getByText(/no el tamaño del aneurisma/)).toBeInTheDocument();
expect(screen.queryByText(/Zenodo/)).toBeNull();
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/components/landing`
Expected: FAIL (ventana 600/60, faltan `secciones/` y `clips/`, `DETECCION_CASE3` no existe, textos del 036).

- [ ] **Step 3: Copiar los assets (solo `media/landing`)**

```bash
SRC="/c/Users/juesn/AppData/Local/Temp/claude/C--UniNavarra-Proyectos-Prospective/ca88ebdd-7623-4fb4-baac-076e448b24ca/scratchpad/landing-case3/media/landing"
DST="frontend/public/media/landing"
cp "$SRC"/hero.json "$SRC"/hero-3d.webp "$DST"/
cp "$SRC"/hero/*.webp "$DST"/hero/
mkdir -p "$DST"/secciones "$DST"/clips
cp "$SRC"/secciones/*.webp "$DST"/secciones/
cp "$SRC"/clips/*.webp "$DST"/clips/
```
Nunca copiar `work/`. Los `aneurismas*.webp` se quedan.

- [ ] **Step 4: `heroFrames.ts`**

Pegar `MANIFIESTO` y `DETECCION_CASE3` tal cual del INFORME §2 y §3, con su comentario de procedencia. Añadir `export const GROSOR_LOSA_MM = 4.2;` con el porqué: cada fotograma es una losa MIP de 13 cortes (±6, ≈ 4,2 mm), no un corte de 0,32 mm. La cabecera dice que el manifiesto lo escribe `backend/scripts/landing_case3/hero_slices_case3.py`. El comentario de `CandidatoDetectado.lesion` pasa a «coincide con la lesión confirmada del caso».

- [ ] **Step 5: `VentanaDeteccion.tsx`, `HeroCortes.tsx` y el CSS de la ventana**

- `VentanaDeteccion`: usa `DETECCION_CASE3`. Nota de la fila de la lesión: `` `candidato ${c.puesto} · ${mm(c.diametroMm)} · coincide con la lesión confirmada (tronco basilar)` ``. Crédito y matiz pasan DENTRO del `div[data-glass]`, en un pie `<div className="hero-ventana__pie">` bajo la lista: crédito `Case 3 · 3DRA · detector de Prospective`; matiz `Ø: lo que mide el detector en cada candidato, no el tamaño del aneurisma. Un caso real; el puesto de la lesión varía de un caso a otro.` `LESION_EN_RENDER` sigue en 50/50.
- `HeroCortes`: rótulo `` `W ${w} · L ${l} · MIP ${cifra(GROSOR_LOSA_MM, 1)} mm · corte ${n}/${total}` ``; `alt` del render: `Malla 3D del árbol vascular de Case 3 (3DRA) con la lesión del tronco basilar marcada en rojo`; la cabecera del fichero habla de Case 3, no de Zenodo 036.
- `landing.css`: `.hero-ventana__pie` con `border-top: 1px solid var(--border)`, `margin-top: 4px`, `padding: 10px 2px 6px`; `.hero-ventana__credito` y `.hero-ventana__matiz` sin márgenes exteriores y a `13px`. El resto de tamaños se arregla en la Tarea 2.

- [ ] **Step 6: Scripts generadores en el repositorio**

Copiar los seis scripts del INFORME §6 (no `preview_*.py` ni `__pycache__`) a `backend/scripts/landing_case3/`. Crear `rutas.py`:
```python
from pathlib import Path
PW = Path(__file__).resolve().parents[3]
BACKEND = PW / "backend"
WORK = BACKEND / "data" / "landing_case3"   # ignorado por git: volumen y mallas de paciente
MEDIA = PW / "frontend" / "public" / "media" / "landing"
CASE3 = PW / "Archivos DICOM" / "DICOM" / "Case 3" / "Case 3" / "Unknown Study" / "XA"
WORK.mkdir(parents=True, exist_ok=True)
```
En cada script, con Edit: fuera las rutas absolutas `C:/UniNavarra/...`, los `parents[1] / "work"` y los `HERE / "media" / "landing"`; se importa de `rutas` (con `sys.path.insert(0, str(Path(__file__).resolve().parent))` y `sys.path.insert(0, str(BACKEND))`). El docstring de `hero_slices_case3.py` cuenta el orden 1–5 del INFORME §6, que se ejecuta con `backend/.venv/Scripts/python.exe` y que nunca hay dos procesos VTK a la vez. No ejecutar ningún script.

- [ ] **Step 7: Verificar**

Run: `npx vitest run src/components/landing` → PASS. `npx tsc -b` → sin errores.
Run (desde la raíz): `backend/.venv/Scripts/python.exe -m py_compile backend/scripts/landing_case3/rutas.py backend/scripts/landing_case3/explore_case3.py backend/scripts/landing_case3/seg_detect_case3.py backend/scripts/landing_case3/hero_slices_case3.py backend/scripts/landing_case3/render_case3.py backend/scripts/landing_case3/render_clips.py backend/scripts/landing_case3/render_util.py` → sin salida. `grep -rn "AppData\|C:/UniNavarra" backend/scripts/landing_case3` → sin resultados.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/media/landing/hero.json frontend/public/media/landing/hero-3d.webp frontend/public/media/landing/hero frontend/public/media/landing/secciones frontend/public/media/landing/clips
git add backend/scripts/landing_case3/*.py
git add frontend/src/components/landing/heroFrames.ts frontend/src/components/landing/heroFrames.test.ts frontend/src/components/landing/heroAssets.test.ts frontend/src/components/landing/VentanaDeteccion.tsx frontend/src/components/landing/HeroCortes.tsx frontend/src/components/landing/HeroCortes.test.tsx frontend/src/styles/landing.css
git status --short
git commit -m "Fase 11: hero con Case 3 (3DRA), crédito dentro de la ventana de detección (A11)"
```

---

### Task 2: Base responsive — `data-tramo`, A12, textos ≥ 13 px y franja de casos (A7)

**Files:**
- Create: `frontend/src/test/cssReglas.ts`, `frontend/src/styles/landing.responsive.test.ts`
- Modify: `frontend/src/pages/Landing.tsx`, `frontend/src/styles/landing.css`, `frontend/src/components/landing/heroFrames.ts`, `frontend/src/components/landing/FranjaCasos.tsx`, `frontend/src/styles/puntosCorte.audit.test.ts`
- Test: `frontend/src/pages/Landing.test.tsx`, `frontend/src/components/landing/HeroCortes.test.tsx`, `frontend/src/components/landing/FranjaCasos.test.tsx`

**Interfaces:**
- Consumes: `useTramo()` de `hooks/useEstrecho`; `CONSULTA` de `styles/puntosCorte`; `simularPantalla` de `test/pantalla`.
- Produces: atributo `data-tramo` en `.landing-stitch` (lo usan en CSS todas las tareas siguientes) y `src/test/cssReglas.ts`:
  - `reglas(css: string): { selectores: string[]; cuerpo: string }[]` — quita comentarios; recoge cada `selector { cuerpo }` sin llaves anidadas (también las de dentro de un `@media`); separa la lista de selectores por las comas de nivel superior (fuera de paréntesis) y normaliza espacios.
  - `tieneDeclaracion(css: string, selector: string, declaracion: string): boolean` — hay una regla cuya lista contiene exactamente `selector` (normalizado) y cuyo cuerpo contiene `declaracion` (normalizada).
- Produces: `CONSULTA_HERO_QUIETO = \`${CONSULTA.movil}, (max-height: 600px)\``.

- [ ] **Step 1: Escribir los tests que fallan**

`Landing.test.tsx`, nuevo `describe("responsive")` con `afterEach(() => vi.unstubAllGlobals())`:
```ts
it.each([[360, "movil"], [390, "movil"], [768, "tableta"], [1024, "tableta"], [1280, "estrecho"],
  [1366, "ancho"], [1707, "ancho"], [1920, "grande"], [2560, "grande"]])(
  "a %i px la raíz es data-tramo=%s", (ancho, tramo) => {
    simularPantalla(ancho);
    const { container } = show();
    expect(container.querySelector(".landing-stitch")).toHaveAttribute("data-tramo", tramo);
  });
it("al girar la tableta el tramo cambia sin recargar", () => {
  const p = simularPantalla(1280);
  const { container } = show();
  act(() => p.cambiar({ ancho: 768 }));
  expect(container.querySelector(".landing-stitch")).toHaveAttribute("data-tramo", "tableta");
});
it("las imágenes bajo el hero cargan perezosas y con tamaño explícito", () => {
  const { container } = show();
  const imgs = [...container.querySelectorAll("img")].filter((i) => !i.closest('[aria-label="Portada"]'));
  expect(imgs.length).toBeGreaterThan(0);
  for (const i of imgs) {
    expect(i).toHaveAttribute("loading", "lazy");
    expect(i).toHaveAttribute("decoding", "async");
    expect(i.getAttribute("width")).toMatch(/^\d+$/);
    expect(i.getAttribute("height")).toMatch(/^\d+$/);
  }
});
```
`HeroCortes.test.tsx`: con `simularPantalla(ancho, alto)`, `(390, 844)` y `(844, 390)` dan `hero-cortes--quieto`; `(768, 1024)` y `(1707, 743)` dan el hero animado (`height: 300vh`). Y `expect(CONSULTA_HERO_QUIETO).toBe("(max-width: 640px), (max-height: 600px)")`.
`FranjaCasos.test.tsx`: `.franja-casos__texto` lleva `data-glass`; el `<source>` tiene `media="(max-width: 640px)"`; `.franja-casos__credito` contiene el enlace IntrA.
`landing.responsive.test.ts` (lee `landing.css` con `readFileSync`):
```ts
it("landing.css no tiene consultas de anchura: la disposición cuelga de data-tramo", () => {
  expect(css).not.toMatch(/@media[^{]*\b(?:max|min)-width/);
});
it("A12: secciones con clamp(64px, 10vh, 140px)", () => {
  expect(tieneDeclaracion(css, ".landing-stitch .sec", "padding: clamp(64px, 10vh, 140px) 24px")).toBe(true);
  expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .sec', "padding: clamp(64px, 10vh, 140px) 16px")).toBe(true);
});
it("hero y anchos por tramo", () => {
  expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .hero-cortes__contenido', "grid-template-columns: minmax(0, 1fr)")).toBe(true);
  expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="tableta"] .hero-cortes__contenido', "grid-template-columns: minmax(0, 1fr) minmax(0, 340px)")).toBe(true);
  expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="grande"] .hero-cortes__contenido', "max-width: 1600px")).toBe(true);
  expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="grande"] .sec__cuerpo', "max-width: 1360px")).toBe(true);
});
it("objetivos de 44 px por debajo de 1024", () => {
  const hasta1024 = '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"])';
  expect(tieneDeclaracion(css, `${hasta1024} .hero-cortes__ancla`, "height: var(--control-md)")).toBe(true);
  expect(tieneDeclaracion(css, `${hasta1024} .franja-casos__credito a`, "padding-block: 12px")).toBe(true);
});
it("ningún texto por debajo de 13 px salvo los rótulos mono en mayúsculas", () => {
  for (const r of reglas(css)) {
    const m = /font-size:\s*(\d+)px/.exec(r.cuerpo);
    const pequeno = (m && Number(m[1]) < 13) || /font-size:\s*var\(--text-(?:micro|eyebrow)\)/.test(r.cuerpo);
    if (!pequeno) continue;
    expect(r.cuerpo, r.selectores.join(", ")).toMatch(/text-transform:\s*uppercase/);
    expect(r.cuerpo, r.selectores.join(", ")).toMatch(/font-family:\s*var\(--font-mono\)/);
  }
});
```
`puntosCorte.audit.test.ts`: borrar de `LEGADO` las entradas `styles/landing.css`, `components/landing/heroFrames.ts` y `components/landing/FranjaCasos.tsx` (queda `NavPildora.tsx: [900]` para la Tarea 5).

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/pages/Landing.test.tsx src/components/landing src/styles`
Expected: FAIL (sin `data-tramo`, consultas 760 en el CSS, textos de 11–12 px, legado que ya no casa).

- [ ] **Step 3: Implementar**

- `Landing.tsx`: `data-tramo={useTramo()}` en la raíz.
- `heroFrames.ts`: `CONSULTA_HERO_QUIETO` con `CONSULTA.movil` (el comentario conserva el porqué de los 600 de alto).
- `landing.css`:
  - Borrar el bloque `@media (max-width: 760px), (max-height: 600px)` del hero: la clase `.hero-cortes--quieto`, que ya pone HeroCortes, cubre escenario y contenido.
  - Las reglas de los dos `@media (max-width: 760px)` (hero y secciones) pasan a `.landing-stitch[data-tramo="movil"] …`.
  - Tableta: `.hero-cortes__contenido` con `grid-template-columns: minmax(0, 1fr) minmax(0, 340px)`, `gap: 24px`, `padding: 96px 16px 48px`.
  - Grande: `.sec__cuerpo` y `.pie` a `max-width: 1360px`; `.hero-cortes__contenido` a `max-width: 1600px`; `.franja-casos__texto` con `left: max(24px, calc((100% - 1360px) / 2))`.
  - `.sec`: `padding: clamp(64px, 10vh, 140px) 24px`; en móvil `clamp(64px, 10vh, 140px) 16px`.
  - ≤ 1024: `.hero-cortes__ancla { height: var(--control-md) }`.
  - A 13 px: `.hero-cortes__rotulo`, `.hero-ventana__cabecera`, `.hero-ventana__fila` (móvil), `.hero-ventana__num`, `.hero-ventana__insignia`, `.hero-ventana__nota`, `.franja-casos__credito`. `.franja-casos__rotulo` gana `text-transform: uppercase` (ya es mono).
- `FranjaCasos.tsx` (A7): `<source media={CONSULTA.movil} …>`; `<img … decoding="async">`; el bloque de texto con `data-glass` y `style={{ ...glass("dense"), borderRadius: "var(--radius-xl)" }}`, y en CSS `.franja-casos__texto { padding: 20px 24px }`; el crédito es una banda a todo el ancho abajo (`left: 0; right: 0; bottom: 0; padding: 10px 24px; background: var(--veil-dense); text-align: right`) y ≤ 1024 `min-height: 44px; display: flex; align-items: center; justify-content: flex-end`, con `a { padding-block: 12px }`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/pages/Landing.test.tsx src/components/landing src/styles` → PASS. `npx tsc -b` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/test/cssReglas.ts frontend/src/styles/landing.responsive.test.ts frontend/src/pages/Landing.tsx frontend/src/pages/Landing.test.tsx frontend/src/styles/landing.css frontend/src/components/landing/heroFrames.ts frontend/src/components/landing/HeroCortes.test.tsx frontend/src/components/landing/FranjaCasos.tsx frontend/src/components/landing/FranjaCasos.test.tsx frontend/src/styles/puntosCorte.audit.test.ts
git commit -m "Fase 11: landing por tramos (data-tramo), secciones más juntas (A12), textos de 13 px y franja de casos legible (A7)"
```

---

### Task 3: Desplazamiento animado a las secciones (A1) y sección activa (lógica)

**Files:**
- Create: `frontend/src/components/landing/desplazamiento.ts`, `frontend/src/components/landing/useSeccionActiva.ts`
- Modify: `frontend/src/motion/presets.ts`, `frontend/src/motion/index.ts`, `frontend/src/components/landing/HeroCortes.tsx` (ancla «Ver cómo funciona ↓»)
- Test: `frontend/src/components/landing/desplazamiento.test.ts`, `frontend/src/components/landing/useSeccionActiva.test.tsx`, `frontend/src/motion/presets.test.ts`, `frontend/src/components/landing/HeroCortes.test.tsx`, `frontend/src/styles/landing.responsive.test.ts`

**Interfaces:**
- Produces (en `motion/presets.ts`, exportado por el barrel): `revelar: Variants = { oculto: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }`; `revelarTransition = { duration: DUR.panel, ease: EASE }`; `ESCALONADO = 0.06`; `DUR_DESPLAZAMIENTO = 0.6`.
- Produces (`desplazamiento.ts`):
  - `DESFASE_NAV = 96` (lo que tapa la píldora; el mismo número que `scroll-margin-top` en `landing.css`).
  - `destinoDe(el: Element, scrollY: number, desfase = DESFASE_NAV): number` = `Math.max(0, el.getBoundingClientRect().top + scrollY - desfase)`.
  - `desplazarA(id: string, opciones: { reducido: boolean }): () => void` — sin elemento con ese id no hace nada y devuelve una función vacía. Hace `history.pushState(null, "", "#" + id)`. Reducido: `window.scrollTo({ top: destino, behavior: "instant" })` y enfoca. Si no: `animate(window.scrollY, destino, { duration: DUR_DESPLAZAMIENTO, ease: EASE, onUpdate: (y) => window.scrollTo(0, y), onComplete: enfocar })`, y una sola escucha pasiva de `wheel`, `touchstart` y `keydown` en `window` que llama a `stop()`; las escuchas se quitan al acabar o al cortar. Enfocar = `el.focus({ preventScroll: true })`. Devuelve la cancelación.
  - `useIrASeccion(): (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void` — con `e.defaultPrevented`, `e.button !== 0` o cualquiera de `metaKey/ctrlKey/shiftKey/altKey`, no hace nada; si no, `e.preventDefault()` y `desplazarA(id, { reducido: useReducedMotion() ?? false })`.
- Produces (`useSeccionActiva.ts`): `interface CajaSeccion { id: string; top: number; bottom: number }`; `LINEA_ACTIVA = 0.4`; `seccionEnLinea(cajas: readonly CajaSeccion[], linea: number): string | null` (la caja con `top <= linea < bottom`, o `null`); `useSeccionActiva(ids: readonly string[]): string | null` — calcula al montar y en `scroll` y `resize` de `window` (escuchas pasivas, sin rAF) con `linea = innerHeight * LINEA_ACTIVA` y las cajas de `document.getElementById(id)?.getBoundingClientRect()`; solo hace `setState` si cambia.

- [ ] **Step 1: Escribir los tests que fallan**

`presets.test.ts`: `revelar.oculto` igual a `{ opacity: 0, y: 16 }`; `ESCALONADO` 0,06; `DUR_DESPLAZAMIENTO` 0,6; `revelarTransition.duration` 0,48.
`desplazamiento.test.ts` — mock parcial de `../../motion` con `animate: vi.fn(() => ({ stop }))`; `window.scrollTo = vi.fn()`; una `<section id="indices" tabindex="-1">` en el documento con `getBoundingClientRect` que da `{ top: 1300 }`; `scrollY` 0:
```ts
it("destinoDe resta el alto de la nav y nunca baja de 0", () => {
  expect(destinoDe(el, 0)).toBe(1204);
  expect(destinoDe(cajaEn(50), 0)).toBe(0);
});
it("anima de scrollY al destino en 0,6 s con la curva común y deja el foco en la sección", () => {
  desplazarA("indices", { reducido: false });
  expect(animate).toHaveBeenCalledWith(0, 1204, expect.objectContaining({ duration: 0.6, ease: EASE }));
  const op = vi.mocked(animate).mock.calls[0][2] as { onUpdate(y: number): void; onComplete(): void };
  op.onUpdate(600);
  expect(window.scrollTo).toHaveBeenCalledWith(0, 600);
  op.onComplete();
  expect(document.activeElement).toBe(el);
  expect(location.hash).toBe("#indices");
});
it("la rueda, un toque o una tecla cortan la animación", () => {
  for (const tipo of ["wheel", "touchstart", "keydown"]) {
    stop.mockClear();
    desplazarA("indices", { reducido: false });
    window.dispatchEvent(new Event(tipo));
    expect(stop).toHaveBeenCalledTimes(1);
  }
});
it("con movimiento reducido salta directo, sin animar", () => {
  desplazarA("indices", { reducido: true });
  expect(animate).not.toHaveBeenCalled();
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 1204, behavior: "instant" });
});
it("un id que no existe no hace nada", () => {
  desplazarA("nada", { reducido: false });
  expect(animate).not.toHaveBeenCalled();
});
it("Ctrl/Cmd/Mayús-clic y botón central se dejan al navegador", () => {
  // renderHook(() => useIrASeccion()); eventos falsos con preventDefault espía:
  // { button: 0, ctrlKey: true }, { button: 0, metaKey: true }, { button: 0, shiftKey: true }, { button: 1 }
  // → ni preventDefault ni animate; { button: 0 } sin modificadores → los dos llamados
});
```
`useSeccionActiva.test.tsx`: `seccionEnLinea([{ id: "a", top: 0, bottom: 500 }, { id: "b", top: 500, bottom: 900 }], 400)` → `"a"`; con 500 → `"b"`; con 950 → `null`. El hook con `renderHook`, `simularPantalla(1280, 1000)` (línea en 400) y dos secciones cuyo `getBoundingClientRect` se cambia en el test: al montar con `que-es` en `top: 500` → `null`; tras ponerla en `top: 100, bottom: 900` y `fireEvent.scroll(window)` → `"que-es"`; con todas por encima de la línea → `null`.
`HeroCortes.test.tsx` — mock parcial de `./desplazamiento` con `useIrASeccion: () => irA`, donde `irA = vi.fn()` sale de `vi.hoisted` (mockear `desplazarA` no sirve: `useIrASeccion` lo llama dentro del mismo módulo y el mock no lo intercepta): un clic en «Ver cómo funciona ↓» llama a `irA(expect.anything(), "como-funciona")` y el enlace conserva `href="#como-funciona"`.
`landing.responsive.test.ts`: `tieneDeclaracion(css, ".landing-stitch section[id]", \`scroll-margin-top: ${DESFASE_NAV}px\`)` es `true` (un enlace profundo `/#indices` o el botón atrás caen bajo la nav sin JS).

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/components/landing/desplazamiento.test.ts src/components/landing/useSeccionActiva.test.tsx src/components/landing/HeroCortes.test.tsx src/motion src/styles/landing.responsive.test.ts`
Expected: FAIL (módulos y presets inexistentes).

- [ ] **Step 3: Implementar** los presets (y añadirlos al barrel), `desplazamiento.ts` y `useSeccionActiva.ts` con las firmas de arriba. En `HeroCortes.tsx`: `const irA = useIrASeccion();` y `onClick={(e) => irA(e, "como-funciona")}` en el ancla.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: el comando del Step 2 → PASS. `npx tsc -b` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/motion/presets.ts frontend/src/motion/index.ts frontend/src/motion/presets.test.ts frontend/src/components/landing/desplazamiento.ts frontend/src/components/landing/desplazamiento.test.ts frontend/src/components/landing/useSeccionActiva.ts frontend/src/components/landing/useSeccionActiva.test.tsx frontend/src/components/landing/HeroCortes.tsx frontend/src/components/landing/HeroCortes.test.tsx frontend/src/styles/landing.responsive.test.ts
git commit -m "Fase 11: desplazamiento animado a las secciones, cortable con la rueda y directo con movimiento reducido (A1)"
```

---

### Task 4: `Seccion` y revelado escalonado al entrar en pantalla (A2)

**Files:**
- Create: `frontend/src/components/landing/Seccion.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita su `Seccion` local; el cuerpo de `Contacto` va en `Revelar`), `frontend/src/styles/landing.css`
- Test: `frontend/src/components/landing/Seccion.test.tsx`, `frontend/src/pages/Landing.test.tsx`

**Interfaces:**
- Consumes: `revelar`, `revelarTransition`, `ESCALONADO`, `motion`, `useReducedMotion` (barrel); `useVisible` de `components/patients/useVisible`.
- Produces:
  - `Revelar({ children, className, escalonado = false }: { children: ReactNode; className?: string; escalonado?: boolean })` — `motion.div` con `variants={revelar}`; `visible = useVisible(ref, "0px 0px -10% 0px")`; `initial = reducido || visibleAlMontar ? false : "oculto"`, donde `visibleAlMontar` es el valor de `visible` en el primer render (sin IntersectionObserver es `true`: no hay nada que revelar); `animate = visible || reducido ? "visible" : "oculto"`; transición `{ ...revelarTransition, staggerChildren: escalonado ? ESCALONADO : 0 }`. Con `reducido`, ni opacidad ni desplazamiento en línea.
  - `RevelarItem(props: { as?: "div" | "li" | "figure"; className?: string; style?: CSSProperties; children: ReactNode; [dato: \`data-${string}\`]: string | boolean | undefined })` — `motion[as]` con `variants={revelar}`, sin `initial` ni `animate` propios (hereda del `Revelar` más cercano); pasa los `data-*`.
  - `Seccion({ id, rotulo, titulo, children, className }: { id?: string; rotulo: string; titulo: string; children: ReactNode; className?: string })` — `<section id={id} aria-label={rotulo} tabIndex={-1} className={"sec " + className}>` con `<Revelar className="sec__cuerpo" escalonado>`; la cabecera (rótulo y `h2`) es un `RevelarItem`.

- [ ] **Step 1: Escribir los tests que fallan**

`Seccion.test.tsx` (mock de `useReducedMotion` como en `HeroCortes.test.tsx`; `afterEach(() => vi.unstubAllGlobals())`):
```ts
it("con IntersectionObserver y fuera de pantalla, los ítems esperan ocultos 16 px abajo", () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  const { container } = render(
    <Seccion id="x" rotulo="R" titulo="T"><RevelarItem data-prueba="1">a</RevelarItem></Seccion>);
  const item = container.querySelector('[data-prueba="1"]') as HTMLElement;
  expect(item.style.opacity).toBe("0");
  expect(item.style.transform).toMatch(/translateY\(16px\)/);
});
it("sin IntersectionObserver todo se pinta ya entero", () => {
  // sin stub: item.style.opacity distinto de "0" y item.style.transform sin translateY
});
it("con movimiento reducido no hay revelado ni desplazamiento", () => {
  // stub de IO que nunca cruza + reducido: ni opacity "0" ni transform en el ítem ni en la cabecera
});
it("la sección se puede enfocar al llegar por el desplazamiento y se anuncia por su rótulo", () => {
  render(<Seccion id="x" rotulo="Qué es" titulo="T">a</Seccion>);
  const s = screen.getByRole("region", { name: "Qué es" });
  expect(s).toHaveAttribute("tabindex", "-1");
  expect(s).toHaveAttribute("id", "x");
});
```
`Landing.test.tsx`: «ningún fichero de la landing lleva colores escritos a mano»: para cada `components/landing/*.tsx` sin `.test.` y para `pages/Landing.tsx`, quitados los comentarios, no casa `/#[0-9a-f]{3,8}\b|rgba?\(/i`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/components/landing/Seccion.test.tsx src/pages/Landing.test.tsx` → FAIL (no existe `Seccion.tsx`).

- [ ] **Step 3: Implementar** `Seccion.tsx`; `Landing.tsx` importa `Seccion` y envuelve el cuerpo de `Contacto` en `Revelar`. CSS: `.landing-stitch section[tabindex="-1"]:focus { outline: none }` (el foco lo pone el programa al llegar, no el teclado).

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/components/landing src/pages/Landing.test.tsx` → PASS. `npx tsc -b` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/Seccion.tsx frontend/src/components/landing/Seccion.test.tsx frontend/src/pages/Landing.tsx frontend/src/pages/Landing.test.tsx frontend/src/styles/landing.css
git commit -m "Fase 11: revelado de las secciones al entrar, escalonado de 60 ms y nada con movimiento reducido (A2)"
```

---

### Task 5: NavPildora — plegado a 1024, móvil compacto, desplazamiento y píldora activa (A1, A3)

**Files:**
- Modify: `frontend/src/components/landing/NavPildora.tsx`, `frontend/src/styles/landing.css`, `frontend/src/styles/puntosCorte.audit.test.ts`
- Test: `frontend/src/components/landing/NavPildora.test.tsx`

**Interfaces:**
- Consumes: `useIrASeccion`, `useSeccionActiva` (Tarea 3); `CONSULTA`; `useMediaQuery`, `useMovil`; `Icon`; `DUR`, `EASE`, `motion`, `useReducedMotion`.
- Produces: `NAV_PLEGADA = CONSULTA.tableta`; `ENLACES` sin cambios (Qué es, Cómo funciona, Índices, Dispositivos).

Decisiones de disposición:
- **> 1024:** marca completa, los cuatro enlaces, «Entrar» (`secondary`) y «Crear cuenta», los dos `size="sm"`. El enlace de la sección activa lleva `aria-current="location"` y, detrás del texto, `<motion.span layoutId="landing-nav-activa" className="landing-nav__activa" />` (fondo `var(--glass-hover)`, `border-radius: var(--radius-full)`, `position: absolute; inset: 0; z-index: -1`; el enlace con `position: relative; isolation: isolate`). Transición del `layoutId`: `{ duration: DUR.estado, ease: EASE }`; `{ duration: 0 }` con movimiento reducido. Sin sección activa, no hay píldora.
- **641–1024:** marca completa; «Entrar», «Crear cuenta» y «Menú» (con texto) en `size="md"` (44 px); los cuatro enlaces en el panel plegado.
- **≤ 640:** marca compacta; solo «Entrar» (`md`) y un botón `size="md"` con `<Icon name="MENU" />` y `aria-label="Menú"`; «Crear cuenta» (`md`, a lo ancho) va dentro del panel, bajo los enlaces.
- En el panel, el enlace activo lleva `aria-current="location"` y la clase `landing-nav__enlace--activo` (color `var(--foreground)`, sin `layoutId`).
- Cada enlace: `onClick={(e) => { setAbierto(false); irA(e, id); }}`.

- [ ] **Step 1: Escribir los tests que fallan**

Sustituir `conAnchoEstrecho` por `simularPantalla` (`afterEach(() => vi.unstubAllGlobals())`); mock parcial de `./desplazamiento` con `useIrASeccion: () => irA` (`irA = vi.fn()` de `vi.hoisted`; no mockear `desplazarA`, que se llama dentro del mismo módulo) y de `./useSeccionActiva` (`useSeccionActiva: () => activa.valor`, con `activa` de `vi.hoisted`, `null` por defecto).
```ts
it("el punto de plegado es el de tableta (1024)", () => expect(NAV_PLEGADA).toBe(CONSULTA.tableta));
it("a 1280: cuatro enlaces y accesos pequeños, sin «Menú»", () => {
  simularPantalla(1280); montar();
  expect(screen.getByRole("button", { name: "Entrar" })).toHaveAttribute("data-size", "sm");
  expect(screen.queryByRole("button", { name: "Menú" })).toBeNull();
});
it.each([1024, 768])("a %i: plegada, marca completa y accesos de 44 px", (ancho) => {
  simularPantalla(ancho); montar();
  expect(screen.getByText("por SkullApp")).toBeInTheDocument();
  for (const n of ["Entrar", "Crear cuenta", "Menú"])
    expect(screen.getByRole("button", { name: n })).toHaveAttribute("data-size", "md");
});
it("a 390: marca compacta, «Entrar» y menú de icono; «Crear cuenta» dentro del panel", () => {
  simularPantalla(390); montar();
  expect(screen.queryByText("por SkullApp")).toBeNull();
  expect(screen.queryByRole("button", { name: "Crear cuenta" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Menú" }));
  expect(screen.getByRole("button", { name: "Crear cuenta" })).toHaveAttribute("data-size", "md");
});
it("al cruzar 1024 en vivo se pliega", () => {
  const p = simularPantalla(1280); montar();
  act(() => p.cambiar({ ancho: 1024 }));
  expect(screen.getByRole("button", { name: "Menú" })).toBeInTheDocument();
});
it("un clic en un enlace desplaza con animación", () => {
  simularPantalla(1280); montar();
  fireEvent.click(screen.getByRole("link", { name: "Índices" }));
  expect(irA).toHaveBeenCalledWith(expect.anything(), "indices");
});
it("en el panel, el clic cierra el menú y desplaza", () => {
  // 768: abrir «Menú», clic en «Qué es» → aria-expanded "false" e irA(expect.anything(), "que-es")
});
it("la sección activa lleva aria-current y la píldora deslizante; las demás no", () => {
  activa.valor = "indices"; simularPantalla(1280);
  const { container } = montar();
  const indices = screen.getByRole("link", { name: "Índices" });
  expect(indices).toHaveAttribute("aria-current", "location");
  expect(screen.getByRole("link", { name: "Qué es" })).not.toHaveAttribute("aria-current");
  expect(container.querySelectorAll(".landing-nav__activa")).toHaveLength(1);
  expect(indices.querySelector(".landing-nav__activa")).not.toBeNull();
});
it("sin sección activa (hero, funcionalidades…) no hay píldora", () => {
  // activa.valor = null → 0 elementos .landing-nav__activa y ningún aria-current
});
```
Los tests existentes de Escape, tocar fuera, scroll y color en clase se mantienen, a 768 px (o a 1280 el del color). `puntosCorte.audit.test.ts`: borrar la entrada `components/landing/NavPildora.tsx`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/components/landing/NavPildora.test.tsx src/styles/puntosCorte.audit.test.ts` → FAIL.

- [ ] **Step 3: Implementar** las decisiones de arriba en `NavPildora.tsx` y el CSS de `.landing-nav__activa` y `.landing-nav__enlace--activo`. La cabecera del fichero dice 1024 (fuera el «900»).

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/components/landing src/styles src/pages/Landing.test.tsx` → PASS. `npx tsc -b` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/NavPildora.tsx frontend/src/components/landing/NavPildora.test.tsx frontend/src/styles/landing.css frontend/src/styles/puntosCorte.audit.test.ts
git commit -m "Fase 11: nav con sección activa en píldora deslizante, desplazamiento animado y plegado a 1024 (A1, A3)"
```

---

### Task 6: «Qué es» con el render de Case 3 (A4)

**Files:**
- Create: `frontend/src/components/landing/SeccionQueEs.tsx`, `frontend/src/components/landing/HaloLesion.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita `QueEs` local, importa el nuevo), `frontend/src/styles/landing.css`
- Test: `frontend/src/components/landing/SeccionQueEs.test.tsx`, `frontend/src/styles/landing.responsive.test.ts`

**Interfaces:**
- Consumes: `Seccion`, `RevelarItem` (Tarea 4); `glass`; `/media/landing/secciones/case3-oblicua.webp` (Tarea 1).
- Produces: `QueEs()`; `HaloLesion({ x, y }: { x: number; y: number })` — `x`, `y` en % de la caja padre; un punto `var(--destructive)` de 14 px y un anillo `motion.span` que late (`animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}`, `transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}`) salvo con movimiento reducido (anillo quieto, sin `animate`); `aria-hidden="true"`; atributo `data-pulso="true" | "false"`. Lo reutiliza la Tarea 8.

Contenido: los dos bloques de texto de hoy, sin cambiar una palabra (los tests F1-37 los buscan), cada uno un `RevelarItem`. Al lado, `RevelarItem as="figure"` con `className="que-es__figura"`, `data-glass`, `style={{ ...glass("normal"), borderRadius: "var(--radius-xl)" }}`: una caja con `aspect-ratio: 4 / 3` que lleva `<img src="/media/landing/secciones/case3-oblicua.webp" width={800} height={600} loading="lazy" decoding="async" alt="Malla 3D de Case 3 (3DRA) segmentada por Prospective, con la lesión del tronco basilar marcada en rojo">` y `<HaloLesion x={60} y={40} />`; debajo, `<figcaption>Case 3 · 3DRA · malla de la segmentación automática</figcaption>` a 13 px.

Disposición (`<div className="que-es">`): > 1024 `grid-template-columns: minmax(0, 5fr) minmax(0, 7fr)`, `gap: 48px`, `align-items: center`; ≤ 1024 `grid-template-columns: minmax(0, 1fr)`, la figura bajo el texto con `max-width: 640px; margin-inline: auto`. La imagen a `width: 100%; height: auto`.

- [ ] **Step 1: Escribir los tests que fallan**

`SeccionQueEs.test.tsx`: región «Qué es» con `id="que-es"`; la imagen con su `src`, `alt`, `width="800"` y `height="600"`, dentro de un `[data-glass]`; el pie de figura con su texto; `HaloLesion` con `data-pulso="true"`, y con movimiento reducido `"false"` sin `transform` en línea; los dos textos de siempre presentes.
`landing.responsive.test.ts`: `tieneDeclaracion(css, ".landing-stitch .que-es", "grid-template-columns: minmax(0, 5fr) minmax(0, 7fr)")` y `tieneDeclaracion(css, '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"]) .que-es', "grid-template-columns: minmax(0, 1fr)")`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npx vitest run src/components/landing/SeccionQueEs.test.tsx src/styles/landing.responsive.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `HaloLesion.tsx`, `SeccionQueEs.tsx` y su CSS; `Landing.tsx` usa `<QueEs />`.
- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npx vitest run src/components/landing src/pages/Landing.test.tsx src/styles` → PASS; `npx tsc -b` → sin errores.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/SeccionQueEs.tsx frontend/src/components/landing/SeccionQueEs.test.tsx frontend/src/components/landing/HaloLesion.tsx frontend/src/pages/Landing.tsx frontend/src/styles/landing.css frontend/src/styles/landing.responsive.test.ts
git commit -m "Fase 11: «Qué es» con el render de Case 3 en un marco de cristal (A4)"
```

---

### Task 7: «Cómo funciona» — riel de pasos con iconos que se enciende al avanzar (A5)

**Files:**
- Create: `frontend/src/components/landing/riel.ts`, `frontend/src/components/landing/SeccionComoFunciona.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita `ComoFunciona`, `NUM_WORD`, `spell` y `LINEA_PASO` locales), `frontend/src/styles/landing.css` (`.pasos*` → `.riel*`)
- Test: `frontend/src/components/landing/riel.test.ts`, `frontend/src/components/landing/SeccionComoFunciona.test.tsx`, `frontend/src/styles/landing.responsive.test.ts`

**Interfaces:**
- Consumes: `Seccion`, `RevelarItem`; `STEPS`; `Icon`, `IconName`; `useTableta`; `useScroll`, `useMotionValueEvent`, `motion`, `useReducedMotion` (barrel).
- Produces: `pasosEncendidos(progreso: number, n: number): number` = `progreso <= 0 ? 0 : Math.min(n, Math.floor(progreso * (n - 1) + 1e-6) + 1)`; `ComoFunciona()`.

Decisiones:
- Título como hoy (`Del estudio al plan, en ocho pasos y en el orden de la cirugía`, con el número deletreado desde `STEPS.length`); `LINEA_PASO` igual.
- Icono por paso: el de `STEPS`, salvo `upload → "UPLOAD"` y `manufacture → "WORKSHOP"`.
- `<ol ref className="riel" data-disposicion={useTableta() ? "vertical" : "horizontal"}>`; dentro, `<div className="riel__pista" aria-hidden="true">` con `<motion.div className="riel__relleno">`, y un `RevelarItem as="li" className="riel__paso"` por paso con `data-encendido={i < encendidos ? "true" : "false"}`: `.riel__nodo` (círculo de 44 px con el icono a 20 px), `.riel__num` («01»…), `.riel__nombre`, `.riel__linea`.
- Progreso: `useScroll({ target: olRef, offset: ["start 75%", "end 55%"] }).scrollYProgress`; el relleno con `style={{ scaleX: p }}` en horizontal o `{{ scaleY: p }}` en vertical (`transform-origin` izquierda / arriba); `useMotionValueEvent(p, "change", (v) => setEncendidos(pasosEncendidos(v, STEPS.length)))`. Con movimiento reducido: relleno sin `style` (lleno por CSS) y los ocho encendidos.
- Encendido: borde e icono `var(--data)`, fondo `color-mix(in srgb, var(--data) 14%, transparent)`, transición de color `var(--dur-2)`. Apagado: borde `var(--glass-border)`, icono `var(--muted-foreground)`. Relleno `var(--data)`, pista `var(--border)`, 2 px.
- Horizontal (> 1024): `grid-template-columns: repeat(8, minmax(0, 1fr))`, `gap: 8px`, texto centrado, pista en `top: 22px` de `left: calc(100% / 16)` a `right: calc(100% / 16)`; `.riel__nombre` 15 px, `.riel__linea` 13 px. Vertical (≤ 1024): una columna con `row-gap: 20px`; cada paso `grid-template-columns: 44px minmax(0, 1fr)`, `column-gap: 16px`; pista en `left: 22px`, de `top: 22px` a `bottom: 22px`; nombre 17 px, línea 14 px.

- [ ] **Step 1: Escribir los tests que fallan**

`riel.test.ts`: `pasosEncendidos(0, 8)` → 0; `(0.01, 8)` → 1; `(1 / 7, 8)` → 2; `(0.5, 8)` → 4; `(1, 8)` → 8; `(1.5, 8)` → 8; `(-1, 8)` → 0.
`SeccionComoFunciona.test.tsx` (mock de `useReducedMotion`; `afterEach(() => vi.unstubAllGlobals())`):
```ts
it.each([[1280, "horizontal"], [1707, "horizontal"], [1024, "vertical"], [768, "vertical"], [390, "vertical"]])(
  "a %i px el riel es %s", (ancho, disp) => {
    simularPantalla(ancho); render(<ComoFunciona />);
    expect(screen.getByRole("list")).toHaveAttribute("data-disposicion", disp);
  });
it("al girar la tableta el riel cambia de orientación", () => {
  // simularPantalla(1280) → act(() => p.cambiar({ ancho: 768 })) → "vertical"
});
it("ocho pasos, cada uno con su icono, en el orden de STEPS", () => {
  render(<ComoFunciona />);
  const items = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(items.map((li) => li.querySelector(".riel__nombre")?.textContent)).toEqual(STEPS.map((s) => s.label));
  for (const li of items) expect(li.querySelector(".riel__nodo svg")).not.toBeNull();
});
it("sin avanzar, ningún paso encendido y el relleno a cero", () => {
  // los ocho li con data-encendido="false"; (.riel__relleno).style.transform casa /scaleX\(0\)/
});
it("con movimiento reducido, todo encendido y sin transformación", () => {
  // ocho "true"; el relleno sin transform en línea
});
```
`landing.responsive.test.ts`: `tieneDeclaracion(css, '.landing-stitch .riel[data-disposicion="horizontal"]', "grid-template-columns: repeat(8, minmax(0, 1fr))")` y `tieneDeclaracion(css, '.landing-stitch .riel[data-disposicion="vertical"] .riel__paso', "grid-template-columns: 44px minmax(0, 1fr)")`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npx vitest run src/components/landing/riel.test.ts src/components/landing/SeccionComoFunciona.test.tsx src/styles/landing.responsive.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `riel.ts`, `SeccionComoFunciona.tsx` y el CSS `.riel*` (fuera `.pasos*`).
- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npx vitest run src/components/landing src/pages/Landing.test.tsx src/styles` → PASS (siguen verdes «cuenta los pasos que hay» y «enseña todos los pasos» de `Landing.test.tsx`); `npx tsc -b` → sin errores.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/riel.ts frontend/src/components/landing/riel.test.ts frontend/src/components/landing/SeccionComoFunciona.tsx frontend/src/components/landing/SeccionComoFunciona.test.tsx frontend/src/pages/Landing.tsx frontend/src/styles/landing.css frontend/src/styles/landing.responsive.test.ts
git commit -m "Fase 11: «Cómo funciona» como riel de pasos con iconos que se enciende al avanzar (A5)"
```

---

### Task 8: «Funcionalidades» en rejilla bento de cristal (A6)

**Files:**
- Create: `frontend/src/components/landing/SeccionFuncionalidades.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita `Funcionalidades` y `FUNCIONALIDADES` locales), `frontend/src/styles/landing.css`
- Test: `frontend/src/components/landing/SeccionFuncionalidades.test.tsx`, `frontend/src/styles/landing.responsive.test.ts`

**Interfaces:**
- Consumes: `Seccion`, `RevelarItem`, `HaloLesion` (Tarea 6), `Icon`, `glass`; assets `secciones/case3-frontal.webp`, `secciones/case3-saco.webp`, `clips/navarro-t4-fenestrado.webp`.
- Produces: `Funcionalidades()`.

Tarjetas, en el orden del DOM (que es el de lectura en móvil); los nueve títulos son los de hoy, literales:

| `data-area` | tipo | título | línea | visual |
|---|---|---|---|---|
| `seg` | grande | Segmentación 3D automática | El árbol vascular sale del DICOM sin pintarlo a mano. | `case3-frontal.webp` 800×600, alt «Árbol vascular completo de Case 3 visto de frente» |
| `morfo` | pequeña | Morfometría del saco y del cuello | Cuello, altura, Ø máximo e índices de forma, en milímetros. | `STEP_MORPHO` |
| `motor` | pequeña | Motor de decisión: PHASES, JSDB y geometría | Tres criterios por separado; ninguno se esconde en una puntuación. | `STEP_PLAN` |
| `detec` | grande | Detección por calibre, cociente y curvatura | Candidatos numerados; cada uno dice qué canal lo encontró. | `case3-saco.webp` 800×600, alt «Primer plano de la lesión del tronco basilar de Case 3, marcada en rojo», con `HaloLesion x={50} y={50}` |
| `prueba` | pequeña | Prueba de clips, coils y stents | Sobre la malla del paciente, antes de entrar a quirófano. | `CLIPS` |
| `informe` | pequeña | Informe clínico | Medidas, decisión y dispositivo en un documento. | `STEP_EXPORT` |
| `clip` | grande | Clip a medida para fabricar | La mordaza se ajusta al cuello medido y el pedido va al taller. | `navarro-t4-fenestrado.webp` 600×600, alt «Clip NAVARRO™ T4 fenestrado» |
| `sesiones` | pequeña | Sesiones guardadas | Se reanudan en el paso donde se dejaron. | `SAVE` |
| `pacientes` | pequeña | Pacientes, casos y estudios | Ordenados como trabaja el servicio. | `PATIENTS` |

Cada tarjeta: `RevelarItem as="li"` con `data-glass`, `data-area`, `className="bento__tarjeta bento__tarjeta--grande"` o `--pequena`, y `style={{ ...glass("normal"), borderRadius: "var(--radius-card-lg)" }}` (el área NO va en línea: la pone el CSS por `data-area`). Grande: imagen arriba en una caja 4/3 con `object-fit: contain`, título 17/600 y línea 14 abajo; la de `clip`, en `estrecho`, `ancho` y `grande`, pone la imagen a la izquierda (caja cuadrada de 200 px) y el texto a la derecha. Pequeña: icono de 20 px en un círculo de 40 px, título 16/600, línea 14. Hover: solo cambia el borde a `var(--border-strong, var(--border))`, sin escala. Debajo, la `.sec__nota` de hoy.

Rejilla `<ul className="bento">`:
- > 1024: `grid-template-columns: repeat(4, minmax(0, 1fr))`, `grid-auto-rows: minmax(180px, auto)`, `gap: 14px`, `grid-template-areas: "seg seg morfo motor" "seg seg prueba informe" "sesiones pacientes detec detec" "clip clip detec detec"`.
- 641–1024: `grid-template-columns: repeat(2, minmax(0, 1fr))`, `grid-template-areas: "seg seg" "morfo motor" "detec detec" "prueba informe" "clip clip" "sesiones pacientes"`.
- Áreas: una regla por tarjeta, `.landing-stitch .bento__tarjeta[data-area="seg"] { grid-area: seg }` (y así las nueve).
- ≤ 640: `grid-template-columns: minmax(0, 1fr)`, `grid-template-areas: none`, y `.landing-stitch[data-tramo="movil"] .bento__tarjeta { grid-area: auto }` escrita DESPUÉS de las nueve (misma especificidad: gana por orden; manda el orden del DOM).

- [ ] **Step 1: Escribir los tests que fallan**

`SeccionFuncionalidades.test.tsx`: región «Funcionalidades»; nueve `li[data-glass]` con `data-area` en el orden `["seg", "morfo", "motor", "detec", "prueba", "informe", "clip", "sesiones", "pacientes"]`; los nueve títulos literales; las tres grandes con su `img` (`src` y `alt` de la tabla) y las seis pequeñas con un `svg`; la nota «La herramienta propone; el cirujano decide.» presente.
`landing.responsive.test.ts`: las tres `grid-template-columns` por tramo (selectores `.landing-stitch .bento`, `.landing-stitch[data-tramo="tableta"] .bento`, `.landing-stitch[data-tramo="movil"] .bento`) la `grid-template-areas` de > 1024 con el texto exacto de arriba, `tieneDeclaracion(css, '.landing-stitch .bento__tarjeta[data-area="detec"]', "grid-area: detec")` y `tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .bento__tarjeta', "grid-area: auto")`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npx vitest run src/components/landing/SeccionFuncionalidades.test.tsx src/styles/landing.responsive.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `SeccionFuncionalidades.tsx` y el CSS `.bento*`.
- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npx vitest run src/components/landing src/pages/Landing.test.tsx src/styles` → PASS (incluido «imágenes perezosas» de la Tarea 2); `npx tsc -b` → sin errores.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/SeccionFuncionalidades.tsx frontend/src/components/landing/SeccionFuncionalidades.test.tsx frontend/src/pages/Landing.tsx frontend/src/styles/landing.css frontend/src/styles/landing.responsive.test.ts
git commit -m "Fase 11: «Funcionalidades» en rejilla bento de cristal con tres tarjetas con imagen (A6)"
```

---

### Task 9: «Índices» con el diagrama del saco que resalta la cota de cada índice (A8)

**Files:**
- Create: `frontend/src/components/landing/indices.ts`, `frontend/src/components/landing/DiagramaSaco.tsx`, `frontend/src/components/landing/SeccionIndices.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita `Indices` local y los imports de `thresholds` y `cifra` que ya no use), `frontend/src/styles/landing.css`
- Test: `frontend/src/components/landing/indices.test.ts`, `frontend/src/components/landing/SeccionIndices.test.tsx`, `frontend/src/styles/landing.responsive.test.ts`

**Interfaces:**
- Consumes: `Seccion`, `RevelarItem`; `AR_HIGH, BF_WIDE, DNR_HIGH, EI_MOD, SR_HIGH, UI_HIGH` de `components/morphometry/thresholds`; `cifra`; `motion`, `DUR`, `EASE`.
- Produces:
  - `type Cota = "cuello" | "altura" | "anchura" | "dmax" | "madre" | "contorno" | "elipse" | "esfera"`.
  - `NOMBRE_COTA: Record<Cota, string>`: cuello «cuello», altura «altura», anchura «Ø domo», dmax «Ø máx», madre «Ø arteria madre», contorno «contorno», elipse «elipse», esfera «esfera».
  - `interface IndiceMorfo { abbr: string; titulo: string; detalle: string; cotas: readonly Cota[] }` y `INDICES: readonly IndiceMorfo[]`: los ocho de hoy (mismos `titulo` y `detalle`, con los cortes de `thresholds` y `cifra`) con cotas DNR `["dmax", "cuello"]`, AR `["altura", "cuello"]`, BF `["anchura", "cuello"]`, UI `["contorno"]`, EI `["elipse"]`, NSI `["esfera"]`, SR `["dmax", "madre"]`, PHASES `["dmax"]`.
  - `DiagramaSaco({ activas }: { activas: readonly Cota[] })` — `<svg viewBox="0 0 320 260" role="img" aria-label={\`Diagrama del saco: resalta ${activas.map((c) => NOMBRE_COTA[c]).join(" y ")}\`}>`. La arteria madre es un tubo horizontal abajo; el saco se apoya en ella con un cuello estrecho. Un `<motion.g data-cota={c} data-activa={activa ? "true" : "false"}>` por cota, con su línea y su rótulo (`font-size: 14`, `font-family: var(--font-mono)`): cuello (segmento en la base), altura (perpendicular del cuello al domo), anchura (paralela al cuello en la parte más ancha), dmax (la diagonal más larga), madre (sección del tubo), contorno (casco convexo discontinuo alrededor del saco), elipse (elipse ajustada, discontinua), esfera (círculo de igual volumen, discontinuo). Activa: `opacity: 1`, trazo `var(--data)` de 2; inactiva: `opacity: 0.28`, trazo `var(--muted-foreground)`; `transition={{ duration: DUR.estado, ease: EASE }}`. Saco con relleno `color-mix(in srgb, var(--destructive) 18%, transparent)` y borde `var(--destructive)`. Se pinta a 300 px de ancho como mínimo (los rótulos no bajan de 13 px).
  - `Indices()` — estado `activo` (posición en `INDICES`, inicial 0 = DNR). Lista `<ul className="indices__lista">` de `RevelarItem as="li"` con `<button type="button" className="indices__fila" aria-pressed={i === activo}>`: título 17/600, detalle 14 atenuado, sigla a la derecha en mono 15/600; `onMouseEnter`, `onFocus` y `onClick` fijan `activo`. Al lado, `<div className="indices__diagrama">` con `<DiagramaSaco activas={INDICES[activo].cotas} />`. Debajo, la `.sec__nota` de hoy.

Disposición (`<div className="indices">`): > 1024 `grid-template-columns: minmax(0, 7fr) minmax(0, 5fr)`, `gap: 48px`, diagrama con `position: sticky; top: 120px; align-self: start`. ≤ 1024 una columna, el diagrama primero (`order: -1`), `max-width: 420px; margin-inline: auto` y `position: static`.

- [ ] **Step 1: Escribir los tests que fallan**

`indices.test.ts`: ocho siglas en el orden `["DNR", "AR", "BF", "UI", "EI", "NSI", "SR", "PHASES"]`; las cotas de la lista de arriba; el detalle de DNR es `` `Ø máx / cuello · riesgo ↑ si ≥ ${cifra(DNR_HIGH, 1)}` `` (y los demás, los de hoy).
`SeccionIndices.test.tsx`:
```ts
const activas = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-cota][data-activa="true"]')].map((g) => g.getAttribute("data-cota")).sort();
it("arranca con DNR: Ø máx y cuello", () => {
  const { container } = render(<Indices />);
  expect(screen.getByRole("button", { name: /Relación domo-cuello/ })).toHaveAttribute("aria-pressed", "true");
  expect(activas(container)).toEqual(["cuello", "dmax"]);
  expect(screen.getByRole("img", { name: "Diagrama del saco: resalta Ø máx y cuello" })).toBeInTheDocument();
});
it("pasar por AR resalta altura y cuello; enfocar EI, la elipse; tocar SR, Ø máx y arteria madre", () => {
  // fireEvent.mouseEnter(AR) → ["altura", "cuello"]; fireEvent.focus(EI) → ["elipse"]; fireEvent.click(SR) → ["dmax", "madre"]
});
it("solo un índice pulsado a la vez", () => {
  // tras click en BF, exactamente un aria-pressed="true"
});
```
`landing.responsive.test.ts`: `tieneDeclaracion(css, ".landing-stitch .indices", "grid-template-columns: minmax(0, 7fr) minmax(0, 5fr)")`, `tieneDeclaracion(css, ".landing-stitch .indices__diagrama", "position: sticky")`, `tieneDeclaracion(css, '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"]) .indices__diagrama', "position: static")` y `tieneDeclaracion(css, ".landing-stitch .indices__fila", "min-height: 44px")`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npx vitest run src/components/landing/indices.test.ts src/components/landing/SeccionIndices.test.tsx src/styles/landing.responsive.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `indices.ts`, `DiagramaSaco.tsx`, `SeccionIndices.tsx` y su CSS.
- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npx vitest run src/components/landing src/pages/Landing.test.tsx src/styles` → PASS (F2-8 sigue encontrando los cortes con coma y los nombres en español; «los ocho índices se rotulan…» sigue verde); `npx tsc -b` → sin errores.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/indices.ts frontend/src/components/landing/indices.test.ts frontend/src/components/landing/DiagramaSaco.tsx frontend/src/components/landing/SeccionIndices.tsx frontend/src/components/landing/SeccionIndices.test.tsx frontend/src/pages/Landing.tsx frontend/src/styles/landing.css frontend/src/styles/landing.responsive.test.ts
git commit -m "Fase 11: «Índices» con diagrama del saco que resalta la cota de cada índice (A8)"
```

---

### Task 10: «Dispositivos» con los renders T1–T4 (A9, A13) y «Próximamente» en tarjetas (A10)

**Files:**
- Create: `frontend/src/components/landing/SeccionDispositivos.tsx`, `frontend/src/components/landing/SeccionProximamente.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (quita `Dispositivos`, `SERIES`, `trazo` y `Proximamente` locales), `frontend/src/styles/landing.css` (`.series*` nuevo; fuera `.lista-reglas*`)
- Delete: `frontend/src/components/landing/ListaConReglas.tsx` (ya sin usos)
- Test: `frontend/src/components/landing/SeccionDispositivos.test.tsx`, `frontend/src/components/landing/SeccionProximamente.test.tsx`, `frontend/src/pages/Landing.test.tsx`, `frontend/src/styles/landing.responsive.test.ts`

**Interfaces:**
- Consumes: `Seccion`, `RevelarItem`, `Icon`, `glass`, `lensCard`, `useReducedMotion`; assets `clips/*.webp` (Tarea 1).
- Produces: `Dispositivos()`, `Proximamente()`.

Dispositivos: rótulo, título y párrafo de hoy. Cuatro fichas `RevelarItem as="li"` en `<ul className="series">`, cada una con `data-glass`, `glass("normal")` y `whileHover={lensCard.whileHover}` (más su `transition`) salvo con movimiento reducido:

| nombre (A13) | detalle | imagen | alt |
|---|---|---|---|
| T1 recto | — | `/media/landing/clips/navarro-t1-recto.webp` | Clip NAVARRO™ T1 recto |
| T2 curvo | — | `/media/landing/clips/navarro-t2-curvo.webp` | Clip NAVARRO™ T2 curvo |
| T3 angulado | 15–90° | `/media/landing/clips/navarro-t3-angulado-45.webp` | Clip NAVARRO™ T3 angulado |
| T4 fenestrado | ventana 3 · 5 · 7 mm | `/media/landing/clips/navarro-t4-fenestrado.webp` | Clip NAVARRO™ T4 fenestrado |

`RevelarItem` no acepta `whileHover`: la ficha es un `RevelarItem` y dentro va un `motion.div className="series__ficha"` con el hover. `<img width={600} height={600} loading="lazy" decoding="async">` a `width: 100%; height: auto; max-width: 220px`, nombre 17/600, detalle mono 13. Rejilla: > 1024 `repeat(4, minmax(0, 1fr))`; ≤ 1024 `repeat(2, minmax(0, 1fr))`.

Próximamente: `<ul className="proximo">` con tres `RevelarItem as="li"` de cristal (`data-glass`, `glass("normal")`): icono de 20 px en un círculo de 44 px, insignia `<span className="stitch-label proximo__insignia">Próximamente</span>` (píldora con borde `var(--glass-border)`), título 17/600 y texto 14.
- `CLOUD` · SkullCloud · Almacenamiento y colaboración de casos en la nube entre centros.
- `VRAR` · AR / VR · Exploración inmersiva de la anatomía vascular y el plan quirúrgico.
- `CHART` · Analítica · Estadísticas agregadas de casos, dispositivos y resultados.

Rejilla: ≥ 641 `repeat(3, minmax(0, 1fr))`; ≤ 640 `minmax(0, 1fr)`.

- [ ] **Step 1: Escribir los tests que fallan**

`Landing.test.tsx`: en «nombra la familia que sí se ofrece…» las series pasan a `[/T1 recto/, /T2 curvo/, /T3 angulado/, /T4 fenestrado/]`, más `expect(text()).not.toMatch(/T1 recta|T2 curva|T3 angulada|T4 fenestrada/)`.
`SeccionDispositivos.test.tsx`: región «Dispositivos NAVARRO™» con `id="dispositivos"`; cuatro `li[data-glass]` con su nombre, su `img` (`src`, `alt`, 600×600) y los dos detalles; con movimiento reducido ninguna ficha lleva `transform` en línea tras `fireEvent.mouseEnter`.
`SeccionProximamente.test.tsx`: tres tarjetas `[data-glass]` con título, texto, un `svg` y la insignia «Próximamente».
`landing.responsive.test.ts`: `.landing-stitch .series` → `grid-template-columns: repeat(4, minmax(0, 1fr))`; `.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"]) .series` → `repeat(2, minmax(0, 1fr))`; `.landing-stitch .proximo` → `repeat(3, minmax(0, 1fr))`; `.landing-stitch[data-tramo="movil"] .proximo` → `minmax(0, 1fr)`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npx vitest run src/components/landing src/pages/Landing.test.tsx src/styles/landing.responsive.test.ts` → FAIL.
- [ ] **Step 3: Implementar** las dos secciones y su CSS. Comprobar `grep -rn "ListaConReglas\|lista-reglas" frontend/src` → solo el fichero y las reglas que se borran; borrarlos.
- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npx vitest run` (suite completa del frontend) → PASS; `npx tsc -b` → sin errores.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/SeccionDispositivos.tsx frontend/src/components/landing/SeccionDispositivos.test.tsx frontend/src/components/landing/SeccionProximamente.tsx frontend/src/components/landing/SeccionProximamente.test.tsx frontend/src/pages/Landing.tsx frontend/src/pages/Landing.test.tsx frontend/src/styles/landing.css frontend/src/styles/landing.responsive.test.ts
git rm frontend/src/components/landing/ListaConReglas.tsx
git commit -m "Fase 11: renders de los clips T1–T4 con nombres en masculino (A9, A13) y «Próximamente» en tarjetas (A10)"
```

---

### Task 11: Verificación en el navegador por la matriz (la hace el controlador)

**Files:** ninguno (capturas en el scratchpad; cada arreglo que salga, como tarea de seguimiento con su test).

- [ ] **Step 1:** `npx vitest run` y `npx tsc -b` en el worktree → todo verde. Arrancar solo el frontend (`npm run dev`, con Start-Process; la landing es pública) y abrir `/`.
- [ ] **Step 2: Matriz.** Anchos 360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560 × altos 600, 768, 900, 1080 (con la ventana maximizada, iframes del mismo origen como en la auditoría; 1707×743 es el portátil del dueño al 80 %). En cada uno: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`); nada se corta ni se pisa (nav, hero y ventana, riel, bento, diagrama, fichas, franja); objetivos ≥ 44 px por debajo de 1024; textos ≥ 13 px (salvo rótulos mono en mayúsculas); hero quieto en ≤ 640 y con alto ≤ 600, animado en el resto.
- [ ] **Step 3: Movimiento.** Clic en «Qué es», «Cómo funciona», «Índices», «Dispositivos» y «Ver cómo funciona ↓»: viaje de ~0,6 s que acaba con el rótulo de la sección bajo la píldora, la URL con su `#` y la píldora deslizada al enlace; girar la rueda a medio viaje lo corta. `/#indices` en una pestaña nueva cae bajo la nav. Revelado escalonado al bajar; el riel se enciende paso a paso; el diagrama cambia al pasar por cada índice; el halo de la lesión late.
- [ ] **Step 4: Movimiento reducido** (DevTools → Rendering → `prefers-reduced-motion: reduce`): saltos directos, nada se revela, riel lleno, halo quieto, hero quieto.
- [ ] **Step 5: Hero de Case 3.** Los 60 fotogramas 3DRA bajan hasta el corte de la lesión y se funden en el render con la baliza sobre el saco; la ventana lista los cinco candidatos con el pie dentro del cristal (A11); rótulo `W 3000 · L 1800 · MIP 4,2 mm · corte n/384`.
- [ ] **Step 6:** Red: ninguna imagen de sección se pide antes de acercarse; sin saltos de maquetación al cargar. Guardar capturas y anotar hallazgos; si todo pasa, fusionar `--no-ff` en `main` (sin push).

---

### Task 12: Tema claro de la landing (pedido del dueño, 01-11) — se ejecuta ANTES de la Tarea 11

**Files:**
- Modify: `frontend/src/pages/Landing.tsx` (quitar `data-theme="dark"` de la raíz y su comentario)
- Modify: `frontend/src/styles/landing.css` (cabecera «dark-only»; todo color por token; reglas propias de claro donde haga falta)
- Modify: `frontend/src/styles/tokens/colors.css` (solo si faltan tokens `--landing-*` para los dos temas)
- Modify: `frontend/src/components/landing/NavPildora.tsx` (conmutador de tema)
- Modify: `frontend/src/components/landing/HeroCortes.tsx`, `VentanaDeteccion.tsx`, `FranjaCasos.tsx` (escenarios oscuros acotados)
- Test: `frontend/src/pages/Landing.test.tsx`, `frontend/src/components/landing/NavPildora.test.tsx`, `frontend/src/styles/landing.tema.test.ts` (nuevo)

**Interfaces:**
- Consumes: `ThemeToggle` (`components/ThemeToggle.tsx`, `size` "md"/"lg"), `useThemeContext` (`store/theme`), `useTableta`, `simularPantalla`, `styles/contraste.ts`.
- Produces: atributo `data-escenario="oscuro"` + `data-theme="dark"` SOLO en los contenedores de imagen radiológica (escenario del hero con cortes/render y su ventana de detección; figura de la franja de casos si su imagen es oscura).

**Decisiones:**
- La landing sigue el tema global (`ThemeProvider`; la primera vez, el del sistema, como el resto de la app). Conmutador de tema en la nav pill (a la derecha de «Entrar»; 44 px a ≤ 1024; en móvil dentro del panel del menú).
- Escenario del hero: fondo `--viewer-bg` (negro) en los dos temas, con `data-theme="dark"` acotado a ese contenedor para que la ventana de detección y los rótulos sobre la imagen sigan claros sobre negro. En claro, el escenario es una «pantalla» con radio `--radius-xl` y margen lateral (no a sangre) por encima de 1024; a ≤ 1024 a sangre.
- Resto de secciones: tokens (`--canvas`, `--foreground`, `--muted-foreground`, `--glass*`, `--border`, `--data`). Renders con fondo transparente (secciones/, clips/) se ven sobre claro sin marco extra; si un render pierde contraste en claro, va dentro de una tarjeta de cristal con fondo `--viewer-bg`.
- Velo/viñeteado del vídeo y degradados que suponían fondo negro: por token, con variante clara.

- [ ] **Step 1: Tests que fallan**
  - Landing sin `data-theme` en la raíz; con tema claro la raíz hereda `light`; el escenario del hero conserva `data-theme="dark"` y `data-escenario="oscuro"` en los dos temas.
  - NavPildora: hay botón de tema (nombre accesible del ThemeToggle) y mide 44 px a ≤ 1024 (`simularPantalla(1024)`), en móvil dentro del panel.
  - `landing.tema.test.ts`: `landing.css` sin `#hex`/`rgb(` fuera de `:root`/bloques de tokens (o lista de permitidos comentada); contraste ≥ 4,5:1 de `--foreground`, `--muted-foreground` y `--data` sobre `--canvas` y sobre el cristal de la landing en CLARO y en OSCURO (`styles/contraste.ts`).
- [ ] **Step 2:** ver fallar. **Step 3:** implementar. **Step 4:** `npx vitest run src/pages/Landing.test.tsx src/components/landing src/styles` y `npx tsc -b` en verde.
- [ ] **Step 5: Commit** con lista explícita: «Fase 11: tema claro de la landing (sigue el tema de la app; escenario radiológico oscuro)».

