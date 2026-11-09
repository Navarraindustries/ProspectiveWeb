# Onboarding de primera entrada y avatares — diseño

Fecha: 2026-11-09 · Estado: borrador para aprobación del dueño
Lienzo de referencia (maquetas interactivas): https://claude.ai/artifact/NJgPkaWRUN4JdyQVnDMPQ9
— filas 1 y 2 («Recomendación v2»). Las filas de alternativas no se construyen.

## 1. Intención

Cuando una persona entra por primera vez a Prospective (cuenta aprobada por un
admin), hoy aterriza en «Pacientes» sin ninguna guía, y el quirófano (8 pasos, visor,
dock, panel) es tan extenso que intimida. Además, quien no subió foto aparece como
dos iniciales grises.

Queremos:

1. **Un onboarding** que enseñe la aplicación de forma dinámica, interactiva y
   digerible: el panel de pacientes con detalle (es la pantalla principal) y el
   quirófano solo lo justo para orientarse, dejando el detalle de cada paso para
   pistas cortas en el momento en que se usa.
2. **Avatares** con estética de dibujo de videojuego (estilo «indie vectorial»), creados
   por piezas o a partir de la foto, sin que la foto salga nunca a un servicio externo,
   y con la persona eligiendo si se muestra su foto real o su avatar.

### Regla de contenido (pedida por el dueño, obligatoria)

**Todo lo que se explique debe decir qué es, cómo se usa, cuándo usarlo y por qué** —
pero en muy poco texto: es un onboarding, no un manual. Cada explicación (parada,
zona, pista) se escribe con cuatro campos cortos:

| Campo | Qué contiene | Límite |
|---|---|---|
| `titulo` | Qué es, dicho como nombre o frase corta | ≤ 45 caracteres |
| `como` | Cómo se usa: el gesto o el botón concreto | ≤ 110 caracteres |
| `cuando` | Cuándo conviene usarlo | ≤ 90 caracteres |
| `porque` | Por qué existe / qué te ahorra | ≤ 90 caracteres |

En la burbuja se ven como: título en negrita y tres líneas con una etiqueta pequeña
delante («Cómo», «Cuándo», «Por qué»). Nada de párrafos. Si un texto no cabe en el
límite, se recorta el texto, no se amplía el límite.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Onboarding de primera entrada en 6 momentos: Hola → Tu avatar → En 20 segundos →
  Panel de pacientes (recorrido con focos sobre la interfaz REAL) → Quirófano en 5
  zonas → Listo (lista de primeros pasos).
- Pistas de primera vez en cada uno de los 8 pasos del quirófano.
- Se puede saltar en cualquier momento y repetir desde el menú de usuario.
- El estado (visto, saltado, pistas vistas) se guarda en el servidor, para que no
  reaparezca en otro equipo.
- Avatares indie vectoriales: creador por piezas, avatar generado por defecto desde el
  nombre, «crear desde mi foto» procesado en el navegador, y elección foto/avatar.
- Funciona en escritorio, tableta y móvil (la app ya es responsive; ver
  `docs/superpowers/specs/2026-11-01-pasada-responsive.md`).
- Respeta `prefers-reduced-motion` y es usable con teclado y lector de pantalla.

**No objetivos**
- Las alternativas del lienzo (A, C como misiones, D como vídeo, G, H, I; avatares
  pixel, holograma, 3D, neurovascular, etc.).
- Un laboratorio de casos de práctica o un caso tutorial cargado en el quirófano.
- Recorridos guiados por dentro de cada panel de paso (eso lo hacen las pistas).
- Otros estilos de dibujo (se construye solo «indie vectorial»; el renderizador no
  necesita estar preparado para más).

**Anti-objetivos (si pasa esto, ha fallado aunque funcione)**
- **Gamificación**: nada de puntos, niveles, rachas, logros, marcos que se ganan,
  confeti, «misión cumplida», tarjetas con estadísticas ni comparativas entre
  compañeros. La referencia a videojuegos es SOLO el estilo de dibujo del personaje.
- **La foto sale del equipo hacia cualquier servicio de IA o de terceros.** Prohibido,
  sin excepción. Si la persona decide conservar su foto, se sube únicamente al
  servidor de Prospective, igual que la foto de perfil de hoy.
