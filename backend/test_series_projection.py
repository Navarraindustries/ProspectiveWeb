"""Qué series se ofrecen como volumen 3D y cuáles se marcan como proyección."""
from __future__ import annotations

from routers.upload import _build_series_list
from services.sessions import create_session


def _serie(uid, modality, n, spacing=(1.0, 1.0, 1.0)):
    return {"series_uid": uid, "modality": modality, "n_slices": n, "series_description": uid,
            "spacing_x": spacing[0], "spacing_y": spacing[1], "spacing_z": spacing[2]}


def test_unas_pocas_imagenes_de_angiografia_no_son_un_volumen():
    # Visto en un estudio real: dos series «Snapshot» de 15 y 11 imágenes se
    # ofrecían como volúmenes 3D de 1 mm, junto a las 3D-RA de 384 cortes.
    series = _build_series_list(create_session(), [
        _serie("3dra", "XA", 384, (0.36, 0.36, 0.36)),
        _serie("snapshot15", "XA", 15),
        _serie("snapshot11", "XA", 11),
        _serie("ct-fino", "CT", 20, (0.5, 0.5, 1.0)),
    ])
    por_id = {s.series_id: s for s in series}
    assert not por_id["3dra"].is_projection
    assert por_id["snapshot15"].is_projection and por_id["snapshot11"].is_projection
    assert "no un volumen 3D" in por_id["snapshot15"].projection_warning
    assert not por_id["ct-fino"].is_projection          # una pila corta de TC sí es un volumen
    assert series[0].series_id == "3dra"                # y el volumen de verdad va primero
