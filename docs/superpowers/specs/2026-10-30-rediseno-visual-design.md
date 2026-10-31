# Rediseño visual de Prospective Web — documento de diseño

Fecha: 30 de octubre de 2026. Estado: aprobado en conversación por el dueño del producto (dirección «A + H + F + D»). Lienzo de referencia con todas las pantallas: https://claude.ai/artifact/SsoRuibugGf6h9mtUWHCF5 (privado; pedir acceso al dueño).

## 1. Intención y por qué

Prospective se enseña a un jefe de servicio, a neurocirujanos y, en demos, a comités. El dueño quiere que luzca «top a nivel de efectos y atractividad» en la **entrada** (landing, entrar, pantalla de carga) y que la **herramienta** (panel de pacientes, gestión, pipeline de 8 pasos) sea **sobria pero viva**: botones, hojas laterales, pestañas, rail de pasos y paneles con movimiento que responde a lo que hace el usuario.

Lo que hay hoy ya es oscuro y serio. Le falta coreografía (nada responde al usuario), jerarquía (cuatro métricas iguales, tarjetas iguales, botones repetidos) y coherencia (el visor habla en HUD verde terminal mientras la app habla en grafito y azul; hay dos barras superiores distintas).

## 2. Objetivos, no objetivos, anti-objetivos

**Objetivos**
- Una sola identidad de arriba abajo: la landing, el login, la oficina y el quirófano se reconocen como el mismo producto.
- Entrada espectacular con pruebas reales: el DICOM del paciente y el modelo 3D real son la imagen de marca, no ilustraciones.
- Herramienta sobria con una capa de movimiento consistente (tokens de tiempo y una sola curva) en todos los controles.
- Conservar los dos vídeos: `public/media/intro.mp4` en Entrar y Crear cuenta, `public/media/loading.mp4` en la pantalla de carga.
- Respetar `prefers-reduced-motion` en todo.
- Mantener el tema claro existente, afinado, para salas iluminadas.

**No objetivos**
- No cambia el flujo funcional (8 pasos, pacientes → casos → estudios → sesiones), ni los textos clínicos, ni la API, ni el backend.
- No se introduce Tailwind ni una librería de componentes: se sigue con CSS plano + custom properties + estilos inline en React, que es lo que hay.
- No se rediseña el visor VTK por dentro (cámara, planos, herramientas); solo su HUD y los controles alrededor.

**Anti-objetivos (fracaso aunque funcione)**
- Que un médico lea la herramienta como «juguete»: cristal por todas partes, degradados decorativos, partículas, contadores que suben.
- Que la landing parezca una plantilla SaaS: tarjetas iguales con icono, «eyebrows» sobre los títulos, números de sección decorativos.
- Que el pipeline se mueva mientras el cirujano trabaja: el visor no se desplaza nunca al cambiar de paso.
- Depender de GPU en portátiles de hospital: nada de WebGL continuo en la landing.

## 3. Restricciones

- Stack: React 19 + Vite 7, CSS plano con tokens en `frontend/src/styles/tokens/*.css`, estilos inline, `@kitware/vtk.js`, iconos SVG propios en `components/Icon.tsx`, Geist y Geist Mono autoalojadas. Sin framer-motion ni GSAP hoy.
- Portátil de desarrollo de 16 GB; la app se usa en portátiles de hospital sin GPU dedicada.
- Datos de paciente en el repositorio público: ningún asset nuevo puede contener datos identificables. Los renders y cortes de la landing salen del caso Zenodo 036 (dataset público CC-BY, anonimizado).
- Tests existentes del frontend (vitest, ~305 en planning) deben seguir verdes; los textos que ya prueban los tests no cambian salvo que se actualicen a la vez.
- Commits por lista explícita de ficheros, nunca `git add -A`.

## 4. La dirección visual decidida: «Obsidiana clínica» con tres préstamos

Base: la dirección A del lienzo. Préstamos: el hero de H (cortes DICOM reales atados al scroll), el dial de medida de F y el encendido de marcadores de D.

