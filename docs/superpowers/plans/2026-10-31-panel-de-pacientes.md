# Panel de pacientes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pantalla «Pacientes» pasa de tabla a panel: tarjetas con la captura 3D, el paso y «Reanudar», ordenadas por última actividad, y un panel lateral con cifras, actividad reciente y accesos.

**Architecture:** El servidor amplía `PatientSummary` con tres campos calculados en consultas agrupadas (riesgo, captura y vista previa más recientes), registra el guardado de sesión en la cadena de auditoría y expone `GET /api/patients/activity` filtrado por los pacientes visibles de la cuenta. El cliente parte `pages/Patients.tsx` en una página orquestadora, `components/patients/PatientCard.tsx`, `components/patients/PatientsSidePanel.tsx` y los cálculos puros de `lib/pacientes.ts`.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite) · React 19 + TypeScript · Vitest + Testing Library · pytest.

**Spec:** `docs/superpowers/specs/2026-10-31-panel-de-pacientes-design.md`

## Global Constraints

- Tokens de `frontend/src/styles/tokens/` y ningún color escrito a mano en `pages/` ni `components/shell/` (`styles/tokens.test.ts`); los componentes nuevos de `components/patients/` siguen la misma regla aunque la guarda no los recorra.
- Textos de interfaz en español; comentarios WHY en español en el código nuevo.
- Visibilidad de datos solo a través de `own_patient_ids` / `require_patient` de `backend/services/access.py`.
- Una cuenta compartida (ruling T7-rights) reanuda y planifica; la tarjeta no ofrece borrar ni compartir.
- Cada cambio de modelo Pydantic regenera el contrato: `cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json && cd ../frontend && npm run gen:api`; `frontend/src/api/types.ts` se espeja a mano.
- Imágenes por el API autenticado (blob → `URL.createObjectURL`, liberada al desmontar).
- Backend: cada fichero de test en su proceso (`cd backend && .venv/Scripts/python -m pytest <fichero> -q`). Frontend: `npx vitest run <ruta>`.
- Nunca `git push`; nunca commitear `backend/data/`; no stagear `frontend/package-lock.json`. Commits en español con los dos trailers de la sesión.

## Review Focus

1. Un paciente con captura solo de vídeo (sin PNG) → la tarjeta no debe intentar la captura: `last_capture_id` null y pasa a la vista previa. Test en la Tarea 1.
2. La cadena tiene bloques de cuentas (`USER_*`, `LOGIN`) con `patient_hash` vacío → nunca entran en la actividad, ni para un administrador. Test en la Tarea 3.
3. Un paciente compartido con la cuenta pero creado por otra → su actividad sí aparece (misma regla de visibilidad que la lista). Test en la Tarea 3.
4. La actividad falla (500) pero la lista carga → el panel muestra su línea de error con «Reintentar» y las tarjetas siguen. Test en la Tarea 6.
5. `last_session_step` igual o mayor que el número de pasos (un guardado de una versión futura) → la píldora dice el último paso y la acción es «Abrir informe», sin excepción. Test en la Tarea 4.

---

### Task 1: `PatientSummary` con riesgo, captura y vista previa más recientes

**Files:**
- Modify: `backend/models/patient.py:39-61` (clase `PatientSummary`)
- Modify: `backend/routers/patients.py:56-90` (`_patient_to_summary`) y `:124-190` (`list_patients`)
- Modify: `frontend/src/api/types.ts:210-233` (`PatientSummary`), `frontend/openapi.json`, `frontend/src/api/schema.gen.ts` (regenerados)
- Test: `backend/test_patients_list.py`

**Interfaces:**
- Produces: `PatientSummary.last_risk_label: str | None`, `PatientSummary.last_capture_id: int | None`, `PatientSummary.last_imaging_study_id: int | None`. Los tres son `None` fuera de la lista (crear/editar/adjuntar devuelven un paciente sin ellos, como los `last_session_*`).

- [ ] **Step 1: Tests que fallan** — en `backend/test_patients_list.py`, con los helpers `_paciente`, `_sesion` ya existentes y dos nuevos: `_captura(pid, imaging_study_id, cuando, media_type="image/png") -> int` (inserta `CaseCapture` con `storage_key="k"`) y `_imagen(pid, cuando, thumb_key="t") -> int` (inserta `ImagingStudy`; mira sus columnas `nullable=False` en `services/db_models.py:205-230` para rellenar lo obligatorio).

