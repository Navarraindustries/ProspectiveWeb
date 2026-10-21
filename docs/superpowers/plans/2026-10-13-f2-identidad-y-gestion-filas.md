# F2 · identidad y gestión — anexo de filas

Extraído el 2026-10-13 de `docs/superpowers/audits/2026-10-10-auditoria-funcional.md`: (A) las 75 filas de la tabla principal con Destino = F2, numeradas F2-1…F2-75 en el orden del informe y agrupadas por pantalla; (B) las 32 filas de «Arreglos F1 propuestos» que el anexo de F1a dejó para F2 (conservan su número F1); (C) las eliminaciones y fusiones aprobadas que son de gestión (1–14 y 25); (D) los menores triados a F2 en la revisión final de F1a. **El texto de este anexo manda** sobre cualquier resumen del plan. Donde una fila cita un umbral o una cifra, el implementador la comprueba en el código antes de escribirla.


## A · Filas F2 de la tabla principal (75)


### Landing

- **F2-1** [cosmético · corregir] «clic para saltar» (panel)
  - Para qué: Vídeo de marca a pantalla completa antes de la portada
  - Hallazgo y cambio: Dura hasta 4,5 s y se salta con un clic o con cualquier tecla (el rótulo solo dice «clic»). Vuelve en cada pestaña nueva, porque la marca vive en `sessionStorage`, y también al entrar directo por `/app`. Para quien entra a diario es solo espera: debería verse una vez por navegador o nunca con sesión abierta; captura `t2-landing.jpeg`

- **F2-2** [cosmético · corregir] «Hybrid Neurovascular Planning · SKULLAPP» (texto)
  - Para qué: Lema del vídeo de entrada
  - Hallazgo y cambio: En inglés, y es el tercer lema distinto del producto junto a «Neurovascular AI» y «Plataforma de planificación neurovascular»; unificar en uno solo en español

- **F2-3** [cosmético · corregir] «PROSPECTIVE · Neurovascular AI» (texto)
  - Para qué: Marca en la barra fija
  - Hallazgo y cambio: «AI» promete inteligencia artificial que la detección, geométrica, no anuncia en ningún otro sitio. El logotipo no es clicable, lo que en una portada es aceptable; captura `t2-landing.jpeg`

- **F2-4** [cosmético · fusionar] «Iniciar sesión» (botón)
  - Para qué: Ir a la aplicación desde el titular
  - Hallazgo y cambio: Misma acción que «Entrar» y «Entrar a la plataforma» con tres nombres. Con sesión abierta no pide ninguna sesión: abre «Pacientes» (comprobado). Un solo rótulo para los tres

- **F2-5** [cosmético · corregir] «Ver el pipeline ↓» (botón)
  - Para qué: Bajar a la sección del vídeo explicativo
  - Hallazgo y cambio: Funciona (lleva a `#pipeline` y el vídeo arranca solo), pero «pipeline» es jerga de ingeniería; «Ver cómo funciona» lo diría a un cirujano

- **F2-6** [cosmético · corregir] «Sin instalar nada · Modelo 3D en el navegador · Medidas objetivas en milímetros» (texto)
  - Para qué: Tres argumentos bajo los botones
  - Hallazgo y cambio: «Sin instalar nada» se repite en la entradilla, aquí, en «Tres pasos, sin instalar nada» y en «Tecnología»; con una vez basta

- **F2-7** [cosmético · corregir] «Decisiones quirúrgicas con datos, no solo a ojo» (texto)
  - Para qué: Sección «Qué es» con definición de aneurisma y glosario de clipaje y endovascular
  - Hallazgo y cambio: Explica a un neurocirujano qué es un aneurisma «como un pequeño globo» y qué es un clip; el tono es de folleto para pacientes. Si la portada es para especialistas, sobra el glosario

- **F2-8** [cosmético · corregir] «Indicadores objetivos, respaldados por la literatura» (texto)
  - Para qué: Ocho tarjetas de índices con umbral y referencias
  - Hallazgo y cambio: Útiles para el especialista. Los umbrales usan punto decimal («≥ 2.0», «≥ 0.25») en una página en español y los nombres van en inglés sin traducir

- **F2-9** [cosmético · eliminar] «VTK · SimpleITK · pydicom · scipy · FastAPI · React · vtk.js · SQLite» (texto)
  - Para qué: Lista de librerías en «Tecnología»
  - Hallazgo y cambio: Nombres de librerías que no dicen nada a un cirujano; el párrafo de al lado ya explica que el cálculo va en el servidor


### Entrar

- **F2-10** [cosmético · eliminar] «VTK · SimpleITK · SKULLAPP» (texto)
  - Para qué: Pie del panel de marca
  - Hallazgo y cambio: Nombres de librerías sin significado para el cirujano, en el primer sitio donde mira cada día

- **F2-11** [confunde · corregir] Canal de aviso de la aprobación, en «Entrar» y en «Crear cuenta» (mensaje)
  - Para qué: Avisar a la persona cuando su cuenta se aprueba o se rechaza
  - Hallazgo y cambio: Función nueva y un solo juicio para las dos pantallas: el formulario de «Crear cuenta» no pide correo ni teléfono, y el servidor no envía notificaciones, así que hoy no hay forma de avisar. Pedir un dato de contacto en el registro y notificar la aprobación o el rechazo queda fuera de F1 por ser una función nueva. Sustituye a la fila gemela que había en «Crear cuenta»

