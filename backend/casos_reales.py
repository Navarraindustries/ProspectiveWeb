"""Dónde están los estudios reales con los que se prueban las regresiones.

`Archivos DICOM/` está en .gitignore (son datos de pacientes), así que cada
copia del repositorio la tiene, o no, en su sitio. Antes cada test la buscaba a
su manera: rutas absolutas de un equipo concreto, o la carpeta de una sesión de
desarrollo que se purga a las 24 h, y entonces el test se saltaba en silencio.
En un worktree (`.claude/worktrees/…`) la carpeta no está dentro, sino en la
copia principal.

Orden: PROSPECTIVE_ARCHIVOS_DICOM, y si no, la primera `Archivos DICOM/` que
aparezca subiendo desde aquí (la del repositorio, o la de la copia principal
desde un worktree).
"""
from __future__ import annotations

import os
from pathlib import Path


def archivos_dicom() -> Path:
    env = os.environ.get("PROSPECTIVE_ARCHIVOS_DICOM")
    if env:
        return Path(env)
    for carpeta in Path(__file__).resolve().parents:
        candidata = carpeta / "Archivos DICOM"
        if candidata.is_dir():
            return candidata
    # No está: una ruta que no existe, para que quien la use se salte con su motivo.
    return Path(__file__).resolve().parents[1] / "Archivos DICOM"
