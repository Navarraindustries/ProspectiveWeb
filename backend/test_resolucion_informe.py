"""P15 (Dalmer 2026): el informe dice con qué vóxel se midió.

En el fantoma de la P14 un tubo de Ø 2 mm salía con Ø inscrito 1,6: la línea
central mide sobre una rejilla de 0,8 mm. Sin decir eso, el informe presenta
1,6 como si fuera el vaso."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_resol_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app
from services.centerline import extract_centerline
from services.database import Base, engine
from services.fantoma_tubos import fantoma, recta
from services.report_generator import ReportData, ReportGenerator, build_report_data_from_session
from services.resolucion import Resolucion, resolucion_sesion
from services.sessions import create_session, session_subdir, write_states

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _segmentada(factor: int = 1, preprocesado: bool = False) -> str:
    sid = create_session()
    write_states(sid, {
        "dicom.spacing_x": "0.39", "dicom.spacing_y": "0.39", "dicom.spacing_z": "0.62",
        "seg.mesh_url": "/data/sessions/x/meshes/vessel_tree.vtp",
        "seg.downsample_factor": str(factor),
        "preprocess.ops": "n4,resample" if preprocesado else "",
    })
    return sid


def _con_linea(sid: str, **extra) -> None:
    m = session_subdir(sid, "meshes")
    pts = np.c_[np.zeros(40), np.zeros(40), np.linspace(0, 20, 40)]
    np.savez(m / "centerline_points.npz", points=pts.astype(np.float32),
             radii=np.full(40, 1.0, dtype=np.float32), **extra)
    (m / "centerline.vtp").write_bytes(b"")


def _textos(flowables) -> str:
    from reportlab.platypus import Paragraph, Table
    out = []
    for f in flowables:
        if isinstance(f, Table):
            for fila in f._cellvalues:
                out += [c.text if isinstance(c, Paragraph) else str(c) for c in fila]
        else:
            out.append(getattr(f, "text", ""))
    return " ".join(out)


# ── Lo que se lee de la sesión ────────────────────────────────────────────── #

def test_sin_segmentar_no_hay_resolucion():
    sid = create_session()
    write_states(sid, {"dicom.spacing_x": "0.4", "dicom.spacing_y": "0.4", "dicom.spacing_z": "0.6"})
    assert resolucion_sesion(sid).vacia


def test_media_resolucion_agranda_el_voxel_de_la_malla():
    r = resolucion_sesion(_segmentada(factor=2, preprocesado=True))
    assert r.estudio_mm == pytest.approx((0.39, 0.39, 0.62))
    assert r.factor == 2 and r.preprocesado
    assert r.malla_mm == pytest.approx((0.78, 0.78, 1.24))
    assert r.lado_mayor_mm == pytest.approx(1.24)


def test_la_rejilla_de_la_linea_solo_si_se_guardo():
    sid = _segmentada()
    _con_linea(sid, voxel_mm=np.array(0.8))
    assert resolucion_sesion(sid).linea_mm == pytest.approx(0.8)
    vieja = _segmentada()
    _con_linea(vieja)                         # línea de antes de P15
    assert resolucion_sesion(vieja).linea_mm is None


def test_la_extraccion_guarda_la_rejilla_que_uso():
    f = fantoma("recta", recta(30.0), 1.5, 0.0, 0.0)
    pts = f.eje
    res = extract_centerline(f.malla, tuple(pts[3]), tuple(pts[-4]), voxel_size_mm=0.6)
    assert res.voxel_mm == pytest.approx(0.6)


def test_la_api_devuelve_la_rejilla_y_null_en_las_viejas():
    sid = _segmentada()
    _con_linea(sid, voxel_mm=np.array(0.8))
    assert client.get(f"/api/centerline/{sid}").json()["voxel_mm"] == 0.8
    vieja = _segmentada()
    _con_linea(vieja)
    assert client.get(f"/api/centerline/{vieja}").json()["voxel_mm"] is None


# ── Lo que pone el informe ────────────────────────────────────────────────── #

def test_el_informe_dice_cada_voxel_y_el_error_en_el_cuello():
    r = Resolucion(estudio_mm=(0.39, 0.39, 0.62), factor=2, preprocesado=False,
                   linea_mm=0.8, ramas_mm=0.3, ramas_suelo_mm=0.6)
    data = ReportData(resolution=r, morphometrics={"neck_diameter_mm": 4.0})
    t = _textos(ReportGenerator(data)._section_resolution())
    assert "Resolución de las medidas" in t
    assert "0,39 × 0,39 × 0,62 mm" in t and "el del DICOM" in t
    assert "(×2): vóxel de 0,78 × 0,78 × 1,24 mm" in t
    assert "saltos de 0,80 mm" in t and "Ø 2 mm puede salir con 1,6" in t
    assert "menos de 0,60 mm" in t
    # 1,24 mm de lado mayor en un cuello de 4 mm.
    assert "en el cuello de 4,0 mm eso es ±31 %" in t


def test_resolucion_completa_y_preprocesado():
    r = Resolucion(estudio_mm=(0.5, 0.5, 0.5), factor=1, preprocesado=True)
    t = _textos(ReportGenerator(ReportData(resolution=r))._section_resolution())
    assert "tras el preprocesado" in t and "resolución completa" in t
    assert "cuello" not in t                          # sin cuello medido no hay %
    assert "Línea central" not in t                   # ni línea


def test_sin_datos_no_hay_seccion():
    assert ReportGenerator(ReportData())._section_resolution() == []
    assert ReportGenerator(ReportData(resolution=Resolucion()))._section_resolution() == []


def test_llega_al_documento_desde_la_sesion():
    sid = _segmentada(factor=2)
    _con_linea(sid, voxel_mm=np.array(0.8))
    data = build_report_data_from_session(sid)
    assert data.resolution is not None and data.resolution.linea_mm == pytest.approx(0.8)
    assert "Resolución de las medidas" in _textos(ReportGenerator(data)._build_story())
