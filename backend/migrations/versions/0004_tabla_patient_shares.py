"""Tabla `patient_shares`: con qué cuentas se comparte cada paciente (F2-75).

Hasta F2 un no administrador solo veía los pacientes que él creó; si el caso
lo abría radiología o un residente, el cirujano no lo encontraba. Cada fila da
a una cuenta acceso a un paciente; quién la dio queda en `shared_by`.

`init_db` llama a `create_all` antes de migrar, así que en una base que ya
existía la tabla puede estar creada cuando llega esta revisión: se comprueba
antes de crearla.

Revision ID: 0004_patient_shares
Revises: 0003_fk_estudio_sesion
Create Date: 2026-10-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0004_patient_shares"
down_revision = "0003_fk_estudio_sesion"
branch_labels = None
depends_on = None

_TABLE = "patient_shares"


def upgrade() -> None:
    if inspect(op.get_bind()).has_table(_TABLE):
        return
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("shared_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shared_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("patient_id", "user_id", name="uq_patient_shares_patient_user"),
    )
    op.create_index("ix_patient_shares_patient_id", _TABLE, ["patient_id"])
    op.create_index("ix_patient_shares_user_id", _TABLE, ["user_id"])


def downgrade() -> None:
    if inspect(op.get_bind()).has_table(_TABLE):
        op.drop_table(_TABLE)
