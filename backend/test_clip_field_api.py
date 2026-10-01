"""El mapa de calor por la API: campo, resumen y veredicto."""
from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from services import devices
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir, write_state
from test_clip_field import _saco, _tubo

client = TestClient(app, raise_server_exceptions=True)


def _sesion(con_saco: bool = True, neck_mm: float = 6.0) -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    write_vtp(_tubo(), meshes / "vessel_tree.vtp")
    if con_saco:
        write_vtp(_saco(), meshes / "aneurysm_sac.vtp")
        write_state(sid, "morpho.sac_vtp_name", "aneurysm_sac.vtp")
    for k, v in {"morpho.neck_mm": neck_mm, "morpho.axis_x": 0.0, "morpho.axis_y": 0.0, "morpho.axis_z": 1.0,
                 "morpho.neck_origin_x": 0.0, "morpho.neck_origin_y": 0.0, "morpho.neck_origin_z": 0.0}.items():
        write_state(sid, k, str(v))
    return sid


def _primer_clip_id() -> str:
    """Un clip del catálogo con ficha (fuerza y hoja conocidas)."""
    return client.get("/api/clips").json()[0]["id"]


def _campo(sid: str, clip_id: str, pos=(0.0, 0.0, 0.0), rot: float = 0.0):
    return client.post(f"/api/clips/field/{sid}", json={
        "session_id": sid,
        "placements": [{"clip_id": clip_id, "position": {"x": pos[0], "y": pos[1], "z": pos[2]},
                        "normal": [0.0, 0.0, 1.0], "rotation_deg": rot}],
    })


class TestCampo:
    def test_devuelve_la_malla_con_tres_arrays_y_el_resumen(self):
        sid = _sesion()
        r = _campo(sid, _primer_clip_id())
        assert r.status_code == 200, r.text
        j = r.json()
        assert "clip_field.vtp" in j["field_mesh_url"] and "?v=" in j["field_mesh_url"]
        assert j["scalars"] == {"coverage": "uint8", "pressure_g_mm2": "float32", "colors": "uint8x3"}
        s = j["summary"]
        assert s["covered_pct"] > 0 and s["verdict"] in ("ok", "warn", "fail")
        assert len(s["window_g_mm2"]) == 4 and s["note"].startswith("Estimación geométrica")
        assert s["criteria"] and all({"key", "label", "verdict", "detail"} <= set(c) for c in s["criteria"])
        poly = read_vtp(session_subdir(sid, "meshes") / "clip_field.vtp")
        assert poly.GetPointData().GetArray("colors").GetNumberOfComponents() == 3

    def test_mover_el_clip_fuera_del_cuello_pinta_cuello_residual(self):
        sid = _sesion()
        cid = _primer_clip_id()
        bien = _campo(sid, cid).json()["summary"]
        # A 20 mm por encima del cuello: a 6 mm el clip seguiría dentro del saco
        # esférico (diámetro 10 mm) y aún tocaría pared.
        lejos = _campo(sid, cid, pos=(0.0, 0.0, 20.0)).json()["summary"]
        assert lejos["covered_pct"] < bien["covered_pct"]
        assert lejos["pressure_verdict"] == "sin_contacto" and lejos["verdict"] == "fail"

    def test_girar_el_clip_cambia_la_cobertura(self):
        sid = _sesion()
        cid = "navarro:t1:0:13.0"
        a = _campo(sid, cid, rot=0.0).json()["summary"]
        b = _campo(sid, cid, rot=90.0).json()["summary"]
        # Un clip de 13 mm cubre el cuello de 6 mm a cualquier giro, así que el
        # porcentaje puede coincidir; lo que el giro cambia es qué pared pinza
        # (a lo largo de la arteria o a través de ella), y eso se ve en el área.
        assert (a["covered_pct"], a["contact_area_mm2"]) != (b["covered_pct"], b["contact_area_mm2"])

    def test_varios_clips_suman_su_fuerza(self):
        sid = _sesion()
        cid = _primer_clip_id()
        body = {"session_id": sid, "placements": [
            {"clip_id": cid, "position": {"x": 0.0, "y": -1.5, "z": 0.0}, "normal": [0, 0, 1], "rotation_deg": 0.0},
            {"clip_id": cid, "position": {"x": 0.0, "y": 1.5, "z": 0.0}, "normal": [0, 0, 1], "rotation_deg": 0.0},
        ]}
        s = client.post(f"/api/clips/field/{sid}", json=body).json()["summary"]
        uno = _campo(sid, cid).json()["summary"]
        assert s["force_g"] == 2 * uno["force_g"]

    def test_un_clip_con_margen_sale_ok_o_warn(self):
        # 13 mm de hoja sobre un cuello de 6 mm: margen de sobra para cerrarlo entero.
        s = _campo(_sesion(), "navarro:t1:0:13.0").json()["summary"]
        assert s["verdict"] in ("ok", "warn"), s
        assert s["pressure_verdict"] != "sin_contacto" and s["covered_pct"] >= 90

    def test_el_marco_de_respaldo_respeta_el_sentido_de_la_mordaza_navarro(self):
        # La T4 (fenestrada) usa el marco de diseño; la T1 se lee de la malla. Las dos
        # apuntan la mordaza a −X: desplazadas +2 mm, el cuello que sobra queda más
        # allá de la punta (no alcanzado), nunca detrás de la bisagra (residual).
        sid = _sesion()
        for cid in ("navarro:t1:0:7.0", "navarro:t4:0:7.0:5.0"):
            s = _campo(sid, cid, pos=(2.0, 0.0, 0.0)).json()["summary"]
            assert s["unreached_pct"] > 0 and s["residual_pct"] == 0.0, (cid, s)

    def test_la_arteria_madre_no_cuenta_como_cuello_no_alcanzado(self):
        # Un clip corto paralelo a la arteria deja pared de vaso más allá de la punta;
        # eso no es cuello: lo no alcanzado se juzga solo dentro del disco del cuello.
        s = _campo(_sesion(), "navarro:t1:0:7.0").json()["summary"]
        assert s["unreached_pct"] <= 20, s


