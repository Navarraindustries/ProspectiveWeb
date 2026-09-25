/* SliceView — un plano ortogonal del volumen, renderizado en el navegador.

   El vtkImageData llega ya construido y compartido; aquí solo hay un
   vtkImageMapper con su modo de corte y una cámara paralela fija en la
   orientación de siempre (la de los PNG). Ventana/nivel es una propiedad
   del actor, así que arrastrar no toca la red. El HUD va encima en HTML. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageMapper from "@kitware/vtk.js/Rendering/Core/ImageMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";
import { SlicingMode } from "@kitware/vtk.js/Rendering/Core/ImageMapper/Constants";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { edgeLabels, screenAxes, sliceCamera, type Orientation, type Plane } from "./geometry";
import { HudFrame } from "./hud/HudFrame";
import { HudLadder } from "./hud/HudLadder";
import { HudReadout } from "./hud/HudReadout";
import { HudReticle } from "./hud/HudReticle";

const MODE: Record<Plane, SlicingMode> = { axial: SlicingMode.K, coronal: SlicingMode.J, sagital: SlicingMode.I };
const LABEL: Record<Plane, string> = { axial: "AXIAL", coronal: "CORONAL", sagital: "SAGITAL" };

/** Número de cortes del plano en índices NATIVOS. */
function planeCount(meta: VolumeMeta, plane: Plane) {
  const [z, y, x] = meta.shape;
  return plane === "axial" ? z : plane === "coronal" ? y : x;
}

export interface SliceViewProps {
  image: vtkImageData;
  meta: VolumeMeta;
  plane: Plane;
  index: number;
  onIndexChange: (i: number) => void;
  wc: number; ww: number;
  onWindowLevel: (wc: number, ww: number) => void;
  crosshair: { u: number; v: number } | null;
  onPlaneClick: (u: number, v: number) => void;
  referenceLines?: { u: number | null; v: number | null } | null;
  band?: [number, number] | null;
  orientation: Orientation;
  levelNote?: string | null;
  active?: boolean;
  compact?: boolean;
}

interface Scene {
  grw: vtkGenericRenderWindow;
  mapper: vtkImageMapper;
  actor: vtkImageSlice;
  bandMapper: vtkImageMapper;
  bandActor: vtkImageSlice;
  /** Recalcula `box` desde la cámara: la única fuente del rectángulo. */
  measure: () => void;
}

interface SavedCamera { plane: Plane; focal: number[]; position: number[]; scale: number }

