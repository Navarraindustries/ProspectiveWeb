# -*- coding: utf-8 -*-
"""El borrador que quita tejido PEGADO al árbol.

Por qué hace falta
------------------
`remove_component_at` borra una pieza entera, y sirve cuando el hueso viene
suelto. En 3DRA a resolución completa NO viene suelto: el peñasco y la base del
cráneo tocan el árbol, así que «solo el árbol principal» los conserva. La propia
interfaz lo dice: «la malla es una sola pieza: no hay nada suelto que borrar».

Por qué es manual y no automático
---------------------------------
Se midieron dos vías para distinguirlos solos, sobre case 3 a resolución
completa, y ninguna separa:

  · forma local (PCA + rugosidad): chapa 0,742 · resto del árbol 0,717
  · calibre local (mediana): chapa 0,69 mm · resto del árbol 0,69 mm

Localmente son la misma cosa. Quien distingue es el ojo del usuario.

Por qué la bola es euclídea y la propagación por la superficie
--------------------------------------------------------------
Dos alternativas descartadas con medidas:

  · Recorte esférico (ya existía): borra TODO lo que cae en la bola, así que un
    vaso que pasa por detrás de la chapa se va con ella.
  · Distancia geodésica: en una malla rugosa se infla. Medido en case 3, un
    radio de 30 mm borraba el 0,4 % de la malla y tardaba 4,5 s.
"""
from __future__ import annotations

import numpy as np
import pytest
import vtk
from vtkmodules.util.numpy_support import vtk_to_numpy

from services.mesh_components import erase_region_at


def _tubo(p0, p1, r, lados=16, res=60):
    l = vtk.vtkLineSource()
    l.SetPoint1(*p0); l.SetPoint2(*p1); l.SetResolution(res); l.Update()
    t = vtk.vtkTubeFilter()
    t.SetInputData(l.GetOutput()); t.SetRadius(r)
    t.SetNumberOfSides(lados); t.SetCapping(True); t.Update()
    tr = vtk.vtkTriangleFilter()
    tr.SetInputData(t.GetOutput()); tr.Update()
    return tr.GetOutput()


def _unir(*partes):
    ap = vtk.vtkAppendPolyData()
    for p in partes:
        ap.AddInputData(p)
    ap.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputData(ap.GetOutput()); cl.Update()
    return cl.GetOutput()


def _pts(poly):
    return vtk_to_numpy(poly.GetPoints().GetData())


