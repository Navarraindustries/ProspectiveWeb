"""Entorno de Alembic. Se lanza desde `services/database.py`, que le pasa la
conexión ya abierta; no hay `alembic.ini` ni URL duplicada que mantener.

Para generar una revisión nueva a mano:

    cd backend
    .venv/Scripts/python -m services.database revision "añade tal columna"
"""
from __future__ import annotations

from alembic import context

import services.db_models  # noqa: F401 — registra las tablas en Base.metadata
from services.database import Base, engine

target_metadata = Base.metadata


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,        # SQLite no sabe ALTER de casi nada: copia la tabla
        # Lo que está en la base y no en los modelos (p. ej. la tabla de las
        # migraciones a mano) no se propone borrar.
        include_object=lambda obj, name, type_, reflected, compare_to:
            not (type_ == "table" and reflected and compare_to is None),
    )
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get("connection")
if connection is not None:
    _run(connection)
else:
    with engine.connect() as conn:
        _run(conn)
        conn.commit()
