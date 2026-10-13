"""`users.rejected_at`: cuándo se rechazó una solicitud de cuenta (F2-51).

Rechazar solo ponía `status = rejected` e `is_active = False`, igual que una
desactivación manual, y no había historial. `init_db` llama a `create_all`
antes de migrar: en una base nueva la columna ya existe, así que se comprueba.

Revision ID: 0006_users_rejected_at
Revises: 0005_tamano_sesion_guardada
Create Date: 2026-10-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0006_users_rejected_at"
down_revision = "0005_tamano_sesion_guardada"
branch_labels = None
depends_on = None

_TABLE = "users"
_COLUMN = "rejected_at"


def _tiene_columna() -> bool:
    return any(c["name"] == _COLUMN for c in inspect(op.get_bind()).get_columns(_TABLE))


def upgrade() -> None:
    if not _tiene_columna():
        with op.batch_alter_table(_TABLE) as batch:
            batch.add_column(sa.Column(_COLUMN, sa.DateTime(), nullable=True))


def downgrade() -> None:
    if _tiene_columna():
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_column(_COLUMN)
