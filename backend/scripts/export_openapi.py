"""Escribe el esquema OpenAPI de la API en un fichero, sin arrancar el servidor.

    python scripts/export_openapi.py ../frontend/openapi.json

De ahí salen los tipos del frontend (`npm run gen:api`). Importar `main` no
abre la base de datos: eso pasa al arrancar, no al importar.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402


def export(dest: Path) -> None:
    schema = main.app.openapi()
    # Claves ordenadas y LF: el fichero es el mismo en Windows y en Linux, y
    # un cambio en él es un cambio en la API, no en el orden de un dict.
    text = json.dumps(schema, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    dest.write_bytes(text.encode("utf-8"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python scripts/export_openapi.py <destino.json>")
    export(Path(sys.argv[1]))
