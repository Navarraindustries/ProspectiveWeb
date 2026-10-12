"""Persist placed devices (clips / coils / stent) in session state so they
appear in the PDF report, the DICOM SR and restored sessions.

Stored as compact JSON under the `devices.*` state keys. Kept dependency-free
(only touches services.sessions) so report_generator can import it safely.
"""
from __future__ import annotations

import json
import logging

from services.sessions import read_state, write_state

logger = logging.getLogger(__name__)

_CLIPS_KEY = "devices.clips"
_COILS_KEY = "devices.coils"
_STENT_KEY = "devices.stent"


def _dump(session_id: str, key: str, value) -> None:
    try:
        write_state(session_id, key, json.dumps(value))
    except Exception as exc:  # noqa: BLE001 — persistence must never break planning
        logger.warning("Could not persist %s for %s: %s", key, session_id, exc)


def _load(session_id: str, key: str, default):
    raw = read_state(session_id, key, "")
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def save_clips(session_id: str, clips: list[dict]) -> None:
    """clips: [{index, name, position:[x,y,z], orientation:[x,y,z], is_custom}]"""
    _dump(session_id, _CLIPS_KEY, clips)


def save_coils(session_id: str, coils: list[dict]) -> None:
    """coils: [{index, name, position, coil_type, diameter_mm, length_cm, manufacturer}]"""
    _dump(session_id, _COILS_KEY, coils)


def save_stent(session_id: str, stent: dict | None) -> None:
    """stent: {name, diameter_mm, length_mm, coverage_pct, kind} or None to clear."""
    _dump(session_id, _STENT_KEY, stent or {})


def read_clips(session_id: str) -> list[dict]:
    v = _load(session_id, _CLIPS_KEY, [])
    return v if isinstance(v, list) else []


def read_coils(session_id: str) -> list[dict]:
    v = _load(session_id, _COILS_KEY, [])
    return v if isinstance(v, list) else []


def read_stent(session_id: str) -> dict:
    v = _load(session_id, _STENT_KEY, {})
    return v if isinstance(v, dict) else {}


#: La lista editable de clips del panel y su verificación (PlacedClipsState).
#: Va aparte de `devices.clips`, que es lo que imprime el informe: aquella es
#: la fila que se edita, esta lo que el plan colocó.
_PLACED_CLIPS_KEY = "devices.placed_clips.json"


def save_placed_clips(session_id: str, state: dict) -> None:
    _dump(session_id, _PLACED_CLIPS_KEY, state)


def read_placed_clips(session_id: str) -> dict | None:
    v = _load(session_id, _PLACED_CLIPS_KEY, None)
    return v if isinstance(v, dict) and v.get("clips") else None


#: F1-229: lo que se evaluó con los clips puestos —la oclusión y el mapa de
#: calor— para que el informe lo diga. Se calculaba en pantalla y se perdía; el
#: PDF no podía decir si el clip se había comprobado. Cada evaluación lleva la
#: huella de los clips con los que se hizo: si se mueven, deja de valer.
_CLIP_EVAL_KEYS = {"occlusion": "devices.clip_occlusion.json",
                   "field": "devices.clip_field.json"}


#: Una pose de clip para la huella: id, posición, giro y normal de la hoja.
ClipPose = tuple[str, list[float], float, list[float] | None]


def clips_fingerprint(clips: list[ClipPose], *, pose: bool = True) -> str:
    """La huella de una colocación: qué clip, dónde (al décimo de milímetro) y,
    con `pose`, cómo está orientado (giro al grado, normal a la centésima).

    El mapa de calor depende de la orientación: girar un clip sin moverlo y
    pulsar «Colocar» dejaba en el PDF una cobertura calculada para otra pose.
    La oclusión corta por la posición del clip más proximal a lo largo del eje
    del saco, así que para ella basta la posición (`pose=False`).
    """
    def _r(x, nd: int) -> float:
        # `+ 0.0` convierte -0.0 en 0.0: una componente de -0.0 (o un -0.004 que
        # redondea a -0.0) se escribía «-0.0» y partía la huella, y el informe
        # decía «no calculado» de un mapa válido.
        return round(float(x), nd) + 0.0

    def _fila(c: ClipPose):
        cid, pos, rot, normal = c
        fila = [str(cid), [_r(x, 1) for x in (pos or [])[:3]]]
        if pose:
            fila += [round(float(rot or 0.0)),
                     [_r(x, 2) for x in (normal or [])[:3]] or None]
        return fila
    return json.dumps(sorted((_fila(c) for c in clips), key=json.dumps))


