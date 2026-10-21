"""Mapa de calor del clip: anillo, marco de hojas y clasificación."""
from __future__ import annotations

import numpy as np
import pytest
import vtk
from vtkmodules.util import numpy_support as ns

from services import devices
from services.clip_field import (
    COV_COVERED, COV_NONE, COV_RESIDUAL, COV_UNREACHED, RING_MAX_MM, BladeFrame,
    blade_frame, classify, combine_coverage, field_mesh, vessel_ring,
)

RADIO = 5.0   # saco esférico de 10 mm centrado en (0,0,RADIO): el cuello está en z = 0


def _esfera(r: float, centro=(0.0, 0.0, 0.0), res: int = 48) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetRadius(r); s.SetCenter(*centro)
    s.SetThetaResolution(res); s.SetPhiResolution(res); s.Update()
    return s.GetOutput()


def _saco() -> vtk.vtkPolyData:
    return _esfera(RADIO, (0.0, 0.0, RADIO))


def _tubo(radio: float = 2.0, largo: float = 40.0) -> vtk.vtkPolyData:
    """Vaso padre a lo largo de X, pegado al cuello por debajo (z < 0)."""
    c = vtk.vtkCylinderSource(); c.SetRadius(radio); c.SetHeight(largo); c.SetResolution(48); c.Update()
    t = vtk.vtkTransform(); t.Translate(0.0, 0.0, -radio); t.RotateZ(90.0)   # eje del cilindro (Y) → X
    return devices.apply_transform(c.GetOutput(), t)


def _puntos(poly: vtk.vtkPolyData) -> np.ndarray:
    return ns.vtk_to_numpy(poly.GetPoints().GetData()).astype(float)


def _clip_y_pose(largo_hoja: float, rot_deg: float = 0.0, desplaza=(0.0, 0.0, 0.0),
                 forma: str = "STRAIGHT", **kw) -> tuple[vtk.vtkPolyData, vtk.vtkTransform]:
    """Clip cerrado sobre el cuello (plano z = 0), hojas en el plano, +Z normal, y su pose."""
    local = devices.make_clip_shaped(largo_hoja, 0.5, 1.4, forma, **kw)
    t = devices.pose_transform((desplaza[0], desplaza[1], desplaza[2]), (0.0, 0.0, 1.0), rot_deg)
    return devices.apply_transform(local, t), t


def _clip_en_cuello(largo_hoja: float, rot_deg: float = 0.0, desplaza=(0.0, 0.0, 0.0)):
    """Clip recto colocado: (malla de mundo, pose), lo que `_marco` necesita."""
    return _clip_y_pose(largo_hoja, rot_deg, desplaza)


def _marco(clip: tuple[vtk.vtkPolyData, vtk.vtkTransform], largo_hoja: float,
           neck_mm: float = 6.0) -> BladeFrame:
    world, t = clip
    return blade_frame(world, length_mm=largo_hoja, blade_width_mm=0.5, blade_height_mm=1.4,
                       neck_mm=neck_mm, neck_axis=(0.0, 0.0, 1.0), pose=t)


def _clasifica(points, frame: BladeFrame, neck_mm: float = 6.0) -> np.ndarray:
    """`classify` con el cuello del fantoma: origen (0,0,0), eje +Z, 6 mm."""
    return classify(points, frame, neck_origin=(0.0, 0.0, 0.0), neck_axis=(0.0, 0.0, 1.0), neck_mm=neck_mm)


