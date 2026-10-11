# Arreglos F1a · fondo y clínica — plan de ejecución

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar las 226 filas F1 en alcance de la auditoría funcional (todas las familias de arreglo y las filas sueltas del espacio de trabajo), más las eliminaciones y fusiones aprobadas que les corresponden, con una prueba por cambio.

**Architecture:** Un arreglo por familia (un cambio compartido aplicado en todos sus sitios) y un arreglo por paso del espacio de trabajo para las filas sueltas. El backend gana comprobaciones de dueño, la tabla PHASES publicada, el guardado sobre la sesión de origen y una restauración completa; el frontend gana tres piezas compartidas (`LoadState`, `fecha.ts`, confirmación antes de borrar) y la copia nueva de cada paso. Nada visual: lo que dependa del armazón nuevo ya está en F2/F3.

**Tech Stack:** FastAPI + SQLAlchemy + pytest (un archivo por proceso); React 19 + Vitest + Testing Library; contrato OpenAPI regenerado cuando cambie el backend.

**Spec:** `docs/superpowers/specs/2026-10-10-auditoria-funcional-design.md` §5 (arreglos F1) y el informe `docs/superpowers/audits/2026-10-10-auditoria-funcional.md` («Arreglos F1 propuestos», «Familias de arreglo», «Eliminaciones y fusiones propuestas», todas aprobadas el 2026-10-11).

**Anexo de filas (léase por familia, no entero):** `docs/superpowers/plans/2026-10-11-arreglos-f1a-filas.md`. Cada tarea cita sus filas como «F1-n»; el anexo tiene el texto exacto del cambio, el archivo probable y la prueba que lo fija. **El texto del anexo manda** sobre cualquier resumen de este plan.

## Global Constraints

- Copia en español, nombres de pantalla y botones entre « » como en el anexo; los textos nuevos se copian del anexo **literalmente**.
- Comentarios en el código con el porqué (qué fallaba y qué espera la persona), no con el qué.
- Backend: pruebas pytest, un archivo por proceso, patrón de `backend/test_access_control.py` (`anonymous_client(app)` + `create_access_token`) para usuarios con rol. Fallos ambientales conocidos que no se tocan: `test_apposition.py`, `test_followup.py`, `test_corredor_abordaje.py`, allowlist de `test_auth_coverage`.
- Frontend: Vitest + Testing Library, `vi.mock` del store y del cliente como en `PhasesCalculator.test.tsx`; `npx tsc -p frontend --noEmit` limpio; `npm run build` al final.
- Contrato: si cambia un modelo o una ruta del backend, `cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json && cd ../frontend && npm run gen:api`, luego tsc y `pytest test_openapi_contract.py`.
- Nunca `git push`; nunca commit de `backend/data/`; nunca stage de `frontend/package-lock.json`. Rama `arreglos-f1a` desde master 7c64bd7. Commits en español con las dos líneas finales `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM`.
- Servidores de desarrollo: no se reinician ni se paran desde las tareas; las pruebas no los necesitan. La Tarea 7 es la única que corre el backend aparte, y lo hace en un puerto propio.
- Reglas de la auditoría vigentes: perder trabajo hecho a mano sin aviso ni deshacer es «bloquea»; exponer datos de otro profesional es «bloquea»; E5 solo para lo del visor ya planificado.
- Las 25 eliminaciones y fusiones están aprobadas: las filas «Condicionado a la decisión nº N» se ejecutan. La 24 (coils) con la condición de que el montaje sugerido quede editable coil a coil.

## Review Focus

1. **Un usuario «Médico» abre un paciente ajeno por URL** (`/app/pacientes?paciente=1`): la ficha debe decir «No autorizado sobre este paciente» y no mostrar nada (Tarea 3 lo fija en backend y la Tarea 8 en la pantalla).
2. **Reanudar y pulsar «Guardar progreso»** no debe crear una fila nueva en «Sesiones guardadas» (Tarea 4).
3. **Reanudar devuelve la decisión, el corredor, el clip editable y la ventana** sin rehacer nada (Tarea 5); si falta un dato, lo dice.
4. **Un 500 o un servidor caído** no deja un panel vacío ni un «CARGANDO…» eterno: aparece el error y un «Reintentar» (Tareas 6 y 8).
5. **Un PHASES de 10,9 mm da 10 puntos y 5,3 %**, y un diámetro de 9,5 mm avisa de que cruza la banda (Tarea 1).

---

### Task 1: Familias I, H y AC — tabla PHASES publicada y el diámetro junto al corte

**Filas:** F1-16, F1-17, F1-23 (I); F1-13, F1-14, F1-15, F1-157 (H); F1-68, F1-151, F1-234 (AC).

**Files:**
- Modify: `backend/services/phases.py`, `backend/services/treatment.py` (notas que citan el PHASES), `backend/services/report_generator.py` (la línea del PHASES en el PDF), `frontend/src/components/morphometry/PhasesCalculator.tsx`, `frontend/src/components/morphometry/MorphometryPanel.tsx` (filas Ø y «Riesgo»), `frontend/src/components/planning/TreatmentPanel.tsx` (nota del PHASES)
- Test: `backend/test_phases_published.py` (nuevo), `frontend/src/components/morphometry/PhasesCalculator.test.tsx`, `frontend/src/components/morphometry/MorphometryPanel.test.tsx`

**Interfaces:**
- Produces: `compute_phases` con los puntos y riesgos de Greving 2014; `PhasesResult` sin cambios de forma (el contrato no cambia).

- [ ] **Step 1: Prueba de la tabla publicada (falla)**

