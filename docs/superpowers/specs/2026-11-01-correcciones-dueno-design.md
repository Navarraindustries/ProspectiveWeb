# Correcciones del dueño tras el rediseño D (2026-11-01)

Ronda de correcciones sobre el rediseño «Quirófano de cristal» (spec
`2026-10-31-rediseno-cristal-d-design.md`, fases 1–7 ya en `main`). Fuentes:
la lista del dueño del 01-11 y la auditoría visual del mismo día
(`2026-11-01-auditoria-visual.md`, hallazgos A1–A70, citados aquí por su id).
Todo lo que la auditoría propone se adopta salvo donde este documento diga
otra cosa.

## Por qué

El dueño quedó contento con el conjunto, pero ve tres huecos: la landing se
queda en texto plano bajo el hero; las páginas de gestión (Pedidos, Talleres,
Usuarios…) llevan el cristal por fuera y el estilo viejo por dentro; y hay
contenedores con scroll o cortes donde bastaba con dar ancho o alto. Además
cambia la marca y el caso del hero.

## Decisiones del dueño

1. **Hero con Case 3 (3DRA)**, no Zenodo 036: su segmentación se ve más
   limpia. El dueño confirma que Case 3 (anonimizado, «Anonymized3») se puede
   publicar en la landing y en el repositorio público.
2. **Fuera el fondo de TC de todo** (`components/Entorno.tsx`, imagen
   `/media/entorno/corte-036.webp`): login, crear cuenta, cambio de contraseña
   forzado y todas las páginas internas. En su lugar, un fondo «ambiente»
   (abajo). El visor del quirófano no cambia.
3. **Marca nueva:** icono **D «corte axial»** con logotipo **4 «Prospective™»
   en Sora 600**. Fuente de verdad: el lienzo
   https://claude.ai/artifact/7yiA2DemzaQQzWGd9ndEL5 (`project/Main.dc.html`,
   tarjeta D; `project/Logotipos.dc.html`, fila 4).
4. **Más dinamismo en la landing:** visuales en cada sección, animación de
   entrada y desplazamiento animado al pulsar «Qué es», «Cómo funciona»…
5. **Revisión exhaustiva** y arreglo de lo encontrado (auditoría).

## Responsive: requisito de toda la ronda

Decisión del dueño (01-11): «independientemente del tamaño de la pantalla se
pueda ver de la mejor manera toda la herramienta». Aplica a CADA vista que
toque cualquier fase, no solo a los hallazgos que lo mencionan.

- **Matriz de anchos** (CSS px): 360, 390, 768, 1024, 1280, 1366, 1440, 1920,
  2560. **Altos**: 600, 768, 900, 1080+. Ojo: el dueño usa Chrome al 80 %, así
  que su portátil de 1366 px físicos da 1707×743 CSS; no hay que suponer que
  «portátil» = 1366.
- **Criterios en todos los anchos:** nada se corta ni se pisa; ningún scroll
  horizontal de página; ningún scroll interno si el contenedor puede crecer;
  objetivos táctiles ≥ 44 px por debajo de 1024; textos ≥ 13 px; los
  formularios y hojas usan el ancho disponible (hoja a pantalla completa en
  móvil); las tablas pasan a tarjetas por debajo de 640; a ≥ 1920 el
  contenido no se estira sin fin (`--content-max`), y lo que es lienzo
  (visor, landing) sí aprovecha el ancho.
- **Puntos de corte comunes** en un solo sitio (`styles/tokens` o
  `hooks/useEstrecho`): 640 (móvil), 1024 (tableta), 1280 (L5, ya existe),
  1920 (pantalla grande). Nada de números sueltos nuevos en los componentes.
- **Quirófano en móvil y tableta:** debe abrirse y usarse para revisar un
  caso (visor + hoja inferior L5 + dock), aunque la segmentación fina siga
  siendo de escritorio; en ≤ 640 el dock y la banda del visor se compactan a
  iconos y nada se monta.
