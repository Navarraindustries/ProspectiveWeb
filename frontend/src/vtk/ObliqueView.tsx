/* ObliqueView — corte libre, resuelto en el navegador con
   vtkImageResliceMapper. El plano es el plano libre compartido del store
   (azimut, elevación y desplazamiento desde el crosshair): el mismo que
   recorta el volumen y que se dibuja en el 3D y en los cortes, así que
   orientarlo aquí lo orienta en todas las vistas. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageResliceMapper from "@kitware/vtk.js/Rendering/Core/ImageResliceMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { usePlanning } from "../store/planning";
import type { Vec3 } from "./geometry";
import {
  AZIMUTH_RANGE, ELEVATION_RANGE, clampOffsetToBox, clipPolygon, normalOf, originOf, rightOf, upOf, type FreePlane,
} from "./freePlane";
import { dragAngles, obliqueReadout, wheelOffset } from "./obliqueGestures";
import { isNativeKeyTarget, stepFromKey } from "./cine";
import { HudFrame } from "./hud/HudFrame";
import { HudReadout } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { captureRenderWindow, type CaptureFn } from "./captureRenderWindow";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
type Voxel = { x: number; y: number; z: number };
const degLabel = (d: number) => { const r = Math.round(d); return `${r < 0 ? "−" : ""}${Math.abs(r)}°`; };

export function ObliqueView({ image, meta, wc, ww, onWindowLevel, active = false, registerCapture, registerFit, overlay }: {
  image: vtkImageData; meta: VolumeMeta; wc: number; ww: number; onWindowLevel: (wc: number, ww: number) => void; active?: boolean;
  /** Algo que va sobre la imagen (la barra del cine): dentro del área del
   *  corte, para que quede encima de su lectura y no de la fila de deslizadores. */
  overlay?: ReactNode;
  /** Publica la captura de este panel en PNG mientras su escena viva.
   *  El lienzo de vtk.js se lee negro si no se pide la imagen del
   *  siguiente render, así que la captura tiene que salir de aquí. */
  registerCapture?: (fn: CaptureFn | null) => void;
  /** Publica el reencuadre de esta celda (la tecla C) mientras su escena viva,
   *  como `registerCapture`: el visor no ve la cámara de cada celda. */
  registerFit?: (fn: (() => void) | null) => void;
}) {
  const { mprVoxel, freePlane, setFreePlane } = usePlanning();
  // Por ref: cambiar de destinatario no puede rehacer la escena.
  const registerCaptureRef = useRef(registerCapture);
  registerCaptureRef.current = registerCapture;
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<{ grw: vtkGenericRenderWindow; mapper: vtkImageResliceMapper; actor: vtkImageSlice; plane: vtkPlane; fit: () => boolean } | null>(null);
  // «ENCUADRAR»/«AL PUNTO» piden un reencuadre; el contador lo convierte en un cambio.
  const [fitRequest, setFitRequest] = useState(0);
  // Plano y crosshair vigentes, para que el encuadre (y el ResizeObserver y la
  // rueda, que viven fuera del ciclo de React) los lean sin rehacer la escena.
  const geom = useRef<{ p: FreePlane; voxel: Voxel }>({ p: freePlane, voxel: mprVoxel });
  // También por ref: el encuadre lo necesita y la escena no se rehace por él.
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // Encuadre pendiente: la escena recién hecha o un botón. Ángulos, rueda y
  // crosshair no lo piden: conservan el zoom del usuario.
  const needFit = useRef(true);

  /** Todo cambio del plano pasa por aquí. El desplazamiento se acota a la caja
   *  también al girar, porque un giro puede dejar fuera un plano que estaba
   *  dentro. `geom` se adelanta al render para que dos eventos seguidos de la
   *  rueda acumulen en vez de partir los dos del mismo plano. */
  const commitPlane = (p: FreePlane) => {
    const next = clampOffsetToBox(p, geom.current.voxel, meta);
    geom.current = { ...geom.current, p: next };
    setFreePlane(next);
  };
  // La rueda es un oyente nativo registrado una vez por volumen: lee la última
  // versión de `commitPlane` por ref.
  const commitRef = useRef(commitPlane);
  commitRef.current = commitPlane;

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(el);
    // Sin interacción de vtk: su estilo trackball giraría la cámara fuera de
    // la normal del plano al arrastrar, y los arrastres aquí son nuestros.
    try { grw.getInteractor().unbindEvents(); } catch { /* older vtk.js */ }
    const renderer = grw.getRenderer();
    const plane = vtkPlane.newInstance();
    const mapper = vtkImageResliceMapper.newInstance();
    mapper.setInputData(image);
    mapper.setSlicePlane(plane);
    const actor = vtkImageSlice.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationTypeToLinear();
    renderer.addActor(actor);
    const cam = renderer.getActiveCamera();
    cam.setParallelProjection(true);

    // La misma regla que SliceView: la media altura visible (parallelScale)
    // es la media extensión vertical del corte, o su media anchura dividida
    // por el aspecto si el panel es más estrecho que el corte. Las extensiones
    // son las del polígono plano–caja proyectado en los ejes de pantalla
    // (rightOf, upOf). El foco es el crosshair, así que la imagen queda
    // centrada en él. Devuelve false si el panel aún mide 0 (montado oculto):
    // el encuadre sigue pendiente.
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight; if (w <= 0 || h <= 0) return false;
      const { p, voxel } = geom.current;
      const poly = clipPolygon(p, voxel, metaRef.current);
      if (poly.length < 3) return false;
      const span = (v: Vec3) => { const d = poly.map((q) => dot(q, v)); return Math.max(...d) - Math.min(...d); };
      const ew = span(rightOf(p)), eh = span(upOf(p));
      if (ew <= 0 || eh <= 0) return false;
      cam.setParallelScale(Math.max(eh / 2, ew / 2 / (w / h)) * 1.02);
      return true;
    };
    const ro = new ResizeObserver(() => {
      grw.resize();
      if (needFit.current && fit()) needFit.current = false;
      grw.getRenderWindow().render();
    });
    ro.observe(el);
    needFit.current = true;
    scene.current = { grw, mapper, actor, plane, fit };
    registerCaptureRef.current?.(captureRenderWindow(grw, () => grw.getRenderWindow().render()));
    return () => { registerCaptureRef.current?.(null); ro.disconnect(); scene.current = null; grw.delete(); };
  }, [image]);

  // C pide lo mismo que «ENCUADRAR»: un reencuadre, sin tocar el plano.
  const registerFitRef = useRef(registerFit);
  registerFitRef.current = registerFit;
  useEffect(() => {
    registerFitRef.current?.(() => setFitRequest((r) => r + 1));
    return () => registerFitRef.current?.(null);
  }, []);

  // Declarado antes que el efecto del plano: corre antes en el mismo commit,
  // así que el botón encuadra ya en esa pasada.
  useEffect(() => { needFit.current = true; }, [fitRequest]);

  // Plano y cámara. Depende también de la imagen: al llegar el volumen
  // completo la escena se rehace con un plano nuevo que nadie orientaría.
  useEffect(() => {
    geom.current = { p: freePlane, voxel: mprVoxel };
    const s = scene.current; if (!s) return;
    const n = normalOf(freePlane), o = originOf(freePlane, mprVoxel, meta), up = upOf(freePlane);
    s.plane.setNormal(...n);
    s.plane.setOrigin(...o);
    // Foco en el origen del plano y cámara sobre su normal. Con proyección
    // paralela, el origen y el crosshair caen en el mismo punto de pantalla
    // (uno es el otro desplazado por la normal), así que la rueda mueve el
    // plano bajo un encuadre quieto.
    const renderer = s.grw.getRenderer();
    const cam = renderer.getActiveCamera();
    cam.setFocalPoint(...o);
    cam.setPosition(o[0] - n[0] * 1000, o[1] - n[1] * 1000, o[2] - n[2] * 1000);
    cam.setViewUp(...up);
    if (needFit.current && s.fit()) needFit.current = false;
    renderer.resetCameraClippingRange();
    s.grw.getRenderWindow().render();
  }, [freePlane, mprVoxel, meta, image, fitRequest]);

  // Ventana/nivel aparte: arrastrar no debe reencuadrar la cámara.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.actor.getProperty().setColorWindow(Math.max(1, ww)); s.actor.getProperty().setColorLevel(wc);
    s.grw.getRenderWindow().render();
  }, [wc, ww, image]);

  // React registra la rueda como pasiva (su preventDefault no hace nada y lo
  // avisa en consola): un oyente nativo no pasivo retiene el scroll de la página.
  // Un paso es el espaciado más fino, para no saltarse cortes en ninguna
  // orientación, y el desplazamiento no sale de la caja. Con Ctrl, zoom, como
  // en SliceView.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const step = Math.min(...meta.spacing);
    const h = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const s = scene.current; if (!s) return;
        const cam = s.grw.getRenderer().getActiveCamera();
        cam.setParallelScale(Math.max(1, cam.getParallelScale() * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
        s.grw.getRenderWindow().render();
        return;
      }
      if (e.deltaY === 0) return;
      commitRef.current(wheelOffset(geom.current.p, e.deltaY, step));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [meta]);

  // Botón izquierdo: ventana/nivel. Botón derecho: orientar el plano a partir
  // del que había al empezar (no por incrementos, así volver al punto de
  // partida deshace el gesto). Con captura de puntero, el arrastre sigue
  // aunque el cursor salga del panel.
  const drag = useRef<
    | { kind: "wl"; x: number; y: number; wc: number; ww: number }
    | { kind: "orient"; x: number; y: number; plane: FreePlane }
    | null
  >(null);
  const k = (meta.intensity_range[1] - meta.intensity_range[0]) / 400;   // 400 px recorren todo el rango
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const slider = (label: string, aria: string, [min, max]: [number, number], value: number, set: (v: number) => void) => (
    <span style={{ display: "flex", gap: 12, alignItems: "center", flex: "1 1 200px", minWidth: 0 }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={1} value={Math.round(value)} onChange={(e) => set(Number(e.target.value))}
        style={{ flex: 1, minWidth: 60, accentColor: "var(--hud)" }} aria-label={aria} />
      <span style={{ minWidth: 36, textAlign: "right", color: "var(--hud)" }}>{degLabel(value)}</span>
    </span>
  );
  // Mismas teclas que en los cortes: el paso mueve el plano por el espaciado más fino.
  const onKey = (e: React.KeyboardEvent) => {
    if (isNativeKeyTarget(e.target)) return;
    const step = stepFromKey(e.key); if (step === null) return;
    e.preventDefault();
    const p = geom.current.p;
    commitPlane({ ...p, offsetMm: p.offsetMm + step * Math.min(...meta.spacing) });
  };
  return (
    <div tabIndex={0} onKeyDown={onKey} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#000", outline: "none" }}>
      <div ref={ref} style={{ flex: 1, position: "relative", minHeight: 0, cursor: "crosshair", touchAction: "none" }}
        title="Arrastrar: ventana/nivel · Botón derecho: orientar el plano · Rueda: desplazarlo · Ctrl+rueda: zoom"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 2) return;
          // El interactor de vtk está desatado, pero el gesto es nuestro: que
          // ningún oyente de más arriba lo trate también.
          e.preventDefault(); e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = e.button === 0
            ? { kind: "wl", x: e.clientX, y: e.clientY, wc, ww }
            : { kind: "orient", x: e.clientX, y: e.clientY, plane: geom.current.p };
        }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          // Si el botón del gesto ya no está pulsado (se soltó fuera de la
          // ventana o se perdió el foco sin pointerup), el arrastre acaba aquí:
          // si no, el simple paso del ratón seguiría moviendo el plano o la
          // ventana compartidos en todas las vistas.
          if (!(e.buttons & (d.kind === "wl" ? 1 : 2))) { endDrag(e); return; }
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (d.kind === "wl") onWindowLevel(d.wc - dy * k, Math.max(1, d.ww + dx * k));
          else commitPlane(dragAngles(d.plane, dx, dy));
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
        <HudFrame active={active} label="OBLICUO">
          <HudReadout at="bl" lines={[obliqueReadout(freePlane)]} />
          <HudReadout at="br" lines={[`W ${Math.round(ww)}  L ${Math.round(wc)}`]} />
        </HudFrame>
        {overlay}
      </div>
      {/* La fila se parte en dos líneas en una celda estrecha: sin ello ELEVACIÓN
          quedaba recortada y solo se podía cambiar con el botón derecho. */}
      <div style={{ flexShrink: 0, padding: "8px 16px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", borderTop: "var(--hud-line) solid var(--hud-dim)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--hud-dim)" }}>
        {slider("AZIMUT", "Azimut", AZIMUTH_RANGE, freePlane.azimuthDeg, (v) => commitPlane({ ...freePlane, azimuthDeg: v }))}
        {slider("ELEVACIÓN", "Elevación", ELEVATION_RANGE, freePlane.elevationDeg, (v) => commitPlane({ ...freePlane, elevationDeg: v }))}
        <HudToggleGroup
          options={[{ key: "fit", label: "ENCUADRAR", title: "Reencuadrar el corte" }, { key: "reset", label: "AL PUNTO", title: "Devolver el plano al punto compartido" }]}
          value="" onChange={(key) => { if (key === "reset") commitPlane({ ...freePlane, offsetMm: 0 }); setFitRequest((r) => r + 1); }} />
      </div>
    </div>
  );
}
