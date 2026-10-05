"""En una máquina sin OpenGL utilizable, pedir un informe no puede tirar el servidor.

`vtkRenderWindow.Render()` no lanza una excepción cuando no hay con qué
dibujar: provoca una violación de acceso que mata el proceso (visto en la
máquina de integración continua, dentro de `render_views`). El `except` de
quien llama no llega a enterarse. Ahora se pregunta antes, en un proceso
aparte, y sin dibujo el informe sale sin las vistas del plan.

Estos tests no dibujan: fuerzan la respuesta de la sonda.
"""
from __future__ import annotations

import vtk

import services.scene_render as sr
from services.report_generator import build_report_data_from_session
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir


def _esfera():
    s = vtk.vtkSphereSource(); s.SetRadius(5.0); s.Update()
    return s.GetOutput()


def test_sin_opengl_no_se_intenta_dibujar(monkeypatch):
    monkeypatch.setattr(sr, "_offscreen", False)

    def no_debe_crearse(*_a, **_k):
        raise AssertionError("se intentó crear una ventana de dibujo")
    monkeypatch.setattr(vtk, "vtkRenderWindow", no_debe_crearse)
    assert sr.render_plan_views(vessel=_esfera(), dome=None, devices=[]) == {}


def test_el_informe_sale_sin_vistas_en_vez_de_tirar_el_servidor(monkeypatch):
    monkeypatch.setattr(sr, "_offscreen", False)
    sid = create_session()
    write_vtp(_esfera(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    data = build_report_data_from_session(sid)
    assert data.plan_views == {}


def test_la_sonda_se_puede_forzar_por_entorno(monkeypatch):
    monkeypatch.setattr(sr, "_offscreen", None)
    monkeypatch.setenv("PROSPECTIVE_PLAN_VIEWS", "0")
    assert sr.offscreen_available() is False
    monkeypatch.setattr(sr, "_offscreen", None)
    monkeypatch.setenv("PROSPECTIVE_PLAN_VIEWS", "1")
    assert sr.offscreen_available() is True


def test_una_sonda_que_muere_se_lee_como_no_disponible(monkeypatch):
    # Lo que pasa de verdad en la máquina sin OpenGL: el proceso hijo muere.
    monkeypatch.setattr(sr, "_offscreen", None)
    monkeypatch.delenv("PROSPECTIVE_PLAN_VIEWS", raising=False)
    monkeypatch.setattr(sr, "_PROBE", "import os; os._exit(139)")
    assert sr.offscreen_available() is False