- Explicaciones largas o de tipo manual.
- Bloquear el trabajo: el onboarding nunca impide usar la app (siempre hay «Saltar»).
- Que aparezca encima de alguien con la contraseña inicial pendiente (primero va
  `ForcePasswordChange`).

## 3. Lo que ya existe y en qué se apoya

- `backend/services/db_models.py` `User`: `photo_path`, `must_change_password`, roles
  `admin | medico | residente | viewer`. Migraciones Alembic en `backend/migrations/`
  (hay `backend/test_migrations.py`).
- `backend/models/auth.py` `UserInfo`: `avatar_initials`, `has_photo`,
  `must_change_password`. `GET /api/auth/me/photo` sirve la foto propia.
- La foto solo se sube hoy en el registro o por un admin
  (`POST /api/auth/users/{id}/photo`); **no hay subida por la propia persona**.
- `frontend/src/App.tsx:132`: si `must_change_password`, solo se ve `ForcePasswordChange`.
- Avatares hoy: `UserMenu.tsx` (componente `Avatar` con foto o iniciales) y el pie de
  `SideNav.tsx` (iniciales).
- Componentes de cristal: `Sheet`, `BottomSheet`, `Button`, `Tabs`, tokens en
  `frontend/src/styles/tokens/colors.css` (incluye `--tramo-*`), `glass.ts`.
- Recordatorio de trampas (memoria del proyecto): al cambiar un modelo, regenerar
  `frontend/openapi.json` + `schema.gen.ts`; `frontend/src/api/types.ts` está escrito a
  mano y hay que tocarlo también.

## 4. Onboarding

### 4.1 Cuándo aparece

- **Cuentas nuevas** (creadas después del despliegue): arranca solo al entrar, tras
  `ForcePasswordChange` si aplica, cuando `onboarding.completado` es nulo.
- **Cuentas existentes** al desplegar: la migración las marca como `invitado`. En vez
  de arrancar solo, ven una vez una tarjeta discreta en Pacientes: «Hay un recorrido
  nuevo de 4 minutos · Verlo / Ahora no». *(Decisión del diseñador; revisable.)*
- Siempre disponible en el menú de usuario: «Ver el recorrido de bienvenida».
- Si se cierra a medias (pestaña cerrada, Esc, «Saltar»), cuenta como saltado: no
  vuelve a arrancar solo; queda en el menú.

### 4.2 Los seis momentos

**1 · Hola** (capa a pantalla completa sobre la app, con el fondo de cristal)
- «Hola, [nombre]. Te enseñamos Prospective en 4 minutos.»
- Agenda de tres puntos: Tu avatar · El panel de pacientes · El quirófano en 5 zonas.
- Botones: «Empezar» y «Ahora no». Arriba, «Saltar todo» en todos los momentos.
- Barra de progreso con los 6 momentos.

**2 · Tu avatar** — el creador de avatares (§5) en una versión compacta: estilo ya fijo
(indie vectorial), piezas principales (piel, pelo, color de pelo, gorro, gafas/lupas,
pijama), botón «Desde mi foto» y elección «Mostrar mi foto / Mostrar mi avatar» si hay
foto. «Más piezas» lleva al creador completo después. Guardar aquí ya guarda el avatar.

**3 · En 20 segundos** — cuatro tarjetas animadas, una por tramo con su color
(`--tramo-*`): Preparar, Detectar, Medir, Dispositivo (el Informe se menciona en la
última). Cada tarjeta: verbo + una línea. Cierre: «Ahora te enseñamos dónde está cada
cosa.» Sin vídeo.

**4 · Panel de pacientes — recorrido con focos (B)** sobre la página REAL de Pacientes
(la capa navega allí). Un foco recorta el elemento real y oscurece el resto; una
burbuja con los 4 campos explica. Nueve paradas (copias en §4.4):

| # | Elemento real | Notas |
|---|---|---|
| 1 | Barra lateral (secciones) | En móvil, el botón «Abrir las secciones». La parte «Administración» solo se menciona a admins. |
| 2 | «Nuevo paciente» y «Nuevo caso» | En móvil viven en el menú «⋯»: foco sobre ese menú. |
| 3 | «Prueba rápida sin paciente» | |
| 4 | Avisos clínicos | Si no hay avisos, la parada se salta. |
| 5 | Buscador «Buscar paciente o HC…» | Mencionar las pestañas solo si se ven. |
| 6 | Tarjeta de paciente | Si la persona no tiene pacientes (lo normal en una cuenta nueva), se muestra una **tarjeta de ejemplo** dibujada solo durante el recorrido, marcada «Ejemplo»; nunca se escribe nada en la base de datos. |
| 7 | La ficha en columnas | Foco sobre la misma tarjeta; la burbuja lleva un mini esquema Paciente › Casos › Estudios de imagen › Sesiones guardadas › Vista previa. |
| 8 | Panel lateral «Hoy» / Actividad / Accesos | En móvil, si el panel no se ve, la parada se salta. |
| 9 | ⌘K y menú de usuario | Decir que el recorrido se repite desde el menú. |

