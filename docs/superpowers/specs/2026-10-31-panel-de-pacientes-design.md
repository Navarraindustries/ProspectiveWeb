# Panel de pacientes — diseño

Fecha: 2026-10-31. Estado: aprobado por el dueño en maqueta (dirección B, «tarjetas con panel lateral»), pendiente de revisión del documento.

## 1. Intención

La pantalla «Pacientes» es la primera que se ve al entrar y hoy es una tabla de siete columnas con cuatro cifras encima. Al dueño le sabe a lista genérica y desaprovecha la pantalla. Lo que uno quiere al abrirla es **pulsar un paciente y retomar el estudio donde lo dejó**; todo lo demás acompaña.

La pantalla pasa a ser un panel: tarjetas de paciente con la captura 3D del último guardado, el paso en que va y un botón que retoma, ordenadas por lo último que se tocó; y a la derecha un panel con las cifras del día, la actividad reciente y accesos directos.

## 2. Objetivos, no objetivos, antiobjetivos

**Objetivos**
- Retomar un estudio en un clic desde la primera pantalla, viendo antes de pulsar en qué paso está y cómo se ve.
- Que la pantalla «se vea bien»: usa el ancho, enseña imagen, se nota que hay trabajo detrás de cada paciente.
- Mantener todo lo que la lista ya hace: búsqueda, recuento honesto según el rol, insignias de compartido, avisos de «paciente creado» y «caso creado», abrir la ficha, borrar desde la ficha, errores con «Reintentar».

**No objetivos**
- No cambia la ficha del paciente, ni el flujo de planificación, ni el shell.
- No se añaden gráficas ni indicadores clínicos nuevos: las cifras del panel salen de datos que ya existen.
- No se rediseñan las demás pantallas de gestión (Estudios, Pedidos, Usuarios, Auditoría).

**Antiobjetivos** (si pasa, el trabajo ha fracasado aunque compile)
- Que una cuenta vea tarjetas, capturas o actividad de pacientes que no le pertenecen ni le han compartido.
- Que con 50 pacientes la pantalla tarde en abrir porque descarga 50 imágenes a la vez o pide la actividad paciente a paciente.
- Que el paciente recién creado o el que acaba de guardar una sesión no aparezca el primero.

## 3. Restricciones

- Identidad A y shell C de F2: tokens de `frontend/src/styles/tokens/`, sin colores escritos a mano en `pages/` ni en `components/shell/` (lo vigila `styles/tokens.test.ts`), Geist, radios y vidrio de los tokens.
- Textos en español, comentarios WHY en el código.
- Regla de visibilidad única de `backend/services/access.py` (creador, compartido, administrador) para todo dato nuevo del servidor.
- Derechos de una cuenta compartida (ruling T7-rights de F2): puede reanudar y trabajar; no borra ni comparte. La tarjeta no ofrece lo que la ficha no permite.
- Contrato OpenAPI regenerado si cambia un modelo (`export_openapi.py` → `npm run gen:api`; `types.ts` a mano).
- Imágenes siempre por el API autenticado (blob → URL de objeto, liberada al desmontar), nunca por URL pública.

## 4. Diseño

### 4.1 Disposición

Dentro del `AppShell` con la miga «Pacientes» y la acción «Nuevo paciente», tres bandas:

1. **Cabecera**: título «Pacientes» con el recuento de siempre («7 pacientes · tuyos o compartidos contigo» / «en la base de datos» para administradores), la búsqueda por nombre o HC, y tres pestañas de filtro: **Todos · Míos · Compartidos conmigo**. «Míos» son los que la cuenta creó (`owner_id`), también para administradores; «Compartidos conmigo» son los compartidos explícitamente con la cuenta (`is_shared_with_me`), no «todo lo que veo por ser administrador». Las pestañas solo se muestran si la cuenta tiene al menos un paciente compartido explícitamente con ella.
2. **Rejilla de tarjetas** (columna principal, ~2/3 del ancho): una tarjeta por paciente, ordenadas por última actividad (la última sesión guardada o, si no hay, el alta; es el orden actual). Tres columnas a partir de 1400 px, dos entre 1100 y 1400, una por debajo. Sin paginación: desplazamiento; con más de 24 pacientes la rejilla carga las capturas solo de las tarjetas visibles (ver 4.5).
3. **Panel lateral** (columna derecha, ~1/3, mínimo 300 px): tres bloques, «Hoy», «Actividad reciente» y «Accesos». Por debajo de 1100 px el panel pasa debajo de la rejilla, con «Hoy» en una fila de cifras y la actividad plegada tras un botón «Ver actividad».

