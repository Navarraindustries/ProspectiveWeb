# Pasada responsive final (fase 12): ProspectiveWeb, 2026-11-01

Hecha sobre `main` (f40cb05), con el frontend en :5173 y el backend en :8000 y la sesión del dueño. Medí con iframes del mismo origen dentro de mi pestaña. Por el 80 % de zoom, un iframe de W px da innerWidth = W−1; los 1024/1280 «exactos» se midieron con 1024,6 → 1025 y con 1280,6 → 1280. MQ_TACTIL es por ancho (≤ 1024), así que el modo táctil del quirófano sí se activa en el iframe. Solo lectura: no envié nada, no guardé, no pulsé el paso 4 y salí del quirófano con «Volver», sin diálogo.

No he podido comprobarlo todo:
- Entrar y Crear cuenta no se ven: con sesión iniciada, /app/entrar y /app/registro redirigen a /app/pacientes.
- Los anchos 1366 y 1440 no se midieron aparte. Cubren la tendencia 1280 y 1707.
- Mientras reanudaba Zenodo 015 en mi iframe, la pestaña del usuario pasó de /app/sesion a /app/pacientes. No encuentro en el código ningún BroadcastChannel ni escucha de `storage` que lo explique: puede que fuera el propio usuario. Hay que avisarle.

---

## Base común (barra superior, shell, menús)

**R1 · ALTA · todos los anchos (nativo 1707×743 incluido) · oscuro y claro**
La rejilla `.shell` no limita la altura de su fila. Por eso desplaza el documento y no `.shell-main`, y la barra superior y el rail lateral se van con el scroll.
- Medida en Pacientes a 1707×743:
  - `.shell` mide 743 px, pero `grid-template-rows` da 1765,68 px.
  - `document.scrollHeight` es 1766.
  - Tras desplazar 900 px: `nav.top` = −900 y `.shell-top.top` = −900.
  - `.pt-side`, que es sticky, deja de serlo (top −690).
- Pasa igual en 641, 768, 1025 y 390 (Pacientes a 390×700: documento de 5942 px). En la ficha a 390×640 sobran 18 px y la barra se mueve.
- Con una hoja abierta, la barra de scroll de la página sigue visible: no hay bloqueo del fondo.
- Fichero: `components/shell/shell.css` (`.shell` l.5–12 y `.shell-body` l.19–24). Es un elemento de rejilla con `min-height:auto`.
- Arreglo: `.shell { grid-template-rows: minmax(0, 1fr); }` y `.shell-body { min-height: 0; }`. Si en móvil se quiere que desplace el documento, hacerlo explícito (barra `position: sticky; top: 0`) y no por accidente. Añadir un test.

**R2 · ALTA · 641–1025 · oscuro**
El título de la página se corta porque el subtítulo le quita sitio.
- Medidas (crumb scrollWidth > clientWidth):
  - Usuarios a 641: **0 px** (el título desaparece). A 768: 64 > 23 («U…»).
  - Auditoría: 66 > 9 a 641, 66 > 41 a 900, 66 > 25 a 768, 66 > 64 a 1025.
  - Talleres: 57 > 21 a 641, 57 > 35 a 768.
  - Pedidos: 118 > 71 a 641, 118 > 97 a 768.
  - Estudios: 62 > 41 a 641.
  - Pacientes: 71 > 44 a 768 («Pac…»).
- Fichero: `components/shell/shell.css` (l.265 `.shell-crumbs{min-width:0}`, l.308 `.shell-subtitle`) y `TopBar.tsx:158`. Los dos encogen igual.
- Arreglo: `.shell-crumbs { flex-shrink: 0; max-width: 50%; }` y `.shell-subtitle { flex: 1 1 0; min-width: 0; }`. Ocultar el subtítulo en el tramo tableta (≤ 1024), como ya se hace en móvil.