- **F2-12** [cosmético · eliminar] «Preparando el espacio de trabajo…» (panel)
  - Para qué: Pantalla de carga con vídeo tras entrar
  - Hallazgo y cambio: Dura 2,65 s fijos y no espera a nada: la lista de pacientes ya está cargada debajo. El texto promete una preparación que no ocurre y se paga en cada inicio de sesión


### Crear cuenta

- **F2-13** [cosmético · corregir] «← Volver al login» (botón)
  - Para qué: Volver a «Entrar»
  - Hallazgo y cambio: Funciona, pero «login» es anglicismo y la pantalla de destino se titula «Iniciar sesión»; repite lo que hace «Cancelar»

- **F2-14** [cosmético · corregir] «Cédula o ID» (campo)
  - Para qué: Documento de identidad, opcional
  - Hallazgo y cambio: «Cédula» es término latinoamericano; en España se espera «DNI / NIE». No dice para qué se pide ni que es opcional

- **F2-15** [cosmético · corregir] «ID profesional» (campo)
  - Para qué: Identificador profesional, opcional
  - Hallazgo y cambio: Ambiguo: no dice si es el número de colegiado u otro registro

- **F2-16** [cosmético · corregir] «ORCID» (campo)
  - Para qué: Identificador de investigador, opcional
  - Hallazgo y cambio: El marcador «0000-0002-1825-0097» parece un valor ya escrito, como el «admin» de «Entrar»; para un clínico es además un campo extraño sin explicación

- **F2-17** [cosmético · corregir] «Confirmar *» (campo)
  - Para qué: Repetir la contraseña
  - Hallazgo y cambio: «Confirmar» a secas no dice qué; mejor «Repite la contraseña», como en el cambio forzado


### Pacientes

- **F2-18** [cosmético · corregir] «Buscar paciente o HC…» (campo)
  - Para qué: Filtrar la tabla por nombre o historia clínica
  - Hallazgo y cambio: Funciona sin distinguir mayúsculas: «segura» y «hc2345» encuentran al paciente, «basilar» da «Ningún paciente coincide con la búsqueda.» (comprobado). Está en la barra superior, en el borde derecho y lejos de la tabla, y no busca por diagnóstico, cosa que el buscador de «Estudios» sí hace. Los contadores no cambian al filtrar

- **F2-19** [cosmético · corregir] «Pacientes · 1 registros · ordenados por fecha de creación» (texto)
  - Para qué: Título y recuento de la lista
  - Hallazgo y cambio: «1 registros» sin concordancia. El orden por fecha de alta, confirmado en el servidor, sirve poco a quien vuelve cada día: espera ver arriba al paciente con el que trabajó por última vez

- **F2-20** [cosmético · corregir] «Usuarios» (botón)
  - Para qué: Ir a la gestión de usuarios, solo administrador
  - Hallazgo y cambio: Funciona, pero es una acción de administración mezclada con las clínicas y es el único acceso a «Usuarios»: el menú de usuario ofrece «Solicitudes de registro» y «Auditoría», pero no «Usuarios»

- **F2-21** [cosmético · fusionar] «Solicitudes» (botón)
  - Para qué: Ir a las solicitudes de registro pendientes, solo administrador
  - Hallazgo y cambio: Repite la entrada «Solicitudes de registro» del menú de usuario con otro nombre; las dos llevan la misma insignia roja. Un solo sitio para la administración. El nombre se corrige antes, en F1, a «Cuentas pendientes»: ver la fila del título de «Solicitudes»

- **F2-22** [confunde · corregir] «Nuevo caso» (botón)
  - Para qué: Elegir paciente y abrir el formulario del caso
  - Hallazgo y cambio: Es el nombre correcto para lo que crea, y el selector previo evita duplicar pacientes. Pero, leído en el código, tras «Crear estudio» vuelve a la lista sin abrir el caso ni ofrecer «Planificar este caso»: hay que abrir la ficha y buscarlo. Quien acaba de crear un caso espera empezar a trabajar en él

- **F2-23** [cosmético · corregir] Cuatro contadores de cabecera (panel)
  - Para qué: «Pacientes registrados», «Estudios DICOM», «Con estudios» y «Sin estudios»
  - Hallazgo y cambio: El panel se queda: con los rótulos corregidos en F1, que se proponen en las dos filas siguientes, deja de mentir sin coste. Hoy apoya poco la decisión, porque «Pacientes registrados» repite el recuento del título. Qué contar es parte del rediseño de la gestión: un especialista preferiría ver casos abiertos, sesiones a medias o pedidos pendientes, y eso va a F2

- **F2-24** [confunde · corregir] «Paciente · HC · Sexo / Nac. · Institución · Estudios · Creado · Acciones» (texto)
  - Para qué: Columnas de la tabla
  - Hallazgo y cambio: Pregunta obligatoria: desde la lista no se sabe cuál es el caso activo ni en qué paso quedó, y no hay forma de reanudar en un clic. Faltan «Último caso» y «Última sesión, paso y fecha» con su «Reanudar». Tampoco se ve la edad, que el especialista usa para el riesgo de rotura. Son columnas nuevas, F2; el cambio de nombre de la columna «Estudios» tiene fila propia en F1


