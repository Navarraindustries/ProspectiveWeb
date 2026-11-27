"""El aviso de «vaso padre» solo cuando el saco sigue creciendo, no cuando la
esfera que lo acota corta su propia pared (Case 3, 27-11: saco de 9 mm con el
ápice fuera del eje; el aviso salía por mucho que se volviera a marcar el cuello).
"""
import vtk

from routers.detect import _ampliar_si_toca, _toca_la_esfera


def _bola(radio: float, centro=(0.0, 0.0, 0.0)) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(radio)
    s.SetCenter(*centro)
    s.SetThetaResolution(24)
    s.SetPhiResolution(24)
    s.Update()
    return s.GetOutput()


SEMILLA = (0.0, 0.0, 0.0)


class TestAmpliarSiToca:
    def test_un_saco_que_no_llega_al_borde_no_se_vuelve_a_aislar(self):
        llamadas = []
        saco = _bola(3.0)
        out = _ampliar_si_toca(lambda b, c: llamadas.append(b), (saco, 4.0), SEMILLA, 7.6, 12.0)
        assert out == (saco, 4.0, False)
        assert llamadas == []

    def test_un_saco_que_se_cierra_solo_con_la_esfera_mayor_no_avisa(self):
        # Recortado por la esfera de 7,6 mm; con una mayor se cierra a 8,8.
        recortado, entero = _bola(7.6), _bola(8.8)
        saco, cuello, toca = _ampliar_si_toca(lambda b, c: (entero, 5.6), (recortado, 5.4),
                                              SEMILLA, 7.6, 12.0)
        assert toca is False
        assert saco is entero and cuello == 5.6

    def test_si_sigue_creciendo_hasta_la_esfera_mayor_avisa(self):
        # La arteria no se cierra: con la esfera mayor llega otra vez al borde.
        recortado = _bola(7.6)
        saco, cuello, toca = _ampliar_si_toca(lambda b, c: (_bola(b), 9.0), (recortado, 5.4),
                                              SEMILLA, 7.6, 12.0)
        assert toca is True
        assert saco is recortado and cuello == 5.4

    def test_si_el_segundo_intento_falla_se_queda_el_primero_y_avisa(self):
        def falla(b, c):
            raise ValueError("sin saco")
        recortado = _bola(7.6)
        assert _ampliar_si_toca(falla, (recortado, 5.4), SEMILLA, 7.6, 12.0) == (recortado, 5.4, True)

    def test_la_caja_del_volumen_crece_con_la_esfera(self):
        pedido = {}
        def aislar(b, c):
            pedido.update(b=b, c=c)
            return _bola(8.8), 5.6
        _ampliar_si_toca(aislar, (_bola(7.6), 5.4), SEMILLA, 7.6, 12.0)
        assert pedido["b"] > 7.6 and pedido["c"] >= pedido["b"] + 4.0


def test_toca_la_esfera():
    assert _toca_la_esfera(_bola(7.5), SEMILLA, 7.6)
    assert not _toca_la_esfera(_bola(5.0), SEMILLA, 7.6)
