# Auditoría visual de Prospective — 01-11-2026

Revisión en el navegador, solo lectura: no se envió, guardó ni borró nada. La única excepción es el paso 4 del caso 015: al pulsarlo se calculó la morfometría automática, y ese resultado se descartó al salir; la sesión guardada no se tocó.

**Condiciones de la prueba**
- Chrome del usuario con zoom al 80 % (DPR 0,8). La ventana de 1366 px físicos da un viewport CSS de **1707×743**. Eso es lo que el usuario ve a diario.
- Los anchos de 1024 y 390 px se probaron con iframes del mismo origen, porque la ventana está maximizada y `resize_window` no la achica.
- La landing está anclada en oscuro (`data-theme="dark"`, `Landing.tsx:285`), así que no tiene versión clara.
- Login y Crear cuenta redirigen cuando hay sesión abierta. Se revisaron por código y con la captura del usuario.

**Severidad**
- **Alta:** se ve roto, tapa información o impide usar algo.
- **Media:** incoherente con el estilo D o hace trabajar de más.
- **Baja:** pulido.

---

## 1. Landing (`pages/Landing.tsx`, `styles/landing.css`, `components/landing/*`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A1 | alta | todas | Los enlaces de la nav (#que-es, #como-funciona, #indices, #dispositivos) saltan de golpe. `scroll-behavior` es `auto` y no hay animación. | landing.css, NavPildora.tsx | Desplazamiento suave con `motion`: interpolar `scrollY` unos 600 ms con *ease-out-quint* y compensar la altura de la píldora con `scroll-margin-top`. Con `prefers-reduced-motion`, salto directo. |
| A2 | alta | todas | No hay ninguna animación de entrada. No se usa IntersectionObserver ni `whileInView` en ninguna sección: todo aparece estático bajo el hero. | Landing.tsx | Revelado por sección con `motion` `whileInView`: fade + translateY de 16 px y escalonado de 60 ms en las tarjetas. Respetar el movimiento reducido. |
| A3 | media | todas | La nav no marca en qué sección estás (sin *scroll-spy*). | NavPildora.tsx | IntersectionObserver por sección, y el enlace activo con una píldora deslizante (`layoutId`). |
| A4 | alta | 1707 | «Qué es» son dos columnas de texto sin ningún visual (455 px). Se ve plano. | Landing.tsx §que-es | Al lado del texto, un visual del producto: captura del quirófano D en un marco de cristal, o un vídeo corto en bucle con `/media/pipeline-hf.mp4`. Puede ser también el render de Case 3, que ya irá en el hero. |
| A5 | alta | 1707 | «Cómo funciona» son 8 tarjetas con número, título y subtítulo, sin icono, sin imagen y sin conexión entre pasos. | Landing.tsx §como-funciona | Usar el icono de cada paso (`Icon STEP_*` ya existe) y una línea de progreso que los una y se «encienda» al hacer scroll. Una miniatura o vídeo del paso al pasar el ratón, o una pista horizontal fijada (*sticky*) que avance paso a paso. |
| A6 | alta | 1707 | «Funcionalidades» es una lista de 9 títulos con raya, sin descripción ni icono. Es lo más plano de la página. | Landing.tsx §funcionalidades | Rejilla *bento* de cristal: 2–3 tarjetas grandes con visual (malla 3D, ficha de morfometría, clip) y el resto pequeñas con icono y una línea de texto. |
| A7 | media | 1707 / 390 | En la franja de casos, el título blanco va sobre las mallas rojas y blancas, con contraste justo. El crédito IntrA (≈ 11 px, encima de la imagen) es casi ilegible. | FranjaCasos.tsx, landing.css | Degradado oscuro bajo el título o título en un panel de cristal. Crédito sobre una banda negra semitransparente. |
| A8 | media | 1707 | «Índices» son 8 filas de texto y sigla. | Landing.tsx §indices | Mini-diagrama SVG de un saco (cuello, domo, altura, Ø máx.) que resalte la cota que usa cada índice al pasar o hacer scroll por la fila. |
| A9 | baja | 1707 | «Dispositivos» tiene pictogramas lineales (bien), pero ninguna pieza real. | Landing.tsx §dispositivos | Render del clip T1–T4 (ya están los STL NAVARRO) o un giro lento en CSS. |
| A10 | baja | 1707 | «Próximamente» son 3 filas de texto. | Landing.tsx | 3 tarjetas de cristal con icono y la etiqueta «Próximamente» como insignia. |
| A11 | media | 1707 | Tras el giro del hero, el pie «Caso Zenodo 036 · detector · Prospective / Un caso real…» queda montado sobre la malla, con contraste bajo. | HeroCortes.tsx, VentanaDeteccion.tsx | Meter el pie dentro de la ventana de detección o darle fondo. (Cambia de todos modos con Case 3.) |
| A12 | baja | 743 alto | Hay huecos verticales de unos 200 px vacíos entre secciones; con 743 px de alto, la mitad de cada pantalla está vacía. | landing.css | Bajar el padding de sección a `clamp(64px, 10vh, 140px)`. |
| A13 | media | landing vs app | La landing dice «T1 recta» y Pedidos dice «T1 Recto»: incoherencia en el nombre de la serie. | Landing.tsx / catálogo de clips | Unificar en «T1 recto». |

