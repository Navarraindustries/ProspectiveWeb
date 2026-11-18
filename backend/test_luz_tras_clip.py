"""P1 (18-11): cuánta luz queda en la arteria madre y en las ramas con el clip cerrado.

Geometría conocida: la arteria madre es un tubo recto a lo largo de x (radio
1,5 mm, eje en y = z = 10) y el clip se pone encima, con la normal de la hoja
en +z y las hojas a lo largo de x. Si su canto inferior corta el tubo a una
altura h por debajo de la parte de arriba, la luz perdida es el segmento
circular de esa altura: se puede comparar con la fórmula.
"""
from __future__ import annotations

import math

import numpy as np
from fastapi.testclient import TestClient

from main import app
from services.branch_origins import BranchOrigin, BranchScan, freeze_scan
from services.database import Base, engine
from services.devices import make_clip_shaped
from services.device_state import save_clips
from services.luz_tras_clip import (LuzTrasClip, luz_de_la_madre, luz_de_las_ramas, mordaza_de,
                                    resumir)
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state
from test_ivus_virtual import _tubo

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

R = 1.5
EJE_Y = EJE_Z = 10.0
ALTO_HOJA = 1.4                      # make_clip_shaped: canto inferior a −0,7 mm


def _madre():
    """El tubo de test_ivus_virtual va a lo largo de z: se gira para que vaya a lo largo de x."""
    import vtk
    t = vtk.vtkTransform()
    t.Translate(0.0, EJE_Y, EJE_Z)
    t.RotateY(90.0)
    t.Translate(-10.0, -10.0, 0.0)
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputData(_tubo(r=R, z0=0.0, z1=40.0))
    f.SetTransform(t)
    f.Update()
    return f.GetOutput()


def _linea():
    x = np.arange(4.0, 36.0 + 1e-9, 0.5)
    pts = np.stack([x, np.full_like(x, EJE_Y), np.full_like(x, EJE_Z)], 1)
    return pts, x - x[0]


def _segmento(h: float) -> float:
    """Área del segmento circular de altura h en un círculo de radio R."""
    h = min(max(h, 0.0), 2 * R)
    return R * R * math.acos((R - h) / R) - (R - h) * math.sqrt(2 * R * h - h * h)


def _clip_en(z_clip: float, x: float = 20.0, giro: float = 0.0, cuello: float = 4.0, fen: float = 0.0):
    local = make_clip_shaped(blade_length_mm=8.0, blade_height_mm=ALTO_HOJA)
    return mordaza_de((x, EJE_Y, z_clip), (0.0, 0.0, 1.0), giro, local, cuello, fen)


def test_un_clip_que_corta_el_techo_de_la_madre_pierde_el_segmento_circular():
    vaso = _madre()
    pts, arco = _linea()
    h = 0.6                                           # el canto inferior entra 0,6 mm en la luz
    z_clip = EJE_Z + R - h + ALTO_HOJA / 2.0
    secs = luz_de_la_madre(pts, arco, vaso, [_clip_en(z_clip)])
    peor = min(secs, key=lambda s: s.libre_pct)
    esperado = 100.0 * (1.0 - _segmento(h) / (math.pi * R * R))
    assert abs(peor.libre_pct - esperado) < 2.5, (peor.libre_pct, esperado)
    # Lejos de las hojas (|x − 20| > 4 + medio milímetro) la luz está entera.
    lejos = [s for s in secs if abs(pts[0, 0] + s.arc_mm - 20.0) > 5.0]
    assert lejos and all(s.libre_pct > 99.5 for s in lejos)


def test_un_clip_por_encima_de_la_madre_no_le_quita_nada():
    secs = luz_de_la_madre(*_linea(), _madre(), [_clip_en(EJE_Z + R + 1.0)])
    assert secs and min(s.libre_pct for s in secs) > 99.5


def test_girado_90_grados_las_hojas_cruzan_la_madre_y_la_tocan_en_menos_tramo():
    vaso, (pts, arco) = _madre(), _linea()
    z_clip = EJE_Z + R - 0.6 + ALTO_HOJA / 2.0
    a_lo_largo = luz_de_la_madre(pts, arco, vaso, [_clip_en(z_clip)])
    cruzado = luz_de_la_madre(pts, arco, vaso, [_clip_en(z_clip, giro=90.0)])
    tocadas = lambda secs: sum(s.libre_pct < 99.5 for s in secs)  # noqa: E731
    # A lo largo, las hojas de 8 mm tocan unos 8 mm de madre; cruzadas, solo la apertura (cuello + 1 mm).
    assert tocadas(a_lo_largo) > tocadas(cruzado) > 0


