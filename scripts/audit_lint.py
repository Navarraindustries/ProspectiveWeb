"""Comprueba el informe de la auditoría funcional (F1).

Por qué: el informe lo escriben varias tareas y varios agentes; sin una
comprobación mecánica se cuelan veredictos inventados, filas sin destino y
pantallas olvidadas. El script falla con mensaje claro y código 1.

Uso: python scripts/audit_lint.py docs/superpowers/audits/<informe>.md [--complete]
  --complete  exige además que estén todas las pantallas del alcance.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

VEREDICTOS = {"mantener", "corregir", "fusionar", "eliminar"}
GRAVEDADES = {"bloquea", "confunde", "cosmético", "—"}
DESTINOS = {"F1", "F2", "F3", "E5", "—"}

# Encabezados `###` que el informe completo debe contener (spec §2).
PANTALLAS_OBLIGATORIAS = [
    "Landing", "Entrar", "Crear cuenta", "Cambio forzado de contraseña",
    "Pacientes", "Ficha del paciente", "Estudios", "Nuevo caso",
    "Usuarios", "Solicitudes", "Pedidos de clips", "Auditoría", "Talleres", "Menú de usuario y tema",
    "Barra superior del espacio de trabajo", "Carril de pasos y ficha", "Barra del visor",
    "HUD y niveles", "Atajos", "Anotaciones", "Capturas y grabación",
    "Paso 1 · Carga DICOM", "Paso 2 · Segmentación", "Paso 3 · Detección",
    "Paso 4 · Morfometría", "Paso 5 · Decisión", "Paso 6 · Dispositivos",
    "Paso 7 · Fabricación", "Paso 8 · Informe", "Guardar y reanudar",
    "Usuario no administrador",
]

FILA = re.compile(r"^\|(.+)\|\s*$")


def main(argv: list[str]) -> int:
    if not argv:
        print("uso: audit_lint.py <informe.md> [--complete]")
        return 2
    path = Path(argv[0])
    complete = "--complete" in argv[1:]
    text = path.read_text(encoding="utf-8")
    errores: list[str] = []
    filas = 0
    for n, linea in enumerate(text.splitlines(), 1):
        m = FILA.match(linea)
        if not m:
            continue
        celdas = [c.strip() for c in m.group(1).split("|")]
        if len(celdas) != 6 or celdas[0] in {"Elemento", ""} or set(celdas[0]) <= {"-", ":"}:
            continue   # cabecera, separador u otra tabla
        filas += 1
        _, _, veredicto, gravedad, destino, _ = celdas
        if veredicto not in VEREDICTOS:
            errores.append(f"línea {n}: veredicto «{veredicto}» no permitido")
        if gravedad not in GRAVEDADES:
            errores.append(f"línea {n}: gravedad «{gravedad}» no permitida")
        if destino not in DESTINOS:
            errores.append(f"línea {n}: destino «{destino}» no permitido")
        if veredicto == "mantener" and (gravedad != "—" or destino != "—"):
            errores.append(f"línea {n}: «mantener» lleva gravedad y destino «—»")
        if veredicto != "mantener" and (gravedad == "—" or destino == "—"):
            errores.append(f"línea {n}: «{veredicto}» exige gravedad y destino")
    if complete:
        titulos = {t.strip() for t in re.findall(r"^###\s+(.+)$", text, flags=re.M)}
        for p in PANTALLAS_OBLIGATORIAS:
            if p not in titulos:
                errores.append(f"falta la pantalla «{p}»")
        for seccion in ("## Recorrido del especialista", "## Eliminaciones y fusiones propuestas"):
            if seccion not in text:
                errores.append(f"falta la sección «{seccion}»")
    for e in errores:
        print(e)
    print(f"{filas} filas de inventario, {len(errores)} errores")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