export function SliceView(p: SliceViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  // Cámara de la escena anterior: al llegar el volumen completo la escena se
  // rehace, y sin esto el zoom/desplazamiento del usuario volvería al inicio.
  const savedCam = useRef<SavedCamera | null>(null);
  // Rectángulo de la imagen en px del contenedor, para retícula y clics.
  const [box, setBox] = useState<{ left: number; top: number; w: number; h: number; mmPerPx: number } | null>(null);
  const count = planeCount(p.meta, p.plane);
  // Índice del vtkImageData (puede ir con stride en el plano): el índice de
  // corte del plano axial no cambia; los de coronal/sagital se dividen.
  const dims = p.image.getDimensions();
  const nativeAlong = p.plane === "axial" ? p.meta.shape[0] : p.plane === "coronal" ? p.meta.shape[1] : p.meta.shape[2];
  const imgAlong = p.plane === "axial" ? dims[2] : p.plane === "coronal" ? dims[1] : dims[0];
  const imgIndex = Math.round((p.index / Math.max(1, nativeAlong - 1)) * Math.max(0, imgAlong - 1));

  // ── Escena: una vez por imagen/plano ─────────────────────────────────── #
  useEffect(() => {
    const container = containerRef.current; if (!container) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(container);
    const renderer = grw.getRenderer();
    const rw = grw.getRenderWindow();
    // Sin interacción de vtk: rueda, arrastre y clic los gestiona el HUD.
    const interactor = grw.getInteractor();
    try { interactor.unbindEvents(); } catch { /* older vtk.js */ }

    const mapper = vtkImageMapper.newInstance();
    mapper.setInputData(p.image);
    mapper.setSlicingMode(MODE[p.plane]);
    const actor = vtkImageSlice.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationTypeToLinear();
    renderer.addActor(actor);

    // Capa del tinte de banda: mismo corte, opaca solo dentro de [lo, hi].
    const bandMapper = vtkImageMapper.newInstance();
    bandMapper.setInputData(p.image);
    bandMapper.setSlicingMode(MODE[p.plane]);
    const bandActor = vtkImageSlice.newInstance();
    bandActor.setMapper(bandMapper);
    bandActor.setVisibility(false);
    renderer.addActor(bandActor);

    const cam = renderer.getActiveCamera();
    cam.setParallelProjection(true);
    const { direction, viewUp } = sliceCamera(p.plane);
    const { right, down } = screenAxes(p.plane);
    const b = p.image.getBounds();
    const c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
    cam.setFocalPoint(c[0], c[1], c[2]);
    cam.setPosition(c[0] - direction[0] * 1000, c[1] - direction[1] * 1000, c[2] - direction[2] * 1000);
    cam.setViewUp(viewUp[0], viewUp[1], viewUp[2]);

    // Extensión del corte (mm) a lo largo de un eje de pantalla, y su centro.
    const ext = (v: number[]) => {
      const bs = mapper.getBoundsForSlice();
      return Math.abs(v[0]) * (bs[1] - bs[0]) + Math.abs(v[1]) * (bs[3] - bs[2]) + Math.abs(v[2]) * (bs[5] - bs[4]);
    };
    const dot = (a: number[], v: number[]) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    // Tamaño en px CSS (no el del canvas, que va multiplicado por devicePixelRatio):
    // el HUD y los clics viven en px CSS.
    const size = () => [container.clientWidth, container.clientHeight];

    // Encajar: resetCamera encaja la esfera envolvente y deja el corte en ~45 %
    // del panel; aquí la media altura visible es la del corte (o su anchura
    // dividida por el aspecto si el panel es más estrecho que el corte).
    let fitted = false;
    const fit = () => {
      const [w, h] = size(); if (w <= 0 || h <= 0) return;
      cam.setParallelScale(Math.max(ext(down) / 2, ext(right) / 2 / (w / h)) * 1.02);
      fitted = true;
    };

    const measure = () => {
      // Con cámara paralela, parallelScale es la media altura visible en mm; el
      // centro del corte menos el foco, proyectado en los ejes de pantalla, es
      // el desplazamiento de la imagen respecto al centro del panel.
      const [w, h] = size(); if (w <= 0 || h <= 0) return;
      const mmPerPx = (2 * cam.getParallelScale()) / h;
      const bs = mapper.getBoundsForSlice();
      const f = cam.getFocalPoint();
      const d = [(bs[0] + bs[1]) / 2 - f[0], (bs[2] + bs[3]) / 2 - f[1], (bs[4] + bs[5]) / 2 - f[2]];
      const wPx = ext(right) / mmPerPx, hPx = ext(down) / mmPerPx;
      const cx = w / 2 + dot(d, right) / mmPerPx, cy = h / 2 + dot(d, down) / mmPerPx;
      setBox({ left: cx - wPx / 2, top: cy - hPx / 2, w: wPx, h: hPx, mmPerPx });
    };

    grw.resize();
    const prev = savedCam.current;
    if (prev && prev.plane === p.plane) {
      cam.setFocalPoint(prev.focal[0], prev.focal[1], prev.focal[2]);
      cam.setPosition(prev.position[0], prev.position[1], prev.position[2]);
      cam.setParallelScale(prev.scale);
      fitted = true;
    } else {
      fit();
    }
    renderer.resetCameraClippingRange();
    scene.current = { grw, mapper, actor, bandMapper, bandActor, measure };

    const ro = new ResizeObserver(() => {
      grw.resize();
      if (!fitted) fit();     // el panel pudo montarse con tamaño 0
      measure(); rw.render();
    });
    ro.observe(container);
    measure();
    rw.render();
    return () => {
      ro.disconnect();
      savedCam.current = { plane: p.plane, focal: cam.getFocalPoint(), position: cam.getPosition(), scale: cam.getParallelScale() };
      scene.current = null;
      grw.delete();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.image, p.plane]);

  // ── Corte, ventana/nivel, banda: sin reconstruir ─────────────────────── #
  // También dependen de la imagen y del plano: al llegar el completo la escena
  // se rehace con actores nuevos, que nacen con la ventana por defecto de vtk
  // (255/127.5) y sin tinte si nadie vuelve a aplicárselos.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.mapper.setSlice(imgIndex);
    s.bandMapper.setSlice(imgIndex);
    s.grw.getRenderer().resetCameraClippingRange();
    s.grw.getRenderWindow().render();
  }, [imgIndex, p.image, p.plane]);

  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.actor.getProperty().setColorWindow(Math.max(1, p.ww));
    s.actor.getProperty().setColorLevel(p.wc);
    s.grw.getRenderWindow().render();
  }, [p.wc, p.ww, p.image, p.plane]);

  useEffect(() => {
    const s = scene.current; if (!s) return;
    if (!p.band) { s.bandActor.setVisibility(false); s.grw.getRenderWindow().render(); return; }
    const [lo, hi] = p.band;
    // El techo se recorta al máximo real del volumen, no a una cifra grande:
    // vtk.js muestrea las funciones en una textura de ancho fijo sobre SU rango,
    // y con «sin techo» (MAX_SAFE_INTEGER, o 1e9) cada texel abarca miles de
    // niveles y todos los vóxeles caen en el primero, de opacidad 0: el tinte
    // desaparecía entero.
    const dataMax = p.image.getPointData().getScalars().getRange()[1];
    const top = Math.min(hi, dataMax);
    if (lo > top) { s.bandActor.setVisibility(false); s.grw.getRenderWindow().render(); return; }
    const ctf = vtkColorTransferFunction.newInstance();
    ctf.addRGBPoint(lo, 0.21, 0.84, 0.66); ctf.addRGBPoint(top, 0.21, 0.84, 0.66);
    const otf = vtkPiecewiseFunction.newInstance();
    otf.addPoint(lo - 1, 0); otf.addPoint(lo, 0.55); otf.addPoint(top, 0.55); otf.addPoint(top + 1, 0);
    const prop = s.bandActor.getProperty();
    prop.setRGBTransferFunction(0, ctf);
    prop.setScalarOpacity(0, otf);
    prop.setUseLookupTableScalarRange(true);
    s.bandActor.setVisibility(true);
    s.grw.getRenderWindow().render();
  }, [p.band, p.image, p.plane]);

  // ── Interacción (en el HUD, no en vtk) ───────────────────────────────── #
  const drag = useRef<{ x: number; y: number; wc: number; ww: number; moved: boolean; pan: boolean } | null>(null);
  const frac = (e: React.MouseEvent) => {
    const el = containerRef.current; if (!el || !box) return null;
    const r = el.getBoundingClientRect();
    const u = (e.clientX - r.left - box.left) / box.w, v = (e.clientY - r.top - box.top) / box.h;
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
  };
  // Zoom y desplazamiento son de la cámara paralela: parallelScale es la
  // media altura visible en mm, y mover el foco desplaza la imagen.
  const zoomBy = (factor: number) => {
    const s = scene.current; if (!s) return;
    const cam = s.grw.getRenderer().getActiveCamera();
    cam.setParallelScale(Math.max(1, cam.getParallelScale() * factor));
    s.grw.getRenderWindow().render();
    s.measure();
  };
  const panBy = (dxPx: number, dyPx: number) => {
    const s = scene.current; if (!s || !box) return;
    const cam = s.grw.getRenderer().getActiveCamera();
    const { right, down } = screenAxes(p.plane);
    const mm = box.mmPerPx;
    const f = cam.getFocalPoint(), pos = cam.getPosition();
    const d = [-(right[0] * dxPx + down[0] * dyPx) * mm, -(right[1] * dxPx + down[1] * dyPx) * mm, -(right[2] * dxPx + down[2] * dyPx) * mm];
    cam.setFocalPoint(f[0] + d[0], f[1] + d[1], f[2] + d[2]);
    cam.setPosition(pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]);
    s.grw.getRenderWindow().render();
    s.measure();
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) { zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); return; }
    p.onIndexChange(Math.max(0, Math.min(count - 1, p.index + (e.deltaY > 0 ? 1 : -1))));
  };
  // React registra la rueda como pasiva: su preventDefault no hace nada (y lo
  // grita en consola), así que Ctrl+rueda haría además zoom de la página. Un
  // oyente nativo no pasivo sí la retiene; el ref le da siempre las props de
  // este render sin volver a registrarlo.
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, wc: p.wc, ww: p.ww, moved: false, pan: e.button === 1 || e.shiftKey };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.pan) { panBy(dx, dy); d.x = e.clientX; d.y = e.clientY; return; }
    const span = p.meta.intensity_range[1] - p.meta.intensity_range[0];
    const k = span / 400;   // arrastrar 400 px recorre todo el rango
    p.onWindowLevel(d.wc - dy * k, Math.max(1, d.ww + dx * k));
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) { const f = frac(e); if (f) p.onPlaneClick(f.u, f.v); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); p.onIndexChange(Math.min(count - 1, p.index + 1)); }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); p.onIndexChange(Math.max(0, p.index - 1)); }
    if (e.key === "Home") p.onIndexChange(0);
    if (e.key === "End") p.onIndexChange(count - 1);
  };

  const labels = edgeLabels(p.plane, p.orientation);
  const fs = p.compact ? 9.5 : 10.5;
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      onMouseLeave={() => { drag.current = null; }} onKeyDown={onKey}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000", overflow: "hidden", cursor: "crosshair", outline: "none" }}
      title="Rueda o flechas: corte · Ctrl+rueda: zoom · Arrastrar: ventana/nivel · Shift o botón central: desplazar · Clic: centrar"
    >
      <HudFrame active={p.active} label={LABEL[p.plane]}>
        <span className="hud-edge top">{labels.top}</span>
        <span className="hud-edge bottom">{labels.bottom}</span>
        <span className="hud-edge left">{labels.left}</span>
        <span className="hud-edge right">{labels.right}</span>
        {box && p.crosshair && (
          <HudReticle cx={box.left + p.crosshair.u * box.w} cy={box.top + p.crosshair.v * box.h} mmPerPx={box.mmPerPx} />
        )}
        {box && p.referenceLines?.u != null && (
          <div style={{ position: "absolute", left: box.left + p.referenceLines.u * box.w, top: box.top, width: 1, height: box.h, background: "var(--hud-amber)", opacity: 0.5 }} />
        )}
        {box && p.referenceLines?.v != null && (
          <div style={{ position: "absolute", top: box.top + p.referenceLines.v * box.h, left: box.left, height: 1, width: box.w, background: "var(--hud-amber)", opacity: 0.5 }} />
        )}
        <HudLadder count={count} index={p.index} />
        <HudReadout at="bl" lines={[`${String(p.index + 1).padStart(3, " ")}/${count}`]} />
        <HudReadout at="br" lines={[`W ${Math.round(p.ww)}  L ${Math.round(p.wc)}`]} />
        {p.levelNote && <HudReadout at="tr" lines={[p.levelNote]} tone="warn" />}
        {box && box.mmPerPx > 0 && (
          <div style={{ position: "absolute", right: 14, bottom: 40, width: 10 / box.mmPerPx, height: 1, background: "var(--hud-dim)" }}>
            <span style={{ position: "absolute", right: 0, top: -12, fontSize: fs - 1, color: "var(--hud-dim)" }}>10 mm</span>
          </div>
        )}
      </HudFrame>
    </div>
  );
}
