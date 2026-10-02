/* PlanningContext — state shared across the 7-step workspace:
   session id, DICOM series, thresholds, segmentation, detection, morphometry… */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PartsHandle } from "../vtk/MeshView";
import type { FrameSource } from "../vtk/viewerRecorder";

/** Un clip de la lista de colocación. La normal no se guarda: se deriva del eje
 *  del cuello y de los dos ángulos (placedClips.clipNormal), así no puede
 *  quedarse describiendo un cuello que la morfometría ya no tiene. */
export interface PlacedClip {
  key: number;
  clip_id: string;
  name: string;
  position: Vec3;
  rotation_deg: number;
  azimuthDeg: number;
  elevationDeg: number;
}

/** Lo que el visor le da al grabador del topbar. */
export interface ViewerRecordingSource extends FrameSource {
  /** El estado que se guarda con el vídeo, como con una captura. */
  state: () => Record<string, unknown>;
}
import { loadLayout, saveLayout, type ViewerLayout } from "../vtk/layout";
import { mmToVoxel, type ManualOrientation, type Plane } from "../vtk/geometry";
import type { VolumePreset } from "../vtk/volumePresets";
import { clampPlane, DEFAULT_FREE_PLANE, type FreePlane } from "../vtk/freePlane";
import { clampTilt } from "../vtk/clipPose";
import type {
  AneurysmCandidate,
  DeviceKind,
  MorphometryResult,
  PatientSummary,
  ClipAnimationResult,
  ClipFieldResult,
  PerforatorCandidate,
  SegmentResult,
  SeriesInfo,
  TreatmentDecisionResult,
  VolumeMeta,
} from "../api/types";

