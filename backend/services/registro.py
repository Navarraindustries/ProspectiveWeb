"""Registro del servidor: con fecha, a consola y a un fichero que rota.

Sin configuración, los mensajes informativos de la aplicación (qué sesión se
purgó, qué se borró al cambiar la malla, qué se restauró) se descartaban, y los
avisos salían sin fecha a una consola que nadie guarda. Cuando algo fallaba en
uso, no quedaba de dónde reconstruirlo.

- Nivel: PROSPECTIVE_LOG_LEVEL (INFO por defecto).
- Carpeta: PROSPECTIVE_LOG_DIR (data/logs por defecto, fuera de git). Los tests
  la apuntan a un temporal (conftest.py).
"""
from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

FORMATO = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
_MARCA = "_prospective_registro"


def configurar_registro() -> Path | None:
    """Configura el registro una vez por proceso. Devuelve el fichero, si hay."""
    raiz = logging.getLogger()
    if getattr(raiz, _MARCA, False):
        return None
    nivel = getattr(logging, os.environ.get("PROSPECTIVE_LOG_LEVEL", "INFO").upper(), logging.INFO)
    formato = logging.Formatter(FORMATO)
    raiz.setLevel(nivel)
    consola = logging.StreamHandler()
    consola.setFormatter(formato)
    raiz.addHandler(consola)

    fichero: Path | None = None
    carpeta = Path(os.environ.get("PROSPECTIVE_LOG_DIR")
                   or Path(__file__).resolve().parents[1] / "data" / "logs")
    try:
        carpeta.mkdir(parents=True, exist_ok=True)
        fichero = carpeta / "backend.log"
        rotativo = RotatingFileHandler(fichero, maxBytes=10_000_000, backupCount=5, encoding="utf-8")
        rotativo.setFormatter(formato)
        raiz.addHandler(rotativo)
    except OSError as exc:                    # sin disco o sin permiso: queda la consola
        logging.getLogger(__name__).warning("Sin fichero de registro en %s: %s", carpeta, exc)
        fichero = None
    # Las librerías ruidosas, solo avisos.
    for ruidosa in ("multipart", "PIL", "matplotlib", "urllib3"):
        logging.getLogger(ruidosa).setLevel(logging.WARNING)
    setattr(raiz, _MARCA, True)
    return fichero
