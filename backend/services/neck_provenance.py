"""De dónde sale el cuello: una sola regla para el informe, el pedido y el dossier.

El pedido de clip llamaba «estimado» a un cuello con punto marcado a mano (solo
contaba el borde) mientras el PDF lo daba por marcado: la misma medida salía con
dos procedencias en dos papeles del mismo caso, y el pedido proponía tallas
contiguas que el informe no justificaba. Un cuello es MARCADO si la persona puso
el borde o el punto a mano; si no, es una estimación a partir del saco.
"""

from __future__ import annotations

MARKED_SOURCES = ("manual", "rim")

_LABELS = {
    "rim": "medido sobre un borde marcado a mano",
    "manual": "medido con un punto de cuello marcado a mano",
}
ESTIMATED_LABEL = "estimado a partir del saco"


def neck_is_marked(source: str | None) -> bool:
    """True si el cuello lo marcó la persona (borde o punto)."""
    return (source or "") in MARKED_SOURCES


def neck_provenance_label(source: str | None) -> str:
    """La frase que completa «El cuello está …» en todos los documentos."""
    return _LABELS.get(source or "", ESTIMATED_LABEL)