interface PlanningState {
  patient: PatientSummary | null;
  /** Clinical case being planned (Study row). Known when the pipeline is
   *  entered from a case, so the upload panel no longer has to ask. */
  caseId: number | null;
  caseLabel: string;
  /** Imaging study (acquisition) loaded in this session, once archived. */
  imagingStudyId: number | null;
  sessionId: string | null;
  series: SeriesInfo | null;
  /** Live threshold-preview band [lower, upper] HU set from the segmentation
   *  sliders; the MPR views tint the captured voxels in near-real-time. */
  previewBand: [number, number] | null;
  /** URL of the coarse 3D preview mesh shown while tuning the thresholds. */
  previewMeshUrl: string | null;
  segmentation: SegmentResult | null;
  candidates: AneurysmCandidate[];
  /** Sitios que un veto descartó; se listan aparte pero se pueden elegir. */
  rejectedCandidates: AneurysmCandidate[];
  /** Aceptados seguidos de descartados: `selectedCandidate` indexa ESTA lista. */
  allCandidates: AneurysmCandidate[];
  selectedCandidate: number;
  /** El backend limpió la morfometría al re-detectar (el sitio medido ya no
   *  está). En el store y no en el panel porque «Reanudar» también lo recibe y
   *  el panel de detección tiene que poder decirlo después. */
  morphoInvalidatedNotice: boolean;
  morphometry: MorphometryResult | null;
  treatment: TreatmentDecisionResult | null;
  /** Placed device meshes by family, shown together in the viewer. One slot per
   *  family because that is how the backend records them: planning a stent after
   *  a clip leaves BOTH in the report, so the viewer has to show both — and each
   *  needs its own «Limpiar» to take one off without touching the other.
   *  The two stent planners (straight and centreline-guided) share the `stent`
   *  slot, mirroring the single stent record the backend keeps. */
  deviceMeshes: Record<DeviceKind, string | null>;
  /** URL of the extracted vessel centreline tube mesh, shown in the viewer. */
  centerlineMesh: string | null;
  /** Total arc length (mm) of the extracted centreline — feeds the cl-stent range sliders. */
  centerlineArcMm: number | null;
  /** Window/level shared by every MPR view (strip, main preview and oblique).
      Null until the volume metadata arrives, then seeded from the DICOM. */
  mprWl: { wc: number; ww: number } | null;
  /** Crosshair voxel shared by every MPR view, so navigating in one moves all. */
  mprVoxel: { x: number; y: number; z: number };
  /** Active 3D-pick mode: centreline endpoints, a measurement, or the neck plane. */
  pickMode: PickMode;
  clSource: Vec3 | null;
  clTarget: Vec3 | null;
  /** Semi-automatic neck plane: a point on the neck and the dome apex (click on the mesh). */
  neckOrigin: Vec3 | null;
  neckDome: Vec3 | null;
  /** 3D caliper measurements (distance between two picked points). */
  measurements: Measurement[];
  /** First endpoint of an in-progress measurement (waiting for the second click). */
  measurePending: Vec3 | null;
  /** Seed points placed on the volume for grow-from-seeds segmentation. */
  /** Points marked around the neck rim. With three or more the neck plane is
   *  fitted to them instead of assuming it is perpendicular to the dome axis. */
  neckRim: Vec3[];
  /** Puntos del anillo de la tijera, en el orden en que se marcaron. */
  scissorsPoints: Vec3[];
  /** Malla de la pieza que se iría, mientras se está decidiendo el corte. */
  scissorsPreview: string | null;
  /** Qué lado se conserva: 0 la pieza mayor, 1 la otra. */
  scissorsKeepSide: number;
  /** Perforator candidates from GET /perforators, kept in the store so the 3D
   *  viewer can mark where each one is — the panel used to list distances with
   *  no way to see which vessel any row referred to. */
  perforators: PerforatorCandidate[];
  /** Ids of the perforators the user has chosen to show in 3D. Empty by
   *  default: twelve markers appearing unasked around the neck hide the very
   *  geometry they sit on, so each one is shown only when asked for. */
  visiblePerforators: string[];
  /** Clip rehearsal in progress: the three meshes the viewer must draw instead
   *  of the placed clip while the manoeuvre plays. Null when not rehearsing. */
  clipRehearsal: ClipAnimationResult | null;
  /** Mapa de calor del clip colocado y su veredicto; null si aún no se ha pedido. */
  clipField: ClipFieldResult | null;
  showClipField: boolean;
  /** Los clips de la lista de colocación. Viven aquí y no en el panel para que
   *  el manipulador del visor pueda editarlos. */
  placedClips: PlacedClip[];
  /** La lista con la que se cocieron las mallas vigentes; null sin plan. */
  plannedClips: PlacedClip[] | null;
  /** La lista para la que se calculó el mapa de calor vigente; null sin campo.
   *  El plan llega antes que el campo: «DESFASADO» y el mapa atenuado siguen
   *  hasta que llega ESTE, porque hasta entonces el veredicto es el de antes. */
  fieldClips: PlacedClip[] | null;
  /** Qué enseña el 3D del mapa de calor: si la capa está en un 3D montado y
   *  qué fichero tiene puesto. Lo escribe el visor. La respuesta del campo
   *  llega antes que su malla, así que «DESFASADO» sigue hasta que `url` es la
   *  del campo vigente (ver fieldColoursOnScreen). Se guarda la URL y no un
   *  «ya está»: la tarjeta la compara con el campo nuevo en el mismo render en
   *  que este llega, sin esperar a que el visor reaccione. */
  fieldMeshOnScreen: { shown: boolean; url: string | null };
  setFieldMeshShown: (v: boolean) => void;
  setFieldMeshUrl: (url: string | null) => void;
  /** La pestaña de clips está montada. Ella es la que recoloca tras mover el
   *  clip: sin ella, el manipulador del 3D dejaría un delta que nadie replanea. */
  clipsTabActive: boolean;
  setClipsTabActive: (v: boolean) => void;
  selectedClipKey: number | null;
  /** Índice del fotograma del saco constreñido que toca enseñar, o null para el
   *  saco sin deformar. Lo escribe el ensayo en cada cuadro y lo lee el visor:
   *  la deformación es geometría calculada en el backend, no una matriz que la
   *  GPU pueda aplicar sola. */
  sacFrame: number | null;
  setSacFrame: (i: number | null) => void;
  /** Outer radius of each risk zone [high, medium, low] in mm, as reported by
   *  the backend, so the viewer legend states the bands really used. */
  perforatorZones: [number, number, number] | null;
  /** Picked centre of the mesh-crop ROI (box/sphere). */
  cropCenter: Vec3 | null;
  /** Previa del corte por plano: el eje, la altura y qué lado se conserva.
   *  El visor la usa para recortar el render en vivo, de modo que al arrastrar
   *  el deslizador se vea desaparecer justo lo que el corte se llevaría. */
  /** Caja de recorte en vivo: los seis límites en mm. Se dibuja y recorta la
   *  malla a la vez, así que se ve por dónde se corta en los tres ejes. */
  boxCut: { min: [number, number, number]; max: [number, number, number] } | null;
  setBoxCut: (b: { min: [number, number, number]; max: [number, number, number] } | null) => void;
  /** Último punto señalado con el borrador de piezas. El visor solo señala; el
   *  panel de edición es quien llama a la API y lo vuelve a poner en null,
   *  igual que hace con el resto de ediciones de malla. */
  erasePick: Vec3 | null;
  /** Mesh-crop ROI shape/size/mode — shared with the viewer so it can draw a
   *  translucent preview of exactly what the crop will keep/remove. */
  cropRadius: number;
  cropShape: "sphere" | "box";
  cropInvert: boolean;
  /** Surgical approach trajectory: entry point and aneurysm target (mm). */
  trajEntry: Vec3 | null;
  trajTarget: Vec3 | null;
  /** Show the 3D morphometric overlay (neck disc, dome/max-diameter lines, labels). */
  morphoOverlay: boolean;
  /** Capture the live 3D viewport as a PNG data URL (set by MeshView while mounted). */
  captureViewport: (() => Promise<string | null>) | null;
  /** Guarda la vista actual del visor como captura del caso. La publica el
   *  visor —es el único que sabe componer sus cinco paneles— y la llama el
   *  botón del topbar, que es donde el profesional la busca. Lanza si falla. */
  captureCase: (() => Promise<void>) | null;
  setCaptureCase: (fn: (() => Promise<void>) | null) => void;
  /** Lo que el grabador del topbar necesita del visor: cómo leer cada
   *  fotograma y el estado que acompaña al vídeo. Lo publica el visor. */
  viewerRecording: ViewerRecordingSource | null;
  setViewerRecording: (src: ViewerRecordingSource | null) => void;
  /** Encuadra el 3D y los cortes en la lesión (cuello medido o candidato
   *  elegido). Lo registra el visor; los paneles solo lo llaman. */
  centerOnLesion: (() => void) | null;
  /** True when results exist that have not been written to a saved session.
   *  Saving is a manual action, so without this a click on the logo threw away
   *  an afternoon's analysis with no warning at all. */
  dirty: boolean;
  /** Distribución del visor: la vista principal y las otras cuatro (en columna,
   *  en franja o ocultas), y qué vista ocupa cada sitio. */
  viewerLayout: ViewerLayout;
  setViewerLayout: (l: ViewerLayout) => void;
  /** Punto (mm de mundo) en el que se centran todas las vistas cuando
   *  `syncViews` está activo. El crosshair (`mprVoxel`) se deriva de él. */
  focusPoint: Vec3 | null;
  setFocusMm: (mm: Vec3, meta: VolumeMeta) => void;
  syncViews: boolean;
  setSyncViews: (v: boolean) => void;
  /** Orientación fijada a mano para volúmenes sin etiquetas (3DRA). */
  orientationManual: ManualOrientation | null;
  setOrientationManual: (m: ManualOrientation | null) => void;
  mipMode: "acumulado" | "lamina";
  setMipMode: (m: "acumulado" | "lamina") => void;
  mipSlabMm: number;
  setMipSlabMm: (mm: number) => void;
  /** Eje en el que acumula el MIP, elegido en su propio HUD. `null`: sigue a
   *  la vista principal (coronal o sagital; si no, axial), como antes. */
  mipPlane: Plane | null;
  setMipPlane: (p: Plane | null) => void;
  /** Cómo pinta la vista VOLUMEN: proyección de máxima intensidad o
   *  composición por tejidos con el preajuste de abajo. */
  volumeMode: "mip" | "compuesto";
  setVolumeMode: (m: "mip" | "compuesto") => void;
  volumePreset: VolumePreset;
  setVolumePreset: (p: VolumePreset) => void;
  /** Plano de corte libre del volumen unificado (azimut, elevación, desplazamiento). */
  freePlane: FreePlane;
  /** Guarda el plano ya acotado (clampPlane), para que ningún consumidor reciba ángulos fuera de rango. */
  setFreePlane: (p: FreePlane) => void;
  /** Si el recorte sigue los ejes de la rejilla o el plano libre. */
  clipMode: "eje" | "libre";
  setClipMode: (m: "eje" | "libre") => void;
  /** Si la cara del corte se dibuja rellena o se deja abierta. */
  cutFaceVisible: boolean;
  setCutFaceVisible: (v: boolean) => void;
  /** Ventana (nivel y anchura) elegida por preajuste; sin entrada, rige la del rango completo. */
  volumeWindows: Partial<Record<VolumePreset, { wc: number; ww: number }>>;
  /** null borra la entrada del preajuste y devuelve su ventana por defecto. */
  setVolumeWindow: (preset: VolumePreset, w: { wc: number; ww: number } | null) => void;
  /** Sube cada vez que el volumen de la sesión cambia en el servidor sin que
   *  cambie la sesión (otra serie, preproceso o su reversión): el visor vuelve
   *  a pedir la meta y, con su cache_key nuevo, el volumen del navegador. */
  volumeVersion: number;
  bumpVolumeVersion: () => void;

