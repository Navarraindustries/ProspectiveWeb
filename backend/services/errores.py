"""Mensajes de error para el médico, sin el texto de la excepción de Python.

Había 47 mensajes del tipo «No se pudo X: {exc}»: el médico leía
«list index out of range» o un volcado de VTK, sin saber qué hacer. Aquí:

- Un ValueError lleva un mensaje escrito por nosotros, en español, sobre lo
  que el médico pidió (un clip mal formado, una medida imposible): se enseña.
- Cualquier otra excepción es un fallo interno: el médico ve la frase, una
  referencia corta y qué hacer; el detalle completo va al registro del
  servidor con esa misma referencia, para buscarlo.
"""
from __future__ import annotations

import logging
import secrets

logger = logging.getLogger("prospective.errores")


def mensaje_error(base: str, exc: BaseException) -> str:
    if isinstance(exc, ValueError) and str(exc).strip():
        return f"{base}: {exc}"
    ref = secrets.token_hex(3)
    logger.error("%s [ref %s]: %r", base, ref, exc, exc_info=exc)
    return (f"{base}. Es un fallo interno y quedó anotado en el registro del servidor "
            f"(referencia {ref}): vuelve a intentarlo y, si se repite, avisa al administrador con esa referencia.")
