"""Índice de `planning_sessions.imaging_study_id` en las bases antiguas.

La columna se añadió con un ALTER a mano, que no crea el índice que declara el
modelo: una base nueva lo tiene y una anterior no. Sin él, listar las sesiones
de un estudio recorre la tabla entera.

La clave foránea de esa columna tampoco existe en las bases antiguas. No se
añade aquí: en SQLite exige copiar la tabla entera, y el código ya comprueba
el estudio antes de enlazarlo.

Revision ID: 0002_indice_estudio_sesion
Revises: 0001_baseline
Create Date: 2026-10-04
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect

revision = "0002_indice_estudio_sesion"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

_INDEX = "ix_planning_sessions_imaging_study_id"
_TABLE = "planning_sessions"


def _has_index() -> bool:
    return any(i["name"] == _INDEX for i in inspect(op.get_bind()).get_indexes(_TABLE))


def upgrade() -> None:
    if not _has_index():
        op.create_index(_INDEX, _TABLE, ["imaging_study_id"])


def downgrade() -> None:
    if _has_index():
        op.drop_index(_INDEX, table_name=_TABLE)
