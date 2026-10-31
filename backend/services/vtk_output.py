"""Los avisos de VTK van a stderr, nunca a una ventana.

En Windows, VTK instala ``vtkWin32OutputWindow`` como destino de sus avisos y
errores. Esa clase abre una ventana propia («vtkOutputWindow») en cuanto llega
el primer aviso, haga lo que haga su ``DisplayMode``: medido con VTK 9.6.1, en
los modos DEFAULT, NEVER y ALWAYS_STDERR la ventana se crea igual. En un
proceso sin consola (el backend como servicio, las pasadas largas lanzadas
ocultas) la ventana aparece sola y «no responde» mientras el hilo calcula.

La salida es sustituir la instancia por la clase base ``vtkOutputWindow``, que
escribe en stderr y no tiene ventana. Los avisos siguen llegando al log del
proceso a través de ``vtkLogger``, como hasta ahora.
"""
from __future__ import annotations

import vtk


def quiet_vtk_output_window() -> None:
    """Sustituye la ventana de salida de VTK por la de stderr (idempotente)."""
    current = vtk.vtkOutputWindow.GetInstance()
    if type(current) is vtk.vtkOutputWindow:
        return
    vtk.vtkOutputWindow.SetInstance(vtk.vtkOutputWindow())
