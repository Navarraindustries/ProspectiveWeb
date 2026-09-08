"""Tocar el cuello no es chocar: es a lo que va el clip.

Reportado desde la aplicación: «he probado con varios clips y siempre hay
colisiones clip–vaso». Lo era. El plan de colocación comprobaba el clip contra
la malla ENTERA —saco y cuello incluidos— así que preguntaba «¿está el clip
donde debe estar?» y llamaba colisión a que sí lo estuviera.

Medido sobre esta misma geometría y los mismos seis giros que usa la
verificación: 0 de 6 limpios contra el árbol completo, 4 de 6 recortando el
cuello. Todas las colocaciones parecían defectuosas, y los dos giros en los que
el cuerpo del clip sí barría el vaso madre quedaban enterrados en el ruido.

`clip_fit` recortaba el cuello desde el principio; este camino nunca lo aprendió,
así que el panel que juzga un candidato y el que lo coloca discrepaban sobre el
mismo clip y la misma malla.
"""
from __future__ import annotations

import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_collision_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services import devices, navarro
from services.database import Base, engine
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

_HAS_NAVARRO = bool(navarro.list_variants(root=navarro.DEFAULT_ROOT))
pytestmark = pytest.mark.skipif(not _HAS_NAVARRO, reason="biblioteca NAVARRO no instalada")

NECK_MM = 5.0


@pytest.fixture(autouse=True)
def _real_library():
    before = os.environ.get("NAVARRO_ROOT")
    os.environ["NAVARRO_ROOT"] = str(navarro.DEFAULT_ROOT)
    navarro.clear_cache()
    yield
    navarro.clear_cache()
    if before is None:
        os.environ.pop("NAVARRO_ROOT", None)
    else:
        os.environ["NAVARRO_ROOT"] = before


def _aneurysm() -> vtk.vtkPolyData:
    """Un sacular sobre su vaso madre: el saco encima del plano del cuello (z=0).

    El vaso queda por debajo y tangente, que es donde de verdad está: lo que un
    clip tiene que esquivar, mientras abraza lo que hay encima.
    """
    sac = vtk.vtkSphereSource()
    sac.SetRadius(4.0)
    sac.SetCenter(0.0, 0.0, 4.0)
    sac.SetThetaResolution(40)
    sac.SetPhiResolution(40)
    sac.Update()

    line = vtk.vtkLineSource()
    line.SetPoint1(-20.0, 0.0, -1.6)
    line.SetPoint2(20.0, 0.0, -1.6)
    line.SetResolution(60)
    line.Update()
    tube = vtk.vtkTubeFilter()
    tube.SetInputData(line.GetOutput())
    tube.SetRadius(1.6)
    tube.SetNumberOfSides(24)
    tube.CappingOn()
    tube.Update()

    return devices.combine([sac.GetOutput(), tube.GetOutput()])


def _session(*, with_morphometry: bool = True) -> str:
    sid = create_session()
    write_vtp(_aneurysm(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    if with_morphometry:
        for k, v in (("morpho.neck_mm", str(NECK_MM)), ("morpho.ar", "1.6"),
                     ("morpho.dome_height_mm", "8.0"), ("morpho.max_diameter_mm", "8.0"),
                     ("morpho.neck_source", "rim"),
                     ("morpho.neck_origin_x", "0"), ("morpho.neck_origin_y", "0"),
                     ("morpho.neck_origin_z", "0"),
                     ("morpho.axis_x", "0"), ("morpho.axis_y", "0"), ("morpho.axis_z", "1")):
            write_state(sid, k, v)
    return sid


def _place(sid: str, roll: float, jaw: float = 7.0) -> dict:
    r = client.post("/api/clips/plan", json={"session_id": sid, "placements": [
        {"clip_id": navarro.clip_id("T1", 0.0, jaw),
         "position": {"x": 0, "y": 0, "z": 0},
         "normal": [0, 0, 1], "rotation_deg": roll},
    ]})
    assert r.status_code == 200, r.text
    return r.json()


# ── 1. The neck is not an obstacle ────────────────────────────────────────── #

class TestTouchingTheNeckIsNotACollision:
    def test_a_clip_astride_the_neck_is_reported_clean(self):
        # El caso del informe. Antes: «Sí» en todos los giros, cientos de
        # contactos, ninguno de ellos un problema.
        plan = _place(_session(), roll=60.0)
        assert plan["collision_detected"] is False, plan["warning"]
        assert plan["neck_region_excluded"] is True

    def test_the_check_still_catches_the_body_fouling_the_vessel(self):
        # Y no se ha desactivado nada: a 0° el cuerpo del clip barre el vaso
        # madre a lo largo, y eso sigue siendo un choque de verdad.
        plan = _place(_session(), roll=0.0)
        assert plan["collision_detected"] is True
        assert "fuera del cuello" in (plan["warning"] or "")

    def test_some_rolls_clear_and_some_do_not(self):
        # Un criterio que dijera siempre lo mismo no sería un criterio. El giro
        # es lo que decide, que es justo lo que el ruido tapaba.
        sid = _session()
        verdicts = {roll: _place(sid, roll)["collision_detected"]
                    for roll in (0.0, 30.0, 60.0, 90.0, 120.0, 150.0)}
        assert any(verdicts.values()), verdicts
        assert not all(verdicts.values()), verdicts


# ── 2. Both paths judge the same clip the same way ────────────────────────── #

class TestThePlanAndTheVerificationAgree:
    def test_they_carve_the_same_region_before_testing(self):
        # El panel que juzga y el panel que coloca usaban obstáculos distintos
        # sobre la misma malla, así que podían contradecirse sin que nada fallara.
        from services.clip_fit import vessel_beyond_neck
        from services.segmentation import read_vtp

        sid = _session()
        vessel = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        obstacles = vessel_beyond_neck(vessel, (0.0, 0.0, 0.0), NECK_MM)

        clip, _src, _exact = navarro.build_jaw(0.0, 7.0, shape="straight")
        for roll in (0.0, 60.0, 150.0):
            world = devices.apply_transform(
                clip, devices.pose_transform((0.0, 0.0, 0.0), (0.0, 0.0, 1.0), roll))
            direct, _n = devices.check_collision(obstacles, world)
            assert _place(sid, roll)["collision_detected"] is direct, f"giro {roll}"


# ── 3. Without a measured neck, say so ────────────────────────────────────── #

class TestAnUnqualifiedCheckSaysSo:
    def test_it_does_not_pretend_to_judge_without_a_neck(self):
        # Sin cuello medido no se puede separar lo que el clip debe tocar de lo
        # que no. Dar un sí o un no ahí es dar una cifra que no significa nada.
        plan = _place(_session(with_morphometry=False), roll=60.0)
        assert plan["neck_region_excluded"] is False
        assert "morfometría" in (plan["warning"] or "")

    def test_the_contact_count_is_still_reported(self):
        # No se calla el dato: se calla la interpretación.
        plan = _place(_session(with_morphometry=False), roll=60.0)
        assert plan["collision_detected"] is True
        assert "puntos" in (plan["warning"] or "")