class TestBorradorDeRegion:

    def test_borra_alrededor_del_clic(self):
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        out, n, aviso = erase_region_at(placa, (0.0, 0.0, 6.0), radius_mm=8.0)
        assert aviso == ""
        assert n > 0
        assert out.GetNumberOfPoints() < placa.GetNumberOfPoints()

    def test_a_mas_radio_mas_borrado(self):
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        _, poco, _ = erase_region_at(placa, (0.0, 0.0, 6.0), radius_mm=5.0)
        _, mucho, _ = erase_region_at(placa, (0.0, 0.0, 6.0), radius_mm=15.0)
        assert mucho > poco

    def test_respeta_un_vaso_que_solo_pasa_cerca(self):
        """Lo que el recorte esférico no puede hacer.

        El vaso pasa a 1,8 mm de la placa: dentro de cualquier bola que la
        cubra. Como no está unido a ella, la propagación no lo alcanza.
        """
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        vaso = _tubo((0, -20, -9), (0, 20, -9), 1.2)
        malla = _unir(placa, vaso)
        antes = int((_pts(malla)[:, 2] < -6).sum())
        assert antes > 0

        out, n, _ = erase_region_at(malla, (0.0, 0.0, 6.0), radius_mm=200.0)
        despues = int((_pts(out)[:, 2] < -6).sum())
        assert despues == antes, "el borrador se ha llevado el vaso de al lado"
        assert n > 0, "no ha borrado la placa"

    def test_no_salta_a_lo_que_se_une_por_fuera_de_la_bola(self):
        """Un vaso PEGADO, pero cuyo camino hasta el clic sale de la bola.

        Es la diferencia entre propagar por la superficie y borrar la bola: el
        vaso cruza la bola, pero para llegar a él hay que salir de ella.
        """
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        # Vaso que cruza bajo la placa y se une a ella en el extremo lejano
        vaso = _tubo((0, -25, -9), (0, 25, -9), 1.2)
        union = _tubo((0, 25, -9), (14, 0, -1), 1.2)
        malla = _unir(placa, vaso, union)

        out, n, _ = erase_region_at(malla, (0.0, 0.0, 6.0), radius_mm=12.0)
        q = _pts(out)
        # El tramo central del vaso, dentro de la bola, sigue ahí
        sigue = int(((q[:, 2] < -6) & (np.abs(q[:, 1]) < 8)).sum())
        assert sigue > 0, "ha saltado al vaso a través de la bola"

    # ── Lo que no debe hacer ──────────────────────────────────────────── #

    def test_clic_al_aire_no_borra_nada(self):
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        out, n, aviso = erase_region_at(placa, (0.0, 0.0, 80.0), radius_mm=10.0)
        assert n == 0
        assert "lejos" in aviso.lower()
        assert out.GetNumberOfPoints() == placa.GetNumberOfPoints()

    def test_radio_cero_se_rechaza(self):
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        _, n, aviso = erase_region_at(placa, (0.0, 0.0, 6.0), radius_mm=0.0)
        assert n == 0 and "radio" in aviso.lower()

    def test_no_se_lleva_la_malla_entera(self):
        """Borrarlo todo no es borrar una región: se avisa y no se hace."""
        placa = _tubo((-15, 0, 0), (15, 0, 0), 6.0)
        out, n, aviso = erase_region_at(placa, (0.0, 0.0, 6.0), radius_mm=1e5)
        assert n == 0
        assert out.GetNumberOfPoints() == placa.GetNumberOfPoints()
        assert "entera" in aviso.lower() or "radio" in aviso.lower()

    def test_malla_vacia_no_revienta(self):
        out, n, aviso = erase_region_at(vtk.vtkPolyData(), (0.0, 0.0, 0.0), 5.0)
        assert n == 0 and aviso