Los estados de la pantalla se conservan: cargando (esqueletos de tarjeta, no texto), vacío honesto según el rol (el texto actual), error con «Reintentar» (el actual).

### 4.2 La tarjeta de paciente

De arriba abajo:
- **Captura**: imagen 16:9 con esquinas redondeadas. Fuente, por este orden: la última captura de imagen (no vídeo) de cualquier caso del paciente; si no hay, la vista previa de su último estudio de imagen archivado; si no hay, un fondo neutro del token `--muted` con el icono del paso. Encima, abajo a la izquierda, una píldora en vidrio con «Paso N · Nombre» (o «Sin sesión»). N y el nombre salen de `frontend/src/pipeline/steps.ts` (`last_session_step` es el índice); un índice fuera de la lista se acota al último paso.
- **Nombre** (Geist 600, 15 px) y debajo «HC · sexo · edad» con la insignia de riesgo del último guardado (`rupture_risk_label` de la sesión: «Riesgo bajo / moderado / alto» con `--success` / `--warning` / `--destructive`; sin insignia si no hay) y, si procede, «Compartido con N» o «Compartido contigo» (la fila no trae quién lo compartió; ruling P1 del plan).
- **Barra de progreso** del paso (N de 8; la 8 llena en `--success`).
- **Pie**: a la izquierda «Última sesión hace 2 d» (relativo, con la fecha exacta en `title`) o «Alta hace 1 semana»; a la derecha la **acción principal**, un solo botón:
  - «Reanudar» si hay sesión guardada y el paso no es Informe → reanuda esa sesión (lo que hoy hace «Reanudar» de la lista).
  - «Abrir informe» si la última sesión quedó en Informe → reanuda igual (la sesión abre en el paso 8).
  - «Planificar» si no hay sesión → abre la ficha del paciente, donde están «Planificar este caso» (por caso) y «Nuevo caso». Decisión del constructor: la tarjeta no conoce el caso, y «Planificar este caso» necesita uno.
- Toda la tarjeta es un enlace a la ficha (clic, Intro con foco); el botón de acción detiene la propagación. La tarjeta tiene `role="article"` con `aria-label` «{nombre}, HC {hc}».
- Una tarjeta en «Sin sesión» o compartida se dibuja igual, con la captura atenuada si no la hay.

### 4.3 Panel lateral

**Hoy** — cifras calculadas en el cliente a partir de la lista (sin llamadas nuevas), una fila por cifra:
- Pacientes (los que ve).
- En curso: con sesión guardada en un paso anterior a Informe.
- Con informe: última sesión en Informe.
- Sesiones esta semana: última sesión en los últimos 7 días.
- Compartidos contigo (solo si hay).
- **Cuentas pendientes** (solo administradores): número de cuentas con `status=pending` (`GET /api/auth/users?status=pending`), en `--warning` si es mayor que cero, con enlace a Cuentas pendientes.

**Actividad reciente** — las últimas 8 entradas de `GET /api/patients/activity` (4.4): «{paciente} · {acción en español}» y a la derecha el tiempo relativo. Clic → la ficha del paciente. Vacío: «Aún no hay actividad en tus pacientes.» Error: una línea «No se pudo cargar la actividad» con «Reintentar», sin tumbar el resto de la pantalla.

**Accesos** — botones fantasma: «Nuevo paciente», «Estudios», «Pedidos de clips», y para administradores «Usuarios» y «Auditoría». Son las entradas de `components/shell/sections.ts` que ya conoce el shell: la barra lateral sigue siendo el sitio principal; aquí son atajos.

### 4.4 Servidor

Dos cambios, ambos bajo la regla de visibilidad de `services/access.py`:

1. **`PatientSummary`** gana tres campos (solo la lista los rellena, como los `last_*` de F2):
   - `last_risk_label: str | None` — `rupture_risk_label` de la MISMA sesión que ya da `last_session_*` (la de `updated_at` más reciente); si esa no tiene riesgo, null y la tarjeta no pone insignia (no se busca en sesiones anteriores).
   - `last_capture_id: int | None` — la captura de IMAGEN (no vídeo) más reciente por `created_at` entre todos los casos del paciente, o null. Las capturas comparten la visibilidad del paciente, así que no hace falta otro filtro.
   - `last_imaging_study_id: int | None` — el estudio de imagen archivado más reciente QUE TENGA vista previa (`thumb_key`), o null; para la vista previa cuando no hay captura. (Un campo; el booleano sobra.)
   Todo en las mismas consultas agrupadas que ya calculan la última sesión (una por tabla, no una por paciente).
