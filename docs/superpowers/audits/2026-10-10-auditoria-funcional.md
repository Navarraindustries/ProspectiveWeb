# Auditoría funcional con criterio clínico — PROSPECTIVE Web

Fecha: 2026-10-10 · Base: master `b80e8da` · Spec: `docs/superpowers/specs/2026-10-10-auditoria-funcional-design.md`

Persona: neurocirujano vascular con práctica híbrida. Cada elemento responde a: ¿para qué sirve?, ¿se encuentra donde se busca?, ¿deja atascado?, ¿su texto dice lo que hace?

Leyenda. Veredicto: mantener · corregir · fusionar · eliminar. Gravedad: bloquea · confunde · cosmético. Destino: F1 (arreglo inmediato) · F2 (gestión e identidad) · F3 (espacio de trabajo) · E5 (visor). Las capturas citadas están en `.superpowers/audit-capturas/` (no versionadas).

## Herencia de E4 y E5

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|
| VOLUMEN · «UMBRAL» del MIP tras reanudar | Rampa del MIP anclada al umbral de segmentación | corregir | confunde | E5 | Tras reanudar, `segmentation.threshold_lower` no llega y el MIP cae al 60 % del rango (UMBRAL 2141) mientras «Vasos» usa 1470; que caiga a la banda del vaso |
| Oblicuo en celda compacta · tira de controles | Deslizadores y RECORRIDO | corregir | confunde | F3 | La tira completa se muestra en la celda pequeña y deja la imagen en una franja |
| VOLUMEN · «LOCAL» al apagarlo | Volver a la proyección completa | corregir | cosmético | E5 | No reencuadra; la cámara queda sobre la caja de la lesión |
| VOLUMEN · «LOCAL ●» con RECORTE LIBRE | Indicar que LOCAL no se aplica | corregir | cosmético | E5 | El rótulo sigue diciendo ● aunque esté atenuado y sin efecto |
| Gráfica de calibre · flechas tras un clic | Avanzar muestra a muestra | corregir | cosmético | E5 | La primera flecha puede caer en el mismo punto de 0,5 mm y parece no hacer nada |
| Gráfica de calibre · cursor fuera de rango | Mostrar dónde está el punto compartido | corregir | cosmético | E5 | El cursor puede superar la última muestra (las secciones saltan el 5 % de cada extremo) |
| Oblicuo · RECORRIDO ▸ VASO en vasos horizontales | Plano perpendicular al vaso | corregir | confunde | E5 | `planeFromNormal` pliega la normal a +z y el plano gira 180° al cruzar la horizontal |

## Entrada

