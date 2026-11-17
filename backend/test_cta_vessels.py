"""Vasos de angio-TC (services.cta_vessels) sobre un fantasma de cabeza.

El fantasma: aire fuera; cuero cabelludo y cerebro a 40 HU (ruido σ 8); cráneo a
1 000 HU con su cáscara de volumen parcial a 250 HU; una arteria de 1,5 mm de radio a
350 HU con un saco de 3 mm a 330 HU; una rama fina que no llega al umbral fuerte
(140 HU) y que solo se conserva si va conectada; y, dentro de la cabeza, una bolsa de
aire con un tabique a 400 HU (un seno paranasal), que no es vaso.
"""
from __future__ import annotations

import numpy as np
import pytest

from services.cta_vessels import (
    CtaParams, intracranial_cavity, refine_surface, segment_cta,
)

SP = (0.5, 0.5, 0.5)
SHAPE = (110, 136, 136)


def _cabeza(sp=SP, shape=SHAPE):
    rng = np.random.default_rng(7)
    z, y, x = np.indices(shape, dtype=np.float32)
    z, y, x = z * sp[0], y * sp[1], x * sp[2]
    c = np.array(shape) * np.array(sp) / 2.0
    r = ((z - c[0]) / 25.0) ** 2 + ((y - c[1]) / 31.0) ** 2 + ((x - c[2]) / 31.0) ** 2   # piel
    r_in = ((z - c[0]) / 19.0) ** 2 + ((y - c[1]) / 25.0) ** 2 + ((x - c[2]) / 25.0) ** 2  # tabla interna
    r_out = ((z - c[0]) / 22.0) ** 2 + ((y - c[1]) / 28.0) ** 2 + ((x - c[2]) / 28.0) ** 2  # tabla externa
    vol = np.full(shape, -1000.0, dtype=np.float32)
    vol[r <= 1.0] = 40.0
    skull = (r_out <= 1.0) & (r_in > 1.0)
    vol[skull] = 1000.0
    # cáscara de volumen parcial: un vóxel por cada lado del cráneo
    from scipy import ndimage
    shell = ndimage.binary_dilation(skull) & ~skull & (r <= 1.0)
    vol[shell] = 250.0
    brain = r_in <= 0.85
    vol[brain] += rng.normal(0.0, 8.0, size=int(brain.sum())).astype(np.float32)
    # arteria a lo largo de x por el centro, con un saco
    d_art = np.sqrt((z - c[0]) ** 2 + (y - c[1]) ** 2)
    art = (d_art <= 1.5) & brain
    vol[art] = 350.0
    sac_c = (c[0] + 3.5, c[1], c[2] + 6.0)
    sac = ((z - sac_c[0]) ** 2 + (y - sac_c[1]) ** 2 + (x - sac_c[2]) ** 2) <= 3.0 ** 2
    vol[sac] = 330.0
    # rama fina hacia +y desde la arteria, por debajo del umbral fuerte
    d_br = np.sqrt((z - c[0]) ** 2 + (x - (c[2] - 8.0)) ** 2)
    branch = (d_br <= 0.6) & (y > c[1]) & (y < c[1] + 16.0)
    vol[branch] = 140.0
    tip = (int(round(c[0] / sp[0])), int(round((c[1] + 15.0) / sp[1])), int(round((c[2] - 8.0) / sp[2])))
    # bolsa de aire con un tabique a 400 HU, bajo la arteria
    box = (z > c[0] - 16) & (z < c[0] - 8) & (y > c[1] - 12) & (y < c[1] + 2) & (x > c[2] - 12) & (x < c[2] + 4)
    vol[box] = -1000.0
    septum = box & (np.abs(x - (c[2] - 4.0)) <= 1.0)
    vol[septum] = 400.0
    return {"vol": vol, "skull": skull, "sac_c": sac_c, "tip": tip, "septum": septum, "art": art,
            "inside": r <= 1.0}


