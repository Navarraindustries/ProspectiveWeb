# Rediseño de Prospective Web en «Quirófano de cristal» (dirección D) — documento de diseño

Fecha: 31 de octubre de 2026. Estado: pedido por el dueño del producto («Vamos con el rediseño de todo Prospective con el estilo D: Quirófano de cristal, y la mezcla de L que recomiendas»). Sustituye la **estética** del documento `2026-10-30-rediseno-visual-design.md` (dirección A, «Obsidiana clínica»), cuyas fases 1–3 ya están en `main`; conserva sus **decisiones funcionales** (§8 y Anexo A de aquel documento), que aquí no se repiten salvo cuando cambian.

Lienzo de referencia (privado, pedir acceso al dueño): https://claude.ai/artifact/A9MSZeTbCYmwMtGbFrTY6e — filas D (estética) y L1–L6 (distribuciones). Copia de los tableros que mandan en `docs/superpowers/specs/assets/2026-10-31-cristal-d/` (HTML de Claude Design; las imágenes del lienzo se sirven como `/_blob/…` y no cargan fuera de él: son `corte-036.webp` y `malla-036.webp` de esa carpeta).

## 1. Intención y por qué

El dueño enseña Prospective a su jefe de servicio, a neurocirujanos y a comités. Tras ver ocho direcciones de cristal eligió la D: **la imagen médica es el entorno**; la interfaz son piezas de cristal oscuro que flotan sobre ella; el visor 3D es negro y manda. Después vio seis distribuciones con ese material y pidió la mezcla recomendada: la estructura que los médicos ya conocen de un PACS (barra lateral, contenido, inspector) en la oficina, la cascada de columnas solo en la ficha del paciente, y el quirófano de la D (visor a pantalla entera, dock de pasos, inspector flotante) en el pipeline.

Lo que hay hoy en `main` (fases 1–3 de la dirección A) ya tiene la estructura buena: tokens, módulo de movimiento, componentes base, barra lateral, barra superior única, panel derecho 380/520 con pie fijo, rail de pasos, dial y odómetro. Este rediseño cambia el **material** de todo eso y la **distribución** del pipeline y de la ficha; no reescribe la lógica.

## 2. Objetivos, no objetivos, anti-objetivos

**Objetivos**
- Una sola identidad D de arriba abajo: landing, Entrar, carga, oficina, ficha y quirófano.
- La imagen real (corte de TC y malla del caso Zenodo 036) como fondo de la oficina, de Entrar y de la landing; el visor como fondo del quirófano.
- Distribución por zona según §5: oficina L1, ficha L3, quirófano D, formularios en hoja lateral, pantallas estrechas con hoja inferior L5, paleta ⌘K global, registro de la sesión en el inspector.
- Conservar `public/media/intro.mp4` (Entrar y Crear cuenta) y `public/media/loading.mp4` (pantalla de carga). Los elementos three.js de la landing se retiran (el dueño: «también son prescindibles»).
- `prefers-reduced-motion` y `prefers-reduced-transparency` respetados en todo.

**No objetivos**
- No cambia el flujo funcional (8 pasos; paciente → caso → estudio de imagen → sesión), ni la API (salvo el campo aditivo de §8.9), ni el backend, ni los textos clínicos que prueban los tests (si un texto cambia, su test cambia en la misma tarea).
- No se introduce Tailwind ni una librería de componentes; sigue el CSS plano con tokens + estilos en línea.
- No se rediseña el visor VTK por dentro (cámara, planos, herramientas, actores, colores por plano).

**Anti-objetivos (fracaso aunque funcione)**
- Cristal encima de la imagen médica que se está leyendo: el lienzo WebGL del visor nunca queda debajo de un panel con desenfoque en escritorio (§5.4).
- Texto ilegible sobre cristal: todo texto ≥ 4,5:1 contra el peor fondo posible detrás del cristal.
- Que la oficina parezca un juguete: nada de orbes, partículas ni degradados de color; el único «efecto» es el cristal sobre la imagen.
- El visor saltando al cambiar de paso.
- Coste de GPU en portátiles de hospital sin gráfica dedicada: desenfoque solo en piezas sobre fondos estáticos, WebGL solo en el visor.