class TestNegativas:
    def test_sin_saco_aislado_409_y_dice_morfometria(self):
        r = _campo(_sesion(con_saco=False), _primer_clip_id())
        assert r.status_code == 409 and "Morfometría" in r.json()["detail"]

    def test_sin_cuello_medido_409(self):
        r = _campo(_sesion(neck_mm=0.0), _primer_clip_id())
        assert r.status_code == 409 and "cuello" in r.json()["detail"].lower()

    def test_sin_colocaciones_409(self):
        sid = _sesion()
        r = client.post(f"/api/clips/field/{sid}", json={"session_id": sid, "placements": []})
        assert r.status_code == 409

    def test_sesion_inexistente_404(self):
        r = client.post("/api/clips/field/no-existe", json={"session_id": "no-existe", "placements": []})
        assert r.status_code == 404

    def test_clip_importado_sin_ficha_no_estima_presion(self):
        sid = _sesion()
        meshes = session_subdir(sid, "meshes")
        write_vtp(devices.make_clip_shaped(10.0), meshes / "custom_clip_0.vtp")
        s = _campo(sid, "custom:0").json()["summary"]
        assert s["force_g"] == 0.0 and s["criteria"] == [] and "sin ficha" in s["note"]
        # Pinza el cuello entero: la presión es desconocida, no «sin contacto», y lo
        # desconocido avisa en vez de suspender.
        assert s["covered_pct"] >= 90 and s["contact_area_mm2"] > 0
        assert s["pressure_verdict"] == "sin_fuerza" and s["verdict"] == "warn"

    def test_un_importado_delante_no_deja_el_veredicto_sin_criterios(self):
        sid = _sesion()
        write_vtp(devices.make_clip_shaped(10.0), session_subdir(sid, "meshes") / "custom_clip_0.vtp")
        en_cuello = {"position": {"x": 0.0, "y": 0.0, "z": 0.0}, "normal": [0, 0, 1], "rotation_deg": 0.0}
        solo = _campo(sid, "navarro:t1:0:13.0").json()["summary"]
        mixto = client.post(f"/api/clips/field/{sid}", json={"session_id": sid, "placements": [
            {"clip_id": "custom:0", **en_cuello}, {"clip_id": "navarro:t1:0:13.0", **en_cuello}]}).json()["summary"]
        assert mixto["criteria"] == solo["criteria"] and mixto["criteria"]
        assert mixto["verdict"] == solo["verdict"]
        assert "solo cuenta la fuerza de los clips con ficha" in mixto["note"]