### Ficha del paciente

- **F2-25** [cosmético · corregir] «Fecha de nacimiento» (campo)
  - Para qué: Fecha de nacimiento, opcional
  - Hallazgo y cambio: La ficha la muestra como 16/09/1999 y la lista como 1999-09-16. No se muestra la edad en ninguna parte de la gestión

- **F2-26** [cosmético · corregir] «Notas» (campo)
  - Para qué: Notas clínicas libres
  - Hallazgo y cambio: Es una línea de texto, no un área: una nota clínica de varias frases no se puede leer entera

- **F2-27** [confunde · corregir] «Pedidos» (botón)
  - Para qué: Ir a los pedidos de clips de este paciente
  - Hallazgo y cambio: Lleva a «Pedidos de clips» filtrado por «segura, Juan» (comprobado), pero cierra la ficha, y esa pantalla no tiene miga de pan ni camino de vuelta al paciente: solo «Ver todos». Además el icono es el engranaje de ajustes; captura `t3-ficha-pedidos.jpeg`

- **F2-28** [cosmético · corregir] «Editar estudio» (botón)
  - Para qué: Editar los datos del caso
  - Hallazgo y cambio: Leído en el código. El tooltip dice «estudio» y abre «Editar caso / estudio»; mismo problema de nombres que «Nuevo estudio»

- **F2-29** [confunde · corregir] «Planificar este caso» (botón)
  - Para qué: Entrar al flujo con paciente y caso ya fijados
  - Hallazgo y cambio: Leído en el código. Es el camino bueno, porque el Paso 1 ya sabe a qué caso archivar el DICOM, pero vive dentro de cada tarjeta de caso, al fondo de la ficha. Para la persona es el botón principal y no se ve desde la lista

- **F2-30** [confunde · corregir] Línea de sesión guardada (panel)
  - Para qué: Una tarjeta por sesión: etiqueta, fecha y hora, paso, diámetro y riesgo
  - Hallazgo y cambio: Cinco de las seis dicen lo mismo, «segura, Juan · Detección · Alto · Ø 9.6 mm», y solo cambia la hora. La etiqueta repite el nombre del paciente, que ya se sabe, y el paso dos veces. No dice qué estudio o serie se cargó, qué candidato se eligió ni si hay medida, decisión o clip. La persona no sabe cuál reanudar y elegirá la más reciente por intuición; tampoco puede renombrar ni borrar las repetidas. El diámetro va con punto decimal

- **F2-31** [confunde · corregir] «Guardar cambios» (botón)
  - Para qué: Guardar los datos del paciente
  - Hallazgo y cambio: Guarda solo los campos del paciente, no los casos ni las sesiones, que tienen sus propios botones. Está al final de un panel que mide casi el doble de la pantalla, debajo de las sesiones y las capturas: quien edita los antecedentes arriba no lo ve. Apagado si «Apellidos» está vacío, sin decirlo


### Estudios

- **F2-32** [cosmético · fusionar] «Pacientes» (botón)
  - Para qué: Volver a la lista con icono de casa
  - Hallazgo y cambio: Repite la miga de pan y el logotipo: tres formas de ir al mismo sitio en la misma barra

- **F2-33** [cosmético · corregir] «Buscar por paciente, cédula o diagnóstico…» (campo)
  - Para qué: Buscar en el servidor por paciente, documento o diagnóstico
  - Hallazgo y cambio: Leído en el código: busca en el servidor, con espera de 280 ms. «Cédula» aquí y «HC» o «N.º de historia» en el resto de la aplicación para el mismo dato. Sin estudios no se pudo probar con resultados

- **F2-34** [cosmético · corregir] Tarjeta de estudio (panel)
  - Para qué: Miniatura, paciente, historia, descripción, modalidad, cortes, riesgo y «Último paso»
  - Hallazgo y cambio: Leída en el código, no vista porque no hay estudios archivados. Bien pensada: enseña el progreso y prioriza reanudar. No enlaza con la ficha del paciente ni permite borrar el estudio desde aquí

- **F2-35** [cosmético · corregir] «De cero» (botón)
  - Para qué: Empezar una sesión nueva desde el Paso 1
  - Hallazgo y cambio: Leído en el código. «De cero» se entiende solo con el tooltip; no dice que la sesión anterior se conserva. «Nueva sesión» lo diría


### Nuevo caso

- **F2-36** [confunde · corregir] «+ Nuevo paciente» (botón)
  - Para qué: Crear el paciente si no existe, con su hermano «Crear el primer paciente»
  - Hallazgo y cambio: Leído en el código: abre el alta de paciente, pero al guardarlo vuelve a la lista sin seguir con el caso. Hay que pulsar «Nuevo caso» y elegirlo de nuevo

- **F2-37** [cosmético · corregir] «Síntomas positivos» (campo)
  - Para qué: Clínica actual en texto libre
  - Hallazgo y cambio: «Síntomas positivos» no es una expresión habitual; «Clínica» o «Síntomas» basta

