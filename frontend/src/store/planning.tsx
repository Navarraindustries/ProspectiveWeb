/* PlanningContext — state shared across the 7-step workspace:
   session id, DICOM series, thresholds, segmentation, detection, morphometry… */

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { PartsHandle } from "../vtk/MeshView";
import type {
  AneurysmCandidate,
  DeviceKind,
  MorphometryResult,
  PatientSummary,
  ClipAnimationResult,
  PerforatorCandidate,
  SegmentResult,
  SeriesInfo,
  TreatmentDecisionResult,
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
  selectedCandidate: number;
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
  planeCut: { axis: "x" | "y" | "z"; offset: number; keepPositive: boolean } | null;
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
  /** True when results exist that have not been written to a saved session.
   *  Saving is a manual action, so without this a click on the logo threw away
   *  an afternoon's analysis with no warning at all. */
  dirty: boolean;

  setPatient: (p: PatientSummary | null) => void;
  setCase: (id: number | null, label?: string) => void;
  setImagingStudyId: (id: number | null) => void;
  setSession: (id: string | null) => void;
  setSeries: (s: SeriesInfo | null) => void;
  setPreviewBand: (b: [number, number] | null) => void;
  setPreviewMeshUrl: (u: string | null) => void;
  setSegmentation: (s: SegmentResult | null) => void;
  setCandidates: (c: AneurysmCandidate[]) => void;
  setSelectedCandidate: (i: number) => void;
  setMorphometry: (m: MorphometryResult | null) => void;
  setTreatment: (t: TreatmentDecisionResult | null) => void;
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
  setPerforators: (p: PerforatorCandidate[], zones?: [number, number, number] | null) => void;
  setClipRehearsal: (a: ClipAnimationResult | null) => void;
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
  setPlaneCut: (p: { axis: "x" | "y" | "z"; offset: number; keepPositive: boolean } | null) => void;
  setCropRadius: (r: number) => void;
  setCropShape: (s: "sphere" | "box") => void;
  setCropInvert: (v: boolean) => void;
  setTrajEntry: (p: Vec3 | null) => void;
  setTrajTarget: (p: Vec3 | null) => void;
  setMorphoOverlay: (v: boolean) => void;
  setCaptureViewport: (fn: (() => Promise<string | null>) | null) => void;
  /** Called after a successful save — the session on disk now matches the store. */
  markSaved: () => void;
  reset: () => void;
  resetDownstream: () => void;
}

export type Vec3 = [number, number, number];
export type PickMode =
  | "cl_source" | "cl_target" | "measure" | "neck_origin" | "neck_dome"
  | "neck_rim"
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
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [morphometry, _setMorphometry] = useState<MorphometryResult | null>(null);
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
  const [clipRehearsal, setClipRehearsal] = useState<ClipAnimationResult | null>(null);
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
  const [planeCut, setPlaneCut] = useState<{ axis: "x" | "y" | "z"; offset: number; keepPositive: boolean } | null>(null);
  const [boxCut, setBoxCut] = useState<{ min: [number, number, number]; max: [number, number, number] } | null>(null);
  const [cropRadius, setCropRadius] = useState(10);
  const [cropShape, setCropShape] = useState<"sphere" | "box">("sphere");
  const [cropInvert, setCropInvert] = useState(false);
  const [trajEntry, setTrajEntry] = useState<Vec3 | null>(null);
  const [trajTarget, setTrajTarget] = useState<Vec3 | null>(null);
  const [morphoOverlay, setMorphoOverlay] = useState(false);
  const [captureViewport, setCaptureViewport] = useState<(() => Promise<string | null>) | null>(null);
  const [dirty, setDirty] = useState(false);
  const markSaved = () => setDirty(false);

  // Every setter that produces a result worth keeping marks the session dirty.
  // Wrapping them here rather than at each call site means a panel added later
  // cannot forget to do it.
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const setSegmentation = touch(_setSegmentation);
  const setCandidates = touch(_setCandidates);
  const setMorphometry = touch(_setMorphometry);
  const setTreatment = touch(_setTreatment);
  const setCenterlineMesh = touch(_setCenterlineMesh);
  const setMeasurements = touch(_setMeasurements);
  const setDeviceMesh = (kind: DeviceKind, url: string | null) => {
    _setDeviceMeshes((d) => ({ ...d, [kind]: url }));
    setDirty(true);
  };
  const clearDeviceMeshes = (kind?: DeviceKind) => {
    _setDeviceMeshes((d) => (kind ? { ...d, [kind]: null } : { clips: null, coils: null, stent: null }));
    setDirty(true);
  };

  // Clear everything downstream of the DICOM upload — used when a new series is
  // uploaded in the same workspace so stale meshes/metrics don't linger.
  const resetDownstream = () => {
    setPreviewBand(null);
    setPreviewMeshUrl(null);
    _setSegmentation(null);
    _setCandidates([]);
    setSelectedCandidate(0);
    _setMorphometry(null);
    _setTreatment(null);
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
    _setPerforators([]);
    setPerforatorZones(null);
    setVisiblePerforators([]);
    _setMeasurements([]);
    setMeasurePending(null);
    setCropCenter(null);
    setErasePick(null);
    setPlaneCut(null);
    setTrajEntry(null);
    setTrajTarget(null);
    setMorphoOverlay(false);
  };

  const reset = () => {
    setDirty(false);
    setCase(null);
    setImagingStudyId(null);
    setSession(null);
    setSeries(null);
    resetDownstream();
  };

  return (
    <PlanningContext.Provider
      value={{
        patient, caseId, caseLabel, imagingStudyId, sessionId, series, previewBand, previewMeshUrl, segmentation, candidates,
        selectedCandidate, morphometry, treatment, deviceMeshes,
        centerlineMesh, centerlineArcMm, mprWl, mprVoxel, pickMode, clSource, clTarget, neckOrigin, neckDome,
        measurements, measurePending, neckRim, perforators, visiblePerforators, perforatorZones, clipRehearsal, clipParts, sacFrame, setSacFrame, cropCenter, erasePick, planeCut, boxCut, setBoxCut, cropRadius, cropShape, cropInvert, trajEntry, trajTarget, morphoOverlay, captureViewport, dirty,
        setPatient, setCase, setImagingStudyId, setSession, setSeries, setPreviewBand, setPreviewMeshUrl, setSegmentation,
        setCandidates, setSelectedCandidate, setMorphometry, setTreatment,
        setDeviceMesh, clearDeviceMeshes, setCenterlineMesh, setCenterlineArcMm, setMprWl, setMprVoxel,
        setPickMode, setClSource, setClTarget, setNeckRim, setPerforators, togglePerforator, setVisiblePerforators, setClipRehearsal, registerClipParts,
        setNeckOrigin, setNeckDome,
        setMeasurements, setMeasurePending, setCropCenter, setErasePick, setPlaneCut, setCropRadius, setCropShape, setCropInvert, setTrajEntry, setTrajTarget, setMorphoOverlay,
        setCaptureViewport, markSaved,
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
