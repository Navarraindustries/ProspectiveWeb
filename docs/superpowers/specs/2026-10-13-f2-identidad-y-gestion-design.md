# F2 · Identidad nueva, shell y pantallas de gestión — diseño

Fecha: 2026-10-13. Serie F, subproyecto 2 (tras F1 auditoría, F1a y F1b arreglos; antes de F3 espacio de trabajo y F4 simulación grabada). Camino arquitectónico; construcción por la vía A (cambiar los tokens y envolver con el shell).

## 1. Objetivo y resultado

Que toda la parte de gestión de PROSPECTIVE Web se lea como un solo producto, oscuro «Pro», con la identidad A y el shell C decididos el 10/10, y que cada pantalla de gestión quede corregida con las 75 filas F2 de la auditoría funcional y las 25 fusiones aprobadas. Al cerrar F2: entrar, pacientes, ficha, casos, estudios, pedidos, talleres y administración comparten tokens, fuentes, iconos y armazón; el espacio de trabajo hereda colores y fuentes por el CSS global y conserva su carril y su barra hasta F3.

Éxito: la lista manual corta sobre Case 3 (sección 7) pasa; `tsc`, Vitest completo, `npm run build` y los ficheros de backend tocados en verde; contrato regenerado; ninguna fila F2 sin resultado en el plan.

## 2. Decisiones del propietario (ganan sobre cualquier resumen)

Del 10/10 (serie F): identidad **A · Grafito + azul eléctrico**; tema oscuro por defecto y claro secundario; nombres PROSPECTIVE (producto) y SkullApp (fabricante) con logotipo nuevo; **shell C** (barra lateral de iconos de 40 px plegada por defecto, misma para gestión y espacio de trabajo; identidad del paciente y acciones en una barra superior fina).

Del 13/10 (esta sesión):

1. **Visibilidad de pacientes: creador + compartir.** Se mantiene «solo lo que creaste» y se añade «Compartir con…» por paciente (lista de cuentas). El administrador sigue viéndolo todo.
2. **Portada: conservar la actual, retocada.** Misma estructura y secciones con la identidad nueva; se aplican las filas F2 y se quita el vídeo de marca.
3. **Guardados en la ficha: renombrar, borrar y ver tamaño.** El modelo de copia completa se queda para F3.
4. **Auditoría: detalle por fila + filtro por paciente.** Sin cambiar cómo se guarda la cadena.
5. **Construcción por la vía A.** Tokens y componentes rehechos por dentro con la misma API; `AppShell` envuelve las pantallas de gestión; el visor no se toca.

Reglas en vigor: textos en español y comentarios WHY; nunca `git push` (lo hace el propietario); nunca `backend/data/` ni `frontend/package-lock.json` en un commit; tests de backend un fichero por proceso; contrato con `scripts/export_openapi.py` + `npm run gen:api`, `types.ts` a mano; los textos de las filas del apéndice son literales y ganan sobre los resúmenes; los umbrales y constantes se citan del código, nunca de memoria.

## 3. Sistema de diseño

### 3.1 Tokens (`frontend/src/styles/tokens/`)

Oscuro en `:root`, claro bajo `[data-theme="light"]`. El tema por defecto pasa a oscuro; la elección se recuerda por navegador (`localStorage`, como hoy). Mismos nombres de token en los dos temas.

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--canvas` | `#0B0C0F` | `#F4F5F7` | lienzo de la aplicación |
| `--background` | `#141519` | `#FFFFFF` | paneles, barra lateral |
| `--card` | `#1C1D22` | `#FFFFFF` | tarjetas, hojas |
| `--foreground` | `#F2F3F5` | `#0B0C0F` | texto |
| `--muted-foreground` | `#9AA3AF` | `#5B6470` | texto apagado |
| `--border` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.08)` | bordes |
| `--primary` / `--ring` | `#3B8BFF` | `#3B8BFF` | acento: foco, botón principal, enlace, activo |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | texto sobre el acento |
| `--brand-subtle` | `rgba(59,139,255,.16)` | `rgba(59,139,255,.12)` | estado activo, selección |
| `--success` / `--success-bg` | `#2ECC8A` / `rgba(46,204,138,.14)` | `#15803D` / `#DCFCE7` | estado clínico correcto |
| `--destructive` / `--destructive-bg` | `#FF5A5F` / `rgba(255,90,95,.14)` | `#D7263D` / `#FEE2E2` | peligro, borrar |
| `--warning` / `--warning-bg` | `#F5B942` / `rgba(245,185,66,.14)` | `#92400E` / `#FEF3C7` | aviso |
| `--glass` | `rgba(28,29,34,.72)` + `backdrop-filter: blur(18px)` | `rgba(255,255,255,.72)` + blur | hojas, menús, barra superior |
| `--radius-lg` / `--radius-md` / `--radius-sm` | 16 / 10 / 8 px | igual | tarjetas / controles / insignias |
| `--shadow-lg` | `0 30px 60px rgba(0,0,0,.45)` | `0 20px 40px rgba(0,0,0,.12)` | hojas y menús |