- **Verificación:** cada fase añade, por vista tocada, un test que fije el
  comportamiento por punto de corte (clases/atributos con `matchMedia`
  simulado, ya que jsdom no hace layout) y, al cerrar la fase, una pasada en
  el navegador por la matriz con capturas. Fase 12 final: pasada completa por
  la matriz en todas las vistas y arreglo de lo que quede.

## Fondo ambiente (sustituye a Entorno)

- Componente `components/Ambiente.tsx` (Entorno se borra, con su test y su
  imagen). Capa fija, `pointer-events: none`, detrás del contenido.
- Oscuro: fondo `#050608` con 2–3 brillos radiales muy tenues de la marca
  (azul `--data` al 8–12 %, uno arriba a la izquierda, otro abajo a la
  derecha más pequeño) y un grano fino (SVG de ruido en CSS, opacidad ≤ 4 %).
  Claro: el mismo esquema sobre `#F3F5F8` con brillos azules al 6–8 %.
  Tokens nuevos `--ambient-*` en `tokens/colors.css` para los dos temas.
- El cristal debe seguir notándose: los brillos son lo que el
  `backdrop-filter` difumina. Con `prefers-reduced-transparency` el fondo se
  queda plano (sin brillos ni grano).
- Sin animación (o una deriva lentísima de los brillos, ≥ 40 s, apagada con
  movimiento reducido): decisión del implementador, por defecto quieto.

## Marca

- `components/shell/Logo.tsx` pasa a dibujar el icono D en SVG inline (no
  `logo.png`): variante «app» (cuadrado `--primary` con el icono en
  `--primary-foreground`, el punto en blanco) y variante «línea» (icono en
  `currentColor` con el punto en `--data`). A ≤ 32 px el icono simplificado
  (elipse + punto grande, sin los dos puntos pequeños), como en el lienzo.
- Logotipo: «Prospective» en **Sora 600**, `letter-spacing: -0.02em`, con
  «™» en superíndice atenuado, y «por SkullApp» debajo donde hoy aparece.
  Sora se autoaloja como Inter/JetBrains (woff2 latin + latin-ext, OFL, desde
  el repositorio oficial de Sora o google/fonts), solo pesos 500–600.
- Favicon: SVG del icono app + PNG 32/180 (apple-touch) generados del mismo
  SVG; `index.html` los enlaza. Se retira `assets/logo.png` si nada más lo usa.
- Sitios: pestaña, `AuthBrand` (login/crear cuenta), barra lateral
  (`SideNav`), nav de la landing, pie de la landing, pantalla de carga si
  muestra la marca, informe PDF del backend **no** (fuera de alcance).

## Base común de la oficina

- Un solo ancho: `--content-max` (1280) para todas las páginas internas, vía
  un componente `PageBody` común (A17). Fuera los `maxWidth` propios.
- Sheet: la capa deja de capturar el puntero en cuanto empieza la salida (A18).
- Botón `outline`/`secondary` en claro: transparente o `--glass` con borde,
  nunca gris relleno (A21, A52).
- Atajo: «Ctrl K» fuera de macOS (A20).
- Barra superior adaptable (A19): `nowrap` en botones; < 1100 acciones
  secundarias como icono con tooltip; ≤ 640 en un menú «⋯».
- Login/Crear cuenta/cambio forzado: cristal con `glass("normal")` +
  `data-glass` (A15) sobre el fondo ambiente; textos de A61.

## Páginas de gestión (restilado D completo)

Pedidos de clips, Talleres, Usuarios, Cuentas pendientes, Auditoría,
Estudios, Pacientes (detalles), ficha L3 y hoja Nuevo caso: todo lo de las
secciones 4–12 de la auditoría. Reglas comunes:

- Controles del sistema D (Button, Input, Select, Badge, Tabs, Sheet) en vez
  de estilos inline; interruptor de cristal en lugar del checkbox nativo
  (componente `Switch` nuevo si no existe).
- Monoespaciada solo para cifras, códigos y medidas.
- Tablas: sin scroll horizontal a ningún ancho ≥ 1024 (acciones agrupadas en
  menú «⋯» o iconos con rótulo accesible); por debajo de 640, tarjetas.