**R3 · ALTA · 360 y 390 (sobra a partir de ~430) · Usuarios**
El «⋯» y el avatar quedan fuera de pantalla.
- `.shell-actions` va de 144 a 392 con un clientWidth de 347 (360): el menú-más (348–392) y el avatar (348–392, segunda fila) quedan 45 px fuera y recortados. A 390 (cw 377) quedan 15 px fuera.
- El buscador solo tiene 90 px útiles.
- Fichero: `shell.css:616` (`.shell-actions > .shell-extra { flex: 1 1 120px; min-width: 120px; }`) más `UsersAdmin.tsx:486`. La miga tiene un mínimo de 72 px (l.613).
- Arreglo: en ≤ 640 el `extra` baja a una fila propia a todo el ancho (`.shell-top{flex-wrap:wrap}` y `.shell-actions > .shell-extra{order:99; flex:1 1 100%}`). Otra opción: sacar el buscador al cuerpo de la página en móvil.

**R4 · MEDIA · 360 · Auditoría**
La barra se parte en dos filas y el avatar va solo en la segunda: la barra mide 86 px. Hay cuatro botones (verificar, ⋯, tema, avatar) en 347 px.
- Fichero: `TopBar.tsx:186`.
- Arreglo: en móvil, el conmutador de tema pasa al menú «⋯» (ya existe `itemsMenu`).

**R5 · MEDIA · 360 · oscuro**
En móvil el título se corta por muy poco:
- «Pedidos de clips»: 118 > 116.
- «Cuentas pendientes»: 145 > 128.
- Ficha «Zenodo, Caso 015»: 130 > 128.
- Fichero: `shell.css:613–614`.
- Arreglo: en ≤ 640, `.shell-crumb{white-space:normal; -webkit-line-clamp:2; display:-webkit-box; -webkit-box-orient:vertical}`, o bajar el título a 14 px en móvil.

**R6 · MEDIA · todos los anchos (medido a 390) · menú de usuario**
La línea de rol se sale de la caja y se corta en el borde del menú («…pacientes, usuar»).
- `.shell-user-role` tiene scrollWidth 491 en una caja de 186 px, con `white-space: nowrap` heredado de `shell.css:579` (`.shell-actions > * { white-space: nowrap }`).
- Además, a menos de 1024:
  - Las entradas «Cambiar contraseña» y «Cerrar sesión» miden 254×37, por debajo de 44.
  - Sub y rol van a 11 px.
- Arreglo: `.shell-user-menu { white-space: normal; }`, `.shell-menu-item { min-height: var(--control-md) }` en ≤ 1024, y `.shell-user-sub/.shell-user-role` a 13 px en tableta.

**R7 · MEDIA · ≤ 640 · cajón de secciones**
En el pie, el rol «Administrador» (sw 86 / cw 65, sin recorte) llega a x≈143 y pisa el botón «Cerrar sesión» (empieza en 132): 11 px de solape. El nombre ya trunca («Adminis…»).
- Fichero: `shell.css` (`.shell-nav-user-role`).
- Arreglo: `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` como en el nombre, o «Cerrar sesión» solo con icono (44×44) dentro del cajón.

**R8 · MEDIA · 1707×743 y 390×700 · paleta (Ctrl K)**
El campo de búsqueda queda aplastado.
- Declara `--field-h` (48 px), pero mide **34 px** en el nativo y **30 px** a 390.
- El placeholder se corta en móvil («…o una acció»).
- Causa: la columna flex con `maxHeight: min(560px, 72vh)` encoge el input.
- Fichero: `components/CommandPalette.tsx:255`.
- Arreglo: `flexShrink: 0` en el input. En móvil, paleta a pantalla completa (como las hojas) y placeholder corto («Buscar…»).

**R9 · MEDIA · 360 y 768 · Cuentas pendientes (componente Tabs)**
- Pestañas de 98×30: no crecen en táctil.
- A 360, las tres pestañas se parten en dos filas dentro de la píldora (por el botón de recarga al lado).
- Fichero: `components/Tabs.tsx` (estilos en línea sin tramo, `padding 7px 14px`, 13 px) y `pages/PendingRequests.tsx:206`.
- Arreglo: con `useTableta()`, `minHeight: 44`. En móvil, `flexWrap: nowrap; width: 100%` con cada pestaña a `flex: 1`, y la recarga en su propia fila o dentro del menú.

