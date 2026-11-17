"""IVUS virtual de VINI 3D (17-11): pullback de secciones sobre el volumen.

Vaso sintético: un tubo a lo largo de z de radio 1,5 mm con un estrechamiento a
1,0 mm en z = 22 mm; el volumen pinta su luz y la malla es su superficie. Las
medidas tienen que salir de la geometría conocida.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_ivus_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import vtk
from fastapi.testclient import TestClient
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray

from conftest import anonymous_client
from main import app
from services.database import Base, engine
from services.ivus_virtual import Seccion, calcular_pullback, marcar_ramas, marcos, resumir
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

EJE = (10.0, 10.0)            # x, y del eje del tubo (mm)
Z0, Z1 = 2.0, 43.0
ESP = 0.5                     # espaciado del volumen (mm)


def radio(z):
    """1,5 mm con un estrechamiento suave a 1,0 mm en z = 22."""
    return 1.5 - 0.5 * np.exp(-((np.asarray(z) - 22.0) / 1.5) ** 2)


def _tubo(cx=EJE[0], cy=EJE[1], r=radio, z0=Z0, z1=Z1, lados=72, paso=0.25) -> vtk.vtkPolyData:
    """Superficie cerrada de un tubo de radio r(z), con tapas."""
    zs = np.arange(z0, z1 + 1e-9, paso)
    ang = np.linspace(0, 2 * np.pi, lados, endpoint=False)
    rr = r(zs) if callable(r) else np.full_like(zs, r)
    anillos = np.stack([np.stack([cx + rr[k] * np.cos(ang), cy + rr[k] * np.sin(ang), np.full(lados, z)], 1)
                        for k, z in enumerate(zs)])
    pts = np.vstack([anillos.reshape(-1, 3), [[cx, cy, z0]], [[cx, cy, z1]]])
    n, c0, c1 = len(zs), len(pts) - 2, len(pts) - 1
    tri = []
    for k in range(n - 1):
        for j in range(lados):
            a, b = k * lados + j, k * lados + (j + 1) % lados
            tri += [[a, b, a + lados], [b, b + lados, a + lados]]
    for j in range(lados):
        tri += [[c0, (j + 1) % lados, j], [c1, (n - 1) * lados + j, (n - 1) * lados + (j + 1) % lados]]
    poly = vtk.vtkPolyData()
    vp = vtk.vtkPoints(); vp.SetData(numpy_to_vtk(pts.astype(np.float64), deep=True)); poly.SetPoints(vp)
    t = np.asarray(tri, dtype=np.int64)
    celdas = np.hstack([np.full((len(t), 1), 3, dtype=np.int64), t]).ravel()
    ca = vtk.vtkCellArray(); ca.ImportLegacyFormat(numpy_to_vtkIdTypeArray(celdas, deep=True)); poly.SetPolys(ca)
    return poly


def _union(*polys) -> vtk.vtkPolyData:
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    return ap.GetOutput()


def _volumen() -> np.ndarray:
    """(z, y, x) con la luz del tubo a 400 y el resto a 0, en el marco índice × espaciado."""
    z, y, x = np.mgrid[0:90, 0:40, 0:40].astype(np.float32) * ESP
    d = np.hypot(x - EJE[0], y - EJE[1])
    return np.where((d <= radio(z)) & (z >= Z0) & (z <= Z1), 400.0, 0.0).astype(np.float32)


def _linea():
    z = np.arange(5.0, 40.0 + 1e-9, 0.5)
    pts = np.stack([np.full_like(z, EJE[0]), np.full_like(z, EJE[1]), z], 1)
    arco = z - z[0]
    return pts, radio(z), arco


# ── Marco de rotación mínima ───────────────────────────────────────────── #

def test_el_marco_no_gira_sobre_si_mismo_en_un_arco_plano():
    th = np.linspace(0, np.pi, 120)
    p = np.stack([20 * np.sin(th), np.zeros_like(th), 20 * np.cos(th)], 1)
    t, u, v = marcos(p)
    # En una curva plana (plano xz) el eje fuera del plano no cambia: ±y siempre.
    assert np.all(np.abs(np.abs(v[:, 1]) - 1) < 1e-6)
    assert np.allclose(np.einsum("ij,ij->i", t, u), 0, atol=1e-9)


# ── Medidas sobre la geometría conocida ────────────────────────────────── #

def test_el_tubo_con_estrechamiento_da_sus_areas_su_mla_y_su_estenosis():
    pts, radios, arco = _linea()
    pb = calcular_pullback(pts, radios, arco, _tubo(), _volumen(), (ESP, ESP, ESP))
    assert len(pb.secciones) == len(pts) and all(s.valida for s in pb.secciones)
    for s, z in zip(pb.secciones, pts[:, 2]):
        r = float(radio(z))
        assert abs(s.area_mm2 - np.pi * r * r) / (np.pi * r * r) < 0.03, (z, s.area_mm2)
        assert abs(s.d_min_mm - 2 * r) < 0.08 and abs(s.d_max_mm - 2 * r) < 0.08
        assert s.excentricidad < 0.05
    res = pb.resumen
    assert abs(res.mla_arc_mm - (22.0 - 5.0)) <= 0.5
    assert abs(res.mla_mm2 - np.pi) / np.pi < 0.03
    # Referencias: lo más ancho a ≤ 10 mm a cada lado, casi 1,5 mm de radio.
    assert res.ref_prox_mm2 > 0.95 * np.pi * 1.5 ** 2 and res.ref_dist_mm2 > 0.95 * np.pi * 1.5 ** 2
    assert abs(res.estenosis_area_pct - (1 - 1 / 2.25) * 100) < 4


def test_la_imagen_de_la_seccion_tiene_la_luz_en_el_centro():
    pts, radios, arco = _linea()
    pb = calcular_pullback(pts, radios, arco, _tubo(), _volumen(), (ESP, ESP, ESP))
    n, S, _ = pb.pila.shape
    assert pb.pila.dtype == np.uint8 and S == 128 and n == len(pts)
    centro, esquina = pb.pila[:, S // 2, S // 2], pb.pila[:, 2, 2]
    assert centro.min() > 200 and esquina.max() < 30
    # El campo abarca unos tres diámetros.
    assert 9.0 <= pb.fov_mm <= 24.0


def test_mide_el_lazo_que_rodea_la_linea_aunque_haya_al_lado_uno_mayor():
    vecino = _tubo(cx=EJE[0] + 5.0, r=2.4)
    pts, radios, arco = _linea()
    pb = calcular_pullback(pts, radios, arco, _union(_tubo(), vecino), _volumen(), (ESP, ESP, ESP))
    s = pb.secciones[0]
    assert abs(s.area_mm2 - np.pi * 1.5 ** 2) / (np.pi * 1.5 ** 2) < 0.03
    assert abs(s.centroide[0]) < 0.1 and abs(s.centroide[1]) < 0.1


def test_las_secciones_dentro_de_la_lesion_no_cuentan_para_la_mla():
    pts, radios, arco = _linea()
    saco = vtk.vtkSphereSource(); saco.SetCenter(EJE[0], EJE[1], 39.0); saco.SetRadius(2.0)
    saco.SetThetaResolution(32); saco.SetPhiResolution(32); saco.Update()
    pb = calcular_pullback(pts, radios, arco, _tubo(), _volumen(), (ESP, ESP, ESP), saco.GetOutput())
    dentro = [s for s, z in zip(pb.secciones, pts[:, 2]) if abs(z - 39.0) < 1.9]
    assert dentro and all(s.en_lesion for s in dentro)
    assert not any(s.en_lesion for s, z in zip(pb.secciones, pts[:, 2]) if z < 36.0)
    assert not pb.secciones[pb.resumen.mla_indice].en_lesion


# ── Referencias y ramas (reglas puras) ─────────────────────────────────── #

def _secs(areas, paso=0.5):
    return [Seccion(arc_mm=i * paso, valida=True, area_mm2=a, d_min_mm=1, d_max_mm=1, excentricidad=0.0)
            for i, a in enumerate(areas)]


def test_una_rama_que_se_une_no_es_referencia_ni_se_cruza():
    # 4 mm² hasta el estrechamiento (2 mm²), una rama a los 3 mm de él y
    # después un tronco más ancho (9 mm²), como una confluencia.
    areas = [4.0] * 20 + [3.0, 2.0, 3.0, 4.0, 4.0, 4.0, 15.0, 16.0] + [9.0] * 20
    secs = _secs(areas)
    marcar_ramas(secs)
    assert secs[26].en_rama and secs[27].en_rama
    r = resumir(secs)
    assert r.mla_indice == 21 and r.mla_mm2 == 2.0
    assert r.ref_prox_mm2 == 4.0 and r.ref_dist_mm2 == 4.0      # no 9 ni 16: no cruza la rama
    assert abs(r.estenosis_area_pct - 50.0) < 1e-6


def test_sin_secciones_suficientes_no_hay_resumen():
    assert resumir(_secs([3.0, 3.0])) is None


# ── API ────────────────────────────────────────────────────────────────── #

def _sesion(con_linea=True) -> str:
    sid = create_session()
    m = session_subdir(sid, "meshes")
    write_vtp(_tubo(), m / "vessel_tree.vtp")
    vol = _volumen()
    np.save(m / "_volume.npy", vol)
    (m / "_volume_meta.json").write_text(json.dumps({
        "shape": list(vol.shape), "spacing": [ESP, ESP, ESP], "wc": 200.0, "ww": 400.0, "modality": "CT",
        "direction": None, "orientation_known": False, "orientation_checked": True, "origin_mm": [0.0, 0.0, 0.0],
        "intensity_range": [0.0, 400.0], "full_stride": 1, "volume_id": "sintetico",
    }))
    if con_linea:
        pts, radios, _ = _linea()
        np.savez(m / "centerline_points.npz", points=pts, radii=radios, ends_in_lesion=False)
    return sid


def test_api_calcula_el_pullback_y_lo_reutiliza():
    sid = _sesion()
    r = client.post(f"/api/centerline/{sid}/ivus")
    assert r.status_code == 200, r.text
    d = r.json()
    n, S = d["n_sections"], d["size_px"]
    assert n == len(_linea()[0]) and S == 128 and len(d["sections"]) == n
    assert d["summary"]["area_stenosis_pct"] > 45
    s0 = d["sections"][0]
    assert s0["valid"] and len(s0["contour"]) == 72 and s0["area_mm2"] > 6.5
    pila = session_subdir(sid, "meshes") / "ivus_pullback.u8"
    assert pila.stat().st_size == n * S * S
    assert d["stack_url"].startswith(f"/data/sessions/{sid}/meshes/ivus_pullback.u8?v=")
    antes = pila.stat().st_mtime_ns
    assert client.post(f"/api/centerline/{sid}/ivus").json()["stack_url"] == d["stack_url"]
    assert pila.stat().st_mtime_ns == antes                      # de la caché, sin recalcular


def test_api_sin_linea_central_409_y_borrar_la_linea_borra_el_pullback():
    assert client.post(f"/api/centerline/{_sesion(con_linea=False)}/ivus").status_code == 409
    sid = _sesion()
    assert client.post(f"/api/centerline/{sid}/ivus").status_code == 200
    r = client.delete(f"/api/centerline/{sid}")
    assert "ivus_pullback.u8" in r.json()["removed"]
    assert not (session_subdir(sid, "meshes") / "ivus_pullback.json").exists()


def test_api_sin_usuario_401():
    sid = _sesion()
    assert anonymous_client(app).post(f"/api/centerline/{sid}/ivus").status_code == 401
