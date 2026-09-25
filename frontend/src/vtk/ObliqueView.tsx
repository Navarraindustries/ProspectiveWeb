/* ObliqueView — corte inclinado, resuelto en el navegador con
   vtkImageResliceMapper. El plano pasa por el crosshair (no por el centro
   del volumen, como el oblicuo del servidor), así que lo que se inclina es
   lo que se está mirando. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageResliceMapper from "@kitware/vtk.js/Rendering/Core/ImageResliceMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { usePlanning } from "../store/planning";
import { voxelToMm } from "./geometry";
import { HudFrame } from "./hud/HudFrame";
import { HudReadout } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";

export function ObliqueView({ image, meta, wc, ww, onWindowLevel }: {
  image: vtkImageData; meta: VolumeMeta; wc: number; ww: number; onWindowLevel: (wc: number, ww: number) => void;
}) {
  const { mprVoxel } = usePlanning();
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<{ grw: vtkGenericRenderWindow; mapper: vtkImageResliceMapper; actor: vtkImageSlice; plane: vtkPlane } | null>(null);
  const [tilt, setTilt] = useState(20);
  const [pos, setPos] = useState(0);        // mm a lo largo de la normal, desde el crosshair
  const [axis, setAxis] = useState<"x" | "y">("x");

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(el);
    // Sin interacción de vtk: su estilo trackball giraría la cámara fuera de
    // la normal del plano al arrastrar, y el arrastre aquí es ventana/nivel.
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
    renderer.getActiveCamera().setParallelProjection(true);
    const ro = new ResizeObserver(() => { grw.resize(); grw.getRenderWindow().render(); });
    ro.observe(el);
    scene.current = { grw, mapper, actor, plane };
    return () => { ro.disconnect(); scene.current = null; grw.delete(); };
  }, [image]);

  // Plano y cámara. Depende también de la imagen: al llegar el volumen
  // completo la escena se rehace con un plano nuevo que nadie orientaría.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const th = (tilt * Math.PI) / 180;
    // Plano axial inclinado hacia y (eje X de giro) o hacia x (eje Y).
    const n: [number, number, number] = axis === "x" ? [0, Math.sin(th), Math.cos(th)] : [Math.sin(th), 0, Math.cos(th)];
    const c = voxelToMm(mprVoxel, meta);
    s.plane.setNormal(...n);
    s.plane.setOrigin(c[0] + n[0] * pos, c[1] + n[1] * pos, c[2] + n[2] * pos);
    const cam = s.grw.getRenderer().getActiveCamera();
    cam.setFocalPoint(c[0], c[1], c[2]);
    cam.setPosition(c[0] - n[0] * 1000, c[1] - n[1] * 1000, c[2] - n[2] * 1000);
    // up ⟂ n para toda inclinación (su producto escalar es −sin·cos + cos·sin = 0,
    // y ambos son unitarios), así que nunca degenera.
    cam.setViewUp(axis === "x" ? 0 : -Math.cos(th), axis === "x" ? -Math.cos(th) : 0, Math.sin(th));
    s.grw.getRenderer().resetCamera();
    s.grw.getRenderWindow().render();
  }, [tilt, pos, axis, mprVoxel, meta, image]);

  // Ventana/nivel aparte: arrastrar no debe reencuadrar la cámara.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.actor.getProperty().setColorWindow(Math.max(1, ww)); s.actor.getProperty().setColorLevel(wc);
    s.grw.getRenderWindow().render();
  }, [wc, ww, image]);

  // React registra la rueda como pasiva (su preventDefault no hace nada y lo
  // avisa en consola): un oyente nativo no pasivo retiene el scroll de la página.
  // Un paso es un espaciado z (meta.spacing es [z, y, x]).
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); setPos((p) => p + (e.deltaY > 0 ? 1 : -1) * meta.spacing[0]); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [meta]);

  const drag = useRef<{ x: number; y: number; wc: number; ww: number } | null>(null);
  const k = (meta.intensity_range[1] - meta.intensity_range[0]) / 400;   // 400 px recorren todo el rango
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#000" }}>
      <div ref={ref} style={{ flex: 1, position: "relative", minHeight: 0, cursor: "crosshair" }}
        title="Rueda: desplazar el plano · Arrastrar: ventana/nivel"
        onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, wc, ww }; } }}
        onMouseMove={(e) => { const d = drag.current; if (!d) return; onWindowLevel(d.wc - (e.clientY - d.y) * k, Math.max(1, d.ww + (e.clientX - d.x) * k)); }}
        onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}>
        <HudFrame label="OBLICUO">
          <HudReadout at="bl" lines={[`INCL ${tilt}°  EJE ${axis.toUpperCase()}`, `DESPL ${pos.toFixed(1)} mm`]} />
          <HudReadout at="br" lines={[`W ${Math.round(ww)}  L ${Math.round(wc)}`]} />
        </HudFrame>
      </div>
      <div style={{ flexShrink: 0, padding: "8px 16px", display: "flex", gap: 16, alignItems: "center", borderTop: "var(--hud-line) solid var(--hud-dim)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--hud-dim)" }}>
        <span>INCLINACIÓN</span>
        <input type="range" min={-80} max={80} value={tilt} onChange={(e) => setTilt(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--hud)" }} aria-label="Inclinación" />
        <HudToggleGroup options={[{ key: "x", label: "EJE X" }, { key: "y", label: "EJE Y" }]} value={axis} onChange={(v) => setAxis(v as "x" | "y")} />
        <HudToggleGroup options={[{ key: "reset", label: "CENTRAR" }]} value="" onChange={() => setPos(0)} />
      </div>
    </div>
  );
}
