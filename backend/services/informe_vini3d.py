"""VINI 3D en el informe: el pullback del IVUS virtual, sus medidas y dos figuras.

En pantalla el IVUS virtual se ve junto al recorrido; el informe es lo que llega
al médico, así que lleva lo mismo en papel:

- la vista longitudinal (la arteria «estirada» a lo largo de la línea central)
  con los bordes de la luz, la MLA, las referencias, las ramas visibles y el
  dispositivo (el stent desplegado o, si no hay, el flow diverter propuesto);
- el corte transversal en la MLA con su contorno y sus diámetros;
- las medidas, las ramas que caen dentro del dispositivo, la aposición y, si
  se superpuso un estudio anterior en Seguimiento, la comparación.

Las figuras se dibujan aquí con PIL a partir de la pila guardada y del JSON
del pullback: el informe no depende de que haya un visor abierto.
"""
from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

#: Colores de las figuras (sobre fondo de imagen en grises).
LUZ = (64, 196, 255)
MLA = (255, 184, 0)
REF = (200, 200, 200)
RAMA = (255, 96, 96)
DISPOSITIVO = (190, 120, 255)
PREVIO = (255, 255, 255)

#: Ancho de la vista longitudinal en el PNG.
ANCHO_L_PX = 900


@dataclass
class Vini3d:
    datos: dict[str, Any]                       # el JSON del pullback (como la API, sin la URL)
    pila: np.ndarray | None                     # (n, tam, tam) uint8
    ramas: list[dict[str, Any]] = field(default_factory=list)
    suelo_ramas_mm: float | None = None
    #: El dispositivo que se pinta: {"tipo": "stent"|"fd", "desde", "hasta", "nombre"}.
    dispositivo: dict[str, Any] | None = None
    comparacion: dict[str, Any] | None = None
    vista_l_png: bytes | None = None
    corte_png: bytes | None = None

    @property
    def longitud_mm(self) -> float:
        secs = self.datos.get("sections") or []
        return float(secs[-1]["arc_mm"]) if secs else 0.0

    def ramas_en_dispositivo(self) -> list[dict[str, Any]]:
        d = self.dispositivo
        if not d:
            return []
        return [r for r in self.ramas if d["desde"] <= r["arc_mm"] <= d["hasta"]]


# ── Datos ──────────────────────────────────────────────────────────────────── #

def _plan_fd(session_id: str) -> dict[str, Any] | None:
    """El flow diverter que propone el dimensionado (el primero que encaja)."""
    from routers.centerline import _run_fd_sizing
    from services.numero import cifra
    from services.sessions import session_subdir

    m = session_subdir(session_id, "meshes")
    try:
        r = _run_fd_sizing(session_id, m / "vessel_tree.vtp", m / "centerline_points.npz")
    except ValueError:
        return None                       # sin morfometría no hay plan
    opcion = next((o for o in r.options if o.fits), None)
    if opcion is None:
        return None
    return {"tipo": "fd", "desde": float(opcion.deploy_arc_mm[0]), "hasta": float(opcion.deploy_arc_mm[1]),
            "nombre": f"{opcion.name} {cifra(opcion.diameter_mm, 2)} × {cifra(opcion.length_mm)} mm (propuesto)",
            "cuello": [float(x) for x in r.neck_arc_mm]}


def _comparacion(session_id: str) -> dict[str, Any] | None:
    """La comparación con el estudio anterior, si se calculó y sigue valiendo."""
    from routers.ivus import COMPARA, registro_guardado
    from services.sessions import session_subdir

    reg = registro_guardado(session_id)
    f = session_subdir(session_id, "meshes") / COMPARA
    if reg is None or not f.exists():
        return None
    try:
        g = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    datos = g.get("datos") or {}
    if datos.get("previous_session_id") != reg.get("previous_session_id"):
        return None
    # La clave guarda la matriz: si Seguimiento se rehízo después, ya no vale.
    if not str(g.get("clave", "")).endswith(json.dumps(reg["prev_to_curr"])):
        return None
    return datos


