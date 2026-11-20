"""P13 (curvatura y torsión media del vaso portador) y P14 (fantoma de tubos como
prueba de regresión de la línea central), Dalmer 2026."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_curv_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.spatial import cKDTree

from main import app
from services.centerline import CenterlineExtractor, extract_centerline
from services.curvatura import KAPPA_MIN, geometria_eje, perfil, tramo_portador
from services.database import Base, engine
from services.fantoma_tubos import arco, catalogo, helice, recta
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


# ── P13: medias sobre ejes analíticos ─────────────────────────────────────── #

def test_helice_curvatura_y_torsion():
    a, b = 8.0, 3.0
    g = geometria_eje(helice(a, b, 1.5))
    assert g.curvatura_media == pytest.approx(a / (a * a + b * b), rel=0.05)
    assert g.torsion_media == pytest.approx(b / (a * a + b * b), rel=0.05)
    assert g.fraccion_curva == 1.0


def test_arco_plano_sin_torsion():
    g = geometria_eje(arco(12.0, 180.0))
    assert g.curvatura_media == pytest.approx(1 / 12.0, rel=0.05)
    assert g.radio_curvatura_mm == pytest.approx(12.0, rel=0.05)
    assert g.torsion_media < 0.005


def test_recta_sin_curvatura_ni_torsion():
    g = geometria_eje(recta(30.0))
    assert g.curvatura_media < 1e-6
    assert g.torsion_media is None          # casi recta: el plano de la curva no existe
    assert g.radio_curvatura_mm is None


def test_la_media_resiste_el_ruido_y_el_maximo_no():
    """La razón de dar la media (Dalmer: máximo de 99 /mm frente a 0,36 de media)."""
    a, b = 8.0, 3.0
    h = helice(a, b, 1.5)[::10]
    rng = np.random.default_rng(7)
    ruidosa = h + rng.normal(0.0, 0.05, h.shape)
    g = geometria_eje(ruidosa)
    k_teor = a / (a * a + b * b)
    assert g.curvatura_media == pytest.approx(k_teor, rel=0.1)
    # Con poco suavizado, el máximo lo pone un punto ruidoso; la media apenas se mueve.
    _, kappa, _ = perfil(ruidosa, sigma_mm=0.5)
    assert kappa.max() > 2 * k_teor
    assert kappa.mean() < 1.5 * k_teor


def test_extremos_recortados_y_tramo_corto():
    s, _, _ = perfil(recta(30.0))
    assert s[-1] == pytest.approx(30.0 - 2 * 2 * 2.0, abs=0.5)   # 2 sigmas de 2 mm por lado
    assert geometria_eje(recta(10.0)) is None                     # quedan menos de 5 mm
    assert geometria_eje(np.zeros((0, 3))) is None
    assert geometria_eje(np.zeros((2, 3))) is None


def test_no_depende_del_muestreo_de_entrada():
    h = helice(8.0, 3.0, 1.5)
    g1, g2 = geometria_eje(h), geometria_eje(h[::13])
    assert g1.curvatura_media == pytest.approx(g2.curvatura_media, rel=0.01)
    assert g1.torsion_media == pytest.approx(g2.torsion_media, rel=0.02)


# ── P13: el tramo del vaso portador ───────────────────────────────────────── #

def _esfera(centro, radio, n=400):
    rng = np.random.default_rng(3)
    v = rng.normal(size=(n, 3))
    return np.asarray(centro) + radio * v / np.linalg.norm(v, axis=1, keepdims=True)


def test_tramo_portador_corta_donde_la_esfera_toca_la_lesion():
    pts = recta(30.0)[::10]                      # 0,5 mm entre puntos, x de 0 a 30
    radios = np.full(len(pts), 1.5)
    saco = _esfera((30.0, 0.0, 0.0), 4.0)        # la línea acaba en el centro del saco
    n = tramo_portador(pts, radios, saco)
    # El primero que toca: distancia a la superficie ≤ 1,5 + 0,5 → x ≈ 30 − 4 − 2.
    assert pts[n, 0] == pytest.approx(24.0, abs=0.6)
    assert tramo_portador(pts, radios, np.zeros((0, 3))) == len(pts)


def test_las_metricas_dejan_fuera_la_entrada_al_saco():
    """Una recta que al final gira 90° hacia el saco: con el giro la curvatura
    media sube; con el tramo portador, la recta queda sin curvatura."""
    base = recta(30.0)
    giro = np.array([30.0, 0.0, 0.0]) + np.column_stack([0 * base[:120, 0], base[:120, 0], 0 * base[:120, 0]])
    pts = np.vstack([base, giro[1:]])[::10]
    radios = np.full(len(pts), 1.5)
    toda = CenterlineExtractor._compute_metrics(pts, radios)
    n = int(np.searchsorted(pts[:, 0], 25.0))
    portador = CenterlineExtractor._compute_metrics(pts, radios, n)
    assert toda.curvatura_media > 0.02
    assert portador.curvatura_media < 1e-3
    assert portador.n_portador == n
    assert portador.arc_length_mm == pytest.approx(toda.arc_length_mm)   # lo demás, con toda la línea


# ── P14: fantomas de tubos por la extracción de la app ────────────────────── #

_FANTOMAS = catalogo()


@pytest.fixture(scope="module", params=_FANTOMAS, ids=[f.nombre for f in _FANTOMAS])
def extraido(request):
    f = request.param
    k = int(round(3.0 / 0.05))                   # origen y destino a 3 mm de cada punta
    res = extract_centerline(f.malla, tuple(f.eje[k]), tuple(f.eje[-k - 1]))
    return f, res


def test_fantoma_linea_sobre_el_eje(extraido):
    f, res = extraido
    d, _ = cKDTree(f.eje).query(res.points)
    assert np.median(d) < 0.06
    assert d.max() < 0.5


def test_fantoma_longitud_y_tortuosidad(extraido):
    f, res = extraido
    _, idx = cKDTree(f.eje).query(res.points[[0, -1]])
    largo = (idx[1] - idx[0]) * 0.05
    cuerda = float(np.linalg.norm(f.eje[idx[1]] - f.eje[idx[0]]))
    assert res.arc_length_mm == pytest.approx(largo, rel=0.01)
    assert res.tortuosity == pytest.approx(largo / cuerda, rel=0.01)


def test_fantoma_diametro_inscrito(extraido):
    """El Ø inscrito sale de la transformada de distancia en vóxeles de 0,8 mm:
    va a saltos de vóxel (Ø 2 mm → 1,6). Tolerancia de medio vóxel."""
    f, res = extraido
    assert res.mean_radius_mm * 2 == pytest.approx(2 * f.radio_mm, abs=0.45)


def test_fantoma_curvatura_y_torsion(extraido):
    f, res = extraido
    if f.curvatura == 0.0:
        assert res.curvatura_media < 0.003
        assert res.torsion_media is None
        return
    assert res.curvatura_media == pytest.approx(f.curvatura, rel=0.06)
    if f.torsion == 0.0:
        assert res.torsion_media < 0.025          # arco plano: lo que pone el ruido de la línea
    else:
        assert res.torsion_media == pytest.approx(abs(f.torsion), rel=0.08)
    assert f.curvatura >= KAPPA_MIN


# ── Respuesta de la API ───────────────────────────────────────────────────── #

def _sesion(pts, radios, **extra) -> str:
    sid = create_session()
    m = session_subdir(sid, "meshes")
    np.savez(m / "centerline_points.npz", points=np.asarray(pts, dtype=np.float32),
             radii=np.asarray(radios, dtype=np.float32), **extra)
    (m / "centerline.vtp").write_bytes(b"")
    return sid


def test_api_da_curvatura_torsion_y_suavizado():
    h = helice(8.0, 3.0, 1.5)[::10]
    sid = _sesion(h, np.full(len(h), 1.5))
    body = client.get(f"/api/centerline/{sid}").json()
    assert body["mean_curvature_per_mm"] == pytest.approx(8 / 73, rel=0.05)
    assert body["mean_curvature_radius_mm"] == pytest.approx(73 / 8, rel=0.05)
    assert body["mean_torsion_per_mm"] == pytest.approx(3 / 73, rel=0.05)
    assert body["curvature_length_mm"] > 60
    assert body["curvature_sigma_mm"] == 2.0


def test_api_linea_vieja_que_entra_en_la_lesion_no_da_curvatura():
    """Sin `n_portador` no se sabe dónde empieza el saco: mejor sin cifra."""
    h = helice(8.0, 3.0, 1.5)[::10]
    sid = _sesion(h, np.full(len(h), 1.5), ends_in_lesion=np.array(True))
    body = client.get(f"/api/centerline/{sid}").json()
    assert body["mean_curvature_per_mm"] is None
    assert body["mean_torsion_per_mm"] is None
    assert body["arc_length_mm"] > 70              # lo demás sigue


def test_api_usa_el_tramo_portador_guardado():
    h = helice(8.0, 3.0, 1.5)[::10]
    n = len(h) // 2
    sid = _sesion(h, np.full(len(h), 1.5), ends_in_lesion=np.array(True), n_portador=np.array(n))
    body = client.get(f"/api/centerline/{sid}").json()
    assert body["mean_curvature_per_mm"] == pytest.approx(8 / 73, rel=0.06)
    largo_portador = float(np.linalg.norm(np.diff(h[:n], axis=0), axis=1).sum())
    assert body["curvature_length_mm"] == pytest.approx(largo_portador - 8.0, abs=0.6)
