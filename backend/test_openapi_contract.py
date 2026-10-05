"""El esquema de la API que el frontend tiene guardado es el de ahora.

De `frontend/openapi.json` salen los tipos generados (`npm run gen:api`) con
los que se comprueba, al compilar, que la interfaz y el servidor hablan de lo
mismo. Si este test falla, la API ha cambiado y hay que regenerarlo:

    cd backend
    .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json
    cd ../frontend && npm run gen:api
"""
from __future__ import annotations

from pathlib import Path

from scripts.export_openapi import export

GUARDADO = Path(__file__).resolve().parents[1] / "frontend" / "openapi.json"


def test_el_esquema_guardado_es_el_actual(tmp_path):
    actual = tmp_path / "openapi.json"
    export(actual)
    # Sin distinguir finales de línea: git los cambia según la plataforma.
    limpio = lambda p: p.read_text(encoding="utf-8").replace("\r\n", "\n")  # noqa: E731
    assert limpio(actual) == limpio(GUARDADO), (
        "La API ha cambiado: regenera frontend/openapi.json y los tipos (ver el docstring)."
    )