**R10 · MEDIA · 360 y 768 · tarjetas de tabla (TablaTarjetas)**
El disparador del detalle es una pastilla diminuta, no la tarjeta:
- Pedidos «PR-2026-0002»: `tt-fila-boton` de 94×22.
- Auditoría: 50 × `tt-fila-boton` de 100×25 («Inicio de sesión»).
- Fichero: `components/TablaTarjetas.tsx`.
- Arreglo: toda la tarjeta como objetivo («stretched link»: `::after{inset:0}` en el botón) o `min-height: 44`.

**R11 · MEDIA · toda la app · Badge a 11 px**
Se ve en Riesgo alto/moderado, Médico, Firmado, «5 encontrados» y «Paso 3 · Detección» de la ficha.
- Fichero: `components/Badge.tsx:40` (`fontSize: 11`).
- Arreglo: 13 px por debajo de 1024 (`useTableta`) y 12 px en ancho, o 12 px en todos los anchos si el dueño lo acepta como rótulo.

---

## Pacientes

**R12 · MEDIA · ≥ 1024 (también a 360) · oscuro**
El pie de la tarjeta se corta: «Última sesión ha…».
- 139 > 114 a 1707, 1920 y 2560; 139 > 129 a 1025; 186 > 168 a 360 («hace 3 semanas»).
- Fichero: `components/patients/patients.css:71` (`.pt-card-foot > span` con nowrap y ellipsis).
- Arreglo: dejar que parta en dos líneas (`white-space: normal; line-height: 1.3`) o usar la forma corta «hace 2 d» con la fecha completa en `title`.

**R26 · BAJA · 360**
- El aviso «1 pedido de clip parado» trunca el detalle («PR-20…», 92 > 55).
- El HC largo de Segura, Prueba se trunca (360 > 285): aceptable con ellipsis.
- Fichero: `patients.css:156` (`.pt-aviso-detalle`).
- Arreglo: dejar que el detalle baje de línea en móvil.

**R21 · BAJA · < 1024**
Metadatos en monoespaciada a 12 px. No son rótulos en mayúsculas, así que la excepción no los cubre.
- Dónde: `pt-card-meta` (14 tarjetas), Estudios (`es-insignia` 12 px, HC 12 px) y la hoja «Nuevo caso» («ZENODO-002 · F · 1 caso»).
- Fichero: `patients.css:49`, `pages/Studies.tsx` y `AttachCaseSheet.tsx`.
- Arreglo: 13 px en tableta.

**R22 · BAJA · < 1024 · buscadores (Pacientes, Estudios, Pedidos, Auditoría)**
El `<input>` real mide 19 px de alto dentro de un contenedor de 48 que no es `<label>`: tocar el borde del campo no lo enfoca.
- Fichero: `components/Input.tsx`.
- Arreglo: que el contenedor sea `<label>`, o un input al 100 % de alto.

## Ficha del paciente (cascada)

La cascada se comporta bien: una columna con desplegables a 360, dos a 1024 y tres a 1280, sin scroll horizontal.

**R20 · BAJA · 641–1024**
La miga «Pacientes» es un botón de 60×19 (26×19 en el quirófano a 768).
- Fichero: `shell.css` (`.shell-crumb-link`).
- Arreglo: en tableta, `padding-block` hasta 44 de alto (o `::before` con inset negativo).

## Hojas (Nuevo paciente, Nuevo caso, Editar, Cambiar contraseña, usuarios)

Ancho correcto: pantalla completa en móvil (348/378/418 px de cw) y 460 px a 768. Cuerpo con su propio scroll (456/1316) y pie fijo.

**R23 · BAJA · 430**
- El plegable «Más datos (opcional)» mide 39 px (Nuevo usuario).
- «Seleccionar archivo…» mide 34 px (Editar usuario).
- Fichero: `pages/UsersAdmin.tsx` y `components/FileField.tsx`.
- Arreglo: `min-height: var(--control-md)` en tableta.

**R24 · BAJA · todos los anchos**
El ritmo vertical de los formularios es desigual:
- Nuevo paciente: la ayuda «Puedes usar iniciales…» queda pegada al rótulo «Nombre».
- Editar usuario:
  - Entre «Rol» y «Especialidad» hay ~6 px, frente a los 18 del resto.
  - La ayuda del rol («Médico: ves y editas…») sale debajo de Especialidad.
- Fichero: `PatientFormSheet.tsx` y `UsersAdmin.tsx`.
- Arreglo: margen inferior uniforme por campo, y la ayuda del rol justo bajo «Rol».

