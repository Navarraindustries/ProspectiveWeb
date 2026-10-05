"""Cobertura metálica de la trenza (services/braid_coverage.py).

El modelo no se ajusta a nada: sale de dos datos del dispositivo. Lo que se
comprueba es que con ellos reproduce las medidas publicadas que el proyecto ya
citaba, y que sobre un vaso conocido pinta lo que la geometría dice.
"""
from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient
from vtkmodules.util.numpy_support import vtk_to_numpy

from main import app
from services import apposition
from services.braid_coverage import PIPELINE, SCALAR, annotate, coverage_at
from services.endovascular import MCR_OVERSIZED
from services.fd_sizing import MEAN_ELONGATION
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir, write_states
from test_apposition import _RECTO, _linea, _stent, _vaso

client = TestClient(app, raise_server_exceptions=True)


class TestElModelo:
    def test_al_nominal_da_la_cobertura_del_catalogo_y_no_se_alarga(self):
        c, a, e = coverage_at(PIPELINE, 4.0, 4.0)
        assert float(c) == pytest.approx(PIPELINE.nominal_coverage)
        assert float(a) == pytest.approx(PIPELINE.nominal_angle_deg) and float(e) == pytest.approx(1.0)

    @pytest.mark.parametrize("nominal", [2.5, 3.0, 3.5, 4.0, 4.5, 5.0])
    def test_reproduce_la_cobertura_medida_con_un_milimetro_de_sobredimensionado(self, nominal):
        desajuste, medido = MCR_OVERSIZED          # (1.0 mm, 25.5 %), Sci Rep 2024
        c, _, _ = coverage_at(PIPELINE, nominal, nominal - desajuste)
        assert float(c) * 100 == pytest.approx(medido, abs=2.0)

    def test_el_alargamiento_medio_publicado_cae_donde_se_suele_sobredimensionar(self):
        # AneuGuide: desplegado, un 32,6 % más largo de media. Con el
        # sobredimensionado habitual (0,25 mm) el modelo da eso, no el doble.
        e = [float(coverage_at(PIPELINE, d, d - 0.25)[2]) for d in (3.0, 3.5, 4.0, 4.5)]
        assert min(e) - 1 < MEAN_ELONGATION < max(e) - 1 + 0.1

    def test_dentro_del_microcateter_mide_dos_veces_y_media(self):
        assert float(coverage_at(PIPELINE, 4.0, 0.69)[2]) == pytest.approx(2.5, abs=0.05)

    def test_el_poro_es_maximo_con_los_hilos_a_45_grados(self):
        D = np.linspace(1.5, 4.0, 200)
        c, a, _ = coverage_at(PIPELINE, 4.0, D)
        assert a[np.argmin(c)] == pytest.approx(45.0, abs=1.0)

    def test_por_encima_del_nominal_no_se_abre_mas(self):
        assert float(coverage_at(PIPELINE, 4.0, 5.0)[0]) == pytest.approx(PIPELINE.nominal_coverage)


def _cubierto(diametro, radio_vaso, **kw):
    linea = _linea()
    st = _stent(diametro, linea)
    apposition.annotate(st.stent_poly_data, _vaso(radio_vaso, **{k: v for k, v in kw.items() if k == "saco"}),
                        st.centerline_segment, voxel_mm=0.1,
                        **{k: v for k, v in kw.items() if k != "saco"})
    return st, annotate(st.stent_poly_data, st.centerline_segment, diametro)