2. **`GET /api/patients/activity?limit=8`** — las últimas entradas de la cadena de auditoría cuyo `patient_hash` corresponde a un paciente visible para la cuenta (hash con `audit_patient(patient)`, igual que el filtro por paciente de F2). Se aceptan los límites de ese hash, ya conocidos desde F2: un bloque anterior a un cambio de HC o de fecha de nacimiento deja de casar, y un paciente sin HC casa por `id:N`; los bloques sin hash no entran. Dos fichas con la misma HC y fecha de nacimiento son, a efectos de la cadena, el mismo paciente: no se trata como fuga. Respuesta: lista de `{ patient_id, patient_name, action, label, at, username }` con `label` en español reutilizando el diccionario de `lib/auditoria.ts` en su equivalente del servidor (o el código, y el cliente etiqueta con `etiquetaAccion`: elección del constructor; lo que no puede pasar es que la pantalla enseñe códigos en inglés). Acciones incluidas: guardados de sesión, informes, capturas, lesión confirmada, dispositivo colocado, compartido, paciente/caso creados. **Hoy la cadena no registra el guardado de una sesión** (solo renombrar y borrar): el guardado (`POST /api/sessions/save`) añade un bloque `SESSION_SAVED` con `session_id`, `label` y `current_step` y el hash del paciente cuando la sesión lo tiene. Es un evento de auditoría legítimo (quién guardó qué y cuándo) y lo que hace que «guardé y aparece arriba» sea verdad en el panel. Excluidas: inicios de sesión y eventos de cuentas. No requiere administrador: cada cuenta ve solo la actividad de sus pacientes visibles.

### 4.5 Rendimiento y carga

- La lista de pacientes es una llamada, como hoy. La actividad es otra, en paralelo; las cuentas pendientes una tercera solo para administradores.
- Las capturas se piden por tarjeta, con `IntersectionObserver`: solo las tarjetas en pantalla (y una fila por debajo) descargan su imagen; las URL de objeto se liberan al desmontar. Sin captura ni vista previa no hay llamada.
- La búsqueda y las pestañas filtran en el cliente.

### 4.6 Accesibilidad

- Las tarjetas son focables y se activan con Intro; el botón de acción tiene su propio foco con el anillo global.
- Las cifras llevan su rótulo visible; las insignias de riesgo llevan texto, no solo color.
- Las imágenes llevan `alt=""` (decorativas; el texto de la tarjeta ya lo dice).

## 5. Lo que decide el constructor

- Cómo se parte `pages/Patients.tsx` (360 líneas): se espera `components/patients/PatientCard.tsx`, `components/patients/PatientsSidePanel.tsx` y los cálculos de cifras y orden en `lib/pacientes.ts` con tests propios; la página queda como orquestación.
- El tiempo relativo («hace 2 d», «ayer», «hace 1 semana») con un helper propio probado; por encima de 30 días se muestra la fecha.
- El esqueleto de carga y la transición de las imágenes al llegar.
- Si la etiqueta de la acción de auditoría se traduce en el servidor o en el cliente (4.4).
- El icono del paso en la captura neutra.

## 6. Pruebas

- `lib/pacientes.test.ts`: cifras de «Hoy» (en curso, con informe, semana, compartidos), orden por actividad, acción principal según estado, tiempo relativo.
- `components/patients/PatientCard.test.tsx`: los tres botones según estado; «Reanudar» no abre la ficha; la tarjeta abre la ficha con clic e Intro; captura → vista previa → neutro; insignias de riesgo y de compartido.
- `pages/Patients.test.tsx`: se reescriben los casos de la tabla (recuento, orden, Reanudar, abrir ficha, error y vacío por rol) sobre las tarjetas; pestañas de filtro; panel lateral con cifras; actividad con error aislado; cuentas pendientes solo para administradores.
- Backend: `test_patients_list.py` con los campos nuevos (captura más reciente, vista previa, riesgo) y visibilidad; `test_patients_activity.py` (visibilidad por cuenta, orden, límite, exclusión de eventos de cuentas); `test_openapi_contract.py` tras regenerar.
- Lista manual breve en el navegador con el Case 3: tarjeta con captura real, «Reanudar» retoma, panel con cifras, actividad con los eventos del día.

## 7. Fuera de alcance, para después

- Gráfica de actividad semanal o de casos por riesgo.
- Favoritos o «fijar» pacientes.
- Vista de lista compacta como alternativa a las tarjetas (si con muchos pacientes las tarjetas se quedan cortas, se añade un conmutador).