## 3. Restricciones

- Stack: React 19 + Vite 7, `motion` 12 (barrel `src/motion`), `@kitware/vtk.js`, iconos SVG propios (`components/Icon.tsx`), CSS plano con tokens en `frontend/src/styles/tokens/*.css`. Sin eslint configurado. Tests con `npx vitest run` y `npx tsc -b`.
- Repositorio público: ningún asset con datos identificables. Imágenes solo del caso Zenodo 036 (CC-BY, anonimizado).
- Commits por lista explícita de ficheros; nunca `git add -A`; nunca commitear `docs/Informe-Ejecutivo-Zenodo.html` ni `frontend/data/`.
- Mientras corra una pasada del backend no se lanzan procesos VTK pesados en paralelo (los tests del frontend no lo son).
- Las fuentes no se cargan de una CDN: se autoalojan como hoy.

## 4. El material D (decidido)

### 4.1 Color (tema oscuro, por defecto)

| Papel | Valor | Token (nombre actual que se reutiliza) |
|---|---|---|
| Fondo de aplicación | `#050608` | `--canvas` |
| Visor | `#0B0C0F` (el lienzo VTK sigue en su negro actual) | `--viewer-bg` no cambia |
| Velo sobre la imagen | `rgba(5,6,8,.55)` (oficina), `.72` donde haya lectura larga | nuevo `--veil`, `--veil-dense` |
| Cristal | `rgba(255,255,255,.08)` bajo el velo del propio panel | nuevo `--glass-tint` |
| Panel de cristal normal | `linear-gradient(rgba(5,6,8,.55), rgba(5,6,8,.55)), rgba(255,255,255,.08)` | `--glass` pasa a ser este fondo |
| Panel de cristal denso (lectura, inspector) | igual con `rgba(8,9,12,.72)` | nuevo `--glass-dense` |
| Borde de cristal | `1px solid rgba(255,255,255,.2)`; separadores `rgba(255,255,255,.14)` | `--glass-border`, `--border` |
| Brillo interior | `inset 0 1px 0 rgba(255,255,255,.35)` | nuevo `--glass-highlight` |
| Sombra de pieza flotante | `0 14px 40px rgba(0,0,0,.5)`; ventana/hoja `0 40px 90px rgba(0,0,0,.6)` | `--shadow-md`, `--shadow-lg`, `--shadow-sheet` |
| Texto | `#FFFFFF` | `--foreground` |
| Secundario | `#B8C0CC` | `--muted-foreground` |
| Acento (acción, selección, paso activo) | `#5AA9FF`; texto sobre acento `#06121F` | `--primary`, `--primary-foreground` |
| Cifras | `#5AA9FF` en oscuro | `--data` |
| Lesión y destructivo | `#FF5A6A`; texto de error `#FF8A96` | `--destructive`, nuevo `--destructive-text` |
| Hecho | `#3DDC97` | `--success` |
| Atención (sin guardar, parado, saco pequeño) | `#FFC247` | `--warning` |

Desenfoque: `blur(30px) saturate(130%)` (`--glass-blur: 30px`), con `-webkit-backdrop-filter`. Reglas: el rojo nunca es acción; el azul nunca es estado clínico.

**Tema claro** (decisión del diseñador, §8.1): se conserva como variante utilitaria para salas iluminadas. Sin imagen de fondo (lienzo `#F3F5F8`), cristal esmerilado blanco `rgba(255,255,255,.72)` con borde `rgba(0,0,0,.08)`, texto `#0B0C0F`, secundario `#4A5361`, acento `#0A66FF`, estados oscuros sobre fondos pálidos como hoy. El visor sigue negro. Los dos bloques de `colors.css` siguen definiendo exactamente los mismos nombres (lo vigila `tokens.test.ts`).