El acento es solo de interacción: ningún estado clínico usa el azul y los estados clínicos no usan el acento. Los tokens de gráficos (`--chart-*`) se derivan del acento y de los grises.

### 3.2 Tipografía

Geist (interfaz) y Geist Mono (cifras, HUD del visor, hashes, códigos) autoalojadas en `frontend/src/assets/fonts/` como fuentes variables woff2 (licencia SIL OFL; se copia el fichero de licencia junto a ellas), declaradas en `tokens/fonts.css`; `--font-sans` y `--font-mono` cambian de valor y nada más. Escala: 12 / 13 / 14 (cuerpo), 16 / 20 (títulos de sección), 28 (título de página); pesos 400 / 500 / 600. Se retiran Inter, JetBrains Mono, Space Grotesk y Plus Jakarta Sans y sus binarios; `landing.css` deja de definir paleta y fuentes propias y usa los tokens.

### 3.3 Componentes (misma API, rehechos por dentro)

Button (seis variantes: `default` azul, `secondary` vidrio, `outline`, `ghost`, `destructive`, `link`; tamaños sm/md/lg/icon), Input, Select, Slider, Tabs, Badge, Sheet, ConfirmDialog, PanelHead/Card/SectionLabel/ErrorNote, Metric, LoadState, Separator, ProgressBar, ThemeToggle. Foco visible con anillo de 2 px en el acento; altura de control 32 px (sm) / 36 px (md); transiciones de 120 ms.

Iconos: `Icon.tsx` deja los glifos Unicode y pasa a SVG propios (rejilla de 16 px, trazo 1,5, `currentColor`), misma prop `name`, sin dependencia nueva. Se añaden al menos: pacientes, estudios, pedido, taller, usuarios, cuentas pendientes, auditoría, compartir, reanudar, abrir, borrar, renombrar, subir, tema, salir, contraseña, menú, buscar, filtro, exportar, más, cerrar, atrás, chevron. Un test comprueba que todo `name` usado en el código existe.

Logotipo: marca «P» blanca sobre cuadrado redondeado azul y la palabra PROSPECTIVE en Geist 600, con «por SkullApp» debajo en apagado; versión solo marca para la barra lateral plegada. Sustituye a `VideoSplash`, al vídeo de marca y a la marca actual de la portada y de Entrar.

## 4. Shell C

`AppShell` (`frontend/src/components/shell/`) envuelve toda pantalla de gestión.

**Barra lateral** (40 px plegada, 220 px expandida): logotipo arriba; secciones Pacientes, Estudios, Pedidos de clips, Talleres; grupo «Administración» solo para `admin` con Usuarios, Cuentas pendientes (insignia con el número, de `GET /api/auth/pending`) y Auditoría; abajo el conmutador de tema y el avatar. Se expande al pasar el ratón (150 ms) o con Alt+B y se puede dejar fija; el estado se recuerda en `localStorage`. La sección activa se marca con `--brand-subtle`. El avatar abre el menú de usuario (vidrio): nombre completo, `@usuario · rol`, institución si la hay, la línea del rol (`lib/roles.ts`), «Cambiar contraseña», «Cerrar sesión». Con esto quedan hechas por construcción las fusiones 7, 10, 11, 12, 14 y 25 (un solo acceso a administración; sin botón de casa; sin «Solicitudes» duplicado).

**Barra superior** (48 px, vidrio): miga de pan con solo lo que existe («Pacientes / segura, Juan», «Usuarios», «Auditoría»; nunca «Administración» sin destino) y, a la derecha, las acciones del contexto que cada pantalla declara (Nuevo paciente, Nuevo caso, Exportar…). La búsqueda de pacientes baja a la cabecera de su tabla.

**Rutas**: se conservan `Screen` y `SCREEN_PATH`; `/app/solicitudes` pasa a `/app/cuentas-pendientes` con redirección de la antigua. El espacio de trabajo (`/app/sesion`) no lleva la barra lateral en F2: conserva `Topbar` y su carril; en F3 el shell se extiende a los ocho pasos.

## 5. Pantallas de gestión