def test_las_secciones_dentro_de_la_lesion_no_cuentan():
    vaso, (pts, arco) = _madre(), _linea()
    lesion = np.ones(len(pts), dtype=bool)
    assert luz_de_la_madre(pts, arco, vaso, [_clip_en(EJE_Z + R)], lesion) == []


def _rama(x, y, z, calibre=1.0, i=0):
    return BranchOrigin(index=i, position=(x, y, z), calibre_mm=calibre, parent_calibre_mm=3.0, n_vertices=10)


def test_una_rama_dentro_de_la_mordaza_pierde_su_origen_y_una_fuera_no():
    m = _clip_en(EJE_Z + R)
    dentro = _rama(20.0, EJE_Y, EJE_Z + R + 1.0, i=1)     # sobre el plano, entre las hojas
    fuera = _rama(20.0, EJE_Y + 4.0, EJE_Z, i=2)           # al lado, fuera de la apertura
    ramas = {r.index: r for r in luz_de_las_ramas([dentro, fuera], [m])}
    assert ramas[1].libre_pct < 5 and ramas[2].libre_pct > 99


def test_la_ventana_de_un_clip_fenestrado_respeta_lo_que_pasa_por_ella():
    # La ventana nace junto a la bisagra (x local = −4): una rama que pasa por ella queda libre.
    sin_ventana = _clip_en(EJE_Z + R, fen=0.0)
    con_ventana = _clip_en(EJE_Z + R, fen=3.0)
    rama = _rama(20.0 - 4.0 + 1.5, EJE_Y, EJE_Z + R, calibre=1.0)
    assert luz_de_las_ramas([rama], [sin_ventana])[0].libre_pct < 20
    assert luz_de_las_ramas([rama], [con_ventana])[0].libre_pct > 80


def test_el_resumen_dice_lo_que_falta_sin_linea_y_la_cifra_con_ella():
    assert "extrae la línea central" in resumir(LuzTrasClip(sin_linea=True))
    vaso, (pts, arco) = _madre(), _linea()
    r = LuzTrasClip(secciones=luz_de_la_madre(pts, arco, vaso, [_clip_en(EJE_Z + R - 0.6 + 0.7)]))
    assert "queda el" in resumir(r) and "%" in resumir(r)


def test_api_la_oclusion_trae_la_luz_de_la_madre_y_de_las_ramas():
    sid = create_session()
    m = session_subdir(sid, "meshes")
    write_vtp(_madre(), m / "vessel_tree.vtp")
    pts, _arco = _linea()
    np.savez(m / "centerline_points.npz", points=pts, radii=np.full(len(pts), R), ends_in_lesion=False)
    write_state(sid, "morpho.neck_mm", "4.0")
    freeze_scan(sid, BranchScan(origins=[_rama(20.0, EJE_Y, EJE_Z + R + 1.0)], calibre_floor_mm=0.8))
    save_clips(sid, [{"index": 0, "clip_id": "x", "name": "Clip", "normal": [0.0, 0.0, 1.0],
                      "position": [20.0, EJE_Y, EJE_Z + R - 0.6 + 0.7], "orientation": [0, 0, 0],
                      "is_custom": False}])
    body = client.get(f"/api/clips/occlusion/{sid}").json()
    assert body["parent_measured"] is True
    assert 60 < body["parent_worst"]["free_pct"] < 99
    assert body["branch_lumen"] and body["branch_lumen"][0]["free_pct"] < 50
    assert abs(body["jaw_aperture_mm"] - 5.0) < 0.01
    assert body["parent_raise_mm"] == 0.75
    assert "Arteria madre" in body["lumen_summary"]


def test_el_informe_dice_la_luz_y_la_olvida_si_el_clip_se_gira():
    from services.device_state import save_clip_evaluation
    from services.report_generator import ReportGenerator, build_report_data_from_session

    sid = create_session()
    clip = {"index": 0, "clip_id": "navarro:t1:0:13.0", "name": "NAVARRO™ T1 Recto 13.0 mm",
            "position": [60.0, 64.0, 67.6], "orientation": [0.0, 0.0, 0.0],
            "normal": [0.0, 0.0, 1.0], "is_custom": False}
    save_clips(sid, [clip])
    save_clip_evaluation(sid, "occlusion", {"outcome": "completa", "summary": "Oclusión completa del saco."})
    save_clip_evaluation(sid, "lumen", {"summary": "Arteria madre: el clip no invade su luz."})

    def textos():
        return " ".join(getattr(f, "text", "") for f in
                        ReportGenerator(build_report_data_from_session(sid))._section_clips())

    assert "Luz tras el clip:" in textos() and "no invade su luz" in textos()
    save_clips(sid, [{**clip, "orientation": [0.0, 0.0, 40.0]}])      # girado sin moverlo
    t = textos()
    assert "Oclusión completa del saco." in t and "Luz tras el clip:" not in t