### 4.1 Color (tema oscuro, por defecto)

| Token | Valor | Uso |
|---|---|---|
| `--canvas` | `#07080B` (landing) / `#0B0C0F` (app) | fondo |
| `--surface` | `#141519` | tarjetas y paneles |
| `--surface-2` | `#0E1014` | rails y barras laterales |
| `--foreground` | `#F2F3F5` | texto |
| `--muted` | `#B3BAC5` cuerpo secundario, `#9AA3AF` pies, `#8A93A0` rótulos | |
| `--primary` | `#3B8BFF` | acción, selección, paso activo |
| `--data` | `#8CBBFF` | cifras, dial, enlaces en oscuro |
| `--lesion` | `#FF4D5E` | solo la lesión / el ápice y lo destructivo |
| `--done` | `#2ECC8A` | pasos completados, canal que vio la lesión |
| `--warn` | `#F5B942` | ramas cercanas, pedidos parados, cambios sin guardar |
| borde | `rgba(255,255,255,0.08)` | separación |

Tema claro (afinado con B): lienzo `#F6F7F9`, superficie `#FFFFFF`, texto `#0B0C0F`, grises azulados (`#3C4450`, `#5B6470`), primario `#0A66FF`, seleccionado `#EEF4FF`, estados oscuros sobre fondos pálidos (`#15803D`/`#DCFCE7`, `#B91C1C`/`#FEE2E2`). El visor sigue negro en ambos temas.

Reglas: el rojo nunca es acción. El HUD verde del visor (`vtk/hud/hud.css`) desaparece: los textos del visor usan Geist Mono en `--muted` y `--data`.

### 4.2 Tipografía

Geist (ya autoalojada) en todo; Geist Mono solo para cifras, códigos (historia clínica) y rótulos del visor. Escala: hero 76 px / tracking −0,035 em / peso 600; títulos de sección de landing 40–44 px; títulos de pantalla 28 px (landing) y 18 px en paneles; cuerpo 14 px; pies 12–13 px. Las etiquetas de campo pasan de mayúsculas espaciadas a 13 px en `--muted`, sin mayúsculas. Cifras clínicas con `font-variant-numeric: tabular-nums`.

### 4.3 Superficies y controles

- Radios: 11 px controles, 12 px tarjetas y hojas, 28 px solo la tarjeta hero del 3D. Píldoras (999 px) para la nav flotante y los chips.
- Sombras con desplazamiento real: botón primario `0 8px 24px rgba(59,139,255,.30)`; tarjeta 3D `0 40px 90px rgba(0,0,0,.60)`; hoja lateral `-30px 0 80px rgba(0,0,0,.50)`. Nada de halos sin desplazamiento salvo el anillo del marcador seleccionado.
- Cristal (`backdrop-filter: blur(18px)` sobre `rgba(20,21,25,.72)`) solo en lo que flota: nav de la landing, tooltips del visor, cabeceras de barra superior.
- Botones: primario azul relleno; secundario borde `rgba(255,255,255,.14)` sobre `rgba(255,255,255,.03)`; terciario texto en `--data`. Altura 44–48 px en acciones principales, 34–38 px en barras. Los botones de fila de tabla (Reanudar, Ficha) se atenúan a `opacity .6` hasta que la fila tiene el ratón; el primario solo en la fila de la sesión más reciente.
- Insignias de canal: píldora 11 px con fondo `rgba(46,204,138,.16)` / texto `#5EE2A6`; «saco pequeño» en gris.
- Iconos: `components/Icon.tsx`, trazo 1,5, 16 px; en tablas de administración cada acción lleva palabra, no solo icono. Borrar en rojo apagado con borde.

### 4.4 Estructura de pantallas