### Landing

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|
| «clic para saltar» (panel) | Vídeo de marca a pantalla completa antes de la portada | corregir | cosmético | F2 | Dura hasta 4,5 s y se salta con un clic o con cualquier tecla (el rótulo solo dice «clic»). Vuelve en cada pestaña nueva, porque la marca vive en `sessionStorage`, y también al entrar directo por `/app`. Para quien entra a diario es solo espera: debería verse una vez por navegador o nunca con sesión abierta; captura `t2-landing.jpeg` |
| «Hybrid Neurovascular Planning · SKULLAPP» (texto) | Lema del vídeo de entrada | corregir | cosmético | F2 | En inglés, y es el tercer lema distinto del producto junto a «Neurovascular AI» y «Plataforma de planificación neurovascular»; unificar en uno solo en español |
| «PROSPECTIVE · Neurovascular AI» (texto) | Marca en la barra fija | corregir | cosmético | F2 | «AI» promete inteligencia artificial que la detección, geométrica, no anuncia en ningún otro sitio. El logotipo no es clicable, lo que en una portada es aceptable; captura `t2-landing.jpeg` |
| «Suite clínica activa» (texto) | Piloto verde junto a la marca | eliminar | cosmético | F2 | Parece un indicador de estado del sistema y no mide nada; un especialista lo leerá como «el servidor está en marcha» aunque no lo esté |
| «Qué es · Pipeline · Funcionalidades · Índices · Tecnología · Contacto» (menú) | Saltar a cada sección de la portada | mantener | — | — | Los seis enlaces llevan a su sección (comprobado con «Pipeline»). Faltan «Dispositivos» y «Próximamente», que existen como secciones, sin que estorbe |
| «Entrar» (botón) | Ir a la aplicación desde la barra fija | mantener | — | — | Lleva a `/app`: sin sesión abre «Iniciar sesión», con sesión abre «Pacientes» directamente (comprobado). Siempre visible arriba a la derecha, donde se busca |
| «Plataforma de planificación neurovascular · SkullApp» (texto) | Rótulo sobre el titular | mantener | — | — | Dice qué es en una línea; el problema de los lemas múltiples está en la fila del vídeo de entrada |
| «Planificar la cirugía de un aneurisma cerebral, con datos y en 3D» (texto) | Titular y entradilla del producto | mantener | — | — | Claro para el especialista; la entradilla resume el flujo real: reconstrucción, medida, riesgo y tratamiento |
| «Iniciar sesión» (botón) | Ir a la aplicación desde el titular | fusionar | cosmético | F2 | Misma acción que «Entrar» y «Entrar a la plataforma» con tres nombres. Con sesión abierta no pide ninguna sesión: abre «Pacientes» (comprobado). Un solo rótulo para los tres |
| «Ver el pipeline ↓» (botón) | Bajar a la sección del vídeo explicativo | corregir | cosmético | F2 | Funciona (lleva a `#pipeline` y el vídeo arranca solo), pero «pipeline» es jerga de ingeniería; «Ver cómo funciona» lo diría a un cirujano |
| «Sin instalar nada · Modelo 3D en el navegador · Medidas objetivas en milímetros» (texto) | Tres argumentos bajo los botones | corregir | cosmético | F2 | «Sin instalar nada» se repite en la entradilla, aquí, en «Tres pasos, sin instalar nada» y en «Tecnología»; con una vez basta |
| Escena 3D del titular (panel) | Árbol vascular animado con el saco en rojo detrás del titular | mantener | — | — | Decoración marcada `aria-hidden`, sin interacción ni datos reales; carga en diferido y no retrasa el botón. No aporta nada al especialista, pero tampoco le cuesta nada |
| «Decisiones quirúrgicas con datos, no solo a ojo» (texto) | Sección «Qué es» con definición de aneurisma y glosario de clipaje y endovascular | corregir | cosmético | F2 | Explica a un neurocirujano qué es un aneurisma «como un pequeño globo» y qué es un clip; el tono es de folleto para pacientes. Si la portada es para especialistas, sobra el glosario |
| «Objetivo · Con respaldo · Accionable · Trazable» (texto) | Cuatro cualidades del producto | mantener | — | — | Breves y verificables en la aplicación |
| «Del estudio de imagen al plan quirúrgico, en ocho pasos» (panel) | Vídeo explicativo del flujo y lista de los ocho pasos | mantener | — | — | El vídeo arranca solo, en bucle y con controles. Los ocho rótulos salen de la misma lista que el carril de pasos de la aplicación, así que no se desincronizan |
| «Todo el flujo neurovascular en una sola plataforma» (texto) | Nueve tarjetas de funcionalidades | mantener | — | — | Coinciden con los pasos de la aplicación. «Compatible con TC, resonancia y angiografía rotacional» no se comprueba aquí, porque solo hay un estudio XA; queda para el Paso 1 |
| «Cuello, altura máxima y cizallamiento de pared» (texto) | Pie de la figura de la sección «Índices» | corregir | confunde | F1 | La aplicación no calcula cizallamiento de pared: no hay simulación de flujo en el código. Un especialista buscará el dato de WSS y no lo encontrará. Quitar «cizallamiento» del pie |
| «Indicadores objetivos, respaldados por la literatura» (texto) | Ocho tarjetas de índices con umbral y referencias | corregir | cosmético | F2 | Útiles para el especialista. Los umbrales usan punto decimal («≥ 2.0», «≥ 0.25») en una página en español y los nombres van en inglés sin traducir |
| «Catálogos reales de dispositivos neurovasculares» (texto) | Clips NAVARRO, coils y stents con tres figuras 3D | mantener | — | — | Coherente con el Paso 6; los recuentos «66 diseños» y «39 modelos» se contrastan en la tarea del Paso 6 |
| «De la consulta al quirófano, y del aula al laboratorio» (texto) | Cinco casos de uso | mantener | — | — | Cortos y pertinentes para un servicio de neurocirugía |
| «Tres pasos, sin instalar nada» (texto) | Resumen del uso en tres pasos | mantener | — | — | «Arrastra la carpeta» se comprueba en el Paso 1 |
| «VTK · SimpleITK · pydicom · scipy · FastAPI · React · vtk.js · SQLite» (texto) | Lista de librerías en «Tecnología» | eliminar | cosmético | F2 | Nombres de librerías que no dicen nada a un cirujano; el párrafo de al lado ya explica que el cálculo va en el servidor |
| «Sin datos personales» (texto) | Tarjeta de «Seguridad y datos» | corregir | confunde | F1 | Dice que los pacientes se registran sin nombre, y la lista de «Pacientes» muestra «segura, Juan» con historia clínica y fecha de nacimiento. Es una promesa de privacidad falsa en la portada: corregir el texto o el formulario. El pie «sin datos del paciente» de la figura vecina tiene el mismo problema |
| «Acceso seguro · Cuentas verificadas · Cada caso, por separado» (texto) | Resto de tarjetas de seguridad | mantener | — | — | Ciertas: el registro queda pendiente de aprobación y cada sesión vive aparte |
| «Hacia dónde va PROSPECTIVE» (panel) | Hoja de ruta con SkullCloud, AR / VR y Analítica | mantener | — | — | Marcado «Próximamente» con borde discontinuo; no se confunde con lo que ya existe |
| «ingprospective@skullapp.tech» (botón) | Enlace de correo en «Contacto» | mantener | — | — | Abre el cliente de correo. Es el único sitio que dice a quién escribir para pedir acceso, y no aparece en «Entrar» ni en «Crear cuenta» |
| «Entrar a la plataforma» (botón) | Llamada final a entrar | fusionar | confunde | F1 | El texto de encima dice «solicita el registro profesional», pero el único botón lleva a «Iniciar sesión» y el registro queda una pantalla más allá. Arreglo F1 en el propio componente: rotular el botón «Entrar», como el de la barra, y añadir a su lado un segundo botón «Crear cuenta» que navegue a `/app/registro` |
| «PROSPECTIVE™ es una herramienta de apoyo a la planificación. No sustituye el juicio clínico.» (texto) | Aviso legal del pie | mantener | — | — | Necesario y bien formulado |

