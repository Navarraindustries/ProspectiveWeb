"""Los avisos de VTK no abren la ventana «vtkOutputWindow» (services/vtk_output.py)."""
import os
import sys

import pytest
import vtk

from services.vtk_output import quiet_vtk_output_window


def _warn_once() -> None:
    """Provoca el aviso real de la pasada: vtkMassProperties con una línea."""
    pd = vtk.vtkPolyData()
    pts = vtk.vtkPoints()
    pts.InsertNextPoint(0, 0, 0)
    pts.InsertNextPoint(1, 0, 0)
    pd.SetPoints(pts)
    lines = vtk.vtkCellArray()
    lines.InsertNextCell(2)
    lines.InsertCellPoint(0)
    lines.InsertCellPoint(1)
    pd.SetLines(lines)
    m = vtk.vtkMassProperties()
    m.SetInputData(pd)
    m.Update()


_PROBE = """
import os, sys, ctypes, ctypes.wintypes as wt
{setup}
import vtk
pd = vtk.vtkPolyData(); pts = vtk.vtkPoints(); pts.InsertNextPoint(0, 0, 0); pts.InsertNextPoint(1, 0, 0)
pd.SetPoints(pts); ln = vtk.vtkCellArray(); ln.InsertNextCell(2); ln.InsertCellPoint(0); ln.InsertCellPoint(1); pd.SetLines(ln)
m = vtk.vtkMassProperties(); m.SetInputData(pd); m.Update()
user32 = ctypes.windll.user32; found = []
@ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
def cb(hwnd, _):
    pid = wt.DWORD(); user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if pid.value == os.getpid():
        buf = ctypes.create_unicode_buffer(128); user32.GetWindowTextW(hwnd, buf, 128)
        if buf.value == "vtkOutputWindow": found.append(int(hwnd))
    return True
user32.EnumWindows(cb, 0)
print(len(found))
"""


def _windows_after_warning_without_console(setup: str) -> int:
    """Lanza un python SIN consola (como el backend en servicio o una pasada
    oculta), provoca el aviso real de la pasada y cuenta las ventanas
    «vtkOutputWindow» de ese proceso."""
    import subprocess

    out = subprocess.run(
        [sys.executable, "-c", _PROBE.format(setup=setup)],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__)),
        creationflags=subprocess.CREATE_NO_WINDOW, timeout=120, check=True,
    )
    return int(out.stdout.strip().splitlines()[-1])


def test_la_instancia_es_la_de_stderr_y_es_idempotente():
    quiet_vtk_output_window()
    first = vtk.vtkOutputWindow.GetInstance()
    assert type(first) is vtk.vtkOutputWindow
    quiet_vtk_output_window()
    assert vtk.vtkOutputWindow.GetInstance() is first


def test_importar_segmentation_ya_la_deja_en_stderr():
    import services.segmentation  # noqa: F401 — el import la silencia
    assert type(vtk.vtkOutputWindow.GetInstance()) is vtk.vtkOutputWindow


@pytest.mark.skipif(sys.platform != "win32", reason="la ventana solo existe en Windows")
def test_sin_consola_el_aviso_abre_ventana_salvo_con_el_arreglo():
    # Control: VTK tal cual abre la ventana (es lo que veía el usuario).
    assert _windows_after_warning_without_console("") == 1
    # Con el módulo que trae VTK al backend y a los scripts, no hay ventana.
    assert _windows_after_warning_without_console("import services.segmentation") == 0