@pytest.fixture(scope="module")
def fantasma():
    return _cabeza()


@pytest.fixture(scope="module")
def resultado(fantasma):
    return segment_cta(fantasma["vol"], SP, within=fantasma["inside"])


def _idx(p):
    return tuple(int(round(v / s)) for v, s in zip(p, SP))


def test_la_arteria_y_el_saco_estan(fantasma, resultado):
    m = resultado.mask
    assert m[fantasma["art"]].mean() > 0.9
    assert m[_idx(fantasma["sac_c"])]


def test_la_rama_fina_va_unida_al_arbol(fantasma, resultado):
    from scipy import ndimage
    m = resultado.mask
    tip = fantasma["tip"]
    assert m[tip], "la rama fina (140 HU, por debajo del umbral fuerte) se perdió"
    lab, _ = ndimage.label(m)
    art_label = np.bincount(lab[fantasma["art"]]).argmax()
    assert lab[tip] == art_label, "la rama quedó suelta del árbol"


def test_sin_craneo_ni_cascara(fantasma, resultado):
    assert not resultado.mask[fantasma["skull"]].any()
    # nada pegado a la tabla interna con forma de lámina: lo que queda a ≤ 1 vóxel
    # del cráneo es, como mucho, una fracción mínima de la máscara
    from scipy import ndimage
    near = ndimage.binary_dilation(fantasma["skull"], iterations=2)
    assert (resultado.mask & near).sum() < 0.01 * resultado.mask.sum()


def test_el_tabique_rodeado_de_aire_no_es_vaso(fantasma, resultado):
    assert not resultado.mask[fantasma["septum"]].any()


def test_umbral_debil_adaptativo(resultado):
    st = resultado.stats
    p = CtaParams()
    assert p.weak_min_hu <= st["weak_hu"] <= p.weak_max_hu
    assert st["strong_hu"] == 150.0
    assert 30.0 < resultado.background_hu < 50.0


def test_la_cavidad_queda_dentro_del_craneo(fantasma):
    cav, info = intracranial_cavity(fantasma["vol"], SP)
    assert info["applied"]
    # La cavidad se calcula a 1 mm: el bloque del borde puede pisar la tabla interna,
    # pero nunca atraviesa el cráneo hasta el cuero cabelludo.
    from scipy import ndimage
    skull = fantasma["skull"]
    beyond = fantasma["inside"] & ~skull & ~ndimage.binary_fill_holes(skull)
    assert not (cav & beyond).any(), "la cavidad salta el cráneo al cuero cabelludo"
    assert (cav & skull).sum() < 0.15 * skull.sum()
    assert cav[_idx(fantasma["sac_c"])]


def test_sin_cabeza_no_hay_vasos():
    vol = np.full((40, 40, 40), -1000.0, dtype=np.float32)
    r = segment_cta(vol, SP)
    assert not r.mask.any()


def test_el_ajuste_de_borde_no_parte_la_malla(fantasma, resultado):
    from services.segmentation import mask_to_surface, surface_quality
    poly = mask_to_surface(resultado.mask, SP, smooth_iters=40, pass_band=0.05)
    before = surface_quality(poly)["components"]
    ref = refine_surface(poly, fantasma["vol"], SP, resultado.background_hu,
                         low_hu=resultado.stats["weak_hu"], cap_hu=150.0)
    assert surface_quality(ref)["components"] == before
    assert ref.GetNumberOfPoints() == poly.GetNumberOfPoints()


def test_el_hueso_extra_se_quita_como_el_denso(fantasma):
    """Cráneo flojo: si las tablas no llegan a 700 HU, `extra_bone` las marca como
    hueso. Aquí se marca como hueso extra la cáscara de volumen parcial (250 HU)
    junto con una franja interior de 1,5 mm: no puede quedar máscara en ella."""
    from scipy import ndimage
    shell = (fantasma["vol"] > 200) & (fantasma["vol"] < 700)
    extra = ndimage.binary_dilation(shell, iterations=3)
    res = segment_cta(fantasma["vol"], SP, params=CtaParams(), extra_bone=extra)
    assert res.stats["extra_bone_cm3"] > 0
    assert not (res.mask & extra).any()