def datos_vini3d(session_id: str) -> Vini3d | None:
    """Todo lo de VINI 3D para el informe, o None si la sesión no tiene línea central."""
    from routers.ivus import PILA, SinLinea, obtener_pullback, ramas_de_la_linea
    from services.sessions import session_subdir

    try:
        datos = obtener_pullback(session_id)
    except SinLinea:
        return None
    pila = None
    f = session_subdir(session_id, "meshes") / PILA
    tam, n = int(datos.get("size_px") or 0), int(datos.get("n_sections") or 0)
    if f.exists() and tam and n and f.stat().st_size == n * tam * tam:
        pila = np.fromfile(f, dtype=np.uint8).reshape(n, tam, tam)
    ramas, suelo = ramas_de_la_linea(session_id)
    v = Vini3d(datos=datos, pila=pila, ramas=ramas, suelo_ramas_mm=suelo)
    st = datos.get("stent")
    if st:
        v.dispositivo = {"tipo": "stent", "desde": float(st["from_arc_mm"]), "hasta": float(st["to_arc_mm"]),
                         "nombre": "stent desplegado"}
    else:
        try:
            v.dispositivo = _plan_fd(session_id)
        except Exception:  # noqa: BLE001 — el plan es un extra: sin él la sección sigue
            logger.warning("VINI 3D en el informe: no se pudo dimensionar el FD", exc_info=True)
    v.comparacion = _comparacion(session_id)
    if pila is not None:
        v.vista_l_png = vista_longitudinal_png(v)
        v.corte_png = corte_png(v)
    return v


# ── Figuras ────────────────────────────────────────────────────────────────── #

def _cruces_eje_u(contorno: list[list[float]]) -> tuple[float, float] | None:
    """Dónde corta el contorno la recta v = 0: el borde de la luz a cada lado."""
    if len(contorno) < 3:
        return None
    q = np.asarray(contorno, dtype=float)
    a, b = q, np.roll(q, -1, axis=0)
    cruza = (a[:, 1] <= 0) != (b[:, 1] <= 0)
    if not cruza.any():
        return None
    t = a[cruza, 1] / (a[cruza, 1] - b[cruza, 1])
    us = a[cruza, 0] + t * (b[cruza, 0] - a[cruza, 0])
    neg, pos = us[us < 0], us[us >= 0]
    if not len(neg) or not len(pos):
        return None
    return float(neg.max()), float(pos.min())        # los más cercanos a la línea