- **F2-38** [cosmético · corregir] «Diagnóstico principal *» (campo)
  - Para qué: Diagnóstico, único dato obligatorio
  - Hallazgo y cambio: Es además el nombre del caso en toda la aplicación: tarjeta, miga de pan y «Adjuntar a un caso». Nada lo dice, y el ejemplo repite el rótulo. Sugerir el formato: «Aneurisma basilar sacular»

- **F2-39** [confunde · corregir] «Tipo de aneurisma» (menú)
  - Para qué: Morfología o tamaño, con nueve opciones
  - Hallazgo y cambio: Mezcla en una sola lista morfología («Sacular», «Fusiforme», «Disecante», «Blíster») y tamaño («Gigante (> 25 mm)», «Grande (10-25 mm)», «Pequeño (< 10 mm)»): un aneurisma sacular pequeño no se puede registrar como tal. Además el tamaño lo mide «Morfometría». Separar morfología de tamaño, o quitar el tamaño

- **F2-40** [cosmético · corregir] «Imágenes diagnósticas» (campo)
  - Para qué: Casillas TAC, angiografía, resonancia y panangiografía, con la nota «El DICOM se carga en el paso 1 del pipeline al abrir el caso.»
  - Hallazgo y cambio: Son solo declarativas: no se enlazan con el DICOM que se cargue. «Angiografía» y «Panangiografía» se solapan. La nota usa «pipeline» y «abrir el caso», cuando el botón real se llama «Planificar este caso»

- **F2-41** [cosmético · corregir] «El diagnóstico principal es obligatorio.» (mensaje)
  - Para qué: Validación al enviar
  - Hallazgo y cambio: Leído en el código, sin enviar. Sale al fondo, junto al botón, sin marcar el campo, que está arriba del todo; el asterisco ya avisa


### Usuarios

- **F2-42** [cosmético · corregir] «Pacientes / Administración / Usuarios» (botón)
  - Para qué: Miga de pan de la página
  - Hallazgo y cambio: «Pacientes» navega; «Administración» es texto sin destino, porque no existe ninguna página de administración que reúna «Usuarios», «Solicitudes» y «Auditoría». La miga promete un sitio que no hay; captura `t4-usuarios.jpeg`

- **F2-43** [cosmético · fusionar] «Pacientes» (botón)
  - Para qué: Volver a la lista con icono de casa
  - Hallazgo y cambio: Tercera forma de ir al mismo sitio en la misma barra, junto a la miga y el logotipo, igual que en «Estudios»

- **F2-44** [cosmético · corregir] «Administrador» (texto)
  - Para qué: Insignia de rol en la tabla
  - Hallazgo y cambio: El rol de administrador va en rojo, el color de error y de borrar en el resto de la aplicación; se lee como alarma

- **F2-45** [cosmético · corregir] «Editar» (botón)
  - Para qué: Abrir «Editar usuario» con nombre, rol y «Cuenta activa»
  - Hallazgo y cambio: Abre y cierra bien con «Cancelar» (comprobado). Solo deja cambiar nombre, rol y estado: especialidad, hospital, foto y cargo, que el alta sí pide, no se pueden corregir después; captura `t4-usuarios-editar.jpeg`

- **F2-46** [confunde · corregir] «✕» (botón)
  - Para qué: Eliminar la cuenta, tooltip «Eliminar»
  - Hallazgo y cambio: No se pulsó. El diálogo nombra la cuenta y avisa de que «Sus pacientes se conservarán pero quedarán sin propietario». No hay forma de reasignarlos: según la regla de acceso del servidor, solo un administrador volverá a verlos. Reasignar pacientes es función nueva

- **F2-47** [cosmético · corregir] «Datos personales · Datos profesionales» (panel)
  - Para qué: Grupos de campos del alta
  - Hallazgo y cambio: Es el formulario del registro entero, trece campos, cuando para dar de alta a un colega bastan nombre, usuario, rol y contraseña. «Especialidad» y «Cargo» vienen preseleccionados, y la cuenta queda como «Neurocirugía» sin que nadie lo eligiera

- **F2-48** [cosmético · corregir] «El nombre completo es obligatorio.» (mensaje)
  - Para qué: Errores de validación del alta, con sus tres hermanos de «Crear cuenta»
  - Hallazgo y cambio: Leído en el código. Los mismos cuatro mensajes que «Crear cuenta», de uno en uno y al pie; para un administrador molesta menos que para quien se registra


### Solicitudes

- **F2-49** [cosmético · corregir] «Pacientes / Administración / Solicitudes» (botón)
  - Para qué: Miga de pan
  - Hallazgo y cambio: «Administración» es texto sin destino, como en «Usuarios»; captura `t4-solicitudes.jpeg`

- **F2-50** [cosmético · fusionar] «Pacientes» (botón)
  - Para qué: Volver con icono de casa
  - Hallazgo y cambio: Repite la miga y el logotipo

- **F2-51** [cosmético · corregir] «No hay solicitudes pendientes.» (mensaje)
  - Para qué: Lista vacía
  - Hallazgo y cambio: Lo que se aprueba o se rechaza desaparece sin historial. Una rechazada solo vuelve a verse en «Usuarios», como «Inactivo»