Atascos. Quien entra cada día y escribe la dirección raíz ve primero un vídeo negro de hasta 4,5 s y luego una portada de marketing de unas once pantallas de alto. El botón «Entrar» está a la vista y resuelve en un clic, pero el vídeo vuelve en cada pestaña nueva y no hay redirección a «Pacientes» aunque la sesión siga abierta: para el uso diario, la portada solo retrasa. Quien llega por primera vez sin cuenta lee «solicita el registro profesional» junto a un botón que solo dice «Entrar a la plataforma», y no sabe que el registro está detrás de «Iniciar sesión». Un especialista atento se detendrá en dos promesas que la aplicación no cumple: el «cizallamiento de pared» del pie de figura y «Sin datos personales» cuando la lista de pacientes muestra el nombre. La escena 3D es decoración y no tiene propósito para la persona. Errores de consola en la portada: ninguno.

### Entrar

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|
| «SkullApp PROSPECTIVE» (botón) | Logotipo del panel de marca; vuelve a la portada | mantener | — | — | Lleva a `/` sin repetir el vídeo de entrada (comprobado); tooltip «Ir a la página principal». Duplica «← Página principal», cosa aceptable por convención; captura `t2-entrar.jpeg` |
| «Plataforma web de planificación» (texto) | Rótulo del panel de marca | mantener | — | — | Sobrio y cierto |
| «Detección y simulación quirúrgica de aneurismas cerebrales» (texto) | Titular y entradilla del panel de marca | mantener | — | — | Coherente con lo que hace la aplicación |
| «VTK · SimpleITK · SKULLAPP» (texto) | Pie del panel de marca | eliminar | cosmético | F2 | Nombres de librerías sin significado para el cirujano, en el primer sitio donde mira cada día |
| Vídeo quirúrgico de fondo (panel) | Ambientación del panel de marca | mantener | — | — | Atenuado al 40 % y sin sonido; desaparece por debajo de 900 px de ancho y no estorba el formulario |
| «← Página principal» (botón) | Volver a la portada | mantener | — | — | Funciona; el texto dice adónde va |
| «Tema claro» (botón) | Alternar tema claro y oscuro | mantener | — | — | Solo icono ◐ con tooltip que nombra el destino. Cambia el tema de toda la aplicación y lo recuerda (comprobado y devuelto a oscuro); la portada sigue oscura a propósito |
| «Iniciar sesión» (texto) | Título y subtítulo «Introduce tus credenciales para acceder a la plataforma.» | mantener | — | — | Claro |
| «Usuario» (campo) | Nombre de usuario | corregir | confunde | F1 | El marcador de posición es «admin» en gris: en la captura parece que el campo ya viene relleno, y anuncia a cualquiera el nombre de la cuenta de administración. Quitar el marcador o poner «tu usuario»; captura `t2-entrar.jpeg` |
| «Contraseña» (campo) | Contraseña | mantener | — | — | Sin botón para ver lo escrito, aceptable. La contraseña se conserva tras un error para corregirla. La falta de recuperación tiene fila propia |
| «Entrar» (botón) | Enviar las credenciales | mantener | — | — | Deshabilitado hasta rellenar los dos campos, lo que se entiende sin aviso. Responde a Intro y muestra «Verificando…» mientras espera; tras entrar llega a «Pacientes» |
| «Credenciales incorrectas» (mensaje) | Error de usuario o contraseña | mantener | — | — | Igual para contraseña errónea y para usuario inexistente («nadie»): no regala qué usuarios existen. Sale bajo la contraseña, en rojo, con los dos campos marcados y una sacudida. El bloqueo por intentos tiene fila propia; captura `t2-entrar-error.jpeg` |
| «¿Olvidaste tu contraseña?» (botón) | Ausente: camino para quien no recuerda la contraseña | corregir | bloquea | F1 | No existe enlace ni texto de recuperación en «Entrar». El administrador sí puede restablecer contraseñas desde «Usuarios», pero nada en la pantalla lo dice, y quien olvidó la suya no tiene a quién dirigirse. Arreglo F1: una línea bajo el formulario, «¿Olvidaste la contraseña? Un administrador puede restablecerla: escribe a ingprospective@skullapp.tech». Un restablecimiento por correo sería función nueva, F2. Es `bloquea` porque, sin esa línea, la persona no tiene ningún camino para volver a entrar |
| «Demasiados intentos fallidos. Vuelve a probar en N min.» (mensaje) | Error 429 tras 5 fallos en 15 min para el mismo usuario y dirección | corregir | confunde | F1 | Leído en el código. Dice cuánto esperar, pero llega sin aviso previo: «Credenciales incorrectas» no advierte de que quedan intentos. Para quien olvidó la contraseña, esperar no resuelve nada. Arreglo F1: añadir al mensaje «Si no recuerdas la contraseña, pide a un administrador que la restablezca», y avisar en el error 401 cuando quede un intento. No llega a `bloquea` porque el bloqueo caduca solo |
| «El servidor respondió con el error N y sin más detalle. Inténtalo de nuevo en unos minutos.» (mensaje) | Error cuando el servidor contesta con un código sin detalle | mantener | — | — | Leído en el código (`Login.tsx:29`). Sustituye el críptico «Error 500»; dice qué pasó y qué hacer, en lenguaje llano. El número de error sirve a quien dé soporte |
| «No se pudo conectar con el servidor. ¿Está el backend en marcha?» (mensaje) | Error cuando el servidor no responde | corregir | confunde | F1 | Leído en el código, no provocado, porque los servidores no se paran. «Backend» es jerga y el médico no puede arrancarlo: debería decir que el servidor no responde y a quién avisar |
| «Tu cuenta está pendiente de aprobación. Un administrador debe activarla antes de que puedas iniciar sesión.» (mensaje) | Error 403 de cuenta pendiente, con sus hermanos «rechazada» y «desactivada» | corregir | confunde | F1 | Leído en el código. Dice qué pasa pero no cuánto tarda ni a quién escribir, y el correo de contacto solo está en la portada. Añadir el contacto a los tres mensajes |
| «Solicitud enviada. Un administrador revisará tu cuenta y podrás iniciar sesión en cuanto sea aprobada.» (mensaje) | Aviso verde en «Entrar» tras enviar el registro | corregir | confunde | F1 | Leído en el código. Promete acceso «en cuanto sea aprobada», pero el servidor no envía ningún aviso: la persona solo lo sabrá probando a entrar. Texto propuesto: «Solicitud enviada. Un administrador la revisará; no recibirás aviso, así que vuelve a intentar entrar más adelante. Para consultas, ingprospective@skullapp.tech.» |
| «Solicitud enviada…» sin canal de aviso (mensaje) | Avisar a la persona cuando su cuenta se aprueba o se rechaza | corregir | confunde | F2 | Función nueva: el registro no pide correo ni teléfono y el backend no envía notificaciones, así que hoy no hay forma de avisar. Pedir un dato de contacto y notificar la aprobación queda fuera de F1 por ser una función nueva |
| «Tu sesión ha caducado. Vuelve a iniciar sesión.» (mensaje) | Aviso cuando un 401 cierra la sesión | mantener | — | — | Leído en el código; explica por qué se vuelve a «Entrar» en vez de parecer un cierre al azar |
| «¿No tienes cuenta? Crear cuenta profesional» (botón) | Ir al registro | mantener | — | — | Visible bajo el botón; abre «Crear cuenta profesional» (comprobado) |
| «PROSPECTIVE™ Web · SkullApp — Laboratorio de Imagen Médica» (texto) | Pie del formulario | mantener | — | — | Firma institucional |
| «Preparando el espacio de trabajo…» (panel) | Pantalla de carga con vídeo tras entrar | eliminar | cosmético | F2 | Dura 2,65 s fijos y no espera a nada: la lista de pacientes ya está cargada debajo. El texto promete una preparación que no ocurre y se paga en cada inicio de sesión |