```python
def test_la_fila_trae_el_riesgo_de_la_misma_sesion_que_el_paso():
    # dos sesiones: la antigua con riesgo «Alto», la reciente sin riesgo → None (no se hereda)
    ...
    assert fila["last_session_step"] == 5 and fila["last_risk_label"] is None

def test_el_riesgo_sale_cuando_la_ultima_sesion_lo_tiene():
    ...
    assert fila["last_risk_label"] == "Moderado"

def test_la_captura_mas_reciente_es_de_imagen_y_de_cualquier_caso():
    # una captura PNG antigua en el caso A, un vídeo más reciente en el caso B → gana el PNG
    ...
    assert fila["last_capture_id"] == png_antiguo

def test_sin_png_la_captura_viene_vacia():
    ...
    assert fila["last_capture_id"] is None

def test_la_vista_previa_es_del_estudio_mas_reciente_con_miniatura():
    # imagen reciente sin thumb_key, imagen antigua con thumb_key → la antigua
    ...
    assert fila["last_imaging_study_id"] == con_miniatura

def test_los_campos_nuevos_no_rompen_la_fila_sin_nada():
    ...
    assert fila["last_risk_label"] is None and fila["last_capture_id"] is None and fila["last_imaging_study_id"] is None
```

Añade al test de consultas existente (el que cuenta sentencias con `event.listen`) que el número de consultas de la lista NO crece con el número de pacientes (mismo recuento con 1 y con 5 pacientes).

- [ ] **Step 2: Comprobar que fallan** — `cd backend && .venv/Scripts/python -m pytest test_patients_list.py -q` → fallos por `KeyError`/campo ausente.
- [ ] **Step 3: Implementar** — en `models/patient.py` los tres campos con `Field(None, description=…)` en español. En `routers/patients.py`: `_patient_to_summary(..., last_capture_id: int | None = None, last_imaging_study_id: int | None = None)` y `last_risk_label=last_session.rupture_risk_label if last_session else None`. En `list_patients`, dos subconsultas agrupadas más, con el mismo patrón `func.max(...)` + join que `ult_ses`: `CaseCapture` filtrada por `media_type == "image/png"` y `patient_id.isnot(None)` (máximo de `created_at`, desempate por id mayor), e `ImagingStudy` filtrada por `thumb_key != ""` (máximo de `created_at`). Ambas filtradas por `visibles` cuando no es `None`.
- [ ] **Step 4: Pasan** — mismo comando → todo en verde. También `test_access_control.py` y `test_patient_shares.py`.
- [ ] **Step 5: Regenerar el contrato** (comando de Global Constraints) y espejar los tres campos en `frontend/src/api/types.ts` con comentarios en español; `cd frontend && npx tsc --noEmit`; `cd backend && .venv/Scripts/python -m pytest test_openapi_contract.py -q`.
- [ ] **Step 6: Commit** — `Pacientes (1): la fila trae riesgo, captura y vista previa más recientes`.

---

### Task 2: El guardado de una sesión deja bloque de auditoría

**Files:**
- Modify: `backend/services/audit.py:47-48` (constante nueva), `backend/routers/session_state.py:255-275` (tras el commit del guardado)
- Modify: `frontend/src/lib/auditoria.ts:7-48` (rótulo del código nuevo)
- Test: `backend/test_saved_sessions_manage.py`, `frontend/src/lib/auditoria.test.ts` (si no existe, créalo)

**Interfaces:**
- Produces: `ACT_SESSION_SAVED = "SESSION_SAVED"`; payload `{"session_id": str, "label": str, "current_step": int}`; `username` del `current_user` si lo hay; `**audit_patient(patient)` cuando `ps.patient_id` no es `None` (sin paciente, sin hash).

- [ ] **Step 1: Test que falla** — en `test_saved_sessions_manage.py`, con los helpers del fichero para guardar una sesión adjunta a un paciente:

```python
def test_guardar_deja_un_bloque_session_saved_con_el_paciente():
    ...  # guardar vía POST /api/sessions/save con patient_id
    bloques = SkullChain.instance().get_blocks(patient_hash_for(args["patient_id"], args["patient_dob"]))
    ultimo = [b for b in bloques if b["action"] == "SESSION_SAVED"][-1]
    payload = json.loads(ultimo["payload_json"])
    assert payload["session_id"] == sid and payload["current_step"] == 3 and payload["label"]

def test_guardar_sin_paciente_deja_bloque_sin_hash():
    ...
    assert ultimo["patient_hash"] == ""   # o el valor que la cadena usa para «sin paciente»; mira patient_hash_for("", "")
```