- **Barra superior única** (56 px) para oficina y pipeline: logo + nombre, migas, espacio, estado de guardado (punto de color + texto), acciones, avatar. Sustituye a `components/Topbar.tsx` (66 px, logo PNG) y a `components/shell/TopBar.tsx`.
- **Barra lateral de la oficina** (`shell/SideNav.tsx`): fijada a 220 px por defecto, iconos + texto, barra de 2 px en la sección activa que se desliza entre elementos; «Cuentas pendientes» muestra contador.
- **Pacientes**: arriba, tres avisos clínicos (riesgo alto sin informe, pedidos parados, sesiones de hoy) en lugar de cuatro métricas; tabla con anchos fijos, ellipsis y acciones de fila. «Empezar sin paciente» pasa a llamarse «Prueba rápida sin paciente» y deja de ser la primera acción.
- **Hojas laterales** (nuevo paciente, nuevo usuario, ficha): 460 px (ficha 620 px, dos columnas: datos / casos, sesiones y actividad); el primer campo recibe el foco; pie fijo con el primario y Cancelar; al crear, la fila nueva se ilumina 1,2 s.
- **Estudios**: tarjetas con miniatura DICOM real, elevación al pasar el ratón, zoom 3 % de la miniatura, tarjeta punteada «Subir un estudio nuevo».
- **Pipeline**: rail de 232 px con línea de progreso vertical que crece al completar pasos; visor central negro; panel del paso de 380 px con cabecera, contenido y pie fijo con la acción de continuar. El panel cruza en fundido con 8 px de desplazamiento al cambiar de paso; el visor no se mueve.
- **Segmentación**: la espera es información: lista de fases con nombre y lo que cada una hizo, baldosas de la banda nativa que aparecen en el visor, barra real y tiempo estimado.
- **Detección**: lista de candidatos con insignias; el elegido con borde azul; al terminar la detección los marcadores se encienden en secuencia (barrido, ~1 s, una vez).
- **Morfometría**: el dial de medida (círculo con marcas cada 2 mm en `--data`) se dibuja alrededor del saco al soltar el ápice (800 ms); las cifras ruedan hasta su valor una vez (odómetro, 600 ms) y luego quedan quietas.
- **Decisión**: el visor se encoge a una tarjeta y entran dos columnas: riesgo (PHASES, ELAPSS, UIATS con el origen de cada punto, factores editables) y geometría (cuello, relación, ramas); a la derecha la vía (clip / endovascular / observación) con motivo que va al informe.
- **Dispositivos**: catálogo filtrado por el cuello medido, chips por familia, clip colocado con oclusión medida (muñón, resto de cuello, residual) y aviso de rama a X mm de la mordaza.
- **Informe**: hoja blanca A4 centrada con el contenido real, casillas de qué incluir, comentario, firmar y descargar.

### 4.5 Landing

Secciones, en orden: hero → fotograma final del hero (el 3D medido con el dial) → Qué es → Cómo funciona (escena fija de 8 pasos) → Funcionalidades (lista con reglas, no tarjetas) → Tecnología y Seguridad → Contacto/CTA → pie. Se eliminan las diez escenas three.js y el shader.

- **Hero (el préstamo de H)**: fondo = corte axial real del caso 036 (secuencia de ~60 imágenes WebP recortadas y anonimizadas, de la base del cráneo al vértice), con rótulo de ventana `W 600 · L 60 · corte n/594`. Al hacer scroll, la secuencia avanza (scroll-linked) hasta el corte del aneurisma; ahí la imagen cruza al render 3D y el dial se dibuja con sus cifras. El titular es visible desde el primer fotograma; nada espera a una animación. Con `prefers-reduced-motion`, el fondo es el fotograma final estático.
- **Cómo funciona**: ventana fija (sticky) con un vídeo real del visor por paso, grabado con la función Grabar de la app; el índice de pasos a la izquierda marca el activo.
- Nav: píldora flotante de cristal, se encoge un 10 % al bajar.
- Cursor: parallax máximo 12 px en el fondo del hero; botones primarios magnéticos (4 px).

### 4.6 Entrar y pantalla de carga

