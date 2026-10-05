"""Línea base: el esquema tal como lo dejan `create_all` y las migraciones
escritas a mano (`_migrate_*` en services/database.py) a 2026-10-04.

No hace nada. Existe para que una base que ya tenía datos quede marcada con
una versión, y lo que venga después se escriba como revisión.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-04
"""
from __future__ import annotations

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