class TestBorradorPorLaApi:
    """El endpoint, con lo que no debe pasar cuando el clic falla."""

    def _sesion_con_malla(self):
        from fastapi.testclient import TestClient
        from main import app
        from services.sessions import create_session, session_subdir
        from services.segmentation import write_vtp

        sid = create_session()
        malla = _unir(_tubo((-15, 0, 0), (15, 0, 0), 6.0),
                      _tubo((0, -20, -9), (0, 20, -9), 1.2))
        write_vtp(malla, session_subdir(sid, "meshes") / "vessel_tree.vtp")
        return TestClient(app), sid, malla

    def test_borra_y_deja_deshacer(self):
        client, sid, malla = self._sesion_con_malla()
        r = client.post(f"/api/mesh-erase-region/{sid}", json={
            "point": {"x": 0.0, "y": 0.0, "z": 6.0}, "radius_mm": 10.0,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["removed_vertices"] > 0
        assert d["vertices"] < malla.GetNumberOfPoints()
        assert d["undo_depth"] >= 1, "un borrado tiene que poder deshacerse"

    def test_el_clic_fallido_no_gasta_un_deshacer(self):
        client, sid, malla = self._sesion_con_malla()
        r = client.post(f"/api/mesh-erase-region/{sid}", json={
            "point": {"x": 0.0, "y": 0.0, "z": 90.0}, "radius_mm": 10.0,
        })
        d = r.json()
        assert d["removed_vertices"] == 0
        assert d["vertices"] == malla.GetNumberOfPoints()
        assert d["undo_depth"] == 0
        assert d["warning"]

    def test_sesion_inexistente(self):
        from fastapi.testclient import TestClient
        from main import app
        r = TestClient(app).post("/api/mesh-erase-region/nope", json={
            "point": {"x": 0.0, "y": 0.0, "z": 0.0}, "radius_mm": 5.0,
        })
        assert r.status_code == 404


class TestDosClicsALaVez:
    """El fallo que apareció EN VIVO, no en los tests.

    El usuario dio dos clics seguidos del borrador. Cada uno tarda ~1,6 s en
    una malla de 128 000 vértices, así que se solaparon. `write_vtp` truncaba
    y escribía sin atomicidad, y las dos escrituras se entrelazaron: quedó un
    .vtp de 3,9 MB con el cierre XML correcto y basura en medio. A partir de
    ahí la sesión leía 0 vértices y TODAS las herramientas decían «no se borró
    nada», sin decir que la malla estaba rota.

    Los respaldos de deshacer lo dejaron ver: 128.366 → 127.367 → 127.142 → 0.
    O sea, el borrador funcionaba; lo que fallaba era guardar.

    El fichero roto, volcado: un VTP completo y válido que termina en
    `</VTKFile>`, y DETRÁS 1.542 bytes de base64 del fichero anterior, que era
    algo más largo. Dos escritores sobre la misma ruta: uno trunca y escribe su
    contenido, el otro sigue escribiendo más allá del final del primero.

    Descartado por medición, para no volver a mirarlo: VTK **sí** trunca al
    escribir sobre un fichero existente (191.254 B → 98.859 B, sin cola), y
    `shutil.copy2` del historial también. El fallo necesita las dos escrituras
    a la vez.

    AVISO sobre estos tests: fijan el INVARIANTE —el fichero siempre se relee
    entero y es una de las dos mallas—, pero NO reproducen la carrera original;
    con `write_vtp` no atómico también pasan. Reproducirla pide un solape que
    no se consigue a voluntad. El arreglo no depende de reproducirla: con
    temporal + `os.replace` no hay ventana en la que el fichero destino exista
    a medias.
    """

    def test_escrituras_simultaneas_no_corrompen_la_malla(self):
        import threading
        from services.segmentation import read_vtp, write_vtp
        from services.sessions import create_session, session_subdir

        destino = session_subdir(create_session(), "meshes") / "vessel_tree.vtp"
        # Dos mallas de tamaños MUY distintos: si se entrelazan, se nota.
        grande = _tubo((-30, 0, 0), (30, 0, 0), 6.0, lados=40, res=300)
        pequena = _tubo((0, 0, 0), (4, 0, 0), 1.0, lados=8, res=6)
        assert grande.GetNumberOfPoints() > 10 * pequena.GetNumberOfPoints()

        fallos: list[str] = []

        def escribe(malla, veces):
            for _ in range(veces):
                try:
                    write_vtp(malla, destino)
                except Exception as exc:          # noqa: BLE001
                    fallos.append(str(exc))

        hilos = [threading.Thread(target=escribe, args=(grande, 8)),
                 threading.Thread(target=escribe, args=(pequena, 8))]
        for t in hilos:
            t.start()
        for t in hilos:
            t.join()

        assert fallos == [], f"escribir falló: {fallos[:2]}"
        # Lo que quede tiene que ser UNA de las dos, entera y legible.
        leida = read_vtp(destino)
        assert leida.GetNumberOfPoints() in (grande.GetNumberOfPoints(),
                                             pequena.GetNumberOfPoints()), (
            f"malla corrupta: {leida.GetNumberOfPoints()} vértices"
        )

    def test_dos_borrados_seguidos_por_la_api_se_acumulan(self):
        """Sin cerrojo, el segundo parte de la malla ANTERIOR y deshace el primero."""
        from fastapi.testclient import TestClient
        from main import app
        from services.sessions import create_session, session_subdir
        from services.segmentation import write_vtp

        sid = create_session()
        malla = _tubo((-20, 0, 0), (20, 0, 0), 6.0, lados=30, res=200)
        write_vtp(malla, session_subdir(sid, "meshes") / "vessel_tree.vtp")
        client = TestClient(app)

        n0 = malla.GetNumberOfPoints()
        v = n0
        for z in (6.0, 5.5):
            r = client.post(f"/api/mesh-erase-region/{sid}", json={
                "point": {"x": 0.0, "y": 0.0, "z": z}, "radius_mm": 6.0,
            })
            assert r.status_code == 200
            d = r.json()
            assert d["vertices"] <= v, "un borrado ha devuelto MÁS malla que el anterior"
            v = d["vertices"]
        assert v < n0
