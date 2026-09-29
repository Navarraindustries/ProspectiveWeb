"""La tijera: marcar un anillo alrededor de un vaso y seccionarlo ahí.

Lo que estas pruebas defienden:

1. Que el corte es LOCAL. Un plano es infinito, y aplicarlo a la malla entera
   amputaría todo lo que cruce: la tijera solo puede tocar lo que rodea el
   anillo. Es la diferencia con el corte por plano que hubo antes y que se
   retiró precisamente por ciego.
2. Que la pieza que se propone quitar es la que el profesional señaló, y que
   el otro lado conserva el resto del árbol.
3. Que lo que se enseña en la vista previa es EXACTAMENTE lo que se quita:
   una sola función lo decide, así que no pueden discrepar.
4. Que un anillo mal puesto —pocos puntos, lejos de la malla, sin rodear
   nada— se rechaza con un motivo en vez de vaciar la malla en silencio.
"""
from __future__ import annotations

import math
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_tijera_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.mesh_crop import ScissorsError, scissors_preview
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


# ── Mallas de juguete ──────────────────────────────────────────────────── #

def _tubo(radio: float, largo: float, centro=(0.0, 0.0, 0.0), eje="y") -> vtk.vtkPolyData:
    """Un cilindro cerrado, que es lo más parecido a un vaso."""
    # Teselado a lo largo, no un vtkCylinderSource: aquel solo tiene vértices
    # en sus dos extremos, así que sus triángulos miden lo que mida el tubo.
    # Ningún recorte por una rebanada de milímetros puede partir un triángulo
    # de 30 mm que la cruza entera —la función implícita tiene el mismo signo
    # en sus tres vértices—, y la prueba mediría una patología del cilindro de
    # juguete, no el algoritmo. Una malla real de marching cubes a 0,32 mm de
    # vóxel tiene triángulos submilimétricos; este tubo, anillos cada 0,5 mm.
    linea = vtk.vtkLineSource()
    linea.SetPoint1(0.0, -largo / 2, 0.0)
    linea.SetPoint2(0.0, largo / 2, 0.0)
    linea.SetResolution(max(8, int(largo / 0.5)))
    tubo = vtk.vtkTubeFilter()
    tubo.SetInputConnection(linea.GetOutputPort())
    tubo.SetRadius(radio)
    tubo.SetNumberOfSides(24)
    tubo.CappingOn()
    src = vtk.vtkTriangleFilter()
    src.SetInputConnection(tubo.GetOutputPort())
    src.Update()
    # Girar PRIMERO y trasladar después: vtkCylinderSource nace a lo largo de
    # Y, y una rotación se hace alrededor del origen, así que centrarlo antes
    # de girar lo manda a otro sitio.
    t = vtk.vtkTransform()
    t.Translate(*centro)
    if eje == "x":
        t.RotateZ(90)
    elif eje == "z":
        t.RotateX(90)
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputData(src.GetOutput()); f.SetTransform(t); f.Update()
    return f.GetOutput()


def _une(*polys: vtk.vtkPolyData) -> vtk.vtkPolyData:
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    limpia = vtk.vtkCleanPolyData()
    limpia.SetInputConnection(ap.GetOutputPort())
    limpia.Update()
    return limpia.GetOutput()


def _arbol_con_rama() -> vtk.vtkPolyData:
    """Tronco vertical largo + una rama horizontal que sale por un lado.

    La rama es lo que el profesional querría cortar: sale del tronco en
    x ∈ [0, 30], a la altura y = 0.
    """
    tronco = _tubo(radio=3.0, largo=80.0, centro=(0.0, 0.0, 0.0), eje="y")
    rama = _tubo(radio=1.5, largo=30.0, centro=(15.0, 0.0, 0.0), eje="x")
    return _une(tronco, rama)


def _anillo(centro_x: float, radio: float = 2.5, n: int = 8) -> list[tuple[float, float, float]]:
    """Puntos alrededor de la rama, en el plano x = centro_x."""
    return [
        (centro_x, radio * math.cos(2 * math.pi * k / n), radio * math.sin(2 * math.pi * k / n))
        for k in range(n)
    ]


