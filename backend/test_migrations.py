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