En `frontend/src/lib/auditoria.test.ts`: `expect(etiquetaAccion("SESSION_SAVED")).toBe("Sesión guardada")`.

- [ ] **Step 2: Fallan** — `pytest test_saved_sessions_manage.py -q`; `npx vitest run src/lib/auditoria.test.ts`.
- [ ] **Step 3: Implementar** — constante en `audit.py`; en `save_session`, justo después del `logger.info("Session saved …")`, `audit_append(ACT_SESSION_SAVED, {...}, username=…, **(audit_patient(db.get(Patient, ps.patient_id)) if ps.patient_id else {}))`. WHY: el panel de pacientes enseña «guardé y aparece arriba» y la auditoría no tenía el guardado. Rótulo `SESSION_SAVED: "Sesión guardada"` en `auditoria.ts`.
- [ ] **Step 4: Pasan** — los dos comandos; además `pytest test_audit.py -q` y `test_session_d.py`.
- [ ] **Step 5: Commit** — `Pacientes (2): guardar una sesión deja bloque de auditoría SESSION_SAVED`.

---

### Task 3: `GET /api/patients/activity`

**Files:**
- Modify: `backend/services/audit.py:212-224` (método nuevo en `SkullChain`), `backend/routers/patients.py` (ruta nueva, ANTES de `/{patient_id}` para que no la capture), `backend/models/patient.py` (modelo de respuesta)
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/client.ts:458` (función nueva), contrato regenerado
- Test: `backend/test_patients_activity.py` (nuevo; copia la cabecera de entorno de `test_audit_patient_filter.py:1-20` y `_medico` de `test_access_control.py`)

**Interfaces:**
- Produces: `SkullChain.get_recent(patient_hashes: set[str], limit: int, exclude_actions: set[str]) -> list[dict]` (bloques más recientes primero, solo los cuyo `patient_hash` está en el conjunto). Modelo `PatientActivity { patient_id: int, patient_name: str, action: str, at: str (iso_ts), username: str }`. Ruta `GET /api/patients/activity?limit=8` (`limit` 1–50) → `list[PatientActivity]`. Cliente: `api.patientsActivity(limit = 8): Promise<PatientActivity[]>`. El rótulo en español lo pone el cliente con `etiquetaAccion(action)` (decisión: un solo diccionario, el que ya existe).
- Excluidas: toda acción que empiece por `USER_`, más `LOGIN`, `INTEGRITY_CHECK`, `GENESIS`, `password_change`, `password_reset`.

- [ ] **Step 1: Tests que fallan** — `backend/test_patients_activity.py`:

```python
def test_solo_la_actividad_de_los_pacientes_visibles_mas_reciente_primero(): ...
    # médico A con paciente propio P1 y P2 compartido por B; paciente P3 de B sin compartir.
    # bloques: P3 (SESSION_SAVED), P1 (CAPTURE_SAVED), P2 (REPORT_GENERATED) en ese orden.
    # → [P2, P1]; con patient_name y username; P3 no aparece.
