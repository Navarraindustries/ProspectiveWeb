/* MeshView — render real .vtp meshes served by the backend with vtk.js.

   Loads the vessel tree plus any highlighted candidate dome / device / centreline,
   on the black clinical surface. Optionally supports point picking on the mesh
   surface (for centreline endpoints) and small sphere markers. */

import { useEffect, useRef, useState } from "react";
import { geometryKey, sceneKey } from "./sceneKeys";
import type { PlaneOutline } from "./planeOutlines";
import { markerRadiusMm, RULER_BEAD_RATIO, RULER_TUBE_RATIO } from "./markerSize";

import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow";
import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";
import vtkCellPicker from "@kitware/vtk.js/Rendering/Core/CellPicker";
import vtkSphereSource from "@kitware/vtk.js/Filters/Sources/SphereSource";
import vtkCubeSource from "@kitware/vtk.js/Filters/Sources/CubeSource";
import vtkLineSource from "@kitware/vtk.js/Filters/Sources/LineSource";
import vtkTubeFilter from "@kitware/vtk.js/Filters/General/TubeFilter";
import type { Vector3 } from "@kitware/vtk.js/types";
import { createOrientationInset, type OrientationInset } from "./OrientationInset";
import { captureRenderWindow, type CapturableWindow, type CaptureFn } from "./captureRenderWindow";
import { standardViewInVolume, type Orientation, type Vec3 } from "./geometry";

export interface MeshLayer {
  url: string;
  /** RGB 0–1 */
  color: Vector3;
  opacity?: number;
  /** Names this layer's actor so it can be moved after loading — how the clip
   *  rehearsal animates the body and the two blades without refetching. */
  id?: string;
  /** Dibuja además un contorno de la malla en el color de la capa (un casco
   *  invertido, ver el efecto de escena). Lo pide el saco: translúcido sobre
   *  el árbol, su borde se perdía y no se sabía dónde acababa el aneurisma. */
  silhouette?: boolean;
  /** Color directo RGB por vértice desde ese array del .vtp (uint8×3), en vez
   *  del color sólido de la capa. Lo pide el mapa de calor del clip. */
  scalars?: { array: string };
}

/** Imperative handle for moving named layers, published while the scene lives.
 *  Animation runs through this instead of React state: a matrix per frame
 *  through the component tree would re-render the whole workspace 60 times a
 *  second to move three actors. */
export interface PartsHandle {
  setMatrix(id: string, matrix: number[] | null): void;
  render(): void;
  has(id: string): boolean;
}

export interface MeshMarker {
  pos: [number, number, number];
  color: Vector3;
  /** Multiplier on the shared marker radius. Lets one marker in a set stand out
   *  (a selected perforator) without breaking the scale everything else uses. */
  scale?: number;
}

/** El punto compartido de los cortes. No es un marcador más: se dibuja en una
 *  capa propia encima de la malla (ver el efecto de escena), porque el punto
 *  que se busca suele estar DENTRO del vaso o del saco, y una esfera con
 *  prueba de profundidad quedaba tapada justo ahí. Radio fijo en mm: debe
 *  verse igual aunque cambie el tamaño de la escena. */
export interface MeshFocus {
  pos: Vec3;
  color: Vector3;
  radiusMm: number;
}

export interface MeshLine {
  a: [number, number, number];
  b: [number, number, number];
  color: Vector3;
  /** Radio en mm. Una regla es una línea, pero el corredor de abordaje es un
   *  VOLUMEN: el clip y el aplicador tienen que caber por él, y dibujarlo como
   *  un hilo no enseña eso. Por defecto, el grosor de regla de siempre. */
  radiusMm?: number;
  /** Translúcido para el corredor, que si no tapa la malla que hay detrás. */
  opacity?: number;
}

/** Standard viewpoints, named for the MPR planes the rest of the app uses.
 *  They are defined in patient (LPS) terms and mapped into mesh coordinates
 *  (voxel·spacing, x = columnas, y = filas, z = cortes) through the effective
 *  orientation: +z is superior only when the volume says so. */
export type CameraView =
  | "fit" | "axial" | "axial_inf" | "coronal" | "coronal_post" | "sagital" | "sagital_izq";

/** Lo que MeshView publica para mover su cámara desde fuera. */
export interface CameraController {
  setView(v: CameraView): void;
  /** Lleva el punto focal a `p` conservando distancia y orientación. */
  focus(p: Vec3): void;
  /** Encuadra un cubo de lado 2·radiusMm centrado en `p`. */
  frame(p: Vec3, radiusMm: number): void;
}

export interface CropPreview {
  center: [number, number, number];
  radius: number;               // sphere radius / box half-side (mm)
  shape: "sphere" | "box";
  invert: boolean;              // true = the ROI is REMOVED (red), else kept (cyan)
}

interface Handles {
  fsrw: vtkFullScreenRenderWindow;
  renderer: ReturnType<vtkFullScreenRenderWindow["getRenderer"]>;
  /** Capa 1, sin prueba de profundidad contra la malla: solo el punto del foco. */
  overlay: vtkRenderer;
  focusActor: vtkActor;
  focusSphere: ReturnType<typeof vtkSphereSource.newInstance>;
  /** Copia la cámara principal a la de la capa y ajusta su recorte al punto. */
  syncOverlay: () => void;
  renderWindow: ReturnType<vtkFullScreenRenderWindow["getRenderWindow"]>;
  actors: vtkActor[];
  actorByUrl: Map<string, vtkActor>;   // for incremental opacity/color updates
}

