"""P4 (18-11): métricas de sección del IVUS virtual — Ø por perímetro, Ø inscrito
y circularidad — sobre contornos de geometría conocida.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_ivus_p4_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np

from services.ivus_virtual import calcular_pullback, circulo_inscrito
from test_ivus_virtual import ESP, _linea, _sesion, _tubo, _volumen, client, radio
from services.sessions import session_subdir


def _circulo(r, c=(0.0, 0.0), n=720):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], 1)


def test_el_circulo_inscrito_de_un_circulo_es_el_mismo():
    d, c = circulo_inscrito(_circulo(1.5, c=(0.3, -0.2)))
    assert abs(d - 3.0) < 0.02 and np.hypot(c[0] - 0.3, c[1] + 0.2) < 0.02


def test_en_una_elipse_el_inscrito_es_el_eje_menor():
    a = np.linspace(0, 2 * np.pi, 720, endpoint=False)
    d, c = circulo_inscrito(np.stack([2.0 * np.cos(a), 0.8 * np.sin(a)], 1))
    assert abs(d - 1.6) < 0.02 and abs(c[1]) < 0.02


def test_en_una_media_luna_el_inscrito_no_esta_en_el_centroide():
    """Luz en media luna (un círculo de 2 mm con un bocado de 1,6 mm desde un lado):
    el mayor círculo está en el cuerpo de la luna y mide lo que su grosor."""
    # Los dos círculos se cortan en (1,2, ±1,6).
    t0 = np.arctan2(1.6, 1.2)
    a = np.linspace(t0, 2 * np.pi - t0, 400)
    fuera = np.stack([2.0 * np.cos(a), 2.0 * np.sin(a)], 1)
    b = np.linspace(1.5 * np.pi, 0.5 * np.pi, 400)[1:-1]
    bocado = np.stack([1.2 + 1.6 * np.cos(b), 1.6 * np.sin(b)], 1)
    q = np.vstack([fuera, bocado])
    d, c = circulo_inscrito(q)
    # Grosor en el eje: de −2 a −0,4 → un círculo de 1,6 mm centrado en (−1,2, 0).
    # (en y el óptimo es muy plano: 0,1 mm de lado cambian el radio en milésimas)
    assert abs(d - 1.6) < 0.03 and abs(c[0] + 1.2) < 0.05 and abs(c[1]) < 0.15


def test_el_tubo_da_circularidad_casi_uno_y_los_tres_diametros_iguales():
    pts, radios, arco = _linea()
    pb = calcular_pullback(pts, radios, arco, _tubo(), _volumen(), (ESP, ESP, ESP))
    for s, z in zip(pb.secciones, pts[:, 2]):
        r = float(radio(z))
        assert abs(s.d_perimetro_mm - 2 * r) < 0.05, (z, s.d_perimetro_mm)
        assert abs(s.d_inscrito_mm - 2 * r) < 0.05, (z, s.d_inscrito_mm)
        assert s.circularidad > 0.97
        assert np.hypot(*s.centro_inscrito) < 0.05


def test_una_luz_aplastada_baja_la_circularidad_y_el_inscrito():
    """Tubo de sección elíptica 2,0 × 0,8 mm: misma área que un círculo de ~1,26 mm de radio."""
    import vtk
    t = vtk.vtkTransform(); t.Translate(10, 10, 0); t.Scale(2.0 / 1.5, 0.8 / 1.5, 1.0); t.Translate(-10, -10, 0)
    f = vtk.vtkTransformPolyDataFilter(); f.SetInputData(_tubo(r=1.5)); f.SetTransform(t); f.Update()
    pts, radios, arco = _linea()
    pb = calcular_pullback(pts, radios * 0 + 1.4, arco, f.GetOutput(), _volumen(), (ESP, ESP, ESP))
    s = pb.secciones[10]
    assert abs(s.d_inscrito_mm - 1.6) < 0.05
    assert s.d_eq_mm > 2.4                                     # el equivalente lo esconde
    assert s.circularidad < 0.85
    assert s.d_perimetro_mm > s.d_eq_mm                       # P/π ≥ Ø equivalente siempre


def test_api_da_las_medidas_nuevas_y_rehace_una_cache_vieja():
    sid = _sesion()
    datos = session_subdir(sid, "meshes") / "ivus_pullback.json"
    r = client.post(f"/api/centerline/{sid}/ivus")
    assert r.status_code == 200, r.text
    s0 = r.json()["sections"][0]
    assert abs(s0["d_inscribed_mm"] - 3.0) < 0.06 and abs(s0["d_perimeter_mm"] - 3.0) < 0.06
    assert s0["circularity"] > 0.97 and len(s0["inscribed_center"]) == 2
    # Una caché de antes de la P4 (sin versión en la clave) no vale: se recalcula.
    g = json.loads(datos.read_text(encoding="utf-8"))
    g["clave"] = g["clave"].split("|", 1)[1]
    for s in g["datos"]["sections"]:
        s.pop("d_inscribed_mm", None)
    datos.write_text(json.dumps(g), encoding="utf-8")
    s0 = client.post(f"/api/centerline/{sid}/ivus").json()["sections"][0]
    assert s0["d_inscribed_mm"] is not None


def test_el_informe_lleva_la_forma_de_la_luz_en_la_mla():
    from reportlab.platypus import Paragraph, Table

    from services.informe_vini3d import datos_vini3d
    from services.report_generator import ReportData, ReportGenerator

    v = datos_vini3d(_sesion())
    story = ReportGenerator(ReportData(vini3d=v))._section_vini3d()
    celdas = [c for t in story if isinstance(t, Table) for fila in t._cellvalues for c in fila]
    textos = " ".join(c.text if isinstance(c, Paragraph) else str(c) for c in celdas)
    assert "Forma de la luz en la MLA" in textos
    assert "Ø inscrito 2," in textos and "circularidad " in textos       # estrechamiento a 1,0 mm de radio
