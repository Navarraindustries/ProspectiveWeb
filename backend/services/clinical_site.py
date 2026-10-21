"""La localización clínica traducida a la categoría de cada escala (PHASES, ELAPSS, UIATS).

Es la misma tabla que `siteFor` en frontend/src/components/morphometry/thresholds.ts
(test_clinical_site.py compara las dos). El backend la necesita para una cosa:
cuando se cambia la localización en Morfometría, saber qué puntuación guardada
deja de valer. Antes se borraban todas, también las que no cambiaban de
categoría (ACoP → Basilar sigue siendo «aca_pcom_posterior» en PHASES) y con
ellas lo marcado a mano en UIATS.
"""
from __future__ import annotations

SCALES = ("phases", "elapss", "uiats")

#: región → categoría de cada escala; None = esa escala no tiene categoría.
_MAP: dict[str, dict[str, str | None]] = {
    "unknown":       {"phases": None, "elapss": None, "uiats": None},
    "other":         {"phases": None, "elapss": None, "uiats": "other"},
    "mca":           {"phases": "mca", "elapss": "mca", "uiats": "other"},
    "aca_acom":      {"phases": "aca_pcom_posterior", "elapss": "ica_aca_acom", "uiats": "acom_pcom"},
    "ica":           {"phases": "ica", "elapss": "ica_aca_acom", "uiats": "other"},
    "pcom":          {"phases": "aca_pcom_posterior", "elapss": "pcom_posterior", "uiats": "acom_pcom"},
    "basilar":       {"phases": "aca_pcom_posterior", "elapss": "pcom_posterior", "uiats": "vertebrobasilar"},
    "basilar_tip":   {"phases": "aca_pcom_posterior", "elapss": "pcom_posterior", "uiats": "basilar_bifurcation"},
    "basilar_trunk": {"phases": "aca_pcom_posterior", "elapss": "pcom_posterior", "uiats": "vertebrobasilar"},
    "vertebral":     {"phases": "aca_pcom_posterior", "elapss": "pcom_posterior", "uiats": "vertebrobasilar"},
}


def _region(site: str | None) -> str:
    """Por palabras, como `region()` en thresholds.ts: así la lista separada
    (punta, tronco, AICA) cae donde debe sin tocar esto."""
    s = (site or "").strip().lower()
    if not s or s.startswith("desconocida"):
        return "unknown"
    if s.startswith("otra"):
        return "other"
    if s.startswith("acm") or "cerebral media" in s:
        return "mca"
    if s.startswith("acop") or "comunicante posterior" in s:
        return "pcom"
    if s.startswith("aca") or "acoa" in s or "comunicante anterior" in s:
        return "aca_acom"
    if s.startswith("aci") or "carótida" in s:
        return "ica"
    if "basilar" in s:
        punta = "punta" in s
        tronco = "tronco" in s or "aica" in s
        if punta and not tronco:
            return "basilar_tip"
        if tronco and not punta:
            return "basilar_trunk"
        return "basilar"
    if "aica" in s:
        return "basilar_trunk"
    if "pica" in s or "vertebral" in s:
        return "vertebral"
    return "unknown"


def site_category(scale: str, site: str | None) -> str | None:
    """La categoría de `scale` para la localización clínica, o None si no tiene."""
    return _MAP[_region(site)][scale]