```python
# backend/test_phases_published.py
"""PHASES según Greving et al. 2014 (F1-16): la tabla anterior daba 5 puntos a 10–19,9 mm y desplazaba el riesgo un escalón."""
from models.phases import PhasesRequest
from services.phases import compute_phases


def _req(**kw):
    base = dict(population="other", hypertension=False, age_years=27, size_mm=10.9, earlier_sah=False, site="aca_pcom_posterior")
    base.update(kw)
    return PhasesRequest(**base)


def test_caso_3_da_10_puntos_y_5_3_por_ciento():
    r = compute_phases(_req())
    assert (r.size_pts, r.site_pts, r.total_score, r.risk_5yr_pct) == (6, 4, 10, 5.3)


def test_puntos_por_tamano_publicados():
    assert [compute_phases(_req(size_mm=s)).size_pts for s in (6.9, 7.0, 9.9, 10.0, 19.9, 20.0)] == [0, 3, 3, 6, 6, 10]


def test_hsa_previa_vale_un_punto():
    assert compute_phases(_req(earlier_sah=True)).sah_pts == 1


def test_columna_de_riesgo_publicada():
    esperado = {0: 0.4, 1: 0.4, 2: 0.4, 3: 0.7, 4: 0.9, 5: 1.3, 6: 1.7, 7: 2.4, 8: 3.2, 9: 4.3, 10: 5.3, 11: 7.2, 12: 17.8, 22: 17.8}
    for total, pct in esperado.items():
        # Monta una petición que sume exactamente `total` con los factores disponibles.
        kw = dict(population="other", hypertension=False, age_years=27, size_mm=0.0, earlier_sah=False, site="ica")
        resto = total
        if resto >= 10: kw["size_mm"], resto = 20.0, resto - 10
        elif resto >= 6: kw["size_mm"], resto = 10.0, resto - 6
        elif resto >= 3: kw["size_mm"], resto = 7.0, resto - 3
        if resto >= 5: kw["population"], resto = "finland", resto - 5
        elif resto >= 3: kw["population"], resto = "japan", resto - 3
        if resto >= 4: kw["site"], resto = "aca_pcom_posterior", resto - 4
        elif resto >= 2: kw["site"], resto = "mca", resto - 2
        if resto >= 1: kw["hypertension"], resto = True, resto - 1
        if resto >= 1: kw["age_years"], resto = 70, resto - 1
        if resto >= 1: kw["earlier_sah"], resto = True, resto - 1
        assert resto == 0, total
        r = compute_phases(PhasesRequest(**kw))
        assert r.total_score == total and r.risk_5yr_pct == pct, (total, r.total_score, r.risk_5yr_pct)
```

Run: `cd backend && .venv/Scripts/python -m pytest test_phases_published.py -q` → FAIL (5 puntos, 5.9 %).

- [ ] **Step 2: Tabla publicada**

```python
# backend/services/phases.py — sustituir _RISK_5YR, _size_points y el punto de HSA
# Greving 2014, tabla 3: puntos por tamaño 0 / 3 / 6 / 10 y HSA previa 1. La
# tabla anterior (5 / 6 y 4) venía del panel de escritorio y la columna de
# riesgo estaba corrida un escalón: un 10 daba 7,8 % en vez de 5,3 %.
_RISK_5YR = {0: 0.4, 1: 0.4, 2: 0.4, 3: 0.7, 4: 0.9, 5: 1.3, 6: 1.7, 7: 2.4, 8: 3.2, 9: 4.3, 10: 5.3, 11: 7.2}
_RISK_12_PLUS = 17.8   # la publicación agrupa ≥ 12 (máximo posible: 22)


def _size_points(size_mm: float) -> int:
    if size_mm < 7.0:
        return 0
    if size_mm < 10.0:
        return 3
    if size_mm < 20.0:
        return 6
    return 10
```

En `compute_phases`: `sah = 1 if req.earlier_sah else 0` y `risk = _RISK_5YR.get(total, _RISK_12_PLUS)`. Las bandas 2 % / 7 % se conservan (son de la app) y el docstring lo dice.

- [ ] **Step 3: Diámetro junto al corte (H) y riesgo frente a PHASES (AC)**

En `PhasesCalculator.tsx`: bajo «Tamaño (mm)», una línea que diga qué diámetro se usa («Ø máximo medido 10,9 mm») y, cuando el valor esté a menos de 1 mm de 7, 10 o 20 mm, el aviso literal del anexo F1-15 («…está junto al corte de 10 mm: con 9,5 mm el PHASES baja de 10 a 7 puntos» con las cifras reales). En `MorphometryPanel.tsx`: las filas de F1-13 y F1-14 según el anexo (Ø máximo con la línea «junto al corte», Ø del cuerpo visible junto al máximo) y la fila «Riesgo» de F1-68/F1-151 («Riesgo morfométrico (forma)» separado del PHASES, con la frase del anexo). En `TreatmentPanel.tsx` y el PDF (F1-234, F1-23): la cifra del PHASES se lee de `phases.json` y se rotula «PHASES n · x,x % a 5 años (Greving 2014)».

- [ ] **Step 4: Pruebas de frontend**

`PhasesCalculator.test.tsx`: con `maxDiameterMm={9.5}` aparece el aviso con «10 mm» y «7 puntos»; con `10.9` aparece «Ø máximo medido». `MorphometryPanel.test.tsx`: la fila «Riesgo morfométrico (forma)» existe y no dice «PHASES».

- [ ] **Step 5: Ejecutar, contrato si cambió un modelo (no debería), commit** — `Arreglos F1a: tabla PHASES publicada y diámetro junto al corte (familias I, H, AC)`.

---

### Task 2: Familias J, N y O — una localización, un umbral por índice y el sentido del BF

**Filas:** F1-165, F1-173, F1-210 (J); F1-160, F1-161, F1-163, F1-180 (N); F1-162, F1-179 (O). Ejecuta la fusión aprobada nº 21.

**Files:**
- Create: `frontend/src/components/morphometry/thresholds.ts` (umbrales de AR, DNR, BF, SR con su etiqueta y su fuente, una sola vez), `frontend/src/components/morphometry/thresholds.test.ts`
- Modify: `frontend/src/store/planning.tsx` (`aneurysmSite: AneurysmLocation | null` + `setAneurysmSite`, se guarda con la sesión en `clinical.site` vía `api.setClinicalSite` → nueva ruta `PUT /api/morphometry/{sid}/site` en `backend/routers/detect.py` que escribe `clinical.site`), `MorphometryPanel.tsx` (el selector único «Localización» arriba de las pestañas), `PhasesCalculator.tsx`, `ElapssCalculator.tsx`, `UiatsCalculator.tsx`, `TreatmentPanel.tsx` (leen `aneurysmSite` y traducen a su escala; sin selector propio), `backend/services/report_generator.py` (lee `clinical.site`)
- Test: `MorphometryPanel.test.tsx`, `PhasesCalculator.test.tsx`, `TreatmentPanel.test.tsx`, `backend/test_clinical_site.py` (nuevo)

**Interfaces:**
- Produces: `thresholds.ts` exporta `AR_HIGH = 1.6`, `AR_MOD = 1.2`, `DNR_HIGH = 2.0`, `BF_WIDE = 1.5` y `labelFor(index, value)`; el BF se rotula «Cuello estrecho» cuando `bf > 1.5` (fondo/cuello alto = cuello estrecho) y «Cuello ancho» cuando `bf <= 1.5`, igual en Morfometría y en Decisión.
- `aneurysmSite` toma los valores de `ANEURYSM_LOCATIONS`; la traducción a PHASES (`ica | mca | aca_pcom_posterior`) y a ELAPSS/UIATS vive en `thresholds.ts` como `siteFor(scale, location)`.