- Entrar: panel de vídeo `intro.mp4` (sin cambios de fichero) con fundido desde negro de 600 ms, viñeteado que se abre y el lema componiéndose palabra a palabra (60 ms de escalonado); formulario de una columna, etiquetas en 13 px, campo enfocado con borde `--primary` y anillo `rgba(59,139,255,.18)`. Error: sacudida de 8 px acortada a 380 ms y mensaje bajo el campo. El botón pasa a «comprobando» con barra interna.
- Pantalla de carga: `loading.mp4` precargado durante Entrar; logo, marca, barra (real si hay progreso), texto de qué se prepara; al terminar, desvelado hacia el panel desde el centro (clip-path circular, 480 ms).

### 4.7 Movimiento (sistema)

Tokens: `--dur-1: 120ms` (respuesta), `--dur-2: 240ms` (cambio de estado), `--dur-3: 480ms` (entrada de panel u hoja), `--dur-4: 900ms` (solo landing). Curva única `cubic-bezier(0.16, 1, 0.3, 1)`. Reglas: una entrada autorizada por pantalla, nunca la misma aparición en cada sección; scroll-linked antes que scroll-triggered; FLIP para reordenar listas y tablas; `@media (prefers-reduced-motion: reduce)` desactiva todo salvo opacidad.

Herramientas: **Motion** (`motion`, antes Framer Motion) para entradas, FLIP y gestos en React; **GSAP ScrollTrigger** solo en la landing para lo atado al scroll (secuencia de cortes, escena fija); **View Transitions API** para Estudios → visor, con degradación a fundido donde no exista.

## 5. Decisiones del dueño, tal como se tomaron

1. Mezcla: «espectacular en la entrada, sobrio en el pipeline pero conservando cierto dinamismo en botones, slides y opciones».
2. Sin referentes previos; aceptó los propuestos (Linear, Raycast, Vercel, Medivis, Brainlab, Surgical Theater, Intuitive).
3. Conservar los vídeos de Entrar y de la pantalla de carga.
4. Autorizó sustituir las escenas three.js «por elementos o componentes más atractivos».
5. De ocho direcciones, eligió la recomendada: A de base con el hero de H, el dial de F y el encendido de D.

## 6. Lo que decide el constructor

- Cómo generar los ~60 cortes del hero (script con SimpleITK desde el DICOM de Zenodo 036, ventana 600/60, recorte y WebP) y los vídeos del visor por paso; dónde guardarlos (`frontend/public/media/landing/`).
- Si Motion se aplica como componente envolvente o como hooks; cómo convivir con los estilos inline existentes (se acepta `style` dinámico).
- Orden exacto de migración de componentes dentro de cada fase y qué tests se actualizan.
- Breakpoints: la landing debe funcionar a 390 px (una columna, nav plegada); la app mantiene su responsive actual (rail compacto < 1024, píldoras < 820).

## 7. Fases propuestas

1. **Tokens y movimiento** (sin cambiar pantallas): colores, radios, sombras, duraciones y curva en `styles/tokens`; utilidades de movimiento; `Button`, `Badge`, `Input`, `Tabs`, `Sheet` nuevos.
2. **Shell de la oficina**: barra superior única, barra lateral fijada, Pacientes (avisos + tabla), hojas laterales, Estudios, Usuarios y resto de administración.
3. **Pipeline**: rail con progreso, panel con transición, HUD del visor, Segmentación con fases, Detección con encendido, Morfometría con dial, Decisión, Dispositivos, Informe.
4. **Entrada**: Entrar y pantalla de carga.
5. **Landing**: assets (cortes, vídeos), hero scroll-linked, escena fija, secciones, retirada de three.js.
6. Pulido, accesibilidad (contraste 4,5:1, foco visible, `reduced-motion`), rendimiento (CPU al 60 % en portátil sin GPU durante el hero) y actualización de tests.

Orden alternativo si el dueño quiere enseñar algo pronto: 1 → 5 → 4 → 2 → 3.

Fase 1 completada el 2026-10-31: tokens, movimiento y componentes base (Button, Badge, Input, Select, Tabs, Sheet); ver plan `docs/superpowers/plans/2026-10-30-rediseno-fase1-tokens-movimiento.md`.