## Pedidos

El detalle está bien: hoja a pantalla completa, botones de 44.

**R25 · BAJA · 360**
Los 8 chips de estado ocupan 4 filas (~160 px) antes de la lista.
- Fichero: `pages/ClipOrders.tsx` (Pastillas).
- Arreglo: en móvil, una fila con desplazamiento horizontal (`overflow-x:auto; scroll-snap`) o un Select.

## Talleres, Usuarios, Cuentas pendientes, Auditoría

Ver R2, R3, R4, R9 y R10. Las tablas pasan a tarjetas por debajo de 640 en Pedidos, Usuarios y Auditoría.

## Pantalla grande

**R27 · BAJA · 1920 y 2560**
El contenido se queda en `--content-max` = 1280 px también en ≥ 1920.
- A 2560, Estudios, Pedidos, Auditoría y Usuarios usan 1280 de 2496 px (51 %).
- Pacientes se queda en 3 columnas de tarjetas.
- La ficha sí se ensancha (1708).
- Cumple «no estirar sin fin», pero se ve vacío.
- Fichero: `styles/tokens/spacing.css` y `breakpoints.css`.
- Arreglo: `@media (min-width:1920px){ :root{ --content-max: 1600px } }`.

## Landing

Sin scroll horizontal en ningún ancho, de 360 a 2560. El menú móvil va bien (enlaces de 44, «Crear cuenta» a todo el ancho). En tema claro no encontré problemas de contraste (rótulos de 7,1:1). El hero se queda oscuro: entiendo que es a propósito.

**R28 · BAJA · < 1024**
- El correo de contacto (`.sec__texto a`) mide 227×19.
- El crédito «IntrA» (`.franja-casos__credito a`) mide 29×43.
- Arreglo: `padding-block` hasta 44.

**R29 · BAJA · 1280×600**
La línea de notas del hero («Sin instalar nada…», bottom 617) queda bajo el pliegue. Las llamadas a la acción se ven bien (569).
- Fichero: `styles/landing.css` (hero-cortes).
- Arreglo: `@media (max-height: 700px)`, título y márgenes del hero más pequeños.

## Quirófano (Zenodo, Caso 015, Reanudar; un solo iframe, redimensionado en sitio)

Revisado a 1707×743, 1280, 1025, 1000, 768, 390 y 360. Sin scroll horizontal. A 1280 y menos, la hoja L5 entra bien. El dock se compacta a «← 3/8 · Detección →» en móvil. La hoja de atajos («?») mide 736×868 a 768, con scroll propio, y no hay textos < 13 px.

**R13 · ALTA · 360 y 390 · barra superior**
La píldora de acciones pisa la miga y el botón «Volver».
- A 390: la píldora de miga va de 12 a 71 px, pero la nav de miga se sale a 69–141 y las acciones van de 79 a 378 → **62 px de solape**. Se ve solo «A».
- A 360: las acciones empiezan en ~48 y tapan media flecha de «Volver».
- Fichero: `components/stepper/QuirofanoBar.tsx:79–80` (izquierda `flex: 0 1 auto; minWidth: 0`, derecha `flex: none`) más `shell.css:613` (`.shell-crumbs{min-width:72px}` gana a la píldora).
- Arreglo:
  - En móvil, ocultar la miga (el caso ya se ve en la hoja) o poner `overflow:hidden` en la píldora.
  - «Sin guardar» pasa a un punto con `aria-label`.
  - Captura y Guardar van al menú.

**R14 · ALTA · 768–1025 · barra superior**
En la miga desaparece el nombre del paciente mientras el HC sigue entero.
- A 768: «Pacientes» 26/60 px, **«Zenodo, Caso 015» 0/111 px**, «HC ZENODO-015» 66/66 y caso 96/343.
- A 1000–1025: «Pacie…» > «Zenodo,…» > ZENODO-015 > «Aneurisma fusiforme ACM derecha 1…».
- Fichero: `QuirofanoBar.tsx:116` (`.shell-crumb-detail` con `flex-shrink: 0`, `shell.css:301`) y `.shell-crumb{max-width:32vw}`.
- Arreglo:
  - Ocultar el HC por debajo de 1280 (dejarlo en `title`).
  - En táctil, quitar la miga «Pacientes» (ya está el botón Volver).
  - Dar `min-width: 10ch` al nombre del paciente.