- [ ] **Step 1: Pruebas (fallan):** `thresholds.test.ts` (BF 1.65 → «Cuello estrecho»; AR 1.3 → «Mod»; `siteFor("phases","basilar") === "aca_pcom_posterior"`); `MorphometryPanel.test.tsx` (el badge BF de 1.65 dice «Cuello estrecho»; hay un único «Localización» y PHASES no tiene selector propio); `PhasesCalculator.test.tsx` (con `aneurysmSite: "basilar"` en el store, el resultado suma +4 de localización sin tocar nada); `test_clinical_site.py` (PUT guarda `clinical.site` y el PDF lo lee).
- [ ] **Step 2: Implementar** según los textos de F1-160/161/163/180 (cada índice con una sola banda y su fuente en el tooltip) y F1-173/210 (Decisión y el informe heredan la localización).
- [ ] **Step 3: Contrato (ruta nueva) + pruebas + commit** — `Arreglos F1a: localización única, umbrales por índice y sentido del BF (familias J, N, O)`.

---

### Task 3: Familias E, F, G y Q — permisos: auditoría, pedidos, ficha ajena y rutas de administración

**Filas:** F1-5, F1-30, F1-31, F1-256 (E); F1-4, F1-32 (F); F1-33, F1-34, F1-257, F1-258 (G); F1-254, F1-255 (Q).

**Files:**
- Modify: `backend/routers/patients.py` (`get_patient`, `list_studies`, `list_patient_sessions`), `backend/routers/audit.py`, `backend/routers/clip_orders.py`, `backend/services/clip_orders.py` (si `store.list_orders` necesita el filtro por lista de pacientes), `frontend/src/pages/Patients.tsx` (la ficha muestra el 403 como aviso y no como formulario vacío; la lista de «Pacientes» dice «Ves los pacientes que creaste» para un Médico), `frontend/src/pages/UsersAdmin.tsx` y `AuditTrail.tsx` (sin rol de administrador, la página no se monta: una tarjeta «Solo para administradores» y nada más)
- Test: `backend/test_access_control.py` (ampliar), `backend/test_audit_access.py` (nuevo), `backend/test_clip_orders_access.py` (nuevo), `frontend/src/pages/Patients.test.tsx`

**Interfaces:**
- Consumes: `services.access.require_patient`, `own_patient_ids`, `session_patient_id`; `services.auth_service.require_admin`, `require_user`.
- Produces: GET `/api/patients/{id}`, `/{id}/studies`, `/{id}/sessions` devuelven 403 a un no dueño; `/api/audit/*` exige administrador y el POST toma el usuario del token; `/api/clip-orders*` filtra por pacientes propios y las rutas por `part_no` comprueban al dueño del pedido; `prefill` y `create_order` pasan por `require_session`.

- [ ] **Step 1: Pruebas (fallan)**

```python
# backend/test_audit_access.py
"""La cadena de auditoría solo la lee y escribe el administrador (F1-5, F1-30, F1-31)."""
import os, tempfile
_tmp = tempfile.mkdtemp(prefix="prospective_aud_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
from conftest import anonymous_client
from main import app
from services.database import Base, engine, SessionLocal
from services.db_models import User
from services.auth_service import create_access_token, get_password_hash
Base.metadata.create_all(bind=engine)


def _client(role: str, nombre: str):
    db = SessionLocal()
    db.add(User(username=nombre, hashed_password=get_password_hash("x" * 12), role=role, full_name=nombre, is_active=True)); db.commit(); db.close()
    c = anonymous_client(app); c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return c


def test_medico_no_lee_ni_escribe_la_cadena():
    c = _client("medico", "med_aud")
    assert c.get("/api/audit/blocks").status_code == 403
    assert c.get("/api/audit/export").status_code == 403
    assert c.get("/api/audit/verify").status_code == 403
    assert c.post("/api/audit", json={"action": "x", "payload": {}, "username": "admin"}).status_code == 403


def test_admin_escribe_con_su_propio_nombre():
    c = _client("admin", "adm_aud")
    r = c.post("/api/audit", json={"action": "prueba", "payload": {}, "username": "otro"})
    assert r.status_code == 200
    ultimo = c.get("/api/audit/blocks").json()[-1]
    assert ultimo["username"] == "adm_aud"
```

En `test_access_control.py`, tres pruebas nuevas con el helper `_medico()` existente: `get /api/patients/{id}` ajeno → 403; `/studies` → 403; `/sessions` → 403; y propio → 200. En `test_clip_orders_access.py`: un pedido creado por el médico A no aparece en `/api/clip-orders` para el médico B, y `POST /api/clip-orders/{part_no}/status` de B → 403; `GET /api/clip-orders/prefill/{sid}` con una sesión de otro paciente → 403.

- [ ] **Step 2: Implementar**

`patients.py` (las tres rutas): añadir `current_user: Annotated[User | None, Depends(get_current_user)]` y `require_patient(db, current_user, patient_id)` justo tras el 404. `audit.py`: `router = APIRouter(prefix="/api/audit", tags=["audit"], dependencies=[Depends(require_admin)])`; `append_event(req, admin: Annotated[User, Depends(require_admin)])` usa `admin.username` e ignora `req.username` (el modelo lo conserva por compatibilidad y el docstring lo dice). `clip_orders.py`: `list_orders` y `summary` filtran con `own_patient_ids` (si devuelve `None`, sin filtro); `_need(part_no)` pasa a `_need_own(part_no, user, db)` que llama a `require_patient(db, user, order.patient_id)` y lo usan `get_order`, `advance`, `receive`, `verify`, `reject`, `delete_order`, `order_file`, `packet`; `prefill` y `create_order` comprueban `require_patient(db, user, session_patient_id(db, session_id))`. Frontend: `Patients.tsx` muestra el detalle del 403 en un aviso y cierra el formulario; `UsersAdmin.tsx`/`AuditTrail.tsx` devuelven la tarjeta «Solo para administradores» cuando `user.role !== "admin"` (F1-254/255).

- [ ] **Step 3: Ejecutar cada archivo de pruebas por separado; contrato (el modelo `AuditAppendRequest` no cambia de forma; si se añade `dependencies` no cambia el contrato); commit** — `Arreglos F1a: permisos de paciente, auditoría y pedidos (familias E, F, G, Q)`.

---

### Task 4: Familia R — guardar sobre la sesión de origen tras reanudar

**Filas:** F1-108, F1-241, F1-245.

**Files:**
- Modify: `backend/routers/session_state.py` (`save_session`), `backend/models/session_state.py` (`SessionSaveRequest.overwrite_origin: bool = True`), `frontend/src/pages/Workspace.tsx` (`saveProgress` y el tooltip de «Guardar progreso»: «Guarda el estudio, la malla, las medidas, la decisión, los dispositivos y las anotaciones de esta sesión»), `frontend/src/api/client.ts` (campo nuevo)
- Test: `backend/test_session_e.py` (nuevo), `frontend/src/pages/Workspace.test.tsx` (nuevo o existente)

