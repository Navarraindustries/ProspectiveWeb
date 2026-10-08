"""Cuatro servicios que ningún test importaba (auditoría del 2026-10-08).

`centerline`, `cross_section`, `dicom_sr` y `mesh_exporter` solo se ejercían a
través de los routers, y solo cuando un test de más arriba llegaba hasta ellos.
Aquí se comprueban sobre geometría sintética con respuesta conocida: un tubo
de radio r tiene sección π·r² y una línea central de longitud conocida.
"""
from __future__ import annotations

import math

import numpy as np
import pytest
import vtk

from services.centerline import extract_centerline
from services.cross_section import compute_cross_sections
from services.dicom_sr import DicomSRGenerator
from services.mesh_exporter import apply_scale, export_stl, merge_poly_datas

RADIO = 2.0


def _tubo(largo: float = 30.0, radio: float = RADIO) -> vtk.vtkPolyData:
    """Tubo cerrado de radio `radio` a lo largo del eje x, de 0 a `largo`."""
    line = vtk.vtkLineSource()
    line.SetPoint1(0.0, 0.0, 0.0); line.SetPoint2(largo, 0.0, 0.0)
    line.SetResolution(60)
    tube = vtk.vtkTubeFilter()
    tube.SetInputConnection(line.GetOutputPort())
    tube.SetRadius(radio); tube.SetNumberOfSides(48); tube.CappingOn()
    tri = vtk.vtkTriangleFilter()
    tri.SetInputConnection(tube.GetOutputPort()); tri.Update()
    return tri.GetOutput()


def _esfera(radio: float = 5.0) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(radio); s.SetThetaResolution(24); s.SetPhiResolution(24); s.Update()
    return s.GetOutput()


# ── mesh_exporter ──────────────────────────────────────────────────────────── #

class TestExportarMallas:
    @pytest.mark.parametrize("binary", [True, False])
    def test_el_stl_escrito_se_lee_con_los_mismos_triangulos(self, tmp_path, binary):
        esfera = _esfera()
        p = export_stl(esfera, tmp_path / "esfera.cualquiera", binary=binary)
        assert p.suffix == ".stl" and p.exists()
        reader = vtk.vtkSTLReader(); reader.SetFileName(str(p)); reader.Update()
        assert reader.GetOutput().GetNumberOfPolys() == esfera.GetNumberOfPolys()

    def test_unir_dos_mallas_suma_sus_puntos_y_salta_las_vacias(self):
        a, b = _esfera(1.0), _esfera(2.0)
        unida = merge_poly_datas([a, None, vtk.vtkPolyData(), b])
        assert unida.GetNumberOfPoints() == a.GetNumberOfPoints() + b.GetNumberOfPoints()

    def test_escalar_multiplica_las_dimensiones(self):
        esfera = _esfera(5.0)
        doble = apply_scale(esfera, 2.0)
        assert doble is not esfera
        assert doble.GetBounds()[1] == pytest.approx(10.0, abs=0.05)
        # Escala 1: no se copia nada.
        assert apply_scale(esfera, 1.0) is esfera


# ── cross_section ──────────────────────────────────────────────────────────── #

class TestSeccionesTransversales:
    def test_un_tubo_uniforme_mide_su_diametro_y_no_tiene_estenosis(self):
        tubo = _tubo()
        linea = np.array([[x, 0.0, 0.0] for x in np.linspace(4.0, 26.0, 12)])
        r = compute_cross_sections(linea, tubo, n_samples=10)
        assert len(r.areas_mm2) == len(r.diameters_mm) == 10
        assert r.mean_diameter_mm == pytest.approx(2 * RADIO, rel=0.03)
        assert r.mean_area_mm2 == pytest.approx(math.pi * RADIO**2, rel=0.05)
        assert r.stenosis_ratio == pytest.approx(1.0, abs=0.03)

    def test_hace_falta_una_linea_con_al_menos_dos_puntos(self):
        with pytest.raises(ValueError):
            compute_cross_sections(np.zeros((1, 3)), _tubo())


# ── centerline ─────────────────────────────────────────────────────────────── #

class TestLineaCentral:
    def test_en_un_tubo_recto_la_linea_es_recta_y_mide_su_radio(self):
        tubo = _tubo()
        r = extract_centerline(tubo, (3.0, 0.0, 0.0), (27.0, 0.0, 0.0), voxel_size_mm=0.5)
        assert r.points.shape[1] == 3 and len(r.points) == len(r.radii) >= 2
        assert r.chord_length_mm == pytest.approx(24.0, abs=1.5)
        assert r.tortuosity == pytest.approx(1.0, abs=0.05)
        assert r.mean_radius_mm == pytest.approx(RADIO, abs=0.5)
        # La línea no se sale del tubo.
        assert np.all(np.abs(r.points[:, 1:]) < RADIO)
        # El poly_data es el tubo para dibujar, no la polilínea: tiene más puntos.
        assert r.poly_data is not None and r.poly_data.GetNumberOfPoints() >= len(r.points)


# ── dicom_sr ───────────────────────────────────────────────────────────────── #

class TestInformeEstructuradoDicom:
    _SR_COMPREHENSIVE = "1.2.840.10008.5.1.4.1.1.88.33"

    def _generar(self, tmp_path, **kw):
        gen = DicomSRGenerator(
            series_meta={"patient_name": "PRUEBA^SR", "patient_id": "SR-1",
                         "study_description": "CTA cerebral"},
            morphometrics={"neck_diameter_mm": 3.2, "max_diameter_mm": 7.5,
                           "dome_to_neck_ratio": 2.1, "volume_mm3": 0.0},
            risk_label="Alto",
            **kw,
        )
        return gen.generate(tmp_path / "informe.sr")

    def test_es_un_comprehensive_sr_con_el_paciente_y_las_medidas(self, tmp_path):
        import pydicom
        p = self._generar(tmp_path)
        assert p.suffix == ".dcm"
        ds = pydicom.dcmread(str(p))
        assert ds.SOPClassUID == self._SR_COMPREHENSIVE
        assert ds.Modality == "SR"
        assert str(ds.PatientName) == "PRUEBA^SR" and ds.PatientID == "SR-1"

        nums = [it for it in _hojas(ds) if it.ValueType == "NUM"]
        valores = {float(it.MeasuredValueSequence[0].NumericValue) for it in nums}
        assert {3.2, 7.5, 2.1} <= valores
        assert 0.0 not in valores, "una medida a cero no se informa"
        codigos = [it for it in _hojas(ds) if it.ValueType == "CODE"]
        assert any(c.ConceptCodeSequence[0].CodeMeaning == "High risk" for c in codigos)

    def test_los_dispositivos_planificados_entran_en_el_informe(self, tmp_path):
        import pydicom
        p = self._generar(tmp_path, clips=[{"name": "NAVARRO T1 7mm", "is_custom": False,
                                            "position_mm": [1.0, 2.0, 3.0]}])
        textos = [str(it.TextValue) for it in _hojas(pydicom.dcmread(str(p))) if it.ValueType == "TEXT"]
        assert any("NAVARRO T1 7mm" in t for t in textos)


def _hojas(ds):
    """Todos los items del árbol de contenido, a cualquier profundidad."""
    out = []
    for it in getattr(ds, "ContentSequence", []):
        out.append(it)
        out.extend(_hojas(it))
    return out
