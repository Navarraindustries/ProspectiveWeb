"""Superficie estanca a partir de una máscara, y decimación acotada."""
from __future__ import annotations

import numpy as np
import vtk

from vtkmodules.util import numpy_support as ns

from services.segmentation import _drop_small_islands, decimate_to, mask_to_surface, surface_quality
from test_vesselness import SP, synthetic_tube


def _tri_soup(points_xyz, tri_indices) -> vtk.vtkPolyData:
    """Un `vtkPolyData` mínimo hecho a mano: unos puntos y unos triángulos,
    sin pasar por marching cubes. Sirve para imitar la basura no cerrada
    (un triángulo suelto, un abanico sin vecinos) que deja vtkQuadricDecimation."""
    poly = vtk.vtkPolyData()
    pts = vtk.vtkPoints()
    pts.SetData(ns.numpy_to_vtk(np.asarray(points_xyz, dtype=np.float64)))
    poly.SetPoints(pts)
    cells = vtk.vtkCellArray()
    for tri in tri_indices:
        cells.InsertNextCell(3, tri)
    poly.SetPolys(cells)
    return poly


class TestEstanca:
    def test_un_tubo_da_una_superficie_sin_bordes_ni_islas(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        poly = mask_to_surface(mask, SP)
        q = surface_quality(poly)
        assert q["boundary_edges"] == 0
        assert q["components"] == 1
        assert q["aspect_ratio_median"] < 1.45
        assert q["n_vertices"] > 100

    def test_el_volumen_encerrado_se_parece_al_de_la_mascara(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        poly = mask_to_surface(mask, SP)
        mp = vtk.vtkMassProperties(); mp.SetInputData(poly); mp.Update()
        esperado = float(mask.sum()) * float(np.prod(SP))
        assert abs(mp.GetVolume() - esperado) / esperado < 0.12

    def test_un_agujero_pequeno_en_la_pared_se_cierra(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        mask[30:33, 24, 26:29] = False          # un pinchazo de ~1 mm en la pared
        poly = mask_to_surface(mask, SP)
        assert surface_quality(poly)["boundary_edges"] == 0

    def test_las_islas_diminutas_desaparecen(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        mask[5, 5, 5] = True                    # una mota de 0,125 mm³
        poly = mask_to_surface(mask, SP)
        assert surface_quality(poly)["components"] == 1

    def test_informa_del_progreso(self):
        mask = synthetic_tube(shape=(32, 32, 32), radius_mm=2.0) > 0
        fases: list[str] = []
        mask_to_surface(mask, SP, on_progress=lambda f, p: fases.append(f))
        assert fases[0] == "superficie" and "decimación" in fases

    def test_el_espaciado_anisotropico_no_mezcla_los_ejes(self):
        """Un radio físico de 2 mm da el mismo diámetro en x/y sin importar la
        resolución de cada eje. Si `_to_vtk_image` intercambiara el eje x con
        el z, el diámetro medido saldría del tamaño del eje largo del tubo
        (~38 mm), no de los ~4 mm que pide el radio."""
        sp = (0.6, 0.3, 0.3)
        mask = synthetic_tube(shape=(64, 48, 48), spacing=sp, radius_mm=2.0) > 0
        poly = mask_to_surface(mask, sp)
        xmin, xmax, ymin, ymax, zmin, zmax = poly.GetBounds()
        esperado_z = (mask.shape[0] - 1) * sp[0]
        esperado_diam = 2 * 2.0
        assert abs((zmax - zmin) - esperado_z) < 1.0
        assert abs((xmax - xmin) - esperado_diam) < 0.5
        assert abs((ymax - ymin) - esperado_diam) < 0.5


class TestSalidasDelVolumen:
    """Un vaso que sale por una cara del volumen dejaba la malla abierta ahí
    (Case 3: 65 aristas de borde). Con la máscara rodeada de un vóxel vacío
    la salida queda tapada, sin depender del relleno de huecos."""

    def test_un_tubo_que_toca_las_dos_caras_z_sale_cerrado(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=3.0) > 0
        assert mask[0].any() and mask[-1].any()
        poly = mask_to_surface(mask, SP, fill_holes_mm=0.0)
        q = surface_quality(poly)
        assert q["boundary_edges"] == 0
        assert q["components"] == 1

    def test_el_relleno_no_desplaza_la_malla(self):
        """Las coordenadas siguen en el marco del volumen: la caja de la malla
        coincide, a menos de un vóxel, con la extensión física de la máscara."""
        sp = (0.6, 0.3, 0.4)
        mask = synthetic_tube(shape=(40, 48, 48), spacing=sp, radius_mm=2.0) > 0
        poly = mask_to_surface(mask, sp)
        xmin, xmax, ymin, ymax, zmin, zmax = poly.GetBounds()
        iz, iy, ix = np.nonzero(mask)
        for lo, hi, idx, s in ((xmin, xmax, ix, sp[2]), (ymin, ymax, iy, sp[1]),
                               (zmin, zmax, iz, sp[0])):
            assert abs(lo - idx.min() * s) < s
            assert abs(hi - idx.max() * s) < s


class TestDecimacionEstanca:
    """La decimación de mask_to_surface no puede abrir la malla: la cuadrática
    lo hacía en Case 3 (0 → 38 aristas de borde y 24 no-variedad)."""

    def test_informa_de_las_aristas_no_variedad(self):
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        q = surface_quality(mask_to_surface(mask, SP))
        assert q["non_manifold_edges"] == 0

    def test_un_arbol_decimado_al_45_sigue_cerrado(self):
        """Dos tubos que se cruzan en T y salen por varias caras: una
        bifurcación es donde la decimación cuadrática colapsaba aristas."""
        a = synthetic_tube(shape=(64, 64, 64), radius_mm=3.0, axis=0) > 0
        b = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0, axis=2) > 0
        poly = mask_to_surface(a | b, SP, decimation=0.45, fill_holes_mm=0.0)
        q = surface_quality(poly)
        assert q["boundary_edges"] == 0
        assert q["non_manifold_edges"] == 0
        assert q["components"] == 1
        assert q["aspect_ratio_median"] < 1.45

    def test_por_defecto_decima_al_45(self):
        import inspect
        assert inspect.signature(mask_to_surface).parameters["decimation"].default == 0.45


class TestIslasFalsas:
    def test_los_restos_sueltos_de_la_decimacion_no_cuentan_como_isla(self):
        """vtkQuadricDecimation no garantiza una salida 2-variedad: puede dejar
        un triángulo suelto, o un abanico de pocos triángulos sin vecinos.
        Ninguno de los dos encierra volumen real, así que ambos deben
        desaparecer aunque su "volumen" con signo (ruido de la fórmula, ver
        _drop_small_islands) caiga por encima de min_island_mm3 por azar."""
        mask = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0) > 0
        poly = mask_to_surface(mask, SP)
        assert surface_quality(poly)["components"] == 1

        triangulo_suelto = _tri_soup(
            [[1000.0, 1000.0, 1000.0], [1001.0, 1000.0, 1000.0], [1000.0, 1001.0, 1000.0]],
            [[0, 1, 2]],
        )
        lejos = np.array([2000.0, 2000.0, 2000.0])
        abanico_de_tres = _tri_soup(
            [lejos, lejos + [1, 0, 0], lejos + [0, 1, 0], lejos + [1, 1, 0], lejos + [0.5, 0.5, 1.0]],
            [[0, 1, 2], [0, 2, 3], [0, 3, 4]],
        )

        append = vtk.vtkAppendPolyData()
        append.AddInputData(poly)
        append.AddInputData(triangulo_suelto)
        append.AddInputData(abanico_de_tres)
        append.Update()
        con_restos = append.GetOutput()
        assert surface_quality(con_restos)["components"] == 3  # el tubo + los 2 restos

        limpia = _drop_small_islands(con_restos, min_mm3=2.0)
        assert surface_quality(limpia)["components"] == 1


class TestDecimacion:
    def test_reduce_hasta_el_tope_y_no_toca_lo_que_ya_cabe(self):
        mask = synthetic_tube(shape=(96, 64, 64), radius_mm=3.0) > 0
        poly = mask_to_surface(mask, SP, decimation=0.0)
        n = poly.GetNumberOfPoints()
        small = decimate_to(poly, max_vertices=n // 3)
        assert small.GetNumberOfPoints() <= n // 3 * 1.05
        assert decimate_to(poly, max_vertices=n + 1) is poly