**Interfaces:**
- Consumes: `services.access.ORIGIN_KEY`, `read_state`.
- Produces: guardar una sesión viva que salió de una guardada actualiza **esa** fila (`PlanningSession.session_id` pasa a ser el id vivo y el snapshot se escribe bajo él); `overwrite_origin=false` crea una fila nueva como hasta ahora.

- [ ] **Step 1: Prueba (falla)**

```python
# backend/test_session_e.py
"""Reanudar y guardar no añade otra fila (F1-108): la sesión viva recuerda de cuál salió y guarda sobre ella."""
import os, tempfile
_tmp = tempfile.mkdtemp(prefix="prospective_sess_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
from conftest import anonymous_client
from main import app
from services.database import Base, engine, SessionLocal
from services.db_models import PlanningSession
from services.sessions import create_session, session_subdir
Base.metadata.create_all(bind=engine)
client = anonymous_client(app)


def _guardar(sid, **extra):
    return client.post("/api/sessions/save", json={"session_id": sid, "current_step": 2, "label": "p", **extra})


def test_guardar_tras_reanudar_actualiza_la_fila_de_origen():
    sid = create_session()
    (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("x")
    assert _guardar(sid).status_code == 200
    vivo = client.post(f"/api/sessions/{sid}/restore").json()["session_id"]
    assert _guardar(vivo).status_code == 200
    db = SessionLocal(); filas = db.query(PlanningSession).all(); db.close()
    assert len(filas) == 1 and filas[0].session_id == vivo


def test_guardar_como_nueva_crea_otra_fila():
    sid = create_session()
    (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("x")
    _guardar(sid)
    vivo = client.post(f"/api/sessions/{sid}/restore").json()["session_id"]
    _guardar(vivo, overwrite_origin=False)
    db = SessionLocal(); n = db.query(PlanningSession).count(); db.close()
    assert n == 2
```

- [ ] **Step 2: Implementar** en `save_session`: tras `ps = …filter_by(session_id=req.session_id).first()`, si `ps is None and req.overwrite_origin`, leer `origen = read_state(req.session_id, ORIGIN_KEY, "")` y, si hay fila para `origen`, reutilizarla: `ps = esa_fila; ps.session_id = req.session_id` y borrar el snapshot antiguo con `services.sessions.remove_saved_snapshot(origen)` (crearla junto a `snapshot_session` si no existe) **después** de que `snapshot_session(req.session_id)` haya terminado bien. Comentario con el porqué (seis sesiones casi iguales en la ficha del paciente). Frontend: `saveProgress` envía `overwrite_origin: true`; el tooltip del botón según F1-108.

- [ ] **Step 3: Contrato (campo nuevo) + pruebas + commit** — `Arreglos F1a: guardar sobre la sesión de origen tras reanudar (familia R)`.

---

### Task 5: Familia S — restaurar el estado completo al reanudar

**Filas:** F1-27, F1-28, F1-246, F1-247, F1-248, F1-249, F1-250. Fila suelta F1-244 (Guardar y reanudar).

**Files:**
- Modify: `backend/routers/session_state.py` (`SessionRestoreResult` gana `treatment`, `trajectory`, `placed_clips`, `window`, `report_urls`, `lesion_confirmed`), `backend/models/session_state.py`, `backend/routers/treatment.py` (`GET /api/treatment-decision/{sid}` que devuelve lo guardado en `treatment.*`), `backend/routers/report.py` (`GET /api/trajectory/{sid}` devuelve también `angle_deg`, `depth_mm`, `verdict`, `verdict_reason` leídos del estado), `backend/routers/devices.py` (`PUT /api/devices/{sid}/placed-clips` que escribe `devices.placed_clips.json`; `GET /api/devices/{sid}` lo devuelve), `backend/routers/mpr.py` (`PUT /api/volume/{sid}/window` escribe `viewer.wc`/`viewer.ww`), `backend/routers/detect.py` (`POST /api/detect/{sid}?cached=true` devuelve `detect.*` del estado sin recalcular cuando existe), `backend/routers/ground_truth.py` (`/current` resuelve por `session_lineage`), `frontend/src/App.tsx` (`resumeSession` rellena `setTreatment`, `setTreatmentInputs`, `setPlacedClips`, `setMprWl`, los enlaces del informe y el estado «Guardada ✓» de la trayectoria; usa `cached=true`), `frontend/src/components/planning/DevicesPanel.tsx` (al colocar un clip envía la lista editable al backend), `frontend/src/vtk/SliceView.tsx` (al soltar un arrastre de W/L envía la ventana, con rebote de 500 ms), `frontend/src/components/planning/ReportPanel.tsx` (muestra los enlaces restaurados)
- Test: `backend/test_session_restore_state.py` (nuevo: cada dato vuelve), `backend/test_device_persistence.py` (clips editables), `frontend/src/components/planning/placedClips.test.ts`, `frontend/src/vtk/SliceView.wl.test.tsx`, `frontend/src/App.resume.test.tsx` (nuevo, con `api` falso: tras `resumeSession` el store tiene decisión, clips y ventana)

**Interfaces:**
- Produces: `SessionRestoreResult` extendido (contrato regenerado); `GET /api/treatment-decision/{sid}`; `PUT /api/devices/{sid}/placed-clips`; `PUT /api/volume/{sid}/window`; `?cached=true` en detect.
- Regla (F1-244 y F1-246): tras reanudar, la detección **no** se recalcula si `detect.n_candidates` está en el estado; la confirmación de lesión se busca por linaje de sesión, así sigue visible.

- [ ] **Step 1: Pruebas (fallan):** `test_session_restore_state.py` escribe en una sesión `treatment.recommendation`, `trajectory.*`, `devices.placed_clips.json`, `viewer.wc/ww`, un `reports/<sid>_report.pdf` vacío, la guarda, la restaura y comprueba que `SessionRestoreResult` trae cada dato y que `POST /api/detect/{new}?cached=true` devuelve los candidatos guardados sin tocar la malla (medir con un contador en el servicio o con una malla ausente que haría fallar el recálculo).
- [ ] **Step 2: Implementar** backend y frontend según el anexo (F1-247: el botón de trayectoria dice «Guardada ✓» al volver; F1-249: los enlaces del PDF y el SR se muestran si los archivos existen; F1-250: la confirmación de lesión vuelve). `App.tsx`: `planning.markSaved()` se mantiene al final; el aviso de cambios sin guardar no debe saltar tras reanudar sin tocar nada (prueba en `App.resume.test.tsx`).
- [ ] **Step 3: Contrato + pruebas (un archivo por proceso) + commit** — `Arreglos F1a: reanudar devuelve decisión, dispositivos, corredor, ventana e informe (familia S)`.

