"""`planning_sessions.size_bytes`: lo que ocupa cada sesión guardada (F2-73).

La ficha del paciente no decía cuánto pesa cada guardado (cada uno es una copia
completa con el volumen). Nulo en las filas anteriores: se calcula al listarlas.
`init_db` llama a `create_all` antes de migrar, que no añade columnas a tablas
existentes pero sí las crea en una base nueva: se comprueba antes de añadirla.

Revision ID: 0005_tamano_sesion_guardada
Revises: 0004_patient_shares
Create Date: 2026-10-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0005_tamano_sesion_guardada"
down_revision = "0004_patient_shares"
branch_labels = None
depends_on = None

_TABLE = "planning_sessions"
_COLUMN = "size_bytes"


def _tiene_columna() -> bool:
    return any(c["name"] == _COLUMN for c in inspect(op.get_bind()).get_columns(_TABLE))


def upgrade() -> None:
    if not _tiene_columna():
        with op.batch_alter_table(_TABLE) as batch:
            batch.add_column(sa.Column(_COLUMN, sa.Integer(), nullable=True))


def downgrade() -> None:
    if _tiene_columna():
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_column(_COLUMN)
