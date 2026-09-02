"""Render the 3D scene to PNG on the server, from named viewpoints.

The report has always been able to carry ONE image, and it came from the
browser: whatever the viewer happened to be showing when the button was pressed.
That makes the picture a record of the camera rather than of the anatomy — two
reports of the same case look different, and neither can be compared with a
third. It also means no image at all when the report is generated from a script
or a resumed session with no viewer open.

Rendering here fixes both. The viewpoints are named and fixed, so the same case
always produces the same six pictures, and a reader can compare a follow-up
against a baseline without wondering whether the camera moved.

Views
-----
Named for the MPR planes the rest of the application uses, so "coronal" in a
report means what "coronal" means in the viewer. Mesh coordinates are
voxel·spacing with x = columns, y = rows, z = slices, so +z is the
superior–inferior axis.

What this does not do
---------------------
It draws the geometry the pipeline produced. It applies no window/level, no
tissue shading and no lighting model beyond a headlight, so these are diagrams
of the segmentation — not radiological images, and not something to read for
findings the segmentation itself does not carry.
"""
from __future__ import annotations

import logging
import math

logger = logging.getLogger(__name__)

#: (direction the camera looks FROM, up vector). Six standard viewpoints plus an
#: oblique one, which is the only view that shows depth in a single frame.
VIEWS: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {
    "anterior":  ((0.0, -1.0, 0.0), (0.0, 0.0, 1.0)),
    "posterior": ((0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    "izquierda": ((-1.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
    "derecha":   ((1.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
    "superior":  ((0.0, 0.0, 1.0), (0.0, -1.0, 0.0)),
    "inferior":  ((0.0, 0.0, -1.0), (0.0, 1.0, 0.0)),
    "oblicua":   ((0.7, -0.7, 0.5), (0.0, 0.0, 1.0)),
}

#: Colours matching the viewer, so a picture in the report reads like the screen.
VESSEL_RGB = (0.65, 0.70, 0.76)
DOME_RGB = (0.32, 0.55, 0.75)
DEVICE_RGB = (0.92, 0.82, 0.45)
COIL_RGB = (0.85, 0.55, 0.85)
STENT_RGB = (0.55, 0.80, 0.95)
BACKGROUND_RGB = (0.05, 0.06, 0.07)


def _actor(poly, rgb, opacity=1.0):
    import vtk

    mapper = vtk.vtkPolyDataMapper()
    mapper.SetInputData(poly)
    mapper.ScalarVisibilityOff()          # solid colour, not scalar-mapped
    a = vtk.vtkActor()
    a.SetMapper(mapper)
    p = a.GetProperty()
    p.SetColor(*rgb)
    p.SetOpacity(opacity)
    p.SetInterpolationToPhong()
    p.SetSpecular(0.25)
    p.SetSpecularPower(30)
    return a


def union_bounds(polys) -> tuple[float, ...] | None:
    """Bounds enclosing every mesh given. None when there is nothing to enclose.

    The subject of a plan picture is the sac AND the device on it, not either
    alone: framing on the sac cropped the clip, which is several times larger.
    """
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    found = False
    for poly in polys:
        if poly is None or poly.GetNumberOfPoints() == 0:
            continue
        b = poly.GetBounds()
        for i in range(3):
            lo[i] = min(lo[i], b[2 * i])
            hi[i] = max(hi[i], b[2 * i + 1])
        found = True
    if not found:
        return None
    return (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2])


#: Rendered at this multiple of the requested size and scaled back down. The
#: offscreen window runs with MSAA off (some drivers fail outright with it on),
#: so without this every edge in the report is a hard staircase that a PDF
#: viewer smears into a blur. Drawing at 2x and averaging down is the
#: antialiasing, and it works on any driver.
SUPERSAMPLE = 2


def _downscale(png: bytes, width: int, height: int) -> bytes:
    """Average a supersampled frame down to its final size.

    Best effort: without Pillow the frame is returned as rendered — larger than
    asked for, which a PDF simply prints at higher density, rather than no
    picture at all.
    """
    try:
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(png)).convert("RGB")
        if img.size == (width, height):
            return png
        buf = io.BytesIO()
        img.resize((width, height), Image.LANCZOS).save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not downscale a rendered view (%s); using it as rendered", exc)
        return png


def render_views(
    layers: list[tuple["object", tuple[float, float, float], float]],
    views: list[str] | None = None,
    *,
    width: int = 900,
    height: int = 700,
    focus_poly=None,
    focus_bounds: tuple[float, ...] | None = None,
    zoom: float = 1.0,
) -> dict[str, bytes]:
    """PNG bytes per named view.

    `layers` is (polydata, rgb, opacity), drawn in order. `focus_poly` frames the
    camera on one part — the sac, usually — so a clip on a 4 mm neck is not lost
    inside a 200 mm vessel tree; without it the whole scene is framed.

    Returns only the views that rendered. A viewpoint that fails is dropped with
    a warning rather than taking the report down with it: a report with five
    pictures is worth more than an exception.
    """
    import vtk

    names = views or list(VIEWS)
    out: dict[str, bytes] = {}
    if not layers:
        return out

    renderer = vtk.vtkRenderer()
    renderer.SetBackground(*BACKGROUND_RGB)
    for poly, rgb, opacity in layers:
        if poly is not None and poly.GetNumberOfPoints() > 0:
            renderer.AddActor(_actor(poly, rgb, opacity))
    if not renderer.GetActors().GetNumberOfItems():
        return out

    win = vtk.vtkRenderWindow()
    win.SetOffScreenRendering(1)           # no display needed; servers have none
    win.AddRenderer(renderer)
    win.SetSize(width * SUPERSAMPLE, height * SUPERSAMPLE)
    win.SetMultiSamples(0)                 # some offscreen drivers fail with MSAA

    bounds = focus_bounds
    if bounds is None and focus_poly is not None and focus_poly.GetNumberOfPoints() > 0:
        bounds = focus_poly.GetBounds()

    try:
        for name in names:
            spec = VIEWS.get(name)
            if spec is None:
                logger.warning("Unknown view %r, skipped", name)
                continue
            direction, up = spec
            cam = renderer.GetActiveCamera()
            cam.SetPosition(*direction)
            cam.SetFocalPoint(0.0, 0.0, 0.0)
            cam.SetViewUp(*up)
            # ResetCamera keeps the direction and refits, so pointing the camera
            # and refitting is all a named view needs.
            if bounds is not None:
                renderer.ResetCamera(bounds)
            else:
                renderer.ResetCamera()
            if zoom != 1.0:
                cam.Zoom(zoom)
            renderer.ResetCameraClippingRange()
            renderer.UpdateLightsGeometryToFollowCamera()

            try:
                win.Render()
                w2i = vtk.vtkWindowToImageFilter()
                w2i.SetInput(win)
                w2i.ReadFrontBufferOff()
                w2i.Update()
                writer = vtk.vtkPNGWriter()
                writer.SetWriteToMemory(1)
                writer.SetInputConnection(w2i.GetOutputPort())
                writer.Write()
                data = writer.GetResult()
                out[name] = _downscale(bytes(memoryview(data)), width, height)
            except Exception as exc:  # noqa: BLE001 — one bad view is not fatal
                logger.warning("View %r failed to render: %s", name, exc)
    finally:
        win.Finalize()

    return out


def render_clip_views(clip_poly, views: list[str] | None = None,
                      width: int = 700, height: int = 520) -> dict[str, bytes]:
    """The clip on its own, for a manufacturing dossier.

    Three views by default: a machinist needs to see the jaw, the profile and the
    bend, and more pictures of one small part stop adding information.
    """
    return render_views([(clip_poly, DEVICE_RGB, 1.0)],
                        views or ["superior", "anterior", "oblicua"],
                        width=width, height=height, focus_poly=clip_poly)


def render_plan_views(vessel=None, dome=None, devices=None,
                      views: list[str] | None = None,
                      width: int = 900, height: int = 700) -> dict[str, bytes]:
    """The plan as it stands: vessel, sac and whatever devices are placed.

    The vessel is drawn translucent so a clip at the neck is visible through it —
    an opaque tree hides the very thing the picture exists to show. The camera
    frames the SAC, not the tree: a 4 mm clip framed against 200 mm of vasculature
    is a few pixels.
    """
    layers: list[tuple[object, tuple[float, float, float], float]] = []
    if vessel is not None:
        layers.append((vessel, VESSEL_RGB, 0.35))
    if dome is not None:
        layers.append((dome, DOME_RGB, 0.55))
    for poly, rgb in (devices or []):
        layers.append((poly, rgb, 1.0))

    # Frame on the sac AND the devices together. The sac alone cropped the clip,
    # which is several times larger than the aneurysm it closes; the tree alone
    # would shrink both to a few pixels. No extra zoom on top: ResetCamera
    # already fits these bounds, and tightening further crops them again.
    subject = [dome] + [poly for poly, _rgb in (devices or [])]
    return render_views(layers, views or ["anterior", "izquierda", "superior", "oblicua"],
                        width=width, height=height,
                        focus_bounds=union_bounds(subject))