Fase 2 completada el 2026-10-31: shell de la oficina (barra lateral fijada con barra deslizante, barra superior de 56 px con subtítulo y avatar-menú, Pacientes con avisos clínicos, hojas con pie fijo y ficha de 620 px, Estudios con tarjetas, Usuarios y administración con la cabecera única); ver plan `docs/superpowers/plans/2026-10-31-rediseno-fase2-shell-oficina.md`.

## 8. Decisiones tras la revisión del constructor (30-10, noche)

Un revisor independiente leyó este documento como si tuviera que construirlo sin preguntar. De sus once dudas, diez se resuelven aquí como decisiones del diseñador (marcadas «mi decisión»); la primera la decide el dueño.

1. **Orden de fases y cambios sin commit** — *la decide el dueño*. Hay cambios del 30-10 sin commitear en `Patients.tsx`, `DetectPanel.tsx`, `detectCopy.ts` y tests, que las fases 2 y 3 reescriben. Propuesta: commitearlos antes de empezar (por lista), y seguir el orden 1 → 2 → 3 → 4 → 5 → 6 salvo que haya una demo cercana.
2. **El visor no se mueve, nunca** — mi decisión: manda el anti-objetivo. En los ocho pasos la disposición es rail · visor · panel. En Decisión e Informe el panel derecho se ensancha de 380 a 520 px (transición de 240 ms, el visor cede anchura pero no cambia de sitio) y el contenido de dos columnas o la vista previa del informe cabe dentro. Nada de modos de layout por paso.
3. **Barra superior única** — mi decisión: 56 px; izquierda logo + migas (Pacientes / paciente / paso); centro vacío; derecha estado de guardado (punto + «Guardado hace 2 min» / «Cambios sin guardar» / «Sin guardar»), Captura, Grabar, Archivar o Adjuntar a un caso, Guardar progreso (primario), conmutador de tema, avatar. El avatar abre un menú (cuenta, cambiar contraseña, cerrar sesión), pero «Cerrar sesión» sigue visible en el pie de la barra lateral de la oficina y en el menú del avatar del pipeline, porque F2 ya comprobó que escondido no se encontraba. «◧ Panel» deja la barra: el panel se pliega con la tecla P y con una pestaña en su borde.
4. **El HUD verde** — mi decisión: solo los textos DOM del visor (rótulos de orientación, cotas de ventana, títulos de vista, leyendas) pasan a Geist Mono en `--muted-foreground` y `--data`. Los actores 3D (punto compartido `HUD_HEX`, paleta reservada, colores por plano axial/coronal/sagital/libre) no se tocan: identifican cada corte y tienen tests. El token `--hud` se conserva para los actores y deja de usarse en texto.
5. **Avisos clínicos de Pacientes sin tocar la API** — mi decisión: tres avisos calculables en el cliente con lo que ya devuelve la lista de pacientes y la lista de pedidos: «casos parados antes del informe más de 7 días» (último paso ≠ informe y fecha de última sesión), «pedidos de clip parados» (estado y fecha de la lista de pedidos), «sesiones de hoy». El aviso de «riesgo alto sin informe» del lienzo se descarta hasta que el endpoint de lista traiga la banda de riesgo.
6. **Encendido de marcadores y dial** — mi decisión: se autorizan como trabajo *aditivo* dentro del visor, y §2 se matiza: no se cambian cámara, planos ni herramientas, pero sí se añaden actores. Encendido: un actor pequeño por candidato (esfera de 2 mm en `--primary`, los no seleccionados al 40 %) que aparece en secuencia al terminar la detección, una vez; hoy solo se resalta el seleccionado. Dial: actor de polilínea (circunferencia con marcas cada 2 mm en el plano de la cámara) centrado en el saco al soltar el ápice; si el coste resulta alto en la fase 3, se sustituye por un dial 2D en el panel y se anota.
7. **Informe** — mi decisión: el centro del panel ensanchado muestra el PDF real del backend (`pdf_url`) embebido con `<object>`, con las casillas de qué incluir regenerándolo; no se compone HTML en el cliente. «Firmar» no es funcionalidad nueva: es el campo «Cirujano responsable» obligatorio antes de regenerar, como hoy. El lienzo se corrige en la fase 3.
8. **Secciones de la landing** — mi decisión: se conservan Índices morfométricos (con los umbrales importados de `morphometry/thresholds`), Dispositivos NAVARRO (series T1 recta, T2 curva, T3 angulada, T4 fenestrada, y el taller) y Próximamente, rediseñadas como listas con reglas y una figura cada una, sin tarjetas iguales. Los textos que prueban `Landing.test.tsx` se mantienen o se actualizan junto con el test en la misma tarea. `pipeline-hf.mp4` se retira cuando existan los vídeos por paso.
9. **Barra lateral** — mi decisión: solo cambia el valor por defecto a fijada (220 px); se conservan plegado, hover, Alt+B, chincheta y sus tests.
10. **Calculadoras de riesgo** — mi decisión: PHASES, ELAPSS y UIATS siguen editándose en Morfometría (pestañas). Decisión los muestra en tarjetas de solo lectura con «Cambiar en Morfometría», como hoy; sin duplicar estado.
11. **Nombres de tokens** — mi decisión: se conservan los nombres actuales (`--background`, `--card`, `--muted`, `--muted-foreground`, `--destructive`, `--success`, `--warning`, `--primary`) y se ajustan valores solo donde §4.1 lo pide; se añaden `--surface-2` (#0E1014), `--data` (#8CBBFF) y los tokens de movimiento. La tabla de §4.1 se lee así: lienzo → `--canvas`, superficie → `--card`, rails → `--surface-2`, cuerpo secundario → `--muted-foreground`, lesión → `--destructive` (se mantiene #FF5A5F), hecho → `--success`, aviso → `--warning`. `tokens.test.ts` se actualiza en la fase 1 con los valores finales.
12. **Oscuro: `--card` y `--muted-foreground` se quedan** — mi decisión (revisión final de la fase 1): en oscuro `--card` se queda en #1C1D22 porque `--background` ya es #141519 y, con un valor más próximo, tarjetas y paneles se fundirían; `--muted-foreground` se queda en #9AA3AF. El contraste del tema oscuro se revisa en la fase 6.

## Anexo A. Inventario del panel derecho por paso (sesión «Cerón, Cesar», 30-10) y revisión

Capturado en la aplicación real con una sesión XA de 384 cortes con los ocho pasos completos. Lo que se lista existe hoy y debe seguir existiendo; la revisión dice qué cambia de forma, no de función.

**1 · Carga DICOM.** Cabecera con insignia «Cargado»; zona de arrastre; Seleccionar archivos / carpeta; tarjeta «Serie del estudio» (modalidad, cortes, espaciado, descripción); tarjeta «Guardar en el archivo de estudios» con explicación y botón; «Continuar a segmentación»; desplegable «Anotaciones». *Revisión:* correcto y breve; la zona de arrastre debe responder al acercar la carpeta (borde `--primary` y contador de ficheros); la insignia de estado pasa al patrón punto + texto.

**2 · Segmentación.** Es el panel más largo (unas cinco pantallas): método (Tubular / Umbral clásico, tarjetas radio); «Recuperar pared y sacos» (deslizador 3 mm); umbral inferior (deslizador 1470, con nota del histograma), sin techo en tubular, suavizado (3); casillas «Solo la vasculatura principal» y «Segmentar a media resolución»; «Restablecer banda sugerida»; desplegable «Preprocesamiento (avanzado)»; tarjeta de resultado (vértices, caras, resolución Nativa, volumen conservado Limpio); «Herramientas de malla»: Borrador (Pieza suelta / Región pegada / Activar), Caja de recorte (Activar la caja), Recortar malla ROI (Elegir centro, radio, Conservar / Eliminar dentro, Recortar), Tijera (Marcar anillo, Limpiar, Ver qué se va, El otro lado); «Historial de la malla» (Deshacer / Rehacer / Al inicio); acciones Re-segmentar y «Continuar a detección»; «Descartar malla y volver a los umbrales». *Revisión:* demasiado para un solo scroll. Se reorganiza en tres bloques plegables con el estado en la cabecera de cada uno: **Receta** (método, umbral, suavizado, casillas; plegado una vez hay malla), **Resultado** (cifras y la lista de fases con lo que hizo cada una, visible mientras calcula), **Herramientas de malla** (borrador, caja, ROI, tijera e historial como pestañas de una sola tarjeta, no cinco tarjetas apiladas). El pie fijo del panel lleva «Continuar a detección» y Re-segmentar; «Descartar» pasa a terciario. Los textos explicativos largos se acortan a una línea con «Más».

**3 · Detección.** Cabecera con contador («1 encontrados»; corregir concordancia: «1 encontrado»); lista de candidatos con insignias de canal, grosor local y puesto; tarjeta «¿Cuál es la lesión?» (Confirmar, Marcar en la malla, No hay aneurisma, texto de ayuda, aviso de no archivado, cifra de aciertos); Re-detectar; «Analizar morfometría»; «Limpiar candidatos y morfometría». *Revisión:* la tarjeta de confirmación debe ir debajo de la lista y más compacta (una línea de ayuda, «Más» para el resto); las dos cifras de aciertos pasan a una línea en `--muted-foreground`; el encendido en secuencia al terminar; el candidato seleccionado con borde `--primary` y barra de puesto.

**4 · Morfometría.** Insignia «Riesgo morfométrico alto»; aviso ámbar cuando el saco llega al límite del recorte; tarjeta «Plano de cuello» (Cuello ✓, Ápice ✓ con coordenadas, Marcar borde del cuello, contador de puntos, Limpiar marcas, Medir saco cerrado, texto de ayuda); casilla «Mostrar anotaciones 3D»; selector de Localización (10 opciones); pestañas Métricas / Índices / PHASES / ELAPSS / UIATS / Seguimiento; tabla de métricas con insignias (provisional, Alto, Cuello estrecho) y notas; etiqueta de riesgo con su regla; «Continuar a decisión»; desplegables «Ramas cerca del cuello» y «Línea central del vaso» (Extraída); Anotaciones. *Revisión:* las coordenadas de cuello y ápice no las necesita el cirujano a la vista (van a un «Ver coordenadas»); la tabla de métricas con cifras en mono tabular y unidad en gris; las insignias «provisional» se unifican con el patrón de insignia gris; el aviso ámbar conserva el color pero pierde el icono triangular grande. El dial aparece en el visor al medir.

**5 · Decisión.** Localización y «Cambiar en Morfometría»; Estado (No roto / Roto) en selector; contexto clínico (edad, comorbilidad quirúrgica) con texto largo sobre por qué la edad puntúa o no; Re-evaluar; «Limpiar decisión y PHASES»; tarjeta azul «Recomendación: TRATAMIENTO ENDOVASCULAR» con insignias «100 % de los datos» y «Confianza baja» y párrafo; «Factores contribuyentes» con etiquetas ENDO / CLIP y «Ver procedencia»; «Decisión del equipo» (Sin registrar / Clipaje / Endovascular / Vigilar / Otra) y «Quién decide»; «Continuar a dispositivos». *Revisión:* la recomendación del algoritmo no debe ser el bloque más llamativo (hoy es una tarjeta azul saturada): pasa a tarjeta neutra con la etiqueta de confianza bien visible, y «Decisión del equipo» sube y se enseña como las tres opciones radio del lienzo, con el motivo que va al informe. Los textos sobre la edad y la puntuación se pliegan en «Por qué». El panel se ensancha a 520 px para que factores y decisión convivan.

**6 · Dispositivos.** Trayectoria de abordaje (Entrada ✓, Diana ✓, Sugerir corredor, distancia y ángulo, «Vuelve a guardar y analizar», Limpiar); «En el plan (3)» con Clips / Coils / Stent, Estrategia del equipo (selector) y «Limpiar todos los dispositivos»; pestañas de familia (Clips, Coils, Stent recto, Stent sobre la línea central, WEB) y subpestañas Elegir / Colocar; bloque de recomendación con cifras de cuello, AR y vaso padre, mordaza mínima explicada, «Clips recomendados (1)» con tarjeta NAVARRO T4 y lista de comprobaciones (✓ / !), «Clip a medida sobre un diseño propio» (mordaza, talla, Generar clip), desplegables «Por qué se descartaron otros» (11) y «Qué limita esta recomendación» (5); «Modelo de clip» (selector, casilla ver todos, Importar clip STL/OBJ); «Añadir al plan y colocar»; «Continuar a fabricación». *Revisión:* es el panel más denso y el más valioso; se respeta todo pero con jerarquía: la recomendación arriba con la pieza propuesta y sus comprobaciones como lista de ✓/! en dos tonos (`--success`, `--warning`); los textos explicativos de mordaza mínima y corredor en «Por qué»; las pestañas de familia como segmentos; las subpestañas Elegir / Colocar como dos pasos con el estado de la pieza en el visor. El viewer muestra el clip con el aviso de rama a X mm (hoy no se señala).

**7 · Fabricación.** Aviso «Paso opcional»; «Gestionar talleres»; especificación de fabricación (tabla de forma, hoja, muelle, fuerza, cuello) con «Por qué se fabrica» y «A confirmar antes de fabricar»; «Generar STL y dossiers», «Copiar especificación»; «De dónde salen las medidas» (cuello, altura de domo, Ø máximo, vaso padre); «La pieza» (serie T1–T4, acodado 15°–90°, cantidad, mordaza con tallas dibujadas); «El pedido» (uso previsto, fecha, prioridad, esterilización, marcado, referencia de autorización); «El taller» (destinatario, registrar taller, observaciones); «Quién responde de la pieza» (cirujano responsable y tres casillas de asunción); «Guardar borrador», «Firmar y generar pedido», «Continuar al informe». *Revisión:* es un formulario largo y serio; se mantiene como lista de secciones con reglas y un índice fijo arriba (Especificación · Pieza · Pedido · Taller · Responsable) que se desliza al avanzar; las casillas de asunción se agrupan en una sola tarjeta de firma. Mientras carga («Leyendo el caso…», «Preparando el pedido…») se enseña el esqueleto del formulario, no una línea de texto.

**8 · Informe y exportación.** «Resumen del caso» (paciente, Ø máximo, riesgo morfométrico Alto con nota, abordaje, dispositivo elegido, decisión del equipo, recomendación con confianza); «Cirujano responsable» (obligatorio, hoy con borde rojo), «Notas clínicas»; casilla «Incluir captura 3D» con aviso de adjuntar a un caso; «Regenerar informe PDF» con «El plan cambió desde que se generó este archivo»; Exportar malla STL, Exportar escena 3D (GLB), Regenerar DICOM SR, Generar DICOM SEG; «Guardar y cerrar»; «Impresión 3D» (tamaño objetivo, suavizado, agujero máx., rellenar, subdividir, cama de impresión, Preparar para impresión 3D). *Revisión:* el panel ensanchado muestra el PDF real; las exportaciones se agrupan en una tarjeta «Exportar» con cuatro botones del mismo peso y el aviso de «plan cambiado» una sola vez arriba; el bloque de impresión 3D se pliega por defecto; el campo obligatorio se marca con texto, no solo con borde rojo.

**Transversal.** La leyenda del visor (CLIPS / COILS / STENT) y los rótulos del HUD pasan al nuevo texto del visor; el desplegable «Anotaciones» (Regla, Ángulo, Región, Marcador) se mantiene al pie de todos los paneles; el conmutador «◧ Panel» sale de la barra (ver decisión 3).
