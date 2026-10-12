"""Reanudar devuelve lo que se hizo (familia S: F1-27, F1-28, F1-246…F1-250, F1-244).

La auditoría reanudó una sesión guardada en el paso de dispositivos y volvió
sin la decisión («Planificar dispositivos» apagado), sin el análisis del
corredor, con los clips como mallas sueltas (sin lista editable, verificación
ni mapa), sin los enlaces del PDF y del SR —que seguían en disco—, con la
ventana del DICOM y con la detección rehecha (otra lista, la confirmación
perdida). Lo que se defiende aquí:

- cada dato guardado vuelve en `SessionRestoreResult`;
- `POST /api/detect/{sid}?cached=true` devuelve los candidatos del estado sin
  tocar la malla (aquí la malla del árbol no existe: recalcular daría 422);
- la confirmación de lesión hecha en la sesión de origen se ve desde la viva.
"""
from __future__ import annotations

import os
import tempfile
from typing import Generator

_tmp = tempfile.mkdtemp(prefix="prospective_restore_state_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from main import app  # noqa: E402
from services.database import Base, engine, get_db  # noqa: E402
from services.db_models import LesionConfirmation  # noqa: E402
from services.sessions import create_session, session_subdir, write_states  # noqa: E402

_Local = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _db() -> Generator:
    db = _Local()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _db
Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)   # admin (conftest)


_CLIPS = [
    {"key": 1, "clip_id": "yasargil-fe720k", "name": "Yaşargil FE720K",
     "position": [1.0, 2.0, 3.0], "rotation_deg": 15.0, "azimuthDeg": 10.0, "elevationDeg": -5.0},
    {"key": 2, "clip_id": "yasargil-fe740k", "name": "Yaşargil FE740K",
     "position": [4.0, 5.0, 6.0], "rotation_deg": 0.0, "azimuthDeg": 0.0, "elevationDeg": 0.0},
]


def _plan(sid: str) -> dict:
    return {
        "clips_mesh_url": f"/data/sessions/{sid}/meshes/clips_placed.vtp?v=1",
        "neck_coverage_pct": 96.5, "collision_detected": False,
        "neck_region_excluded": True, "branches_under_clip": [], "warning": None,
    }


def _sesion_completa() -> str:
    """Una sesión que llegó hasta el informe, con todo lo que la auditoría perdió."""
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    (meshes / "vessel_tree.vtp").write_text("x")
    (meshes / "clips_placed.vtp").write_text("x")
    write_states(sid, {
        "dicom.modality": "CT",
        "morpho.max_diameter_mm": "8.2", "morpho.neck_mm": "3.5", "morpho.ar": "2.06",
        "morpho.dnr": "2.34", "morpho.bf": "0.72", "morpho.ui": "0.09",
        "morpho.dome_height_mm": "6.1", "morpho.volume_mm3": "145.3",
        "morpho.rupture_risk": "Alto",
        # La trayectoria y su corredor tal como los dejó «Guardar trayectoria».
        "trajectory.entry_x": "0", "trajectory.entry_y": "0", "trajectory.entry_z": "0",
        "trajectory.target_x": "3", "trajectory.target_y": "4", "trajectory.target_z": "0",
        "trajectory.verdict": "revisar", "trajectory.verdict_reason": "Cruza un vaso de 1,2 mm",
        "trajectory.findings": "Cruza un vaso",
        "trajectory.corridor_json": (
            '{"radius_mm": 5.0, "vessels_crossed": [], "nearest_branch_mm": null, '
            '"nearest_branch_calibre_mm": 0.0, "dense_tissue_mm": 0.0, '
            '"dense_tissue_measurable": true, "verdict": "revisar", '
            '"verdict_reason": "Cruza un vaso de 1,2 mm", "findings": ["Cruza un vaso"], '
            '"assumptions": []}'
        ),
    })
    # La decisión, por la ruta de verdad: es la que escribe lo que vuelve.
    r = client.post("/api/treatment-decision", json={
        "session_id": sid, "location": "ACA / ACoA — Arteria Comunicante Anterior",
        "is_ruptured": False, "patient_age": 61, "has_comorbidities": True,
    })
    assert r.status_code == 200, r.text
    # Los clips editables, la ventana y los dos documentos.
    r = client.put(f"/api/devices/{sid}/placed-clips", json={"clips": _CLIPS, "plan": _plan(sid)})
    assert r.status_code == 200, r.text
    r = client.put(f"/api/volume/{sid}/window", json={"wc": 300.0, "ww": 900.0})
    assert r.status_code == 200, r.text
    reports = session_subdir(sid, "reports")
    (reports / f"{sid}_report.pdf").write_bytes(b"")
    (reports / f"{sid}_sr.dcm").write_bytes(b"")
    return sid