def _placed_poses(session_id: str) -> list[ClipPose]:
    """Las poses de los clips colocados, como las guarda `save_clips`. El giro
    es `orientation[2]`; la normal, la que se guardó (None en sesiones
    anteriores a que se guardara: la huella con pose no coincidirá y el informe
    dirá «no calculado», que es lo prudente)."""
    out: list[ClipPose] = []
    for c in read_clips(session_id):
        ori = list(c.get("orientation") or [0.0, 0.0, 0.0])
        out.append((c.get("clip_id", c.get("name", "")), c.get("position"),
                    float(ori[2]) if len(ori) > 2 else 0.0, c.get("normal")))
    return out


def save_clip_evaluation(session_id: str, kind: str, record: dict,
                         clips: list[ClipPose] | None = None) -> None:
    """Guarda `record` con la huella de `clips` (por defecto, los colocados)."""
    pose = kind == "field"
    huella = clips_fingerprint(clips if clips is not None else _placed_poses(session_id),
                               pose=pose)
    _dump(session_id, _CLIP_EVAL_KEYS[kind], {**record, "fingerprint": huella})


def read_clip_evaluation(session_id: str, kind: str) -> dict | None:
    """La evaluación guardada, solo si se hizo con los clips que hay ahora."""
    v = _load(session_id, _CLIP_EVAL_KEYS[kind], None)
    if not isinstance(v, dict) or not read_clips(session_id):
        return None
    actual = clips_fingerprint(_placed_poses(session_id), pose=kind == "field")
    return v if v.get("fingerprint") == actual else None


def clear_devices(session_id: str) -> None:
    for k in (_CLIPS_KEY, _COILS_KEY, _STENT_KEY, _PLACED_CLIPS_KEY, *_CLIP_EVAL_KEYS.values()):
        write_state(session_id, k, "")


#: Device kind → (state key, mesh files written by its planner). The meshes are
#: deleted alongside the state so a cleared device also leaves the 3D viewer and
#: the STL export, not just the PDF.
DEVICE_KINDS: dict[str, tuple[str, tuple[str, ...]]] = {
    "clips":  (_CLIPS_KEY, ("clips_placed.vtp",)),
    "coils":  (_COILS_KEY, ("coils_placed.vtp",)),
    # Both stent planners share one state slot, so clearing either clears both
    # meshes — otherwise the report would describe a stent whose geometry is gone.
    "stent":  (_STENT_KEY, ("stent_deployed.vtp", "cl_stent.vtp")),
}


def clear_device(session_id: str, kind: str) -> None:
    """Forget one placed device kind ('clips' | 'coils' | 'stent')."""
    entry = DEVICE_KINDS.get(kind)
    if entry is None:
        raise ValueError(f"Unknown device kind: {kind!r}")
    write_state(session_id, entry[0], "")
    if kind == "clips":
        # Sin clips en el plan, la lista editable tampoco describe nada: si se
        # quedara, reanudar volvería a poner clips que se quitaron.
        write_state(session_id, _PLACED_CLIPS_KEY, "")
        # Y lo evaluado con ellos: volver a poner el mismo clip en el mismo
        # sitio resucitaba una oclusión o un mapa de calor de antes de quitarlo.
        for k in _CLIP_EVAL_KEYS.values():
            write_state(session_id, k, "")