Atascos. Quien no tiene cuenta encuentra «Crear cuenta profesional» sin problema, pero en ningún punto de «Entrar» se dice cuánto tarda la aprobación ni a quién preguntar. Si ya envió la solicitud, cada intento de entrar devuelve «pendiente de aprobación» sin plazo ni contacto. Quien olvidó la contraseña no tiene enlace de recuperación ni instrucción alguna, y tras cinco intentos queda bloqueado quince minutos sin haber sido avisado. El campo «Usuario» con «admin» en gris hace dudar de si ya está relleno. Al cerrar sesión desde el menú de usuario la aplicación vuelve aquí sin ningún mensaje de confirmación. El error de inicio de sesión no distingue contraseña de usuario y así no regala información. Errores de consola: solo los dos 401 de red de los intentos fallidos, esperados.

### Crear cuenta

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|
| «SkullApp PROSPECTIVE» (botón) | Volver a la portada | mantener | — | — | Igual que en «Entrar»; descarta lo escrito sin preguntar, como «Cancelar»; captura `t2-registro.jpeg` |
| «Registro profesional» (texto) | Rótulo del panel de marca del registro | mantener | — | — | Dice dónde se está; coincide con el texto «registro profesional» de la portada |
| «Únete al equipo clínico de PROSPECTIVE» (texto) | Titular y entradilla del panel de marca | mantener | — | — | La entradilla ya dice que un administrador revisará la cuenta antes de dar acceso: el aviso llega antes de rellenar |
| «Acceso revisado · Datos cifrados · SKULLAPP» (texto) | Pie del panel de marca | corregir | confunde | F1 | «Datos cifrados» solo es cierto con el almacenamiento S3; en local la foto, el CV y la base van sin cifrar. Quitar la promesa |
| «← Volver al login» (botón) | Volver a «Entrar» | corregir | cosmético | F2 | Funciona, pero «login» es anglicismo y la pantalla de destino se titula «Iniciar sesión»; repite lo que hace «Cancelar» |
| «Tema claro» (botón) | Alternar tema | mantener | — | — | Igual que en «Entrar» |
| «Crear cuenta profesional» (texto) | Título y subtítulo «Regístrate para acceder a PROSPECTIVE.» | mantener | — | — | Claro |
| «Datos personales» (texto) | Encabezado del primer grupo del formulario | corregir | confunde | F1 | Aquí significa los datos del profesional que se registra; la portada usa la misma expresión en «Sin datos personales» para los pacientes. La misma frase con dos sentidos invita a pensar que la promesa de la portada se refiere a esto. Arreglo de texto: «Tus datos». Entra en el glosario de la Tarea 10 |
| «Nombre completo *» (campo) | Nombre del profesional, obligatorio | mantener | — | — | El marcador «Dr. …» orienta bien |
| «Cédula o ID» (campo) | Documento de identidad, opcional | corregir | cosmético | F2 | «Cédula» es término latinoamericano; en España se espera «DNI / NIE». No dice para qué se pide ni que es opcional |
| «Foto de perfil» (campo) | Foto opcional | mantener | — | — | El rótulo va en minúsculas y en negrita, distinto del resto en versalitas, sin más efecto |
| «Datos profesionales» (texto) | Encabezado del segundo grupo | mantener | — | — | Agrupa bien especialidad, centro y cargo |
| «ID profesional» (campo) | Identificador profesional, opcional | corregir | cosmético | F2 | Ambiguo: no dice si es el número de colegiado u otro registro |
| «Especialidad» (menú) | Especialidad, con siete opciones | mantener | — | — | Viene preseleccionada en «Neurocirugía»; quien no la toque queda registrado así, aceptable para el público principal |
| «Universidad» (campo) | Universidad, opcional | mantener | — | — | Sin problema |
| «Hospital / Centro» (campo) | Centro de trabajo, opcional | mantener | — | — | Sin problema |
| «Cargo» (menú) | Cargo, con nueve opciones | mantener | — | — | Preseleccionado en «Neurocirujano/a»; mismo comentario que «Especialidad» |
| «ORCID» (campo) | Identificador de investigador, opcional | corregir | cosmético | F2 | El marcador «0000-0002-1825-0097» parece un valor ya escrito, como el «admin» de «Entrar»; para un clínico es además un campo extraño sin explicación |
| «Currículum (CV)» (campo) | Adjuntar CV en PDF o Word, opcional | mantener | — | — | Útil al administrador que aprueba |
| «Credenciales de acceso» (texto) | Encabezado del tercer grupo | mantener | — | — | Claro; agrupa usuario y contraseña |
| «Usuario *» (campo) | Nombre de usuario, obligatorio | corregir | cosmético | F2 | La regla de 3 caracteres mínimos no se ve hasta enviar |
| «Contraseña *» (campo) | Contraseña, obligatoria | corregir | confunde | F1 | El mínimo de 8 caracteres no se dice hasta enviar, mientras que el cambio de contraseña lo pone en el rótulo («mín. 8»). Escribir «corta» con una confirmación distinta no muestra nada y el botón sigue activo (comprobado) |
| «Confirmar *» (campo) | Repetir la contraseña | corregir | cosmético | F2 | «Confirmar» a secas no dice qué; mejor «Repite la contraseña», como en el cambio forzado |
| «Tu cuenta quedará pendiente de aprobación hasta que un administrador la active.» (mensaje) | Aviso ámbar antes de enviar | corregir | confunde | F1 | Avisa de la espera pero no de cómo se sabrá el resultado. Texto propuesto: «Tu cuenta quedará pendiente de aprobación hasta que un administrador la active. No recibirás aviso: prueba a entrar más adelante o escribe a ingprospective@skullapp.tech.» |
| «Tu cuenta quedará pendiente…» sin dato de contacto (campo) | Recoger un correo o teléfono para avisar de la aprobación | corregir | confunde | F2 | Función nueva: el formulario no pide ningún correo ni teléfono, así que el administrador no puede avisar de la aprobación. Es la misma carencia que la fila del aviso verde de «Entrar», vista desde el registro |
| «Las contraseñas no coinciden.» (mensaje) | Errores de validación al enviar, con sus hermanos «El nombre completo es obligatorio.», «El usuario debe tener al menos 3 caracteres.» y «La contraseña debe tener al menos 8 caracteres.» | corregir | confunde | F1 | Leído en el código, sin enviar. Salen de uno en uno, abajo junto al botón y lejos del campo, sin marcar el campo culpable; quien rellena de arriba abajo corrige un error y encuentra el siguiente |
| «No se pudo enviar la solicitud. ¿Está el backend en marcha?» (mensaje) | Error cuando el servidor no responde | corregir | confunde | F1 | Leído en el código. Misma jerga que en «Entrar»; el 400 «El usuario 'x' ya existe.» sí es claro |
| «Cancelar» (botón) | Volver a «Entrar» | mantener | — | — | Descarta todo lo escrito sin preguntar (comprobado: al volver, el formulario está vacío). Con trece campos molesta, pero se rellena de nuevo en un par de minutos |
| «Enviar solicitud de registro» (botón) | Enviar el registro | mantener | — | — | No se pulsó. Queda por debajo del pliegue a 950 px de alto y siempre activo; el texto dice exactamente lo que hace. Según el código, tras enviar vuelve a «Entrar» con el aviso verde |
| «PROSPECTIVE™ Web · SkullApp — Laboratorio de Imagen Médica» (texto) | Pie del formulario | mantener | — | — | Firma institucional |