Cada pantalla se rehace dentro del shell con sus filas F2 de la auditoría (`docs/superpowers/audits/2026-10-10-auditoria-funcional.md`, columna Destino = F2; 75 filas: Landing 9, Entrar 3, Crear cuenta 5, Pacientes 7, Ficha 7, Estudios 4, Nuevo caso 6, Usuarios 7, Solicitudes 3, Pedidos 3, Auditoría 6, Talleres 4, Menú de usuario y tema 7, Paso 1 · Carga 1, Guardar y reanudar 2, Usuario no administrador 1) y las 25 fusiones aprobadas de «Eliminaciones y fusiones propuestas» (1–14 y 25 son de gestión y entran aquí; 15 y 16, la barra del espacio de trabajo, van a F3; 17–24 ya se hicieron en F1a). El plan copia las filas literalmente en su apéndice. A ellas se suman los menores triados a F2 en F1a: título de la ficha («Editar paciente» también al consultar o con «No autorizado»), la dirección literal de `Landing.tsx` (→ `lib/contacto.ts`), test de la línea del rol en la hoja de edición, textos de «Crear cuenta», título de caso con «Estudio» de respaldo, y el vacío de «Cuentas pendientes» («solicitudes»).

- **Portada.** Misma estructura. Sin vídeo de marca al entrar ni «Suite clínica activa»; un solo lema en español en todo el producto; «Entrar» y «Crear cuenta» como únicos botones; «Ver cómo funciona»; «Sin instalar nada» una sola vez; sin listas de librerías; umbrales con coma y nombres de índices en español, citados de `thresholds.ts`; «Qué es» en tono para especialistas (se retira el glosario de divulgación); contacto desde `lib/contacto.ts`.
- **Entrar / Crear cuenta.** Panel de marca con el logotipo nuevo, sin librerías; se elimina `LoadingScreen` («Preparando el espacio de trabajo…»): se llega directo a Pacientes; «Volver a Entrar»; campos «DNI / NIE (opcional)», «Número de colegiado (opcional)», ORCID con ayuda y marcador que no parezca valor, «Repite la contraseña»; validación junto al campo; una línea que dice que la aprobación no se notifica y que hay que volver a intentar entrar.
- **Pacientes.** Cabecera con título, recuento con concordancia («1 paciente», «7 pacientes») y la búsqueda junto a la tabla; orden por última actividad (última sesión o creación); columnas Paciente · HC · Edad · Institución · Último caso · Última sesión (paso y fecha) · Acciones con «Reanudar» y «Abrir ficha»; clic en la fila abre la ficha; insignia «Compartido» cuando aplica; contadores sin mentir (Pacientes, Casos, Con caso, Sin caso); «Nuevo paciente» termina ofreciendo «Nuevo caso» para ese paciente; «Nuevo caso» termina ofreciendo «Planificar este caso».
- **Ficha.** Título con el nombre del paciente (y «Ficha de paciente» como rótulo), no «Editar paciente»; edad junto a la fecha de nacimiento; «Notas» como área de texto; «Guardar cambios» fijo al pie del bloque de datos; «Planificar este caso» como acción principal arriba; «Subir DICOM de este paciente» entra al paso 1 con el caso fijado; «Pedidos» con vuelta a la ficha; «Compartir con…» (sección 6.1); guardados con nombre editable, fecha y hora local, paso, tamaño en disco y «Borrar» con confirmación (sección 6.2).
- **Nuevo caso.** «Diagnóstico» con formato sugerido («Aneurisma basilar sacular») y la nota de que da nombre al caso; «Clínica» en lugar de «Síntomas positivos»; «Morfología» y «Tamaño» en dos campos; «Imágenes diagnósticas» sin «pipeline» y sin solape; error junto al campo; al guardar, ofrece «Planificar este caso».
- **Estudios.** Tarjeta con enlace a la ficha y «Borrar estudio» con confirmación; «Nueva sesión» con la nota de que la anterior se conserva; búsqueda «por paciente, HC o diagnóstico».
- **Pedidos de clips / Talleres.** Miga y vuelta a la ficha cuando se llega filtrado; detalle con enlace al caso; vacío sin «este filtro» cuando no hay pedidos; iconos correctos; Talleres junto a Pedidos en la barra lateral; «Nombre» sin rojo antes de escribir; aviso de la copia una sola vez.
- **Usuarios.** Rol sin rojo (insignia neutra); «Editar» con todos los campos del alta; alta corta (nombre, usuario, rol, contraseña) con el resto plegado y sin preselecciones; validación junto al campo; borrar cuenta con «Reasignar sus pacientes a…» (sección 6.4).
- **Cuentas pendientes.** Sin «solicitudes»; historial de aprobadas y rechazadas (las rechazadas con su fecha), no solo las pendientes.
- **Auditoría.** Título «Registro de auditoría» (sin SkullChain en el menú ni en la miga); filas desplegables con el detalle; filtro por paciente (sección 6.3); «Exportar» siempre visible y con cabecera en español; el hash plegado en el detalle.

## 6. Servidor

