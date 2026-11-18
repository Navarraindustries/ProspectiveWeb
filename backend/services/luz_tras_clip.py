"""Cuánta luz queda en la arteria madre y en las ramas con el clip cerrado.

Qué se mide
-----------
La oclusión (services/clip_outcome.py) dice cuánto aneurisma queda. La otra
mitad de un clipaje es lo que NO debe ocluirse: la arteria madre y las ramas
que nacen junto al cuello. Un clip demasiado proximal, o girado, pinza la madre;
uno largo alcanza una rama. Los simuladores docentes lo penalizan y ningún
producto clínico lo da como número.

Al cerrarse, las hojas aplastan lo que hay entre ellas sobre la línea de
cierre, y lo que queda del lado del domo sale de la circulación. Así que, en el
marco del propio clip (pose_transform: hojas a lo largo de X, cierre a lo largo
de Y, normal de la hoja en Z), la MORDAZA es la región

    x dentro de la extensión de las hojas,
    |y| <= apertura / 2   (la apertura con que se aplicó: el cuello + un margen),
    z >= el canto inferior de la hoja.

La luz que cae ahí dentro se pierde. Se mide:

- en la arteria madre, sección a sección sobre la línea central (las mismas
  secciones del IVUS virtual), el % del área que queda libre;
- en cada origen de rama visible cercano, el % de una esfera de su calibre que
  queda fuera de la mordaza.

Lo que no es
------------
Geometría, no mecánica: no deforma la pared ni el vaso vecino, que en la
realidad se aparta algo. La apertura es una suposición (el cuello más medio
milímetro por lado) y se dice. La ventana de un clip fenestrado se respeta
cuando el catálogo da su calibre.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import vtk

logger = logging.getLogger(__name__)

#: Margen a cada lado del cuello con que se abre la mordaza al aplicarla.
MARGEN_APERTURA_MM = 0.5
#: Hasta dónde se miran secciones y ramas más allá del alcance de la mordaza.
MARGEN_BUSQUEDA_MM = 4.0
#: Por debajo de esta pérdida la sección se da por intacta (ruido de muestreo).
PERDIDA_MINIMA_PCT = 0.5
#: Una línea que avanza a menos de 60° de la normal del clip está cruzando el cuello.
COS_CRUCE = 0.5


@dataclass
class Mordaza:
    """La región que cierra un clip, en su marco local, y cómo llevar puntos a él."""
    mundo_a_local: np.ndarray            # 4×4
    x0: float
    x1: float
    medio_y: float                       # apertura / 2
    z_min: float                         # canto inferior de la hoja
    posicion: np.ndarray                 # mundo
    ventana_x: float | None = None       # centro de la ventana (fenestrado)
    ventana_r: float = 0.0
    subida: float = 0.0                  # desplazamiento a lo largo de la normal (hacia el domo)

    def subido(self, mm: float) -> "Mordaza":
        from dataclasses import replace
        return replace(self, subida=float(mm))

    @property
    def normal(self) -> np.ndarray:
        """La normal de la hoja en el mundo (el eje z local)."""
        n = self.mundo_a_local[2, :3]
        return n / (np.linalg.norm(n) or 1.0)

    def cruza_el_cuello(self, centro: np.ndarray, tangente: np.ndarray) -> bool:
        """La línea pasa aquí por el cuello: su centro cae en la mordaza y avanza a lo
        largo de la normal del clip. Esa sección es el cuello que el clip SÍ debe
        cerrar, no la arteria madre (una línea que acaba dentro del saco lo cruza)."""
        return bool(self.dentro(centro[None, :])[0]) and abs(float(np.dot(tangente, self.normal))) >= COS_CRUCE

    @property
    def alcance_mm(self) -> float:
        return max(abs(self.x0), abs(self.x1)) + self.medio_y

    def _local(self, puntos_mundo: np.ndarray) -> np.ndarray:
        return (np.c_[puntos_mundo, np.ones(len(puntos_mundo))] @ self.mundo_a_local.T)[:, :3]

    def _huella(self, x, y, z) -> np.ndarray:
        m = (x >= self.x0) & (x <= self.x1) & (np.abs(y) <= self.medio_y)
        if self.ventana_x is not None and self.ventana_r > 0:
            m &= (x - self.ventana_x) ** 2 + z ** 2 > self.ventana_r ** 2
        return m

    def dentro(self, puntos_mundo: np.ndarray) -> np.ndarray:
        """Lo que la mordaza cierra: entre las hojas, desde su canto inferior hacia el domo."""
        x, y, z = self._local(puntos_mundo).T
        z = z - self.subida
        return self._huella(x, y, z) & (z >= self.z_min)

    def lado_del_domo(self, puntos_mundo: np.ndarray) -> np.ndarray:
        """Entre las hojas y por encima del plano de cierre: es aneurisma (la boca del
        cuello), no arteria. El clip debe cerrarlo y no cuenta como luz perdida."""
        x, y, z = self._local(puntos_mundo).T
        z = z - self.subida
        return self._huella(x, y, z) & (z >= 0.0)


def mordaza_de(posicion, normal, giro_deg: float, local: vtk.vtkPolyData,
               cuello_mm: float, fenestracion_mm: float = 0.0,
               largo_hoja_mm: float = 0.0, alto_hoja_mm: float = 0.0) -> Mordaza:
    """La mordaza de un clip colocado.

    Las hojas salen de las medidas del catálogo cuando las hay: la malla de un
    NAVARRO lleva el muelle y el cuerpo (de −3,5 a +17,8 mm en X para uno de
    7 mm), y sus límites inflarían la mordaza hasta medio clip. La mordaza va
    centrada en el origen del clip, que es el centro de la mordaza
    (`ClipPlacement.position`). Sin catálogo (un clip importado) quedan los
    límites de su malla.
    """
    from services.devices import pose_transform

    t = pose_transform(tuple(posicion), tuple(normal), float(giro_deg))
    m = np.array([[t.GetMatrix().GetElement(i, j) for j in range(4)] for i in range(4)])
    b = local.GetBounds()
    if largo_hoja_mm > 0:
        x0, x1 = -largo_hoja_mm / 2.0, largo_hoja_mm / 2.0
    else:
        x0, x1 = float(b[0]), float(b[1])
    z_min = max(float(b[4]), -alto_hoja_mm / 2.0) if alto_hoja_mm > 0 else float(b[4])
    ventana_x = x0 + fenestracion_mm / 2.0 if fenestracion_mm > 0 else None   # nace junto a la bisagra
    return Mordaza(mundo_a_local=np.linalg.inv(m), x0=x0, x1=x1,
                   medio_y=float(cuello_mm) / 2.0 + MARGEN_APERTURA_MM, z_min=z_min,
                   posicion=np.asarray(posicion, float), ventana_x=ventana_x, ventana_r=fenestracion_mm / 2.0)


def _dentro_de_alguna(mordazas: list[Mordaza], pts: np.ndarray) -> np.ndarray:
    m = np.zeros(len(pts), dtype=bool)
    for z in mordazas:
        m |= z.dentro(pts)
    return m


# ── Arteria madre ─────────────────────────────────────────────────────────── #

@dataclass
class SeccionLuz:
    arc_mm: float
    area_mm2: float
    libre_mm2: float
    #: Muestras de la luz en el mundo y área de la sección entera (para recalcular
    #: con el clip desplazado sin volver a cortar la malla). No se serializan.
    muestras: np.ndarray | None = field(default=None, repr=False)
    area_seccion_mm2: float = 0.0

    @property
    def libre_pct(self) -> float:
        return 100.0 * self.libre_mm2 / self.area_mm2 if self.area_mm2 > 0 else 100.0


def _muestras_en_contorno(contorno: np.ndarray, area: float) -> np.ndarray:
    """Puntos (u, v) en rejilla regular dentro del contorno."""
    from matplotlib.path import Path

    paso = float(np.clip(np.sqrt(max(area, 1e-6)) / 30.0, 0.02, 0.1))
    lo, hi = contorno.min(axis=0), contorno.max(axis=0)
    us = np.arange(lo[0] + paso / 2, hi[0], paso)
    vs = np.arange(lo[1] + paso / 2, hi[1], paso)
    gu, gv = np.meshgrid(us, vs)
    cand = np.c_[gu.ravel(), gv.ravel()]
    return cand[Path(contorno).contains_points(cand)]


def luz_de_la_madre(puntos: np.ndarray, arco: np.ndarray, vaso: vtk.vtkPolyData,
                    mordazas: list[Mordaza], en_lesion: np.ndarray | None = None) -> list[SeccionLuz]:
    """Las secciones de la línea al alcance de algún clip, con su luz libre."""
    from services.ivus_virtual import marcos, medir_seccion

    p = np.asarray(puntos, dtype=np.float64)
    if len(p) < 3 or not mordazas:
        return []
    t, u, v = marcos(p)
    out: list[SeccionLuz] = []
    for i in range(len(p)):
        if en_lesion is not None and en_lesion[i]:
            continue
        cerca = any(np.linalg.norm(p[i] - z.posicion) <= z.alcance_mm + MARGEN_BUSQUEDA_MM for z in mordazas)
        if not cerca or any(z.cruza_el_cuello(p[i], t[i]) for z in mordazas):
            continue
        s = medir_seccion(vaso, p[i], t[i], u[i], v[i], float(arco[i]))
        if not s.valida or not s.area_mm2:
            continue
        q = np.asarray(s.contorno, dtype=float)
        muestras = _muestras_en_contorno(q, s.area_mm2)
        if len(muestras) == 0:
            continue
        mundo = p[i] + muestras[:, :1] * u[i] + muestras[:, 1:] * v[i]
        sec = _medir(float(arco[i]), mundo, float(s.area_mm2), mordazas)
        if sec is not None:
            out.append(sec)
    return out


def _medir(arc_mm: float, mundo: np.ndarray, area_seccion: float, mordazas: list[Mordaza]) -> SeccionLuz | None:
    """La luz libre de una sección. La boca del aneurisma no es arteria: sale de la
    cuenta. Lo perdido es lo que la hoja pinza por debajo del plano de cierre."""
    domo = np.zeros(len(mundo), dtype=bool)
    for z in mordazas:
        domo |= z.lado_del_domo(mundo)
    arteria = ~domo
    if not arteria.any():
        return None
    area = area_seccion * float(arteria.mean())
    perdida = float((_dentro_de_alguna(mordazas, mundo) & arteria).sum()) / float(arteria.sum())
    return SeccionLuz(arc_mm=arc_mm, area_mm2=area, libre_mm2=area * (1.0 - perdida),
                      muestras=mundo, area_seccion_mm2=area_seccion)


#: Hasta cuánto se busca subir el clip, y con qué paso.
SUBIDA_MAXIMA_MM = 5.0
SUBIDA_PASO_MM = 0.25


def subida_para_liberar(secciones: list[SeccionLuz], mordazas: list[Mordaza]) -> float | None:
    """Cuántos mm hay que subir los clips (a lo largo de la normal de la hoja, hacia
    el domo) para que la madre no pierda luz. 0 si ya no la pierde; None si no se
    libera en SUBIDA_MAXIMA_MM."""
    def peor(mz):
        libres = [m.libre_pct for s in secciones if s.muestras is not None
                  for m in [_medir(s.arc_mm, s.muestras, s.area_seccion_mm2, mz)] if m is not None]
        return min(libres) if libres else 100.0
    for k in np.arange(0.0, SUBIDA_MAXIMA_MM + 1e-9, SUBIDA_PASO_MM):
        if 100.0 - peor([z.subido(float(k)) for z in mordazas]) < PERDIDA_MINIMA_PCT:
            return float(k)
    return None


# ── Ramas ─────────────────────────────────────────────────────────────────── #

@dataclass
class RamaLuz:
    index: int
    posicion: tuple[float, float, float]
    calibre_mm: float
    distancia_mm: float                  # del origen al centro del clip más cercano
    libre_pct: float


def _bola_unidad(n: int = 13) -> np.ndarray:
    g = np.linspace(-1.0, 1.0, n)
    x, y, z = np.meshgrid(g, g, g)
    p = np.c_[x.ravel(), y.ravel(), z.ravel()]
    return p[np.linalg.norm(p, axis=1) <= 1.0]


def luz_de_las_ramas(origenes, mordazas: list[Mordaza]) -> list[RamaLuz]:
    """Cada origen de rama al alcance: qué parte de una esfera de su calibre queda libre."""
    if not mordazas:
        return []
    bola = _bola_unidad()
    out: list[RamaLuz] = []
    for o in origenes:
        pos = np.asarray(o.position, dtype=float)
        d = min(float(np.linalg.norm(pos - z.posicion)) for z in mordazas)
        if not any(np.linalg.norm(pos - z.posicion) <= z.alcance_mm + MARGEN_BUSQUEDA_MM for z in mordazas):
            continue
        pts = pos + bola * (float(o.calibre_mm) / 2.0)
        libre = 100.0 * (1.0 - float(_dentro_de_alguna(mordazas, pts).mean()))
        out.append(RamaLuz(index=int(o.index), posicion=tuple(float(c) for c in pos),
                           calibre_mm=float(o.calibre_mm), distancia_mm=d, libre_pct=libre))
    out.sort(key=lambda r: r.libre_pct)
    return out


# ── Resumen ───────────────────────────────────────────────────────────────── #

@dataclass
class LuzTrasClip:
    secciones: list[SeccionLuz] = field(default_factory=list)
    ramas: list[RamaLuz] = field(default_factory=list)
    apertura_mm: float = 0.0
    sin_linea: bool = False
    #: mm que habría que subir el clip para liberar la madre (None: no se libera en 5 mm).
    subida_mm: float | None = 0.0
    resumen: str = ""

    @property
    def peor(self) -> SeccionLuz | None:
        return min(self.secciones, key=lambda s: s.libre_pct) if self.secciones else None


def resumir(r: LuzTrasClip) -> str:
    from services.numero import cifra

    partes = []
    if r.sin_linea:
        partes.append("Arteria madre: sin medir; extrae la línea central por la arteria madre "
                      "(con destino más allá del aneurisma) para medirla.")
    elif r.peor is None:
        partes.append("Arteria madre: la línea central no pasa al alcance del clip.")
    elif 100.0 - r.peor.libre_pct < PERDIDA_MINIMA_PCT:
        partes.append("Arteria madre: el clip no invade su luz.")
    else:
        s = r.peor
        partes.append(f"Arteria madre: en la sección más afectada (a {cifra(s.arc_mm, 1)} mm de la línea) "
                      f"queda el {cifra(s.libre_pct, 0)} % de la luz ({cifra(s.libre_mm2, 1)} de "
                      f"{cifra(s.area_mm2, 1)} mm²).")
        if r.subida_mm:
            partes.append(f"Subiendo el clip {cifra(r.subida_mm, 1)} mm hacia el domo la madre queda libre "
                          f"(a costa de más resto de cuello: vuelve a medir la oclusión).")
        elif r.subida_mm is None:
            partes.append("Subiendo el clip hasta 5 mm la madre no queda libre: prueba otro giro u otro clip.")
    tocadas = [b for b in r.ramas if 100.0 - b.libre_pct >= PERDIDA_MINIMA_PCT]
    if tocadas:
        partes.append(f"{len(tocadas)} rama{'s' if len(tocadas) > 1 else ''} con el origen dentro de la mordaza; "
                      f"la peor, Ø {cifra(tocadas[0].calibre_mm, 1)} mm, conserva el "
                      f"{cifra(tocadas[0].libre_pct, 0)} %.")
    elif r.ramas:
        partes.append("Ninguna rama visible cercana queda dentro de la mordaza.")
    return " ".join(partes)