Atascos. El registro avisa dos veces de que la cuenta quedará pendiente, lo cual está bien, pero no pide ningún modo de contacto. Tras enviar, la persona vuelve a «Entrar» con un aviso que promete acceso «en cuanto sea aprobada», no recibirá ninguna noticia, y solo le queda probar a entrar de vez en cuando sin saber cuánto tarda la aprobación. Las reglas del usuario y de la contraseña se descubren al pulsar «Enviar», de una en una, en un mensaje pequeño junto al botón y lejos del campo. «Cédula», «ID profesional» y «ORCID» hacen dudar de qué se espera y de si son obligatorios; el asterisco lo resuelve solo para quien lo busque. Errores de consola: ninguno.

### Cambio forzado de contraseña

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|
| «Cambia la contraseña inicial» (texto) | Título de la pantalla que bloquea la aplicación | mantener | — | — | Leído en el código: no se pudo ver en el navegador porque la contraseña del administrador ya se cambió. Aparece cuando el servidor marca la cuenta con la contraseña de fábrica y no está activo `PROSPECTIVE_ALLOW_DEFAULT_ADMIN_PASSWORD`; sustituye a toda la aplicación |
| «La cuenta admin sigue con la contraseña con la que se creó, que es conocida. Hasta que la cambies no se puede usar la aplicación.» (texto) | Explicación del bloqueo | mantener | — | — | Dice por qué y qué pasa si no se cambia, con el nombre de la cuenta en negrita |
| «Contraseña actual» (campo) | Contraseña de fábrica que se acaba de escribir | mantener | — | — | Pedirla otra vez parece redundante, pero es la misma protección que el cambio voluntario |
| «Nueva contraseña (mín. 8)» (campo) | Contraseña nueva | mantener | — | — | La regla está en el rótulo, a diferencia de «Crear cuenta» |
| «Repite la nueva contraseña» (campo) | Confirmación | mantener | — | — | Rótulo claro |
| «Mínimo 8 caracteres.» (mensaje) | Validación en vivo, con sus hermanos «La nueva contraseña debe ser distinta de la actual.» y «Las dos contraseñas no coinciden.» | mantener | — | — | Aparecen mientras se escribe, antes de enviar; el botón se habilita solo cuando todo es válido |
| Error del servidor en el cambio (mensaje) | Mostrar por qué falló el cambio | corregir | confunde | F1 | «La contraseña actual no es correcta.» llega bien. Si la red falla se muestra el texto crudo del navegador, «Failed to fetch», en inglés, y un 500 sin detalle sale como «Error 500». Reutilizar el texto de «Entrar» para la falta de conexión |
| «Cambiar contraseña y continuar» (botón) | Guardar y entrar en la aplicación | mantener | — | — | Deshabilitado hasta que los tres campos son válidos; si solo falta «Contraseña actual» no hay mensaje, pero el campo vacío lo explica. Tras el cambio vuelve a pedir el usuario y abre la aplicación |
| «Cerrar sesión» (botón) | Salir sin cambiar la contraseña | mantener | — | — | Es la única salida: el cambio no se puede posponer, y la explicación lo dice |