def _bbox(poly: vtk.vtkPolyData) -> tuple[float, ...]:
    return tuple(poly.GetBounds())


# ── El corte secciona donde se marcó, y solo ahí ───────────────────────── #

class TestElCorteEsLocal:
    def test_secciona_la_rama_y_deja_el_tronco_entero(self):
        arbol = _arbol_con_rama()
        y_antes = _bbox(arbol)[2:4]

        r = scissors_preview(arbol, _anillo(20.0), keep_side=0)

        # La pieza que se va es la punta de la rama, más allá del anillo.
        assert r.doomed is not None and r.doomed.GetNumberOfPoints() > 0
        dx = _bbox(r.doomed)
        assert dx[0] > 18.0, f"la pieza que se va empieza en x={dx[0]:.1f}, debería estar pasado el anillo"

        # Y el tronco sigue de punta a punta: el plano NO ha amputado nada más.
        y_despues = _bbox(r.kept)[2:4]
        assert y_despues[0] == pytest.approx(y_antes[0], abs=0.5)
        assert y_despues[1] == pytest.approx(y_antes[1], abs=0.5)

    def test_el_otro_lado_conserva_el_arbol(self):
        # keep_side=1 se queda con lo de más allá del anillo: la punta.
        arbol = _arbol_con_rama()
        r = scissors_preview(arbol, _anillo(20.0), keep_side=1)
        assert r.doomed is not None
        # Ahora lo condenado es el árbol, que es mucho más grande que la punta.
        assert r.doomed.GetNumberOfPoints() > r.kept.GetNumberOfPoints()

    def test_los_dos_lados_suman_menos_que_el_original_solo_la_banda(self):
        # El corte quita una banda fina de triángulos: la suma de las dos
        # partes tiene que ser casi la malla entera, no la mitad.
        arbol = _arbol_con_rama()
        r = scissors_preview(arbol, _anillo(20.0), keep_side=0)
        total = r.kept.GetNumberOfPoints() + (r.doomed.GetNumberOfPoints() if r.doomed else 0)
        assert total > 0.80 * arbol.GetNumberOfPoints(), (
            f"se perdieron demasiados vértices en el corte: {total} de {arbol.GetNumberOfPoints()}")

    def test_un_anillo_en_el_tronco_no_se_lleva_la_rama(self):
        # Anillo alrededor del TRONCO, arriba del todo: lo que se va es la
        # punta superior del tronco, con la rama (que está en y=0) intacta.
        arbol = _arbol_con_rama()
        anillo = [(4.0 * math.cos(2 * math.pi * k / 8), 30.0, 4.0 * math.sin(2 * math.pi * k / 8))
                  for k in range(8)]
        r = scissors_preview(arbol, anillo, keep_side=0)
        assert r.doomed is not None
        assert _bbox(r.doomed)[2] > 25.0, "lo que se va debería ser la punta de arriba"
        # La rama sigue en lo conservado: llega hasta x ≈ 30.
        assert _bbox(r.kept)[1] > 25.0


# ── Vista previa y corte son lo mismo ──────────────────────────────────── #

class TestLaVistaPreviaNoPuedeMentir:
    def test_la_malla_conservada_es_la_que_quedaria(self):
        # Una sola función decide; el endpoint solo elige si la escribe. Si
        # esto se separara en dos caminos, la vista previa podría enseñar una
        # cosa y el corte hacer otra: es el fallo por el que se retiró el
        # corte por plano anterior, que recortaba sin dibujar nada.
        arbol = _arbol_con_rama()
        a = scissors_preview(arbol, _anillo(20.0), keep_side=0)
        b = scissors_preview(arbol, _anillo(20.0), keep_side=0)
        assert a.kept.GetNumberOfPoints() == b.kept.GetNumberOfPoints()
        assert a.removed_vertices == b.removed_vertices

    def test_cuenta_lo_que_se_va(self):
        arbol = _arbol_con_rama()
        r = scissors_preview(arbol, _anillo(20.0), keep_side=0)
        assert r.removed_vertices == arbol.GetNumberOfPoints() - r.kept.GetNumberOfPoints()
        assert r.removed_vertices > 0