---

### Task 6: Familia T — servidor que cae o no responde

**Filas:** F1-8, F1-19, F1-20, F1-24, F1-25, F1-26.

**Files:**
- Modify: `frontend/src/api/client.ts` (un `fetch` que lanza `TypeError` se convierte en `ApiError(0, "Sin conexión con el servidor")`; exporta `onServerDown(cb)` que avisa cuando dos llamadas seguidas devuelven 0 o 5xx), `frontend/src/App.tsx` (banda fija «El servidor no responde. Tu sesión sigue en disco: reinícialo y pulsa «Reintentar»» con un botón que repite la última llamada fallida), `frontend/src/vtk/useVolumeMeta.ts` (hasta 3 reintentos con 1, 2 y 4 s y un estado `error`), `frontend/src/vtk/Viewer.tsx` (con `error`, la celda dice «No se pudo cargar el volumen» y ofrece «Reintentar» en vez de «CARGANDO…»), `frontend/src/components/planning/DevicesPanel.tsx` (el error de «Sugerir corredor» muestra el `detail` y «Reintentar»; con status 0 dice que el servidor no responde), `backend/routers/report.py` (`suggest_corridors` ejecuta el cálculo en un **proceso hijo** con `concurrent.futures.ProcessPoolExecutor(max_workers=1)` y, si el hijo muere, responde 500 con `detail="El cálculo del corredor falló en el servidor; la sesión no se ha perdido. Coloca la entrada y la diana a mano."` sin tumbar el servidor), `backend/routers/session_state.py` (`restore` igual: rehidratación en proceso hijo con el mismo patrón)
- Test: `frontend/src/api/client.test.ts` (TypeError → ApiError 0), `frontend/src/vtk/useVolumeMeta.test.ts` (nuevo: tres reintentos y `error`), `backend/test_corridor_isolation.py` (nuevo: un cálculo que lanza `os._exit(1)` en el hijo devuelve 500 con el detail y el servidor sigue respondiendo `/docs`)
- Nota: `test_corredor_abordaje.py` sigue siendo ambiental; esta tarea no lo toca.

- [ ] **Step 1: Pruebas (fallan)** con los nombres y aserciones anteriores.
- [ ] **Step 2: Implementar.** El patrón del proceso hijo:

```python
# backend/services/isolated.py (nuevo)
"""Correr un cálculo nativo pesado en un proceso aparte.

Por qué: VTK puede abortar el proceso sin excepción de Python (visto cuatro
veces en la auditoría, en «Sugerir corredor» y al restaurar una sesión). En
el proceso del servidor eso tumba uvicorn entero; en un hijo, solo falla la
petición y la persona recibe un 500 con explicación.
"""
from __future__ import annotations
import concurrent.futures as cf
import multiprocessing as mp
from typing import Callable, TypeVar

T = TypeVar("T")
_CTX = mp.get_context("spawn")


class CalculoCaido(RuntimeError):
    """El proceso hijo murió sin devolver resultado."""


def run_isolated(fn: Callable[..., T], *args, timeout_s: float = 600) -> T:
    with cf.ProcessPoolExecutor(max_workers=1, mp_context=_CTX) as pool:
        fut = pool.submit(fn, *args)
        try:
            return fut.result(timeout=timeout_s)
        except cf.process.BrokenProcessPool as exc:
            raise CalculoCaido(str(exc)) from exc
```

`fn` y `args` deben ser importables y serializables (pasar `session_id` y parámetros, no objetos VTK). En el router: `try: return await asyncio.to_thread(run_isolated, _suggest_for_session, session_id, params) except CalculoCaido: raise HTTPException(500, detail=…)`.

- [ ] **Step 3: Ejecutar (el test del hijo usa una función de módulo que llame a `os._exit(1)`), contrato (sin cambios de modelo), commit** — `Arreglos F1a: el servidor caído se ve y los cálculos nativos corren aparte (familia T)`.

---

### Task 7: Diagnóstico de las cuatro caídas del backend

**Filas:** sostiene F1-19 y F1-24 (la causa raíz).

**Files:**
- Create: `docs/superpowers/audits/2026-10-11-caida-nativa-backend.md`
- Modify: solo si la causa es un arreglo de menos de 30 líneas (p. ej. un `vtk` sin `Update()` o un acceso fuera de rango); si no, el documento basta.

- [ ] **Step 1: Reproducir con pila nativa.** Desde `backend/`, con el `.venv`: `PROSPECTIVE_PORT=8011 .venv/Scripts/python -X faulthandler -m uvicorn main:app --port 8011` en segundo plano (puerto propio, sin tocar el 8000 del propietario), autenticarse (`admin` / `admin12345`), y lanzar `POST /api/trajectory/79a34304-8cb7-4169-b36e-1fae7f7775ae/suggest` con cuerpo `{}` (la sesión está en `backend/data/session_saves/`; si el directorio vivo no existe, restaurarla primero con `POST /api/sessions/79a34304-…/restore` y usar el id nuevo). Capturar la salida del proceso hasta que muera; repetir con `POST /api/sessions/79a34304-…/restore` si la primera no cae.
- [ ] **Step 2: Escribir el documento:** comando, pila nativa (o su ausencia), hipótesis con la función de `backend/services/` implicada, memoria libre en el momento, y recomendación (arreglo, o aislamiento de la Tarea 6 como mitigación).
- [ ] **Step 3: Parar el servidor del puerto 8011, commit** — `Auditoría: diagnóstico de la caída nativa del backend`.

---

### Task 8: Familias A e Y — errores visibles en vez de listas vacías y falta de conexión

**Filas:** F1-2, F1-29, F1-75, F1-88, F1-92, F1-99, F1-103, F1-104 (A); F1-41, F1-50, F1-51 (Y).

**Files:**
- Create: `frontend/src/components/LoadState.tsx` (`<LoadState state="cargando" | "error" | "vacio" mensaje onRetry />`: «Cargando…», el `detail` del error con «Reintentar», o el texto vacío que se le pase), `frontend/src/components/LoadState.test.tsx`
- Modify: cada pantalla del anexo A (Pacientes, Ficha, Estudios, Usuarios, Solicitudes, Pedidos, Auditoría, Talleres) sustituye su `catch(() => {})` o su lista vacía por `LoadState`; `Login.tsx` y `Signup.tsx` (Y): con `ApiError.status === 0` el mensaje es «Sin conexión con el servidor. Comprueba que está en marcha y vuelve a intentarlo».
- Test: `LoadState.test.tsx`; en cada página, una prueba «con el API fallando aparece el error y «Reintentar» vuelve a llamar».