## 2. Login y Crear cuenta (`pages/Login.tsx`, `pages/Signup.tsx`, `components/shell/AuthBrand.tsx`, `components/Entorno.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A14 | alta | oscuro | El fondo es el corte de TC (`Entorno dense`, `/media/entorno/corte-036.webp`) detrás de la tarjeta de cristal. En claro no aparece, así que los temas no son coherentes (captura del usuario). | Entorno.tsx, Login.tsx:79, Signup.tsx:128, ForcePasswordChange.tsx:50 | **Decidido: quitarlo.** Sustituir `Entorno` por un fondo «ambiente»: negro `--canvas` con 2–3 brillos radiales tenues de la marca (azul `--data` al 8–12 %) y un ruido fino, para que el `backdrop-filter` tenga algo que difuminar. En claro, el mismo esquema sobre gris claro. |
| A15 | media | todas | Los 15–16 estilos inline de Login/Signup no usan `glass()`: la ventana de cristal está hecha a mano. | Login.tsx, Signup.tsx | Pasar a `glass("normal")` con `data-glass`, como el resto. |

## 3. Oficina — común (`components/shell/AppShell.tsx`, `Entorno`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A16 | alta | oscuro | Todas las páginas internas (Pacientes, Estudios, Pedidos, Talleres, Usuarios, Cuentas, Auditoría, Ficha) llevan el mismo corte de TC de fondo, y en claro no se ve. | AppShell.tsx:31 (`<Entorno dense>`) | **Decidido:** el mismo fondo ambiente de A14. |
| A17 | alta | todas | Cada página tiene un ancho máximo distinto: Usuarios 1000, Solicitudes 900, Auditoría 1100, Estudios 1320, Pacientes 1440, Pedidos y Talleres `var(--content-max)`. | UsersAdmin.tsx:416, PendingRequests.tsx:203, AuditTrail.tsx:143, Studies.tsx:370, Patients.tsx:182 | Un solo `--content-max` (≈ 1280–1440) y un componente `PageBody` común. |
| A18 | alta | todas | Tras cerrar una hoja con Escape, el primer clic en la página se pierde. Comprobado dos veces: «Nuevo taller» y «Editar» usuario. La capa del Sheet sigue capturando el puntero durante la animación de salida. | components/Sheet.tsx | `pointer-events: none` en el *overlay* en cuanto empieza la salida (`exit`), o desmontarlo sin esperar. |
| A19 | media | 1024 / 390 | La cabecera no se adapta: a 1024 el título se corta («Pacient…», «Audit…») y los botones parten en dos líneas («Nuevo paciente», «Verificar integridad»). A 390 los botones se salen y el título desaparece. | components/shell/* (barra superior) | Por debajo de 1100: iconos con tooltip en las acciones secundarias y `white-space: nowrap` en los botones. A ≤ 640: acciones en un menú «⋯» o en ⌘K. |
| A20 | media | Windows | El botón y la paleta dicen «⌘K», pero en Windows el atajo es Ctrl K. | barra superior / CommandPalette | Detectar la plataforma: «Ctrl K» fuera de macOS. |
| A21 | media | claro | Los botones *outline* («Nuevo caso», «Nueva sesión», «Editar», «Restablecer contraseña», «Actualizar») tienen relleno gris y parecen deshabilitados o pulsados. | components/Button.tsx (variant outline/secondary en claro) | En claro: fondo transparente o `--glass` y borde `--border`. |
| A22 | media | todas | Hay 20–45 estilos inline por página de administración y un solo `glass()` (el contenedor); los botones, etiquetas y checkboxes interiores son del estilo anterior. Ver la lista del final. | pages/* | Restilado D (sección final). |

## 4. Pacientes (`pages/Patients.tsx`, `components/patients/*`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A23 | media | 1707 | El panel «Hoy» (`.pt-side`) tiene scroll interno (801 de 637 px) y deja la sección «Accesos» oculta abajo. Hay doble barra de scroll. | PatientsSidePanel.tsx | Que el panel crezca con la página (sticky sin `max-height`) o que «Actividad reciente» muestre 5 elementos y un «ver más». |
| A24 | media | 1707 | «Prueba rápida sin paciente» es texto con icono, sin borde, junto a dos píldoras. | Patients.tsx (acciones de cabecera) | Píldora `ghost` coherente, o llevarla al menú «⋯». |
| A25 | media | 1707 | El HC de «Segura, Prueba» es un UUID que parte en dos líneas y desalinea la fila de tarjetas. | PatientCard.tsx | Una línea con `text-overflow: ellipsis` y el `title` con el valor completo. |
| A26 | media | 1707 | «Abrir informe» parte en dos líneas dentro del botón. | PatientCard.tsx | `nowrap` y texto «Informe», o pie de tarjeta en columna. |
| A27 | baja | 1707 | En el aviso «4 casos parados…» los nombres se cortan en el borde sin elipsis visible. | Patients.tsx | Elipsis más «+N». |
| A28 | baja | 1707 | Las tarjetas «Sin sesión» llevan una miniatura vacía con un cuadrado gris. | PatientCard.tsx | Iniciales grandes o el icono del paso con la línea «Sin estudios aún». |
| A29 | media | todas | «Reanudar» no da progreso en la tarjeta: solo un aviso flotante «Restaurando sesión…» durante unos 20 s. | Patients.tsx / resume.ts | Estado de carga en el propio botón (spinner + «Abriendo…») y tarjeta bloqueada mientras dura. |

## 5. Nuevo paciente / Nuevo caso (hojas)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A30 | alta | 1707 | En «Nuevo caso — elegir paciente», la lista tiene `maxHeight: 320` y scroll interno, y la hoja deja unos 180 px vacíos debajo. Es el caso que señala el usuario: scroll innecesario. | NuevoCaso.tsx:264 | La lista con `flex: 1; min-height: 0` y el botón «Nuevo paciente» en el pie fijo de la hoja. |
| A31 | media | todas | El botón «+ Nuevo paciente» muestra el icono `STEP_PATIENT` como un cuadrado vacío y, además, un «+» escrito: doble y roto. | NuevoCaso.tsx:295 | Icono `+` real y texto «Nuevo paciente». Revisar `STEP_PATIENT` en Icon.tsx: donde sale como cuadrado (también en las tarjetas «Sin sesión» de Pacientes) falta ese glifo. |
| A32 | baja | todas | Las filas de paciente usan estilos inline y el *hover* se hace con `onMouseEnter`. | NuevoCaso.tsx:271 | Clase con `:hover` y `:focus-visible`. |
| A33 | baja | todas | En la hoja «Nuevo paciente», los placeholders son nombres reales verosímiles («Restrepo», «María»). | PatientFormSheet.tsx | Usar ejemplos neutros para no sugerir datos reales. |

## 6. Estudios (`pages/Studies.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A34 | alta | claro y oscuro | Las insignias sobre la miniatura («CT · 621 cortes» en azul sobre negro translúcido; «Alto» o «Moderado» en rojo o ámbar sobre la imagen gris del 3DRA) son ilegibles. | Studies.tsx | Insignia sólida `--glass-solid` con texto `--foreground`, y el riesgo con el componente `Badge`. |
| A35 | media | todas | Cada tarjeta apila 4 acciones con anchos y estilos distintos: Reanudar a lo ancho, «Nueva sesión» como píldora corta, «Abrir ficha» y «Borrar estudio» como texto. La destructiva está al mismo nivel que las demás. | Studies.tsx | «Reanudar» como principal y un menú «⋯» con Nueva sesión, Abrir ficha y Borrar (en rojo y separado). |
| A36 | baja | todas | La tarjeta «Subir un estudio nuevo» es más baja que las demás de su fila. | Studies.tsx | `align-self: stretch`. |

## 7. Ficha del paciente — cascada L3 (`pages/PatientPage.tsx`, `components/ficha/*`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A37 | media | 1707 | La columna «Casos» a ancho completo muestra una sola fila sin miniatura, paso ni «Reanudar». Unos 900×400 px quedan vacíos. | ColumnaCasos.tsx | En cada caso: miniatura, insignia de paso, riesgo y «Reanudar». Columna con ancho fijo (≈ 380) y el hueco con una vista previa del estudio (`VistaPrevia`). |
| A38 | media | todas | Las fechas van en ISO («2026-10-30») en los casos y estudios de la ficha, y en dd/mm/aa en el resto de la app. | ColumnaCasos.tsx, ColumnaEstudios.tsx | Formato común (`Intl` es-ES). |
| A39 | media | todas | En la columna Estudios, «1 sesión guardada» no lleva a ningún sitio y no hay «Reanudar». | ColumnaEstudios.tsx / ColumnaSesiones.tsx | Hacer que «1 sesión guardada» abra la columna Sesiones, o poner «Reanudar» directo. |
| A40 | media | todas | Capturas: «CAPTURAS» y «CAPTURAS (1)» salen dos veces. La insignia «detect» es un código interno en inglés. El icono de «Descargar» sale como un cuadrado y el «✕» de borrar no tiene rótulo. | ficha/* (columna de capturas), CaptureGallery.tsx | Un solo título; traducir el paso («Detección»); icono de descarga real; botón de borrar con `aria-label` y confirmación. |
| A41 | baja | todas | Los iconos de editar y borrar caso no llevan rótulo y el de borrar está siempre en rojo. | ColumnaCasos.tsx | Rojo solo en *hover*, más tooltip. |

## 8. Pedidos de clips (`pages/ClipOrders.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A42 | alta | todas | Estilo viejo: etiqueta «Buscar» redundante sobre el buscador, checkbox nativo «Solo los abiertos», «1 pedido(s) piden atención» con plural «(s)». Tiene 45 estilos inline. | ClipOrders.tsx | Restilado D: buscador con icono y sin etiqueta, interruptor (*switch*) de cristal para «Solo abiertos», plural correcto («1 pedido pide atención»). |
| A43 | media | todas | En el detalle, los valores (Administrador, sin comprometer, implante) van en monoespaciada, que debería reservarse para cifras y códigos. | ClipOrders.tsx (panel detalle) | Sans en los textos y mono solo en Nº de pieza y medidas. |
| A44 | media | todas | En el detalle, las descargas («Paquete taller (ZIP)», «Copia interna (PDF)», «STL») son texto plano sin icono ni aspecto de botón. «Abrir el caso» y «Marcar enviado» son píldoras grises apiladas, sin acción principal. | ClipOrders.tsx | Fila de descargas con icono de descarga. «Marcar enviado» como acción principal (primaria) y «Abrir el caso» secundaria, en una sola fila. |
| A45 | baja | todas | Las filas de la tabla no indican que se pueden pulsar (sin cursor ni flecha). | ClipOrders.tsx | `cursor: pointer`, *hover* de cristal y chevron. |
| A46 | media | 390 | En móvil la tabla tiene scroll horizontal y solo se ven 2,5 columnas. | ClipOrders.tsx | Por debajo de 640, tarjetas apiladas. |

## 9. Talleres (`pages/Workshops.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A47 | media | todas | «Editar» es texto plano y «Borrar» una píldora roja: incoherentes. | Workshops.tsx | Dos botones `sm` del mismo sistema (outline y destructive-ghost). |
| A48 | media | claro | Tarjeta blanca con sombra (estilo viejo). | Workshops.tsx | `glass("normal")` con `data-glass` en cada taller. |
| A49 | media | hoja | «Notas» es un input de una línea (debería ser textarea). El nombre no se marca como obligatorio, mientras Usuarios usa «*». «Registrar taller» está activo con el nombre vacío. | Workshops.tsx (hoja de taller) | Textarea de 3 filas, marca de obligatorio común y botón desactivado sin nombre. |
| A50 | baja | todas | La caja «Cómo se usa» es texto suelto. | Workshops.tsx | Pista con icono de información, o pasarla al estado vacío. |

## 10. Usuarios (`pages/UsersAdmin.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A51 | **alta** | 1707, 1366, 1024, 390 | `maxWidth: 1000` más `overflowX: auto`: la tabla mide 1089 px, así que hay barra horizontal y «Eliminar» queda oculto, incluso con 1707 px de viewport. Es la captura del usuario. | UsersAdmin.tsx:416–420 | Quitar el tope (usar `--content-max`). Acciones en un menú «⋯» o en iconos (editar, llave, papelera). Fecha en una línea («07/08/26 19:25»). En móvil, tarjetas. |
| A52 | media | claro y oscuro | «Editar» y «Restablecer contraseña» tienen relleno gris y parecen deshabilitados. | UsersAdmin.tsx:478–479 | Ver A21. |
| A53 | baja | todas | «Creado» parte en dos líneas («7/8/26,» / «19:25»). | UsersAdmin.tsx | `nowrap`. |
| A54 | media | hoja | El triángulo de «Más datos (opcional)» es un glifo diminuto (‣) que no gira al abrir. | UsersAdmin.tsx (hoja nuevo usuario) | Chevron de `Icon` de 14 px que rote 90° (`motion`). |
| A55 | baja | hojas | «Editar usuario» va en una columna y «Nuevo usuario» en dos. | UsersAdmin.tsx | La misma rejilla de 2 columnas. |

## 11. Cuentas pendientes (`pages/PendingRequests.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A56 | media | todas | La pestaña «Aprobadas» muestra al usuario una nota técnica: «El servidor no distingue las aprobadas desde una solicitud de las que creó un administrador». | PendingRequests.tsx | Reescribir: «Cuentas activas con acceso médico». |
| A57 | baja | todas | El estado vacío es pobre (✓ y una línea, en una tarjeta de 900). «Actualizar» es una píldora gris. | PendingRequests.tsx | Estado vacío con icono grande y una frase de qué pasa cuando alguien se registra. «Actualizar» como icono. |

## 12. Auditoría (`pages/AuditTrail.tsx`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A58 | media | todas | A la vista aparecen códigos de máquina en inglés (LOGIN, CAPTURE_SAVED, SEGMENTATION_COMPLETE, PATIENT_DELETED) junto a la etiqueta en español. El detalle desplegado tiene claves en inglés (capture, case). | AuditTrail.tsx | Mostrar el código solo en el detalle o en un tooltip, y traducir las claves. |
| A59 | media | todas | La columna «Paciente» dice literalmente «paciente» en vez del nombre o el HC. | AuditTrail.tsx | Resolver el nombre o el HC; si se borró, «Paciente borrado (#id)». |
| A60 | alta | 390 | En móvil la tabla pierde la columna **Acción**: solo se ven Fecha y Usuario. | AuditTrail.tsx | Tarjetas apiladas con la acción como título. |

## 13. Menú de usuario, Cambiar contraseña y paleta ⌘K

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A61 | baja | hoja | «Cambiar contraseña» dice «el token va firmado sobre tu usuario, no sobre la contraseña»: jerga para un médico. | ChangePasswordSheet.tsx | «Tu sesión seguirá abierta en este equipo.» |
| A62 | baja | paleta | Los elementos de la paleta no llevan icono; las secciones IR A / ACCIONES / RECIENTES se ven bien. | CommandPalette.tsx | Icono de sección a la izquierda. |

## 14. Quirófano (`pages/Workspace.tsx`, `vtk/*`)

| id | sev | dónde | qué se ve | fichero | arreglo propuesto |
|---|---|---|---|---|---|
| A63 | **alta** | 1707 con el panel abierto | **Confirmado:** en la banda del visor, «SOLA» queda tapado por «[PLANOS ●]». La banda mide 1280 px y su contenido pide 1314. El solape empieza con la banda por debajo de unos 1314 CSS px, es decir, siempre que el panel del paso está abierto en el portátil del usuario. Con el panel plegado (banda de unos 1500) cabe. | vtk/ViewerHeader.tsx:73–80 | El grupo izquierdo tiene `minWidth: 0` sin `overflow` y sus hijos no encogen, así que se monta sobre el derecho. Arreglo: grupo izquierdo `flex: none`; grupo derecho `flex: 1 1 auto; justify-content: flex-end`; el aviso «Vista previa 1:2…» como icono ⚠ con tooltip por debajo de unos 1400; y subir `NARROW_HEADER_PX` para que abrevie antes. |
| A64 | media | 1707 | En el 3D, el rótulo «CANDIDATOS ANEURISMÁTICOS / cand-001 · Ø 11,6 mm est.» se monta sobre la regla de orientación DER–ANT–IZQ. | vtk/hud/HudHeadingTape.tsx, HudReadout.tsx | Bajar la cinta de rumbo o desplazarla a la derecha del rótulo. |
| A65 | media | todas | Se muestran ids internos «cand-001», «cand-002» a un humano. | Workspace / DetectPanel | «Candidato 1», etc., como en la landing. |
| A66 | media | panel | Botones que parten en dos líneas: «Re-segmentar» («Re-» / «segmentar»), «Analizar morfometría». | SegmentPanel.tsx, DetectPanel.tsx (PanelFooter) | `nowrap` y texto más corto, o pie en dos filas. |
| A67 | media | dock | Al volver al paso 1, los pasos ya hechos (2, 3) pierden el ✓ y parecen pendientes. | pipeline/ (dock de pasos) | Marcar como hecho todo paso completado, esté antes o después del actual. |
| A68 | media | dock | Pulsar el paso 4 lanza la morfometría automática sin avisar y deja «Cambios sin guardar». | Workspace.tsx / pipeline | Aviso en el botón («Calculará la morfometría») o pedir confirmación. |
| A69 | baja | hoja de atajos | En la columna «Ratón» las descripciones caen en 3 líneas («Corte / siguiente o / anterior») porque es muy estrecha. | vtk/hud/ShortcutsSheet.tsx | Rejilla a 2 columnas con más ancho para la descripción. |
| A70 | baja | panel paso 3 | «Más» bajo las viñetas es texto en negrita sin aspecto de enlace. | DetectPanel.tsx | Enlace con chevron. |

> No se pudo probar a ≤ 1280 en vivo: la ventana no se encoge y meter el quirófano en un iframe recargaría VTK. La hoja inferior L5 se comprobó a 675 px en la sesión anterior y estaba bien.

---

## Tabla resumen

| sev | nº | ids |
|---|---|---|
| alta | 15 | A1, A2, A4, A5, A6, A14, A16, A17, A18, A30, A34, A42, A51, A60, A63 |
| media | 37 | A3, A7, A8, A11, A13, A15, A19, A20, A21, A22, A23, A24, A25, A26, A29, A31, A35, A37, A38, A39, A40, A43, A44, A46, A47, A48, A49, A52, A54, A56, A58, A59, A64, A65, A66, A67, A68 |
| baja | 18 | A9, A10, A12, A27, A28, A32, A33, A36, A41, A45, A50, A53, A55, A57, A61, A62, A69, A70 |

**Total: 70 hallazgos.**

## Páginas que necesitan el restilado completo al D

Pedidos de clips, Usuarios, Talleres, Cuentas pendientes, Auditoría, Estudios y la hoja Nuevo caso (`NuevoCaso.tsx`).

Todas tienen el contenedor de cristal, pero el interior es del estilo anterior, con 20–45 estilos inline: botones grises, checkbox nativo, etiquetas sueltas, monoespaciada en texto y anchos máximos propios. Login y Crear cuenta necesitan un retoque: fondo ambiente y `glass()`.