def test_las_placas_sueltas_junto_al_hueso_se_quitan_y_los_tubos_no():
    """Pieza 1 = la mayor (lejos del hueso), 2 = placa de 20×20×2 mm pegada al hueso,
    3 = tubo de 30 mm × 3 mm también pegado al hueso (una carótida suelta), 4 = placa
    lejos del hueso (no se toca: sin hueso no hay prueba de que no sea vaso)."""
    from services.cta_vessels import _plate_pieces
    sp = (0.5, 0.5, 0.5)
    lab = np.zeros((80, 120, 120), np.int32)
    lab[30:50, 10:110, 55:65] = 1                        # mayor: 10 × 50 × 5 mm
    lab[5:9, 10:50, 10:50] = 2                           # placa: 2 × 20 × 20 mm
    zz, yy, xx = np.ogrid[:80, :120, :120]
    lab[((yy - 100) ** 2 + (xx - 100) ** 2 <= 9) & (zz >= 10) & (zz < 70)] = 3
    lab[70:74, 60:100, 10:50] = 4                        # placa lejos del hueso
    near = np.zeros(lab.shape, bool)
    near[:12] = True                                     # «hueso» por debajo
    near[:, 95:, 95:] = True                             # hueso a lo largo del tubo
    cnt = np.bincount(lab.ravel())
    keep = np.array([False, True, True, True, True])
    assert _plate_pieces(lab, keep, cnt, near, sp, CtaParams()) == [2]
    assert _plate_pieces(lab, keep, cnt, near, sp, CtaParams(plate_bone_frac=2.0)) == []


# ── Por la API: la receta nueva es la de la angio-TC en el método tubular ──────── #