- [ ] **Step 1: Prueba de `LoadState` (falla)** → **Step 2: Implementar** → **Step 3: Aplicar pantalla a pantalla con su prueba** → **Step 4: tsc, pruebas, commit** — `Arreglos F1a: el error se ve y se reintenta (familias A, Y)`.

---

### Task 9: Familias B y C — confirmar antes de borrar trabajo y descartar cambios de un formulario

**Filas:** F1-3, F1-6, F1-7, F1-9, F1-10, F1-11, F1-12, F1-18, F1-21, F1-22, F1-58, F1-91, F1-97, F1-98, F1-141, F1-147, F1-170 (B); F1-60, F1-71, F1-81 (C).

**Files:**
- Modify: `frontend/src/components/ConfirmDialog.tsx` (sin cambios de API; se reutiliza), y cada componente del anexo B: `CaptureGallery.tsx`, `AnnotationsPanel.tsx` (Supr y «Borrar» abren la confirmación; Retroceso solo quita el último punto del trazo en curso y no pide nada), `UploadPanel.tsx` (volver a cargar con trabajo), `PreprocessSection.tsx`, `SegmentPanel.tsx` («Re-segmentar»), `DetectPanel.tsx` («Limpiar candidatos y morfometría»), `TreatmentPanel.tsx` («Limpiar decisión y PHASES»), `DevicesPanel.tsx` («Limpiar» trayectoria y «Limpiar clips colocados»), `CenterlinePanel.tsx` («Limpiar» la línea central con el stent guiado), `ClipOrders.tsx`/`PendingRequests.tsx`/`UsersAdmin.tsx` (las filas 58, 91, 97, 98), `Patients.tsx` y `NuevoCaso.tsx` (C: «Cancelar» con cambios pregunta «¿Descartar los cambios?»).
- Test: una prueba por componente: el clic abre el diálogo con el título del anexo y no borra; confirmar borra; en C, «Cancelar» sin cambios cierra sin preguntar.

- [ ] **Step 1–3:** pruebas, implementación con los títulos y botones literales del anexo, commit — `Arreglos F1a: confirmar antes de borrar y al descartar cambios (familias B, C)`.

---

### Task 10: Familia D — hora UTC mostrada como local

**Filas:** F1-77, F1-83, F1-101, F1-243.

**Files:**
- Create: `frontend/src/lib/fecha.ts` (`fechaHora(iso: string): string` → `new Date(iso)` formateada con `toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })`; acepta ISO sin zona tratándolo como UTC), `frontend/src/lib/fecha.test.ts`
- Modify: `Patients.tsx` (sesiones guardadas), `UsersAdmin.tsx`, `AuditTrail.tsx` («Fecha/Hora (UTC)» pasa a hora local con el sufijo «(local)»), y el backend donde se devuelva un ISO sin zona (`session_state.py` ya usa UTC con zona; comprobar `auth.py` y `audit`).
- Test: `fecha.test.ts` (un ISO «2026-10-11T05:05:09» sin zona se muestra como la hora local correspondiente, no a las 05:05).

- [ ] **Step 1–3:** prueba, implementación, commit — `Arreglos F1a: las horas se muestran en hora local (familia D)`.

---

### Task 11: Familias AA, AB y P — contacto del administrador, cambio obligatorio de contraseña y línea del rol

**Filas:** F1-1, F1-40, F1-42, F1-43, F1-48 (AA); F1-85, F1-87 (AB); F1-86, F1-106, F1-251 (P).

**Files:**
- Modify: `frontend/src/pages/Login.tsx`, `Signup.tsx`, `App.tsx` (textos literales del anexo con `ingprospective@skullapp.tech`), `backend/routers/auth.py` + `backend/services/login_throttle.py` (el 401 incluye `remaining_attempts`; el 429 y los 403 llevan el contacto), `backend/services/auth_service.py` (restablecer y crear por administrador marcan `must_change_password=True`), `frontend/src/pages/UsersAdmin.tsx` (línea bajo «Rol» con lo que permite cada rol, literal del anexo F1-86; rótulo «mín. 8»), `frontend/src/components/Topbar.tsx` (institución bajo el nombre y la línea del rol, F1-106/251)
- Test: `backend/test_auth_hardening.py` (ampliar: `remaining_attempts` en el 401), `backend/test_password_change.py` y `test_admin_create_user.py` (ampliar: `must_change_password`), `frontend/src/pages/Login.test.tsx`, `Signup.test.tsx`, `UsersAdmin.test.tsx`, `components/Topbar.test.tsx`.

- [ ] **Step 1–3:** pruebas, implementación, contrato si cambia la respuesta del 401 (modelo de error con `remaining_attempts`), commit — `Arreglos F1a: contacto del administrador, cambio obligatorio y línea del rol (familias AA, AB, P)`.

---

### Task 12: Familias L, K y AD — decisión del equipo, tronco basilar y botones de avance

**Filas:** F1-176, F1-188, F1-220, F1-236 (L); F1-174, F1-181, F1-231 (K); F1-130, F1-140, F1-183 (AD).

**Files:**
- Modify: `frontend/src/components/planning/TreatmentPanel.tsx` (campo «Decisión del equipo» con las opciones del anexo F1-176 y «Quién decide»; se guarda con `PUT /api/treatment-decision/{sid}/team` → `treatment.team_decision`, `treatment.decided_by`), `backend/routers/treatment.py` (ruta nueva), `backend/services/report_generator.py` (F1-236: el informe imprime la decisión del equipo antes que la recomendación), `DevicesPanel.tsx` (F1-188: el paso 6 arranca en la pestaña que corresponde a la decisión del equipo), `backend/services/perforators.py` o `routers/perforators.py` (K: la tarjeta de perforantes distingue tronco de punta según `clinical.site`; textos del anexo F1-174/181/231), `UploadPanel.tsx`, `SegmentPanel.tsx`, `TreatmentPanel.tsx`, `frontend/src/pipeline/steps.ts` (AD: «Continuar a segmentación» apagado con motivo, «Continuar a detección», «Continuar a dispositivos» con la misma regla que el carril)
- Test: `backend/test_team_decision.py` (nuevo), `backend/test_report_trajectory_label.py` (ampliar con la decisión del equipo), `frontend TreatmentPanel.test.tsx`, `DevicesPanel.test.tsx`, `UploadPanel.test.tsx`, `SegmentPanel.test.tsx`, `PerforatorsPanel.test.tsx`.

- [ ] **Step 1–3:** pruebas, implementación, contrato, commit — `Arreglos F1a: decisión del equipo, tronco basilar y botones de avance (familias L, K, AD)`.

---

### Task 13: Familias M y U — catálogo de clips vacío y fuerza del clip

**Filas:** F1-190, F1-191, F1-192, F1-197, F1-211, F1-212, F1-214 (M); F1-202, F1-213 (U).

