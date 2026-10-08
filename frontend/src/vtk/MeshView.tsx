/* MeshView — render real .vtp meshes served by the backend with vtk.js.

   Loads the vessel tree plus any highlighted candidate dome / device / centreline,
   on the black clinical surface. Optionally supports point picking on the mesh
   surface (for centreline endpoints) and small sphere markers. */

import { followContainer } from "./followContainer";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toPixels } from "./planeTrace";
import { geometryKey, sceneKey } from "./sceneKeys";
import type { PlaneOutline } from "./planeOutlines";
import { markerRadiusMm, RULER_BEAD_RATIO, RULER_TUBE_RATIO } from "./markerSize";

import "@kitware/vtk.js/Rendering/Profiles/Geometry";
// Los cortes de «Cortes 3D» usan el mapper de reslice, que registra este perfil.
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import vtkImageResliceMapper from "@kitware/vtk.js/Rendering/Core/ImageResliceMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow";
import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
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
import type { Bounds, Vector3 } from "@kitware/vtk.js/types";
import { createOrientationInset, type OrientationInset } from "./OrientationInset";
import { captureRenderWindow, type CapturableWindow, type CaptureFn } from "./captureRenderWindow";
import { standardViewInVolume, type Orientation, type Vec3 } from "./geometry";
import { IDENTITY } from "./clipPose";
import { matrixAfterSwap, shouldApplyMatrix, toColumnMajor } from "./layerMatrix";
import { chooseHandle, nextDrag, type DragEvent, type DragState } from "./handleDrag";
import { cameraLike, type CameraLike, type Viewport } from "./dragController";
import type { SlicePlaneSpec } from "./slicePlanes";

/** Un asa que se puede agarrar con el ratón (el clip, sus planos). Se dibuja en
 *  la capa superior, encima de la malla, porque el asa suele quedar dentro del
 *  vaso o detrás del saco y con prueba de profundidad no se podría coger. */
export interface Handle {
  id: string;
  kind: "sphere" | "ring" | "square";
  pos: Vec3;
  /** Normal del plano del anillo; las esferas y los cuadrados no la usan. */
  normal?: Vec3;
  radiusMm: number;
  color: [number, number, number];
  /** Segmento guía de `pos` a este punto (el asa unida a lo que mueve). */
  lineTo?: Vec3;
}

export interface HandleDragEvent {
  id: string;
  phase: "start" | "move" | "end" | "cancel";
  /** Píxel CSS respecto a la esquina superior izquierda del lienzo. */
  px: number;
  py: number;
  shift: boolean;
  camera: CameraLike;
  viewport: Viewport;
}

const NO_HANDLES: Handle[] = [];
const NO_LABELS: MeshLabel[] = [];

/** Los tres cortes de índice en gris dentro de la escena (modo «Cortes 3D»):
 *  dónde va cada uno, el volumen que remuestrean y la ventana de los cortes. */
export interface SlicePlanesProp {
  specs: SlicePlaneSpec[];
  image: vtkImageData;
  wc: number;
  ww: number;
}

interface SliceActor {
  plane: ReturnType<typeof vtkPlane.newInstance>;
  mapper: ReturnType<typeof vtkImageResliceMapper.newInstance>;
  actor: ReturnType<typeof vtkImageSlice.newInstance>;
}

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
  /** La cámara encuadra esta capa al montar la escena, sin cambiarle el
   *  aspecto. Sin esto, al medir el saco la vista saltaba al árbol entero
   *  justo cuando hay que mirar lo que se acaba de medir. */
  frame?: boolean;
  /** Color por vértice en vez del color sólido de la capa, de dos maneras:
   *  - `{ array }`: color directo RGB (uint8×3) que ya trae el .vtp. Lo pide
   *    el mapa de calor del clip: el servidor decide el color de cada punto.
   *  - `{ name, range }`: un campo de puntos pasado por una escala azul
   *    (negativo) · gris (0) · rojo (positivo) que satura en ±`range`. Lo usan
   *    los mapas de cambio del seguimiento, aposición y cobertura. Por debajo
   *    de `deadband` en valor absoluto se pinta gris: es ruido de la
   *    comparación, no cambio. */
  scalars?: { array: string } | {
    name: string; range: number; deadband?: number;
    /** Rojo para lo negativo y azul para lo positivo. */
    invert?: boolean };
  /** Matriz de usuario 4×4 (16 números, la convención de vtk.js) que mueve el
   *  actor sin recargar la malla: el clip colocado sigue al arrastre así.
   *  undefined = identidad. Solo la admiten las capas con `id`, que son las
   *  que tienen actor con nombre; en una capa sin `id` se ignora. */
  userMatrix?: number[];
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
  /** Multiplica el grosor de regla por defecto (sin `radiusMm`): la anotación
   *  seleccionada destaca sin que el visor tenga que saber la escala de la escena. */
  scale?: number;
}