### 6.1 Compartir por paciente
Tabla `patient_shares (patient_id, user_id, shared_by, created_at)` con unicidad `(patient_id, user_id)`. `services/access.py`: `can_access_patient` y `own_patient_ids` admiten creador, compartidos y administrador (una sola función de visibilidad usada por pacientes, estudios, sesiones, pedidos y confirmaciones). Rutas `GET /api/patients/{id}/shares` (cuentas con las que está compartido) y `PUT /api/patients/{id}/shares` (lista completa de `user_id`; solo creador o administrador; los compartidos no pueden volver a compartir), `GET /api/auth/users/brief` (id, nombre, rol de las cuentas activas, para elegir con quién). Cada cambio deja un bloque de auditoría `PATIENT_SHARED`. La lista de pacientes devuelve `shared_with_count` y `is_shared_with_me`.

### 6.2 Guardados
`PATCH /api/sessions/saved/{id}` cambia `label`; `DELETE /api/sessions/saved/{id}` borra la carpeta de `session_saves`, su `.reapuntada` y la fila (rechaza con 409 si es el origen de la sesión viva abierta por quien borra; propietario del paciente o administrador). La lista de sesiones del paciente devuelve `size_bytes` (suma de la carpeta, calculada al listar y cacheada en la fila al guardar).

### 6.3 Auditoría
`GET /api/audit` acepta `patient_id`: el servidor calcula la huella (`sha256(str(id) + dob)`, como en `services/audit.py`) y filtra; el detalle (`payload_json`) ya viaja. `GET /api/audit/export` con cabecera en español y disponible sin verificar antes.

### 6.4 Borrar cuenta
`DELETE /api/auth/users/{id}?reassign_to=<user_id>` traspasa `created_by` de sus pacientes (y sus `patient_shares` como `shared_by`) antes de borrar; sin `reassign_to`, los pacientes pasan al administrador que borra (nunca quedan sin propietario). Bloque de auditoría `USER_DELETED` con el destino.

### 6.5 Contrato y pruebas
Contrato regenerado; `types.ts` a mano. Tests por tema, un fichero por proceso: `test_patient_shares.py` (tres roles, 403 del no invitado, el compartido no comparte), `test_saved_sessions_manage.py` (renombrar, borrar, 409 del origen vivo, tamaño), `test_audit_patient_filter.py`, `test_users_delete_reassign.py`; `test_auth_coverage.py` con las rutas nuevas.

## 7. Verificación

Vitest: cada componente rehecho conserva sus tests; cada pantalla actualiza los suyos con los textos nuevos; `copy.glosario.test.ts` amplía su rastreo a `components/shell/` y `components/`; nuevas suites de tokens (los dos temas definen los mismos nombres; ningún color literal en `pages/`), AppShell (secciones por rol, insignia, expansión y Alt+B, menú de usuario) e iconos. Cierre: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, backend tocado por fichero, contrato regenerado, y una lista manual corta sobre Case 3 en el navegador: entrar como `admin` (sin pantalla de carga), Pacientes (orden, columnas, Reanudar), ficha (edad, notas, guardados con tamaño, renombrar, borrar uno viejo), Compartir con `auditora` y comprobar como `auditora` que lo ve y no puede compartirlo, Pedidos con vuelta, administración (Usuarios, Cuentas pendientes, Auditoría con filtro por paciente y detalle), tema claro, y el espacio de trabajo abierto con los colores nuevos y su carril intacto.

## 8. Reparto en el plan

1 tokens + fuentes + tema por defecto · 2 iconos SVG y logotipo · 3 componentes base · 4 AppShell + rutas + menú de usuario · 5 portada · 6 Entrar y Crear cuenta · 7 servidor compartir · 8 servidor guardados · 9 servidor auditoría y borrar cuenta · 10 Pacientes · 11 Ficha · 12 Nuevo caso · 13 Estudios · 14 Pedidos y Talleres · 15 Usuarios y Cuentas pendientes · 16 Auditoría · 17 limpieza (fuentes viejas, `VideoSplash`, `LoadingScreen`, `landing.css`, README) · 18 cierre. 7–9 no tocan el frontend y van en paralelo con 5–6; 10–16 dependen de 1–4 y de su parte de servidor. Ejecución con desarrollo dirigido por subagentes, como F1a: brief con `file:line` y textos literales, implementador, revisor, rondas de arreglo, revisión final de la rama y una sola ola de arreglos.

## 9. Fuera de alcance

El espacio de trabajo y el visor (F3), incluidas la banda de cabecera (F3-a), la nota de coils (F3-b) y la coma decimal del panel de segmentación (F3-c); el modelo de guardado por copia completa (F3); la grabación completa de sesión (F4); notificaciones por correo (no hay infraestructura: se dice en pantalla).
