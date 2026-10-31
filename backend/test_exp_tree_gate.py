"""`scripts/exp_tree_gate.py`: selección de estudios y topes sin efecto."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))

import exp_tree_gate as etg

import services.mesh_components as mc


def _rec(study: str, *, has_ia: bool, tree: bool, status: str = "ok") -> dict:
    return {"study": study, "has_ia": has_ia, "status": status,
            "segment": {"components_info": {"looks_like_tree": tree}}}


def test_selecciona_los_sin_arbol_con_lesion_primero(tmp_path: Path):
    for rec in (_rec("010", has_ia=False, tree=False), _rec("002", has_ia=True, tree=False),
                _rec("003", has_ia=True, tree=True), _rec("004", has_ia=True, tree=False, status="error"),
                _rec("001", has_ia=False, tree=False)):
        (tmp_path / f"{rec['study']}.json").write_text(json.dumps(rec), encoding="utf-8")
    (tmp_path / "summary.json").write_text("{}", encoding="utf-8")
    assert etg.non_tree_studies(tmp_path) == ["002", "001", "010"]


def test_los_topes_quedan_sin_efecto_solo_en_el_proceso(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(mc, "MAX_TREE_VOLUME_MM3", 100_000.0)
    monkeypatch.setattr(mc, "MAX_TREE_THICKNESS_MM", 3.0)
    info = mc.ComponentInfo(index=0, n_points=10, volume_mm3=5e5, area_mm2=2.5e5, sphericity=0.2,
                            thickness_mm=4.0, extent_mm=300.0, centroid=(0.0, 0.0, 0.0))
    assert mc.looks_like_tree(info)[0] is False
    etg.disable_tree_gate()
    assert mc.looks_like_tree(info) == (True, "")