class TestAnillo:
    def test_el_anillo_queda_cerca_del_cuello_y_del_lado_del_vaso(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        p = _puntos(ring)
        assert len(p) > 50
        assert np.all(np.linalg.norm(p, axis=1) <= 1.5 * 6.0 + 1e-6)
        assert np.all(p[:, 2] <= 1e-6)               # nada del lado del saco

    def test_el_radio_se_acota_en_cuellos_anchos(self):
        ring = vessel_ring(_tubo(largo=80.0), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 12.0)
        p = _puntos(ring)
        assert np.all(np.linalg.norm(p, axis=1) <= RING_MAX_MM + 1e-6)


class TestMarco:
    def test_el_marco_se_lee_de_la_malla_del_clip(self):
        f = _marco(_clip_en_cuello(10.0), 10.0)
        assert abs(abs(f.long_axis[0]) - 1.0) < 1e-6          # hojas a lo largo de X
        assert abs(abs(f.open_axis[1]) - 1.0) < 1e-6          # se abren en Y
        assert f.depth_axis[2] > 0.99                          # profundidad = normal, hacia el domo (+Z)
        assert f.length_mm == 10.0 and abs(f.half_height_mm - 0.7) < 1e-9
        assert abs(f.half_gap_mm - (0.6 + 0.5)) < 1e-9        # jaw/2 + width
        # Las hojas cerradas colapsan todo el ancho del cuello que alcanzan: medio cuello
        # más la holgura, no una fracción menor que dejaría fuera el borde del contorno.
        assert abs(f.close_half_mm - (6.0 / 2 + 0.3)) < 1e-9   # manda medio cuello sobre la ranura

    def test_girar_el_clip_gira_el_marco(self):
        f = _marco(_clip_en_cuello(10.0, rot_deg=90.0), 10.0)
        assert abs(abs(f.long_axis[1]) - 1.0) < 1e-6

    def test_una_pieza_con_bisagra_en_el_centro_da_el_mismo_marco(self):
        # Las piezas NAVARRO™ llevan el cuerpo detrás de la bisagra: el marco debe
        # leer la bisagra donde empieza el pasillo entre hojas, no en el borde de la malla.
        clip, t = _clip_en_cuello(10.0)
        cuerpo = vtk.vtkCubeSource(); cuerpo.SetXLength(8.0); cuerpo.SetYLength(3.0); cuerpo.SetZLength(1.4)
        cuerpo.SetCenter(-5.0 - 4.0, 0.0, 0.0); cuerpo.Update()     # pegado detrás de la bisagra (x = −5)
        con_cuerpo = devices.combine([clip, cuerpo.GetOutput()])
        f = _marco((con_cuerpo, t), 10.0)
        assert abs(f.hinge[0] - (-5.0)) < 0.6
        assert f.long_axis[0] > 0.99                           # apunta a la punta (+X)


class TestClasificacion:
    def _anillo_cuello(self) -> np.ndarray:
        """Puntos del contorno del cuello: círculo de radio 3 en z = 0, más la cúpula."""
        ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
        cuello = np.stack([3.0 * np.cos(ang), 3.0 * np.sin(ang), np.zeros_like(ang)], axis=1)
        cupula = np.array([[0.0, 0.0, 8.0], [1.0, 1.0, 9.0]])
        return np.vstack([cuello, cupula])

    def test_hoja_larga_cubre_todo_el_contorno(self):
        # Hoja de 12 mm centrada sobre un cuello de 6: ≥ cuello + 1 mm → 100 % (spec §5.4).
        cov = _clasifica(self._anillo_cuello(), _marco(_clip_en_cuello(12.0), 12.0))
        assert np.all(cov[:72] == COV_COVERED)
        assert np.all(cov[72:] == COV_NONE)                       # la cúpula sobre la hoja no se evalúa

    def test_hoja_corta_deja_cuello_no_alcanzado_mas_alla_de_la_punta(self):
        # Hoja de 4 mm con la bisagra en x = −3: la punta llega a x = +1.
        cov = _clasifica(self._anillo_cuello(), _marco(_clip_en_cuello(4.0, desplaza=(-1.0, 0.0, 0.0)), 4.0))
        pts = self._anillo_cuello()[:72]
        assert np.all(cov[:72][pts[:, 0] > 1.3] == COV_UNREACHED)
        assert np.all(cov[:72][(pts[:, 0] > -2.7) & (pts[:, 0] < 0.7)] == COV_COVERED)

    def test_lo_que_queda_detras_de_la_bisagra_es_cuello_residual(self):
        # Bisagra en x = −1: el contorno con x < −1,3 queda fuera del alcance de la hoja.
        cov = _clasifica(self._anillo_cuello(), _marco(_clip_en_cuello(4.0, desplaza=(1.0, 0.0, 0.0)), 4.0))
        pts = self._anillo_cuello()[:72]
        assert np.all(cov[:72][pts[:, 0] < -1.3] == COV_RESIDUAL)

    def test_la_cupula_mas_alla_de_la_punta_no_se_evalua(self):
        # Con el cuello pinzado la cúpula queda excluida entera: lo no alcanzado se
        # juzga a la altura del cuello, no sobre el domo.
        cov = _clasifica(np.array([[5.0, 0.0, 4.0], [-1.0, 0.0, 4.0]]), _marco(_clip_en_cuello(4.0, desplaza=(-1.0, 0.0, 0.0)), 4.0))
        assert cov.tolist() == [COV_NONE, COV_NONE]

    def test_lejos_de_la_mordaza_no_se_evalua(self):
        # Pared del vaso en la banda pero a 4 mm de la mordaza (> cuello/2 + 0,3).
        cov = _clasifica(np.array([[0.0, 4.0, 0.0]]), _marco(_clip_en_cuello(12.0), 12.0))
        assert cov.tolist() == [COV_NONE]

    def test_un_clip_lejos_no_cubre_nada(self):
        cov = _clasifica(self._anillo_cuello(), _marco(_clip_en_cuello(12.0, desplaza=(0.0, 0.0, 20.0)), 12.0))
        assert (cov == COV_COVERED).sum() == 0

    def test_el_cuello_al_lado_de_la_mordaza_es_residual(self):
        # Clip desplazado 3 mm a través de la mordaza (+Y): el contorno del lado
        # opuesto queda fuera de las hojas. Es cuello abierto, no «sin evaluar».
        cov = _clasifica(self._anillo_cuello(), _marco(_clip_en_cuello(12.0, desplaza=(0.0, 3.0, 0.0)), 12.0))
        pts = self._anillo_cuello()[:72]
        assert np.all(cov[:72][pts[:, 1] < -0.7] == COV_RESIDUAL)
        assert np.all(cov[:72][pts[:, 1] > 0.0] == COV_COVERED)

    def test_un_clip_centrado_no_deja_halo_residual_en_el_borde_del_cuello(self):
        # La holgura del disco (0,6 mm) es mayor que la de la mordaza (0,3 mm): el
        # borde del disco no debe salir residual con el clip bien puesto.
        ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
        borde = np.stack([3.55 * np.cos(ang), 3.55 * np.sin(ang), np.zeros_like(ang)], axis=1)
        cov = _clasifica(borde, _marco(_clip_en_cuello(12.0), 12.0))
        assert np.all(cov == COV_COVERED)

    def test_combinar_clips_toma_la_mejor_categoria(self):
        a = np.array([COV_NONE, COV_RESIDUAL, COV_UNREACHED, COV_COVERED], dtype=np.uint8)
        b = np.array([COV_UNREACHED, COV_COVERED, COV_NONE, COV_RESIDUAL], dtype=np.uint8)
        assert combine_coverage([a, b]).tolist() == [COV_UNREACHED, COV_COVERED, COV_UNREACHED, COV_COVERED]


class TestMallaDelCampo:
    def test_une_saco_y_anillo_y_sigue_siendo_triangulos(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        m = field_mesh(_saco(), ring)
        assert m.GetNumberOfPoints() >= _saco().GetNumberOfPoints() + 50
        assert m.GetNumberOfPolys() > 0
        ids = vtk.vtkIdList()
        for i in range(0, m.GetNumberOfPolys(), max(1, m.GetNumberOfPolys() // 20)):
            m.GetCellPoints(i, ids); assert ids.GetNumberOfIds() == 3


class TestMarcoDePose:
    def test_una_malla_degenerada_con_pose_da_el_marco_analitico(self):
        # 10 puntos no bastan para leer la mordaza: manda la pose declarada.
        pts = vtk.vtkPoints()
        for i in range(10):
            pts.InsertNextPoint(float(i), 0.0, 0.0)
        degenerada = vtk.vtkPolyData(); degenerada.SetPoints(pts)
        pose = devices.pose_transform((1.0, 2.0, 3.0), (0.0, 0.0, 1.0), 90.0)
        f = blade_frame(degenerada, length_mm=8.0, blade_width_mm=0.5, blade_height_mm=1.4,
                        neck_mm=6.0, neck_axis=(0.0, 0.0, 1.0), pose=pose)
        np.testing.assert_allclose(f.hinge, [1.0, 2.0 - 4.0, 3.0], atol=1e-9)   # (−L/2, 0, 0) girado 90°
        np.testing.assert_allclose(f.long_axis, [0.0, 1.0, 0.0], atol=1e-9)
        np.testing.assert_allclose(np.abs(f.open_axis), [1.0, 0.0, 0.0], atol=1e-9)
        np.testing.assert_allclose(f.depth_axis, [0.0, 0.0, 1.0], atol=1e-9)

    def test_la_pose_es_obligatoria(self):
        # Sin pose el marco se leería en coordenadas de mundo y saldría mal sin avisar.
        world, _ = _clip_en_cuello(10.0)
        with pytest.raises(TypeError):
            blade_frame(world, length_mm=10.0, blade_width_mm=0.5, blade_height_mm=1.4,
                        neck_mm=6.0, neck_axis=(0.0, 0.0, 1.0))

    def test_con_pose_un_clip_lejos_del_origen_da_el_marco_correcto(self):
        # Colocado en el mundo (girado e inclinado y lejos del origen), la malla ya no
        # está alineada con los ejes: el marco se lee en el sistema local de la pose.
        pose = devices.pose_transform((30.0, -12.0, 7.0), (1.0, 1.0, 1.0), 35.0)
        mundo = devices.apply_transform(devices.make_clip_shaped(10.0, 0.5, 1.4, "STRAIGHT"), pose)
        f = blade_frame(mundo, length_mm=10.0, blade_width_mm=0.5, blade_height_mm=1.4,
                        neck_mm=6.0, neck_axis=(1.0, 1.0, 1.0), pose=pose)
        bisagra = np.array(pose.TransformPoint(-5.0, 0.0, 0.0))
        assert np.linalg.norm(f.hinge - bisagra) < 0.6
        assert float(np.dot(f.long_axis, pose.TransformVector(1.0, 0.0, 0.0))) > 0.999
        assert abs(float(np.dot(f.open_axis, pose.TransformVector(0.0, 1.0, 0.0)))) > 0.999
        assert float(np.dot(f.depth_axis, np.array([1.0, 1.0, 1.0]) / np.sqrt(3.0))) > 0.999


class TestClipAcodado:
    @pytest.mark.parametrize("forma, angulo", [("ANGLED", 90.0), ("ANGLED_45", 0.0)])
    def test_un_clip_acodado_abre_en_y_local(self, forma, angulo):
        # jaw_geometry lee la apertura en X en los ANGLED cortos: el marco debe
        # corregirlo con el diseño local (hojas en +X, apertura en +Y).
        world, t = _clip_y_pose(10.0, 30.0, (2.0, 1.0, 0.0), forma, angle_deg=angulo)
        f = _marco((world, t), 10.0)
        assert abs(float(np.dot(f.open_axis, t.TransformVector(0.0, 1.0, 0.0)))) > 0.999
        assert float(np.dot(f.long_axis, t.TransformVector(1.0, 0.0, 0.0))) > 0.999

    def test_la_parte_recta_de_un_acodado_clasifica_como_un_recto(self):
        pose = dict(rot_deg=30.0, desplaza=(2.0, 1.0, 0.0))
        world_a, t = _clip_y_pose(10.0, forma="ANGLED", angle_deg=90.0, **pose)
        acodado = _marco((world_a, t), 10.0)
        recto = _marco(_clip_y_pose(10.0, **pose), 10.0)
        ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
        cuello = np.stack([3.0 * np.cos(ang), 3.0 * np.sin(ang), np.zeros_like(ang)], axis=1)
        # Parte recta: el 45 % proximal de la hoja, x local de −5 a −0,5. Se deja fuera
        # el grosor de la barra de bisagra (x < −4,5): en el recto la bisagra se lee en
        # su cara interior (−4,75) y en el acodado se toma la analítica (−5).
        x_local = (cuello - np.array(t.TransformPoint(0.0, 0.0, 0.0))) @ np.array(t.TransformVector(1.0, 0.0, 0.0))
        recta = (x_local > -4.5) & (x_local < -0.8)
        assert recta.sum() > 10
        a, r = _clasifica(cuello, acodado), _clasifica(cuello, recto)
        assert np.array_equal(a[recta], r[recta])
        assert np.all(a[recta] == COV_COVERED)


from services.clip_field import (  # noqa: E402
    CATEGORY_COLORS, GEOMETRIC_NOTE, PRESSURE_COLORS, clip_load, colorize, contact_area_mm2, neck_disc,
    pressure_verdict, summarize, vertex_loads, worst_load, write_field,
)
from services.clip_selection import force_window  # noqa: E402


def _resumen(mesh, cov, force_g: float = 120.0, neck_mm: float = 6.0):
    """`summarize` de un solo clip con el cuello del fantoma."""
    disco = neck_disc(_puntos(mesh), neck_origin=(0.0, 0.0, 0.0), neck_axis=(0.0, 0.0, 1.0), neck_mm=neck_mm)
    return summarize(mesh, cov, in_neck=disco, loads=[clip_load(mesh, cov, force_g=force_g, neck_mm=neck_mm)],
                     force_is_band_min=True, force_provisional=True, neck_mm=neck_mm)


class TestPresion:
    def _campo(self, largo_hoja: float):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        return mesh, _clasifica(_puntos(mesh), _marco(_clip_en_cuello(largo_hoja), largo_hoja))

    def test_el_area_de_contacto_crece_con_la_hoja(self):
        m1, c1 = self._campo(4.0); m2, c2 = self._campo(12.0)
        assert 0 < contact_area_mm2(m1, c1) < contact_area_mm2(m2, c2)

    def test_la_presion_es_inversa_al_area(self):
        m1, c1 = self._campo(4.0); m2, c2 = self._campo(12.0)
        s1 = _resumen(m1, c1); s2 = _resumen(m2, c2)
        assert s1.pressure_g_mm2 > s2.pressure_g_mm2
        assert abs(s1.pressure_g_mm2 * s1.contact_area_mm2 - 120.0) < 1e-6

    def test_el_veredicto_sigue_a_la_ventana(self):
        w = tuple(x / 10.0 for x in force_window(6.0))      # área 10 mm²
        assert pressure_verdict(w[0] - 0.1, w) == "insuficiente"
        assert pressure_verdict((w[1] + w[2]) / 2, w) == "optima"
        assert pressure_verdict((w[0] + w[1]) / 2, w) == "aceptable"
        assert pressure_verdict((w[2] + w[3]) / 2, w) == "aceptable"
        assert pressure_verdict(w[3] + 0.1, w) == "exceso"
        assert pressure_verdict(0.0, (0.0, 0.0, 0.0, 0.0)) == "sin_contacto"

    def test_sin_contacto_no_divide_por_cero(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        f = _marco(_clip_en_cuello(12.0, desplaza=(0.0, 0.0, 20.0)), 12.0)
        s = _resumen(mesh, _clasifica(_puntos(mesh), f))
        assert s.contact_area_mm2 == 0.0 and s.pressure_g_mm2 == 0.0 and s.pressure_verdict == "sin_contacto"
        assert s.covered_pct == 0.0

    def test_los_porcentajes_suman_cien_sobre_la_banda(self):
        m, c = self._campo(12.0)
        s = _resumen(m, c)
        assert abs(s.covered_pct + s.residual_pct + s.unreached_pct - 100.0) < 1e-6
        assert s.note == GEOMETRIC_NOTE and s.force_provisional is True


class TestPorcentajesDelCuello:
    def _campo(self, desplaza=(0.0, 0.0, 0.0), largo_hoja: float = 12.0):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        return mesh, _clasifica(_puntos(mesh), _marco(_clip_en_cuello(largo_hoja, desplaza=desplaza), largo_hoja))

    def test_la_pared_pinzada_fuera_del_disco_no_cuenta_en_los_porcentajes(self):
        mesh, cov = self._campo()
        disco = neck_disc(_puntos(mesh), neck_origin=(0.0, 0.0, 0.0), neck_axis=(0.0, 0.0, 1.0), neck_mm=6.0)
        # Hay pared del anillo pinzada fuera del disco: se pinta, pero no es cuello.
        assert ((cov == COV_COVERED) & ~disco).any()
        s = _resumen(mesh, cov)
        cuello = (cov != COV_NONE) & disco
        esperado = 100.0 * ((cov == COV_COVERED) & cuello).sum() / cuello.sum()
        assert abs(s.covered_pct - esperado) < 1e-9 and s.neck_evaluated

    def test_un_clip_desplazado_a_traves_de_la_mordaza_no_cubre_el_cuello(self):
        centrado = _resumen(*self._campo())
        fuera = _resumen(*self._campo(desplaza=(0.0, 7.0, 0.0)))
        assert centrado.covered_pct > 95
        assert fuera.covered_pct < 10 and fuera.residual_pct > 90

    def test_sin_cuello_en_la_banda_los_porcentajes_no_se_evaluan(self):
        s = _resumen(*self._campo(desplaza=(0.0, 0.0, 20.0)))
        assert s.neck_evaluated is False
        assert (s.covered_pct, s.residual_pct, s.unreached_pct) == (0.0, 0.0, 0.0)


class TestFuerzaPorClip:
    def _campo(self):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        return mesh, _clasifica(_puntos(mesh), _marco(_clip_en_cuello(12.0), 12.0))

    def test_el_veredicto_es_la_fuerza_frente_a_la_ventana_en_gramos(self):
        mesh, cov = self._campo()
        acc_lo, opt_lo, opt_hi, acc_hi = force_window(6.0)
        assert clip_load(mesh, cov, force_g=(opt_lo + opt_hi) / 2, neck_mm=6.0).verdict == "optima"
        assert clip_load(mesh, cov, force_g=acc_hi + 1.0, neck_mm=6.0).verdict == "exceso"
        assert clip_load(mesh, cov, force_g=acc_lo - 1.0, neck_mm=6.0).verdict == "insuficiente"
        assert clip_load(mesh, cov, force_g=0.0, neck_mm=6.0).verdict == "sin_fuerza"

    def test_dos_clips_optimos_no_suman_exceso(self):
        mesh, cov = self._campo()
        _, opt_lo, opt_hi, _ = force_window(6.0)
        uno = clip_load(mesh, cov, force_g=opt_hi, neck_mm=6.0)
        s = summarize(mesh, cov, in_neck=np.ones(len(cov), dtype=bool), loads=[uno, uno],
                      force_is_band_min=True, force_provisional=True, neck_mm=6.0)
        assert s.pressure_verdict == "optima" and s.force_g == opt_hi
        assert s.force_window_g == tuple(float(w) for w in force_window(6.0))

    def test_manda_el_peor_clip_y_un_importado_no_tapa_a_uno_con_ficha(self):
        mesh, cov = self._campo()
        acc_lo, opt_lo, opt_hi, acc_hi = force_window(6.0)
        bien = clip_load(mesh, cov, force_g=opt_hi, neck_mm=6.0)
        mal = clip_load(mesh, cov, force_g=acc_hi + 10.0, neck_mm=6.0)
        sin = clip_load(mesh, cov, force_g=0.0, neck_mm=6.0)
        assert worst_load([bien, mal]) == 1
        assert worst_load([sin, bien]) == 1
        assert worst_load([sin, sin]) == 0

    def test_cada_vertice_lleva_el_veredicto_del_peor_clip_que_lo_cubre(self):
        mesh, cov = self._campo()
        _, _, opt_hi, acc_hi = force_window(6.0)
        solo_a = np.where(np.arange(len(cov)) % 2 == 0, cov, COV_NONE).astype(np.uint8)
        a = clip_load(mesh, cov, force_g=opt_hi, neck_mm=6.0)
        b = clip_load(mesh, solo_a, force_g=acc_hi + 10.0, neck_mm=6.0)
        verd, pres = vertex_loads([cov, solo_a], [a, b])
        cub = cov == COV_COVERED
        assert np.all(verd[cub & (solo_a == COV_COVERED)] == "exceso")
        assert np.all(verd[cub & (solo_a != COV_COVERED)] == "optima")
        assert np.all(pres[~cub] == 0.0)
        rgb = colorize(cov, verd)
        assert tuple(rgb[np.flatnonzero(cub & (solo_a == COV_COVERED))[0]]) == PRESSURE_COLORS["exceso"]


class TestColores:
    def test_cada_categoria_tiene_su_color_y_el_cubierto_el_de_la_presion(self):
        cov = np.array([COV_NONE, COV_COVERED, COV_RESIDUAL, COV_UNREACHED], dtype=np.uint8)
        rgb = colorize(cov, "optima")
        assert rgb.shape == (4, 3) and rgb.dtype == np.uint8
        assert tuple(rgb[0]) == CATEGORY_COLORS[COV_NONE]
        assert tuple(rgb[1]) == PRESSURE_COLORS["optima"]
        assert tuple(rgb[2]) == CATEGORY_COLORS[COV_RESIDUAL]
        assert tuple(rgb[3]) == CATEGORY_COLORS[COV_UNREACHED]

    def test_el_vtp_lleva_los_tres_arrays_y_los_colores_activos(self, tmp_path):
        ring = vessel_ring(_tubo(), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 6.0)
        mesh = field_mesh(_saco(), ring)
        cov = _clasifica(_puntos(mesh), _marco(_clip_en_cuello(12.0), 12.0))
        write_field(mesh, cov, 14.3, colorize(cov, "optima"), tmp_path / "clip_field.vtp")
        from services.segmentation import read_vtp
        back = read_vtp(tmp_path / "clip_field.vtp")
        pd = back.GetPointData()
        assert pd.GetArray("coverage").GetNumberOfTuples() == back.GetNumberOfPoints()
        assert pd.GetArray("pressure_g_mm2").GetNumberOfComponents() == 1
        assert pd.GetArray("colors").GetNumberOfComponents() == 3
        assert pd.GetScalars().GetName() == "colors"
