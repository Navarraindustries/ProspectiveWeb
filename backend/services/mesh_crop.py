"""Mesh region-of-interest (ROI) cropping — port of the desktop
prospective/processing/mesh_crop.py (A-02-05b).

Two non-destructive operations; neither modifies the input mesh:

  clip_box(poly, xmin, xmax, ymin, ymax, zmin, zmax)
      Keep geometry inside an axis-aligned bounding box (six chained plane clips).

  clip_sphere(poly, center, radius)
      Keep geometry inside a sphere (single vtkClipPolyData + vtkSphere).

Both use InsideOutOn so that f(p) < 0 (inside the box/sphere) is retained. Pass
invert=True at the router level to keep the OUTSIDE instead (remove a bad blob).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import vtk

logger = logging.getLogger(__name__)


def clip_box(
    poly: vtk.vtkPolyData,
    xmin: float, xmax: float,
    ymin: float, ymax: float,
    zmin: float, zmax: float,
    invert: bool = False,
) -> vtk.vtkPolyData:
    """Return the portion of *poly* inside (invert=False) or outside the box."""
    if poly.GetNumberOfPoints() == 0:
        return poly

    # Six planes: (normal, origin). InsideOutOn keeps f(p) = N·(p-O) < 0.
    _planes = [
        ((-1,  0,  0), (xmin,  0,    0   )),  # keep x >= xmin
        (( 1,  0,  0), (xmax,  0,    0   )),  # keep x <= xmax
        (( 0, -1,  0), (0,     ymin,  0  )),  # keep y >= ymin
        (( 0,  1,  0), (0,     ymax,  0  )),  # keep y <= ymax
        (( 0,  0, -1), (0,     0,    zmin)),  # keep z >= zmin
        (( 0,  0,  1), (0,     0,    zmax)),  # keep z <= zmax
    ]

    if invert:
        # Keep OUTSIDE the box: the outside is the union of the six half-spaces
        # outside each face, which a chained AND of clips cannot express. Use a
        # single vtkBox implicit function with InsideOutOff instead.
        box = vtk.vtkBox()
        box.SetBounds(xmin, xmax, ymin, ymax, zmin, zmax)
        clipper = vtk.vtkClipPolyData()
        clipper.SetInputData(poly)
        clipper.SetClipFunction(box)
        clipper.InsideOutOff()  # vtkBox f<0 inside; default keeps f>0 → outside
        clipper.Update()
        clean = vtk.vtkCleanPolyData()
        clean.SetInputConnection(clipper.GetOutputPort())
        clean.Update()
        result = clean.GetOutput()
        logger.info(
            "clip_box(invert): %d → %d vertices", poly.GetNumberOfPoints(),
            result.GetNumberOfPoints(),
        )
        return result

    data: vtk.vtkPolyData = poly
    for normal, origin in _planes:
        if data.GetNumberOfPoints() == 0:
            logger.debug("clip_box: mesh became empty after a plane clip — stopping early")
            break
        plane = vtk.vtkPlane()
        plane.SetNormal(*normal)
        plane.SetOrigin(*origin)

        clipper = vtk.vtkClipPolyData()
        clipper.SetInputData(data)
        clipper.SetClipFunction(plane)
        clipper.InsideOutOn()   # keep where f(p) < 0 (inside the half-space)
        clipper.Update()
        data = clipper.GetOutput()

    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(data)
    clean.Update()
    result = clean.GetOutput()

    logger.info(
        "clip_box: %d → %d vertices  (bounds [%.1f,%.1f] [%.1f,%.1f] [%.1f,%.1f])",
        poly.GetNumberOfPoints(), result.GetNumberOfPoints(),
        xmin, xmax, ymin, ymax, zmin, zmax,
    )
    return result


def clip_sphere(
    poly: vtk.vtkPolyData,
    center: tuple[float, float, float],
    radius: float,
    invert: bool = False,
) -> vtk.vtkPolyData:
    """Return the portion of *poly* inside (invert=False) or outside the sphere."""
    if poly.GetNumberOfPoints() == 0:
        return poly
    if radius <= 0:
        logger.warning("clip_sphere: radius <= 0, returning empty mesh")
        return vtk.vtkPolyData()

    sphere = vtk.vtkSphere()
    sphere.SetCenter(*center)
    sphere.SetRadius(radius)

    clipper = vtk.vtkClipPolyData()
    clipper.SetInputData(poly)
    clipper.SetClipFunction(sphere)
    if invert:
        clipper.InsideOutOff()  # keep f>0 → outside the sphere
    else:
        clipper.InsideOutOn()   # vtkSphere f(p)=|p-c|²-r²; f<0 inside → kept
    clipper.Update()

    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(clipper.GetOutputPort())
    clean.Update()
    result = clean.GetOutput()

    logger.info(
        "clip_sphere%s: %d → %d vertices  (center=(%.1f,%.1f,%.1f)  r=%.1f mm)",
        "(invert)" if invert else "",
        poly.GetNumberOfPoints(), result.GetNumberOfPoints(),
        center[0], center[1], center[2], radius,
    )
    return result


def clip_plane(
    poly: "vtk.vtkPolyData",
    origin: "tuple[float, float, float]",
    normal: "tuple[float, float, float]",
    invert: bool = False,
) -> "vtk.vtkPolyData":
    """Corta por un plano y conserva un lado.

    Por qué existe además del recorte por caja y esfera
    ---------------------------------------------------
    Los dos que había exigen **elegir un centro**, y para quitar algo pegado a
    un extremo de la malla —la chapa de hueso que queda bajo el árbol en una
    3DRA— acertar el centro a ojo cuesta varios intentos: hay que colocarlo
    donde la esfera tape lo que sobra sin comerse el vaso.

    Un plano no tiene centro. Se elige una dirección y una altura, y todo lo
    que quede a un lado se va. Para lo de abajo es un solo deslizador.

    `invert` cambia qué lado se conserva. Devuelve la malla recortada; el
    llamante decide si vaciarla es aceptable.
    """
    if poly is None or poly.GetNumberOfPoints() == 0:
        return poly

    plane = vtk.vtkPlane()
    plane.SetOrigin(*origin)
    plane.SetNormal(*normal)

    clip = vtk.vtkClipPolyData()
    clip.SetInputData(poly)
    clip.SetClipFunction(plane)
    clip.SetInsideOut(bool(invert))
    clip.Update()

    cleaner = vtk.vtkCleanPolyData()
    cleaner.SetInputConnection(clip.GetOutputPort())
    cleaner.Update()
    return cleaner.GetOutput()


# ── La tijera: seccionar un vaso por un anillo de puntos ─────────────────── #

class ScissorsError(ValueError):
    """El anillo no sirve para cortar, y el motivo se le dice al usuario."""


@dataclass
class ScissorsResult:
    """Las dos mitades y lo que hay que contarle a quien mira.

    `kept` es la malla que quedaría; `doomed`, lo que se iría. Las dos salen
    del MISMO cálculo, así que la vista previa no puede discrepar del corte.
    """
    kept: "vtk.vtkPolyData"
    doomed: "vtk.vtkPolyData | None"
    removed_vertices: int
    origin: tuple[float, float, float]
    normal: tuple[float, float, float]
    radius_mm: float
    #: False cuando el vaso queda cortado pero la malla sigue en una pieza (un
    #: lazo). Entonces `doomed` es el tajo, no una pieza que se desprenda, y
    #: no hay «otro lado» que elegir.
    separated: bool = True


def _plane_from_points(pts: "np.ndarray") -> tuple["np.ndarray", "np.ndarray"]:
    """Centro y normal del plano que mejor ajusta los puntos (mínimos cuadrados).

    Es lo mismo que hace el plano de cuello con los puntos del borde: el
    profesional pincha alrededor y no se le puede exigir que sean coplanares.
    La normal es el vector singular de menor valor, que es la dirección en la
    que los puntos menos se extienden — el eje del vaso, si rodean el vaso.
    """
    centro = pts.mean(axis=0)
    _, s, vh = np.linalg.svd(pts - centro, full_matrices=False)
    # Tres puntos alineados (o casi) no definen un plano: el SEGUNDO valor
    # singular se va a cero porque los puntos solo se extienden en una
    # dirección. Sin esta guarda la normal sería ruido numérico.
    if s[1] <= 1e-9 or s[1] < 1e-3 * s[0]:
        raise ScissorsError(
            "Los puntos están alineados: no definen un plano. Márcalos "
            "alrededor del vaso, no en fila.")
    return centro, vh[2] / np.linalg.norm(vh[2])


def _section_ball(
    pts: "np.ndarray", centro: "np.ndarray", normal: "np.ndarray", margin_mm: float,
) -> tuple["np.ndarray", float]:
    """Centro y radio de la bola del corte: la SECCIÓN ENTERA del vaso.

    El profesional solo puede pinchar la mitad del vaso que tiene delante: la
    otra está detrás, tapada por la propia arteria. Centrar la bola en la
    media de los puntos, con el radio que ellos abarcan, la dejaba pegada a la
    cara cercana y sin llegar a la de atrás, así que el vaso no se seccionaba
    entero. Simulando pinchazos solo en la mitad visible de secciones reales
    de una malla de paciente, fallaba uno de cada tres anillos.

    Media circunferencia basta para ajustar la circunferencia entera. Se
    proyectan los puntos al plano y se ajusta un círculo por mínimos cuadrados
    (Kåsa): su centro es el eje del vaso y su radio, el del vaso. La bola va
    ahí, con holgura para las irregularidades de la pared.

    Si los puntos no dibujan un arco —casi en línea dentro del plano, o un
    círculo absurdo—, se vuelve a lo de antes: media de los puntos y lo que
    abarcan. Mejor un corte corto que uno que se lleve medio árbol.
    """
    abarca = float(np.linalg.norm(pts - centro, axis=1).max())
    respaldo = (centro, abarca + margin_mm)

    # Base ortonormal del plano.
    u = np.cross(normal, [1.0, 0.0, 0.0])
    if np.linalg.norm(u) < 1e-6:
        u = np.cross(normal, [0.0, 1.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(normal, u)
    q = np.stack([(pts - centro) @ u, (pts - centro) @ v], axis=1)

    # Kåsa: x² + y² + D x + E y + F = 0, lineal en D, E, F.
    a = np.column_stack([q[:, 0], q[:, 1], np.ones(len(q))])
    b = -(q[:, 0] ** 2 + q[:, 1] ** 2)
    try:
        (d, e, f), *_ = np.linalg.lstsq(a, b, rcond=None)
    except np.linalg.LinAlgError:
        return respaldo
    c2 = np.array([-d / 2, -e / 2])
    r2 = float(c2 @ c2 - f)
    if r2 <= 0:
        return respaldo
    r = float(np.sqrt(r2))
    # Un círculo mucho mayor que lo marcado es que los puntos casi van en
    # línea: el ajuste se dispara. Y un centro muy lejos de los puntos, igual.
    if r > 3.0 * abarca or np.linalg.norm(c2) > 2.5 * abarca:
        return respaldo

    centro_vaso = centro + c2[0] * u + c2[1] * v
    return centro_vaso, 1.4 * r + margin_mm


# Medio grosor de la rebanada que se quita: 1 mm en total. Medido sobre una
# malla de paciente con 60 anillos: a 0,5 separa igual que a 1,5 (40 piezas
# desprendidas contra 39); a 0,25 empieza a dejar puentes (27).
_MEDIO_TAJO_MM = 0.5


def scissors_cut(
    poly: "vtk.vtkPolyData",
    points: "list[tuple[float, float, float]]",
    margin_mm: float = 1.5,
) -> tuple["vtk.vtkPolyData", "np.ndarray", "np.ndarray", float, "vtk.vtkPolyData"]:
    """Secciona la malla por el plano del anillo, SOLO alrededor del anillo.

    Devuelve `(malla seccionada, centro, normal, radio, tajo)`.

    Por qué una bola y no el plano a secas: un plano es infinito, y aplicarlo
    entero amputa todo lo que cruce —el corte por plano que hubo antes hacía
    eso y por eso se retiró—. Aquí se quita la banda de triángulos que el
    plano atraviesa, pero solo dentro de una bola centrada en el anillo. Fuera
    de esa bola la malla se queda intacta, así que un vaso paralelo a un
    centímetro no se entera.

    Por qué con funciones implícitas y no marcando vértices: el corte tiene
    que valer en una malla DECIMADA, donde dos vértices seguidos pueden estar
    a más de un milímetro. Marcando vértices, una rebanada fina no encontraría
    ninguno y no separaría nada; para que separase habría que engordarla hasta
    comerse el vaso. `vtkClipPolyData` corta por donde diga la función y crea
    los vértices del borde donde hagan falta, sea cual sea la densidad. Lo
    aprendí probándolo: con un cilindro de vtk, que solo tiene vértices en sus
    dos extremos, la versión por vértices no cortaba nada.

    La región que se quita es la intersección de tres cosas: la bola del
    anillo y los dos semiespacios que forman la rebanada. `margin_mm` holga la
    bola; la rebanada es mucho más fina (`_MEDIO_TAJO_MM`), porque todo su
    grosor se pierde y, con 3 mm, el corte caía visiblemente por debajo del
    anillo marcado.
    """
    if poly is None or poly.GetNumberOfPoints() == 0:
        raise ScissorsError("No hay malla que cortar.")
    if len(points) < 3:
        raise ScissorsError("Hacen falta al menos tres puntos para definir el corte.")

    pts = np.asarray(points, dtype=float)
    centro, normal = _plane_from_points(pts)
    centro, radio = _section_ball(pts, centro, normal, margin_mm)
    # La sección REAL de la malla manda sobre el círculo ajustado: si la pared
    # es irregular o el vaso más gordo de lo que sugieren los puntos, la bola
    # tiene que abarcar el contorno entero o el vaso queda medio cortado. Con
    # solo el círculo, 6 de cada 60 anillos simulados sobre una malla real
    # dejaban un puente de pared sin cortar.
    extension = _section_extent(poly, centro, normal, radio)
    if extension is not None:
        radio = max(radio, extension + margin_mm)

    bola = vtk.vtkSphere()
    bola.SetCenter(*centro)
    bola.SetRadius(radio)
    # Dos planos que acotan la rebanada. La convención de vtk es que DENTRO
    # es negativo, y `vtkImplicitBoolean` en intersección se queda con el
    # máximo: cada cara tiene que ser negativa en el interior de la rebanada,
    # así que sus normales apuntan HACIA FUERA, cada una en un sentido.
    cara_a, cara_b = vtk.vtkPlane(), vtk.vtkPlane()
    cara_a.SetOrigin(*(centro + normal * _MEDIO_TAJO_MM))
    cara_a.SetNormal(*normal)
    cara_b.SetOrigin(*(centro - normal * _MEDIO_TAJO_MM))
    cara_b.SetNormal(*(-normal))

    region = vtk.vtkImplicitBoolean()
    region.SetOperationTypeToIntersection()
    for f in (bola, cara_a, cara_b):
        region.AddFunction(f)

    clip = vtk.vtkClipPolyData()
    clip.SetInputData(poly)
    clip.SetClipFunction(region)
    # Conservar lo de FUERA de la región: es lo que sobrevive al tijeretazo.
    clip.SetInsideOut(False)
    # Y quedarse también con lo extirpado, que es como se sabe si el anillo
    # llegó a tocar la malla. NO vale contar celdas de la parte conservada:
    # el recorte parte los triángulos del borde, así que devuelve MÁS celdas
    # que la entrada aunque haya quitado material.
    clip.GenerateClippedOutputOn()
    clip.Update()

    tajo = clip.GetClippedOutput()
    if tajo.GetNumberOfCells() == 0:
        raise ScissorsError(
            "El anillo no toca la malla: está marcado lejos de la superficie.")

    limpia = vtk.vtkCleanPolyData()
    limpia.SetInputConnection(clip.GetOutputPort())
    limpia.Update()
    # El tajo también se devuelve: cuando el vaso está en un lazo, el corte no
    # desprende ninguna pieza y lo único que hay que enseñar es por dónde pasa.
    # Limpio: la salida recortada de vtkClipPolyData conserva TODOS los puntos
    # de la entrada aunque solo lleve las celdas del tajo, así que sin esto
    # sus límites son los de la malla entera y el fichero de la vista previa
    # pesa lo que la malla.
    solo_tajo = vtk.vtkCleanPolyData()
    solo_tajo.SetInputData(tajo)
    solo_tajo.Update()
    return limpia.GetOutput(), centro, normal, radio, solo_tajo.GetOutput()


def _section_extent(
    poly: "vtk.vtkPolyData", centro: "np.ndarray", normal: "np.ndarray", radio: float,
) -> float | None:
    """Hasta dónde llega, desde el centro, la sección del vaso rodeado.

    Se corta la malla con el plano y se toma el contorno más cercano al centro
    —el vaso que se rodeó, no uno vecino que el plano también atraviese—.
    Devuelve None si no hay contorno cerca, o si el contorno es desmesurado:
    eso es el plano deslizándose a lo largo de un vaso o de una masa fundida,
    y ahí agrandar la bola se llevaría lo que no se ha señalado.
    """
    plano = vtk.vtkPlane()
    plano.SetOrigin(*centro)
    plano.SetNormal(*normal)
    corte = vtk.vtkCutter()
    corte.SetCutFunction(plano)
    corte.SetInputData(poly)
    conexo = vtk.vtkPolyDataConnectivityFilter()
    conexo.SetInputConnection(corte.GetOutputPort())
    conexo.SetExtractionModeToClosestPointRegion()
    conexo.SetClosestPoint(*centro)
    conexo.Update()
    contorno = conexo.GetOutput()
    if contorno.GetNumberOfPoints() < 3:
        return None
    d = np.linalg.norm(_points_array(contorno) - centro, axis=1)
    if d.min() > radio:            # el contorno más cercano ni siquiera está cerca
        return None
    if d.max() > 2.5 * radio:      # se desliza a lo largo de algo: no agrandar
        return None
    return float(d.max())


def scissors_preview(
    poly: "vtk.vtkPolyData",
    points: "list[tuple[float, float, float]]",
    keep_side: int = 0,
    margin_mm: float = 1.5,
) -> ScissorsResult:
    """Qué quedaría y qué se iría, sin tocar nada.

    `keep_side` elige cuál de las dos piezas se conserva: 0 es la que contiene
    la mayor parte de la malla —casi siempre el árbol—, y 1 la otra. Se ofrece
    porque quien mira es quien sabe cuál sobra.
    """
    from services.mesh_components import describe_components, _extract

    seccionada, centro, normal, radio, tajo = scissors_cut(poly, points, margin_mm)
    comps = describe_components(seccionada)
    if len(comps) < 2:
        # El vaso queda cortado pero sus dos extremos siguen unidos por otro
        # camino: anastomosis, polígono de Willis, o dos vasos que se tocan y
        # el marching cubes fundió. Es lo habitual en vasculatura real —en una
        # malla de paciente pasó en 14 de cada 60 anillos bien puestos—, así
        # que no es un error: se corta igual y se enseña el tajo. Un segundo
        # corte en el otro extremo aísla el tramo.
        return ScissorsResult(
            kept=seccionada,
            doomed=tajo,
            removed_vertices=max(0, poly.GetNumberOfPoints() - seccionada.GetNumberOfPoints()),
            origin=tuple(float(x) for x in centro),
            normal=tuple(float(x) for x in normal),
            radius_mm=radio,
            separated=False,
        )

    # Las piezas, de mayor a menor por número de vértices. La 0 es el árbol.
    orden = sorted(comps, key=lambda c: c.n_points, reverse=True)
    lado_a = _extract(seccionada, orden[0].index)
    resto = [_extract(seccionada, c.index) for c in orden[1:]]
    lado_b = _append(resto) if len(resto) > 1 else resto[0]

    kept, doomed = (lado_a, lado_b) if keep_side == 0 else (lado_b, lado_a)
    # Lo que pierde la malla: antes menos lo que queda. Pero seccionar añade
    # vértices a lo largo del corte, y con una pieza pequeña lo que queda
    # puede tener MÁS que el original («se van −42 vértices», visto en
    # pantalla). Entonces se cuenta la propia pieza que se va.
    se_van = poly.GetNumberOfPoints() - kept.GetNumberOfPoints()
    if se_van <= 0:
        se_van = doomed.GetNumberOfPoints()
    # El tajo también se va: si no se pinta, el rojo empieza por debajo del
    # anillo y parece que corta donde no se marcó.
    doomed = _append([doomed, tajo])
    return ScissorsResult(
        kept=kept,
        doomed=doomed,
        removed_vertices=se_van,
        origin=tuple(float(x) for x in centro),
        normal=tuple(float(x) for x in normal),
        radius_mm=radio,
    )


def _points_array(poly: "vtk.vtkPolyData") -> "np.ndarray":
    from vtkmodules.util.numpy_support import vtk_to_numpy
    return vtk_to_numpy(poly.GetPoints().GetData()).astype(float)


def _drop_vertices(poly: "vtk.vtkPolyData", fuera: "np.ndarray") -> "vtk.vtkPolyData":
    """La malla sin los vértices marcados (y sin los triángulos que los usan)."""
    marca = vtk.vtkUnsignedCharArray()
    marca.SetName("_tijera")
    marca.SetNumberOfValues(poly.GetNumberOfPoints())
    for i, f in enumerate(fuera):
        marca.SetValue(i, 1 if f else 0)
    copia = vtk.vtkPolyData()
    copia.DeepCopy(poly)
    copia.GetPointData().AddArray(marca)
    copia.GetPointData().SetActiveScalars("_tijera")

    umbral = vtk.vtkThreshold()
    umbral.SetInputData(copia)
    umbral.SetUpperThreshold(0.5)
    umbral.SetThresholdFunction(vtk.vtkThreshold.THRESHOLD_LOWER)
    umbral.SetInputArrayToProcess(0, 0, 0, vtk.vtkDataObject.FIELD_ASSOCIATION_POINTS, "_tijera")
    umbral.Update()

    superficie = vtk.vtkGeometryFilter()
    superficie.SetInputConnection(umbral.GetOutputPort())
    superficie.Update()

    limpia = vtk.vtkCleanPolyData()
    limpia.SetInputConnection(superficie.GetOutputPort())
    limpia.Update()
    salida = limpia.GetOutput()
    salida.GetPointData().RemoveArray("_tijera")
    return salida


def _append(polys: "list[vtk.vtkPolyData]") -> "vtk.vtkPolyData":
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    return ap.GetOutput()