### Pedidos de clips

- **F2-52** [confunde · corregir] Barra superior sin miga de pan (panel)
  - Para qué: Orientación y vuelta
  - Hallazgo y cambio: A diferencia de «Usuarios» o «Auditoría», no hay miga ni botón «Pacientes»: solo el logotipo vuelve. Llegando desde la ficha del paciente no hay camino de vuelta a ella; captura `t4-pedidos.jpeg`

- **F2-53** [cosmético · corregir] «No hay pedidos que encajen con este filtro. Los pedidos se crean en el paso Fabricación de un caso.» (mensaje)
  - Para qué: Lista vacía
  - Hallazgo y cambio: Habla de «este filtro» aunque no exista ningún pedido. La segunda frase sí orienta, pero desde aquí no se llega a ningún caso

- **F2-54** [cosmético · corregir] «Detalle» (panel)
  - Para qué: Paciente, caso, pieza, cirujano, taller, fecha necesaria y uso previsto
  - Hallazgo y cambio: Leído en el código. Completo y con «sin firmar» o «por asignar» cuando falta algo, pero sin enlace al caso ni a la sesión que generó el pedido


### Auditoría

- **F2-55** [cosmético · corregir] «Pacientes / Auditoría · SkullChain» (botón)
  - Para qué: Miga de pan
  - Hallazgo y cambio: Aquí no hay segmento «Administración», a diferencia de «Usuarios» y «Solicitudes», aunque la página es igual de administrativa; captura `t4-auditoria.jpeg`

- **F2-56** [cosmético · fusionar] «Pacientes» (botón)
  - Para qué: Volver a la lista con icono de casa
  - Hallazgo y cambio: Leído en el código (`AuditTrail.tsx:73`). Repite la miga y el logotipo, igual que en «Usuarios» y «Solicitudes»

- **F2-57** [cosmético · corregir] «Registro de auditoría — SkullChain» (texto)
  - Para qué: Título y «Cadena de bloques con hash SHA-256; alterar un bloque invalida todos los siguientes.»
  - Hallazgo y cambio: Pregunta obligatoria: es una página para el administrador o el responsable de cumplimiento, no para el cirujano, y está bien que el menú solo se la muestre al administrador. «SkullChain», «hash» y «SHA-256» son jerga; bastaría «Registro de actividad, a prueba de manipulación»

- **F2-58** [cosmético · corregir] «Exportar TXT →» (botón)
  - Para qué: Bajar el registro en texto
  - Hallazgo y cambio: Solo aparece después de verificar, así que para exportar hay que escribir antes un bloque. La descarga funciona con la sesión (comprobado: responde 200), y su cabecera va en inglés, «SkullChain Audit Trail Export»

- **F2-59** [confunde · corregir] «Buscar» (campo)
  - Para qué: Buscar por usuario, acción, hash o fecha
  - Hallazgo y cambio: «segura» da «Ningún bloque coincide con el filtro.» (comprobado): el paciente se guarda como huella y no se puede buscar. La pregunta típica, quién tocó a este paciente, no tiene respuesta. Buscar por paciente exige que el servidor calcule su huella

- **F2-60** [confunde · corregir] «Usuario · Acción · Hash bloque» (texto)
  - Para qué: Resto de columnas
  - Hallazgo y cambio: El servidor envía el detalle de cada evento, pero la tabla no lo muestra ni deja abrir la fila: se sabe que hubo un «TREATMENT_DECISION», no cuál. La columna «Hash bloque» no dice nada a una persona. «Usuario» muestra «admin» en unos bloques y «Administrador» en otros para la misma cuenta


### Talleres

- **F2-61** [confunde · corregir] Barra superior sin miga de pan (panel)
  - Para qué: Orientación y vuelta
  - Hallazgo y cambio: Como en «Pedidos de clips», solo el logotipo vuelve; captura `t4-talleres.jpeg`

- **F2-62** [cosmético · corregir] «Talleres» (texto)
  - Para qué: Título y «Quién fabrica las piezas. Se escriben una vez y se eligen en cada pedido.»
  - Hallazgo y cambio: El título y el subtítulo son claros; lo que falla es el sitio. Pregunta obligatoria: no es una página de administración. Leído en el código: cualquier usuario puede dar de alta y corregir talleres, y solo el administrador borra. La usa quien pide piezas, así que debería vivir junto a «Pedidos de clips» y no en el menú personal, como dice también la fila de su entrada en el menú

- **F2-63** [cosmético · corregir] «Nombre» (campo)
  - Para qué: Nombre del taller, único obligatorio
  - Hallazgo y cambio: El panel se abre con el campo ya en rojo y la ayuda «Como aparecerá en el desplegable al pedir una pieza.» también en rojo, antes de escribir nada: parece un error; captura `t4-talleres-nuevo.jpeg`

- **F2-64** [cosmético · fusionar] «Los pedidos ya cursados guardan su propia copia de estos datos…» (texto)
  - Para qué: Aviso del formulario
  - Hallazgo y cambio: Lo mismo se dice tres veces: aquí, en «Cómo se usa» y en el diálogo de borrar. Con una vez, en «Cómo se usa», basta


