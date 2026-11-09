"""`users`: avatar, foto de perfil y estado de onboarding.

`init_db` llama a `create_all` antes de migrar: en una base nueva las columnas
ya existen, así que se comprueba cada una. Los usuarios previos quedan como
invitados (onboarding sin hacer) y con modo avatar.

Revision ID: 0008_avatar_y_onboarding
Revises: 0007_etiqueta_a_mano
Create Date: 2026-11-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0008_avatar_y_onboarding"
down_revision = "0007_etiqueta_a_mano"
branch_labels = None
depends_on = None

_TABLE = "users"


def _columnas() -> list[sa.Column]:
    return [
        sa.Column("avatar_config", sa.Text(), nullable=True),
        sa.Column("avatar_mode", sa.String(8), nullable=False, server_default="avatar"),
        sa.Column("profile_photo_path", sa.String(300), nullable=False, server_default=""),
        sa.Column("onboarding_state", sa.Text(), nullable=True),
    ]


def _existentes() -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade() -> None:
    existentes = _existentes()
    nuevas = [c for c in _columnas() if c.name not in existentes]
    if nuevas:
        with op.batch_alter_table(_TABLE) as batch:
            for c in nuevas:
                batch.add_column(c)
    op.execute(sa.text(
        """UPDATE users SET onboarding_state = '{"estado":"invitado"}' WHERE onboarding_state IS NULL"""
    ))


def downgrade() -> None:
    existentes = _existentes()
    quitar = [c.name for c in _columnas() if c.name in existentes]
    if quitar:
        with op.batch_alter_table(_TABLE) as batch:
            for n in quitar:
                batch.drop_column(n)
