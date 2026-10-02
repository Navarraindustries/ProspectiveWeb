/* MipView — la vista «VOLUMEN»: el volumen que crece con el corte.

   Es el mismo vtkImageData de los planos con un vtkVolumeMapper. Dos modos:
   MIP (máxima intensidad, en gris desde el umbral) y COMPUESTO (composición
   con sombreado y los preajustes de tejido del antiguo modo «Volumen» del
   3D, llevados al rango de intensidades de este volumen). Recorte, traza y
   gestos son los mismos en los dos.
   «Acumulado»: un plano de recorte en el corte actual deja ver solo lo que ya
   se ha recorrido, así que al avanzar el volumen aparece y al retroceder
   desaparece. «Lámina»: dos planos a ±N mm. La función de transferencia
   «Vasos» arranca en el umbral inferior de la banda, no en HU fijos.

   Los gestos son los de SliceView para no cambiar de mano al cambiar de
   vista: la rueda avanza el corte compartido (y el MIP se ve construirse),
   Ctrl+rueda hace zoom, Shift+arrastrar o el botón central desplazan. Lo
   propio del MIP es que arrastrar lo gira (se entiende girándolo) y que elige
   su eje de acumulación (AX · COR · SAG) sin depender de la vista principal. */

import { useEffect, useRef, useState } from "react";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkVolume from "@kitware/vtk.js/Rendering/Core/Volume";
import vtkVolumeMapper from "@kitware/vtk.js/Rendering/Core/VolumeMapper";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import vtkInteractorStyleManipulator from "@kitware/vtk.js/Interaction/Style/InteractorStyleManipulator";
import vtkMouseCameraTrackballRotateManipulator from "@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballRotateManipulator";
import vtkMouseCameraTrackballPanManipulator from "@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballPanManipulator";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { usePlanning } from "../store/planning";
import { cameraHeading, effectiveDirection, sliceCamera, type Orientation, type Plane } from "./geometry";
import { PLANE_HEX } from "./planeColors";
import { HudFrame } from "./hud/HudFrame";
import { HudHeadingTape } from "./hud/HudHeadingTape";
import { HudLadder } from "./hud/HudLadder";
import { HudReadout } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { captureRenderWindow, type CaptureFn } from "./captureRenderWindow";
import { createOrientationInset, INSET_VIEWPORT, type OrientationInset } from "./OrientationInset";
import { mipReadoutLines } from "./mipReadout";
import { presetToRange, VOLUME_PRESETS, type VolumePreset } from "./volumePresets";
import { AXIS_OF, indexOf, wheelAction, withIndex } from "./mipGestures";
import { planeCorners, toPixels, tracePolygon, traceVisible } from "./planeTrace";

type Vec3 = [number, number, number];

const PLANE_OPTIONS = [
  { key: "axial", label: "AX", title: "Acumular en el eje axial" },
  { key: "coronal", label: "COR", title: "Acumular en el eje coronal" },
  { key: "sagital", label: "SAG", title: "Acumular en el eje sagital" },
];

const RENDER_OPTIONS = [
  { key: "mip", label: "MIP", title: "Proyección de máxima intensidad" },
  { key: "compuesto", label: "COMPUESTO", title: "Composición por tejidos con el preajuste elegido" },
];
const PRESET_OPTIONS = VOLUME_PRESETS.map((p) => ({ key: p, label: p.toUpperCase(), title: `Preajuste «${p}»` }));

/** Cámara de frente al eje de vóxel que se acumula, centrada en el volumen.
 *  El recorte sigue los ejes de vóxel, así que la cámara también: en un
 *  volumen no alineado con LPS la vista anatómica miraría el plano de canto. */
function cameraToPlane(grw: vtkGenericRenderWindow, image: vtkImageData, plane: Plane) {
  const renderer = grw.getRenderer();
  const cam = renderer.getActiveCamera();
  const { direction, viewUp } = sliceCamera(plane);
  const b = image.getBounds();
  const c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
  cam.setFocalPoint(c[0], c[1], c[2]);
  cam.setPosition(c[0] - direction[0] * 1000, c[1] - direction[1] * 1000, c[2] - direction[2] * 1000);
  cam.setViewUp(viewUp[0], viewUp[1], viewUp[2]);
  renderer.resetCamera();
}

