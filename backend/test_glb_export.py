"""Exportación GLB (services/glb_export.py): un fichero glTF 2.0 válido, en
metros y centrado, con un objeto por malla y sin datos del paciente."""
from __future__ import annotations

import struct

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.glb_export import GlbPart, build_glb, read_glb_json
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_states

client = TestClient(app, raise_server_exceptions=True)


def _esfera(r=5.0, centro=(100.0, 50.0, 20.0)):
    s = vtk.vtkSphereSource(); s.SetRadius(r); s.SetCenter(*centro)
    s.SetThetaResolution(16); s.SetPhiResolution(16); s.Update()
    return s.GetOutput()


def _posiciones(data: bytes, gltf: dict, mesh: int) -> np.ndarray:
    """Lee de vuelta las posiciones de una malla desde el bloque binario."""
    jlen = struct.unpack_from("<I", data, 12)[0]
    bin_start = 20 + jlen + 8
    acc = gltf["accessors"][gltf["meshes"][mesh]["primitives"][0]["attributes"]["POSITION"]]
    bv = gltf["bufferViews"][acc["bufferView"]]
    raw = data[bin_start + bv["byteOffset"]: bin_start + bv["byteOffset"] + bv["byteLength"]]
    return np.frombuffer(raw, np.float32).reshape(-1, 3)


def test_es_un_glb_valido_con_un_objeto_por_malla():
    data = build_glb([GlbPart("Vaso", _esfera(), (0.6, 0.7, 0.8), 0.5),
                      GlbPart("Saco", _esfera(2.0, (104, 50, 20)), (0.2, 0.8, 0.4))])
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and total == len(data) and len(data) % 4 == 0
    g = read_glb_json(data)
    assert [n["name"] for n in g["nodes"]] == ["Vaso", "Saco"]
    assert g["materials"][0]["alphaMode"] == "BLEND"
    assert "alphaMode" not in g["materials"][1]
    assert g["asset"] == {"version": "2.0", "generator": "ProspectiveWeb"}
    # Cada índice apunta a un vértice que existe.
    for m in g["meshes"]:
        prim = m["primitives"][0]
        assert g["accessors"][prim["indices"]]["count"] % 3 == 0


def test_en_metros_y_centrado():
    data = build_glb([GlbPart("Vaso", _esfera(5.0, (100, 50, 20)), (1, 1, 1))])
    g = read_glb_json(data)
    p = _posiciones(data, g, 0)
    assert np.abs(p).max() == pytest.approx(0.005, abs=1e-4)      # 5 mm = 0,005 m
    assert np.allclose((p.min(0) + p.max(0)) / 2, 0, atol=1e-5)    # centrado
    acc = g["accessors"][0]
    assert acc["max"][0] == pytest.approx(float(p[:, 0].max()))      # min/max obligatorios


def test_sin_triangulos_no_hay_fichero():
    with pytest.raises(ValueError):
        build_glb([GlbPart("Nada", vtk.vtkPolyData(), (1, 1, 1))])


class TestEndpoint:
    def test_exporta_vaso_saco_y_dispositivos(self):
        sid = create_session()
        m = session_subdir(sid, "meshes")
        write_vtp(_esfera(), m / "vessel_tree.vtp")
        write_vtp(_esfera(2.0, (104, 50, 20)), m / "aneurysm_sac.vtp")
        write_vtp(_esfera(0.5, (106, 50, 20)), m / "clips_placed.vtp")
        r = client.post(f"/api/export/glb/{sid}")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["parts"] == ["Vaso", "Saco", "Clip"] and j["size_kb"] > 0
        data = (session_subdir(sid, "exports") / "escena.glb").read_bytes()
        assert [n["name"] for n in read_glb_json(data)["nodes"]] == ["Vaso", "Saco", "Clip"]

    def test_sin_saco_usa_el_candidato_elegido(self):
        sid = create_session()
        m = session_subdir(sid, "meshes")
        write_vtp(_esfera(), m / "vessel_tree.vtp")
        write_vtp(_esfera(2.0), m / "aneurysm_cand_001.vtp")
        write_states(sid, {"detect.n_candidates": "1", "detect.best_vtp_name": "aneurysm_cand_001.vtp",
                           "detect.cand_001.vtp_name": "aneurysm_cand_001.vtp"})
        j = client.post(f"/api/export/glb/{sid}").json()
        assert j["parts"] == ["Vaso", "Candidato"]

    def test_sin_mallas(self):
        assert client.post(f"/api/export/glb/{create_session()}").status_code == 422