Atascos. Leído en el código: la pantalla explica por qué aparece y qué hacer, valida en vivo y ofrece salir con «Cerrar sesión», así que no deja atascado a nadie que tenga la contraseña de fábrica a mano. El único momento de duda es un fallo de red durante el cambio, que muestra «Failed to fetch» en inglés sin decir si la contraseña se cambió o no. No se pudo recorrer en el navegador porque la cuenta `admin` ya no usa la contraseña de fábrica, y no se cambió para no tocar la cuenta del propietario.

## Gestión

### Pacientes
### Ficha del paciente
### Estudios
### Nuevo caso
### Usuarios
### Solicitudes
### Pedidos de clips
### Auditoría
### Talleres
### Menú de usuario y tema

## Espacio de trabajo

### Barra superior del espacio de trabajo
### Carril de pasos y ficha
### Barra del visor
### HUD y niveles
### Atajos
### Anotaciones
### Capturas y grabación

## Pasos

### Paso 1 · Carga DICOM
### Paso 2 · Segmentación
### Paso 3 · Detección
### Paso 4 · Morfometría
### Paso 5 · Decisión
### Paso 6 · Dispositivos
### Paso 7 · Fabricación
### Paso 8 · Informe
### Guardar y reanudar

## Segunda persona

### Usuario no administrador

## Recorrido del especialista

(se escribe en la Tarea 10)

## Eliminaciones y fusiones propuestas

(se escribe en la Tarea 10)

## Arreglos F1 propuestos

(se escribe en la Tarea 10)
