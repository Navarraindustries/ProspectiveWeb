/* Recuadro de orientación: cubo anotado + maniquí en una esquina del 3D/MIP.

   No usa vtkOrientationMarkerWidget porque admite un solo actor y aquí hay
   dos. Se hace lo mismo que hace él: un renderer propio en la capa 1 con su
   viewport, cuya cámara copia la orientación de la principal cada vez que
   esta cambia. Los actores viven en LPS; la matriz de dirección del volumen
   (real, manual o asumida) los lleva al espacio del volumen, que es el de la
   cámara. Verde si la orientación viene del DICOM; gris si es manual o
   asumida, igual que los corchetes de las etiquetas. */

import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkAnnotatedCubeActor from "@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor";
import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import { effectiveDirection, lpsToVolumeUserMatrix, type Orientation } from "./geometry";

const HUD = "#8CFF9E";          // --hud
const GREY = "#7A7F7B";
const FIGURE_HUD: [number, number, number] = [0.55, 1, 0.62];
const FIGURE_GREY: [number, number, number] = [0.5, 0.5, 0.5];

/* vtkAnnotatedCubeActor pinta cada cara en un <canvas> propio y la lee con
   getImageData; Chrome avisa en consola («Multiple readback operations…»)
   porque ese contexto no se pidió con willReadFrequently. El canvas es
   privado, así que mientras se construye el cubo (síncrono) cada canvas
   nuevo nace con su contexto 2D ya pedido con esa opción: el getContext("2d")
   posterior de vtk.js recibe ese mismo contexto. */
function withReadbackCanvases<T>(build: () => T): T {
  const create = document.createElement;
  document.createElement = function (this: Document, tag: string, opts?: ElementCreationOptions) {
    const el = create.call(this, tag, opts);
    if (el instanceof HTMLCanvasElement) el.getContext("2d", { willReadFrequently: true });
    return el;
  } as typeof document.createElement;
  try {
    return build();
  } finally {
    document.createElement = create;
  }
}

/** Esquina inferior derecha, en fracciones del lienzo (x0, y0, x1, y1). */
export const INSET_VIEWPORT: [number, number, number, number] = [0.8, 0.0, 1.0, 0.24];

export function createOrientationInset(rw: vtkRenderWindow, main: vtkRenderer, orientation: Orientation) {
  if (rw.getNumberOfLayers() < 2) rw.setNumberOfLayers(2);
  const inset = vtkRenderer.newInstance();
  inset.setLayer(1);            // capa 1: conserva el color de la escena (fondo transparente)
  inset.setInteractive(false);  // los clics van a la escena, no al recuadro
  inset.setViewport(...INSET_VIEWPORT);
  rw.addRenderer(inset);

  // Cubo de «cristal»: caras casi transparentes con la letra y el borde, y
  // sin caras traseras. Opaco taparía el maniquí, que va dentro; con caras
  // traseras se leerían seis rótulos, tres de ellos en espejo.
  //
  // Dos cubos hechos de una vez, gris y verde, y se enciende uno: cambiar el
  // estilo de un cubo ya dibujado vuelve a subir sus texturas y WebGL avisa
  // «Texture is immutable». Con el estilo y las caras en newInstance cada
  // cubo pinta sus seis caras una sola vez (no seis más por cada setter).
  const makeCube = (color: string) => {
    const c = withReadbackCanvases(() => vtkAnnotatedCubeActor.newInstance({
      defaultStyle: {
        text: "", faceRotation: 0,
        fontStyle: "bold", fontFamily: "JetBrains Mono", fontColor: color,
        faceColor: "rgba(0,0,0,0.25)", edgeThickness: 0.04, edgeColor: color, resolution: 256,
        // Letra pequeña: el maniquí se ve a través de la cara frontal.
        fontSizeScale: (res: number) => res / 4.6,
      },
      xPlusFaceProperty: { text: "IZQ" }, xMinusFaceProperty: { text: "DER" },
      yPlusFaceProperty: { text: "POST" }, yMinusFaceProperty: { text: "ANT" },
      zPlusFaceProperty: { text: "SUP" }, zMinusFaceProperty: { text: "INF" },
    } as never));
    c.setScale(1.15, 1.15, 1.15);
    c.setForceTranslucent(true);
    c.getProperty().setBackfaceCulling(true);
    c.setPickable(false);
    inset.addActor(c);
    return c;
  };
  const greyCube = makeCube(GREY);
  const hudCube = makeCube(HUD);

  const figure = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();
  mapper.setScalarVisibility(false);
  figure.setMapper(mapper);
  figure.setPickable(false);
  // El .vtp va de z ≈ −0.15 (pies) a 0.93 (cabeza): se centra en el cubo.
  figure.setPosition(0, 0, -0.35);
  figure.setScale(0.9, 0.9, 0.9);

  let disposed = false;
  const reader = vtkXMLPolyDataReader.newInstance();
  reader.setUrl("/models/maniqui.vtp", { binary: true }).then(() => {
    if (disposed) return;
    mapper.setInputData(reader.getOutputData());
    inset.addActor(figure);
    rw.render();
  }).catch((err: unknown) => {
    // Sin maniquí el cubo sigue orientando: no se tumba la escena por esto.
    console.warn("OrientationInset: no se pudo cargar el maniquí", err);
  });

  const apply = (o: Orientation) => {
    const eff = effectiveDirection(o);
    const m = lpsToVolumeUserMatrix(eff.d);
    for (const a of [greyCube, hudCube, figure]) a.setUserMatrix(m as never);
    greyCube.setVisibility(!eff.known);
    hudCube.setVisibility(eff.known);
    figure.getProperty().setColor(...(eff.known ? FIGURE_HUD : FIGURE_GREY));
  };
  apply(orientation);

  // Solo se copia la orientación: el recuadro mira siempre al origen desde
  // una distancia fija, así que el zoom o el paneo de la escena no lo mueven.
  const syncCamera = () => {
    const src = main.getActiveCamera(), dst = inset.getActiveCamera();
    const p = src.getPosition(), f = src.getFocalPoint();
    const d = [p[0] - f[0], p[1] - f[1], p[2] - f[2]];
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    dst.setFocalPoint(0, 0, 0);
    dst.setPosition((d[0] / n) * 4.5, (d[1] / n) * 4.5, (d[2] / n) * 4.5);
    const up = src.getViewUp();
    dst.setViewUp(up[0], up[1], up[2]);
    inset.resetCameraClippingRange();
  };
  const camSub = main.getActiveCamera().onModified(syncCamera);
  syncCamera();

  return {
    setOrientation: (o: Orientation) => { apply(o); rw.render(); },
    /** Para apartarlo de controles HTML que ocupen la misma esquina. */
    setViewport: (v: [number, number, number, number]) => { inset.setViewport(...v); rw.render(); },
    dispose: () => {
      disposed = true;
      camSub.unsubscribe();
      rw.removeRenderer(inset);
      inset.delete();
    },
  };
}

export type OrientationInset = ReturnType<typeof createOrientationInset>;