# ── Lo que se rechaza ──────────────────────────────────────────────────── #

class TestAnillosQueNoValen:
    def test_menos_de_tres_puntos(self):
        # Con dos puntos no hay plano: hay infinitos que los contienen.
        with pytest.raises(ScissorsError, match="tres puntos"):
            scissors_preview(_arbol_con_rama(), _anillo(20.0)[:2], keep_side=0)

    def test_puntos_alineados(self):
        # Tres puntos en línea tampoco definen un plano.
        rectos = [(20.0, -3.0, 0.0), (20.0, 0.0, 0.0), (20.0, 3.0, 0.0)]
        with pytest.raises(ScissorsError, match="alineados|plano"):
            scissors_preview(_arbol_con_rama(), rectos, keep_side=0)

    def test_un_anillo_lejos_de_la_malla_no_corta_nada(self):
        # Marcado en el aire: no vaciar la malla en silencio.
        lejos = [(500.0 + p[0], p[1], p[2]) for p in _anillo(0.0)]
        with pytest.raises(ScissorsError, match="no toca|lejos"):
            scissors_preview(_arbol_con_rama(), lejos, keep_side=0)

    def test_un_anillo_pasado_el_extremo_no_toca_nada(self):
        # Marcado más allá de donde acaba la rama.
        arbol = _arbol_con_rama()
        with pytest.raises(ScissorsError, match="no toca|lejos"):
            scissors_preview(arbol, _anillo(60.0), keep_side=0)

    def test_un_anillo_que_no_rodea_nada_lo_dice(self):
        # Anillo pequeño apoyado sobre una esfera: la rebanada le abre un
        # agujero, pero la superficie sigue siendo UNA pieza. Hay que decirlo
        # en vez de devolver una malla casi igual y que el profesional crea
        # que ha cortado algo.
        bola = vtk.vtkSphereSource()
        bola.SetRadius(20.0); bola.SetThetaResolution(80); bola.SetPhiResolution(80)
        bola.Update()
        tri = vtk.vtkTriangleFilter(); tri.SetInputData(bola.GetOutput()); tri.Update()
        # Puntos sobre el casquete, alrededor del polo norte.
        cerca = [(3.0 * math.cos(2 * math.pi * k / 8), 3.0 * math.sin(2 * math.pi * k / 8),
                  math.sqrt(max(0.0, 400.0 - 9.0))) for k in range(8)]
        with pytest.raises(ScissorsError, match="no separa"):
            scissors_preview(tri.GetOutput(), cerca, keep_side=0)

    def test_una_malla_vacia(self):
        with pytest.raises(ScissorsError):
            scissors_preview(vtk.vtkPolyData(), _anillo(20.0), keep_side=0)


# ── El plano sale de los puntos ────────────────────────────────────────── #

class TestElPlanoSeAjustaALosPuntos:
    def test_un_anillo_inclinado_corta_inclinado(self):
        # Los puntos no tienen por qué ser coplanares perfectos: se ajusta por
        # mínimos cuadrados, como el plano de cuello con los puntos del borde.
        arbol = _arbol_con_rama()
        inclinado = [(20.0 + 0.6 * math.cos(2 * math.pi * k / 8),
                      2.5 * math.cos(2 * math.pi * k / 8),
                      2.5 * math.sin(2 * math.pi * k / 8)) for k in range(8)]
        r = scissors_preview(arbol, inclinado, keep_side=0)
        assert r.doomed is not None and r.doomed.GetNumberOfPoints() > 0
        n = np.asarray(r.normal, dtype=float)
        # La normal debe apuntar sobre todo en x: el anillo rodea la rama.
        assert abs(n[0]) > 0.8, f"normal inesperada: {n}"