  setPatient: (p: PatientSummary | null) => void;
  setCase: (id: number | null, label?: string) => void;
  setImagingStudyId: (id: number | null) => void;
  setSession: (id: string | null) => void;
  setSeries: (s: SeriesInfo | null) => void;
  setPreviewBand: (b: [number, number] | null) => void;
  setPreviewMeshUrl: (u: string | null) => void;
  setSegmentation: (s: SegmentResult | null) => void;
  setCandidates: (c: AneurysmCandidate[]) => void;
  setRejectedCandidates: (c: AneurysmCandidate[]) => void;
  setSelectedCandidate: (i: number) => void;
  setMorphometry: (m: MorphometryResult | null) => void;
  setTreatment: (t: TreatmentDecisionResult | null) => void;
  setMorphoInvalidatedNotice: (v: boolean) => void;
  /** Olvida la medida y todo lo que cuelga de ella: cifras, recomendación y
   *  las marcas del cuello que se pusieron para ese sitio. */
  clearMorphometry: () => void;
  setDeviceMesh: (kind: DeviceKind, url: string | null) => void;
  /** Forget placed devices locally (the API call is the panel's job). */
  clearDeviceMeshes: (kind?: DeviceKind) => void;
  setCenterlineMesh: (url: string | null) => void;
  setCenterlineArcMm: (v: number | null) => void;
  setMprWl: (w: { wc: number; ww: number } | null) => void;
  setMprVoxel: (v: { x: number; y: number; z: number }) => void;
  setPickMode: (m: PickMode) => void;
  setClSource: (p: Vec3 | null) => void;
  setClTarget: (p: Vec3 | null) => void;
  setNeckOrigin: (p: Vec3 | null) => void;
  setNeckDome: (p: Vec3 | null) => void;
  setMeasurements: (m: Measurement[]) => void;
  setMeasurePending: (p: Vec3 | null) => void;
  setNeckRim: (s: Vec3[]) => void;
  setScissorsPoints: (p: Vec3[]) => void;
  setScissorsPreview: (url: string | null) => void;
  setScissorsKeepSide: (s: number) => void;
  setPerforators: (p: PerforatorCandidate[], zones?: [number, number, number] | null) => void;
  setClipRehearsal: (a: ClipAnimationResult | null) => void;
  /** `forClips`: la lista para la que se calculó el campo (queda en `fieldClips`). */
  setClipField: (f: ClipFieldResult | null, forClips?: PlacedClip[] | null) => void;
  setShowClipField: (v: boolean) => void;
  setPlacedClips: (u: PlacedClip[] | ((p: PlacedClip[]) => PlacedClip[])) => void;
  setPlannedClips: (p: PlacedClip[] | null) => void;
  setSelectedClipKey: (k: number | null) => void;
  /** Handle the viewer publishes for moving the rehearsal's parts, and the
   *  panel consumes to drive the motion. Imperative on purpose: a matrix per
   *  frame through React would re-render the workspace 60 times a second. */
  clipParts: PartsHandle | null;
  registerClipParts: (h: PartsHandle | null) => void;
  /** Show or hide one perforator's marker. */
  togglePerforator: (id: string) => void;
  /** Show every perforator, or none. */
  setVisiblePerforators: (ids: string[]) => void;
  setCropCenter: (p: Vec3 | null) => void;
  setErasePick: (p: Vec3 | null) => void;
  setCropRadius: (r: number) => void;
  setCropShape: (s: "sphere" | "box") => void;
  setCropInvert: (v: boolean) => void;
  setTrajEntry: (p: Vec3 | null) => void;
  setTrajTarget: (p: Vec3 | null) => void;
  setMorphoOverlay: (v: boolean) => void;
  setCaptureViewport: (fn: (() => Promise<string | null>) | null) => void;
  setCenterOnLesion: (fn: (() => void) | null) => void;
  /** Called after a successful save — the session on disk now matches the store. */
  markSaved: () => void;
  reset: () => void;
  resetDownstream: () => void;
}

