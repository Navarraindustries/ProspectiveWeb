"""Clave foránea de `planning_sessions.imaging_study_id` en las bases antiguas.

La columna se añadió con un ALTER a mano, y SQLite no deja añadir una clave
foránea a una tabla que ya existe: una base nueva la tiene y una anterior no.
Sin ella se puede borrar un estudio de imagen y dejar sesiones apuntando a un
id que ya no existe (o que mañana es de otro estudio).

SQLite obliga a rehacer la tabla: Alembic la copia entera con la restricción
puesta (`batch_alter_table`). Antes se sueltan las sesiones que ya apuntaban a
un estudio inexistente; la sesión se conserva, solo pierde ese enlace.

Revision ID: 0003_fk_estudio_sesion
Revises: 0002_indice_estudio_sesion
Create Date: 2026-10-04
"""
from __future__ import annotations

import logging

from alembic import op
from sqlalchemy import inspect, text

revision = "0003_fk_estudio_sesion"
down_revision = "0002_indice_estudio_sesion"
branch_labels = None
depends_on = None

logger = logging.getLogger(__name__)

_TABLE = "planning_sessions"
_FK = "fk_planning_sessions_imaging_study_id"


def _has_fk() -> bool:
    return any(fk["referred_table"] == "imaging_studies" and fk["constrained_columns"] == ["imaging_study_id"]
               for fk in inspect(op.get_bind()).get_foreign_keys(_TABLE))


def upgrade() -> None:
    if _has_fk():
        return
    sueltas = op.get_bind().execute(text(
        "UPDATE planning_sessions SET imaging_study_id = NULL "
        "WHERE imaging_study_id IS NOT NULL "
        "AND imaging_study_id NOT IN (SELECT id FROM imaging_studies)"
    )).rowcount
    if sueltas:
        logger.warning("%d sesión(es) apuntaban a un estudio de imagen que ya no existe: se les quita el enlace", sueltas)
    with op.batch_alter_table(_TABLE, recreate="always") as batch:
        batch.create_foreign_key(_FK, "imaging_studies", ["imaging_study_id"], ["id"])


def downgrade() -> None:
    if _has_fk():
        with op.batch_alter_table(_TABLE, recreate="always") as batch:
            batch.drop_constraint(_FK, type_="foreignkey")