### 4.2 Tipografía

Inter (interfaz) y JetBrains Mono (cifras, identificadores como `cand-001` o `ZENODO-002`, rótulos de sección en mayúsculas, textos del visor), **autoalojadas** como fuentes variables woff2 (SIL OFL) en `src/assets/fonts/`, sustituyendo a Geist. Escala: display 40/40 peso 600 (`letter-spacing -.035em`); título de ventana 26; subtítulo 17; título de panel 20; cuerpo de lectura 15/23; cuerpo de interfaz 14; secundario 13; rótulo de sección 11 px mono, mayúsculas, `letter-spacing .14em`, en `--muted-foreground`. Cifras clínicas con `tabular-nums`. Etiqueta de campo 13 px peso 500, sin mayúsculas (como hoy).

### 4.3 Formas y controles

- Radios: ventanas, paneles, hojas e inspector 24 px; tarjetas internas 16 px; campos 14 px; botones, chips y pastillas 999 px.
- Botones (pastilla): primario `--primary` relleno, texto `--primary-foreground`, peso 600, brillo interior; secundario borde `rgba(255,255,255,.3)` sobre `rgba(255,255,255,.08)`; terciario solo texto en `--data`; destructivo borde y texto `--destructive` sobre `rgba(255,90,106,.12)`; deshabilitado al 40 %. Alturas S 32, M 44, L 54 (hoy 34/38/44: se mapean `--control-sm/md/lg` a 32/44/54 y se revisa que las barras usen S). Botón de icono redondo 34–40 px sobre `rgba(255,255,255,.1)` con `aria-label`.
- Campos: 48 px de alto, fondo `rgba(5,6,8,.5)`, borde `rgba(255,255,255,.24)`; foco borde `--primary` + anillo `0 0 0 3px rgba(90,169,255,.28)`; error borde `--destructive` + anillo `rgba(255,90,106,.22)` + mensaje en `--destructive-text` con icono; deshabilitado al 40 %. Select con chevron propio.
- Chips e insignias: pastilla con borde del color al 60 % y texto del color (riesgo Alto/Moderado/Bajo, canal calibre/cociente/curvatura, «saco pequeño» en atención, «Elegido» en hecho).
- Balizas del visor (las de `vtk/candidateOverlay.ts`): elegida 44 px `--destructive` con halo doble; resto 36 px sobre `rgba(11,12,15,.85)` con borde blanco de 2 px; número en mono. Se cambia solo su estilo DOM.
- Tarjeta de paciente (la del panel de tarjetas del remoto): cristal sobre la imagen, miniatura arriba, radio 20.
- Lente: al pasar el puntero, los controles de cristal crecen a `scale(1.06)` y aclaran su fondo a `rgba(255,255,255,.14)` en 240 ms; las tarjetas grandes `scale(1.02)`.

### 4.4 Entorno

Componente nuevo `Entorno`: imagen de fondo a pantalla completa (`object-fit: cover`) + velo, detrás de todo lo de la oficina, Entrar y la ficha. Imagen: el corte axial de TC del caso 036 (`corte-036.webp` de la carpeta de referencia, o un fotograma de `frontend/public/media/landing/hero/` si se prefiere el mismo de la landing) servido desde `frontend/public/media/entorno/`. Con `prefers-reduced-transparency: reduce` o en tema claro, no hay imagen: lienzo liso. No se anima.

### 4.5 Movimiento

Se mantienen los tokens actuales: `--dur-1 120ms` (respuesta, lente, pulsación), `--dur-2 240ms` (cambio de estado), `--dur-3 480ms` (entrada de ventana u hoja), `--dur-4 900ms` (solo landing), curva `cubic-bezier(.16,1,.3,1)`. Entrada de ventana/panel/hoja desde `scale(.96) translateY(14px)` + opacidad (nuevo preset `glide` en `src/motion`). Se anima: lente, ampliación del dock según la distancia al puntero, entrada de ventanas y hojas, desenfoque de la paleta ⌘K al abrir. No se anima: el visor, las tablas, el texto de lectura. Movimiento reducido: solo opacidad, sin escala ni desenfoque animado.