class TestSobreUnVaso:
    def test_vaso_un_milimetro_mas_estrecho_que_el_dispositivo(self):
        # Vaso de 4,0 mm, dispositivo de 5,0: la medida publicada.
        st, c = _cubierto(5.0, _RECTO)
        assert c.min_local_diameter_mm == pytest.approx(4.0, abs=0.15)
        assert c.min_coverage_pct == pytest.approx(MCR_OVERSIZED[1], abs=3)
        assert c.labelled_length_mm < c.deployed_length_mm * 0.7      # se alarga: hace falta menos etiqueta
        delta = vtk_to_numpy(st.stent_poly_data.GetPointData().GetArray(SCALAR))
        assert np.median(delta) < -5                                   # poros más abiertos que el catálogo

    def test_dispositivo_a_su_medida_queda_como_el_catalogo(self):
        _, c = _cubierto(4.0, _RECTO)
        assert c.min_coverage_pct == pytest.approx(32, abs=2) and c.max_coverage_pct == pytest.approx(33, abs=2)
        assert c.labelled_length_mm == pytest.approx(c.deployed_length_mm, rel=0.08)

    def test_un_estrechamiento_local_abre_los_poros_solo_ahi(self):
        radio = lambda z: 2.0 - 0.5 * np.clip(1.0 - np.abs(z - 20.0) / 4.0, 0.0, None)   # noqa: E731
        st, c = _cubierto(4.0, radio)
        P = vtk_to_numpy(st.stent_poly_data.GetPoints().GetData())
        delta = vtk_to_numpy(st.stent_poly_data.GetPointData().GetArray(SCALAR))
        assert np.median(delta[np.abs(P[:, 2] - 20.0) < 1.0]) < -5
        assert abs(np.median(delta[np.abs(P[:, 2] - 20.0) > 8.0])) < 2.5
        assert any("los poros se abren" in n for n in c.notes)

    def test_la_cobertura_del_cuello_solo_se_da_con_cuello(self):
        saco = ((4.5, 0.0, 20.0), 3.5)
        _, sin = _cubierto(4.0, _RECTO, saco=saco)
        _, con = _cubierto(4.0, _RECTO, saco=saco, neck_center=(2.0, 0.0, 20.0), neck_mm=5.0)
        assert sin.neck_coverage_pct is None and any("Sin cuello medido" in n for n in sin.notes)
        assert con.neck_coverage_pct == pytest.approx(32, abs=3)

    def test_fuera_de_las_medidas_de_la_familia_no_se_inventa(self):
        linea = _linea()
        st = _stent(6.0, linea)
        apposition.annotate(st.stent_poly_data, _vaso(lambda z: np.full_like(z, 3.0, dtype=float)),
                            st.centerline_segment, voxel_mm=0.1)
        with pytest.raises(ValueError, match="se fabrica de"):
            annotate(st.stent_poly_data, st.centerline_segment, 6.0)


class TestEnUnaCurva:
    def test_por_fuera_hay_menos_metal_que_por_dentro(self):
        from services.stent_deployment import deploy_stent_on_centerline
        R, radio = 12.0, 2.0                                    # arco de 12 mm de radio en el plano xz
        t = np.linspace(0.2, np.pi - 0.2, 90)
        linea = np.column_stack([R * np.cos(t), np.zeros_like(t), R * np.sin(t)])
        st = deploy_stent_on_centerline(linea, np.full(len(linea), radio), stent_diameter_mm=4.0, braid=False)
        P = vtk_to_numpy(st.stent_poly_data.GetPoints().GetData()).astype(float)
        # Aposición perfecta, puesta a mano: aquí solo se mide el efecto de la curva.
        from vtkmodules.util.numpy_support import numpy_to_vtk
        for nombre, datos in ((apposition.SCALAR, np.zeros(len(P), np.float32)),
                              (apposition.ZONE, np.zeros(len(P), np.uint8))):
            a = numpy_to_vtk(datos, deep=True); a.SetName(nombre)
            st.stent_poly_data.GetPointData().AddArray(a)
        c = annotate(st.stent_poly_data, st.centerline_segment, 4.0)
        delta = vtk_to_numpy(st.stent_poly_data.GetPointData().GetArray(SCALAR))
        dist = np.linalg.norm(P[:, [0, 2]], axis=1)             # al centro de la curva
        medio = np.abs(np.arctan2(P[:, 2], P[:, 0]) - np.pi / 2) < 0.6
        fuera, dentro = medio & (dist > R + 1.5), medio & (dist < R - 1.5)
        assert np.median(delta[fuera]) < -2 < 2 < np.median(delta[dentro])
        assert any("convexidad" in n for n in c.notes)


class TestEndpoint:
    def _sesion(self):
        sid = create_session()
        m = session_subdir(sid, "meshes")
        write_vtp(_vaso(_RECTO), m / "vessel_tree.vtp")
        linea = _linea()
        np.savez(m / "centerline_points.npz", points=linea, radii=np.full(len(linea), 2.0))
        write_states(sid, {"dicom.spacing_x": "0.1"})
        return sid, m

    def test_con_trenza_lleva_el_mapa_y_el_resumen(self):
        sid, m = self._sesion()
        r = client.post(f"/api/cl-stent/{sid}", json={"session_id": sid, "stent_diameter_mm": 5.0,
                                                      "start_arc_mm": 5, "end_arc_mm": 25, "braid": True})
        assert r.status_code == 200, r.text
        c = r.json()["coverage"]
        assert c["device"] == "Pipeline" and c["nominal_coverage_pct"] == 32.5
        assert c["min_coverage_pct"] == pytest.approx(25, abs=3)
        assert c["labelled_length_mm"] < c["deployed_length_mm"]
        assert read_vtp(m / "cl_stent.vtp").GetPointData().GetArray(SCALAR) is not None

    def test_sin_trenza_no_es_un_desviador_y_no_hay_cobertura(self):
        sid, _ = self._sesion()
        r = client.post(f"/api/cl-stent/{sid}", json={"session_id": sid, "stent_diameter_mm": 4.0,
                                                      "start_arc_mm": 5, "end_arc_mm": 25, "braid": False})
        assert r.status_code == 200 and r.json()["coverage"] is None and r.json()["apposition"]
