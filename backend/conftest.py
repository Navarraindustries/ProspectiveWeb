"""Pytest bootstrap — isolate the test database from the dev database.

Previously every test module called ``Base.metadata.create_all(bind=engine)`` on
the shared ``data/prospective.db``, so running the suite wrote hundreds of test
patients/sessions into the real dev database. Here we point the ORM at a throwaway
SQLite file *before* ``services.database`` is imported, then create the schema and
seed the default admin the tests rely on.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

# Todo lo de una ejecución vive en UNA carpeta propia, que se borra al acabar.
# Antes la base y la cadena iban a rutas fijas del temporal: dos baterías a la
# vez (dos worktrees, o la del CI y la local) compartían base y se pisaban, y
# cada ejecución dejaba decenas de carpetas `prospective_*` en el temporal.
# `tempfile.tempdir` hace que también los `mkdtemp()` de cada módulo de tests
# (y el `tmp_path` de pytest) caigan dentro.
_RAIZ = Path(tempfile.mkdtemp(prefix="prospective_tests_"))
tempfile.tempdir = str(_RAIZ)
# Y otra vez al salir del proceso: algún hilo de trabajo (segmentación, purga)
# termina después de pytest_unconfigure y deja carpetas de sesión.
import atexit  # noqa: E402
atexit.register(shutil.rmtree, _RAIZ, True)

# Must be set before anything imports services.database (it reads the env at
# import time to build the engine). conftest.py is imported by pytest first.
_TEST_DB = _RAIZ / "prospective_test.db"
os.environ["PROSPECTIVE_DB_URL"] = f"sqlite:///{_TEST_DB}"
# Los tests arrancan la app muchas veces, a veces en procesos paralelos: el
# cerrojo de un solo proceso (services/single_process.py) no va con ellos.
os.environ["PROSPECTIVE_ALLOW_MULTI_PROCESS"] = "1"
# Las sesiones de los tests, en un temporal: no en data/sessions ni en
# data/session_saves, donde viven las del usuario.
os.environ.setdefault("PROSPECTIVE_SESSIONS_ROOT", tempfile.mkdtemp(prefix="prospective_sessions_"))
os.environ.setdefault("PROSPECTIVE_SAVES_ROOT", tempfile.mkdtemp(prefix="prospective_saves_"))
# Los tests actúan como `admin` / `admin123` sin pasar por el cambio de
# contraseña inicial que la app exige (test_auth_hardening lo comprueba aparte).
os.environ["PROSPECTIVE_ALLOW_DEFAULT_ADMIN_PASSWORD"] = "1"

# El archivo de estudios, a una carpeta temporal. Varios módulos lo fijan
# también por su cuenta al importarse; en un solo proceso gana el último
# import, así que aquí se garantiza que, gane quien gane, nunca sea el real.
os.environ["STORAGE_BACKEND"] = "local"
os.environ.setdefault("STUDY_FILES_ROOT", tempfile.mkdtemp(prefix="prospective_study_files_"))

# Los pedidos de clips y la biblioteca de clips, igual. Sus módulos fijan la
# carpeta AL IMPORTARSE, y sus tests la vacían entre caso y caso: si otro test
# importaba la app antes de que el de pedidos pusiera su carpeta temporal, el
# vaciado caía sobre los pedidos reales. Aquí se fija antes que nadie; con
# `setdefault` para que quien la pida por su cuenta siga mandando.
os.environ.setdefault("CLIP_ORDERS_ROOT", tempfile.mkdtemp(prefix="prospective_clip_orders_"))
os.environ.setdefault("CLIP_LIBRARY_ROOT", tempfile.mkdtemp(prefix="prospective_clip_library_"))

# Fotos y CV de las cuentas, igual: sin esto los tests escribían en el
# backend/user_files real con nombres «<id>.png» que podían pisar las fotos de
# cuentas reales con el mismo id.
os.environ["PROSPECTIVE_USER_FILES"] = tempfile.mkdtemp(prefix="prospective_user_files_")

# Sesiones de trabajo y guardados: sin esto create_session()/snapshot_session()
# llenaban backend/data/sessions y backend/data/session_saves reales.
os.environ.setdefault("PROSPECTIVE_SESSIONS_ROOT", tempfile.mkdtemp(prefix="prospective_sessions_"))
os.environ.setdefault("PROSPECTIVE_SAVES_ROOT", tempfile.mkdtemp(prefix="prospective_saves_"))

# The audit chain too. Without this the suite appended thousands of blocks to
# the developer's real chain, and the endpoint test then asserted a property of
# that file rather than of the code: one break anywhere in it — a crash, two
# processes appending at once — turned the suite red for reasons no test caused.
_TEST_CHAIN = _RAIZ / "prospective_test_chain.db"
os.environ["AUDIT_DB_PATH"] = str(_TEST_CHAIN)
# La clave que firma la cadena: fija en los tests, sin escribir en secrets/.
os.environ.setdefault("AUDIT_HMAC_KEY", "clave-de-pruebas-de-la-cadena")

# Los tests registran muchas cuentas desde la misma dirección: el tope de
# solicitudes por hora se prueba aparte (test_seguridad_media.py).
os.environ.setdefault("PROSPECTIVE_SIGNUP_PER_HOUR", "100000")

# El registro del servidor (services/registro.py), igual: no al data/logs real.
os.environ.setdefault("PROSPECTIVE_LOG_DIR", tempfile.mkdtemp(prefix="prospective_logs_"))

# Create tables + seed the default admin (admin/admin123) on the fresh test DB,
# mirroring the app's startup lifespan which TestClient does not run at import.
from services.database import SessionLocal, init_db  # noqa: E402
from services.auth_service import seed_default_user   # noqa: E402

init_db()
_db = SessionLocal()
try:
    seed_default_user(_db)
finally:
    _db.close()

# ── Authenticated by default ──────────────────────────────────────────────── #
#
# Patient data endpoints now require a token (they used to answer anonymously,
# which is what made the whole registry readable without logging in). Every test
# module builds its own ``TestClient(app)`` at import time, so instead of
# threading a header through ~300 call sites the client is given one by default.
# The header is a REAL token verified by the real dependency, so the tests still
# exercise authentication rather than bypassing it.
#
# For tests that must be anonymous, use ``anonymous_client(app)`` below.
from starlette.testclient import TestClient as _TestClient  # noqa: E402
from services.auth_service import create_access_token       # noqa: E402

_TEST_TOKEN = create_access_token(subject="admin")

_orig_testclient_init = _TestClient.__init__


def _testclient_init(self, *args, **kwargs):
    _orig_testclient_init(self, *args, **kwargs)
    self.headers.setdefault("Authorization", f"Bearer {_TEST_TOKEN}")


_TestClient.__init__ = _testclient_init


def anonymous_client(app):
    """A TestClient with no credentials, for asserting endpoints reject anons."""
    c = _TestClient(app)
    c.headers.pop("Authorization", None)
    c.cookies.clear()
    return c


def pytest_unconfigure(config):
    # La carpeta de la ejecución, fuera. Con algo aún abierto (Windows no deja
    # borrar un SQLite abierto) se queda lo que no se pudo: ignore_errors.
    import gc
    import logging
    from services.database import engine
    engine.dispose()
    # El registro del servidor y la cadena de auditoría siguen abiertos.
    logging.shutdown()
    try:
        from services.audit import SkullChain
        if SkullChain._instance is not None:
            SkullChain._instance._conn.close()
    except Exception:  # noqa: BLE001
        pass
    gc.collect()   # memmaps de volúmenes que aún sujetan ficheros
    shutil.rmtree(_RAIZ, ignore_errors=True)


def pytest_configure(config):
    # Tests lentos (p. ej. Case 3 tubular a resolución nativa, ~40 s de Frangi):
    # se ejecutan por defecto; para un ciclo rápido, `pytest -m "not slow"`.
    config.addinivalue_line("markers", "slow: test lento; se omite con -m \"not slow\"")