def vista_longitudinal_png(v: Vini3d) -> bytes:
    """La arteria estirada: columna i = sección i por la recta v = 0, eje vertical = u."""
    from PIL import Image, ImageDraw

    d, pila = v.datos, v.pila
    n, tam = pila.shape[0], pila.shape[1]
    fov = float(d["fov_mm"])
    largo = max(v.longitud_mm, 1e-3)
    alto = int(np.clip(ANCHO_L_PX * fov / largo, 160, 300))
    franja = 30                                     # debajo: el dispositivo y las ramas
    corte = pila[:, tam // 2, :].T                  # (tam: u, n: sección)
    img = Image.fromarray(np.ascontiguousarray(corte[::-1])).resize((ANCHO_L_PX, alto), Image.BILINEAR).convert("RGB")
    lienzo = Image.new("RGB", (ANCHO_L_PX, alto + franja), (16, 18, 22))
    lienzo.paste(img, (0, 0))
    dib = ImageDraw.Draw(lienzo)
    secs = d["sections"]
    x = lambda arc: (arc / largo) * (ANCHO_L_PX - 1)               # noqa: E731
    y = lambda u: (0.5 - u / fov) * (alto - 1)                     # noqa: E731  u = +fov/2 arriba

    for lado in (0, 1):
        tramo: list[tuple[float, float]] = []
        for s in secs:
            c = _cruces_eje_u(s.get("contour") or [])
            if c is None or not s.get("valid"):
                if len(tramo) > 1:
                    dib.line(tramo, fill=LUZ, width=2)
                tramo = []
                continue
            tramo.append((x(s["arc_mm"]), y(c[lado])))
        if len(tramo) > 1:
            dib.line(tramo, fill=LUZ, width=2)
    comp = v.comparacion
    if comp:
        for lado in (0, 1):
            pts = []
            for s in comp.get("sections") or []:
                c = _cruces_eje_u(s.get("contour") or [])
                if c is not None and s.get("valid"):
                    pts.append((x(s["arc_mm"]), y(c[lado])))
            for k in range(0, len(pts) - 1, 2):               # discontinua
                dib.line(pts[k:k + 2], fill=PREVIO, width=1)

    r = d.get("summary") or {}
    for arc, color in ((r.get("ref_prox_arc_mm"), REF), (r.get("ref_dist_arc_mm"), REF), (r.get("mla_arc_mm"), MLA)):
        if arc is not None:
            dib.line([(x(arc), 0), (x(arc), alto - 1)], fill=color, width=2 if color == MLA else 1)

    base = alto + 4
    disp = v.dispositivo
    if disp:
        if disp.get("cuello"):
            dib.rectangle([x(disp["cuello"][0]), base, x(disp["cuello"][1]), base + 6], fill=MLA)
        dib.rectangle([x(disp["desde"]), base + 9, x(disp["hasta"]), base + 15], fill=DISPOSITIVO)
    for rama in v.ramas:
        xr = x(rama["arc_mm"])
        dib.polygon([(xr, base + 16), (xr - 5, base + 22), (xr + 5, base + 22)], fill=RAMA)
    buf = io.BytesIO()
    lienzo.save(buf, format="PNG")
    return buf.getvalue()


def corte_png(v: Vini3d, lado_px: int = 360) -> bytes | None:
    """El corte transversal en la MLA, con el contorno de la luz y sus diámetros."""
    from PIL import Image, ImageDraw

    r = v.datos.get("summary")
    if not r:
        return None
    i = int(r["mla_index"])
    s = v.datos["sections"][i]
    fov = float(v.datos["fov_mm"])
    img = Image.fromarray(v.pila[i]).resize((lado_px, lado_px), Image.BILINEAR).convert("RGB")
    dib = ImageDraw.Draw(img)
    px = lambda p: ((p[0] / fov + 0.5) * lado_px, (p[1] / fov + 0.5) * lado_px)   # noqa: E731 fila = v
    comp = v.comparacion
    if comp and i < len(comp.get("sections") or []):
        prev = comp["sections"][i].get("contour") or []
        if len(prev) > 2:
            pts = [px(p) for p in prev]
            for k in range(0, len(pts) - 1, 2):
                dib.line(pts[k:k + 2], fill=PREVIO, width=1)
    cont = s.get("contour") or []
    if len(cont) > 2:
        dib.line([px(p) for p in cont] + [px(cont[0])], fill=LUZ, width=2)
    c = s.get("centroid")
    if c:
        for ang, largo, color in ((s.get("angle_min_deg"), s.get("d_min_mm"), MLA), (s.get("angle_max_deg"), s.get("d_max_mm"), REF)):
            if ang is None or not largo:
                continue
            dx, dy = np.cos(np.radians(ang)) * largo / 2, np.sin(np.radians(ang)) * largo / 2
            dib.line([px((c[0] - dx, c[1] - dy)), px((c[0] + dx, c[1] + dy))], fill=color, width=2)
    # Escala: 1 mm abajo a la izquierda.
    mm = lado_px / fov
    dib.line([(12, lado_px - 14), (12 + mm, lado_px - 14)], fill=(255, 255, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