### Menú de usuario y tema

- **F2-65** [confunde · corregir] «A admin ▾» (botón)
  - Para qué: Abrir el menú de usuario, tooltip «Menú de usuario»
  - Hallazgo y cambio: Está arriba a la derecha en todas las pantallas de gestión. Muestra el nombre de usuario, no el nombre completo, ni el rol ni la institución; captura `t4-menu-usuario.jpeg`

- **F2-66** [cosmético · corregir] «Pedidos de clips» (botón)
  - Para qué: Ir al registro de pedidos, para todos los roles
  - Hallazgo y cambio: Funciona (comprobado), pero su icono es el engranaje de ajustes. Arrastra el filtro de paciente: ver la fila del filtro en «Pedidos de clips»

- **F2-67** [cosmético · corregir] «Talleres» (botón)
  - Para qué: Ir al directorio de talleres, para todos los roles
  - Hallazgo y cambio: Lleva el icono de clip, mientras «Pedidos de clips» lleva el engranaje. Debería vivir junto a «Pedidos de clips», no en el menú personal

- **F2-68** [cosmético · fusionar] «Solicitudes de registro» (botón)
  - Para qué: Ir a cuentas pendientes, solo administrador
  - Hallazgo y cambio: Repite el botón «Solicitudes» de «Pacientes» con otro nombre. La fusión de los dos accesos es F2; el nombre se corrige antes, en F1, a «Cuentas pendientes»: ver la fila del título de «Solicitudes»

- **F2-69** [cosmético · corregir] «Auditoría (SkullChain)» (botón)
  - Para qué: Ir al registro de auditoría, solo administrador
  - Hallazgo y cambio: Es el único acceso a «Auditoría». La marca «SkullChain» no dice nada a la persona

- **F2-70** [confunde · corregir] «Usuarios» (botón)
  - Para qué: Ausente: acceso a la gestión de usuarios desde el menú
  - Hallazgo y cambio: El menú tiene «Solicitudes de registro» y «Auditoría», pero no «Usuarios», que solo está en «Pacientes». Las tres páginas de administración tienen tres puertas distintas

- **F2-71** [cosmético · corregir] «Cambiar contraseña» (botón)
  - Para qué: Abrir el cambio de contraseña
  - Hallazgo y cambio: Abre su panel y se cierra con Escape (comprobado). El texto «Tu sesión seguirá abierta: el token va firmado sobre tu usuario, no sobre la contraseña.» es jerga. Lleva el mismo candado que «Cerrar sesión»


### Paso 1 · Carga DICOM

- **F2-72** [confunde · corregir] Entrada al paso desde la ficha del paciente (botón)
  - Para qué: Empezar a cargar el estudio de un paciente
  - Hallazgo y cambio: La ficha no tiene ningún botón para subir un DICOM: «Nuevo estudio» abre el formulario de un caso, sin adjuntar archivos. La única entrada con paciente es pulsar su fila en la lista, que abre una sesión vacía sin decirlo. Quien quiere «cargar la 3DRA de este paciente» la busca en la ficha. Añadir «Cargar estudio» en la ficha; véase la fila del paciente en «Pacientes»


### Guardar y reanudar

- **F2-73** [cosmético · corregir] Tamaño de cada guardado (texto)
  - Para qué: Lo que ocupa
  - Hallazgo y cambio: Cada guardado es una copia completa: 349 927 KB, unos 342 MB, y este paciente ya tiene siete. La ficha no enseña el tamaño ni deja borrar las viejas

- **F2-74** [confunde · corregir] «Sesiones de estudio (7)» (panel)
  - Para qué: Elegir qué reanudar
  - Hallazgo y cambio: Cinco entradas se llaman «segura, Juan · Detección» y solo las distingue la hora. Se esperaba poder renombrarlas o borrarlas


### Usuario no administrador

- **F2-75** [confunde · corregir] Visibilidad por creador (panel)
  - Para qué: Quién ve a qué paciente
  - Hallazgo y cambio: Leído en el código: un no administrador solo ve los pacientes que él creó, sin forma de compartirlos ni de asignarlos. En práctica híbrida el caso lo abre a menudo otro (radiología, residente) y el cirujano no lo encuentra. Decidir el modelo de equipo con la identidad nueva


## B · Filas de «Arreglos F1 propuestos» dejadas para F2 (32, con su número F1)


