"""El esquema versionado con Alembic (migrations/): una base nueva nace
marcada, una que ya existía se pone al día, y los modelos no se han movido
sin su revisión.
"""
from __future__ import annotations

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import services.db_models  # noqa: F401
from services.database import Base, _alembic_config, engine, run_migrations


def _head() -> str:
    return ScriptDirectory.from_config(_alembic_config()).get_current_head()


def _version(bind) -> str | None:
    with bind.connect() as c:
        return MigrationContext.configure(c).get_current_revision()


def test_la_base_de_la_suite_esta_en_la_ultima_revision():
    assert _version(engine) == _head()


def test_una_base_nueva_se_marca_sin_aplicar_nada(tmp_path):
    e = create_engine(f"sqlite:///{tmp_path / 'nueva.db'}")
    Base.metadata.create_all(bind=e)
    run_migrations(bind=e, fresh=True)
    assert _version(e) == _head()


def test_una_base_anterior_a_alembic_se_pone_al_dia_sin_perder_datos(tmp_path):
    e = create_engine(f"sqlite:///{tmp_path / 'vieja.db'}")
    Base.metadata.create_all(bind=e)
    with e.begin() as c:
        c.execute(text("CREATE TABLE notas_de_antes (texto TEXT)"))
        c.execute(text("INSERT INTO notas_de_antes VALUES ('sigue aquí')"))
    assert not inspect(e).has_table("alembic_version")

    run_migrations(bind=e, fresh=False)

    assert _version(e) == _head()
    with e.connect() as c:
        assert c.execute(text("SELECT texto FROM notas_de_antes")).scalar() == "sigue aquí"


def test_a_una_base_antigua_se_le_pone_el_indice_que_le_faltaba(tmp_path):
    # Como quedaba tras el ALTER a mano: la columna sin su índice.
    e = create_engine(f"sqlite:///{tmp_path / 'sin_indice.db'}")
    Base.metadata.create_all(bind=e)
    with e.begin() as c:
        c.execute(text("DROP INDEX ix_planning_sessions_imaging_study_id"))

    run_migrations(bind=e, fresh=False)

    with e.connect() as c:
        diff = compare_metadata(MigrationContext.configure(c), Base.metadata)
    assert diff == [], diff


def _como_antes_del_alter(e) -> None:
    """Deja `planning_sessions` como en una base anterior: la columna
    `imaging_study_id` añadida con ALTER, sin índice ni clave foránea."""
    import re
    with e.begin() as c:
        c.execute(text("PRAGMA foreign_keys=OFF"))
        sql = c.execute(text("SELECT sql FROM sqlite_master WHERE name='planning_sessions'")).scalar()
        sin_fk = re.sub(r",\s*(CONSTRAINT \w+ )?FOREIGN KEY\(imaging_study_id\) REFERENCES imaging_studies \(id\)", "", sql)
        assert sin_fk != sql
        indices = [r[0] for r in c.execute(text(
            "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='planning_sessions' "
            "AND sql IS NOT NULL AND name != 'ix_planning_sessions_imaging_study_id'"))]
        c.execute(text("DROP TABLE planning_sessions"))
        c.execute(text(sin_fk))
        for i in indices:
            c.execute(text(i))


def _fila(c, tabla: str, **valores) -> None:
    """Inserta una fila rellenando lo obligatorio con un valor cualquiera."""
    cols = dict(valores)
    for col in inspect(c).get_columns(tabla):
        if col["name"] in cols or col["nullable"] or col["primary_key"]:
            continue
        tipo = str(col["type"]).upper()
        cols[col["name"]] = ("2026-01-01 00:00:00" if "DATE" in tipo
                             else 0 if any(t in tipo for t in ("INT", "FLOAT", "BOOL", "NUM")) else "x")
    nombres = ", ".join(cols)
    c.execute(text(f"INSERT INTO {tabla} ({nombres}) VALUES ({', '.join(':' + n for n in cols)})"), cols)


def test_a_una_base_antigua_se_le_pone_la_clave_foranea_sin_perder_sesiones(tmp_path):
    e = create_engine(f"sqlite:///{tmp_path / 'sin_fk.db'}")
    Base.metadata.create_all(bind=e)
    _como_antes_del_alter(e)
    with e.begin() as c:
        c.execute(text("PRAGMA foreign_keys=OFF"))     # solo importa el enlace que se migra
        _fila(c, "imaging_studies", id=7)
        _fila(c, "planning_sessions", session_id="con-estudio", imaging_study_id=7)
        _fila(c, "planning_sessions", session_id="estudio-borrado", imaging_study_id=999)
        _fila(c, "planning_sessions", session_id="sin-estudio", imaging_study_id=None)

    run_migrations(bind=e, fresh=False)

    fks = inspect(e).get_foreign_keys("planning_sessions")
    assert any(f["referred_table"] == "imaging_studies" for f in fks)
    with e.connect() as c:
        filas = dict(c.execute(text("SELECT session_id, imaging_study_id FROM planning_sessions")).fetchall())
        diff = compare_metadata(MigrationContext.configure(c), Base.metadata)
    # Las tres siguen; la que apuntaba a un estudio que no existe pierde el enlace.
    assert filas == {"con-estudio": 7, "estudio-borrado": None, "sin-estudio": None}
    assert diff == [], diff