**5 · Quirófano en 5 zonas** — NO se abre el quirófano real (hace falta una sesión con
datos). Se muestra una **ilustración fiel** del quirófano (como la maqueta
`QuiroZonas` del lienzo) con 5 números que se pueden tocar en cualquier orden, más
Anterior/Siguiente:

1. El visor · 2. El dock de pasos (con los 8 pasos agrupados en los 5 tramos) ·
3. El panel del paso · 4. La barra superior (dónde estás) · 5. Guardar, capturar y atajos.

Al final de la zona 2 se avisa: «Cuando entres a cada paso, te saldrá una pista corta.»

**6 · Listo** — avatar elegido, «Listo, [nombre]», y «Primeros pasos sugeridos»
(lista simple, sin progreso ni premios), cada uno con su botón:
Crear tu primer paciente · Colgarle un caso · Subir su DICOM y planificar · ¿Solo
probar? Prueba rápida sin paciente. Botones: «Ir a mis pacientes» y «Repetir el
recorrido». Esta lista se queda visible como tarjeta plegable en Pacientes **hasta que
la persona la cierre a mano** (se guarda `tarjeta_cerrada` en `onboarding_state`, así
que sigue cerrada en otros equipos). No se cuentan acciones ni se marca nada como
«hecho» *(decisión del diseñador: evita parecer un juego y no hay que instrumentar
acciones)*.

### 4.3 Pistas de primera vez en el quirófano

- La primera vez que la persona entra a cada paso (1–8), aparece una burbuja junto a la
  cabecera del panel del paso («PASO N · …») con los 4 campos.
- Botones: «Entendido» y «No mostrar más pistas». En el menú de usuario, interruptor
  «Pistas: activadas/desactivadas» y «Volver a ver todas las pistas».
- No aparece mientras haya un diálogo abierto o un marcado en curso (regla, cuello…);
  espera a que termine.
- Una pista por entrada: si se cambia de paso con la pista abierta, se cierra y cuenta
  como vista.

### 4.4 Textos (borrador; el constructor los ajusta a los límites y los revisa contra la UI)

Panel de pacientes:

| # | Título | Cómo | Cuándo | Por qué |
|---|---|---|---|---|
| 1 | Tus secciones | Toca una sección para ir a ella; fija la barra con Alt+B. | Para saltar entre pacientes, estudios, pedidos de clips y talleres. | Todo lo clínico está a un toque, sin buscar. |
| 2 | Todo empieza con un paciente | «Nuevo paciente» crea su ficha; «Nuevo caso» le cuelga un caso. | Antes de subir cualquier estudio de alguien real. | El caso guarda juntos DICOM, sesiones y capturas. |
| 3 | Probar sin paciente | «Prueba rápida sin paciente»: subes un DICOM y planificas ya. | Para enseñar la app o mirar un estudio suelto. | No ensucias la lista; luego puedes archivarlo en un caso. |
| 4 | Avisos clínicos | Pulsa «Ver» y vas directo al caso. | Cuando aparezca un chip aquí arriba. | Lo urgente no se pierde entre pacientes. |
| 5 | Encuentra a cualquiera | Escribe nombre o número de historia. | Cuando la lista crezca. | La lista va por actividad; buscar es lo más rápido. |
| 6 | La tarjeta del paciente | El botón cambia solo: Planificar, Reanudar o Informe. | Para retomar justo donde lo dejaste. | Ves paso, riesgo y progreso sin abrir nada. |
| 7 | La ficha del paciente | Toca la tarjeta: las columnas se abren hacia la derecha. | Para ver casos, estudios y sesiones guardadas. | Todo su historial en una sola pantalla. |
| 8 | Tu día | Mira «Hoy» y la actividad reciente. | Al empezar la jornada. | Sabes qué está en curso sin abrir pacientes. |
| 9 | Atajos y tu menú | ⌘K para ir a cualquier sitio; tu menú para avatar, contraseña y este recorrido. | Cuando quieras ir rápido o repasar. | Menos clics; el recorrido siempre está a mano. |