- Ninguna lista dentro de una hoja con alto fijo si la hoja tiene sitio
  (A30): la lista crece y el pie queda fijo.
- Plurales correctos, fechas con un formato común es-ES (A38), nada de
  códigos internos en inglés a la vista (A40, A58, A65 «Candidato 1»).
- «T1 recto» como nombre de serie en todas partes (A13).

## Quirófano

A63–A70. Prioridad: la banda del visor (A63) y la cinta de rumbo (A64) no se
pisan a ningún ancho; ids internos fuera (A65); botones sin partir (A66); el
dock marca hechos los pasos completados aunque estén después del actual
(A67); el paso 4 avisa de que calculará la morfometría (A68: aviso en el
tooltip/rótulo, sin cambiar el comportamiento).

## Landing

- **Hero con Case 3:** se regeneran los assets con el script
  `backend/scripts/landing_hero_assets.py` adaptado (o uno nuevo) a partir
  del DICOM de `Archivos DICOM/DICOM/Case 3` (XA multiframe, 384³): cortes
  axiales del 3DRA con su ventana propia (vasos brillantes sobre negro), malla
  segmentada con el pipeline real (`segment_tubular`, preset XA), render 3D y
  la lista real de candidatos del detector, con la lesión basilar (GT voxel
  (62,64,63), ver memoria del proyecto) marcada. `DETECCION_036` pasa a
  `DETECCION_CASE3` con el mismo contrato; textos «Caso Zenodo 036» → «Case 3
  · 3DRA». El manifiesto `hero.json` y su copia en `heroFrames.ts` se
  actualizan juntos (el test los compara). Un solo proceso VTK a la vez.
- **Movimiento:** desplazamiento animado a las secciones (A1), revelado al
  entrar en pantalla (A2), sección activa en la nav (A3). Todo con `motion`
  del barrel `src/motion`, y con `prefers-reduced-motion` salto directo y sin
  revelado.
- **Visuales por sección:** Qué es (A4) con un visual del producto; Cómo
  funciona (A5) con los iconos de paso y una línea que se enciende al
  avanzar; Funcionalidades (A6) en rejilla bento de cristal con 2–3 tarjetas
  con imagen; Índices (A8) con el diagrama SVG del saco; Dispositivos (A9)
  con render de los clips; Próximamente (A10) en tarjetas. Las imágenes nuevas
  son renders propios (malla de Case 3, clips NAVARRO de los STL del repo) o
  capturas de la propia app; nada de stock.
- A7, A11, A12 tal cual.
- **Tema claro (pedido del dueño, 01-11):** la landing deja de estar anclada en
  oscuro y sigue el tema de la app (la primera vez, el del sistema; conmutador
  de tema en la nav, 44 px en táctil). El escenario del hero (cortes y render
  3D) conserva el fondo negro en los dos temas, como el visor del quirófano
  (`--viewer-bg`); en claro se presenta como una pantalla dentro de la página.
  Todo lo demás pasa a tokens de tema, con cristal claro y contraste 4,5:1
  medido en los dos temas.

## Fases

Cada fase en su worktree, SDD, fusión local `--no-ff`, sin push.

| fase | contenido |
|---|---|
| 8 | Base común y marca: Ambiente, PageBody, Sheet, Button claro, Ctrl K, barra superior, login/crear cuenta, marca (Logo, Sora, favicon). |
| 9 | Páginas de gestión: auditoría §4–§13. |
| 10 | Quirófano: auditoría §14. |
| 11 | Landing: Case 3, movimiento, visuales, auditoría §1. |
| 12 | Responsive: pasada por la matriz de anchos y altos en TODAS las vistas (también las que ninguna fase tocó) y arreglo de lo que quede. |

Los assets de Case 3 (proceso VTK pesado) se generan en paralelo a las fases
8–9, fuera de los worktrees de código, y entran en la fase 11.

## Fuera de alcance

Informe PDF y DICOM SR (marca y estilo propios); lógica del pipeline; la
regla de la corteza (revertida el 01-11).