# ── Por el endpoint ────────────────────────────────────────────────────── #

def _sesion_con_arbol() -> str:
    sid = create_session()
    write_vtp(_arbol_con_rama(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


def _cuerpo(anillo, **extra) -> dict:
    d = {"points": [{"x": x, "y": y, "z": z} for x, y, z in anillo]}
    d.update(extra)
    return d


class TestElEndpoint:
    def test_por_defecto_no_corta_nada(self):
        # Que una llamada sin `apply` modificara la malla sería la peor
        # sorpresa posible en una herramienta destructiva.
        sid = _sesion_con_arbol()
        antes = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp").GetNumberOfPoints()
        r = client.post(f"/api/mesh-scissors/{sid}", json=_cuerpo(_anillo(20.0)))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["applied"] is False and d["preview_url"]
        despues = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp").GetNumberOfPoints()
        assert despues == antes

    def test_la_vista_previa_deja_la_pieza_condenada_en_disco(self):
        sid = _sesion_con_arbol()
        r = client.post(f"/api/mesh-scissors/{sid}", json=_cuerpo(_anillo(20.0)))
        assert r.status_code == 200
        pieza = session_subdir(sid, "meshes") / "scissors_preview.vtp"
        assert pieza.is_file()
        # Y es la punta de la rama, no el árbol.
        assert read_vtp(pieza).GetBounds()[0] > 18.0

    def test_lo_que_anuncia_la_vista_previa_es_lo_que_quita_el_corte(self):
        # El contrato de la herramienta: mismo cálculo para las dos llamadas.
        sid = _sesion_con_arbol()
        previa = client.post(f"/api/mesh-scissors/{sid}", json=_cuerpo(_anillo(20.0))).json()
        corte = client.post(f"/api/mesh-scissors/{sid}",
                            json=_cuerpo(_anillo(20.0), apply=True)).json()
        assert corte["applied"] is True
        assert corte["removed_vertices"] == previa["removed_vertices"]
        assert corte["kept_vertices"] == previa["kept_vertices"]
        real = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        assert real.GetNumberOfPoints() == previa["kept_vertices"]

    def test_el_corte_se_deshace(self):
        sid = _sesion_con_arbol()
        antes = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp").GetNumberOfPoints()
        client.post(f"/api/mesh-scissors/{sid}", json=_cuerpo(_anillo(20.0), apply=True))
        r = client.post(f"/api/mesh-restore/{sid}", json={"scope": "undo"})
        assert r.status_code == 200 and r.json()["vertices"] == antes

    def test_el_otro_lado_conserva_la_punta(self):
        sid = _sesion_con_arbol()
        d = client.post(f"/api/mesh-scissors/{sid}",
                        json=_cuerpo(_anillo(20.0), keep_side=1, apply=True)).json()
        real = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        assert real.GetNumberOfPoints() == d["kept_vertices"]
        assert real.GetBounds()[0] > 18.0, "debería haberse quedado con la punta"

    def test_un_anillo_que_no_vale_es_un_422_con_motivo(self):
        sid = _sesion_con_arbol()
        lejos = [{"x": 500.0, "y": 0.0, "z": 0.0}, {"x": 500.0, "y": 3.0, "z": 0.0},
                 {"x": 500.0, "y": 0.0, "z": 3.0}]
        r = client.post(f"/api/mesh-scissors/{sid}", json={"points": lejos})
        assert r.status_code == 422
        assert "no toca" in r.json()["detail"]

    def test_menos_de_tres_puntos_lo_rechaza_el_modelo(self):
        sid = _sesion_con_arbol()
        r = client.post(f"/api/mesh-scissors/{sid}", json=_cuerpo(_anillo(20.0)[:2]))
        assert r.status_code == 422

    def test_una_sesion_sin_malla(self):
        sid = create_session()
        r = client.post(f"/api/mesh-scissors/{sid}", json=_cuerpo(_anillo(20.0)))
        assert r.status_code in (404, 409)