**Files:**
- Modify: `backend/services/clip_selection.py` (con catálogo vacío el veredicto es «Pieza a medida» y nunca dice «del inventario»; la alternativa a medida coincide con la pieza de Fabricación), `frontend/src/components/planning/ClipSelection.tsx` (textos literales del anexo; «Requiere fabricación» → «Pieza a medida: se pide en Fabricación» en tono neutro), `ManufacturePanel.tsx` (F1-211/212/214), `ClipFieldCard.tsx` + `backend/services/clip_manufacture.py` + `backend/services/clip_orders.py` (U: una sola cifra de fuerza con su banda en verificación, Fabricación y pedido)
- Test: `backend/test_clip_selection.py` (ampliar), `backend/test_clip_manufacture.py` (ampliar), `frontend ClipSelection.test.tsx`, `ManufacturePanel.test.tsx`, `ClipFieldCard.test.tsx`.

- [ ] **Step 1–3:** pruebas, implementación, commit — `Arreglos F1a: catálogo vacío explicado y una sola fuerza de clip (familias M, U)`.

---

### Task 14: Familia Z — captura y vídeo sin caso

**Filas:** F1-70, F1-122, F1-123, F1-124, F1-223.

**Files:**
- Modify: `frontend/src/components/CaptureGallery.tsx`, `pages/Workspace.tsx`, `components/RecordButton.tsx`, `components/planning/CapturePicker.tsx` (textos literales del anexo; aviso neutro, no de error)
- Test: `CaptureGallery.test.tsx`, `RecordButton.test.tsx`, `CapturePicker.test.tsx`, `Workspace.test.tsx` (el aviso no lleva la clase/estilo de error).

- [ ] **Step 1–3:** commit — `Arreglos F1a: captura y vídeo sin caso, avisos neutros (familia Z)`.

---

### Task 15: Familias V, W y X — glosario: casos, sesiones, pedidos y cuentas pendientes

**Filas:** F1-53, F1-54, F1-55, F1-242 (V); F1-64, F1-65, F1-66, F1-67, F1-76, F1-80 (W); F1-89, F1-93, F1-217, F1-218 (X). Ejecuta las fusiones aprobadas nº 7, 9 y 14 en lo que son texto (el acceso único «Cuentas pendientes»: el título, el botón de «Pacientes» y la entrada del menú pasan a llamarse así; la supresión del botón duplicado la hace F2 con el armazón nuevo).

**Files:**
- Modify: `Patients.tsx`, `NuevoCaso.tsx`, `PendingRequests.tsx`, `Topbar.tsx`, `ClipOrders.tsx`, `ClipOrderForm.tsx` (textos literales del anexo)
- Test: `Patients.test.tsx`, `NuevoCaso.test.tsx`, `ClipOrders.test.tsx`, `ClipOrderForm.test.tsx`, y una prueba global `copy.glosario.test.ts` que recorre los archivos de `pages/` y `components/planning/ClipOrderForm.tsx` y falla si aparece «Solicitudes de registro», «solicitud» (en el contexto de pedidos) o «estudio» donde el glosario dice «caso».

- [ ] **Step 1–3:** commit — `Arreglos F1a: glosario de casos, sesiones y pedidos (familias V, W, X)`.

---

### Task 16: Filas sueltas — barra superior, barra del visor, HUD, atajos y anotaciones

**Filas:** F1-107, F1-109, F1-110, F1-111, F1-112, F1-113, F1-114, F1-115, F1-116, F1-117, F1-118, F1-119, F1-120, F1-121.

**Files:**
- Modify: `pages/Workspace.tsx`, `App.tsx` (F1-110: «Guardar y salir» en el aviso), `vtk/mainOptions.ts`, `vtk/layout.ts`, `vtk/layoutGrid.ts`, `vtk/levelNote.ts`, `vtk/ViewerHeader.tsx`, `vtk/hud/HudToggleGroup.tsx`, `vtk/hud/hud.css`, `vtk/hud/HudFrame.tsx`, `vtk/Viewer.tsx` (F1-116: «DESDE ▸ ARRIBA · DELANTE · LADO»), `vtk/shortcuts.ts`, `vtk/hud/ShortcutsSheet.tsx`, `components/annotations/AnnotationsPanel.tsx`, `README.md` (tabla de atajos y nombres nuevos: TEXTOS, VINCULAR, DESDE)
- Test: `Workspace.test.tsx`, `layout.test.ts`, `layoutGrid.test.ts`, `levelNote.test.ts`, `ViewerHeader.test.tsx`, `hudLevel.test.tsx`, `shortcuts.test.ts`, `copy.test.ts` (actualizar las etiquetas vigiladas), `useAnnotationsSync.test.tsx`.

- [ ] **Step 1–3:** pruebas con los textos literales del anexo, implementación, commit — `Arreglos F1a: barra, visor, HUD y atajos (filas sueltas)`.

---

### Task 17: Filas sueltas — Paso 1 Carga y Paso 2 Segmentación

**Filas:** F1-125, F1-126, F1-127, F1-128, F1-129 (paso 1); F1-131, F1-132, F1-133, F1-134, F1-135, F1-136, F1-137, F1-138, F1-139 (paso 2). Ejecuta las fusiones/eliminaciones aprobadas nº 17 (una sola línea «Sin techo en el método tubular»), nº 18 (quitar «Salida vessel_tree.vtp…») y nº 19 (datos de depuración en «Detalles» plegado).

**Files:**
- Modify: `components/upload/UploadPanel.tsx` (vaciar `e.target.value` tras leer los archivos; «Subido» frente a «Cargado»; textos del anexo), `backend/services/dicom_loader.py` (F1-127: fecha y hora de adquisición en la serie), `backend/services/sessions.py` (F1-128: el plazo real de borrado expuesto en `/api/volume/{sid}/meta` o en la serie), `components/segmentation/SegmentPanel.tsx`, `TubularControls.tsx`, `PreprocessSection.tsx`, `SegmentProgress.tsx`, `MeshEditTools.tsx`
- Test: `UploadPanel.test.tsx` (nuevo), `SegmentPanel.test.tsx`, `TubularControls.test.tsx`, `PreprocessSection.test.tsx` (nuevo), `SegmentProgress.test.tsx`, `MeshEditTools.test.tsx`; backend `test_series_meta.py` (nuevo) para la fecha de adquisición y el plazo.

- [ ] **Step 1–3:** commit — `Arreglos F1a: carga y segmentación (filas sueltas, fusiones 17–19)`.

---

### Task 18: Filas sueltas — Paso 3 Detección

**Filas:** F1-142, F1-143, F1-144, F1-145, F1-146, F1-148, F1-149, F1-150. Ejecuta la eliminación aprobada nº 20 («Puesto bajo»).

