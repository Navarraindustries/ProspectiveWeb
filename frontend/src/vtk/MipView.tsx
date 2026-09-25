/* MipView — proyección de máxima intensidad que crece con el corte.

   Es el mismo vtkImageData de los planos con un vtkVolumeMapper en modo MIP.
   «Acumulado»: un plano de recorte en el corte actual deja ver solo lo que ya
   se ha recorrido, así que al avanzar el volumen aparece y al retroceder
   desaparece. «Lámina»: dos planos a ±N mm. La función de transferencia
   «Vasos» arranca en el umbral inferior de la banda, no en HU fijos.

   A diferencia de SliceView, aquí se conserva la interacción de vtk
   (arrastrar rota, rueda hace zoom): un MIP se entiende girándolo. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkVolume from "@kitware/vtk.js/Rendering/Core/Volume";
import vtkVolumeMapper from "@kitware/vtk.js/Rendering/Core/VolumeMapper";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { usePlanning } from "../store/planning";
import { cameraHeading, sliceCamera, type Orientation, type Plane } from "./geometry";
import { HudFrame } from "./hud/HudFrame";
import { HudHeadingTape } from "./hud/HudHeadingTape";
import { HudLadder } from "./hud/HudLadder";
import { HudReadout } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { createOrientationInset, INSET_VIEWPORT, type OrientationInset } from "./OrientationInset";

type Vec3 = [number, number, number];

const AXIS_OF: Record<Plane, 0 | 1 | 2> = { sagital: 0, coronal: 1, axial: 2 };   // eje vtk (x,y,z)

export function MipView({ image, meta, orientation, compact = false, mainPlane = "axial" }: {
  image: vtkImageData; meta: VolumeMeta; orientation: Orientation; compact?: boolean; mainPlane?: Plane;
}) {
  const { mprVoxel, mipMode, setMipMode, mipSlabMm, setMipSlabMm, previewBand, segmentation } = usePlanning();
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<{ grw: vtkGenericRenderWindow; mapper: vtkVolumeMapper; actor: vtkVolume } | null>(null);
  const [heading, setHeading] = useState<ReturnType<typeof cameraHeading> | null>(null);
  const [reverse, setReverse] = useState(false);
  // La cámara avisa desde vtk, fuera del ciclo de React: leer la orientación
  // de un ref evita que el oyente se quede con la de cuando se montó (la
  // orientación fijada a mano puede cambiar sin rehacer la escena).
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const insetRef = useRef<OrientationInset | null>(null);

  const axis = AXIS_OF[mainPlane];
  const index = mainPlane === "axial" ? mprVoxel.z : mainPlane === "coronal" ? mprVoxel.y : mprVoxel.x;
  const count = mainPlane === "axial" ? meta.shape[0] : mainPlane === "coronal" ? meta.shape[1] : meta.shape[2];
  const spacingAlong = mainPlane === "axial" ? meta.spacing[0] : mainPlane === "coronal" ? meta.spacing[1] : meta.spacing[2];
  // El vtkImageData tiene origen 0 y el tamaño físico del nativo (el nivel
  // grueso agranda el espaciado), así que índice nativo × espaciado nativo es
  // la coordenada de mundo del corte en cualquiera de los dos niveles.
  const posMm = index * spacingAlong;
  // Umbral inferior de la banda: lo que se está segmentando o lo segmentado.
  const lower = previewBand?.[0] ?? (segmentation ? Number(segmentation.threshold_lower ?? NaN) : NaN);
  const [rlo, rhi] = meta.intensity_range;
  // Si no hay banda, el 60 % del rango robusto: en angio-TC queda por encima
  // de partes blandas y hueso esponjoso, así que no aparece la piel.
  const rawLo = Number.isFinite(lower) ? lower : rlo + 0.6 * (rhi - rlo);
  // Dentro del rango: una banda fuera de él dejaría la rampa sin pendiente.
  const lo = Math.min(Math.max(rawLo, rlo), rhi - 1);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
    grw.setContainer(el);
    const renderer = grw.getRenderer();
    const mapper = vtkVolumeMapper.newInstance();
    mapper.setInputData(image);
    mapper.setBlendModeToMaximumIntensity();
    mapper.setSampleDistance(Math.min(...image.getSpacing()) * 1.2);
    const actor = vtkVolume.newInstance();
    actor.setMapper(mapper);
    renderer.addVolume(actor);
    const cam = renderer.getActiveCamera();
    const { direction, viewUp } = sliceCamera(mainPlane);
    const b = image.getBounds();
    const c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
    cam.setFocalPoint(c[0], c[1], c[2]);
    cam.setPosition(c[0] - direction[0] * 1000, c[1] - direction[1] * 1000, c[2] - direction[2] * 1000);
    cam.setViewUp(viewUp[0], viewUp[1], viewUp[2]);
    renderer.resetCamera();
    // El maniquí del recuadro sigue a esta cámara: al rotar el MIP se ve desde
    // dónde se está mirando al paciente, no solo el número de la cinta.
    const inset = createOrientationInset(grw.getRenderWindow(), renderer, orientationRef.current);
    insetRef.current = inset;
    const readHeading = () => setHeading(cameraHeading(
      cam.getDirectionOfProjection() as Vec3, cam.getViewUp() as Vec3, orientationRef.current,
    ));
    const sub = cam.onModified(readHeading);
    readHeading();
    const ro = new ResizeObserver(() => { grw.resize(); grw.getRenderWindow().render(); });
    ro.observe(el);
    scene.current = { grw, mapper, actor };
    grw.getRenderWindow().render();
    return () => { sub.unsubscribe(); inset.dispose(); insetRef.current = null; ro.disconnect(); scene.current = null; grw.delete(); };
  }, [image, mainPlane]);

  // Si cambia la orientación (fijada a mano), la cinta se recalcula sin
  // esperar a que la cámara se mueva.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const cam = s.grw.getRenderer().getActiveCamera();
    setHeading(cameraHeading(cam.getDirectionOfProjection() as Vec3, cam.getViewUp() as Vec3, orientation));
    insetRef.current?.setOrientation(orientation);
  }, [orientation.direction, orientation.manual]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Maximizado, la fila de controles (ACUMULADO · AJUSTAR) ocupa el pie de la
  // esquina derecha: el recuadro sube por encima. En la celda no hay controles.
  useEffect(() => {
    const [x0, y0, x1, y1] = INSET_VIEWPORT;
    const lift = compact ? 0 : 0.09;
    insetRef.current?.setViewport([x0, y0 + lift, x1, y1 + lift]);
  }, [compact, image, mainPlane]);

  // Función de transferencia «Vasos»: gris, opaca desde el umbral inferior.
  // Depende también de la imagen: al llegar el volumen completo la escena se
  // rehace con un actor nuevo que nace sin función de transferencia.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const ctf = vtkColorTransferFunction.newInstance();
    ctf.addRGBPoint(rlo, 0, 0, 0); ctf.addRGBPoint(lo, 0.25, 0.25, 0.25); ctf.addRGBPoint(rhi, 1, 1, 1);
    const otf = vtkPiecewiseFunction.newInstance();
    otf.addPoint(rlo, 0); otf.addPoint(lo, 0); otf.addPoint(lo + (rhi - lo) * 0.15, 0.9); otf.addPoint(rhi, 1);
    const prop = s.actor.getProperty();
    prop.setRGBTransferFunction(0, ctf); prop.setScalarOpacity(0, otf);
    prop.setInterpolationTypeToLinear(); prop.setShade(false);
    s.grw.getRenderWindow().render();
  }, [lo, rlo, rhi, image, mainPlane]);

  // Planos de recorte: es lo que hace que el MIP «avance» con el corte.
  // vtk conserva el semiespacio (p − origen)·normal ≥ 0.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    s.mapper.removeAllClippingPlanes();
    const n = (sign: 1 | -1): Vec3 => { const v: Vec3 = [0, 0, 0]; v[axis] = sign; return v; };
    const o = (mm: number): Vec3 => { const v: Vec3 = [0, 0, 0]; v[axis] = mm; return v; };
    if (mipMode === "acumulado") {
      // Normal −eje: queda lo de índice ≤ actual; «desde el final», lo ≥ actual.
      const pl = vtkPlane.newInstance(); pl.setOrigin(...o(posMm)); pl.setNormal(...n(reverse ? 1 : -1));
      s.mapper.addClippingPlane(pl);
    } else {
      const a = vtkPlane.newInstance(); a.setOrigin(...o(posMm - mipSlabMm)); a.setNormal(...n(1));
      const b = vtkPlane.newInstance(); b.setOrigin(...o(posMm + mipSlabMm)); b.setNormal(...n(-1));
      s.mapper.addClippingPlane(a); s.mapper.addClippingPlane(b);
    }
    s.grw.getRenderWindow().render();
  }, [axis, posMm, mipMode, mipSlabMm, reverse, image, mainPlane]);

  const fit = () => { const s = scene.current; if (!s) return; s.grw.getRenderer().resetCamera(); s.grw.getRenderWindow().render(); };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} title="Arrastrar: rotar · Rueda: zoom" />
      <HudFrame label="MIP" active={!compact}>
        {heading && !compact && (
          // La cinta va arriba centrada, justo donde HudFrame pone el rótulo:
          // bajarla una línea deja leer «MIP». En la celda pequeña no cabe
          // (el rumbo pisa las marcas), y se lee al maximizar para rotar.
          <div style={{ position: "absolute", top: 18, left: 0, right: 0, height: 28 }}>
            <HudHeadingTape azimuthDeg={heading.azimuthDeg} elevationDeg={heading.elevationDeg} known={heading.known} />
          </div>
        )}
        <HudLadder count={count} index={index} />
        <HudReadout at="bl" lines={[mipMode === "acumulado" ? `ACUMULADO ${reverse ? "DESDE" : "HASTA"} ${index + 1}/${count}` : `LÁMINA ±${mipSlabMm} mm`, `UMBRAL ${Math.round(lo)}`]} />
        {!compact && (
          <div style={{ position: "absolute", bottom: 22, right: 14, display: "flex", gap: 14, alignItems: "center", pointerEvents: "auto" }}>
            <HudToggleGroup options={[{ key: "acumulado", label: "ACUMULADO" }, { key: "lamina", label: "LÁMINA" }]} value={mipMode} onChange={(k) => setMipMode(k as "acumulado" | "lamina")} />
            {mipMode === "acumulado"
              ? <HudToggleGroup options={[{ key: "rev", label: reverse ? "DESDE EL FINAL" : "DESDE EL INICIO" }]} value="rev" onChange={() => setReverse(!reverse)} />
              : <input type="range" min={2} max={40} value={mipSlabMm} onChange={(e) => setMipSlabMm(Number(e.target.value))} style={{ width: 90, accentColor: "var(--hud)" }} title="Grosor de la lámina" />}
            <HudToggleGroup options={[{ key: "fit", label: "AJUSTAR" }]} value="" onChange={fit} />
          </div>
        )}
      </HudFrame>
    </div>
  );
}