- F1-35 [confunde] Landing · «Suite clínica activa» (texto) — Condicionado a la decisión nº 1. Quitar el piloto «Suite clínica activa»
- F1-36 [confunde] Landing · «Cuello, altura máxima y cizallamiento de pared» (texto) — Pie de figura «Cuello, altura máxima y forma del saco», sin «cizallamiento de pared»
- F1-37 [confunde] Landing · «Sin datos personales» (texto) — Texto nuevo: «Puedes registrar al paciente con iniciales o un código»; quitar «sin datos del paciente» del pie vecino
- F1-38 [confunde] Landing · «Entrar a la plataforma» (botón) — Condicionado a la decisión nº 4. Rotular «Entrar» y añadir al lado «Crear cuenta», que navega a `/app/registro`
- F1-39 [confunde] Entrar · «Usuario» (campo) — Quitar el marcador «admin»; poner «tu usuario»
- F1-44 [confunde] Crear cuenta · «Acceso revisado · Datos cifrados · SKULLAPP» (texto) — Pie del panel: «Acceso revisado · SKULLAPP», sin «Datos cifrados»
- F1-45 [confunde] Crear cuenta · «Datos personales» (texto) — Encabezado «Tus datos»
- F1-46 [confunde] Crear cuenta · «Usuario *» (campo) — Rótulo «Usuario * (mín. 3)»
- F1-47 [confunde] Crear cuenta · «Contraseña *» (campo) — Rótulo «Contraseña * (mín. 8)» y aviso en vivo si es corta o no coincide
- F1-49 [confunde] Crear cuenta · «Las contraseñas no coinciden.» (mensaje) — Mostrar todos los errores a la vez, cada uno junto a su campo, con el campo marcado
- F1-52 [confunde] Pacientes · «Empezar sin paciente» (botón) — Tooltip: «Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.»
- F1-56 [confunde] Pacientes · Fila del paciente (botón) — El clic en la fila abre la ficha, como «Editar»; la fila es un control de teclado
- F1-57 [confunde] Pacientes · «Editar» (botón) — Condicionado a la decisión nº 8. Fusionar con el clic en la fila; el botón restante se rotula «Abrir ficha»
- F1-59 [confunde] Ficha del paciente · «Editar paciente» (texto) — Título de la ficha: el nombre del paciente, o «Ficha del paciente»
- F1-61 [confunde] Ficha del paciente · «Apellidos» (campo) — Línea bajo el campo: «Puedes usar iniciales o un código en lugar del nombre real»
- F1-62 [confunde] Ficha del paciente · «Sexo» (menú) — El menú arranca en «— sin dato —», se guarda vacío y un guardado sin sexo muestra «— sin dato —»
- F1-63 [confunde] Ficha del paciente · «Antecedentes · Patológicos · Toxicológicos · Quirúrgicos · Alérgicos · Farmacológicos» (campo) — Línea bajo «Antecedentes»: «Solo para consulta: no entran en el cálculo de riesgo ni en el informe.»
- F1-69 [confunde] Ficha del paciente · «Reanudar en «Detección»» (botón) — Tooltip con lo que se restaura y que tarda unos segundos; icono de reanudar
- F1-72 [confunde] Ficha del paciente · Error al cargar la ficha (mensaje) — Mostrar el error de la recarga de casos, que hoy se traga
- F1-73 [confunde] Estudios · «Estudios · Estudios cargados y archivados · haz clic en uno para abrirlo» (texto) — «Estudios de imagen archivados · pulsa uno para reanudarlo o abrirlo»
- F1-74 [confunde] Estudios · «Aún no hay estudios archivados. Carga un DICOM en el pipeline y pulsa «Guardar estudio».» (mensaje) — «…abre un caso con «Planificar este caso», carga el DICOM y pulsa «Guardar estudio» en el Paso 1.», sin «pipeline»
- F1-78 [confunde] Nuevo caso · «Región anatómica» (menú) — Añadir vertebral, cerebelosa superior, AICA y pericallosa a la lista
- F1-79 [confunde] Nuevo caso · «Tratamiento propuesto» (campo) — Añadir «Embolización con coils», «Stent + coils», «Diversor de flujo» y «Observación»
- F1-82 [confunde] Usuarios · «Usuario · Rol · Especialidad / Hospital · Estado · Creado · Acciones» (texto) — La columna «Estado» muestra «Activo», «Pendiente», «Rechazada» o «Desactivada» según el estado que ya envía el servidor
- F1-84 [confunde] Usuarios · «Cuenta activa (puede iniciar sesión)» (campo) — Enviar `is_active` solo si la casilla cambia
- F1-90 [confunde] Solicitudes · «Aprobar» (botón) — Línea en la tarjeta: «Entrará como Médico; cambia el rol en Usuarios»
- F1-94 [confunde] Pedidos de clips · «Filtrado por segura, Juan · Ver todos» (panel) — La entrada del menú limpia el filtro de paciente
- F1-95 [confunde] Pedidos de clips · «Todos · Borrador · Firmado · Enviado al taller · En fabricación · Recibida · Verificada · Rechazada» (botón) — Recuentos de los chips sobre la lista filtrada; «Todos» con recuento
- F1-96 [confunde] Pedidos de clips · «Solo los abiertos» (campo) — Desmarcar la casilla al elegir «Verificada» o «Rechazada»
- F1-100 [confunde] Auditoría · «Acción» (menú) — Rótulos de acción en castellano, «password_change» incluido
- F1-102 [confunde] Auditoría · Eventos de cuentas (texto) — Registrar altas, aprobaciones, rechazos, cambios de rol y borrados de cuentas
- F1-105 [confunde] Menú de usuario y tema · Insignia roja de solicitudes (texto) — Pedir el recuento de cuentas pendientes al cargar la página, no al abrir el menú


## C · Eliminaciones y fusiones aprobadas que entran en F2