## 5. Distribución por zona (decidida: la mezcla recomendada)

### 5.1 Oficina — L1 (Pacientes, Estudios, Pedidos de clips, Talleres, Usuarios, Cuentas pendientes, Auditoría)

Tablero de referencia: `L1-Pacientes.dc.html`, `L1-Esquema.dc.html`.

- **Barra lateral de cristal** (`shell/SideNav.tsx`): 240 px fijada, plegable a 64 px (solo iconos con tooltip), con el comportamiento actual (chincheta, Alt+B, hover, barra activa que se desliza) y su prueba. Marca arriba, secciones de `sections.ts`, grupo Administración, usuario y «Cerrar sesión» al pie.
- **Barra superior** (`shell/TopBar.tsx`) de 56 px, cristal, a lo ancho del contenido: migas, subtítulo, estado, acciones, botón ⌘K, avatar. La misma pieza que hoy, con el material nuevo.
- **Contenido** sobre el `Entorno`, en paneles de cristal. Las tablas densas (Usuarios, Auditoría, Pedidos, Cuentas pendientes) van dentro de un panel de cristal denso; sus filas no llevan desenfoque propio.
- **Pacientes**: avisos clínicos (los tres de `lib/avisosOficina.ts`) como franja de chips bajo la cabecera; tarjetas del remoto en rejilla en el centro (3 columnas a 1440, las que quepan por debajo); el panel lateral del remoto (`PatientsSidePanel`: Hoy, Actividad reciente) pasa a ser el **inspector derecho** de 380 px de la oficina, con el mismo material que el del quirófano. Acciones «Nuevo paciente», «Nuevo caso», «Prueba rápida sin paciente» en la cabecera, en ese orden y con ese peso (primario, secundario, terciario).
- **Estudios**: tarjetas con miniatura de cristal; tarjeta punteada «Subir un estudio nuevo».
- Toasts: abajo a la derecha, cristal, con icono de estado.

### 5.2 Ficha del paciente — L3 (cascada de columnas)

Tablero de referencia: `L3-Pacientes.dc.html` (tomar solo la parte de columnas a partir del paciente) y `L3-Formulario.dc.html` (como referencia de densidad, no de dónde se abre el formulario).

- La ficha deja de ser una hoja lateral (`pages/PatientSheet.tsx`, 460/620 px) y pasa a ocupar el área de contenido de la oficina (con la barra lateral y la superior) como **cascada de columnas de cristal**: **Datos** del paciente (cabecera con nombre, HC en mono, sexo y edad, antecedentes resumidos, «Editar datos», «Nuevo caso», «Borrar paciente» al pie como hoy) › **Casos** › **Estudios de imagen** del caso elegido › **Sesiones** del estudio › **Vista previa** (miniatura o última captura, resumen del paso, «Reanudar»). Seleccionar en una columna abre la siguiente; con el teclado ←/→ cambian de columna, ↑/↓ seleccionan, Enter abre.
- Entrada a la ficha: desde la tarjeta de paciente y desde las migas del pipeline (hoy `onOpenPatient`). Debe tener URL propia para que Atrás y recargar funcionen (§8.3).
- Editar los datos del paciente se hace en **hoja lateral** (§5.3), no en una columna.
- A ≤ 1280 px solo se ven las dos últimas columnas abiertas, con migas para volver.
- Todo lo que hoy hace `PatientSheet.tsx` (datos, edición, casos, estudios, sesiones, capturas, compartido con, pedidos del paciente, borrar) sigue existiendo; cambia la forma.
- **La columna Datos es también el índice de la ficha** (§8.8): resumen del paciente, «Compartido con» (lista y botón «Compartir») y tres entradas con contador: **Casos** (abre la cascada Casos › Estudios de imagen › Sesiones › Vista previa; es la entrada abierta por defecto), **Capturas** (abre la galería de todo el paciente ocupando el resto del ancho, como hoy: se busca «la foto del cuello» sin recordar la adquisición) y **Pedidos de clip** (lleva al registro de pedidos filtrado por el paciente, como hoy).
- **Sesiones por estudio** (§8.9): la API de sesiones del paciente añade el estudio de imagen y el caso de cada sesión. Las sesiones guardadas sin estudio de imagen aparecen en la columna Estudios como una entrada final «Sesiones sin estudio archivado».