Quirófano en 5 zonas:

| # | Título | Cómo | Cuándo | Por qué |
|---|---|---|---|---|
| 1 | El visor | Arrastra para rotar, rueda para acercar; arriba eliges vista y desde dónde mirar. | Siempre: es tu mesa de trabajo. | Lo que ves cambia con cada paso. |
| 2 | Los pasos | Toca un número del dock o pulsa 1–8. | Para avanzar por el flujo o volver atrás. | 8 pasos en 5 tramos: preparar, detectar, medir, dispositivo, informe. |
| 3 | El panel del paso | A la derecha; pliégalo con P. | Para hacer lo propio de cada paso. | Solo ves lo que necesitas en ese momento. |
| 4 | Dónde estás | Arriba a la izquierda: paciente, caso y riesgo; la flecha vuelve a Pacientes. | Cuando dudes de qué caso tienes abierto. | Evita trabajar sobre el paciente equivocado. |
| 5 | Guardar y atajos | «Guardar progreso» crea una sesión; «Captura» y «Grabar» guardan imagen o vídeo. | Antes de salir o al terminar algo importante. | Lo retomas luego con «Reanudar» desde la ficha. |

Pistas por paso (el constructor verifica cada una contra su panel real):

| Paso | Título | Cómo | Cuándo | Por qué |
|---|---|---|---|---|
| 1 Carga DICOM | Sube el estudio | Arrastra la carpeta o el ZIP del DICOM. | Al empezar un caso. | Todo el análisis sale de esta serie. |
| 2 Segmentación | El árbol vascular | Revisa la malla; ajusta el umbral si falta o sobra vaso. | Justo después de cargar. | Medidas y detección dependen de esta malla. |
| 3 Detección | Cinco candidatos | Toca cada uno y acepta solo los que sean lesión. | Antes de medir. | La lista siempre trae 5: no es un veredicto. |
| 4 Morfometría | Mide el aneurisma | Marca cuello y saco sobre la malla. | Con la lesión aceptada. | Cuello, saco y cociente deciden el tratamiento. |
| 5 Decisión | Apoyo a la decisión | Revisa las puntuaciones y la geometría. | Antes de elegir dispositivo. | Resume riesgo con escalas publicadas, no lo decide. |
| 6 Dispositivos | Prueba un clip | Elige uno y mira cómo cierra el cuello. | Cuando ya tienes las medidas. | Ves el resultado antes de entrar a quirófano. |
| 7 Fabricación | Clip a medida (opcional) | Ajusta medidas y pide la fabricación. | Si ningún clip de serie encaja. | Para cuellos fuera de catálogo. |
| 8 Informe | El informe | Revisa y exporta el PDF. | Al cerrar la planificación. | Deja constancia y se comparte con el equipo. |

Avatar (momento 2), en una línea bajo el título: «Así te verán en Prospective. Puedes
cambiarlo cuando quieras desde tu menú.»

### 4.5 Comportamiento del foco y la burbuja

- Componente propio (sin librería de terceros), con el cristal de la app. El foco es un
  hueco con borde azul y brillo; el resto, velo `--scrim`. Transición suave entre
  paradas (posición y tamaño), sin animación si `prefers-reduced-motion`.
- Cada parada declara uno o varios **objetivos** por atributo `data-tour="…"` en el
  componente real, por orden de preferencia (ej.: `nav-secciones`, luego
  `nav-hamburguesa`). Se usa el primero visible. Si ninguno lo está, la burbuja sale
  centrada sin foco (o la parada se salta si está marcada como opcional).
- La burbuja se coloca al lado con más espacio; en móvil (< breakpoint de tableta) es
  una hoja inferior (`BottomSheet`) y el foco se mantiene visible encima.
- Mientras dura el recorrido, el contenido bajo el velo no recibe clics (salvo que una
  parada lo pida explícitamente). Al redimensionar o hacer scroll, el foco se recoloca.
- Teclado: → / Intro siguiente, ← anterior, Esc saltar. Foco del teclado atrapado en la
  burbuja. El cambio de parada se anuncia con `aria-live="polite"` («Parada 3 de 9:
  …»). Botones reales, objetivos táctiles ≥ 44 px.