/** Rótulo en pantalla anclado a un punto de la escena (mm). */
export interface MeshLabel { pos: Vec3; text: string; color: string }

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
  labels = NO_LABELS,
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
  showInset = true,
  handles: handleList = NO_HANDLES,
  onHandleDrag,
  onHandleDoubleClick,
  onLayerLoaded,
  slicePlanes = null,
}: {
  layers: MeshLayer[];
  markers?: MeshMarker[];
  /** El punto compartido de los cortes, visible siempre encima de la malla. */
  focus?: MeshFocus | null;
  lines?: MeshLine[];
  /** Rótulos de las anotaciones: texto HTML/SVG encima del lienzo, no actores,
   *  para que se lean igual a cualquier zoom. Se recolocan con cada cambio de cámara. */
  labels?: MeshLabel[];
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
  /** El recuadro del maniquí; false con el HUD limpio (el CSS no llega a vtk). */
  showInset?: boolean;
  /** Asas agarrables en la capa superior. Con la lista vacía el ratón es todo
   *  de la cámara, igual que antes de que existieran. */
  handles?: Handle[];
  /** Ciclo de arrastre de un asa: start al pulsar encima con el botón
   *  izquierdo, move mientras se arrastra, end al soltar y cancel con Escape.
   *  Durante el arrastre la cámara no se mueve. */
  onHandleDrag?: (e: HandleDragEvent) => void;
  /** Doble clic sobre un asa. No llega a la celda (que si no promovería la vista). */
  onHandleDoubleClick?: (id: string) => void;
  /** Una capa con nombre ya ENSEÑA este fichero: se llama tras ponerle la
   *  geometría y pintar, al montar la escena y en cada cambio de geometría.
   *  El visor lo usa para saber cuándo están en pantalla los colores nuevos
   *  del mapa de calor, que llegan después de la respuesta del campo. */
  onLayerLoaded?: (id: string, url: string) => void;
  /** Modo «Cortes 3D»: los tres cortes de índice remuestreados en gris en su
   *  posición real. null = escena normal, sin cortes. */
  slicePlanes?: SlicePlanesProp | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);
  // Set once the geometry is on screen; markers re-render at the new size.
  const [sceneDiagonal, setSceneDiagonal] = useState(0);
  const markerActors = useRef<vtkActor[]>([]);
  const planeActors = useRef<vtkActor[]>([]);
  // Los tres cortes del modo «Cortes 3D», con el volumen para el que se crearon.
  const sliceActors = useRef<{ image: vtkImageData; items: SliceActor[] } | null>(null);
  // Actors that carry a layer id, so the rehearsal can move them by name.
  const namedActors = useRef<Map<string, vtkActor>>(new Map());
  // El contorno de cada capa que lo pide, por id (o URL), para que siga los
  // cambios de color y opacidad de su capa sin reconstruir la escena.
  const outlineActors = useRef<Map<string, vtkActor>>(new Map());
  // Qué fichero tiene cargado ahora mismo cada capa CON NOMBRE. Una capa con
  // nombre puede cambiar de geometría sin reconstruir la escena.
  const loadedUrlById = useRef<Map<string, string>>(new Map());
  // Las capas del último render: el cambio de geometría es asíncrono y, al
  // terminar, tiene que aplicar la matriz de ESE momento, no la de cuando
  // empezó la descarga (el arrastre pudo seguir mientras tanto).
  const latestLayers = useRef(layers);
  latestLayers.current = layers;
  // Capas con nombre a las que el efecto de la matriz puso una matriz propia
  // (ver ese efecto); el cambio de geometría también la consulta.
  const matrixIds = useRef<Set<string>>(new Set());
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

  // Asas: sus actores en la capa superior y, para resolver el pick, de qué asa
  // es cada actor. Los límites de todas juntas los lee `syncOverlay` para que
  // el recorte de la capa las abarque (ver allí).
  const handleActors = useRef<vtkActor[]>([]);
  const handleIdByActor = useRef<Map<vtkActor, string>>(new Map());
  const handleKindByActor = useRef<Map<vtkActor, string>>(new Map());
  const handleBounds = useRef<number[] | null>(null);
  // Lo último que llegó por props, leído desde los oyentes del puntero, que
  // viven mientras el componente y no se rehacen en cada render.
  const onHandleDragRef = useRef(onHandleDrag);
  onHandleDragRef.current = onHandleDrag;
  const onHandleDoubleClickRef = useRef(onHandleDoubleClick);
  onHandleDoubleClickRef.current = onHandleDoubleClick;
  const onLayerLoadedRef = useRef(onLayerLoaded);
  onLayerLoadedRef.current = onLayerLoaded;

  // Rótulos: se escriben en el DOM a mano en cada cambio de cámara. Con estado
  // de React, girar la escena repintaría el componente entero en cada fotograma.
  const labelSvg = useRef<SVGSVGElement>(null);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const placeLabels = useRef(() => {
    const svg = labelSvg.current, h = handles.current, el = containerRef.current;
    if (!svg || !h || !el) return;
    const w = el.clientWidth, ht = el.clientHeight;
    const list = labelsRef.current;
    svg.querySelectorAll("text").forEach((t, i) => {
      const l = list[i];
      if (!l || w < 1 || ht < 1) { t.setAttribute("display", "none"); return; }
      const d = h.renderer.worldToNormalizedDisplay(l.pos[0], l.pos[1], l.pos[2], w / ht);
      // Fuera de [0, 1] en profundidad: detrás de la cámara (o fuera de su recorte).
      if (!(d[2] >= 0 && d[2] <= 1)) { t.setAttribute("display", "none"); return; }
      const p = toPixels([d[0], d[1]], w, ht);
      t.setAttribute("x", (p.x + 6).toFixed(1));
      t.setAttribute("y", (p.y - 6).toFixed(1));
      t.removeAttribute("display");
    });
  }).current;
  const labelKey = labels.map((l) => `${l.pos.join(",")}|${l.text}|${l.color}`).join(";");

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
    .map((l) => `${l.a.join(",")}-${l.b.join(",")}|${l.color.join(",")}|${l.radiusMm ?? ""}|${l.opacity ?? ""}|${l.scale ?? 1}`)
    .join(";");
  const handleKey = handleList
    .map((g) => `${g.id}|${g.kind}|${g.pos.join(",")}|${g.normal?.join(",") ?? ""}|${g.radiusMm}|${g.color.join(",")}|${g.lineTo?.join(",") ?? ""}`)
    .join(";");
  const userMatrixKey = layers.map((l) => l.userMatrix?.join(",") ?? "").join(";");
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
    // así que no cuenta para ENCUADRAR ni para la escala de los marcadores.
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
      // El recorte se ajusta a lo que la capa dibuja: el punto y las asas. Las
      // asas no cuentan para los límites (setUseBounds(false)), así que entran
      // aquí a mano; si no, un asa lejos del punto en profundidad quedaría
      // recortada, y tampoco se podría pinchar (el rayo del picker va del
      // plano cercano al lejano). Sin nada visible el recorte queda como esté.
      let b: Bounds | null = focusActor.getVisibility() ? [...focusActor.getBounds()] as Bounds : null;
      const hb = handleBounds.current;
      if (hb) {
        b = b
          ? [Math.min(b[0], hb[0]), Math.max(b[1], hb[1]), Math.min(b[2], hb[2]), Math.max(b[3], hb[3]), Math.min(b[4], hb[4]), Math.max(b[5], hb[5])]
          : [...hb] as Bounds;
      }
      if (b) overlay.resetCameraClippingRange(b);
    };
    const overlaySub = renderer.getActiveCamera().onModified(syncOverlay);
    syncOverlay();
    const labelSub = renderer.getActiveCamera().onModified(placeLabels);

    handles.current = {
      fsrw, renderer, renderWindow, actors: [], actorByUrl: new Map(),
      overlay, focusActor, focusSphere, syncOverlay,
    };
    // La rejilla del visor mueve la escena entre la principal y una celda
    // lateral sin remontarla, así que el lienzo tiene que seguir a su celda
    // (y no tocarse con el recuadro a 0: ver followContainer).
    const stopFollowing = followContainer(container, fsrw);

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
          if (layer.scalars && "array" in layer.scalars) {
            // Color directo por vértice: el servidor ya decidió el color de cada punto
            // (categoría y presión), así la leyenda y la malla no pueden discrepar.
            poly.getPointData().setActiveScalars(layer.scalars.array);
            mapper.setScalarVisibility(true);
            mapper.setColorModeToDirectScalars();
          } else if (layer.scalars && poly.getPointData().getArrayByName(layer.scalars.name)) {
            mapper.setLookupTable(divergingLut(layer.scalars.range, layer.scalars.deadband ?? 0, layer.scalars.invert));
            mapper.setUseLookupTableScalarRange(true);
            mapper.setScalarModeToUsePointFieldData();
            mapper.setColorByArrayName(layer.scalars.name);
            mapper.setColorModeToMapScalars();
            mapper.setScalarVisibility(true);
          } else {
            mapper.setScalarVisibility(false); // solid color, not scalar-mapped
          }

          const actor = vtkActor.newInstance();
          actor.setMapper(mapper);
          layerMappers.current.push(mapper);
          if (layer.id) {
            namedActors.current.set(layer.id, actor);
            loadedUrlById.current.set(layer.id, layer.url);
            // Nace ya en su sitio: sin esto el clip aparecería un fotograma en
            // la pose del fichero antes de que el efecto de la matriz lo mueva.
            actor.setUserMatrix(toColumnMajor(layer.userMatrix ?? IDENTITY) as never);   // por columnas, como lee vtk.js; el .d.ts pide mat4 y copia cualquier array de 16
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
          } else if (layer.frame && !focusBounds) {
            focusBounds = poly.getBounds();
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
      for (const [id, url] of loadedUrlById.current) onLayerLoadedRef.current?.(id, url);
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
      stopFollowing();
      pickSub.unsubscribe();
      camSub.unsubscribe();
      overlaySub.unsubscribe();
      labelSub.unsubscribe();
      inset.dispose();
      insetRef.current = null;
      registerCaptureRef.current?.(null);
      // La cámara NO se anula al rehacer la escena (otro candidato, un
      // dispositivo, la vista previa del umbral): el grupo ENCUADRAR·AX·…·LESIÓN
      // desaparecía y los conmutadores de debajo saltaban. Sus métodos ya
      // miran handles.current; se anula solo al desmontar (efecto de abajo).
      registerPartsRef.current?.(null);
      namedActors.current.clear();
      outlineActors.current.clear();
      markerActors.current = [];
      planeActors.current = [];
      const sl = sliceActors.current;
      if (sl) {
        for (const it of sl.items) { renderer.removeActor(it.actor); it.actor.delete(); it.mapper.delete(); }
        sliceActors.current = null;
      }
      // Las asas se van con la capa superior que se borra aquí; el efecto de las
      // asas las vuelve a poner en la capa nueva.
      handleActors.current = [];
      handleIdByActor.current.clear();
      handleKindByActor.current.clear();
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
  useEffect(() => {
    insetRef.current?.setVisible(showInset);
  }, [key, showInset]);

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
          if (l.scalars && "array" in l.scalars) poly.getPointData().setActiveScalars(l.scalars.array);
          (actor.getMapper() as vtkMapper).setInputData(poly);
          // La matriz va con la geometría: el efecto de la matriz dejó de
          // tocar este actor mientras se descargaba el fichero (conservaba el
          // delta que casa con la malla vieja), así que es aquí, justo con la
          // malla nueva puesta, donde le toca la matriz ACTUAL de la capa. Si
          // se aplicara antes, el clip volvería a su pose previa al arrastre
          // hasta que llegara el fichero.
          const cur = latestLayers.current.find((x) => x.id === l.id);
          const m = matrixAfterSwap(cur?.userMatrix, matrixIds.current.has(l.id));
          if (m) actor.setUserMatrix(toColumnMajor(m) as never);   // por columnas, como lee vtk.js; el .d.ts pide mat4
          if (cur?.userMatrix) matrixIds.current.add(l.id);
          else matrixIds.current.delete(l.id);
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
          // Se pinta y se avisa por capa, no al final del bucle: si no, el
          // mapa de calor nuevo esperaría a que bajara también la malla del
          // clip (segundos con mala red) para decir que ya está en pantalla.
          handles.current?.renderWindow.render();
          onLayerLoadedRef.current?.(l.id, l.url);
        } catch (err) {
          // Un fotograma que no llega no puede dejar la escena a medias.
          console.warn("MeshView: no se pudo cambiar la geometría de", l.id, err);
        }
      }
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
        radius: l.radiusMm ?? rMarker * RULER_TUBE_RATIO * (l.scale ?? 1),
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

  // ── Rótulos: al cambiar la lista (antes de pintar, para que un rótulo nuevo
  //    no asome un fotograma en la esquina) y al cambiar el tamaño de la celda.
  useLayoutEffect(() => { placeLabels(); }, [key, labelKey, placeLabels]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => placeLabels());
    ro.observe(el);
    return () => ro.disconnect();
  }, [placeLabels]);

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

  // ── Cortes 3D: los tres cortes de índice en gris en su posición real ──── #
  //
  // El patrón de la cara del corte de VOLUMEN (MipView): un mapper de reslice
  // por plano sobre el MISMO vtkImageData de los cortes, así que la textura 3D
  // del volumen se sube una vez y la comparten los tres. Van en el renderer
  // principal, con prueba de profundidad: la malla translúcida se ve encima y
  // detrás de ellos en su sitio, y los contornos y asas siguen en su capa.
  // Mover el punto compartido solo mueve el origen de cada plano: nada se crea.
  const sliceSpecKey = slicePlanes
    ? slicePlanes.specs.map((p) => `${p.plane}|${p.normal.join(",")}|${p.originMm.join(",")}`).join(";")
    : "";
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    const drop = () => {
      const sl = sliceActors.current;
      if (!sl) return;
      for (const it of sl.items) { h.renderer.removeActor(it.actor); it.actor.delete(); it.mapper.delete(); }
      sliceActors.current = null;
    };
    if (!slicePlanes) {
      if (sliceActors.current) { drop(); h.renderWindow.render(); }
      return;
    }
    // Otro volumen (otra serie, otro nivel de detalle): se rehacen sobre él.
    if (sliceActors.current && sliceActors.current.image !== slicePlanes.image) drop();
    if (!sliceActors.current) {
      const items = slicePlanes.specs.map((): SliceActor => {
        const plane = vtkPlane.newInstance();
        const mapper = vtkImageResliceMapper.newInstance();
        mapper.setInputData(slicePlanes.image);
        mapper.setSlabThickness(0);
        mapper.setSlicePlane(plane);
        const actor = vtkImageSlice.newInstance();
        actor.setMapper(mapper);
        actor.getProperty().setInterpolationTypeToLinear();
        // Fuera del picking (el clic en la malla y las asas no deben chocar
        // con un corte) y del encuadre: ENCUADRAR sigue encuadrando la malla.
        actor.setPickable(false);
        actor.setUseBounds(false);
        h.renderer.addActor(actor);
        return { plane, mapper, actor };
      });
      sliceActors.current = { image: slicePlanes.image, items };
    }
    const ww = Math.max(1, slicePlanes.ww);
    sliceActors.current.items.forEach((it, i) => {
      const spec = slicePlanes.specs[i];
      if (!spec) return;
      it.plane.setNormal(...spec.normal);
      it.plane.setOrigin(...spec.originMm);
      it.actor.getProperty().setColorWindow(ww);
      it.actor.getProperty().setColorLevel(slicePlanes.wc);
    });
    // WHY: los cortes no cuentan para los límites, así que el recorte
    // cercano/lejano de la cámara lo fijaría solo la malla, y un corte que
    // sobresale de ella en profundidad se vería truncado al girar. Cada vez
    // que la cámara cambia (también tras el reajuste del interactor) el
    // recorte se ensancha a la caja del volumen. Converge: el segundo ajuste
    // da el mismo rango y ya no modifica la cámara.
    const box = slicePlanes.image.getBounds();
    const widen = () => {
      if (!sliceActors.current) return;
      const v = h.renderer.computeVisiblePropBounds();
      const b = isFinite(v[0]) && v[1] >= v[0]
        ? [Math.min(v[0], box[0]), Math.max(v[1], box[1]), Math.min(v[2], box[2]), Math.max(v[3], box[3]), Math.min(v[4], box[4]), Math.max(v[5], box[5])]
        : [...box];
      h.renderer.resetCameraClippingRange(b as Bounds);
    };
    const sub = h.renderer.getActiveCamera().onModified(widen);
    widen();
    h.renderWindow.render();
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slicePlanes?.image, sliceSpecKey, slicePlanes?.wc, slicePlanes?.ww]);

  // ── Matriz de usuario por capa: mover un actor sin recargar su malla ───── #
  //
  // Con la época también: si la matriz cambió mientras la escena cargaba, los
  // actores aún no existían y hay que aplicarla al terminar. Solo capas con
  // `id` (las únicas con actor por nombre). No compite con `registerParts`
  // del ensayo: mientras hay ensayo el visor no manda `userMatrix`, así que
  // esta clave no cambia y el efecto no pisa la animación.
  //
  // Solo vuelve a la identidad la capa que TUVO matriz y ya no la tiene. Las
  // demás capas con nombre no se tocan: una pieza del ensayo en pausa lleva la
  // pose que le puso `registerParts`, y devolverla a la identidad al cambiar
  // la matriz de otra capa la sacaría de su sitio.
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    let changed = false;
    const now = new Set<string>();
    for (const l of layers) {
      if (!l.id) continue;
      // Cambio de geometría pendiente (llegó un plan nuevo y su malla aún se
      // descarga): la matriz nueva es para la malla nueva. Se deja la que el
      // actor tiene, que casa con la malla que se ve; el cambio de geometría
      // aplica la actual en cuanto pone el fichero. Se conserva si la capa
      // tuvo matriz, para que allí se sepa si hay que volver a la identidad.
      if (!shouldApplyMatrix(loadedUrlById.current.get(l.id), l.url)) {
        if (l.userMatrix || matrixIds.current.has(l.id)) now.add(l.id);
        continue;
      }
      if (l.userMatrix) now.add(l.id);
      const actor = namedActors.current.get(l.id);
      if (!actor) continue;
      // Las capas traen la matriz por filas (clipPose); vtk.js la lee por
      // columnas. El .d.ts pide mat4 y declara void; vtk.js copia cualquier
      // array de 16 y devuelve si cambió algo.
      const set = (m: number[]) => Boolean(actor.setUserMatrix(toColumnMajor(m) as never) as unknown);
      if (l.userMatrix) {
        if (set(l.userMatrix)) changed = true;
      } else if (matrixIds.current.has(l.id)) {
        if (set(IDENTITY)) changed = true;
      }
    }
    matrixIds.current = now;
    if (changed) h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMatrixKey, sceneEpoch]);

  // ── Asas: actores agarrables en la capa superior ─────────────────────── #
  //
  // En la capa de encima por lo mismo que el punto compartido: el asa suele
  // quedar dentro del vaso o detrás del saco. Son lo ÚNICO seleccionable de
  // esa capa (el punto no), así que un pick allí devuelve un asa o nada.
  // Sin luz: un asa es un mando de color plano, no otra superficie.
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    handleActors.current.forEach((a) => h.overlay.removeActor(a));
    handleActors.current = [];
    handleIdByActor.current.clear();
    handleKindByActor.current.clear();
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const grow = (p: Vec3, r: number) => {
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - r); hi[i] = Math.max(hi[i], p[i] + r); }
    };
    const add = (mapper: vtkMapper, color: Vector3, id: string | null, lineWidth?: number, kind = "") => {
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const prop = actor.getProperty();
      prop.setColor(...color);
      prop.setLighting(false);
      if (lineWidth) prop.setLineWidth(lineWidth);
      // Fuera del encuadre y de la escala de los marcadores, como los planos;
      // el recorte de la capa las tiene en cuenta aparte (`handleBounds`).
      actor.setUseBounds(false);
      actor.setPickable(id !== null);
      if (id !== null) { handleIdByActor.current.set(actor, id); handleKindByActor.current.set(actor, kind); }
      h.overlay.addActor(actor);
      handleActors.current.push(actor);
    };
    const polyline = (pts: number[], closed: boolean) => {
      const n = pts.length / 3;
      const ids = Array.from({ length: n }, (_, i) => i);
      const pd = vtkPolyData.newInstance();
      pd.getPoints().setData(new Float32Array(pts), 3);
      pd.getLines().setData(new Uint32Array(closed ? [n + 1, ...ids, 0] : [n, ...ids]));
      const mapper = vtkMapper.newInstance();
      mapper.setInputData(pd);
      return mapper;
    };
    for (const g of handleList) {
      const color = g.color as Vector3;
      // La guía primero y NO seleccionable: es un hilo largo y, con la
      // tolerancia del picker, robaría a la cámara las pulsaciones de toda una
      // franja de pantalla. Se agarra el asa, no su hilo.
      if (g.lineTo) {
        add(polyline([...g.pos, ...g.lineTo], false), color, null, 1);
        grow(g.lineTo, 0);
      }
      if (g.kind === "sphere") {
        const src = vtkSphereSource.newInstance({ radius: g.radiusMm, thetaResolution: 16, phiResolution: 16 });
        src.setCenter(g.pos[0], g.pos[1], g.pos[2]);
        const mapper = vtkMapper.newInstance();
        mapper.setInputConnection(src.getOutputPort());
        add(mapper, color, g.id, undefined, "sphere");
      } else if (g.kind === "square") {
        const src = vtkCubeSource.newInstance({ center: g.pos, xLength: g.radiusMm, yLength: g.radiusMm, zLength: g.radiusMm });
        const mapper = vtkMapper.newInstance();
        mapper.setInputConnection(src.getOutputPort());
        add(mapper, color, g.id, undefined, "square");
      } else {
        // Anillo: circunferencia de 48 puntos en el plano ⟂ a la normal por
        // `pos`. La base (u, v) sale de cualquier eje que no sea paralelo a n.
        const n0 = g.normal ?? [0, 0, 1];
        const nl = Math.hypot(n0[0], n0[1], n0[2]) || 1;
        const n: Vec3 = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
        const a: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const ad = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
        const u0: Vec3 = [a[0] - ad * n[0], a[1] - ad * n[1], a[2] - ad * n[2]];
        const ul = Math.hypot(u0[0], u0[1], u0[2]);
        const u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
        const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        const pts: number[] = [];
        for (let i = 0; i < 48; i++) {
          const t = (2 * Math.PI * i) / 48, c = Math.cos(t) * g.radiusMm, s = Math.sin(t) * g.radiusMm;
          pts.push(g.pos[0] + c * u[0] + s * v[0], g.pos[1] + c * u[1] + s * v[1], g.pos[2] + c * u[2] + s * v[2]);
        }
        add(polyline(pts, true), color, g.id, 2, "ring");
      }
      grow(g.pos, g.radiusMm);
    }
    handleBounds.current = handleList.length ? [lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]] : null;
    h.syncOverlay();
    h.renderWindow.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handleKey]);

  // ── Ciclo de arrastre de un asa ──────────────────────────────────────── #
  //
  // Oyentes en fase de captura sobre NUESTRO contenedor, que envuelve el de
  // vtk.js: llegan antes que su interactor y, si el puntero cae en un asa,
  // stopImmediatePropagation impide que la cámara empiece a girar (el mismo
  // truco que MipView usa con el botón derecho). Fuera de las asas no se toca
  // nada y la cámara funciona como siempre. Se montan una vez: el contenedor
  // sobrevive a las reconstrucciones de la escena y todo se lee de refs.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const picker = vtkCellPicker.newInstance();
    // ~0,5 % de la diagonal del lienzo: lo justo para coger un anillo de 2 px
    // sin que un asa robe la pulsación a una zona amplia alrededor.
    picker.setTolerance(0.005);
    let drag: DragState = { id: null };
    let pointerId: number | null = null;
    let last = { px: 0, py: 0, vp: { width: 1, height: 1 } as Viewport };

    // Píxel CSS respecto al lienzo y tamaño del lienzo, como los espera el
    // controlador de arrastre (y desde arriba, como el puntero).
    const where = (e: MouseEvent) => {
      const h = handles.current;
      if (!h) return null;
      const canvas = (h.renderWindow.getViews()[0] as unknown as { getCanvas(): HTMLCanvasElement }).getCanvas();
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { h, canvas, r, px: e.clientX - r.left, py: e.clientY - r.top, vp: { width: r.width, height: r.height } };
    };
    // Qué asa hay bajo el puntero. vtk.js cuenta la pantalla en píxeles del
    // lienzo (escalados por devicePixelRatio) y con la y desde ABAJO.
    const pickAt = (w: NonNullable<ReturnType<typeof where>>): string | null => {
      if (handleIdByActor.current.size === 0) return null;
      w.h.syncOverlay();
      const sx = w.canvas.width / w.r.width, sy = w.canvas.height / w.r.height;
      picker.pick([w.px * sx, (w.r.height - w.py) * sy, 0], w.h.overlay);
      // Todas las que toca, de la más cercana a la más lejana; chooseHandle
      // da prioridad a las esferas sobre el anillo que las cruza.
      const hits = (picker.getActors() as vtkActor[]).flatMap((a) => {
        const id = handleIdByActor.current.get(a);
        return id ? [{ id, kind: handleKindByActor.current.get(a) ?? "" }] : [];
      });
      return chooseHandle(hits);
    };
    const emit = (phase: HandleDragEvent["phase"], id: string, shift: boolean) => {
      const h = handles.current;
      if (!h) return;
      onHandleDragRef.current?.({
        id, phase, px: last.px, py: last.py, shift,
        camera: cameraLike(h.renderer.getActiveCamera(), last.vp), viewport: last.vp,
      });
    };
    const finish = () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointerup", onWindowUp, { capture: true });
      window.removeEventListener("pointercancel", onWindowUp, { capture: true });
      if (pointerId !== null) {
        try { el.releasePointerCapture(pointerId); } catch { /* ya liberada */ }
      }
      pointerId = null;
    };
    const step = (ev: DragEvent, shift: boolean) => {
      const id = drag.id;
      const s = nextDrag(drag, ev);
      drag = s.state;
      if (s.emit && id) emit(s.emit, id, shift);
      if (drag.id === null) finish();
    };
    const onDown = (e: PointerEvent) => {
      // Un segundo dedo o botón durante un arrastre no empieza otro ni llega a la cámara.
      if (drag.id !== null) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (handleIdByActor.current.size === 0) return;
      const w = where(e);
      if (!w) return;
      const s = nextDrag(drag, { type: "down", id: pickAt(w), button: e.button });
      if (s.emit !== "start" || !s.state.id) return;
      e.preventDefault(); e.stopImmediatePropagation();
      drag = s.state;
      pointerId = e.pointerId;
      last = { px: w.px, py: w.py, vp: w.vp };
      // La captura sigue el arrastre aunque el puntero salga del lienzo. Si
      // no se puede capturar (el puntero ya no existe, un navegador que no
      // la admite), soltar FUERA del contenedor no llegaría a nadie y el
      // arrastre quedaría enganchado con la cámara apagada: la ventana entera
      // escucha entonces el final.
      try { el.setPointerCapture(e.pointerId); } catch {
        window.addEventListener("pointerup", onWindowUp, { capture: true });
        window.addEventListener("pointercancel", onWindowUp, { capture: true });
      }
      window.addEventListener("keydown", onKey, { capture: true });
      emit("start", s.state.id, e.shiftKey);
    };
    const onPointer = (e: PointerEvent) => {
      if (drag.id === null || e.pointerId !== pointerId) return;
      // Mientras dura el arrastre la cámara no ve nada de este puntero.
      e.stopImmediatePropagation();
      const w = where(e);
      if (w) last = { px: w.px, py: w.py, vp: w.vp };
      const type = e.type === "pointermove" ? "move" : e.type === "pointerup" ? "up"
        : e.type === "pointercancel" ? "cancel" : "lost";
      step({ type }, e.shiftKey);
    };
    function onWindowUp(e: PointerEvent) {
      if (drag.id === null || e.pointerId !== pointerId) return;
      step({ type: e.type === "pointerup" ? "up" : "cancel" }, e.shiftKey);
    }
    // Escape deshace el arrastre en curso y no le llega a nadie más (que, por
    // ejemplo, no cierre además el panel de la herramienta).
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || drag.id === null) return;
      e.preventDefault(); e.stopPropagation();
      step({ type: "escape" }, e.shiftKey);
    }
    // Doble clic en un asa: es del asa, no de la celda. Parado aquí no llega
    // al onDoubleClick de la rejilla, que promovería la vista a principal.
    const onDbl = (e: MouseEvent) => {
      if (handleIdByActor.current.size === 0) return;
      const w = where(e);
      const id = w ? pickAt(w) : null;
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      onHandleDoubleClickRef.current?.(id);
    };
    const opts = { capture: true } as const;
    el.addEventListener("pointerdown", onDown, opts);
    el.addEventListener("pointermove", onPointer, opts);
    el.addEventListener("pointerup", onPointer, opts);
    el.addEventListener("pointercancel", onPointer, opts);
    el.addEventListener("lostpointercapture", onPointer, opts);
    el.addEventListener("dblclick", onDbl, opts);
    return () => {
      el.removeEventListener("pointerdown", onDown, opts);
      el.removeEventListener("pointermove", onPointer, opts);
      el.removeEventListener("pointerup", onPointer, opts);
      el.removeEventListener("pointercancel", onPointer, opts);
      el.removeEventListener("lostpointercapture", onPointer, opts);
      el.removeEventListener("dblclick", onDbl, opts);
      window.removeEventListener("keydown", onKey, opts);
      window.removeEventListener("pointerup", onWindowUp, opts);
      window.removeEventListener("pointercancel", onWindowUp, opts);
      picker.delete();
    };
  }, []);

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

  // El svg va al lado del contenedor y no dentro: vtk.js mete su lienzo en el
  // contenedor y quedaría encima de los rótulos.
  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {labels.length > 0 && (
        <svg ref={labelSvg} className="hud-anot" aria-hidden="true">
          {labels.map((l, i) => <text key={i} fill={l.color} display="none">{l.text}</text>)}
        </svg>
      )}
    </>
  );
}


/** Azul → gris → rojo, con una franja gris de ±`deadband` alrededor de 0. */
export function divergingLut(range: number, deadband: number, invert = false) {
  const r = Math.max(range, 1e-3);
  const d = Math.min(Math.max(deadband, 0), r * 0.9);
  const lut = vtkColorTransferFunction.newInstance();
  const grey: [number, number, number] = [0.78, 0.8, 0.82];
  const blue: [number, number, number] = [0.15, 0.35, 0.85];
  const red: [number, number, number] = [0.88, 0.2, 0.15];
  lut.addRGBPoint(-r, ...(invert ? red : blue));
  lut.addRGBPoint(-d, ...grey);
  lut.addRGBPoint(d, ...grey);
  lut.addRGBPoint(r, ...(invert ? blue : red));
  lut.setMappingRange(-r, r);
  lut.updateRange();
  return lut;
}