def _guardar_y_reanudar(sid: str) -> dict:
    r = client.post("/api/sessions/save", json={"session_id": sid, "current_step": 7, "label": "s"})
    assert r.status_code == 200, r.text
    r = client.post(f"/api/sessions/{sid}/restore")
    assert r.status_code == 200, r.text
    return r.json()


class TestCadaDatoVuelve:
    def test_la_decision_y_sus_entradas_vuelven(self):
        """F1-27: sin decisión, «Planificar dispositivos» quedaba apagado."""
        sid = _sesion_completa()
        decidida = client.get(f"/api/treatment-decision/{sid}").json()
        r = _guardar_y_reanudar(sid)
        assert r["treatment"] is not None
        assert r["treatment"]["recommendation_key"] == decidida["recommendation_key"]
        assert r["treatment"]["factors"] == decidida["factors"]
        ins = r["treatment_inputs"]
        assert ins["session_id"] == r["session_id"]
        assert ins["location"] == "ACA / ACoA — Arteria Comunicante Anterior"
        assert ins["patient_age"] == 61 and ins["has_comorbidities"] is True

    def test_get_decision_devuelve_lo_guardado_o_404(self):
        sid = _sesion_completa()
        assert client.get(f"/api/treatment-decision/{sid}").status_code == 200
        client.delete(f"/api/treatment-decision/{sid}")
        assert client.get(f"/api/treatment-decision/{sid}").status_code == 404
        assert client.get("/api/treatment-decision/no-existe").status_code == 404

    def test_la_trayectoria_vuelve_con_su_corredor(self):
        """F1-247: volvían los puntos pero no el análisis ni «Guardada ✓»."""
        r = _guardar_y_reanudar(_sesion_completa())
        tr = r["trajectory"]
        assert tr["entry"] == [0.0, 0.0, 0.0] and tr["target"] == [3.0, 4.0, 0.0]
        assert abs(tr["depth_mm"] - 5.0) < 0.05
        assert tr["angle_deg"] >= 0.0
        # El corredor guardado, no uno recalculado (la malla aquí ni se lee).
        assert tr["corridor"]["verdict"] == "revisar"
        assert tr["corridor"]["verdict_reason"] == "Cruza un vaso de 1,2 mm"
        # Y GET /trajectory dice lo mismo.
        assert client.get(f"/api/trajectory/{r['session_id']}").json()["corridor"] == tr["corridor"]

    def test_los_clips_vuelven_editables_con_su_verificacion(self):
        """F1-28: volvían como mallas; sin la lista no se podían mover ni verificar."""
        r = _guardar_y_reanudar(_sesion_completa())
        pc = r["placed_clips"]
        assert pc["clips"] == _CLIPS
        assert pc["plan"]["neck_coverage_pct"] == 96.5
        # La URL de la malla es la de la sesión viva, no la de la guardada.
        assert f"/data/sessions/{r['session_id']}/meshes/clips_placed.vtp" in pc["plan"]["clips_mesh_url"]

    def test_la_ventana_vuelve(self):
        """F1-248: volvía la ventana por defecto del DICOM."""
        r = _guardar_y_reanudar(_sesion_completa())
        assert r["window"] == {"wc": 300.0, "ww": 900.0}

    def test_los_enlaces_del_informe_vuelven_si_los_ficheros_estan(self):
        """F1-249: el PDF y el SR seguían en disco y no había enlace."""
        sid = _sesion_completa()
        r = _guardar_y_reanudar(sid)
        nuevo = r["session_id"]
        urls = r["report_urls"]
        assert urls["pdf_url"].startswith(f"/data/sessions/{nuevo}/reports/{sid}_report.pdf?v=")
        assert urls["dicom_sr_url"].startswith(f"/data/sessions/{nuevo}/reports/{sid}_sr.dcm?v=")

    def test_sin_nada_hecho_no_inventa_nada(self):
        sid = create_session()
        (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("x")
        r = _guardar_y_reanudar(sid)
        for k in ("treatment", "treatment_inputs", "trajectory", "placed_clips", "window", "report_urls"):
            assert r[k] is None, k
        assert r["lesion_confirmed"] is False


class TestClipsEditables:
    def test_put_y_get_de_la_lista(self):
        sid = create_session()
        (session_subdir(sid, "meshes") / "clips_placed.vtp").write_text("x")
        assert client.put(f"/api/devices/{sid}/placed-clips",
                          json={"clips": _CLIPS, "plan": _plan(sid)}).status_code == 200
        got = client.get(f"/api/devices/{sid}").json()["placed_clips"]
        assert got["clips"] == _CLIPS

    def test_limpiar_clips_borra_la_lista(self):
        sid = create_session()
        client.put(f"/api/devices/{sid}/placed-clips", json={"clips": _CLIPS, "plan": None})
        client.delete(f"/api/devices/{sid}?kind=clips")
        assert client.get(f"/api/devices/{sid}").json()["placed_clips"] is None

    def test_ventana_invalida_422(self):
        sid = create_session()
        assert client.put(f"/api/volume/{sid}/window", json={"wc": 40, "ww": 0}).status_code == 422
        assert client.put("/api/volume/no-existe/window", json={"wc": 40, "ww": 400}).status_code == 404


def _con_candidatos(sid: str) -> None:
    """Dos aceptados y un descartado, como los deja la detección."""
    meshes = session_subdir(sid, "meshes")
    vals = {"detect.n_candidates": "2", "detect.n_rejected": "1",
            "detect.best_vtp_name": "aneurysm_cand_001.vtp"}
    for idx, x in ((1, 0.0), (2, 30.0), (3, 60.0)):
        p = f"detect.cand_{idx:03d}"
        name = f"aneurysm_cand_{idx:03d}.vtp"
        (meshes / name).write_text("x")
        vals |= {f"{p}.vtp_name": name, f"{p}.url": f"/data/sessions/OTRA/meshes/{name}",
                 f"{p}.centroid_x": str(x), f"{p}.centroid_y": "1", f"{p}.centroid_z": "2",
                 f"{p}.diameter_mm": "6.5", f"{p}.score": "0.8", f"{p}.channels": "curvatura,calibre",
                 f"{p}.patch_kind": "region", f"{p}.veto_reason": "isla" if idx == 3 else "",
                 f"{p}.veto_detail": "Pieza suelta de 12 mm³" if idx == 3 else ""}
    write_states(sid, vals)


class TestDeteccionGuardada:
    def test_cached_devuelve_los_candidatos_sin_recalcular(self):
        """F1-246/F1-244: reanudar re-detectaba y salía otra lista. Aquí la
        malla del árbol no existe: si se recalculara, sería un 422."""
        sid = create_session()
        _con_candidatos(sid)
        assert client.post(f"/api/detect/{sid}").status_code == 422
        r = client.post(f"/api/detect/{sid}?cached=true")
        assert r.status_code == 200, r.text
        j = r.json()
        assert [c["id"] for c in j["candidates"]] == ["cand-001", "cand-002"]
        assert [c["id"] for c in j["rejected"]] == ["cand-003"]
        assert j["candidates"][0]["selected"] is True
        assert j["candidates"][0]["dome_mesh_url"] == f"/data/sessions/{sid}/meshes/aneurysm_cand_001.vtp"
        assert j["candidates"][1]["center_mm"] == {"x": 30.0, "y": 1.0, "z": 2.0}
        assert j["candidates"][1]["channels"] == ["curvatura", "calibre"]
        assert j["candidates"][1]["rank"] == 2
        veto = j["rejected"][0]["veto"]
        assert veto["reason"] == "isla" and veto["label"] == "Resto de segmentación"
        assert veto["detail"] == "Pieza suelta de 12 mm³"
        assert j["rejected"][0]["rank"] == 1
        assert j["morphometry_invalidated"] is False

    def test_cached_sin_deteccion_guardada_404(self):
        sid = create_session()
        assert client.post(f"/api/detect/{sid}?cached=true").status_code == 404

    def test_cached_con_una_malla_de_candidato_perdida_404(self):
        sid = create_session()
        _con_candidatos(sid)
        (session_subdir(sid, "meshes") / "aneurysm_cand_002.vtp").unlink()
        assert client.post(f"/api/detect/{sid}?cached=true").status_code == 404

    def test_tras_reanudar_la_lista_es_la_guardada(self):
        sid = create_session()
        (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("x")
        _con_candidatos(sid)
        r = _guardar_y_reanudar(sid)
        j = client.post(f"/api/detect/{r['session_id']}?cached=true").json()
        assert [c["id"] for c in j["candidates"]] == ["cand-001", "cand-002"]
        assert j["candidates"][0]["dome_mesh_url"].startswith(f"/data/sessions/{r['session_id']}/")


class TestConfirmacionDeLesion:
    def test_la_confirmacion_del_origen_sigue_visible(self):
        """F1-250 (fila de la confirmación): `/current` buscaba por el id exacto
        y la sesión reanudada tiene otro."""
        sid = create_session()
        (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("x")
        db = _Local()
        db.add(LesionConfirmation(session_id=sid, source="candidate", x_mm=1.0, y_mm=2.0,
                                  z_mm=3.0, candidate_rank=1, n_candidates=2))
        db.commit(); db.close()
        r = _guardar_y_reanudar(sid)
        assert r["lesion_confirmed"] is True
        cur = client.get(f"/api/ground-truth/current?session_id={r['session_id']}").json()
        assert cur is not None and cur["candidate_rank"] == 1
