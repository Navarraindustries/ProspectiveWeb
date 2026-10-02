# -*- coding: utf-8 -*-
"""La diana sin morfometría es el candidato ELEGIDO, no el primero de la lista.

Perforantes y corredores caían en `detect.cand_001` si aún no había cuello
medido. El orden de la lista no es un diagnóstico: en IM_0055 la lesión
anotada llegó a salir 3.ª.
"""
from __future__ import annotations

from services.sessions import (create_session, measured_candidate_centroid,
                               write_states)


def _sesion_con_dos_candidatos(elegido: str = "") -> str:
    sid = create_session()
    write_states(sid, {
        "detect.n_candidates": "2",
        "detect.best_vtp_name": "aneurysm_cand_001.vtp",
        "detect.cand_001.centroid_x": "1", "detect.cand_001.centroid_y": "2",
        "detect.cand_001.centroid_z": "3",
        "detect.cand_002.centroid_x": "40", "detect.cand_002.centroid_y": "50",
        "detect.cand_002.centroid_z": "60",
        "detect.selected_candidate": elegido,
    })
    return sid


def test_apunta_al_elegido():
    assert measured_candidate_centroid(_sesion_con_dos_candidatos("cand-002")) == (40.0, 50.0, 60.0)


def test_sin_eleccion_el_primero():
    assert measured_candidate_centroid(_sesion_con_dos_candidatos()) == (1.0, 2.0, 3.0)


def test_una_eleccion_fuera_de_la_lista_vuelve_al_primero():
    assert measured_candidate_centroid(_sesion_con_dos_candidatos("cand-007")) == (1.0, 2.0, 3.0)


def test_sin_deteccion_no_hay_diana():
    assert measured_candidate_centroid(create_session()) is None


def test_perforantes_usan_el_elegido():
    from routers.perforators import _resolve_neck_origin
    assert _resolve_neck_origin(_sesion_con_dos_candidatos("cand-002")) == (40.0, 50.0, 60.0)


def test_un_descartado_elegido_es_la_diana():
    # Los descartados por un veto siguen a los aceptados (cand-003 aquí) y se
    # pueden medir: si el clínico eligió uno, la diana es ese y no el primero.
    sid = _sesion_con_dos_candidatos("cand-003")
    write_states(sid, {
        "detect.n_rejected": "1",
        "detect.cand_003.centroid_x": "7", "detect.cand_003.centroid_y": "8",
        "detect.cand_003.centroid_z": "9",
    })
    assert measured_candidate_centroid(sid) == (7.0, 8.0, 9.0)
