"""PROSPECTIVE Web — FastAPI backend entry point.

Run with:
    uvicorn main:app --reload --host 127.0.0.1 --port 8000

Interactive API docs:
    http://127.0.0.1:8000/docs        ← Swagger UI
    http://127.0.0.1:8000/redoc       ← ReDoc
    http://127.0.0.1:8000/openapi.json ← Raw OpenAPI spec (for Claude Design)
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from services.sessions import InvalidSessionId
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from services.auth_service import require_user, user_for_token

from routers import (
    upload, segment, detect, perforators, plan,
    auth, patients, treatment, clips, coils, longitudinal,
    report, session_state, mpr, phases, centerline, audit,
    mesh_edit, print_prep, preprocess, studies, devices, clip_library,
    clip_orders, progress, captures, ground_truth, attach, followup,
    annotations,
)

logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────── #

async def _purge_loop(interval_sec: int = 3600) -> None:
    """Background task: purge expired session directories every `interval_sec`."""
    from services.sessions import purge_expired_sessions
    while True:
        try:
            await asyncio.sleep(interval_sec)
            await asyncio.to_thread(purge_expired_sessions)
        except asyncio.CancelledError:
            break
        except Exception as exc:  # never let the loop die on a transient error
            logger.warning("Session purge loop error: %s", exc)


def _backfill_clip_order_patients() -> None:
    """Orders raised before the register knew about `patient_id` get one now.

    Idempotent: only rows missing it and carrying a case are touched, so it can
    run on every boot without doing anything the second time.
    """
    from services import clip_orders
    from services.database import SessionLocal
    from services.db_models import Study

    def resolve(case_id: int) -> int | None:
        db = SessionLocal()
        try:
            study = db.get(Study, int(case_id))
            return int(study.patient_id) if study is not None and study.patient_id else None
        except Exception:  # noqa: BLE001
            return None
        finally:
            db.close()

    try:
        clip_orders.backfill_patient_ids(resolve)
    except Exception as exc:  # noqa: BLE001 — never block startup on housekeeping
        logger.warning("Clip order backfill skipped: %s", exc)


@asynccontextmanager
async def _lifespan(app: FastAPI):  # noqa: ARG001
    """Initialise DB, seed admin, purge stale sessions, start the purge loop."""
    from services.database import DATA_DIR, init_db, SessionLocal
    from services.auth_service import seed_default_user
    from services.sessions import purge_expired_sessions
    from services import single_process
    # Antes que nada: un segundo proceso sobre los mismos datos no arranca
    # (ver services/single_process.py).
    single_process.acquire(DATA_DIR)
    init_db()
    db = SessionLocal()
    try:
        seed_default_user(db)
    finally:
        db.close()

    _backfill_clip_order_patients()

    # Reclaim disk from sessions left over past their TTL, then keep purging.
    freed = await asyncio.to_thread(purge_expired_sessions)
    logger.info("Startup complete — database ready (purged %d stale session(s))", freed)

    purge_task = asyncio.create_task(_purge_loop())
    try:
        yield
    finally:
        purge_task.cancel()
        try:
            await purge_task
        except asyncio.CancelledError:
            pass
        single_process.release()


# ── App ───────────────────────────────────────────────────────────────────── #

app = FastAPI(
    lifespan=_lifespan,
    title="PROSPECTIVE Web API",
    description=(
        "REST + WebSocket API for cerebral aneurysm segmentation, detection, "
        "morphometry, perforator risk assessment and stent planning.\n\n"
        "All linear dimensions are in **millimetres (mm)**. "
        "All HU values follow the standard Hounsfield scale."
    ),
    version="0.1.0",
    contact={
        "name": "SkullApp — Laboratorio de Imagen Médica",
        "email": "ingprospective@skullapp.tech",
    },
    license_info={"name": "Proprietary"},
    # La documentación se sirve más abajo, tras sesión: no enseña datos, pero
    # sí la superficie entera de una API que guarda imágenes de pacientes.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# ── Sin GZipMiddleware: comprimía cada respuesta a nivel 9 dentro del event
# loop (0,29 s por bloque de 9 MB en 1 vCPU, y también .vtp, STL y PNG). Solo
# los bloques del volumen se comprimen, en el executor y a nivel 3: ver
# routers/mpr.py (_chunk_body).

# ── CORS — allow React dev server (Vite default port) ─────────────────────── #

_DEV_ORIGINS = (
    "http://localhost:5173",   # Vite dev server
    "http://127.0.0.1:5173",
    "http://localhost:3000",   # CRA / alternative
)


def cors_origins() -> list[str]:
    """Orígenes que pueden llamar a la API con credenciales.

    `CORS_ORIGINS` (separados por comas) los fija en un despliegue; sin ella,
    los del servidor de desarrollo. `*` no se admite: con credenciales el
    navegador lo rechaza, y aceptarlo en silencio dejaría la API sin CORS.
    """
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if not raw:
        return list(_DEV_ORIGINS)
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    if "*" in origins:
        raise RuntimeError("CORS_ORIGINS no admite '*': la API usa credenciales. Lista los orígenes.")
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Private static files ──────────────────────────────────────────────────── #
#
# StaticFiles is mounted below and bypasses router dependencies entirely, so the
# guard has to live in middleware. Session directories hold uploaded DICOM,
# whose headers carry patient name, national ID and date of birth: reachable by
# anyone who knew (or guessed) a session UUID before this existed.
#
# /static is bundled sample geometry with no patient data and stays public.

_PROTECTED_STATIC_PREFIXES = ("/data/",)


@app.exception_handler(InvalidSessionId)
async def invalid_session_id(_request: Request, exc: InvalidSessionId):
    """Un id que no es un UUID no es una sesión: 404, nunca una ruta."""
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.middleware("http")
async def guard_csrf(request: Request, call_next):
    """Doble envío para lo que se autentica por cookie (services/csrf.py)."""
    from services.csrf import violation
    motivo = violation(request.method, request.url.path, request.headers, request.cookies)
    if motivo:
        return JSONResponse({"detail": motivo}, status_code=403)
    return await call_next(request)


@app.middleware("http")
async def guard_private_static(request: Request, call_next):
    path = request.url.path
    if any(path.startswith(p) for p in _PROTECTED_STATIC_PREFIXES):
        from services.database import SessionLocal
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else request.cookies.get("prospective_token")
        db = SessionLocal()
        try:
            user = user_for_token(db, token)
            if user is None:
                return JSONResponse(
                    {"detail": "Authentication required — patient data"},
                    status_code=401,
                )
            # `data/` no es solo sesiones: ahí viven la base de datos y la
            # cadena de auditoría, y StaticFiles las servía enteras a cualquier
            # usuario (`/data/prospective.db`). Solo se sirve lo que cuelga de
            # `/data/sessions/<uuid>/`, y solo si esa sesión no es de un
            # paciente ajeno.
            from services.access import can_access_patient, session_patient_id
            from services.sessions import valid_session_id
            parts = path.split("/")          # ["", "data", "sessions", <uuid>, …]
            if (len(parts) < 5 or parts[2] != "sessions" or ".." in parts
                    or not valid_session_id(parts[3])):
                return JSONResponse({"detail": "Not found"}, status_code=404)
            if not can_access_patient(db, user, session_patient_id(db, parts[3])):
                return JSONResponse({"detail": "No autorizado sobre este paciente."}, status_code=403)
        finally:
            db.close()
    return await call_next(request)


# ── Static files ──────────────────────────────────────────────────────────── #
# /static — bundled sample meshes (development only; production: S3/CloudFront)
# /data   — session-scoped files: DICOM uploads, meshes, reports, exports
#            served directly so vtk.js can fetch .vtp mesh URLs from the browser
Path("data").mkdir(exist_ok=True)     # ensure root exists for StaticFiles mount
Path("static").mkdir(exist_ok=True)   # same for static

app.mount(
    "/static",
    StaticFiles(directory="static", html=False),
    name="static",
)
app.mount(
    "/data",
    StaticFiles(directory="data", html=False),
    name="data",
)


# ── Routers ───────────────────────────────────────────────────────────────── #
#
# Everything except `auth` is patient data, so it is gated here rather than
# endpoint by endpoint — a router added without a guard would otherwise be
# public by default. `auth` keeps its own rules (login and signup are public,
# the rest already require a user or an admin).
#
# NOTE: `get_current_user` does NOT authenticate; it is an alias of
# `get_optional_user` and returns None when no token is present. Only
# `require_user` / `require_admin` reject anonymous callers.

_private = [Depends(require_user)]

app.include_router(auth.router)
app.include_router(patients.router,      dependencies=_private)
app.include_router(studies.router,       dependencies=_private)
app.include_router(captures.router,      dependencies=_private)
app.include_router(upload.router,        dependencies=_private)
app.include_router(segment.router,       dependencies=_private)
app.include_router(detect.router,        dependencies=_private)
app.include_router(perforators.router,   dependencies=_private)
app.include_router(longitudinal.router,  dependencies=_private)
app.include_router(treatment.router,     dependencies=_private)
app.include_router(clips.router,         dependencies=_private)
app.include_router(coils.router,         dependencies=_private)
app.include_router(plan.router,          dependencies=_private)
app.include_router(report.router,        dependencies=_private)
app.include_router(session_state.router, dependencies=_private)
app.include_router(mpr.router,           dependencies=_private)
app.include_router(phases.router,        dependencies=_private)
app.include_router(centerline.router,    dependencies=_private)
app.include_router(audit.router,         dependencies=_private)
app.include_router(mesh_edit.router,     dependencies=_private)
app.include_router(print_prep.router,    dependencies=_private)
app.include_router(preprocess.router,    dependencies=_private)
app.include_router(devices.router,        dependencies=_private)
app.include_router(clip_library.router,  dependencies=_private)
app.include_router(clip_orders.router,   dependencies=_private)
app.include_router(progress.router,      dependencies=_private)
app.include_router(ground_truth.router,  dependencies=_private)
app.include_router(attach.router,        dependencies=_private)
app.include_router(followup.router,      dependencies=_private)
app.include_router(annotations.router,   dependencies=_private)
# El WebSocket no lleva la dependencia de arriba: un navegador no puede mandar
# la cabecera Authorization en el handshake de un WS, así que el token viaja
# en la query y `ws_progress` lo valida él mismo con `user_for_token`.
app.include_router(progress.ws_router)
# ── Documentación de la API, solo con sesión ──────────────────────────────── #
#
# Swagger pide /openapi.json desde el navegador con la cookie de sesión, así
# que a quien ya entró le funciona igual que antes. Para exportar el esquema
# sin servidor: scripts/export_openapi.py.

_docs_private = [Depends(require_user)]


@app.get("/openapi.json", include_in_schema=False, dependencies=_docs_private)
async def openapi_schema() -> JSONResponse:
    return JSONResponse(app.openapi())


@app.get("/docs", include_in_schema=False, dependencies=_docs_private)
async def swagger_ui():
    from fastapi.openapi.docs import get_swagger_ui_html
    return get_swagger_ui_html(openapi_url="/openapi.json", title=f"{app.title} — Swagger UI")


@app.get("/redoc", include_in_schema=False, dependencies=_docs_private)
async def redoc_ui():
    from fastapi.openapi.docs import get_redoc_html
    return get_redoc_html(openapi_url="/openapi.json", title=f"{app.title} — ReDoc")


# ── Health check ──────────────────────────────────────────────────────────── #

@app.get("/health", tags=["system"], summary="Health check")
async def health() -> dict:
    return {"status": "ok", "version": app.version}


# ── API summary (useful during development) ───────────────────────────────── #

@app.get("/", tags=["system"], include_in_schema=False)
async def root() -> dict:
    return {
        "message": "PROSPECTIVE Web API",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