class TestPorLaApi:
    """`POST /api/segment` con método tubular sobre una TC: va por services.cta_vessels."""

    SP1 = (1.0, 1.0, 1.0)
    SHAPE1 = (56, 68, 68)

    @pytest.fixture(scope="class")
    def serie(self):
        from services.sessions import create_session
        from test_volume_chunks import _write_classic_ct_series
        h = _cabeza(self.SP1, self.SHAPE1)
        vals = np.clip(np.round(h["vol"]), -1024, 3000).astype(np.int16)

        def nueva():
            sid = create_session()
            _write_classic_ct_series(sid, nz=vals.shape[0], ny=vals.shape[1], nx=vals.shape[2],
                                     values=vals, pixel_spacing=1.0)
            return sid
        return nueva

    @staticmethod
    def _segment(sid, **over):
        from fastapi.testclient import TestClient
        from main import app
        body = {"session_id": sid, "series_id": "", "lower": 150.0, "upper": 0.0,
                "smoothing": 3, "cleanup": 0, "main_tree_only": False, "method": "tubular"}
        body.update(over)
        return TestClient(app, raise_server_exceptions=True).post("/api/segment", json=body)

    def test_fases_en_orden_y_malla_guardada(self, serie, monkeypatch):
        from services import progress
        from services.sessions import session_subdir
        seen: list[str] = []
        real = progress.update

        def spy(sid_, phase, pct):
            seen.append(phase)
            real(sid_, phase, pct)
        monkeypatch.setattr(progress, "update", spy)
        sid = serie()
        r = self._segment(sid)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["vertices"] > 0 and j["downsample_factor"] == 1
        assert (session_subdir(sid, "meshes") / "vessel_tree.vtp").exists()
        bases = [p.split(" ")[0] for p in seen]
        orden = ["carga", "hueso", "umbral", "junto", "aire", "cavidad", "conexión",
                 "superficie", "suavizado", "decimación", "normales", "islas", "borde", "guardado"]
        vistos = [b for b in bases if b in orden]
        assert vistos[0] == "carga" and vistos[-1] == "guardado"
        idx = [orden.index(b) for b in vistos]
        assert idx == sorted(idx), vistos
        assert {"cavidad", "conexión", "borde"} <= set(vistos)

    def test_sin_vasos_el_error_cierra_el_progreso_y_dice_que_tocar(self, serie):
        from services import progress
        sid = serie()
        r = self._segment(sid, lower=5000.0)
        assert r.status_code == 422, r.text
        assert "No quedó ningún vaso" in r.json()["detail"]
        assert "baja el umbral" in r.json()["detail"]
        p = progress.get(sid)
        assert p["running"] is False and p["ok"] is False and p["message"]

    def test_media_resolucion_deja_la_malla_en_el_mismo_sitio(self, serie):
        from vtkmodules.util import numpy_support as ns
        from services.segmentation import read_vtp
        from services.sessions import session_subdir
        # La arteria va a lo largo de x por (z, y) = centro. En un tramo recto, lejos del
        # saco (x = c + 6) y de la rama (x = c − 8), la media de y y z de los vértices es
        # su eje, a cualquier resolución.
        c = np.array(self.SHAPE1) * np.array(self.SP1) / 2.0
        ejes = {}
        for half in (False, True):
            sid = serie()
            r = self._segment(sid, half_resolution=half)
            assert r.status_code == 200, r.text
            assert r.json()["downsample_factor"] == (2 if half else 1)
            poly = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
            pts = ns.vtk_to_numpy(poly.GetPoints().GetData())
            tramo = pts[(pts[:, 0] > c[2] - 19) & (pts[:, 0] < c[2] - 10.5)
                        & (np.hypot(pts[:, 1] - c[1], pts[:, 2] - c[0]) < 4.0)]
            # A 2 mm el tubo de 3 mm deja pocos vértices en el tramo (10); antes de la
            # regla de placas pasaba de 10 porque contaba restos de la cáscara del cráneo.
            assert len(tramo) >= 6
            ejes[half] = np.array([tramo[:, 1].mean(), tramo[:, 2].mean()])
            assert np.abs(ejes[half] - [c[1], c[0]]).max() < (1.0 if half else 0.5), (half, ejes[half], c)
        # A 2 mm un tubo de 3 mm se discretiza con hasta medio vóxel grueso de sesgo según
        # dónde caiga en la rejilla: aquí solo se comprueba que no se va más de un vóxel
        # grueso (un error de marco lo desplazaría más). El desplazamiento exacto del
        # bloque lo fija test_el_bloque_reducido_vuelve_a_su_centro.
        assert np.abs(ejes[True] - ejes[False]).max() < 2.0, ejes


def test_el_bloque_reducido_vuelve_a_su_centro():
    """Un bloque 2×2×2 en los nativos 10–11 tiene su centro en 10,5·s; reducido por media
    cae en el vóxel 5, que en el marco reducido está en 5·2·s = 10·s: le falta medio bloque."""
    from routers.segment import _downsample_mean, reduced_center_shift
    sp = (0.6, 0.4, 0.5)
    vol = np.zeros((24, 24, 24), dtype=np.float32)
    vol[10:12, 10:12, 10:12] = 100.0
    red, rsp, f = _downsample_mean(vol, sp, 2)
    assert f == 2 and red.shape == (12, 12, 12)
    k = np.unravel_index(int(np.argmax(red)), red.shape)
    assert k == (5, 5, 5) and red[k] == 100.0
    pos_reducida = np.array([k[2] * rsp[2], k[1] * rsp[1], k[0] * rsp[0]])      # (x, y, z)
    centro_real = np.array([10.5 * sp[2], 10.5 * sp[1], 10.5 * sp[0]])
    assert np.allclose(pos_reducida + np.array(reduced_center_shift(sp, 2)), centro_real)