export function MipView({ image, meta, orientation, compact = false, plane, onPlaneChange, registerCapture }: {
  image: vtkImageData; meta: VolumeMeta; orientation: Orientation; compact?: boolean;
  /** Eje en el que acumula y que recorre la rueda. */
  plane: Plane;
  onPlaneChange: (p: Plane) => void;
  /** Publica la captura de este panel en PNG mientras su escena viva.
   *  El lienzo de vtk.js se lee negro si no se pide la imagen del
   *  siguiente render, así que la captura tiene que salir de aquí. */
  registerCapture?: (fn: CaptureFn | null) => void;
}) {
  const {
    mprVoxel, setMprVoxel, mipMode, setMipMode, mipSlabMm, setMipSlabMm, previewBand, segmentation,
    volumeMode, setVolumeMode, volumePreset, setVolumePreset,
  } = usePlanning();
  // Por ref: cambiar de destinatario no puede rehacer la escena.
  const registerCaptureRef = useRef(registerCapture);
  registerCaptureRef.current = registerCapture;
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<{ grw: vtkGenericRenderWindow; mapper: vtkVolumeMapper; actor: vtkVolume } | null>(null);
  const [heading, setHeading] = useState<ReturnType<typeof cameraHeading> | null>(null);
  const [reverse, setReverse] = useState(false);
  // Contornos del corte actual sobre el MIP, un atributo `points` por plano
  // separados por «|»; null si la cámara mira el plano de canto.
  const [trace, setTrace] = useState<string | null>(null);
  // La cámara avisa desde vtk, fuera del ciclo de React: leer la orientación
  // de un ref evita que el oyente se quede con la de cuando se montó (la
  // orientación fijada a mano puede cambiar sin rehacer la escena).
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const insetRef = useRef<OrientationInset | null>(null);
  // La escena se crea con el eje vigente pero no se rehace al cambiarlo.
  const planeRef = useRef(plane);
  planeRef.current = plane;

  const axis = AXIS_OF[plane];
  const index = indexOf(plane, mprVoxel);
  const count = plane === "axial" ? meta.shape[0] : plane === "coronal" ? meta.shape[1] : meta.shape[2];
  const spacingAlong = plane === "axial" ? meta.spacing[0] : plane === "coronal" ? meta.spacing[1] : meta.spacing[2];
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
    cameraToPlane(grw, image, planeRef.current);
    // Rotar con el botón izquierdo, desplazar con el central o con Shift. Sin
    // manipulador de zoom: Ctrl+rueda lo resuelve el oyente de rueda de abajo
    // (el de vtk acercaba al girar hacia abajo, al revés que los cortes). vtk
    // elige el manipulador por modificadores exactos, así que Shift+izquierdo
    // desplaza sin rotar a la vez.
    const style = vtkInteractorStyleManipulator.newInstance();
    const rotate = vtkMouseCameraTrackballRotateManipulator.newInstance(); rotate.setButton(1);
    const panMid = vtkMouseCameraTrackballPanManipulator.newInstance(); panMid.setButton(2);
    const panShift = vtkMouseCameraTrackballPanManipulator.newInstance(); panShift.setButton(1); panShift.setShift(true);
    style.addMouseManipulator(rotate); style.addMouseManipulator(panMid); style.addMouseManipulator(panShift);
    grw.getInteractor().setInteractorStyle(style);
    // El maniquí del recuadro sigue a esta cámara: al rotar el MIP se ve desde
    // dónde se está mirando al paciente, no solo el número de la cinta.
    const inset = createOrientationInset(grw.getRenderWindow(), renderer, orientationRef.current);
    insetRef.current = inset;
    const readHeading = () => setHeading(cameraHeading(
      cam.getDirectionOfProjection() as Vec3, cam.getViewUp() as Vec3, orientationRef.current,
    ));
    // La traza depende de la cámara además del corte: se recalcula en cada
    // giro, zoom o desplazamiento (y al cambiar el tamaño), por ref para usar
    // siempre el corte y el modo de este render.
    const sub = cam.onModified(() => { readHeading(); computeTraceRef.current(); });
    readHeading();
    const ro = new ResizeObserver(() => { grw.resize(); grw.getRenderWindow().render(); computeTraceRef.current(); });
    ro.observe(el);
    scene.current = { grw, mapper, actor };
    grw.getRenderWindow().render();
    computeTraceRef.current();
    registerCaptureRef.current?.(captureRenderWindow(grw, () => grw.getRenderWindow().render()));
    return () => { registerCaptureRef.current?.(null); sub.unsubscribe(); inset.dispose(); insetRef.current = null; ro.disconnect(); scene.current = null; grw.delete(); };
  }, [image]);

  // Al cambiar de eje solo se mueve la cámara (y, abajo, los planos de
  // recorte): la escena y su volumen siguen siendo los mismos. Al montar
  // repite lo que ya hizo la escena, sin efecto visible.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    cameraToPlane(s.grw, image, plane);
    s.grw.getRenderWindow().render();
  // Solo el eje: la imagen nueva ya coloca la cámara al rehacer la escena, y
  // repetirlo aquí desharía el giro del profesional sin que cambiara el eje.
  }, [plane]);   // eslint-disable-line react-hooks/exhaustive-deps

  // La rueda es nuestra: en fase de captura sobre el contenedor (donde vtk
  // escucha la suya, en fase de burbuja) llega antes y la detiene. También
  // Ctrl+rueda: el zoom se hace aquí con el sentido de SliceView (arriba
  // acerca), y preventDefault impide además el zoom de la página (el pellizco
  // del trackpad llega como Ctrl+rueda y va por el mismo camino). No pasiva,
  // como en SliceView, para que preventDefault sirva; el ref da siempre el
  // corte de este render sin volver a registrar el oyente.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e) => {
    const a = wheelAction(e, index, count);
    e.preventDefault(); e.stopImmediatePropagation();
    if (a.kind === "zoom") {
      const s = scene.current; if (!s) return;
      const renderer = s.grw.getRenderer();
      const cam = renderer.getActiveCamera();
      if (cam.getParallelProjection()) cam.setParallelScale(cam.getParallelScale() / a.factor);
      else { cam.dolly(a.factor); renderer.resetCameraClippingRange(); }
      s.grw.getRenderWindow().render();
      return;
    }
    if (a.kind === "slice" && a.next !== index) setMprVoxel(withIndex(plane, mprVoxel, a.next));
  };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", h, { capture: true });
  }, []);

  // Si cambia la orientación (fijada a mano), la cinta se recalcula sin
  // esperar a que la cámara se mueva.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const cam = s.grw.getRenderer().getActiveCamera();
    setHeading(cameraHeading(cam.getDirectionOfProjection() as Vec3, cam.getViewUp() as Vec3, orientation));
    insetRef.current?.setOrientation(orientation);
  }, [orientation.direction, orientation.manual]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Maximizado, la fila de controles (AX · COR · SAG · ACUMULADO · CENTRAR) ocupa el pie de la
  // esquina derecha: el recuadro sube por encima. En la celda estrecha la
  // escalera de cortes (44 px) ocupa todo el borde derecho y el recuadro caía
  // debajo de sus marcas: va a la esquina superior izquierda, libre porque en
  // la celda no hay cinta de rumbo.
  useEffect(() => {
    const [x0, y0, x1, y1] = INSET_VIEWPORT;
    const w = x1 - x0, h = y1 - y0;
    insetRef.current?.setViewport(compact ? [0.02, 0.96 - h, 0.02 + w, 0.96] : [x0, y0 + 0.09, x1, y1 + 0.09]);
  }, [compact, image]);

  // Modo de mezcla y función de transferencia van juntos: cada modo tiene la
  // suya. MIP: «Vasos» gris, opaca desde el umbral inferior. COMPUESTO: el
  // preajuste de tejido llevado al rango robusto del volumen
  // (`intensity_range`, [p0.5, p99.9]), cercano al p1–p99 que el servidor
  // reescalaba a 0–255 para el antiguo VolumeView: el mapeo es aproximado.
  // Funciones nuevas en cada pasada (no se acumulan puntos al ir y volver
  // entre modos). Depende también de la imagen: al llegar el volumen completo
  // la escena se rehace con un actor nuevo que nace sin función de
  // transferencia y con el mapper en MIP.
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const ctf = vtkColorTransferFunction.newInstance();
    const otf = vtkPiecewiseFunction.newInstance();
    const prop = s.actor.getProperty();
    if (volumeMode === "mip") {
      s.mapper.setBlendModeToMaximumIntensity();
      ctf.addRGBPoint(rlo, 0, 0, 0); ctf.addRGBPoint(lo, 0.25, 0.25, 0.25); ctf.addRGBPoint(rhi, 1, 1, 1);
      otf.addPoint(rlo, 0); otf.addPoint(lo, 0); otf.addPoint(lo + (rhi - lo) * 0.15, 0.9); otf.addPoint(rhi, 1);
      prop.setShade(false);
    } else {
      s.mapper.setBlendModeToComposite();
      const t = presetToRange(volumePreset, [rlo, rhi]);
      t.color.forEach(([x, r, g, b]) => ctf.addRGBPoint(x, r, g, b));
      t.opacity.forEach(([x, a]) => otf.addPoint(x, a));
      prop.setAmbient(t.lighting.ambient); prop.setDiffuse(t.lighting.diffuse); prop.setSpecular(t.lighting.specular);
      // Con sombreado y la misma distancia de muestreo que el MIP (mín.
      // espaciado × 1,2): si en el navegador la celda principal no llegara a
      // 20 fps, la salida prevista es ×1,5 y sin sombreado.
      prop.setShade(true);
    }
    prop.setRGBTransferFunction(0, ctf); prop.setScalarOpacity(0, otf);
    prop.setInterpolationTypeToLinear();
    s.grw.getRenderWindow().render();
  }, [lo, rlo, rhi, image, volumeMode, volumePreset]);

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
  }, [axis, posMm, mipMode, mipSlabMm, reverse, image]);

  // Proyecta con la cámara del MIP las esquinas del volumen en el plano (o los
  // dos planos de la lámina). Son 4 u 8 proyecciones: barato para cada evento
  // de cámara.
  const computeTraceRef = useRef<() => void>(() => {});
  computeTraceRef.current = () => {
    const s = scene.current; const el = ref.current;
    if (!s || !el) { setTrace(null); return; }
    const ren = s.grw.getRenderer();
    const cam = ren.getActiveCamera();
    if (!traceVisible(cam.getDirectionOfProjection() as Vec3, axis)) { setTrace(null); return; }
    const { width, height } = el.getBoundingClientRect();
    if (width < 1 || height < 1) { setTrace(null); return; }
    const aspect = width / height;
    const bounds = image.getBounds();
    const toPx = (p: Vec3) => {
      const d = ren.worldToNormalizedDisplay(p[0], p[1], p[2], aspect);
      return toPixels([d[0], d[1]], width, height);
    };
    const planes = mipMode === "acumulado" ? [posMm] : [posMm - mipSlabMm, posMm + mipSlabMm];
    const next = planes.map((mm) => tracePolygon(planeCorners(bounds, axis, mm).map(toPx))).join("|");
    // Evita renders de React cuando la cámara se mueve sin cambiar la traza.
    setTrace((prev) => (prev === next ? prev : next));
  };
  useEffect(() => { computeTraceRef.current(); }, [posMm, axis, mipMode, mipSlabMm, image]);

  const fit = () => { const s = scene.current; if (!s) return; s.grw.getRenderer().resetCamera(); s.grw.getRenderWindow().render(); };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} title="Arrastrar: rotar · Shift o botón central: desplazar · Rueda: corte · Ctrl+rueda: zoom" />
      <HudFrame label="VOLUMEN" active={!compact}>
        {heading && !compact && (
          // La cinta va arriba centrada, justo donde HudFrame pone el rótulo:
          // bajarla una línea deja leer «VOLUMEN». En la celda pequeña no cabe
          // (el rumbo pisa las marcas), y se lee al maximizar para rotar.
          <div style={{ position: "absolute", top: 18, left: 0, right: 0, height: 28 }}>
            <HudHeadingTape azimuthDeg={heading.azimuthDeg} elevationDeg={heading.elevationDeg} known={heading.known} />
          </div>
        )}
        {trace && (
          // Dónde está el corte dentro de lo que se ve: en el color de su
          // plano (PLANE_HEX) al 60 %, sin capturar el ratón, y oculta con
          // REGLAS ○ como el resto de líneas.
          <svg className="hud-decor" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {trace.split("|").map((pts, i) => <polygon key={i} points={pts} fill="none" stroke={PLANE_HEX[plane]} strokeOpacity={0.6} strokeWidth={1} />)}
          </svg>
        )}
        <HudLadder count={count} index={index} />
        {/* En la celda no hay cinta de rumbo con corchetes: sin esta línea el
            gris del maniquí sería la única señal de orientación supuesta. Va
            justo debajo del recuadro, que en la celda está arriba a la izquierda. */}
        {compact && !effectiveDirection(orientation).known && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: "calc(28% - 18px)" }}>
            <HudReadout at="tl" lines={["ORIENTACIÓN ASUMIDA"]} tone="warn" />
          </div>
        )}
        {/* El eje va arriba a la izquierda, como AX · COR · SAG en el HUD del
            3D: en la fila de abajo, junto a modo y CENTRAR, tapaba la lectura
            de la izquierda en ventanas de 1280 px. MIP · COMPUESTO va a su
            lado: es la otra pregunta de «cómo se ve» este volumen. */}
        {!compact && (
          <div style={{ position: "absolute", top: 52, left: 14, display: "flex", gap: 14, alignItems: "center", pointerEvents: "auto" }}>
            <HudToggleGroup options={PLANE_OPTIONS} value={plane} onChange={(k) => onPlaneChange(k as Plane)} />
            <HudToggleGroup options={RENDER_OPTIONS} value={volumeMode} onChange={(k) => setVolumeMode(k as "mip" | "compuesto")} />
          </div>
        )}
        <HudReadout at="bl" lines={mipReadoutLines({ mode: mipMode, reverse, index, count, slabMm: mipSlabMm, threshold: lo, compact, render: volumeMode, preset: volumePreset })} />
        {!compact && volumeMode === "compuesto" && (
          // Encima de la lectura de la izquierda y una fila por encima de la de
          // abajo a la derecha (bottom: 58): a la misma altura, en paneles
          // estrechos, los seis nombres llegaban hasta ACUMULADO y CENTRAR.
          // El ancho máximo deja libre la escalera de cortes si la fila se
          // parte; sin `right` la caja no tapa el arrastre fuera de los nombres.
          <div style={{ position: "absolute", bottom: 86, left: 14, maxWidth: "calc(100% - 72px)", pointerEvents: "auto" }}>
            <HudToggleGroup options={PRESET_OPTIONS} value={volumePreset} onChange={(k) => setVolumePreset(k as VolumePreset)} style={{ flexWrap: "wrap" }} />
          </div>
        )}
        {!compact && (
          // right: 58 deja libre la escalera de cortes (44 px) para CENTRAR.
          // bottom: 58 la sube por encima de las dos líneas de la lectura de
          // la izquierda: a la misma altura se pisaban en paneles de ~530 px.
          <div style={{ position: "absolute", bottom: 58, right: 58, display: "flex", gap: 14, alignItems: "center", pointerEvents: "auto" }}>
            <HudToggleGroup options={[{ key: "acumulado", label: "ACUMULADO" }, { key: "lamina", label: "LÁMINA" }]} value={mipMode} onChange={(k) => setMipMode(k as "acumulado" | "lamina")} />
            {mipMode === "acumulado"
              ? <HudToggleGroup options={[{ key: "rev", label: reverse ? "DESDE EL FINAL" : "DESDE EL INICIO" }]} value="rev" onChange={() => setReverse(!reverse)} />
              : <input type="range" min={2} max={40} value={mipSlabMm} onChange={(e) => setMipSlabMm(Number(e.target.value))} style={{ width: 90, accentColor: "var(--hud)" }} title="Grosor de la lámina" />}
            <HudToggleGroup options={[{ key: "fit", label: "CENTRAR" }]} value="" onChange={fit} />
          </div>
        )}
      </HudFrame>
    </div>
  );
}