/** Opacidad del contorno (casco invertido) de una capa: 0,6 con la capa opaca
 *  y proporcional a ella si se atenúa. Con la capa opaca, las caras traseras
 *  del casco que caen dentro del perfil quedan tapadas por la superficie y
 *  solo se ve el anillo. Con la capa translúcida (el saco al 35 % mientras se
 *  marca el cuello) esas caras se ven A TRAVÉS de ella: un casco al 0,6
 *  volvía a llenar el saco de verde plano, lo mismo que se quería evitar. */
function outlineOpacity(layerOpacity: number): number {
  return 0.6 * layerOpacity;
}

export function MeshView({
  layers,
  markers = [],
  focus = null,
  planes = [],
  lines = [],
  cropPreview = null,
  boxPreview = null,
  referenceDiameterMm = null,
  pickMode = false,
  onPick,
  onPickMiss,
  focusUrl,
  registerCapture,
  registerCamera,
  registerParts,
  preserveCamera = false,
  orientation,
  onCameraChange,
  insetRaised = false,
}: {
  layers: MeshLayer[];
  markers?: MeshMarker[];
  /** El punto compartido de los cortes, visible siempre encima de la malla. */
  focus?: MeshFocus | null;
  lines?: MeshLine[];
  /** Los planos de corte como rectángulos sin iluminación y no seleccionables. */
  planes?: PlaneOutline[];
  /** Translucent sphere/box preview of the crop ROI (null to hide). */
  cropPreview?: CropPreview | null;
  /** Caja de recorte: los seis límites, en mm de mundo. Recorta EN VIVO por sus
   *  seis planos y además se dibuja, que es lo que el corte por plano nunca
   *  hizo — allí solo desaparecía geometría y no se veía por dónde cortaba. */
  boxPreview?: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Diameter of the structure being marked (mm). Markers scale to it so they
   *  stay smaller than the vessel or dome they sit on. */
  referenceDiameterMm?: number | null;
  /** When true, a left click on the mesh reports the world position via onPick. */
  pickMode?: boolean;
  onPick?: (xyz: [number, number, number]) => void;
  /** Called when a pick click lands on empty space (no surface hit). */
  onPickMiss?: () => void;
  /** URL of a layer to frame the camera on and highlight (e.g. the selected
   *  aneurysm candidate). The view zooms to its region — with local context —
   *  and the layer is lit to stand out. */
  focusUrl?: string;
  /** Registers a function that captures the live viewport as a PNG data URL
   *  (used to embed the 3D scene in the PDF report). Published once the scene
   *  is on screen; called with null on unmount. */
  registerCapture?: (fn: CaptureFn | null) => void;
  /** Registers a camera controller so the viewer can offer standard views, a
   *  «fit to scene», and centre the shared focus point. Published once the
   *  scene is on screen; called with null on unmount. */
  registerCamera?: (c: CameraController | null) => void;
  /** Publishes a handle for moving named layers, for the clip rehearsal. */
  registerParts?: (h: PartsHandle | null) => void;
  /** Keep the camera across scene rebuilds — used by the live threshold preview so
   *  the view doesn't jump back to the default framing on every mesh update. */
  preserveCamera?: boolean;
  /** Orientación del volumen (DICOM, manual o asumida): la usa el recuadro
   *  del maniquí para saber hacia dónde mira el paciente. */
  orientation: Orientation;
  /** Avisa de cada cambio de cámara (dirección de proyección y up), para la
   *  cinta de rumbo que el visor dibuja sobre la escena. */
  onCameraChange?: (dir: Vec3, up: Vec3) => void;
  /** Sube el recuadro del maniquí por encima de la leyenda de abajo a la
   *  derecha (dispositivos, bandas de perforantes) para no taparla. */
  insetRaised?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);
  // Set once the geometry is on screen; markers re-render at the new size.
  const [sceneDiagonal, setSceneDiagonal] = useState(0);
  const markerActors = useRef<vtkActor[]>([]);
  const planeActors = useRef<vtkActor[]>([]);
  // Actors that carry a layer id, so the rehearsal can move them by name.
  const namedActors = useRef<Map<string, vtkActor>>(new Map());
  // El contorno de cada capa que lo pide, por id (o URL), para que siga los
  // cambios de color y opacidad de su capa sin reconstruir la escena.
  const outlineActors = useRef<Map<string, vtkActor>>(new Map());
  // Qué fichero tiene cargado ahora mismo cada capa CON NOMBRE. Una capa con
  // nombre puede cambiar de geometría sin reconstruir la escena.
  const loadedUrlById = useRef<Map<string, string>>(new Map());
  // Sube al terminar de cargar la escena: el cambio de geometría en sitio se
  // reintenta entonces, porque hasta ese momento no hay actores que tocar.
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const boxActor = useRef<vtkActor | null>(null);
  const cropActor = useRef<vtkActor | null>(null);
  const layerMappers = useRef<vtkMapper[]>([]);
  const registerCaptureRef = useRef(registerCapture);
  registerCaptureRef.current = registerCapture;
  const registerCameraRef = useRef(registerCamera);
  registerCameraRef.current = registerCamera;
  const registerPartsRef = useRef(registerParts);
  registerPartsRef.current = registerParts;
  // Camera params kept across scene rebuilds (for the live preview).
  const savedCamera = useRef<{ position: number[]; focalPoint: number[]; viewUp: number[]; parallelScale: number } | null>(null);
  const preserveCameraRef = useRef(preserveCamera);
  preserveCameraRef.current = preserveCamera;
  // La escena no se rehace al cambiar la orientación o el oyente: se leen de
  // refs en el efecto de escena y un efecto aparte actualiza el recuadro.
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const insetRef = useRef<OrientationInset | null>(null);

  // Latest pick config, read inside the vtk interactor callback without
  // forcing the scene to rebuild when the pick mode toggles.
  const pickModeRef = useRef(pickMode);
  const onPickRef = useRef(onPick);
  const onPickMissRef = useRef(onPickMiss);
  pickModeRef.current = pickMode;
  onPickRef.current = onPick;
  onPickMissRef.current = onPickMiss;

  // Serialise layers + overlays so each effect only re-runs when it must. The
  // scene rebuilds ONLY when the geometry (URLs) or focus changes — NOT on an
  // opacity/color tweak (those update the existing actors incrementally). This
  // keeps a heavy mesh from reloading (and flashing black) when the pick mode
  // just dims it.
  //
  // Una capa CON NOMBRE tampoco reconstruye la escena al cambiar de fichero:
  // su geometría se sustituye en sitio, más abajo. La regla y el porqué están
  // en `sceneKeys.ts`, con su prueba.
  const key = sceneKey(layers, focusUrl);
  const geoKey = geometryKey(layers);
  const appearanceKey = layers.map((l) => `${l.id ?? l.url}|${l.color.join(",")}|${l.opacity ?? 1}`).join(";");
  const markerKey = markers.map((m) => `${m.pos.join(",")}|${m.color.join(",")}|${m.scale ?? 1}`).join(";");
  const focusKey = focus ? `${focus.pos.join(",")}|${focus.color.join(",")}|${focus.radiusMm}` : "";
  const planeKey = planes.map((p) => p.corners.flat().join(",") + "|" + p.color.join(",")).join(";");
  const lineKey = lines
    .map((l) => `${l.a.join(",")}-${l.b.join(",")}|${l.color.join(",")}|${l.radiusMm ?? ""}|${l.opacity ?? ""}`)
    .join(";");
  const cropKey = cropPreview
    ? `${cropPreview.center.join(",")}|${cropPreview.radius}|${cropPreview.shape}|${cropPreview.invert}`
    : "";

  // ── Scene: render window + mesh layers + surface picking ──────────────── #
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fsrw = vtkFullScreenRenderWindow.newInstance({
      container,
      containerStyle: { width: "100%", height: "100%", position: "absolute", inset: "0" },
      background: [0, 0, 0],
    });
    const renderer = fsrw.getRenderer();
    const renderWindow = fsrw.getRenderWindow();

    // Capa del punto compartido. Un segundo renderer en la capa 1 conserva el
    // color de la escena (setLayer(1) ya lo pide) pero NO su profundidad: lo
    // que dibuja queda encima de la malla aunque el punto esté dentro del vaso.
    // No es interactivo, así que el interactor, la rotación y la selección de
    // puntos siguen yendo al renderer principal; y su actor no está en este,
    // así que no cuenta para AJUSTAR ni para la escala de los marcadores.
    // Cámara: una propia que copia la principal en cada cambio (como el
    // recuadro del maniquí) en vez de compartir la misma. Compartida, el
    // recorte cercano/lejano lo fijaría solo la malla, y un punto fuera de
    // sus límites en profundidad (hueso, otra rama) quedaría recortado. Con
    // cámara propia la capa ajusta su recorte al punto sin tocar la escena.
    if (renderWindow.getNumberOfLayers() < 2) renderWindow.setNumberOfLayers(2);
    const overlay = vtkRenderer.newInstance();
    overlay.setLayer(1);
    overlay.setPreserveColorBuffer(true);
    overlay.setPreserveDepthBuffer(false);
    overlay.setInteractive(false);
    renderWindow.addRenderer(overlay);
    const focusSphere = vtkSphereSource.newInstance({ radius: 0.6, thetaResolution: 16, phiResolution: 16 });
    const focusMapper = vtkMapper.newInstance();
    focusMapper.setInputConnection(focusSphere.getOutputPort());
    const focusActor = vtkActor.newInstance();
    focusActor.setMapper(focusMapper);
    // Sin luz: un punto de color plano se lee como punto, no como otra bola.
    focusActor.getProperty().setLighting(false);
    focusActor.setPickable(false);
    focusActor.setVisibility(false);
    overlay.addActor(focusActor);
    const syncOverlay = () => {
      const src = renderer.getActiveCamera(), dst = overlay.getActiveCamera();
      dst.setPosition(...(src.getPosition() as Vector3));
      dst.setFocalPoint(...(src.getFocalPoint() as Vector3));
      dst.setViewUp(...(src.getViewUp() as Vector3));
      dst.setViewAngle(src.getViewAngle());
      dst.setParallelProjection(src.getParallelProjection());
      dst.setParallelScale(src.getParallelScale());
      // Con el actor oculto no hay límites y vtk.js deja el recorte como esté.
      if (focusActor.getVisibility()) overlay.resetCameraClippingRange();
    };
    const overlaySub = renderer.getActiveCamera().onModified(syncOverlay);
    syncOverlay();

    handles.current = {
      fsrw, renderer, renderWindow, actors: [], actorByUrl: new Map(),
      overlay, focusActor, focusSphere, syncOverlay,
    };
    // vtk.js solo se redimensiona con la VENTANA. La rejilla del visor mueve
    // la escena entre la principal y una celda lateral sin remontarla, así que
    // el lienzo tiene que seguir a su celda: si no, se queda con el tamaño con
    // que nació (y la captura del informe tras subirla saldría de ese tamaño).
    const ro = new ResizeObserver(() => fsrw.resize());
    ro.observe(container);

    // Dos luces que siguen la cámara: una principal y un relleno opuesto al 35 %.
    // Con la única luz de cabeza de vtk.js el lado en sombra del vaso era negro y
    // las bifurcaciones no se leían. Van en este efecto, que estrena renderer en
    // cada reconstrucción: así nunca se acumulan luces de una escena anterior.
    renderer.removeAllLights();
    // El tipo va por su método: los .d.ts declaran `lightType` como un enum que
    // en tiempo de ejecución no existe (vtk.js usa la cadena).
    const keyLight = vtkLight.newInstance({ intensity: 1.0, position: [1, 1, 1] as Vector3 });
    const fillLight = vtkLight.newInstance({ intensity: 0.35, position: [-1, -0.5, -1] as Vector3 });
    keyLight.setLightTypeToCameraLight(); fillLight.setLightTypeToCameraLight();
    renderer.addLight(keyLight); renderer.addLight(fillLight);
    // Translucidez: vtk.js no hace depth peeling. `setUseDepthPeeling` y sus
    // dos compañeros solo existen como propiedades del renderer y ningún pase
    // los lee (comprobado en vtk.js 36.2: Rendering/Core/Renderer.js). El orden
    // lo resuelve `OrderIndependentTranslucentPass`, que ForwardPass solo
    // ejecuta cuando hay algún actor translúcido, así que no hay nada que
    // encender ni que pagar en las escenas opacas.

    const inset = createOrientationInset(renderWindow, renderer, orientationRef.current);
    insetRef.current = inset;
    const reportCamera = () => {
      const cam = renderer.getActiveCamera();
      onCameraChangeRef.current?.(cam.getDirectionOfProjection() as Vec3, cam.getViewUp() as Vec3);
    };
    const camSub = renderer.getActiveCamera().onModified(reportCamera);
    reportCamera();

    let cancelled = false;

    // Surface point picking — set up immediately so it survives async loads.
    const picker = vtkCellPicker.newInstance();
    picker.setTolerance(0.001);
    const interactor = fsrw.getInteractor();
    const pickSub = interactor.onLeftButtonPress((callData) => {
      if (!pickModeRef.current || !onPickRef.current) return;
      if (callData.pokedRenderer !== renderer) return;
      const pos = callData.position;
      picker.pick([pos.x, pos.y, 0], renderer);
      const hits = picker.getPickedPositions();
      if (hits && hits.length > 0) {
        const [x, y, z] = hits[0];
        onPickRef.current([x, y, z]);
      } else {
        // Clicked empty space: without feedback the tool looks broken ("I click
        // and nothing happens"), so tell the caller the pick missed the surface.
        onPickMissRef.current?.();
      }
    });

    // Expose a viewport-capture function (PNG data URL) for the PDF report.
    // La misma que usan los demás visores, que además sabe copiarse para
    // grabar (`grab`). Lee `handles.current` en cada llamada: la escena se
    // rehace sin volver a registrar la captura.
    const capture = captureRenderWindow(
      () => (handles.current?.fsrw as unknown as CapturableWindow) ?? null,
      () => handles.current?.renderWindow.render(),
    );

    // Standard viewpoints. resetCamera() preserves the view direction and up
    // vector, so pointing the camera and refitting is all it takes. Without this
    // the only way back from a lost orientation was to change step and return.
    const setView = (view: CameraView) => {
      const h = handles.current;
      if (!h) return;
      const cam = h.renderer.getActiveCamera();
      if (view !== "fit") {
        // La cámara se pone del lado contrario a donde mira.
        const { direction: dop, viewUp: up } = standardViewInVolume(view, orientationRef.current);
        const dir: Vec3 = [-dop[0], -dop[1], -dop[2]];
        cam.setFocalPoint(0, 0, 0);
        cam.setPosition(dir[0], dir[1], dir[2]);
        cam.setViewUp(up[0], up[1], up[2]);
      }
      h.renderer.resetCamera();
      h.renderer.resetCameraClippingRange();
      h.renderer.updateLightsGeometryToFollowCamera();
      h.renderWindow.render();
    };
    // Centrar en un punto (vistas sincronizadas): el foco se desplaza y la
    // cámara con él, así que ni el zoom ni la orientación cambian.
    const controller: CameraController = {
      setView,
      focus: (p: Vec3) => {
        const h = handles.current; if (!h) return;
        const cam = h.renderer.getActiveCamera();
        const f = cam.getFocalPoint(), pos = cam.getPosition();
        cam.setFocalPoint(p[0], p[1], p[2]);
        cam.setPosition(pos[0] + (p[0] - f[0]), pos[1] + (p[1] - f[1]), pos[2] + (p[2] - f[2]));
        h.renderer.resetCameraClippingRange();
        h.renderWindow.render();
      },
      // «Centrar en la lesión»: además encuadra un cubo de 2·r alrededor.
      frame: (p: Vec3, r: number) => {
        const h = handles.current; if (!h) return;
        h.renderer.resetCamera([p[0] - r, p[0] + r, p[1] - r, p[1] + r, p[2] - r, p[2] + r]);
        // resetCamera(bounds) ajusta también los planos de recorte al cubo:
        // al alejarse o girar, el resto del árbol quedaba cortado. Se
        // recalculan con lo que de verdad hay en escena.
        h.renderer.resetCameraClippingRange();
        h.renderer.updateLightsGeometryToFollowCamera();
        h.renderWindow.render();
      },
    };

    (async () => {
      let anyGeometry = false;
      let focusBounds: number[] | null = null;
      layerMappers.current = [];
      loadedUrlById.current.clear();
      for (const layer of layers) {
        try {
          const reader = vtkXMLPolyDataReader.newInstance();
          await reader.setUrl(layer.url, { binary: true });
          if (cancelled) return;
          const poly = reader.getOutputData();
          if (!poly || poly.getNumberOfPoints() === 0) continue;

          const mapper = vtkMapper.newInstance();
          mapper.setInputData(poly);
          if (layer.scalars) {
            // Color directo por vértice: el servidor ya decidió el color de cada punto
            // (categoría y presión), así la leyenda y la malla no pueden discrepar.
            poly.getPointData().setActiveScalars(layer.scalars.array);
            mapper.setScalarVisibility(true);
            mapper.setColorModeToDirectScalars();
          } else {
            mapper.setScalarVisibility(false); // solid color, not scalar-mapped
          }

          const actor = vtkActor.newInstance();
          actor.setMapper(mapper);
          layerMappers.current.push(mapper);
          if (layer.id) {
            namedActors.current.set(layer.id, actor);
            loadedUrlById.current.set(layer.id, layer.url);
          }
          const prop = actor.getProperty();
          prop.setColor(...layer.color);
          prop.setOpacity(layer.opacity ?? 1);
          prop.setInterpolationToPhong();
          // Material sobrio: poca luz propia para que el relieve lo den las dos
          // luces, y un brillo contenido que no quema la cúpula.
          prop.setAmbient(0.15); prop.setDiffuse(0.85); prop.setSpecular(0.25); prop.setSpecularPower(24);

          // Highlight the focused layer (selected candidate): lift it off the
          // dimmed tree with a self-lit glow and a crisp specular sheen.
          if (focusUrl && layer.url === focusUrl) {
            focusBounds = poly.getBounds();
            prop.setAmbient(0.5);
            prop.setDiffuse(0.7);
            prop.setSpecular(0.4);
            prop.setSpecularPower(30);
            prop.setOpacity(1);
          }

          renderer.addActor(actor);
          handles.current?.actors.push(actor);
          handles.current?.actorByUrl.set(layer.url, actor);

          if (layer.silhouette) {
            // Contorno como CASCO INVERTIDO, no como alambre. Un alambre dibuja
            // todas las aristas de todos los triángulos: en un saco de miles de
            // puntos las líneas se apilan varias por píxel y el saco entero se
            // volvía una red verde casi opaca, sin relieve y tapando el vaso de
            // detrás. El casco es la misma malla un 4 % mayor alrededor de su
            // centro y con las caras delanteras descartadas: solo se ven sus
            // caras traseras, y de esas solo asoma el anillo que sobresale del
            // perfil del saco; el resto queda detrás de la superficie.
            // Mismo mapper: hereda los planos de recorte de la previa y el
            // cambio de geometría en sitio (el saco deformándose en el ensayo).
            // Sin luz, para que sea un borde de color y no otra superficie
            // sombreada; y no se deja pinchar, o taparía el sitio del cuello.
            // Va en `actors`, así que se retira con la escena.
            const b = poly.getBounds();
            const outline = vtkActor.newInstance();
            outline.setMapper(mapper);
            outline.setOrigin((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2);
            outline.setScale(1.04, 1.04, 1.04);
            const op = outline.getProperty();
            op.setFrontfaceCulling(true);
            op.setColor(...layer.color);
            op.setOpacity(outlineOpacity(layer.opacity ?? 1));
            op.setLighting(false);
            outline.setPickable(false);
            renderer.addActor(outline);
            handles.current?.actors.push(outline);
            outlineActors.current.set(layer.id ?? layer.url, outline);
          }
          anyGeometry = true;
        } catch (err) {
          // A single failed layer must not blank the whole scene.
          console.warn("MeshView: failed to load", layer.url, err);
        }
      }
      if (cancelled) return;
      if (anyGeometry) {
        // Scene scale for the markers: the union of everything on screen.
        const b = renderer.computeVisiblePropBounds();
        if (b && isFinite(b[0]) && b[1] >= b[0]) {
          const diag = Math.hypot(b[1] - b[0], b[3] - b[2], b[5] - b[4]);
          if (diag > 0) setSceneDiagonal(diag);
        }
        const cam = renderer.getActiveCamera();
        if (preserveCameraRef.current && savedCamera.current) {
          // Live preview refresh: keep the user's current viewpoint.
          const s = savedCamera.current;
          cam.setPosition(s.position[0], s.position[1], s.position[2]);
          cam.setFocalPoint(s.focalPoint[0], s.focalPoint[1], s.focalPoint[2]);
          cam.setViewUp(s.viewUp[0], s.viewUp[1], s.viewUp[2]);
          cam.setParallelScale(s.parallelScale);
          renderer.resetCameraClippingRange();
        } else if (focusBounds && isFinite(focusBounds[0]) && focusBounds[1] >= focusBounds[0]) {
          // Frame the candidate with local context: expand its bounds to a cube
          // around its centre so the surrounding vessel stays visible (needed to
          // place the neck plane), then fit the camera to that.
          const cx = (focusBounds[0] + focusBounds[1]) / 2;
          const cy = (focusBounds[2] + focusBounds[3]) / 2;
          const cz = (focusBounds[4] + focusBounds[5]) / 2;
          const half = Math.max(
            focusBounds[1] - focusBounds[0],
            focusBounds[3] - focusBounds[2],
            focusBounds[5] - focusBounds[4],
          ) * 1.4;
          const r = Math.max(half, 16);
          renderer.resetCamera([cx - r, cx + r, cy - r, cy + r, cz - r, cz + r]);
          cam.elevation(-20);
        } else {
          renderer.resetCamera();
          cam.elevation(-20);
        }
        renderer.updateLightsGeometryToFollowCamera();
      }
      renderWindow.render();
      // Captura y cámara se publican cuando la escena ya está en pantalla, no
      // al montar: capturar antes daba un lienzo negro, y un foco aplicado
      // antes lo pisaba el encuadre inicial de arriba.
      registerCaptureRef.current?.(capture);
      registerCameraRef.current?.(controller);
      // La escena ya tiene actores: si mientras cargaba cambió el fichero de
      // alguna capa con nombre, el efecto de abajo puede aplicarlo ahora.
      setSceneEpoch((n) => n + 1);
    })();

    registerPartsRef.current?.({
      has: (id) => namedActors.current.has(id),
      setMatrix: (id, matrix) => {
        const a = namedActors.current.get(id);
        if (!a) return;
        // null puts the part back where the file has it.
        a.setUserMatrix(matrix as never);
      },
      render: () => handles.current?.renderWindow.render(),
    });

    return () => {
      cancelled = true;
      ro.disconnect();
      pickSub.unsubscribe();
      camSub.unsubscribe();
      overlaySub.unsubscribe();
      inset.dispose();
      insetRef.current = null;
      registerCaptureRef.current?.(null);
      // La cámara NO se anula al rehacer la escena (otro candidato, un
      // dispositivo, la vista previa del umbral): el grupo AJUSTAR·AX·…·LESIÓN
      // desaparecía y los conmutadores de debajo saltaban. Sus métodos ya
      // miran handles.current; se anula solo al desmontar (efecto de abajo).
      registerPartsRef.current?.(null);
      namedActors.current.clear();
      outlineActors.current.clear();
      markerActors.current = [];
      planeActors.current = [];
      const h = handles.current;
      if (h) {
        // Remember the camera so a preview refresh can restore the viewpoint.
        if (preserveCameraRef.current) {
          try {
            const cam = h.renderer.getActiveCamera();
            savedCamera.current = {
              position: [...cam.getPosition()],
              focalPoint: [...cam.getFocalPoint()],
              viewUp: [...cam.getViewUp()],
              parallelScale: cam.getParallelScale(),
            };
          } catch { /* ignore */ }
        } else {
          savedCamera.current = null;
        }
        h.actors.forEach((a) => h.renderer.removeActor(a));
        h.renderWindow.removeRenderer(h.overlay);
        h.overlay.delete();
        // Unbind the interactor's DOM listeners BEFORE delete(). vtk.js does not
        // release them on delete(), so a rebuilt scene (new step / mesh) would
        // leave a "zombie" interactor firing pointer events on a torn-down
        // container → `getBoundingClientRect` of undefined, spamming the console
        // and leaking listeners over a long session.
        try { interactor.unbindEvents(); } catch { /* older vtk.js */ }
        // Y borrar el interactor ANTES que la ventana. `fsrw.delete()` borra la
        // vista pero no el interactor, y el bucle de animación de vtk.js se
        // reprograma solo mientras quede algún solicitante: si la escena se
        // destruye en mitad de un gesto —la rueda del zoom deja la animación
        // «extendida» unos cientos de ms— el bucle seguía vivo llamando a una
        // vista ya borrada, y la consola se llenaba de
        // «Cannot read properties of undefined (reading
        // 'getChildRenderWindowsByReference')» un fotograma tras otro, para
        // siempre. `interactor.delete()` cancela todos los solicitantes.
        try { interactor.delete(); } catch { /* older vtk.js */ }
        h.fsrw.delete();
      }
      handles.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Desmontaje real de MeshView: ahora sí deja de haber cámara que mover.
  useEffect(() => () => registerCameraRef.current?.(null), []);

  // ── Orientación fijada a mano: el recuadro cambia sin rehacer la escena ── #
  useEffect(() => {
    insetRef.current?.setOrientation(orientation);
  }, [orientation.direction, orientation.manual]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Con `key` también: una escena rehecha estrena recuadro en su sitio de siempre.
  useEffect(() => {
    insetRef.current?.setRaised(insetRaised);
  }, [key, insetRaised]);

  // ── Appearance (opacity/color): update actors in place, never rebuild the ──
  //    scene — so dimming a heavy mesh (e.g. entering a pick mode) is instant. ─ #
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    let changed = false;
    for (const l of layers) {
      // Por nombre primero: una capa con nombre cambia de URL sin reconstruir
      // la escena, así que `actorByUrl` la tendría con la URL vieja.
      const actor = (l.id ? namedActors.current.get(l.id) : undefined) ?? h.actorByUrl.get(l.url);
      if (!actor) continue;
      const prop = actor.getProperty();
      if (!(focusUrl && l.url === focusUrl)) {   // the focused layer keeps its highlight
        prop.setColor(...l.color);
        prop.setOpacity(l.opacity ?? 1);
      }
      const outline = outlineActors.current.get(l.id ?? l.url);
      if (outline) {
        outline.getProperty().setColor(...l.color);
        outline.getProperty().setOpacity(outlineOpacity(l.opacity ?? 1));
      }
      changed = true;
    }
    if (changed) h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearanceKey]);

  // ── Geometría de una capa CON NOMBRE: se sustituye en el actor que ya está ─
  //    en escena. Es lo que permite que el saco se deforme durante el ensayo
  //    sin tirar la ventana de render (y con ella el clip que la está
  //    recorriendo). Solo se recarga ESA malla, no el árbol vascular. ──────── #
  useEffect(() => {
    if (!handles.current) return;
    let cancelled = false;
    (async () => {
      let cambiado = false;
      for (const l of layers) {
        if (!l.id || loadedUrlById.current.get(l.id) === l.url) continue;
        const actor = namedActors.current.get(l.id);
        if (!actor) continue;                    // aún cargando: vuelve con la época
        try {
          const reader = vtkXMLPolyDataReader.newInstance();
          await reader.setUrl(l.url, { binary: true });
          if (cancelled) return;
          const poly = reader.getOutputData();
          if (!poly || poly.getNumberOfPoints() === 0) continue;
          // Un campo del clip recalculado llega como fichero nuevo de la misma
          // capa: su array de color tiene que volver a ser el escalar activo.
          if (l.scalars) poly.getPointData().setActiveScalars(l.scalars.array);
          (actor.getMapper() as vtkMapper).setInputData(poly);
          // El casco comparte el mapper, así que ya tiene la geometría nueva,
          // pero su centro de escala se fijó con los límites de la primera
          // carga: si el saco se desplaza o cambia de tamaño en el ensayo, el
          // 4 % extra crecería alrededor de un punto viejo y el anillo se
          // descentraría. Se recalcula con la geometría que acaba de llegar.
          const outline = outlineActors.current.get(l.id);
          if (outline) {
            const b = poly.getBounds();
            outline.setOrigin((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2);
          }
          loadedUrlById.current.set(l.id, l.url);
          cambiado = true;
        } catch (err) {
          // Un fotograma que no llega no puede dejar la escena a medias.
          console.warn("MeshView: no se pudo cambiar la geometría de", l.id, err);
        }
      }
      if (cambiado && !cancelled) handles.current?.renderWindow.render();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, sceneEpoch]);

  // ── Overlays (markers + ruler lines): incremental so a pick never rebuilds ─ #
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    markerActors.current.forEach((a) => h.renderer.removeActor(a));
    markerActors.current = [];

    const rMarker = markerRadiusMm(referenceDiameterMm, sceneDiagonal);

    for (const m of markers) {
      const sphere = vtkSphereSource.newInstance({ radius: rMarker * (m.scale ?? 1), thetaResolution: 16, phiResolution: 16 });
      sphere.setCenter(m.pos[0], m.pos[1], m.pos[2]);
      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(sphere.getOutputPort());
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setColor(...m.color);
      h.renderer.addActor(actor);
      markerActors.current.push(actor);
    }

    for (const l of lines) {
      // Una regla de 0 mm (la altura de cúpula de un cuello inválido) no es
      // una línea: vtk.js avisa «Zero-length line definition» y el tubo no
      // tendría dirección. Sin tubo ni cuentas: no hay nada que medir.
      if (Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1], l.b[2] - l.a[2]) < 1e-6) continue;
      const lineSrc = vtkLineSource.newInstance({ point1: l.a, point2: l.b, resolution: 1 });
      const tube = vtkTubeFilter.newInstance({
        radius: l.radiusMm ?? rMarker * RULER_TUBE_RATIO,
        numberOfSides: l.radiusMm ? 24 : 10, capping: true,
      });
      tube.setInputConnection(lineSrc.getOutputPort());
      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(tube.getOutputPort());
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setColor(...l.color);
      if (l.opacity !== undefined) actor.getProperty().setOpacity(l.opacity);
      h.renderer.addActor(actor);
      markerActors.current.push(actor);
      // Endpoint beads for the ruler.
      for (const p of [l.a, l.b]) {
        const bead = vtkSphereSource.newInstance({
          radius: rMarker * RULER_BEAD_RATIO, thetaResolution: 12, phiResolution: 12,
        });
        bead.setCenter(p[0], p[1], p[2]);
        const bm = vtkMapper.newInstance();
        bm.setInputConnection(bead.getOutputPort());
        const ba = vtkActor.newInstance();
        ba.setMapper(bm);
        ba.getProperty().setColor(...l.color);
        h.renderer.addActor(ba);
        markerActors.current.push(ba);
      }
    }
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, markerKey, lineKey, sceneDiagonal, referenceDiameterMm]);

  // ── Punto compartido: solo se mueve su actor en la capa de encima ──────── #
  //
  // Va aparte de los marcadores: cada paso de rueda en un corte mueve el
  // punto, y si estuviera en `markers` se rehacían todas las esferas y tubos
  // de regla en cada paso. Aquí solo cambian la posición y, si hace falta,
  // el radio o el color de un único actor.
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    if (focus) {
      h.focusSphere.setRadius(focus.radiusMm);
      h.focusActor.setPosition(focus.pos[0], focus.pos[1], focus.pos[2]);
      h.focusActor.getProperty().setColor(...focus.color);
      h.focusActor.setVisibility(true);
    } else {
      h.focusActor.setVisibility(false);
    }
    h.syncOverlay();
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focusKey]);

  // ── Planos de corte: rectángulos sin iluminación, fuera del encuadre ────── #
  //
  // Se añaden después de encuadrar la cámara (igual que los marcadores) y no
  // entran en sceneDiagonal, así que dibujarlos o quitarlos no mueve la vista.
  // No se pueden seleccionar: el clic debe llegar a la malla que hay detrás.
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    planeActors.current.forEach((a) => h.renderer.removeActor(a));
    planeActors.current = [];
    for (const p of planes) {
      const pts = new Float32Array(p.corners.flat());
      const mk = (cells: "lines" | "polys", data: number[], opacity: number) => {
        const pd = vtkPolyData.newInstance();
        pd.getPoints().setData(pts, 3);
        if (cells === "lines") pd.getLines().setData(new Uint32Array(data));
        else pd.getPolys().setData(new Uint32Array(data));
        const mapper = vtkMapper.newInstance();
        mapper.setInputData(pd);
        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        const prop = actor.getProperty();
        prop.setColor(...p.color);
        prop.setOpacity(opacity);
        prop.setLighting(false);
        if (cells === "lines") prop.setLineWidth(1);
        actor.setPickable(false);
        // Los rectángulos abarcan todo el volumen: no deben dictar el encuadre
        // ni la escala de los marcadores (computeVisiblePropBounds los ignora).
        actor.setUseBounds(false);
        h.renderer.addActor(actor);
        planeActors.current.push(actor);
      };
      // N vértices: 4 en los planos de índice, de 3 a 6 en el plano libre
      // (su corte con la caja). El polígono es convexo, así que una sola celda basta.
      const n = p.corners.length;
      const ids = Array.from({ length: n }, (_, i) => i);
      mk("polys", [n, ...ids], 0.06);
      mk("lines", [n + 1, ...ids, 0], 0.85);
    }
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, planeKey]);

  // ── Previa del corte por plano: se recorta el render, no se dibuja nada ─── #
  //
  // Recortar dice QUÉ se va: arrastrando la caja la parte condenada
  // desaparece, y «Recortar» solo confirma lo que ya se está viendo. Es
  // barato: los mappers de vtk.js llevan planos de recorte y no hay que
  // volver a leer la malla.
  const boxKey = boxPreview
    ? `${boxPreview.min.join(",")}|${boxPreview.max.join(",")}`
    : "";
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    for (const m of layerMappers.current) {
      try { m.removeAllClippingPlanes(); } catch { /* mapper ya destruido */ }
    }
    if (boxPreview) {
      // Seis planos, uno por cara. Cada eje se recorta por los dos lados, así
      // que las tres dimensiones se ven a la vez en vez de una cada vez.
      const { min, max } = boxPreview;
      const caras: [[number, number, number], [number, number, number]][] = [
        [[min[0], 0, 0], [1, 0, 0]], [[max[0], 0, 0], [-1, 0, 0]],
        [[0, min[1], 0], [0, 1, 0]], [[0, max[1], 0], [0, -1, 0]],
        [[0, 0, min[2]], [0, 0, 1]], [[0, 0, max[2]], [0, 0, -1]],
      ];
      for (const m of layerMappers.current) {
        for (const [origen, normal] of caras) {
          const pl = vtkPlane.newInstance();
          pl.setOrigin(...origen);
          pl.setNormal(...normal);
          try { m.addClippingPlane(pl); } catch { /* idem */ }
        }
      }
    }
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, boxKey]);

  // ── Crop ROI preview: a translucent sphere/box so the crop is not blind ──── #
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    if (cropActor.current) { h.renderer.removeActor(cropActor.current); cropActor.current = null; }

    if (cropPreview && cropPreview.radius > 0) {
      const { center, radius, shape, invert } = cropPreview;
      const src = shape === "sphere"
        ? vtkSphereSource.newInstance({ center, radius, thetaResolution: 32, phiResolution: 32 })
        : vtkCubeSource.newInstance({ center, xLength: radius * 2, yLength: radius * 2, zLength: radius * 2 });
      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(src.getOutputPort());
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const prop = actor.getProperty();
      // Red = the ROI is removed; cyan = the ROI is kept.
      prop.setColor(invert ? 0.95 : 0.25, invert ? 0.30 : 0.85, invert ? 0.30 : 0.95);
      prop.setOpacity(0.22);
      prop.setEdgeVisibility(true);
      prop.setEdgeColor(invert ? 0.98 : 0.4, invert ? 0.5 : 0.95, invert ? 0.5 : 1.0);
      prop.setLineWidth(1);
      actor.setPickable(false);   // never intercept surface picks
      h.renderer.addActor(actor);
      cropActor.current = actor;
    }
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cropKey]);

  // ── La caja de recorte, dibujada ──────────────────────────────────────── #
  //
  // El corte por plano recortaba la malla y no dibujaba NADA: había que deducir
  // dónde estaba el plano por lo que desaparecía. Aquí la caja se ve, así que
  // sabes por dónde vas a cortar antes de cortar, y en los tres ejes a la vez.
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    if (boxActor.current) { h.renderer.removeActor(boxActor.current); boxActor.current = null; }

    if (boxPreview) {
      const { min, max } = boxPreview;
      const src = vtkCubeSource.newInstance({
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
        xLength: Math.max(max[0] - min[0], 0.01),
        yLength: Math.max(max[1] - min[1], 0.01),
        zLength: Math.max(max[2] - min[2], 0.01),
      });
      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(src.getOutputPort());
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const prop = actor.getProperty();
      // Solo aristas: una caja rellena taparía justo la malla que hay que ver.
      prop.setRepresentation(1);
      prop.setColor(0.95, 0.75, 0.2);
      prop.setLineWidth(2);
      prop.setOpacity(0.9);
      actor.setPickable(false);
      h.renderer.addActor(actor);
      boxActor.current = actor;
    }
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, boxKey]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