def test_dice_cuanto_subir_el_clip_para_liberar_la_madre():
    from services.luz_tras_clip import subida_para_liberar
    vaso, (pts, arco) = _madre(), _linea()
    m = [_clip_en(EJE_Z + R - 0.6 + ALTO_HOJA / 2.0)]          # el canto inferior entra 0,6 mm
    secs = luz_de_la_madre(pts, arco, vaso, m)
    # 0,5 mm aún deja un segmento de 0,1 mm (≈1 % de la luz); con 0,75 queda libre.
    assert subida_para_liberar(secs, m) == 0.75
    libre = luz_de_la_madre(pts, arco, vaso, [_clip_en(EJE_Z + R + 1.0)])
    assert subida_para_liberar(libre, [_clip_en(EJE_Z + R + 1.0)]) == 0.0


def test_la_boca_del_aneurisma_no_cuenta_como_arteria():
    # Un clip con su plano de cierre por debajo del techo del tubo: lo que queda por
    # encima del plano, entre las hojas, es «aneurisma» y sale del área de la madre.
    vaso, (pts, arco) = _madre(), _linea()
    secs = luz_de_la_madre(pts, arco, vaso, [_clip_en(EJE_Z + R - 0.5)])
    peor = min(secs, key=lambda s: s.libre_pct)
    assert peor.area_mm2 < math.pi * R * R - _segmento(0.5) + 0.3


def test_la_caida_de_la_hoja_sale_de_la_geometria_real_y_la_da_el_catalogo():
    from routers.clips import _caida_hoja_mm
    # La ficha dice 4,4 mm de alto para los dos, pero el T3 angulado sube al doblarse.
    assert abs(_caida_hoja_mm("navarro:t1:0:7.0") - 1.8) < 0.05
    assert abs(_caida_hoja_mm("navarro:t3:15:7.0") - 1.19) < 0.05
    libreria = {c["id"]: c for c in client.get("/api/clips").json()}
    assert abs(libreria["navarro:t3:15:7.0"]["blade_drop_mm"] - 1.19) < 0.05


def test_con_la_colocacion_nueva_la_oclusion_corta_en_el_plano_del_cuello():
    # Un clip subido exactamente su caída corta el saco en el plano del cuello: el
    # mismo corte que un clip «sin caída» puesto en el cuello.
    from routers.clips import _caida_hoja_mm, _canto_inferior_mm
    caida = _caida_hoja_mm("navarro:t3:15:7.0")
    assert _canto_inferior_mm("cualquiera", {"clip_id": "navarro:t3:15:7.0"}) == caida


def test_con_el_plano_del_cuello_un_clip_con_el_canto_en_el_cuello_deja_la_madre_libre():
    # El cuello medido está en el techo del tubo. Un clip cuyo canto (0,7 mm bajo el
    # centro) queda justo en ese plano no pinza nada: lo que hay entre el cuello y el
    # centro de la mordaza es saco. Bajado hasta centrarlo en el cuello, pinza 0,7 mm.
    vaso, (pts, arco) = _madre(), _linea()
    techo = EJE_Z + R

    def con_cuello(m):
        m.cuello_origen, m.cuello_normal = np.array([20.0, EJE_Y, techo]), np.array([0.0, 0.0, 1.0])
        return m

    arriba = [con_cuello(_clip_en(techo + ALTO_HOJA / 2.0))]
    assert min(s.libre_pct for s in luz_de_la_madre(pts, arco, vaso, arriba)) > 99.5
    centrado = [con_cuello(_clip_en(techo))]
    peor = min(luz_de_la_madre(pts, arco, vaso, centrado), key=lambda s: s.libre_pct)
    esperado = 100.0 * (1.0 - _segmento(ALTO_HOJA / 2.0) / (math.pi * R * R))
    assert abs(peor.libre_pct - esperado) < 2.5, (peor.libre_pct, esperado)