**R15 · MEDIA · 768, 1000, 1025, 1280 y 1707 · HUD 2D**
La escalera de cortes pisa la lectura W/L en las tres celdas (30×13 px de solape cada una: «L 70» bajo «981/131/201»).
- Fichero: `vtk/hud/hud.css:23` (`.hud-readout.br{right:14px}`) frente a HudLadder; `SliceView.tsx:433`.
- Arreglo: `.hud-readout.br.hud-wl { right: 48px }` cuando hay escalera (como `.hud-edge.right.beside-ladder`), o que la escalera termine 40 px antes del borde inferior.

**R16 · MEDIA · ≤ 1024 · W/L**
Confirmado el pendiente: en celdas compactas no hay forma táctil de restablecer W/L.
- Solo hay `onDoubleClick` (`SliceView.tsx:435`), y el select de preajustes solo sale con `!p.compact` (l.440).
- El botón W/L mide 67×15 en táctil. Es un control, no una lectura, así que no entra en la excepción del HUD.
- Arreglo: en táctil, un toque en W/L abre un menú corto (Restablecer y preajustes). Diana de 44 con un `::before` de inset negativo; el texto sigue a 10,5 px.

**R17 · MEDIA · táctil · dock**
Confirmado en código: el paso activo con aviso pide dos toques.
- `StepDock.tsx:87–90` aplica la puerta de la burbuja de aviso también al paso `active` (`aviso` solo se anula si está `locked`).
- No lo pulsé (regla del paso 4).
- Arreglo: pasar `active` a `pulsar` y, si es el activo, `onGo(i)` directo, dejando la burbuja solo como información.

**R18 · MEDIA · ≤ 1280 · hoja inferior L5**
- El tirador mide 24 px de alto (`BottomSheet.tsx:120`, `height: 24`): por debajo de 44 en táctil.
- La hoja abre ocupando más de la mitad y deja poco visor: ~220 px de visor a 1280×743, ~190 px a 390×800 y ~150 px a 360×700. Las celdas 2D inferiores (sagital, volumen) quedan debajo de la hoja.
- Arreglo:
  - Tirador de 44 de alto (la barra visual sigue en 4 px).
  - En ≤ 640, la hoja abre en posición «peek» (cabecera y pie) y el visor se recoloca en el espacio libre, sin quedar tapado.

**R19 · MEDIA · ≤ 1024 · panel del paso**
Textos de menos de 13 px fuera del HUD:
- Viñetas «Tres criterios buscan…» a 11 px.
- «Candidato N» a 12 px.
- «Reglas, ángulos, regiones y notas» a 11 px (`span.truncate`).
- «azul = dónde, no el saco» a 10,5 px.
- «5 encontrados» a 11 px (Badge).
- Fichero: `components/planning/DetectPanel.tsx` (textos en `detectCopy.ts`), `components/annotations/useAnnotationsSync.ts:151` (texto) y R11.
- Arreglo: 13 px en tableta.

## Iconos

**R30 · BAJA**
`STEP_PATIENT` (un cuadrado vacío, `Icon.tsx:15`) ya no se pinta en ningún sitio.
- Solo aparece como dato en `pipeline/steps.ts:22` (paso «upload»).
- Los dos sitios que pintan iconos de paso lo sustituyen: `PatientCard.tsx:86–88` (→ USER) y `SeccionComoFunciona.tsx:30` (→ UPLOAD). El dock pinta números, no iconos.
- Arreglo: `icon: "UPLOAD"` en `steps.ts`, quitar las dos sustituciones y borrar el trazado de `Icon.tsx`.

**R31 · BAJA · < 1024**
- La inicial del avatar va a 11 px (`UserMenu.tsx:21`, `size*0.38`).
- «Ctrl K» va a 12 px (`.shell-cmdk`, 641–1024).
- Arreglo: 13 px en tableta.

---

## Tabla resumen