### 5.3 Formularios — hoja lateral L1

Tablero de referencia: `L1-Formulario.dc.html`.

Nuevo paciente, Editar paciente, Nuevo caso, Nuevo usuario, Adjuntar a un caso, Cambiar contraseña, Compartir, talleres y pedidos (los que hoy son `Sheet`): hoja de cristal denso que entra por la derecha (560 px; las que hoy son de 460 se quedan en 460), radio 24 en el lado izquierdo, velo sobre lo de detrás, cabecera con título y cerrar, pie pegado abajo con el primario y «Cancelar», foco en el primer campo, Esc cierra (con el aviso de descartar cambios que ya existe). Los diálogos de confirmación (`ConfirmDialog`) son ventanas centradas de cristal denso de 420 px.

### 5.4 Quirófano — pipeline D

Tablero de referencia: `D-Pipeline.dc.html`; esquema de reglas de `L1-Esquema.dc.html` para el inspector.

- **Visor a pantalla entera**: la barra lateral de la oficina no existe en el pipeline. El contenedor del visor ocupa toda la ventana con fondo `--viewer-bg`.
- **Zona libre**: el área donde se dibujan las vistas VTK es la ventana **menos** la banda superior de pastillas (72 px), el inspector (su ancho + 24 px de margen a cada lado) y nada abajo (el dock flota encima, ver abajo). Las piezas de cristal grandes (inspector, pastillas superiores) se apoyan así sobre negro, no sobre el lienzo WebGL: se cumple el anti-objetivo y el desenfoque no se recalcula a cada fotograma. Cuando el inspector se pliega o se ensancha (380 ↔ 520 en Decisión e Informe), la zona libre cambia de ancho con una transición de 240 ms; el visor no se desplaza ni se reencuadra solo.
- **Pastillas superiores**: a la izquierda, migas (volver, Pacientes › paciente › caso; paciente y caso llevan a la ficha); a la derecha, estado de guardado (`SaveStatus`), «Captura», «Grabar», «Archivar en el caso»/«Adjuntar a un caso» cuando corresponda, «Guardar progreso» (primario), ⌘K y avatar. Son la `TopBar` actual en forma de dos pastillas.
- **Dock de pasos** (sustituye a `StepRail` y a la barra compacta `ws-steps-compact`): pastilla de cristal abajo a la izquierda con los 8 pasos como botones redondos (hecho = tick en `--success`, activo = relleno `--primary` con rótulo encima, pendiente = número, bloqueado = atenuado con el motivo de `missingFor` como tooltip), separador y botón ⌘K. Ampliación tipo macOS según la distancia al puntero (máx. 1,25; sin ampliación con movimiento reducido). Atajos 1–8. El dock es lo único que flota sobre el lienzo WebGL: usa cristal denso con desenfoque reducido (`12px`) y su área es pequeña. El riesgo del paso actual que hoy muestra el rail (`riskLabel`) y el paciente pasan a la pastilla de migas.
- **Inspector flotante** (`RightPanelColumn` con el material nuevo): a 24 px del borde derecho, de la banda superior y del borde inferior, 380 px (520 en Decisión e Informe), radio 24, cristal denso. Cabecera con rótulo mono «PASO 3 · DETECCIÓN», título y pestañas cuando el paso las tenga; cuerpo con el panel del paso actual; pie fijo (`PanelFooter`) con las acciones del paso. Se pliega con P y con su pestaña de borde, como hoy.
- **Pestaña «Registro» del inspector** (préstamo de L6, plegada por defecto): un desplegable al pie del inspector, junto a «Anotaciones», con la cronología de la sesión en mono, calculada en el cliente sin tocar la API: hora, paso y lo que pasó (DICOM cargado con n cortes; segmentación terminada con vértices y duración; detección con n candidatos y duración; candidato elegido; medida hecha; guardado). Las duraciones se miden en el cliente desde la petición hasta la respuesta. No persiste entre sesiones (§8.5).
- **Avisos del pipeline** (error al guardar, captura no guardada, resultado de la grabación, nota de adjuntar): hoy son bandas a lo ancho bajo la barra; pasan a toasts de cristal apilados arriba en el centro de la zona libre, con el mismo texto, el mismo rol (`alert`/`status`) y el mismo cierre al pulsar.
- **HUD del visor**: los textos DOM siguen en mono sobre `--hud-text`/`--hud-text-dim`; se recolocan si chocan con las pastillas o el dock. Los textos HUD en línea aún verdes (retícula, atajos, oblicua, escala, rótulos de Viewer) pasan a esos tokens en esta obra.