## 5. Avatares

### 5.1 Estilo

«Indie vectorial» como en el lienzo (`AvEstilos`, primera tarjeta; creador `Av01`):
formas planas, sin contorno, sombra mínima por superposición de formas, círculo de
fondo. SVG generado en el cliente; nítido a cualquier tamaño y legible a 24 px.

### 5.2 Piezas

Piel (6 tonos) · Peinado (corto, largo, moño, rapado, + 2 más a criterio del
constructor) · Color de pelo (6) · Cabeza (nada, gorro quirúrgico, gorro amplio) ·
Ojos (sin gafas, gafas, lupas quirúrgicas) · Mascarilla (sí/no) · Color del pijama (6,
de la paleta de la app) · Fondo (5). Botones «Aleatorio» y «Deshacer».
Las piezas deben resultar inclusivas (tonos de piel y peinados variados; gorro con o
sin pelo visible).

### 5.3 Datos

- El avatar se guarda como **configuración**, no como imagen: JSON pequeño y
  versionado, p. ej. `{"v":1,"piel":2,"peinado":"corto","pelo":"#2B1D16","cabeza":"gorro","ojos":"lupas","mascarilla":false,"pijama":"#3FC4AB","fondo":"#12141A"}`.
  El servidor valida claves y valores contra listas cerradas.
- **Por defecto** (quien nunca abrió el creador): configuración derivada de un hash
  estable del `id` de usuario (no del nombre, para que no cambie si se corrige el
  nombre). Mismo usuario → mismo avatar en todas partes.
- `modo` de imagen de perfil: `avatar` | `foto`. Si `foto` y no hay foto de perfil, se
  muestra el avatar.
- **Dos fotos distintas, que no se mezclan** *(decisión del diseñador, por privacidad)*:
  - **Foto del registro** (`photo_path`, ya existe): documento para que el admin
    verifique la identidad. Sigue exactamente como hoy: solo la ven el admin (en
    solicitudes y gestión de usuarios) y la propia persona. Esta función NO la expone,
    NO la borra y NO la usa como imagen de perfil por sí sola.
  - **Foto de perfil** (`profile_photo_path`, nueva): la que la persona elige mostrar a
    los demás con «Mi foto». Solo existe si la persona la sube o elige explícitamente
    «Usar la foto de mi registro» (que la copia). «Quitar mi foto» borra solo esta.

### 5.4 «Desde mi foto» (en el navegador)

1. La persona elige una imagen (o usa la cámara en móvil). La imagen se carga en un
   `<canvas>` local; **no se envía nada** en este paso.
2. Ajusta la foto dentro de una guía ovalada (arrastrar y zoom).
3. Se muestrean colores: piel = mediana de dos zonas de mejilla de la guía; pelo =
   mediana de la franja superior. Se mapean al tono de piel y color de pelo más
   cercanos de la paleta. Peinado, gafas, etc. los elige la persona (sin modelos de
   reconocimiento). *(Decisión del diseñador: sencillo, sin dependencias y sin
   descargas de modelos.)*
4. El creador se abre ya rellenado.
5. Pregunta final: **«¿Qué quieres que vean los demás?»** — «Mi avatar» (la foto se
   descarta y no se sube) o «Mi foto» (se sube al servidor de Prospective como foto de
   perfil, visible para las personas con cuenta en Prospective). Texto visible junto a
   la elección: «Tu foto nunca se envía a servicios externos.» Si la persona tiene foto
   del registro, se le ofrece también «Usar la foto de mi registro» como origen.

### 5.5 Dónde se ve

Pie de la barra lateral, menú de usuario, lista de usuarios del admin y la lista para
compartir un paciente. En las listas de otras personas se muestra la imagen que cada
una eligió (avatar o foto de perfil). Las iniciales grises desaparecen. En las
pantallas de verificación del admin (solicitudes pendientes, ficha de usuario) la
foto del registro se sigue viendo como hoy, aparte del avatar.

### 5.6 Gestión desde el menú de usuario

Entrada «Tu avatar» → creador completo con vista previa grande, «Desde mi foto»,
selector «Mostrar: mi avatar / mi foto», «Quitar mi foto» (borra la foto de perfil del
servidor; la del registro no se toca).

