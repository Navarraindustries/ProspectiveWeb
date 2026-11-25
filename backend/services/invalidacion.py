"""Lo que se midió sobre una malla o un volumen deja de valer cuando cambian.

Cada sitio que cambiaba la malla borraba una parte distinta de lo derivado:
resegmentar y recortar quitaban candidatos, morfometría, decisión y corredor,
pero dejaban los dispositivos con su oclusión y su cobertura, la línea central,
el IVUS y el seguimiento medidos sobre la malla anterior, y el
informe los imprimía. Cambiar de serie o preprocesar no borraba nada, y la
malla, el saco y el DICOM SEG seguían siendo de otro volumen.

Aquí se decide una sola vez qué cuelga de qué:

- `olvidar_lo_medido_en_la_malla`: la malla cambió (resegmentar, recortar,
  borrar, deshacer). Los puntos que eligió el cirujano (entrada y destino del
  abordaje, clips a medida de su biblioteca) se quedan.
- `olvidar_lo_hecho_sobre_el_volumen`: el volumen cambió (otra serie,
  preprocesar). Todo lo anterior, y además la malla misma.
"""
from __future__ import annotations

import logging
from pathlib import Path

from services.sessions import session_subdir, write_states

logger = logging.getLogger(__name__)

#: Ficheros de `meshes/` que se calculan sobre la malla del vaso.
ARCHIVOS_DE_LA_MALLA = (
    "centerline.vtp", "centerline_points.npz", "centerline_p10.vtp", "centerline_p10.npz",
    "cl_stent.vtp", "stent_deployed.vtp", "coils_placed.vtp",
    "clips_placed.vtp", "clip_field.vtp", "aneurysm_remnant.vtp",
    "perforators_risk.vtp", "ivus_pullback.u8", "ivus_pullback.json", "ivus_compare.json",
)
PATRONES_DE_LA_MALLA = ("anim_*.vtp",)

#: Claves del estado que describen algo medido sobre la malla y que no borra
#: ya la limpieza de la detección (candidatos, morfometría, saco, decisión y
#: puntuaciones) ni la del corredor.
#: No incluye el barrido de ramas (`branches.scan_json`): se hace a propósito una
#: vez, sobre el árbol entero al segmentar, y en coordenadas de mundo sigue
#: valiendo sobre la malla recortada (routers/segment.py). Ese va con el volumen.
CLAVES_DE_LA_MALLA = (
    "devices.clips", "devices.coils", "devices.stent", "devices.placed_clips.json",
    "followup.registro_json",
)

#: La malla misma y lo que solo sirve para hacerla: cambia con el volumen.
ARCHIVOS_DE_LA_SEGMENTACION = (
    "vessel_tree.vtp", "vessel_tree.suave.vtp", "detect_tree.vtp",
    "preview_mesh.vtp", "scissors_preview.vtp", "vessel_mask.npz",
)
CLAVES_DE_LA_SEGMENTACION = (
    "seg.mesh_url", "seg.n_vertices", "seg.n_faces", "seg.voxel_fraction",
    "seg.method", "seg.params", "seg.strategy", "seg.threshold_lower", "seg.threshold_upper",
    "seg.downsample_factor", "seg.fallback_note", "seg.detect_tree_for", "seg.neck_detail",
    "branches.scan_json",
)


def _borrar(meshes: Path, nombres: tuple[str, ...], patrones: tuple[str, ...] = ()) -> list[str]:
    borrados: list[str] = []
    rutas = [meshes / n for n in nombres] + [p for pat in patrones for p in meshes.glob(pat)]
    for ruta in rutas:
        try:
            if ruta.is_file():
                ruta.unlink()
                borrados.append(ruta.name)
        except OSError as exc:  # noqa: BLE001 — un fichero que no se deja borrar no detiene lo demás
            logger.warning("No se pudo borrar %s: %s", ruta.name, exc)
    return borrados


def olvidar_lo_medido_en_la_malla(session_id: str) -> list[str]:
    """Todo lo calculado sobre la malla del vaso. Devuelve los ficheros borrados."""
    from routers.detect import _clear_detection_state
    from routers.report import clear_corridor_analysis

    meshes = session_subdir(session_id, "meshes")
    # Candidatos, morfometría, saco, decisión, PHASES, ELAPSS y UIATS.
    _clear_detection_state(session_id, meshes, morphometry=True)
    clear_corridor_analysis(session_id)
    borrados = _borrar(meshes, ARCHIVOS_DE_LA_MALLA, PATRONES_DE_LA_MALLA)
    write_states(session_id, {k: "" for k in CLAVES_DE_LA_MALLA})
    if borrados:
        logger.info("Sesión %s: la malla cambió; borrado lo medido sobre ella: %s",
                    session_id, ", ".join(sorted(borrados)))
    return borrados


def olvidar_lo_hecho_sobre_el_volumen(session_id: str) -> list[str]:
    """La malla y todo lo medido sobre ella. Devuelve los ficheros borrados."""
    from services import mesh_backup

    borrados = olvidar_lo_medido_en_la_malla(session_id)
    meshes = session_subdir(session_id, "meshes")
    borrados += _borrar(meshes, ARCHIVOS_DE_LA_SEGMENTACION)
    write_states(session_id, {k: "" for k in CLAVES_DE_LA_SEGMENTACION})
    # El historial de recortes era de la malla que ya no está.
    mesh_backup.clear(session_id)
    logger.info("Sesión %s: el volumen cambió; la malla y lo medido sobre ella se descartan", session_id)
    return borrados