### 5.5 Pantallas estrechas — hoja inferior L5

Tablero de referencia: `L5-Deteccion.dc.html`, `L5-Esquema.dc.html`.

- **Pipeline a ≤ 1280 px**: el inspector se convierte en una hoja de cristal que sube desde abajo con tirador y tres alturas (asomar 96 px, media 50 % de la ventana, completa hasta la banda superior); la zona libre del visor pierde solo la altura de «asomar». Arrastrar el tirador, ↑/↓ o pulsarlo cambian la altura; Esc la baja a «asomar». A media o completa sí queda sobre el lienzo WebGL: ahí usa cristal denso con desenfoque reducido. El dock se compacta a números (sin ampliación) y sube por encima de la hoja.
- **Oficina a ≤ 1280 px**: barra lateral plegada a 64 px; el inspector de Pacientes baja debajo de la rejilla.
- **Por debajo de 820 px** se mantiene el comportamiento responsive actual adaptado (la barra lateral se oculta tras un botón; las hojas laterales ocupan el ancho).

### 5.6 Paleta de mandos ⌘K (global)

Componente nuevo: ventana de cristal centrada de 640 px que entra desenfocándose (480 ms; solo opacidad con movimiento reducido), con buscador y grupos: **Ir a** (secciones de `sections.ts` según el rol; en el pipeline también los 8 pasos), **Acciones** (Nuevo paciente, Nuevo caso, Prueba rápida sin paciente; en el pipeline Guardar progreso, Captura, plegar inspector), **Pacientes** (búsqueda por nombre o HC sobre la lista ya cargada; Enter abre la ficha) y **Recientes** (las sesiones que ya muestra «Actividad reciente»). Se abre con ⌘K / Ctrl+K y con el botón de la barra o del dock; flechas y Enter; Esc cierra. Es un atajo: todo lo que hace tiene otro camino visible.

### 5.7 Entrar, Crear cuenta y pantalla de carga

Tablero de referencia: `D-Entrar.dc.html`.

- Entrar y Crear cuenta: `intro.mp4` sin cambiar el fichero como panel de marca (con el velo actual `--media-vignette`), lema «Planificación neurovascular con datos» y «Del DICOM al clip, en un solo espacio de trabajo.»; formulario en una ventana de cristal denso a la derecha sobre el `Entorno` («Iniciar sesión», Usuario, Contraseña, «Entrar», «¿No tienes cuenta? Crear cuenta», aviso de que un administrador puede restablecer la contraseña). Se conservan los comportamientos actuales de error, comprobando y bloqueo, y los textos que prueban `Login.test.tsx` y `Signup.test.tsx`. `ForcePasswordChange` usa la misma ventana.
- Pantalla de carga (`LoadingScreen.tsx`): `loading.mp4` igual que hoy, con la marca, la barra y el texto en una pastilla de cristal; al terminar, la ventana de la oficina entra con `glide`.