## 6. Servidor

- Migración Alembic en `users`:
  - `avatar_config` (Text, JSON, nullable), `avatar_mode` (String(8), default
    `"avatar"` para TODAS las cuentas, también las existentes: nadie pasa a mostrar una
    foto sin elegirlo) y `profile_photo_path` (String(300), default `""`).
  - `onboarding_state` (Text, JSON, nullable): `{"estado": "pendiente|invitado|completado|saltado", "fecha": ISO, "pistas_vistas": [1,3], "pistas_activas": true, "tarjeta_cerrada": false}`.
    Cuentas existentes → `invitado`; nuevas → `pendiente`.
  - Consecuencia visible para cuentas existentes con foto del registro: en su menú
    pasan a verse con su avatar generado; pueden elegir «Usar la foto de mi registro».
- `UserInfo` gana `avatar_config` (objeto o null), `avatar_mode`, `onboarding`.
  `UserBrief` y `UserAdminInfo` ganan `avatar_config` y `avatar_mode` (y `has_photo`
  donde no lo tengan).
- Endpoints nuevos (todos con la sesión y el CSRF actuales):
  - `PUT /api/auth/me/avatar` — guarda `config` y `modo`.
  - `POST /api/auth/me/profile-photo` (archivo, o `{"desde_registro": true}` para copiar
    la foto del registro) y `DELETE /api/auth/me/profile-photo` — foto de perfil propia,
    con los mismos límites y almacenamiento que la subida del registro (fuera del
    montaje público). `GET /api/auth/me/photo` (foto del registro) no cambia.
  - `GET /api/users/{id}/profile-photo` — foto de perfil de otra cuenta, para cualquier
    usuario con sesión, **solo si esa cuenta tiene `avatar_mode = "foto"` y foto de
    perfil**; si no, 404. Nunca sirve la foto del registro.
  - `UserInfo`/`UserBrief`/`UserAdminInfo` exponen `has_profile_photo` (distinto de
    `has_photo`, que sigue siendo la foto del registro).
  - `PUT /api/auth/me/onboarding` — actualiza estado y pistas vistas.
- Regenerar `frontend/openapi.json` y `schema.gen.ts`; actualizar `api/types.ts`.

## 7. Restricciones

- Sin dependencias nuevas de terceros para el recorrido ni para el avatar (el estilo de
  la app es propio y los recorridos de librería no encajan con el cristal).
- Ninguna petición de red con la foto salvo la subida explícita a
  `POST /api/auth/me/photo` cuando la persona elige «Mi foto».
- Español, tuteo, mismos términos que la UI (Pacientes, caso, estudio de imagen,
  sesión, quirófano, Reanudar…).
- Tema oscuro y claro.
- No romper `ForcePasswordChange`, la paleta ⌘K ni el bloqueo de cambios sin guardar
  del quirófano.

## 8. Pruebas

- Backend: migración (sube y baja; existentes → `invitado` y `avatar`), validación de
  `avatar_config`, permisos de `GET /api/users/{id}/profile-photo` según
  `avatar_mode` (y que nunca devuelve la foto del registro), subida/copia/borrado de la
  foto de perfil sin tocar `photo_path`, estado de onboarding (incluido
  `tarjeta_cerrada`).
- Frontend (vitest): motor del recorrido (elección de objetivo visible, paradas
  opcionales que se saltan, teclado, Esc = saltado, persistencia); tarjeta de ejemplo
  solo durante el recorrido; pistas (una por paso, no durante un marcado, interruptor);
  renderizador de avatar (configuración → SVG, por defecto determinista por id);
  muestreo de color (función pura probada con `ImageData` sintética); que no hay
  `fetch` con la foto en el camino «Mi avatar»; límites de longitud de los textos
  (test que recorre las tablas de copias).
- Revisión en navegador en escritorio, tableta y móvil antes de dar por terminado.

## 9. Lo que se deja al constructor

- Estructura de módulos y nombres internos; dónde vive el motor del recorrido.
- Los dos peinados extra y el dibujo exacto de cada pieza, dentro del estilo.
- Ajuste fino de los textos a los límites, verificando cada uno contra la UI real.
- Animaciones concretas de las tarjetas de «En 20 segundos» y de las transiciones.
- Orden de las fases de implementación (sugerencia: servidor + avatar → recorrido de
  pacientes → resto del onboarding → pistas).