| id | sev | ancho×alto | vista | qué | fichero |
|---|---|---|---|---|---|
| R1 | alta | todos (1707×743) | toda la oficina | desplaza el documento, no `.shell-main`: la barra y el rail se van; el sticky falla | shell.css `.shell`/`.shell-body` |
| R2 | alta | 641–1025 | todas las de gestión | título cortado por el subtítulo (Usuarios 0 px a 641, «Audit…») | shell.css 265/308, TopBar.tsx:158 |
| R3 | alta | 360, 390 | Usuarios | «⋯» y avatar 45/15 px fuera de pantalla | shell.css:616, UsersAdmin.tsx:486 |
| R13 | alta | 360, 390 | quirófano | la píldora de acciones pisa la miga (62 px) y «Volver» | QuirofanoBar.tsx:79–80, shell.css:613 |
| R14 | alta | 768–1025 | quirófano | el nombre del paciente queda a 0 px y el HC entero | QuirofanoBar.tsx:116, shell.css:301 |
| R4 | media | 360 | Auditoría | barra en 2 filas (86 px) | TopBar.tsx |
| R5 | media | 360 | Pedidos, Cuentas, ficha | título cortado 2–17 px | shell.css:613 |
| R6 | media | todos | menú de usuario | el rol se sale y se corta; entradas de 37 px; 11 px | shell.css:579/413/426 |
| R7 | media | ≤ 640 | cajón | el rol pisa «Cerrar sesión» (11 px) | shell.css `.shell-nav-user-role` |
| R8 | media | 1707, 390 | paleta | campo de 48 → 34/30 px | CommandPalette.tsx:255 |
| R9 | media | 360, 768 | Cuentas pendientes | pestañas de 30 px, en 2 filas | Tabs.tsx |
| R10 | media | 360, 768 | Pedidos, Auditoría | disparador del detalle de 94×22 y 100×25 | TablaTarjetas.tsx |
| R11 | media | todos | toda la app | Badge a 11 px | Badge.tsx:40 |
| R12 | media | ≥ 1024, 360 | Pacientes | «Última sesión ha…» cortado | patients.css:71 |
| R15 | media | 768–1707 | quirófano | la escalera pisa W/L (30×13) | hud.css:23, SliceView.tsx:433 |
| R16 | media | ≤ 1024 | quirófano | W/L solo con doble clic; 67×15 | SliceView.tsx:435/440 |
| R17 | media | táctil | dock | el activo con aviso pide 2 toques | StepDock.tsx:87–90 |
| R18 | media | ≤ 1280 | hoja L5 | tirador de 24 px; la hoja tapa el visor | BottomSheet.tsx:120 |
| R19 | media | ≤ 1024 | panel del paso | textos de 10,5–12 px | DetectPanel.tsx, detectCopy.ts |
| R20 | baja | 641–1024 | ficha, quirófano | miga «Pacientes» de 60×19 | shell.css `.shell-crumb-link` |
| R21 | baja | < 1024 | Pacientes, Estudios, Nuevo caso | metadatos mono a 12 px | patients.css:49, Studies.tsx |
| R22 | baja | < 1024 | buscadores | input real de 19 px; el contenedor no es label | Input.tsx |
| R23 | baja | 430 | hojas de usuario | plegable de 39 px y archivo de 34 px | UsersAdmin.tsx, FileField.tsx |
| R24 | baja | todos | hojas | ritmo vertical irregular; ayuda del rol mal colocada | PatientFormSheet.tsx, UsersAdmin.tsx |
| R25 | baja | 360 | Pedidos | 4 filas de chips | ClipOrders.tsx |
| R26 | baja | 360 | Pacientes | detalle del aviso truncado | patients.css:156 |
| R27 | baja | 1920, 2560 | gestión | contenido fijo en 1280 (51 % a 2560) | tokens spacing/breakpoints |
| R28 | baja | < 1024 | landing | correo 227×19 e IntrA 29×43 | landing.css |
| R29 | baja | 1280×600 | landing | notas del hero bajo el pliegue | landing.css |
| R30 | baja | — | iconos | STEP_PATIENT sin uso real | steps.ts:22, Icon.tsx:15 |
| R31 | baja | < 1024 | barra | avatar a 11 px y «Ctrl K» a 12 px | UserMenu.tsx:21, shell.css |

Total: 31 (alta 5 · media 14 · baja 12).