### 5.8 Landing

Tablero de referencia: `D-Landing.dc.html`. Secciones y copia de ese tablero, en orden: nav en pastilla de cristal (Qué es, Cómo funciona, Índices, Dispositivos, Entrar) → hero → «Qué es» → «Cómo funciona» (8 pasos) → «Funcionalidades» (lista con reglas) → «Índices morfométricos» (los ocho, con los umbrales importados de `morphometry/thresholds` como hoy) → «Dispositivos NAVARRO™» (T1 recta, T2 curva, T3 angulada, T4 fenestrada; fabricados bajo pedido en taller) → «Próximamente» (SkullCloud, AR/VR, Analítica) → contacto → pie con el aviso «Herramienta de apoyo a la decisión clínica. No sustituye el criterio del cirujano.».

- **Hero**: fondo = la secuencia de cortes reales del 036 atada al scroll que ya se generó para el plan anterior (60 WebP en `frontend/public/media/landing/hero/`, `hero-3d.webp`, `hero.json`; script en `backend/scripts/landing_hero_assets.py`; no regenerar), cruzando al render 3D (`hero-3d.webp`) en el corte del aneurisma; encima, una ventana de cristal «Detección · 5 candidatos» con las balizas 1–5 y la lesión (≈9,8 mm), y el titular y los botones visibles desde el primer fotograma. Con movimiento reducido, el fotograma final estático.
- Se retiran las diez escenas three.js, el shader y la dependencia `three` si nada más la usa.
- Debe funcionar a 390 px (una columna, nav plegada) y sin GPU dedicada (nada de WebGL).
- Los textos que prueban `Landing.test.tsx` se mantienen o se actualizan con su test en la misma tarea.

## 6. Decisiones del dueño, tal como se tomaron

1. «Me gusta mucho la D» (Quirófano de cristal), entre ocho direcciones de cristal.
2. Conservar los vídeos del login y de la carga; «lo demás es susceptible a cambios».
3. «Los elementos de three.js en la landing page también son prescindibles».
4. Pidió la mezcla de distribuciones que se le recomendó: oficina L1, ficha L3, pipeline D, formularios en hoja lateral L1, hoja inferior L5 en pantallas estrechas, ⌘K global, registro de L6 solo como pestaña del inspector; sin L2, sin L4, sin L5 ni L6 como base.
5. Orden de trabajo del rediseño anterior, que se mantiene: fases de corrido con subagentes, fusión local en `main` al terminar cada una, sin push, dudas al final.

## 7. Lo que decide el constructor

- Cómo se implementa la zona libre del visor (relleno del contenedor de las vistas, `renderer.setViewport`, o el que encaje con `ViewerWorkspace` y las disposiciones de varias vistas), siempre que se cumpla §5.4.
- Cómo se obtienen las fuentes (paquetes `@fontsource-variable/inter` y `@fontsource-variable/jetbrains-mono` copiando los woff2 al repo, u otro origen con licencia OFL), siempre autoalojadas.
- Nombres y ficheros de los componentes nuevos (`Entorno`, `StepDock`, `CommandPalette`, `BottomSheet`, `SessionLog`…), reparto en tareas y qué tests se actualizan.
- Ruta de la ficha (`/app/pacientes/:id` u otra) y cómo convive con `screenFromPath`.
- Breakpoints exactos fuera de los fijados (1280 y 820).

## 8. Llamadas del diseñador