def test_los_eventos_de_cuentas_y_sin_hash_no_entran(): ...   # USER_CREATED, LOGIN con hash vacío → no salen ni al admin
def test_el_limite_se_respeta_y_se_acota(): ...               # limit=2 → 2; limit=0 → 422; limit=99 → 422
def test_el_administrador_ve_la_de_todos(): ...
def test_anonimo_401(): ...
```

- [ ] **Step 2: Fallan** — `pytest test_patients_activity.py -q` → 404/ImportError.
- [ ] **Step 3: Implementar** — `get_recent` con SQL `WHERE patient_hash IN (…) ORDER BY id DESC LIMIT ?` (trocea el `IN` si hay más de 900 hashes). En la ruta: `visibles = own_patient_ids(db, current_user)`; pacientes = todos si `None` (admin) o `Patient.id.in_(visibles)`; `hash → Patient` con `audit_patient` + `patient_hash_for`; bloques → modelo, con `patient_name=p.full_name`. WHY del hash en el código (límites aceptados en la spec §4.4).
- [ ] **Step 4: Pasan** — el fichero; `test_patients_list.py`; `test_access_control.py`.
- [ ] **Step 5: Contrato + cliente** — regenerar; `types.ts` con `PatientActivity`; `client.ts` `patientsActivity`; `npx tsc --noEmit`; `pytest test_openapi_contract.py -q`.
- [ ] **Step 6: Commit** — `Pacientes (3): actividad reciente de los pacientes visibles`.

---

### Task 4: Cálculos puros de la pantalla: `lib/pacientes.ts`

**Files:**
- Create: `frontend/src/lib/pacientes.ts`
- Modify: `frontend/src/pages/Patients.tsx:25-48` (mover `recuentoPacientes`, `ultimaActividad`, `ultimaSesion` a la lib y reexportar o importar)
- Test: `frontend/src/lib/pacientes.test.ts`

**Interfaces:**
- Produces:
  - `recuentoPacientes(n: number): string`, `ultimaActividad(p: PatientSummary): number` (movidas, mismo comportamiento).
  - `tiempoRelativo(iso: string, ahora?: Date): string` → «hace un momento» (<60 s), «hace N min», «hace N h», «ayer», «hace N d» (2–6), «hace 1 semana»…«hace 4 semanas» (7–29 d), a partir de 30 d la fecha local `dd/mm/aa`.
  - `pasoDeTarjeta(step: number | null): { n: number; label: string } | null` → `null` sin sesión; índice acotado con `clampStep` de `pipeline/steps.ts`; `n = índice + 1`, `label = STEPS[i].label`.
  - `accionPrincipal(p: PatientSummary): "reanudar" | "abrir-informe" | "planificar"` → sin `last_session_id` → `planificar`; paso acotado igual al último (`STEPS.length - 1`) → `abrir-informe`; si no → `reanudar`.
  - `resumenHoy(ps: PatientSummary[], ahora?: Date): { pacientes: number; enCurso: number; conInforme: number; semana: number; compartidos: number }` (semana = `last_session_at` en los últimos 7 días).
  - `filtraPestana(ps, pestana: "todos" | "mios" | "compartidos", userId: number | null)` → `mios` = `owner_id === userId`; `compartidos` = `is_shared_with_me`.
  - `hayCompartidos(ps): boolean` = alguno con `is_shared_with_me`.

- [ ] **Step 1: Tests que fallan** — `lib/pacientes.test.ts`, con una fábrica `paciente(extra)` que rellene `PatientSummary`:

```ts
it("tiempoRelativo: minutos, horas, ayer, días, semanas y fecha", …)   // 30 s, 5 min, 3 h, 26 h, 3 d, 9 d, 45 d → "12/09/26"
it("pasoDeTarjeta: null sin sesión; índice 2 → { n: 3, label: 'Detección' }; 99 → último paso", …)
it("accionPrincipal: planificar sin sesión, abrir-informe en el último paso o más allá, reanudar en medio", …)
it("resumenHoy cuenta en curso, con informe, semana y compartidos", …)
it("filtraPestana: mios por owner_id, compartidos por is_shared_with_me, todos devuelve todo", …)
it("hayCompartidos", …)
```

- [ ] **Step 2: Fallan** — `npx vitest run src/lib/pacientes.test.ts`.
- [ ] **Step 3: Implementar** las firmas de arriba en `lib/pacientes.ts`; mover las tres funciones desde `Patients.tsx` (la página las importa de la lib; sus tests siguen pasando).
- [ ] **Step 4: Pasan** — el fichero y `src/pages/Patients.test.tsx`.
- [ ] **Step 5: Commit** — `Pacientes (4): cálculos de la pantalla en lib/pacientes.ts`.

---

### Task 5: La tarjeta de paciente

**Files:**
- Create: `frontend/src/components/patients/PatientCard.tsx`, `frontend/src/components/patients/useVisible.ts`, `frontend/src/components/patients/patients.css`
- Test: `frontend/src/components/patients/PatientCard.test.tsx`, `frontend/src/components/patients/useVisible.test.tsx`

**Interfaces:**
- Consumes: Tarea 4 (`pasoDeTarjeta`, `accionPrincipal`, `tiempoRelativo`); `api.captureObjectUrl(id)`, `api.studyThumbnailObjectUrl(id)`; `Badge`/`riskVariant` de `components/Badge.tsx`; `Button`, `Icon`.
- Produces: `PatientCard({ patient, onOpen, onResume, onPlan }: { patient: PatientSummary; onOpen: (p) => void; onResume: (sessionId: string, p) => void; onPlan: (p) => void })`. `useVisible(ref, rootMargin = "320px"): boolean` (IntersectionObserver; `true` de inmediato en entornos sin `IntersectionObserver`, como jsdom).
- Clases CSS en `patients.css`: `.pt-card`, `.pt-card-media`, `.pt-card-pill`, `.pt-card-body`, `.pt-card-bar`, `.pt-card-foot`; solo tokens.

- [ ] **Step 1: Tests que fallan** — `PatientCard.test.tsx` (mock de `../../api/client` con `captureObjectUrl`/`studyThumbnailObjectUrl` que devuelven `"blob:x"`; `URL.createObjectURL`/`revokeObjectURL` stubs):

```ts
it("con sesión en Detección: píldora «Paso 3 · Detección», barra al 37 %, botón «Reanudar» que no abre la ficha", …)
it("con la sesión en Informe: botón «Abrir informe» que reanuda esa sesión", …)
it("sin sesión: «Sin sesión», botón «Planificar» que llama a onPlan", …)
it("la tarjeta abre la ficha con clic y con Intro; tiene role article y aria-label «{nombre}, HC {hc}»", …)
it("captura: pide captureObjectUrl si hay last_capture_id; si no, la vista previa; si no, nada y pinta el icono del paso", …)
it("insignias: riesgo con texto y variante, «Compartido por {n}» o «Compartido con N»", …)
it("la URL de objeto se libera al desmontar", …)
```

`useVisible.test.tsx`: sin `IntersectionObserver` devuelve `true`; con un stub, `false` hasta que el callback entrega `isIntersecting: true`.

- [ ] **Step 2: Fallan.**
- [ ] **Step 3: Implementar** según spec §4.2: la imagen se pide solo cuando `useVisible` es `true`; `alt=""`; píldora en `--glass`; barra `(n/STEPS.length)` con `--primary` y `--success` en el último paso; pie con `tiempoRelativo(last_session_at ?? created_at)` («Última sesión …» / «Alta …») y `title` con la fecha completa; el botón detiene la propagación. Nota de compartido: `is_shared_with_me` → «Compartido contigo» (la fila no trae el nombre de quien compartió; no se inventa), `shared_with_count > 0` → «Compartido con N».
- [ ] **Step 4: Pasan.**
- [ ] **Step 5: Commit** — `Pacientes (5): tarjeta de paciente con captura, paso y acción`.

---

### Task 6: El panel lateral

**Files:**
- Create: `frontend/src/components/patients/PatientsSidePanel.tsx`
- Modify: `frontend/src/components/patients/patients.css`
- Test: `frontend/src/components/patients/PatientsSidePanel.test.tsx`

**Interfaces:**
- Consumes: Tarea 3 (`api.patientsActivity`), Tarea 4 (`resumenHoy`, `tiempoRelativo`), `etiquetaAccion` de `lib/auditoria.ts`, `api.listUsers("pending")`, `useNav().go`, `useAuth().user`.
- Produces: `PatientsSidePanel({ patients, loading, onOpenPatient, onNewPatient }: { patients: PatientSummary[]; loading: boolean; onOpenPatient: (id: number) => void; onNewPatient: () => void })`. Bloques con `aria-labelledby`: «Hoy», «Actividad reciente», «Accesos».

- [ ] **Step 1: Tests que fallan** (mocks de `../../api/client`, `../../store/auth`, `../../store/nav` como en `components/shell/UserMenu.test.tsx`):

```ts
it("Hoy: pacientes, en curso, con informe, semana; «Compartidos contigo» solo si hay", …)
it("Hoy: «Cuentas pendientes» solo para administradores, en aviso si > 0, y lleva a cuentas pendientes", …)
it("Actividad: 8 entradas «{paciente} · {rótulo}» con tiempo relativo; clic abre la ficha", …)
it("Actividad vacía: «Aún no hay actividad en tus pacientes.»", …)
it("Actividad con error: la línea de error y «Reintentar» vuelve a pedirla; las cifras siguen", …)
it("Accesos: Nuevo paciente, Estudios, Pedidos de clips; Usuarios y Auditoría solo al administrador; cada uno navega", …)
```

- [ ] **Step 2: Fallan.**
- [ ] **Step 3: Implementar** según spec §4.3; la actividad se pide al montar (`limit 8`) y con «Reintentar»; `listUsers("pending")` solo si `user.role === "admin"`, su fallo deja la cifra en «—» sin error visible.
- [ ] **Step 4: Pasan.**
- [ ] **Step 5: Commit** — `Pacientes (6): panel lateral con cifras, actividad y accesos`.

---

### Task 7: La página como panel

**Files:**
- Modify: `frontend/src/pages/Patients.tsx` (sustituir las cifras y la tabla por cabecera + rejilla + panel; conservar avisos, hojas, `?paciente=`, errores)
- Modify: `frontend/src/components/patients/patients.css` (rejilla y puntos de corte 1400 / 1100 px)
- Test: `frontend/src/pages/Patients.test.tsx` (reescribir los casos de la tabla)

**Interfaces:**
- Consumes: Tareas 4, 5 y 6. Props de `Patients` sin cambios (`App.tsx:246-252` no se toca).
- Produces: `data-testid="pacientes-rejilla"` en la rejilla; pestañas con `role="tablist"` y `aria-selected`.

- [ ] **Step 1: Tests que fallan** — en `Patients.test.tsx`, dentro de `describe("la lista de pacientes (F2)")` y los demás bloques que hoy miran la tabla:

```ts
it("el recuento concuerda: «Ningún paciente», «1 paciente», «7 pacientes»", …)        // se mantiene
it("ordena por última actividad: la primera tarjeta es la última sesión o, si no hay, el alta", …)
it("«Reanudar» de la tarjeta reanuda esa sesión sin abrir la ficha; la tarjeta e Intro abren la ficha", …)
it("las pestañas solo aparecen con algún compartido; «Míos» y «Compartidos conmigo» filtran", …)
it("la búsqueda filtra por nombre y HC; sin coincidencias dice «Ningún paciente coincide con la búsqueda.»", …)
it("cargando: esqueletos, no texto; error: el mensaje y «Reintentar» vuelve a llamar", …)   // F1-2, F1-29 se mantienen
it("vacío por rol: los dos textos de siempre", …)                                           // F1-253 se mantiene
it("el panel lateral está y el aviso de «Paciente creado» sigue ofreciendo crear el caso", …)
```

Borra los casos de columnas (`las siete columnas…`) y `«Abrir ficha»`.

- [ ] **Step 2: Fallan.**
- [ ] **Step 3: Implementar** según spec §4.1: `PanelHead` con el recuento; fila con `Input` de búsqueda y las pestañas (`filtraPestana`, `hayCompartidos`); `<section className="pt-layout">` con la rejilla (`PatientCard` por paciente de `rows`; `onPlan` abre la ficha con `openSheet(p.id)`: la tarjeta no conoce el caso, y la ficha tiene «Planificar este caso» y «Nuevo caso») y `PatientsSidePanel`. Esqueleto: 6 tarjetas `.pt-card--skeleton`. Quita `COLUMNAS`, `celda`, la tabla y las cuatro `Card` de cifras. CSS: `.pt-layout { display:grid; grid-template-columns: minmax(0,1fr) 320px }`; rejilla `repeat(3, 1fr)` ≥1400, `repeat(2, 1fr)` 1100–1400; bajo 1100 una columna y el panel debajo (`grid-template-columns: 1fr`).
- [ ] **Step 4: Pasan** — `npx vitest run src/pages/Patients.test.tsx src/components/patients src/lib/pacientes.test.ts src/styles/tokens.test.ts`; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `Pacientes (7): la pantalla como panel de tarjetas con panel lateral`.

---

### Task 8: Cierre

**Files:**
- Modify: `frontend/README.md` o `docs/` si describen la pantalla de pacientes (grep «tabla» / «Pacientes»).
- Create: `docs/superpowers/audits/2026-10-31-lista-manual-pacientes.md`

- [ ] **Step 1: Suites** — `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`; backend, uno por proceso: `test_patients_list.py`, `test_patients_activity.py`, `test_saved_sessions_manage.py`, `test_audit.py`, `test_audit_patient_filter.py`, `test_access_control.py`, `test_patient_shares.py`, `test_openapi_contract.py`, `test_session_d.py`.
- [ ] **Step 2: Lista manual** (controlador, con los servidores del dueño y el Case 3): la tarjeta de «segura, Juan» con captura real o vista previa, paso y «Reanudar» que retoma; panel «Hoy» con las cifras; «Actividad reciente» con el guardado de hoy arriba tras «Guardar progreso»; pestañas solo si hay compartidos (probar como `auditora`); error de actividad aislado (apagar el backend un momento NO: simular con DevTools bloqueando `/api/patients/activity`); 1100 px → panel debajo. Resultados en el fichero.
- [ ] **Step 3: Commit** — `Pacientes (8): cierre con suites y lista manual` y menú de cierre.