- **Fusión nº 1.** **«Suite clínica activa»**, en «Landing» (eliminar). Motivo: parece un indicador de que el servidor está en marcha y no mide nada. Lo sustituye: nada.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 2.** **«Iniciar sesión»**, en «Landing» (fusionar). Motivo: hace lo mismo que «Entrar» y «Entrar a la plataforma» con otro nombre. Lo sustituye: un solo rótulo, «Entrar», para los tres botones.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 3.** **«VTK · SimpleITK · pydicom · scipy · FastAPI · React · vtk.js · SQLite»**, en «Landing» (eliminar). Motivo: nombres de librerías que no dicen nada a un cirujano. Lo sustituye: nada; el párrafo vecino ya explica que el cálculo va en el servidor.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 4.** **«Entrar a la plataforma»**, en «Landing» (fusionar). Motivo: un tercer nombre para entrar, junto a un texto que invita a registrarse. Lo sustituye: «Entrar», como el botón de la barra, y al lado un botón «Crear cuenta».
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 5.** **«VTK · SimpleITK · SKULLAPP»**, en «Entrar» (eliminar). Motivo: nombres de librerías en el primer sitio donde el cirujano mira cada día. Lo sustituye: nada.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 6.** **«Preparando el espacio de trabajo…»**, en «Entrar» (eliminar). Motivo: dura 2,65 s fijos y no espera a nada. Lo sustituye: nada; se llega directo a «Pacientes».
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 7.** **«Solicitudes»**, en «Pacientes» (fusionar). Motivo: repite con otro nombre la entrada «Solicitudes de registro» del menú. Lo sustituye: un solo acceso, «Cuentas pendientes», en la zona de administración.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 8.** **«Editar»**, en «Pacientes» (fusionar). Motivo: es la única puerta a la ficha y se anuncia como una edición. Lo sustituye: el clic en la fila, que abre la ficha, y el botón rotulado «Abrir ficha».
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 9.** **«Nuevo estudio»**, en «Ficha del paciente» (fusionar). Motivo: crea lo mismo que «Nuevo caso» de la lista, con el mismo formulario. Lo sustituye: «Nuevo caso».
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 10.** **«Pacientes»**, botón con icono de casa en «Estudios» (fusionar). Motivo: tercera forma de ir a la lista en la misma barra, con la miga y el logotipo. Lo sustituye: la miga de pan y el logotipo.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 11.** **«Pacientes»**, botón con icono de casa en «Usuarios» (fusionar). Motivo: el mismo triple camino que en «Estudios». Lo sustituye: la miga de pan y el logotipo.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 12.** **«Pacientes»**, botón con icono de casa en «Solicitudes» (fusionar). Motivo: el mismo triple camino. Lo sustituye: la miga de pan y el logotipo.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 13.** **«Los pedidos ya cursados guardan su propia copia de estos datos…»**, en «Talleres» (fusionar). Motivo: lo mismo se dice tres veces en la página. Lo sustituye: el texto de «Cómo se usa», una sola vez.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 14.** **«Solicitudes de registro»**, en «Menú de usuario y tema» (fusionar). Motivo: el gemelo del botón «Solicitudes» de «Pacientes», con otro nombre. Lo sustituye: el acceso único «Cuentas pendientes» de la entrada 7.
Decisión del propietario: aprobada (2026-10-11).

- **Fusión nº 25.** **«Pacientes»**, botón con icono de casa en «Auditoría» (fusionar). Motivo: el mismo triple camino que en «Estudios», «Usuarios» y «Solicitudes». Lo sustituye: la miga de pan y el logotipo.
Decisión del propietario: aprobada (2026-10-11).


## D · Menores triados a F2 en la revisión final de F1a

- **F2-T1** Ficha del paciente: el diálogo se titula «Editar paciente» también cuando solo se consulta y cuando dice «No autorizado sobre este paciente» (`frontend/src/pages/Patients.tsx`, `PatientSheet`). Cambio: título con el nombre del paciente y rótulo «Ficha de paciente»; con 403, «Paciente no autorizado».
- **F2-T2** `frontend/src/pages/Landing.tsx` lleva la dirección de contacto escrita a mano. Cambio: leerla de `lib/contacto.ts` (`CONTACTO_ADMIN`).
- **F2-T3** La hoja «Editar usuario» muestra la línea del rol (`lib/roles.ts`) sin prueba. Cambio: Vitest en `UsersAdmin.test.tsx` que la comprueba para los tres roles.
- **F2-T4** «Crear cuenta»: textos de campos y ayudas (ver F2 de «Crear cuenta»); se rehacen con la pantalla.
- **F2-T5** Título de caso con «Estudio» de respaldo cuando el caso no tiene diagnóstico (`Patients.tsx`, tarjeta de caso). Cambio: «Caso sin diagnóstico» y el formulario exige el diagnóstico.
- **F2-T6** `PendingRequests.tsx` vacío «No hay solicitudes pendientes.» y `lib/roles.ts:19` línea del administrador con «solicitudes». Cambio: «No hay cuentas pendientes.» y «cuentas pendientes» en la línea del rol; la guarda `copy.glosario.test.ts` rastrea también `lib/` y `components/shell/`.