export type Vec3 = [number, number, number];
export type PickMode =
  | "cl_source" | "cl_target" | "measure" | "neck_origin" | "neck_dome"
  | "neck_rim"
  | "scissors"
  | "crop_center" | "erase_piece" | "traj_entry" | "traj_target" | null;

export interface Measurement {
  id: number;
  a: Vec3;
  b: Vec3;
  distance: number; // mm
  label: string;
  visible: boolean;
}

const PlanningContext = createContext<PlanningState | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseLabel, setCaseLabel] = useState("");
  const [imagingStudyId, setImagingStudyId] = useState<number | null>(null);
  const setCase = (id: number | null, label = "") => { setCaseId(id); setCaseLabel(label); };
  const [sessionId, setSession] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [previewBand, setPreviewBand] = useState<[number, number] | null>(null);
  const [previewMeshUrl, setPreviewMeshUrl] = useState<string | null>(null);
  const [segmentation, _setSegmentation] = useState<SegmentResult | null>(null);
  const [candidates, _setCandidates] = useState<AneurysmCandidate[]>([]);
  const [rejectedCandidates, _setRejectedCandidates] = useState<AneurysmCandidate[]>([]);
  // Memoizada para que los efectos que dependen de ella no se disparen en
  // cada render; con `candidates` vacío (reanudar una sesión donde todo se
  // descartó) es simplemente la lista de descartados.
  const allCandidates = useMemo(() => [...candidates, ...rejectedCandidates], [candidates, rejectedCandidates]);
  const [selectedCandidate, _setSelectedCandidate] = useState(0);
  const selectedRef = useRef(0);
  const [morphometry, _setMorphometry] = useState<MorphometryResult | null>(null);
  const [morphoInvalidatedNotice, setMorphoInvalidatedNotice] = useState(false);
  const [treatment, _setTreatment] = useState<TreatmentDecisionResult | null>(null);
  const [deviceMeshes, _setDeviceMeshes] = useState<Record<DeviceKind, string | null>>(
    { clips: null, coils: null, stent: null },
  );
  const [centerlineMesh, _setCenterlineMesh] = useState<string | null>(null);
  const [centerlineArcMm, setCenterlineArcMm] = useState<number | null>(null);
  const [mprWl, setMprWl] = useState<{ wc: number; ww: number } | null>(null);
  const [mprVoxel, setMprVoxel] = useState({ x: 0, y: 0, z: 0 });
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [clSource, setClSource] = useState<Vec3 | null>(null);
  const [clTarget, setClTarget] = useState<Vec3 | null>(null);
  const [neckOrigin, setNeckOrigin] = useState<Vec3 | null>(null);
  const [neckDome, setNeckDome] = useState<Vec3 | null>(null);
  const [measurements, _setMeasurements] = useState<Measurement[]>([]);
  const [measurePending, setMeasurePending] = useState<Vec3 | null>(null);
  const [neckRim, setNeckRim] = useState<Vec3[]>([]);
  const [scissorsPoints, setScissorsPoints] = useState<Vec3[]>([]);
  const [scissorsPreview, setScissorsPreview] = useState<string | null>(null);
  const [scissorsKeepSide, setScissorsKeepSide] = useState(0);
  const [clipRehearsal, setClipRehearsal] = useState<ClipAnimationResult | null>(null);
  const [clipField, _setClipField] = useState<ClipFieldResult | null>(null);
  const [fieldClips, setFieldClips] = useState<PlacedClip[] | null>(null);
  // Campo y lista van juntos: sin campo no hay lista de la que hablar.
  const setClipField = useCallback((f: ClipFieldResult | null, forClips: PlacedClip[] | null = null) => {
    _setClipField(f);
    setFieldClips(f ? forClips : null);
  }, []);
  const [clipsTabActive, setClipsTabActive] = useState(false);
  const [fieldMeshOnScreen, setFieldMeshOnScreen] = useState<{ shown: boolean; url: string | null }>({ shown: false, url: null });
  const setFieldMeshShown = useCallback((shown: boolean) => setFieldMeshOnScreen((o) => (o.shown === shown ? o : { ...o, shown })), []);
  const setFieldMeshUrl = useCallback((url: string | null) => setFieldMeshOnScreen((o) => (o.url === url ? o : { ...o, url })), []);
  const [showClipField, setShowClipField] = useState(true);
  const [placedClips, _setPlacedClips] = useState<PlacedClip[]>([]);
  const [plannedClips, setPlannedClips] = useState<PlacedClip[] | null>(null);
  const [selectedClipKey, setSelectedClipKey] = useState<number | null>(null);
  // Cualquier escritura pasa por el tope de inclinación: el campo numérico, el
  // manipulador y lo que venga después escriben ángulos, y solo aquí se acotan.
  const setPlacedClips = useCallback((u: PlacedClip[] | ((p: PlacedClip[]) => PlacedClip[])) => {
    _setPlacedClips((prev) => (typeof u === "function" ? u(prev) : u).map((c) => ({ ...c, ...clampTilt(c) })));
  }, []);
  const [sacFrame, setSacFrame] = useState<number | null>(null);
  const [clipParts, registerClipParts] = useState<PartsHandle | null>(null);
  const [perforators, _setPerforators] = useState<PerforatorCandidate[]>([]);
  const [perforatorZones, setPerforatorZones] = useState<[number, number, number] | null>(null);
  const setPerforators = useCallback(
    (p: PerforatorCandidate[], zones?: [number, number, number] | null) => {
      _setPerforators(p);
      if (zones !== undefined) setPerforatorZones(zones);
    },
    [],
  );
  const [visiblePerforators, setVisiblePerforators] = useState<string[]>([]);
  const togglePerforator = useCallback((id: string) => {
    setVisiblePerforators((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }, []);
  const [cropCenter, setCropCenter] = useState<Vec3 | null>(null);
  const [erasePick, setErasePick] = useState<Vec3 | null>(null);
  const [boxCut, setBoxCut] = useState<{ min: [number, number, number]; max: [number, number, number] } | null>(null);
  const [cropRadius, setCropRadius] = useState(10);
  const [cropShape, setCropShape] = useState<"sphere" | "box">("sphere");
  const [cropInvert, setCropInvert] = useState(false);
  const [trajEntry, setTrajEntry] = useState<Vec3 | null>(null);
  const [trajTarget, setTrajTarget] = useState<Vec3 | null>(null);
  const [morphoOverlay, setMorphoOverlay] = useState(false);
  const [captureViewport, _setCaptureViewport] = useState<(() => Promise<string | null>) | null>(null);
  const [captureCase, _setCaptureCase] = useState<(() => Promise<void>) | null>(null);
  // Guardar una función en useState la INVOCA si se pasa directa; va envuelta.
  const setCaptureCase = useCallback((fn: (() => Promise<void>) | null) => _setCaptureCase(() => fn), []);
  const [viewerRecording, setViewerRecording] = useState<ViewerRecordingSource | null>(null);
  // Guardar una función en useState exige envolverla: pasada tal cual, React
  // la toma por actualizador, la llama y guarda lo que devuelve (aquí, una
  // Promise). Así estuvo la captura del informe: nunca era una función.
  const setCaptureViewport = useCallback((fn: (() => Promise<string | null>) | null) => _setCaptureViewport(() => fn), []);
  const [centerOnLesion, _setCenterOnLesion] = useState<(() => void) | null>(null);
  const setCenterOnLesion = useCallback((fn: (() => void) | null) => _setCenterOnLesion(() => fn), []);
  const [dirty, setDirty] = useState(false);
  const markSaved = () => setDirty(false);
  const [viewerLayout, _setViewerLayout] = useState<ViewerLayout>(() => loadLayout());
  const setViewerLayout = (l: ViewerLayout) => { _setViewerLayout(l); saveLayout(l); };
  const [focusPoint, setFocusPoint] = useState<Vec3 | null>(null);
  const [syncViews, setSyncViews] = useState(true);
  const [orientationManual, setOrientationManual] = useState<ManualOrientation | null>(null);
  const [mipMode, setMipMode] = useState<"acumulado" | "lamina">("acumulado");
  const [mipSlabMm, setMipSlabMm] = useState(10);
  const [mipPlane, setMipPlane] = useState<Plane | null>(null);
  const [volumeMode, setVolumeMode] = useState<"mip" | "compuesto">("mip");
  const [volumePreset, setVolumePreset] = useState<VolumePreset>("Vasos CTA");
  const [freePlane, setFreePlaneState] = useState<FreePlane>(DEFAULT_FREE_PLANE);
  const setFreePlane = (p: FreePlane) => setFreePlaneState(clampPlane(p));
  const [clipMode, setClipMode] = useState<"eje" | "libre">("eje");
  const [cutFaceVisible, setCutFaceVisible] = useState(true);
  const [volumeWindows, setVolumeWindows] = useState<Partial<Record<VolumePreset, { wc: number; ww: number }>>>({});
  const setVolumeWindow = (k: VolumePreset, w: { wc: number; ww: number } | null) =>
    setVolumeWindows((m) => { const n = { ...m }; if (w) n[k] = w; else delete n[k]; return n; });
  const [volumeVersion, setVolumeVersion] = useState(0);
  const bumpVolumeVersion = useCallback(() => setVolumeVersion((v) => v + 1), []);
  const setFocusMm = useCallback((mm: Vec3, meta: VolumeMeta) => {
    setFocusPoint(mm);
    setMprVoxel(mmToVoxel(mm, meta));
  }, []);

  // Every setter that produces a result worth keeping marks the session dirty.
  // Wrapping them here rather than at each call site means a panel added later
  // cannot forget to do it.
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const setSegmentation = touch(_setSegmentation);
  const setCandidates = touch(_setCandidates);
  const setRejectedCandidates = touch(_setRejectedCandidates);
  const setMorphometry = touch(_setMorphometry);
  const setTreatment = touch(_setTreatment);
  // La morfometría automática mide el candidato elegido: si la elección
  // cambia, la medida (y la recomendación calculada con ella) es de otro
  // sitio, así que se descartan y el panel vuelve a pedirlas. Con una ref y no
  // con el estado, para que dos llamadas seguidas en el mismo tick (p. ej. la
  // de «Reanudar») comparen con el valor de verdad vigente.
  const setSelectedCandidate = (i: number) => {
    if (i !== selectedRef.current) {
      _setMorphometry(null);
      _setTreatment(null);
    }
    selectedRef.current = i;
    _setSelectedCandidate(i);
  };
  // Cuando el backend invalida la medida, `setSelectedCandidate(0)` no basta:
  // si el elegido ya era el 0 no cambia nada y las cifras viejas seguían en
  // Morfometría y Tratamiento describiendo un sitio que ya no existe.
  const clearMorphometry = () => {
    setMorphometry(null);
    setTreatment(null);
    setNeckOrigin(null);
    setNeckDome(null);
    setNeckRim([]);
  };
  const setCenterlineMesh = touch(_setCenterlineMesh);
  const setMeasurements = touch(_setMeasurements);
  const setDeviceMesh = (kind: DeviceKind, url: string | null) => {
    _setDeviceMeshes((d) => ({ ...d, [kind]: url }));
    setDirty(true);
  };
  const clearDeviceMeshes = (kind?: DeviceKind) => {
    _setDeviceMeshes((d) => (kind ? { ...d, [kind]: null } : { clips: null, coils: null, stent: null }));
    // El campo describe un plan de clips concreto; sin clips no hay nada que describa.
    if (!kind || kind === "clips") {
      setClipField(null);
      // Sin malla de clips la lista ya no describe nada del plan.
      _setPlacedClips([]);
      setPlannedClips(null);
      setSelectedClipKey(null);
    }
    setDirty(true);
  };

  // Clear everything downstream of the DICOM upload — used when a new series is
  // uploaded in the same workspace so stale meshes/metrics don't linger.
  const resetDownstream = () => {
    setPreviewBand(null);
    setPreviewMeshUrl(null);
    _setSegmentation(null);
    _setCandidates([]);
    _setRejectedCandidates([]);
    selectedRef.current = 0;
    _setSelectedCandidate(0);
    _setMorphometry(null);
    _setTreatment(null);
    setMorphoInvalidatedNotice(false);
    _setDeviceMeshes({ clips: null, coils: null, stent: null });
    _setCenterlineMesh(null);
    setCenterlineArcMm(null);
    setPickMode(null);
    setClSource(null);
    setClTarget(null);
    setNeckOrigin(null);
    setNeckDome(null);
    setNeckRim([]);
    setClipRehearsal(null);
    // Un campo de otra sesión no describe los clips de la nueva.
    setClipField(null);
    _setPlacedClips([]);
    setPlannedClips(null);
    setSelectedClipKey(null);
    _setPerforators([]);
    setPerforatorZones(null);
    setVisiblePerforators([]);
    _setMeasurements([]);
    setMeasurePending(null);
    setCropCenter(null);
    setErasePick(null);
    setTrajEntry(null);
    setTrajTarget(null);
    setMorphoOverlay(false);
    setFocusPoint(null);
    // La orientación fijada a mano NO es «aguas abajo»: es del volumen, no de
    // la malla. Resegmentar o preprocesar la dejaba en null a media sesión y
    // el visor, que siembra una vez por sesión, no la recuperaba. Se limpia en
    // reset() y el visor la resiembra al cambiar de sesión.
  };

  const reset = () => {
    setDirty(false);
    setCase(null);
    setImagingStudyId(null);
    setSession(null);
    setSeries(null);
    setOrientationManual(null);
    // El eje del MIP se eligió para el estudio anterior: el nuevo vuelve a
    // seguir a la vista principal.
    setMipPlane(null);
    // El modo y el preajuste de VOLUMEN también son de la sesión: el estudio
    // nuevo abre en MIP, como siempre.
    setVolumeMode("mip");
    setVolumePreset("Vasos CTA");
    // El plano libre, el modo de recorte y las ventanas se ajustaron sobre el
    // volumen anterior: el estudio nuevo abre con el recorte por ejes.
    setFreePlaneState(DEFAULT_FREE_PLANE);
    setClipMode("eje");
    setCutFaceVisible(true);
    setVolumeWindows({});
    resetDownstream();
  };

  return (
    <PlanningContext.Provider
      value={{
        patient, caseId, caseLabel, imagingStudyId, sessionId, series, previewBand, previewMeshUrl, segmentation, candidates, rejectedCandidates, allCandidates,
        selectedCandidate, morphoInvalidatedNotice, morphometry, treatment, deviceMeshes,
        centerlineMesh, centerlineArcMm, mprWl, mprVoxel, pickMode, clSource, clTarget, neckOrigin, neckDome,
        measurements, measurePending, neckRim, scissorsPoints, scissorsPreview, scissorsKeepSide, perforators, visiblePerforators, perforatorZones, clipRehearsal, clipField, showClipField, placedClips, plannedClips, fieldClips, fieldMeshOnScreen, clipsTabActive, selectedClipKey, clipParts, sacFrame, setSacFrame, cropCenter, erasePick, boxCut, setBoxCut, cropRadius, cropShape, cropInvert, trajEntry, trajTarget, morphoOverlay, captureViewport, captureCase, setCaptureCase, viewerRecording, setViewerRecording, centerOnLesion, dirty,
        viewerLayout, focusPoint, syncViews, orientationManual, mipMode, mipSlabMm, mipPlane, volumeMode, volumePreset, volumeVersion,
        freePlane, clipMode, cutFaceVisible, volumeWindows,
        setPatient, setCase, setImagingStudyId, setSession, setSeries, setPreviewBand, setPreviewMeshUrl, setSegmentation,
        setCandidates, setRejectedCandidates, setSelectedCandidate, setMorphometry, setTreatment,
        setMorphoInvalidatedNotice, clearMorphometry,
        setDeviceMesh, clearDeviceMeshes, setCenterlineMesh, setCenterlineArcMm, setMprWl, setMprVoxel,
        setPickMode, setClSource, setClTarget, setNeckRim, setScissorsPoints, setScissorsPreview, setScissorsKeepSide, setPerforators, togglePerforator, setVisiblePerforators, setClipRehearsal, setClipField, setShowClipField, setFieldMeshShown, setFieldMeshUrl, setClipsTabActive, setPlacedClips, setPlannedClips, setSelectedClipKey, registerClipParts,
        setNeckOrigin, setNeckDome,
        setMeasurements, setMeasurePending, setCropCenter, setErasePick, setCropRadius, setCropShape, setCropInvert, setTrajEntry, setTrajTarget, setMorphoOverlay,
        setCaptureViewport, setCenterOnLesion, markSaved,
        setViewerLayout, setFocusMm, setSyncViews, setOrientationManual, setMipMode, setMipSlabMm, setMipPlane, setVolumeMode, setVolumePreset, bumpVolumeVersion,
        setFreePlane, setClipMode, setCutFaceVisible, setVolumeWindow,
        reset, resetDownstream,
      }}
    >
      {children}
    </PlanningContext.Provider>
  );
}

export function usePlanning(): PlanningState {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error("usePlanning must be used inside PlanningProvider");
  return ctx;
}