1. **Tema claro**: se conserva como variante sin imagen de fondo (§4.1). Quitarlo rompería a quien ya lo usa y `ThemeToggle` tiene tests.
2. **Fuentes**: Inter + JetBrains Mono como en el tablero D, autoalojadas; Geist se retira.
3. **Ficha con URL propia**: Atrás desde el pipeline debe volver a la ficha y una recarga no debe perderla.
4. **Inspector de la oficina = mismo componente visual que el del quirófano**, para que la oficina y el quirófano se lean como el mismo producto.
5. **Registro solo en memoria**: persistirlo pediría API; queda para más adelante si el dueño lo pide.
6. **Lo del documento anterior que sigue vigente**: §8.4 (HUD: actores y colores por plano intactos), §8.5 (avisos calculados en el cliente), §8.6 (dial como actor aditivo), §8.7 (Informe con el PDF del backend), §8.10 (calculadoras en Morfometría), y la revisión por paso del Anexo A, ya aplicada en la fase 3.
7. **Planes de las fases 4–6 del documento anterior** (`2026-10-31-rediseno-fase4-entrada.md`, `…fase5-landing.md`, `…fase6-pulido.md`): quedan sustituidos por los de este documento y se marcan como tales; el worktree `rediseno-fase4` (vacío, sin commits propios) se borra.
8. **Índice de la ficha en la columna Datos** (pregunta del revisor): la galería de capturas sigue siendo de todo el paciente, como decidió F1; «Compartido con» vive en la columna Datos; los pedidos se alcanzan desde ella. Así ninguna función de la ficha actual se pierde ni cambia de alcance.
9. **Cambio aditivo en la API** (pregunta del revisor): `PatientSessionInfo` (`backend/models/patient.py`, `routers/patients.py`) devuelve `imaging_study_id` y `case_id` de cada sesión, que la base de datos ya guarda (`planning_sessions.imaging_study_id`); con test del backend y regenerando openapi y tipos. Sin migración. Es la única excepción a «no cambia la API». El estado «sin guardar desde la última captura» del tablero L3 no se implementa (no hay dato). Si mientras tanto corre una pasada del backend que importa estos módulos, el cambio se hace en el worktree y la pasada no se toca.
10. **Assets del hero en el repositorio desde el principio** (aviso del revisor): los 60 WebP, `hero-3d.webp`, `hero.json` y el script `landing_hero_assets.py` vivían solo en una carpeta temporal; se copian ya con este documento a `frontend/public/media/landing/` y `backend/scripts/landing_hero_assets.py`.

## 9. Fases

Cada fase: plan con `superpowers:writing-plans`, worktree propio desde `main`, ejecución con subagentes y revisión, suite verde, fusión local en `main`, sin push.

1. **Material**: tokens D (color, cristal, radios, alturas, sombras), fuentes Inter y JetBrains Mono, preset `glide` y lente, `Entorno`, y los componentes base (Button, Badge, Input, Select, Tabs, Sheet, ConfirmDialog, Collapsible, toasts) con el material nuevo; tema claro ajustado.
2. **Oficina L1 + ⌘K**: barra lateral y barra superior de cristal sobre el `Entorno`, Pacientes con avisos en franja, tarjetas e inspector derecho, Estudios, Pedidos, Talleres, Usuarios, Cuentas pendientes, Auditoría, hojas laterales, paleta ⌘K global.
3. **Ficha L3**: campo aditivo de la API (§8.9), la ficha como cascada de columnas con URL propia y su índice (§8.8); edición en hoja lateral.
4. **Quirófano D**: visor a pantalla entera con zona libre, pastillas superiores, dock de pasos, inspector flotante, avisos como toasts, Registro, HUD; hoja inferior L5 a ≤ 1280.
5. **Entrada**: Entrar, Crear cuenta, cambio de contraseña obligatorio y pantalla de carga.
6. **Landing**: assets del hero en el repo, hero atado al scroll, secciones del tablero D, retirada de three.js.
7. **Pulido**: contraste 4,5:1 sobre el peor fondo, foco visible, `prefers-reduced-motion` y `prefers-reduced-transparency`, rendimiento del desenfoque en portátil sin GPU, coma decimal unificada en las cifras del panel, tests y documentación.