**Files:**
- Modify: `components/planning/DetectPanel.tsx`, `detectCopy.ts`, `detectGate.ts`, `LesionConfirm.tsx` (F1-146: «Confirmar el punto marcado» añade un candidato «marcado a mano» elegible y medible; el texto dice que una lesión no detectada se mide en Morfometría marcando cuello y ápice), `vtk/Viewer.tsx` (F1-150: «CANDIDATO»), `backend/routers/ground_truth.py` (F1-149: contar estudios, no sesiones), `backend/routers/detect.py` (el candidato marcado a mano entra en `detect.*` con `channels = "manual"`)
- Test: `DetectPanel.test.tsx`, `LesionConfirm.test.tsx`, `copy.test.ts`, `backend/test_ground_truth.py` (ampliar), `backend/test_detect_manual_candidate.py` (nuevo).

- [ ] **Step 1–3:** contrato si cambia `LesionConfirmOut`/`AneurysmDetectionResult`, commit — `Arreglos F1a: detección (filas sueltas, eliminación 20)`.

---

### Task 19: Filas sueltas — Paso 4 Morfometría y Paso 5 Decisión

**Filas:** F1-152, F1-153, F1-154, F1-155, F1-156, F1-158, F1-159, F1-164, F1-166, F1-167, F1-168, F1-169, F1-171 (paso 4); F1-172, F1-175, F1-177, F1-178, F1-182 (paso 5). Ejecuta la fusión aprobada nº 22 (una sola fila de tortuosidad).

**Files:**
- Modify: `backend/services/morphometrics.py` (F1-152: aviso sin «aristas de borde»), `components/morphometry/MorphometryPanel.tsx`, `vtk/Viewer.tsx`, `vtk/MeshView.tsx` (F1-154: en modo de marcado la cámara no se mueve), `components/vessels/CenterlinePanel.tsx` (nº 22), `components/planning/TreatmentPanel.tsx` y los demás archivos del anexo
- Test: `backend/test_morphometry_sac.py` (ampliar), `MorphometryPanel.test.tsx`, `pointerFocus.test.ts`, `copy.test.ts`, `CenterlinePanel.test.tsx`, `TreatmentPanel.test.tsx`.

- [ ] **Step 1–3:** commit — `Arreglos F1a: morfometría y decisión (filas sueltas, fusión 22)`.

---

### Task 20: Filas sueltas — Paso 6 Dispositivos

**Filas:** F1-184, F1-185, F1-186, F1-187, F1-189, F1-193, F1-194, F1-195, F1-196, F1-198, F1-199, F1-200, F1-201, F1-203, F1-204, F1-205, F1-206, F1-207, F1-208, F1-209. Ejecuta las fusiones aprobadas nº 23 (una sola lista de modelos de clip, en el orden de las tarjetas) y nº 24 (una sola vía de coils: el montaje sugerido, **editable coil a coil**).

**Files:**
- Modify: `components/planning/DevicesPanel.tsx`, `ClipSelection.tsx`, `ClipRehearsal.tsx`, `FdSizing.tsx`, `WebSizing.tsx`, `placedClips.ts`, y el backend que cite el anexo en cada fila
- Test: `DevicesPanel.test.tsx` (ampliar por fila), `ClipSelection.test.tsx`, `placedClips.test.ts`, `FdSizing.test.tsx`, `WebSizing.test.tsx`; para la nº 24, una prueba de que el montaje sugerido permite cambiar el diámetro y la longitud de cada coil y recalcula el empaque.

- [ ] **Step 1–3:** commit — `Arreglos F1a: dispositivos (filas sueltas, fusiones 23 y 24)`.

---

### Task 21: Filas sueltas — Paso 7 Fabricación y Paso 8 Informe

**Filas:** F1-215, F1-216, F1-219 (paso 7); F1-221, F1-222, F1-224, F1-225, F1-226, F1-227, F1-228, F1-229, F1-230, F1-232, F1-233, F1-235, F1-237, F1-238, F1-239, F1-240 (paso 8).

**Files:**
- Modify: `components/planning/ManufacturePanel.tsx`, `PrintPrepPanel.tsx`, `ClipOrderForm.tsx`, `ReportPanel.tsx` (F1-221 y siguientes: el campo «Cirujano responsable» no se rellena con el nombre de la cuenta si la cuenta es administradora; el resto según el anexo), `CapturePicker.tsx`, `backend/services/report_generator.py` y `backend/services/dicom_sr.py` (las filas del PDF y del SR: tablas de coils y stents alineadas, decisión del equipo, PHASES rotulado)
- Test: `ManufacturePanel.test.tsx`, `ReportPanel.test.tsx`, `CapturePicker.test.tsx`, `backend/test_report_contents.py` (nuevo: el PDF contiene los rótulos del anexo y no «Administrador» como cirujano cuando no se escribió).

- [ ] **Step 1–3:** commit — `Arreglos F1a: fabricación e informe (filas sueltas)`.

---

### Task 22: Filas sueltas — usuario no administrador y cierre

**Filas:** F1-252, F1-253 (línea «Ves los pacientes que creaste» y el 403 explicado en la ficha); verificación cruzada de la Tarea 3.

**Files:**
- Modify: `pages/Patients.tsx`, `components/Topbar.tsx` (según el anexo), `README.md` (sección de roles y permisos: qué ve y qué puede cada rol tras esta serie)
- Test: `Patients.test.tsx` (con `user.role === "medico"` aparece la línea; un 403 de la ficha muestra el aviso y no el formulario).

- [ ] **Step 1: Pruebas y copia.**
- [ ] **Step 2: Suites completas:** `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`; backend: cada archivo de prueba nuevo o tocado por separado, más `test_openapi_contract.py`.
- [ ] **Step 3: Commit** — `Arreglos F1a: usuario no administrador, README y suites (cierre)`.

---

## Reparto de las 25 decisiones aprobadas

- En este plan: 17, 18, 19 (Tarea 17), 20 (Tarea 18), 21 (Tarea 2), 22 (Tarea 19), 23 y 24 (Tarea 20), y la parte de texto de 7, 9 y 14 (Tarea 15).
- A F2 con el armazón nuevo (pantallas de gestión): 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 25 y la supresión de los botones duplicados de 7 y 14.
- A F3 con el armazón del espacio de trabajo: 15 y 16 (miga y botón casa de la barra superior).

## Después de este plan

1. Revisión final de rama y cierre con finishing-a-development-branch (fusión local; el propietario sube).
2. Lista manual de la spec §7: repetir el recorrido del especialista sobre master con los arreglos y comprobar que cada atasco marcado F1 ha desaparecido; en particular los cinco puntos de «Review Focus».
3. Las 32 filas que pasan a F2 están listadas al final del anexo y entran en la spec de F2 como requisitos.
