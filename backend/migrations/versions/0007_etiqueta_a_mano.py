"""`planning_sessions.label_custom`: el nombre de un guardado se puso a mano.

«Guardar progreso» reescribía la etiqueta con la automática («<nombre> · <paso>»)
y pisaba el nombre que el usuario había escrito al renombrar. Con esta marca el
servidor distingue ambos casos. Las filas existentes quedan en falso: su
etiqueta se trata como automática, que es lo que han sido hasta ahora.
`init_db` llama a `create_all` antes de migrar: en una base nueva la columna ya
existe, así que se comprueba.

Revision ID: 0007_etiqueta_a_mano
Revises: 0006_users_rejected_at
Create Date: 2026-10-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0007_etiqueta_a_mano"
down_revision = "0006_users_rejected_at"
branch_labels = None
depends_on = None

_TABLE = "planning_sessions"
_COLUMN = "label_custom"


def _tiene_columna() -> bool:
    return any(c["name"] == _COLUMN for c in inspect(op.get_bind()).get_columns(_TABLE))


def upgrade() -> None:
    if not _tiene_columna():
        with op.batch_alter_table(_TABLE) as batch:
            batch.add_column(sa.Column(_COLUMN, sa.Boolean(), nullable=False,
                                       server_default=sa.false()))


def downgrade() -> None:
    if _tiene_columna():
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_column(_COLUMN)
