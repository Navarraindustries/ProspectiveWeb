/* Visor clínico — superficie de imagenología siempre negra.
   - Con malla segmentada: render 3D real (.vtp) con vtk.js.
   - Sin malla pero con volumen cargado: vista previa DICOM (MPR axial navegable).
   - Sin nada: placeholder honesto.
   Distribución en rejilla (ViewerGrid): una vista principal y cuatro a la
   derecha o abajo, o la principal sola; las vistas se arrastran para
   intercambiarse y doble clic sube una a principal. Las cinco celdas (escena,
   axial, coronal, sagital, MIP) leen el mismo volumen del navegador. */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { ANNOTATION_MODES, kindOfMode, usePlanning, type PickMode, type PlacedClip, type StentMap } from "../store/planning";
import { ANNOTATIONS_MAX, centroid, newId, nextLabel, type Annotation } from "./annotations";
import { addPoint, closeRegion, removeLast } from "./annotationDraft";
import { shouldShowHint } from "./hint";
import type { AnnotationPlane } from "../api/types";
import { labelAnchor, labelFor, shapesForSlice, type Box } from "./annotationOverlay";
import type { CameraController, CameraView, HandleDragEvent, MeshFocus, MeshLabel, MeshLayer, MeshMarker, MeshLine, SlicePlanesProp } from "./MeshView";
import { slicePlaneSpecs, SLICES3D_MESH_OPACITY } from "./slicePlanes";
import { beginDrag, clipHandles, dragPose, gizmoReadout, gizmoVisible, type DragStart } from "./clipGizmo";
import { poseDelta } from "./clipPose";
import { clipNormal, fieldColoursOnScreen, isStale, neckAxis, neckPlacement } from "../components/planning/placedClips";
import { MprViewLegacy as MprView } from "./MprViewLegacy";
import { useClientVolume } from "./volume/useClientVolume";
import { useVolumeMeta } from "./useVolumeMeta";
import { useVesselBand } from "./useVesselBand";
import { volumePresetsFor } from "./volumePresets";
import { levelNoteFor } from "./levelNote";
import { hasWebGL2 } from "./webgl";
import { lesionFrameRadiusMm } from "./lesionFrame";
// El visor la exportaba: se mantiene la salida para no romper a quien la importe de aquí.
export { lesionFrameRadiusMm };
import { ObliqueMprView } from "./ObliqueMprView";
import { cameraHeading, effectiveDirection, mmToVoxel, voxelToMm, type Orientation, type Plane, type Vec3 } from "./geometry";
import { promote, setPreset, type PaneId, type ViewerLayout } from "./layout";
import { ViewerGrid, type PaneContext } from "./ViewerGrid";
import { presetForKey } from "./layoutShortcuts";
import { gridFor } from "./layoutGrid";
import { flushSync } from "react-dom";
import { api } from "../api/client";
import { STEPS } from "../pipeline/steps";
import { captureWithLayout, type CaptureFn } from "./captureWithLayout";
import { browserDeps, composeCapture, type PaneShot } from "./composeCapture";
import {
  HUD_LEVELS, nextHudLevel, PREF_HUD_LEVEL, PREF_PLANES_HIDDEN, readCineFps, readHudLevel, useStoredChoice, useStoredFlag, writeCineFps,
  type HudLevel,
} from "./viewerPrefs";
import { applyStep, cineShouldStop, clampFps, nextIndex } from "./cine";
import { stepTrackIndex, tangentAt } from "./centerlineWalk";
import { useCenterlineTrack } from "./useCenterlineTrack";
import { startClock } from "./cineClock";
import { HudCineBar } from "./hud/HudCineBar";
import { ShortcutsSheet } from "./hud/ShortcutsSheet";
import { focusOnPointerDown, refocusAfterHide } from "./pointerFocus";
import { planeOutlines, polygonCentroid } from "./planeOutlines";
import { indexFromDrag, planeAxis, planeHandles } from "./planeHandles";
import { screenToAxis } from "./dragController";
import { clampOffsetToBox, planeFromNormal, sliceSegment, type FreePlane } from "./freePlane";
import { approachDirection } from "./approachView";
import { ANNOTATION_HEX, HUD_HEX, hexToRgb01, type OutlinePlane } from "./planeColors";
import { captureFileName } from "./viewerRecorder";
import { readHeading, readPaneHud } from "./readHud";
import { readPaneShapes } from "./readShapes";
import { HudFrame } from "./hud/HudFrame";
import { HudReadout, type HudLine } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { ViewerHeader } from "./ViewerHeader";
import { legendLines } from "./clipFieldLegend";
import { HudHeadingTape } from "./hud/HudHeadingTape";
import { OrientationSheet } from "./OrientationSheet";
import { manualFromMeta, shouldSeed } from "./orientationSeed";
import { windowPresets } from "./windowPresets";
import { unitFor } from "./modality";
import type { Vector3 } from "@kitware/vtk.js/types";

// vtk.js (~1 MB) is only needed once a 3D mesh is shown, so load MeshView — and
// with it the whole vtk.js runtime — lazily. The landing/login/MPR-only views
// never pull it into their bundle.
const MeshView = lazy(() => import("./MeshView").then((m) => ({ default: m.MeshView })));
const SliceView = lazy(() => import("./SliceView").then((m) => ({ default: m.SliceView })));
const MipView = lazy(() => import("./MipView").then((m) => ({ default: m.MipView })));
const ObliqueView = lazy(() => import("./ObliqueView").then((m) => ({ default: m.ObliqueView })));

/** Qué recorre el cine de una celda: un eje del vóxel o el plano libre. */
type CineTarget = { kind: "axis"; axis: "x" | "y" | "z" } | { kind: "free" } | { kind: "vessel" };
/** El índice de cada corte es la coordenada perpendicular a él. */
const PLANE_AXIS: Record<Plane, "x" | "y" | "z"> = { axial: "z", coronal: "y", sagital: "x" };
/** Posición del eje en `meta.shape`, que va como [z, y, x]. */
const AXIS_DIM = { z: 0, y: 1, x: 2 } as const;

/* Pistas efímeras del panel principal (Task 14): qué gesto usar según lo que
   haya montado ahí. El MIP gira como el 3D pero su rueda es la de los cortes. */
type HintKind = "rotate" | "slice" | "mip";
const HINT_TEXT: Record<HintKind, string> = {
  rotate: "ARRASTRAR ROTA · RUEDA ZOOM · DOBLE CLIC EN UNA CELDA LA MAXIMIZA",
  slice: "RUEDA CORTE · CTRL+RUEDA ZOOM · ARRASTRAR VENTANA · SHIFT DESPLAZA",
  mip: "RUEDA CORTE · CTRL+RUEDA ZOOM · ARRASTRAR ROTA · SHIFT DESPLAZA",
};

const STEP_SCENE: Record<string, string> = {
  upload: "Vista previa DICOM",
  segment: "Segmentación vascular",
  detect: "Candidatos aneurismáticos",
  morpho: "Análisis morfométrico",
  treatment: "Cuello y domo",
  devices: "Dispositivo + trayectoria",
  report: "Escena final",
};

/** --hud en 0–1: el punto compartido de los cortes, dibujado en el 3D. */
const HUD_RGB: Vector3 = hexToRgb01(HUD_HEX);
const VESSEL_COLOR: Vector3 = [0.65, 0.7, 0.76];
const DOME_COLOR: Vector3 = [0.32, 0.55, 0.75];
/* El saco cerrado, en verde para no confundirlo con el localizador azul del
   candidato: aquel señala dónde mirar, este ES el cuerpo del aneurisma. */
const SAC_COLOR: Vector3 = [0.25, 0.80, 0.45];
/** Mapa de aposición del stent: satura a ±1 mm; por debajo de 0,3 mm (un vóxel) es ruido. */
export const APPOSITION_RANGE_MM = 1.0;
export const APPOSITION_NOISE_MM = 0.3;
/** Mapa de cobertura metálica: satura a ±10 puntos; ±2 es el margen del propio catálogo (30–35 %). */
export const COVERAGE_RANGE_PP = 10;
export const COVERAGE_NOISE_PP = 2;
const FOLLOWUP_GHOST_COLOR: Vector3 = [0.98, 0.62, 0.20]; // naranja — saco del estudio anterior
const DEVICE_COLOR: Vector3 = [0.92, 0.82, 0.45];     // warm gold — placed clip
const COIL_COLOR: Vector3 = [0.85, 0.55, 0.85];       // orchid — packed coils
const STENT_COLOR: Vector3 = [0.55, 0.80, 0.95];      // steel blue — deployed stent
const DEVICE_LABEL: Record<"clips" | "coils" | "stent", string> = {
  clips: "clips", coils: "coils", stent: "stent",
};

/* Vistas del visor 3D, nombradas como los planos MPR del resto de la app.
   Un segundo clic en la misma vista la mira desde el lado opuesto. */
const CAMERA_BUTTONS: [CameraView, string, string][] = [
  ["fit", "ENCUADRAR", "Reencuadrar la escena completa"],
  ["axial", "AX", "Vista axial (desde superior; otro clic, desde inferior)"],
  ["coronal", "COR", "Vista coronal (desde anterior; otro clic, desde posterior)"],
  ["sagital", "SAG", "Vista sagital (desde la izquierda; otro clic, desde la derecha)"],
];
const CENTERLINE_COLOR: Vector3 = [0.36, 0.85, 0.86]; // cyan — vessel centreline tube
const SOURCE_COLOR: Vector3 = [0.25, 0.73, 0.31];     // green — picked source endpoint
const TARGET_COLOR: Vector3 = [0.97, 0.32, 0.29];     // red — picked target endpoint
const PENDING_COLOR: Vector3 = [0.98, 0.55, 0.10];    // orange — borrador de anotación (DRAFT_HEX en los cortes)
/** La anotación seleccionada, más gruesa en el 3D (en los cortes, trazo 3). */
const ANNOTATION_SELECTED_SCALE = 1.6;
const NECK_ORIGIN_COLOR: Vector3 = [0.85, 0.35, 0.85]; // magenta — neck-plane point
const NECK_DOME_COLOR: Vector3 = [0.36, 0.85, 0.86];   // cyan — dome apex
const NECK_RIM_COLOR: Vector3 = [0.90, 0.45, 0.95];    // violet — marked neck rim
const SCISSORS_COLOR: Vector3 = [1.00, 0.75, 0.10];    // amber — el anillo de la tijera
const DOOMED_COLOR: Vector3 = [1.00, 0.25, 0.25];      // rojo — lo que se llevaría el corte
const CROP_CENTER_COLOR: Vector3 = [0.98, 0.60, 0.20]; // orange — crop ROI centre
const LESION_MARK_COLOR: Vector3 = [0.95, 0.25, 0.55]; // magenta — lesión marcada a mano
const TRAJ_ENTRY_COLOR: Vector3 = [0.40, 0.80, 1.00];  // sky blue — approach entry
const TRAJ_TARGET_COLOR: Vector3 = [0.97, 0.32, 0.29]; // red — approach target
const TRAJ_LINE_COLOR: Vector3 = [0.55, 0.85, 1.00];   // light blue — approach corridor
/** El radio del corredor de trabajo que mide el backend (`DEFAULT_CORRIDOR_RADIUS_MM`). */
const CORRIDOR_RADIUS_MM = 5;
const MO_NECK_COLOR: Vector3 = [0.20, 0.75, 1.00];     // sky blue — neck ring/marker
const MO_DOME_COLOR: Vector3 = [1.00, 0.55, 0.10];     // orange — dome-height line/apex
const MO_MAXD_COLOR: Vector3 = [0.85, 0.20, 0.20];     // red — max-diameter span

/** Backend risk colours (#ef4444 / #eab308 / #22c55e) as vtk.js 0–1 triples, so
 *  a marker in the scene is the same colour as its row in the list. */
const PERFORATOR_COLOR: Record<number, Vector3> = {
  1: [0.937, 0.267, 0.267],   // alto
  2: [0.918, 0.702, 0.031],   // medio
  3: [0.133, 0.773, 0.369],   // bajo
};
/** Perforator markers are drawn only when asked for, so they can be a size that
 *  is actually findable: nothing is competing for attention that the user did
 *  not switch on. The colour carries the severity, never the size. */
const PERFORATOR_SCALE = 1.8;
/** Tope del desplazamiento de un plano por gesto desde su asa (mm): con el eje
 *  casi paralelo al rayo, `screenToAxis` da saltos enormes por píxel. */
const PLANE_DRAG_MAX_MM = 100;

/* Small 3-vector helpers for the morphometric overlay geometry. */
type V3 = [number, number, number];
const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a: V3): V3 => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
function perpBasis(axis: V3): [V3, V3] {
  const ref: V3 = Math.abs(axis[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const u = vnorm(vcross(axis, ref));
  const v = vnorm(vcross(axis, u));
  return [u, v];
}

/* Canal de la cámara del 3D hacia la cinta de rumbo. MeshView avisa en cada
   cambio de cámara (60 veces por segundo al rotar): si el aviso fuera estado
   de ViewerWorkspace, cada fotograma rehacería el visor entero. Así solo se
   repinta SceneHeading. Guarda el último valor porque el primer aviso llega
   al montar la escena, quizá antes de que la cinta se suscriba. */
interface CameraFeed {
  last: { dir: Vec3; up: Vec3 } | null;
  listener: ((cam: { dir: Vec3; up: Vec3 }) => void) | null;
}

function SceneHeading({ feed, orientation }: { feed: RefObject<CameraFeed>; orientation: Orientation }) {
  const [cam, setCam] = useState(feed.current.last);
  useEffect(() => {
    const f = feed.current;
    f.listener = setCam;
    setCam(f.last);
    return () => { f.listener = null; };
  }, [feed]);
  if (!cam) return null;
  const h = cameraHeading(cam.dir, cam.up, orientation);
  // Una línea más abajo, como en el MIP: arriba del todo están el paso y el modo.
  return (
    <div style={{ position: "absolute", top: 18, left: 0, right: 0, height: 28, pointerEvents: "none" }}>
      <HudHeadingTape azimuthDeg={h.azimuthDeg} elevationDeg={h.elevationDeg} known={h.known} />
    </div>
  );
}

/* Placeholder shown while the lazy vtk.js chunk is being fetched. */
function ViewerLoading({ label }: { label: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--viewer-bg)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--hud-dim)" }}>{label}</div>
    </div>
  );
}

export function ViewerWorkspace({ step }: { step: string }) {
  const {
    sessionId, segmentation, allCandidates, selectedCandidate, series, deviceMeshes, stentMap,
    centerlineMesh, pickMode, clSource, clTarget, setPickMode, setClSource, setClTarget,
    neckOrigin, neckDome, setNeckOrigin, setNeckDome, neckRim, setNeckRim,
    scissorsPoints, setScissorsPoints, scissorsPreview,
    annotations, setAnnotations, annotationDraft, setAnnotationDraft, selectedAnnotation, setSelectedAnnotation, setNoteFocusRequest, previewBand, previewMeshUrl,
    cropCenter, setCropCenter, setErasePick, lesionMark, setLesionMark, followup,
    cropRadius, cropShape, cropInvert, boxCut,
    trajEntry, trajTarget, setTrajEntry, setTrajTarget, sacFrame,
    morphometry, morphoOverlay, setCaptureViewport, perforators, visiblePerforators, perforatorZones,
    clipRehearsal, registerClipParts, clipField, showClipField, setShowClipField,
    mprWl, mprVoxel, setMprWl, setMprVoxel,
    viewerLayout, setViewerLayout, syncViews, setSyncViews, orientationManual, setOrientationManual,
    focusPoint, setFocusMm, setCenterOnLesion, volumeVersion, mipPlane: storeMipPlane, setMipPlane,
    volumeMode, volumePreset, setVolumePreset, freePlane, setFreePlane, clipMode, cutFaceVisible, volumeWindows,
    slices3dMeshVisible, setSlices3dMeshVisible, cine, setCine, focusedPane, setFocusedPane,
    imagingStudyId, setCaptureCase, setViewerRecording,
    placedClips, setPlacedClips, plannedClips, fieldClips, fieldMeshOnScreen, setFieldMeshShown, setFieldMeshUrl, clipsTabActive, selectedClipKey,
    centerline, obliqueWalk, setObliqueWalk,
  } = usePlanning();
  // El recorrido VASO necesita los puntos aunque el panel de la línea central no se abra.
  useCenterlineTrack();

  // Cuánto HUD se ve (completo · esencial · limpio, tecla H): preferencia del
  // profesional, en su navegador; la rejilla lo publica como `data-hud` y lo
  // aplica hud.css. La ref la lee el estado del visor, que se publica una vez
  // y no puede depender del render.
  const [hudLevel, setHudLevel] = useStoredChoice(PREF_HUD_LEVEL, HUD_LEVELS, "completo", readHudLevel);
  const hudLevelRef = useRef(hudLevel);
  hudLevelRef.current = hudLevel;
  // Los planos de corte en el 3D van solo con PLANOS, en cualquier nivel del
  // HUD: son geometría de la escena que se quiere ver o no, no HUD. Es una
  // preferencia de quien mira, no del caso.
  const [planesHidden, setPlanesHidden] = useStoredFlag(PREF_PLANES_HIDDEN);
  const planesHiddenRef = useRef(planesHidden);
  planesHiddenRef.current = planesHidden;
  // El modo y el preajuste de la vista VOLUMEN viajan con la captura y la
  // grabación; por ref, como el resto, para no rehacer lo ya publicado.
  const volumeModeRef = useRef(volumeMode);
  volumeModeRef.current = volumeMode;
  const volumePresetRef = useRef(volumePreset);
  volumePresetRef.current = volumePreset;
  // El plano libre, el modo de recorte, la cara de corte y la ventana del
  // preajuste activo: sin ellos una captura de un recorte libre no se podría
  // reproducir. Por ref, igual que los anteriores.
  const freePlaneRef = useRef(freePlane);
  freePlaneRef.current = freePlane;
  const clipModeRef = useRef(clipMode);
  clipModeRef.current = clipMode;
  const cutFaceVisibleRef = useRef(cutFaceVisible);
  cutFaceVisibleRef.current = cutFaceVisible;
  const slices3dMeshVisibleRef = useRef(slices3dMeshVisible);
  slices3dMeshVisibleRef.current = slices3dMeshVisible;
  const volumeWindowRef = useRef(volumeWindows[volumePreset] ?? null);
  volumeWindowRef.current = volumeWindows[volumePreset] ?? null;
  // El cine en marcha viaja con la captura y lo leen sus atajos sin depender
  // del render.
  const cineRef = useRef(cine);
  cineRef.current = cine;

  // 3D morphometric overlay: neck ring + dome-height & max-diameter spans + apex.
  const overlay = useMemo<{ markers: MeshMarker[]; lines: MeshLine[] } | null>(() => {
    if (!morphoOverlay || !morphometry) return null;
    const c = morphometry.centroid;
    const ax = morphometry.principal_axis;
    if (!c || !ax || ax.length !== 3) return null;
    const centroid: V3 = [c.x, c.y, c.z];
    const dome = morphometry.dome_height_mm || 0;
    const neckR = (morphometry.neck_mm || 0) / 2;
    const maxR = (morphometry.max_diameter_mm || 0) / 2;

    // Draw the plane that ACTUALLY measured the neck. This used to rebuild a
    // ring from the PCA axis at centroid − axis·(dome/2), which coincides with
    // the real plane only when the neck happens to be perpendicular to that
    // axis — i.e. exactly the case the rim fit exists to handle differently.
    // On an oblique neck the ring drawn was not the plane in use, so the user
    // was aiming with a sight that was not attached to the barrel.
    const po = morphometry.plane_origin;
    const pn = morphometry.plane_normal;
    const fitted = !!po && !!pn;
    const axis = fitted
      ? vnorm([pn!.x, pn!.y, pn!.z] as V3)
      : vnorm([ax[0], ax[1], ax[2]] as V3);
    const neckC: V3 = fitted
      ? [po!.x, po!.y, po!.z]
      : vsub(centroid, vscale(axis, dome / 2));
    const apex = vadd(neckC, vscale(axis, dome));
    const [u, v] = perpBasis(axis);

    const markers: MeshMarker[] = [
      { pos: neckC, color: MO_NECK_COLOR },
      { pos: apex, color: MO_DOME_COLOR },
    ];
    const lines: MeshLine[] = [
      { a: neckC, b: apex, color: MO_DOME_COLOR },                                   // dome height
      { a: vsub(centroid, vscale(u, maxR)), b: vadd(centroid, vscale(u, maxR)), color: MO_MAXD_COLOR }, // max Ø
    ];
    // Neck ring approximated by N segments in the plane perpendicular to the axis.
    if (neckR > 0.05) {
      const N = 28;
      const ring: V3[] = [];
      for (let k = 0; k < N; k++) {
        const t = (2 * Math.PI * k) / N;
        ring.push(vadd(neckC, vadd(vscale(u, neckR * Math.cos(t)), vscale(v, neckR * Math.sin(t)))));
      }
      for (let k = 0; k < N; k++) lines.push({ a: ring[k], b: ring[(k + 1) % N], color: MO_NECK_COLOR });
    }
    return { markers, lines };
  }, [morphoOverlay, morphometry]);
  // mesh_url carries a generation token (?v=…) from the backend, so it changes
  // on every re-segmentation and vtk.js refetches instead of serving the cache.
  const meshUrl = segmentation?.mesh_url ?? null;
  // During threshold tuning (segment step, no final mesh yet) show the coarse 3D
  // preview mesh forming in near-real-time, like the desktop app.
  const segPreview = step === "segment" && !meshUrl && !!previewMeshUrl && pickMode === null;
  const displayMeshUrl = meshUrl ?? (segPreview ? previewMeshUrl : null);
  // Fall back to the MPR slices (with the tinted band) only while there is NO
  // mesh yet (initial threshold tuning) and no 3D coarse preview — and never
  // during a 3D pick. Once a mesh exists (segmented or grown) the main view shows
  // it; the tint stays on the bottom MPR strip for further tuning.
  const previewActive = !!previewBand && step === "segment" && pickMode === null && !segPreview && !meshUrl;
  // Step 1 (DICOM upload) always shows the volume preview (axial MPR + strip),
  // even after a mesh has been segmented — so navigating back to it from a later
  // step shows the study's DICOM views, not the leftover 3D mesh.
  const meshVisible = !!displayMeshUrl && step !== "upload" && !previewActive;
  const candidate = allCandidates[selectedCandidate];

  // What the markers should be sized against. The candidate's own diameter is
  // the honest reference — the neck, the apex and the seeds are all placed on
  // or around it — and morphometry refines it once measured.
  const referenceDiameterMm =
    morphometry?.max_diameter_mm || candidate?.max_diameter_mm || null;
  // Frame + highlight the selected candidate during detection and morphometry,
  // so it's obvious where the aneurysm is (and where to place the neck plane).
  const focusUrl =
    (step === "detect" || step === "morpho") && candidate?.dome_mesh_url
      ? candidate.dome_mesh_url
      : undefined;
  const { meta, forSession: metaFor } = useVolumeMeta(sessionId, volumeVersion);
  // Banda de vasos del volumen: una para los preajustes de los cortes y, en
  // VOLUMEN, para «VASOS» (Tarea 2) — spec §3.1.
  const vesselBand = useVesselBand(sessionId, segmentation, volumeVersion);
  // Un solo volumen en el navegador para las cinco celdas: las laterales y
  // la principal leen el mismo vtkImageData, así que no se descarga dos veces ni
  // pueden enseñar niveles distintos. Sin WebGL2 ni se pide.
  const clientVol = useClientVolume(hasWebGL2() ? sessionId : null, meta, mprVoxel.z);
  const legacy = !hasWebGL2() || !clientVol.image;
  // La orientación fijada a mano vive en el estado de sesión y vuelve con la
  // meta al reanudarla: se siembra una vez por sesión, con la meta de ESA
  // sesión, y nunca pisa la que el usuario acaba de fijar en ella. Al sembrar
  // se pone también el null de una sesión que no tiene ninguna: el store puede
  // traer todavía la del estudio anterior.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!shouldSeed(seededFor, sessionId, metaFor)) return;
    setSeededFor(sessionId);
    setOrientationManual(manualFromMeta(meta?.orientation_manual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, metaFor, sessionId]);
  // Hasta sembrar, lo del store puede ser de otra sesión: no se usa.
  const manualForSession = seededFor === sessionId ? orientationManual : null;
  // Memoizado, y no un literal por render: esto viaja como prop a los cinco
  // visores y como dependencia de `capturarVisor`. Siendo nuevo cada vez,
  // `capturarVisor` también lo era, el efecto que lo publica en el store corría
  // en CADA render, y `setCaptureCase` volvía a renderizar el árbol entero:
  // ~1000 vueltas por segundo con el visor montado. React Router despacha sus
  // navegaciones con `startTransition`, así que con el hilo ocupado la URL
  // cambiaba y la vista no —«me salgo del pipeline y no se ve la otra
  // pantalla hasta refrescar»—. El bucle no se notaba de otra forma.
  const orientation: Orientation = useMemo(
    () => ({ direction: meta?.direction ?? null, manual: manualForSession }),
    [meta?.direction, manualForSession],
  );
  const [orientationOpen, setOrientationOpen] = useState(false);
  const cameraFeed = useRef<CameraFeed>({ last: null, listener: null });
  const onCameraChange = useCallback((dir: Vec3, up: Vec3) => {
    const cam = { dir: [...dir] as Vec3, up: [...up] as Vec3 };
    cameraFeed.current.last = cam;
    cameraFeed.current.listener?.(cam);
  }, []);
  const levelNote = levelNoteFor(clientVol.level, clientVol.stride, clientVol.progress, clientVol.error);
  // En una celda compacta (estrecha) la nota larga se monta sobre el
  // rótulo del plano; allí basta con la forma corta.
  const levelNoteShort = levelNoteFor(clientVol.level, clientVol.stride, clientVol.progress, clientVol.error, true);
  const [nz, ny, nx] = meta?.shape ?? [1, 1, 1];
  // Al llegar un volumen nuevo: crosshair al centro y la ventana del estudio
  // (lo que hacía MprStrip, que ya no existe).
  useEffect(() => {
    if (meta) {
      setMprVoxel({ x: Math.floor(nx / 2), y: Math.floor(ny / 2), z: Math.floor(nz / 2) });
      setMprWl({ wc: meta.wc, ww: meta.ww });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, nx, ny, nz]);
  // El plano libre pasa por el punto compartido más su desplazamiento: un clic
  // en un corte mueve ese punto y podía dejar el plano fuera del volumen (el
  // oblicuo en negro, el recorte LIBRE en todo o nada). Se reacota aquí, en un
  // solo sitio; el plano se lee por ref para que solo lo disparen el punto y
  // la meta, no cada escritura del propio plano (que ya se acota al escribirse).
  useEffect(() => {
    if (!meta) return;
    const fp = freePlaneRef.current;
    const c = clampOffsetToBox(fp, mprVoxel, meta);
    if (c.offsetMm !== fp.offsetMm) setFreePlane(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mprVoxel, meta]);
  // «default» es la escena de malla (3D, o el corte axial sin malla);
  // «slices3d», la misma escena con los tres cortes en su sitio y la malla
  // translúcida; «oblique», el corte oblicuo.
  const [viewMode, setViewMode] = useState<"default" | "slices3d" | "oblique">("default");
  // Cortes 3D es la escena de malla con algo más: todo lo que vale para el 3D
  // (captura, manipulador del clip, asas, cámara) vale igual para él.
  const meshScene = viewMode === "default" || viewMode === "slices3d";
  // Camera controller published by MeshView while its scene is on screen.
  const [camera, setCamera] = useState<CameraController | null>(null);
  // Las cámaras de escenas montadas en Dispositivos, donde MeshView conserva la
  // cámara al rehacer la escena (ver el efecto del foco, más abajo).
  const stepRef = useRef(step);
  stepRef.current = step;
  const devicesCameras = useRef(new WeakSet<CameraController>());
  const registerCamera = useCallback((c: CameraController | null) => {
    if (c && stepRef.current === "devices") devicesCameras.current.add(c);
    setCamera(c);
  }, []);

  // Captura del 3D para el informe. MeshView registra aquí la suya (cuando
  // la escena ya está en pantalla); al store va una envoltura que, si la
  // escena ocupa un hueco lateral, la sube al principal para capturarla a tamaño
  // completo y luego deja la distribución como estaba (captureWithLayout.ts).
  const meshCapture = useRef<CaptureFn | null>(null);
  // Captura del VISOR ENTERO, la que guarda el profesional en el caso: cada
  // panel publica la suya aquí y el compositor las junta donde están. La del
  // informe (meshCapture) es otra cosa: una sola escena a tamaño completo.
  const paneCaptures = useRef<Map<PaneId, CaptureFn | null>>(new Map());
  const regPane = (id: PaneId) => (fn: CaptureFn | null) => { paneCaptures.current.set(id, fn); };
  // El reencuadre de cada celda (tecla C), publicado igual que la captura: el
  // visor no tiene la cámara de los cortes, del VOLUMEN ni del oblicuo.
  const paneFits = useRef<Map<PaneId, (() => void) | null>>(new Map());
  const regFit = (id: PaneId) => (fn: (() => void) | null) => { paneFits.current.set(id, fn); };
  const viewerRef = useRef<HTMLDivElement>(null);
  // El nodo de cada celda de la rejilla, por vista: la captura compuesta lee
  // de aquí dónde está cada una en pantalla.
  const cellEls = useRef<Partial<Record<PaneId, HTMLDivElement | null>>>({});
  const registerCell = useCallback((id: PaneId, el: HTMLDivElement | null) => { cellEls.current[id] = el; }, []);
  const gridHostRef = useRef<HTMLDivElement | null>(null);
  const registerMeshCapture = useCallback((fn: CaptureFn | null) => { meshCapture.current = fn; }, []);
  // La envoltura es estable: lee la distribución y su setter por refs.
  const layoutRef = useRef<ViewerLayout>(viewerLayout);
  layoutRef.current = viewerLayout;
  const setLayoutRef = useRef(setViewerLayout);
  setLayoutRef.current = setViewerLayout;
  const captureScene = useCallback((): Promise<string | null> => {
    const before = layoutRef.current;
    // La rejilla no remonta la escena al subirla: la captura que ya tenía
    // registrada sigue valiendo; solo hay que dejar que el lienzo tome el
    // tamaño del hueco grande antes de leerlo.
    return captureWithLayout({
      sceneIsMain: () => layoutRef.current.main === "scene",
      current: () => meshCapture.current,
      // flushSync: la celda tiene que estar ya en el hueco grande cuando
      // empiece a contar el fotograma, no cuando React encuentre turno.
      promote: () => flushSync(() => setLayoutRef.current(promote(before, "scene"))),
      restore: () => setLayoutRef.current(before),
      // Dos fotogramas, no uno: el ResizeObserver que redimensiona el lienzo
      // de vtk.js se entrega DESPUÉS de los requestAnimationFrame del mismo
      // fotograma. En el primero se recoloca y redimensiona; en el segundo ya
      // se puede leer a tamaño completo.
      nextFrame: () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    });
  }, []);
  const sceneHasMesh = meshScene && meshVisible;
  useEffect(() => {
    setCaptureViewport(sceneHasMesh ? captureScene : null);
  }, [sceneHasMesh, captureScene, setCaptureViewport]);
  useEffect(() => () => setCaptureViewport(null), [setCaptureViewport]);

  // ── Guardar lo que se está viendo ─────────────────────────────────────── #
  //
  // El BOTÓN no está aquí: está en el topbar, al lado de «Guardar progreso».
  // Estuvo en el HUD y nadie lo encontraba —con el color y el cuerpo de los
  // rótulos de instrumento parecía el título del panel, no algo que pulsar—,
  // y además el HUD solo se ve cuando ya estás mirando el visor. Aquí queda
  // lo que solo el visor sabe hacer: componer sus cinco paneles.
  //
  // Cada panel es una ventana de vtk.js distinta, así que la imagen se compone
  // de las cinco capturas colocadas donde están en pantalla, más el HUD leído
  // del propio DOM: así la imagen dice exactamente lo que decía el visor y no
  // hay una segunda fuente que se separe de la primera.
  //
  // La imagen se adjunta al ESTUDIO DE IMAGEN, que es de donde salió la malla.
  // Sin estudio archivado no hay dónde colgarla y el botón lo dice: no se
  // guarda en la carpeta de la sesión, que se purga a las 24 h.
  // El estado que acompaña a una captura o a una grabación.
  const levelNoteRef = useRef(levelNote);
  levelNoteRef.current = levelNote;
  const placedClipsRef = useRef(placedClips);
  placedClipsRef.current = placedClips;
  const selectedClipKeyRef = useRef(selectedClipKey);
  selectedClipKeyRef.current = selectedClipKey;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const estadoVisor = useCallback((root: HTMLElement): Record<string, unknown> => ({
    layout: layoutRef.current,
    hud_level: hudLevelRef.current,
    planes_hidden: planesHiddenRef.current,
    // El panel del paso es de Workspace; lo publica en su contenedor.
    panel_collapsed: document.querySelector("[data-panel-collapsed]")?.getAttribute("data-panel-collapsed") === "true",
    volume_mode: volumeModeRef.current,
    volume_preset: volumePresetRef.current,
    free_plane: {
      azimuth_deg: freePlaneRef.current.azimuthDeg,
      elevation_deg: freePlaneRef.current.elevationDeg,
      offset_mm: freePlaneRef.current.offsetMm,
    },
    clip_mode: clipModeRef.current,
    cut_face_visible: cutFaceVisibleRef.current,
    volume_window: volumeWindowRef.current,
    heading: readHeading(root) ?? null,
    level_note: levelNote ?? null,
    view_mode: viewMode,
    // Lo que se dibuja, no el conmutador: sin malla la escena es el corte axial
    // (MPR), aunque `viewMode` se quedara en slices3d de antes.
    scene_mode: viewMode === "oblique" ? "oblique" : !meshVisible ? "slice" : viewMode === "slices3d" ? "slices3d" : "mesh",
    slices3d_mesh_visible: slices3dMeshVisibleRef.current,
    cine: cineRef.current ? { pane: cineRef.current.pane, fps: cineRef.current.fps } : null,
    candidate_index: selectedCandidate,
    candidate_id: allCandidates[selectedCandidate]?.id ?? null,
    neck_mm: morphometry?.neck_mm ?? null,
    max_diameter_mm: morphometry?.max_diameter_mm ?? null,
    window: mprWl ?? null,
    orientation_known: effectiveDirection(orientation).known,
    // La pose de cada clip tal y como está en la lista (también a mitad de un
    // arrastre), y cuál maneja el asa: lo que la captura enseña, por escrito.
    placed_clips: placedClipsRef.current.map((c) => ({
      key: c.key, clip_id: c.clip_id, name: c.name, position: c.position,
      rotation_deg: c.rotation_deg, azimuth_deg: c.azimuthDeg, elevation_deg: c.elevationDeg,
    })),
    selected_clip: (placedClipsRef.current.find((c) => c.key === selectedClipKeyRef.current) ?? placedClipsRef.current.at(-1))?.key ?? null,
    // Cuántas anotaciones podían salir en la imagen (las ocultas no se pintan).
    annotations_visible: annotationsRef.current.filter((a) => a.visible).length,
  }), [levelNote, viewMode, selectedCandidate, allCandidates, morphometry, mprWl, orientation]);

  // Lo que se ve AHORA: cada panel visible con su sitio, su HUD y su captura.
  // Lo usan la captura (una vez) y la grabación (en cada fotograma), así que
  // una imagen y un vídeo del mismo visor no pueden diferir. Se recorre la
  // rejilla y entra cada celda que se ve donde se ve; en «sola» las laterales
  // siguen montadas, pero ocultas, y no entran.
  const leerVisor = useCallback(() => {
    const root = viewerRef.current;
    const layout = layoutRef.current;
    if (!root || !cellEls.current[layout.main]) return null;
    // El origen es la rejilla, no el visor entero: la banda de cabecera queda
    // encima y no entra en la captura (sus conmutadores no son imagen).
    const base = (gridHostRef.current ?? root).getBoundingClientRect();
    const rel = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x - base.x), y: Math.round(r.y - base.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    // La escena: la malla si la hay; si no, el corte axial que hace de escena
    // (registrado como «scene», ver `renderPane`).
    const capturaDe = (id: PaneId) => (id === "scene"
      ? meshCapture.current ?? paneCaptures.current.get("scene") ?? null
      : paneCaptures.current.get(id) ?? null);
    const panes: PaneShot[] = [];
    const anotar = (id: PaneId, el: HTMLElement) => panes.push({ id, rect: rel(el), capture: capturaDe(id), ...readPaneHud(el), shapes: readPaneShapes(el) });
    // Qué celdas se ven no depende de la orientación del visor (vertical solo
    // cambia DERECHA por ABAJO, y ambas muestran las cinco): basta `false`.
    const spec = gridFor(layout, false);
    for (const id of [layout.main, ...layout.side]) {
      const el = cellEls.current[id];
      if (el && spec.visible[id]) anotar(id, el);
    }
    const cs = getComputedStyle(root);
    const color = (nombre: string, porDefecto: string) => cs.getPropertyValue(nombre).trim() || porDefecto;
    return {
      width: Math.round(base.width),
      height: Math.round(base.height),
      panes,
      heading: readHeading(root),
      note: levelNoteRef.current ?? undefined,
      colors: { hud: color("--hud", "#cfe3f0"), dim: color("--hud-dim", "#5b6b77"), gap: color("--hud-dim", "#5b6b77") },
      fontFamily: color("--font-mono", "monospace"),
      hudLevel: hudLevelRef.current,
    };
  }, []);

  // Devuelve "saved" si quedó en el estudio y "downloaded" si solo se descargó
  // porque no hay estudio archivado. Antes, sin estudio, el botón quedaba
  // desactivado mientras «Grabar» sí descargaba su vídeo: misma situación, dos
  // respuestas. Ahora la captura también se descarga, y el topbar dice que no
  // quedó en el caso.
  const capturarVisor = useCallback(async (): Promise<"saved" | "downloaded"> => {
    const vista = leerVisor();
    if (!vista) throw new Error("No hay visor que capturar.");
    {
      const root = viewerRef.current!;
      const { width, height } = vista;
      const png = await composeCapture({ ...vista, deps: browserDeps });
      if (!png) throw new Error("No hay ningún panel que capturar.");

      const ahora = new Date();
      if (!imagingStudyId) {
        const a = document.createElement("a");
        a.href = png;
        a.download = captureFileName(ahora);
        document.body.appendChild(a);
        a.click();
        a.remove();
        return "downloaded";
      }
      await api.saveCapture({
        imaging_study_id: imagingStudyId,
        session_id: sessionId ?? "",
        step,
        label: `${STEPS.find((x) => x.key === step)?.label ?? "Captura"} · ${ahora.toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        png_b64: png,
        width, height,
        // El estado que la produjo. Sin esto, dentro de seis semanas la imagen
        // no contesta qué candidato era ni desde dónde se estaba mirando.
        state: estadoVisor(root),
      });
      return "saved";
    }
  }, [imagingStudyId, sessionId, step, leerVisor, estadoVisor]);
  // Se publica UNA VEZ una envoltura estable que lee la versión vigente de una
  // ref. Dependiendo de `capturarVisor`, cualquier dependencia suya que naciera
  // nueva en cada render —bastó un objeto literal— volvía a llamar a
  // `setCaptureCase`, que actualiza el store y re-renderiza el árbol: un bucle
  // de ~1000 vueltas/s que dejaba sin turno a las navegaciones de React Router.
  // Así el efecto no puede repetirse aunque alguien añada mañana otra
  // dependencia sin memoizar.
  const capturarRef = useRef(capturarVisor);
  capturarRef.current = capturarVisor;
  useEffect(() => {
    setCaptureCase(() => capturarRef.current());
    return () => setCaptureCase(null);
  }, [setCaptureCase]);

  // Lo mismo para la grabación, por la misma razón: una sola publicación de
  // algo estable que lee por refs. En cada fotograma se relee el visor —si a
  // mitad se cambia de preset o se intercambian vistas, el vídeo lo refleja— y
  // cada panel se copia con `grab`, no con la captura en PNG.
  const leerVisorRef = useRef(leerVisor);
  leerVisorRef.current = leerVisor;
  const estadoVisorRef = useRef(estadoVisor);
  estadoVisorRef.current = estadoVisor;
  useEffect(() => {
    setViewerRecording({
      read: () => {
        const v = leerVisorRef.current();
        if (!v) return null;
        return { ...v, grabs: v.panes.map((p) => p.capture?.grab ?? null) };
      },
      state: () => (viewerRef.current ? estadoVisorRef.current(viewerRef.current) : {}),
    });
    return () => setViewerRecording(null);
  }, [setViewerRecording]);

  // Transient "you clicked outside the mesh" hint — without it a missed pick is
  // silent and the tool feels broken.
  const [pickMiss, setPickMiss] = useState(false);
  const onPickMiss = useCallback(() => {
    setPickMiss(true);
    setTimeout(() => setPickMiss(false), 1800);
  }, []);
  useEffect(() => { if (!pickMode) setPickMiss(false); }, [pickMode]);
  // Every placed device is drawn, each in its own colour: planning a stent after
  // a clip leaves both in the plan, and a viewer showing only the last one placed
  // hid that — the clinician saw one device while the report listed two.
  const devices = useMemo(
    () => ([
      { kind: "clips" as const, url: deviceMeshes.clips, color: DEVICE_COLOR },
      { kind: "coils" as const, url: deviceMeshes.coils, color: COIL_COLOR },
      { kind: "stent" as const, url: deviceMeshes.stent, color: STENT_COLOR },
    ]).filter((d): d is { kind: "clips" | "coils" | "stent"; url: string; color: Vector3 } =>
      // Only session files: an empty plan falls back to a bundled sample mesh.
      !!d.url && d.url.startsWith("/data/")),
    [deviceMeshes],
  );
  // También en el informe: su visor se titula «Escena final» y enseñaba el
  // árbol sin el clip, los coils ni el stent que el plan lleva.
  const showDevice = (step === "devices" || step === "report") && devices.length > 0;
  // El mapa de calor del clip ocupa el sitio del saco: es el mismo saco,
  // pintado según el clip colocado. Los dos a la vez se pisarían.
  // Durante el ensayo de cierre manda el saco que se deforma: el campo se
  // calcula para la pose final, y pintarlo encima de la maniobra diría que el
  // clip ya apretaba mientras entraba por el corredor. Basta mirar el ensayo:
  // los fotogramas del saco viven dentro de él, y `sacFrame` se queda con su
  // último valor al salir, así que mirarlo dejaría el campo apagado para siempre.
  // Solo en Dispositivos: en el informe la escena final enseña el saco tal cual.
  const showField = step === "devices" && showDevice && !!clipField && showClipField && !clipRehearsal;

  // ── El manipulador del clip ─────────────────────────────────────────── #
  //
  // El clip que manejan las asas es el elegido en la lista de Dispositivos o,
  // si no hay ninguno, el último colocado. No se elige pinchando el cuerpo del
  // clip: el picking de MeshView solo actúa con un modo de pinchado activo.
  const selectedClip = placedClips.find((c) => c.key === selectedClipKey) ?? placedClips.at(-1) ?? null;
  const selectedClipRef = useRef(selectedClip);
  selectedClipRef.current = selectedClip;
  const morphometryRef = useRef(morphometry);
  morphometryRef.current = morphometry;
  // La lista ya no es la que se coció en las mallas: el clip se está moviendo
  // (o acaba de moverse) y el plan nuevo aún no ha llegado.
  const clipsStale = isStale(placedClips, plannedClips);
  // El DESFASADO del mapa de calor se mide contra la lista para la que se
  // calculó el campo, no contra el plan: el plan llega antes, y hasta que
  // llega el campo nuevo los colores son los de la pose anterior. Y la
  // respuesta del campo llega antes que su malla: hasta que MeshView avisa de
  // que la capa enseña ESE fichero, los colores siguen siendo los de antes.
  const onLayerLoaded = useCallback((id: string, url: string) => {
    if (id === "clip-field") setFieldMeshUrl(url);
  }, [setFieldMeshUrl]);
  // «Enseñado» = la capa está en un 3D montado: con «SOLA» y otra vista
  // principal la celda 3D no existe y no habrá aviso que esperar.
  const sceneMounted = sceneHasMesh && (viewerLayout.preset !== "sola" || viewerLayout.main === "scene");
  const fieldShown = showField && sceneMounted;
  useEffect(() => { setFieldMeshShown(fieldShown); }, [fieldShown, setFieldMeshShown]);
  const fieldStale = isStale(placedClips, fieldClips) || !fieldColoursOnScreen({
    shown: fieldShown, fieldUrl: clipField?.field_mesh_url ?? null, loadedUrl: fieldMeshOnScreen.url,
  });
  // Sin ensayo, y solo con la pestaña de clips montada (ver gizmoVisible).
  const gizmoOn = gizmoVisible({
    sceneHasMesh, step, clipsTabActive, hasClips: !!selectedClip, rehearsing: !!clipRehearsal,
  });
  const clipGizmoHandles = useMemo(
    () => (gizmoOn && selectedClip ? clipHandles(selectedClip, clipNormal(morphometry, selectedClip)) : []),
    [gizmoOn, selectedClip, morphometry],
  );
  // La malla del clip sigue al arrastre sin esperar al servidor: la malla
  // cocida con la pose del plan, movida por la diferencia entre esa pose y la
  // de ahora. Al llegar el plan nuevo la lista vuelve a coincidir y la matriz
  // se va (la malla nueva ya viene en su sitio); MeshView conserva la matriz
  // vieja hasta que esa malla nueva termina de cargar (ver layerMatrix).
  const clipsMatrix = useMemo(() => {
    if (clipRehearsal || !clipsStale || !plannedClips || !selectedClip) return undefined;
    const planned = plannedClips.find((c) => c.key === selectedClip.key);
    if (!planned) return undefined;   // un clip recién añadido no está en la malla
    const poseOf = (c: PlacedClip) => ({ position: c.position, normal: clipNormal(morphometry, c), rotationDeg: c.rotation_deg });
    return poseDelta(poseOf(planned), poseOf(selectedClip));
  }, [clipRehearsal, clipsStale, plannedClips, selectedClip, morphometry]);

  // Lo que se ve al empezar a arrastrar: Escape vuelve a ello. El gesto entero
  // se calcula desde esta foto (DragStart), no desde la pose que va cambiando.
  const clipDragRef = useRef<{ start: DragStart; before: PlacedClip } | null>(null);
  const onHandleDrag = useCallback((e: HandleDragEvent) => {
    if (!e.id.startsWith("clip:")) return;
    const replace = (pose: PlacedClip) => setPlacedClips((p) => p.map((c) => (c.key === pose.key ? pose : c)));
    if (e.phase === "start") {
      const clip = selectedClipRef.current;
      if (!clip) return;
      const m = morphometryRef.current;
      clipDragRef.current = {
        start: beginDrag(e.id, clip, clipNormal(m, clip), neckAxis(m), e.camera, e.viewport, e.px, e.py, e.shift),
        before: clip,
      };
      return;
    }
    const d = clipDragRef.current;
    if (!d) return;
    if (e.phase === "move") {
      // Sin corte (el rayo no toca el plano o la esfera) la pose se queda.
      const pose = dragPose(e.id, d.start, e.camera, e.viewport, e.px, e.py, e.shift);
      if (pose) replace(pose);
      return;
    }
    if (e.phase === "cancel") replace(d.before);
    clipDragRef.current = null;
  }, [setPlacedClips]);
  // Doble clic en la esfera verde: el clip vuelve al centro del cuello, sin
  // inclinar. El giro se respeta: es una decisión aparte de dónde va.
  const onHandleDoubleClick = useCallback((id: string) => {
    if (id !== "clip:move") return;
    const clip = selectedClipRef.current;
    if (!clip) return;
    const { position } = neckPlacement(morphometryRef.current);
    setPlacedClips((p) => p.map((c) => (c.key === clip.key ? { ...c, position, azimuthDeg: 0, elevationDeg: 0 } : c)));
  }, [setPlacedClips]);

  const showCenterline = !!centerlineMesh && centerlineMesh.startsWith("/data/");

  const layers = useMemo<MeshLayer[]>(() => {
    if (!displayMeshUrl) return [];
    const vesselDim = step === "detect" || step === "morpho" || showDevice || pickMode !== null || showCenterline;
    // En Cortes 3D la malla se vuelve translúcida para ver los cortes a través
    // de ella; con MALLA ○ baja a 0 en vez de salir de las capas, así no se
    // vuelve a descargar al encenderla (la opacidad cambia el actor en sitio).
    // Pero el picker de vtk.js no mira la opacidad: con un modo de marcado
    // activo la malla vuelve a verse, o el cuello, el ápice o una medida
    // caerían sobre una superficie que nadie ve.
    const vesselOpacity = viewMode === "slices3d"
      ? ((slices3dMeshVisible || pickMode !== null) ? SLICES3D_MESH_OPACITY : 0)
      : vesselDim ? 0.45 : 1;
    const out: MeshLayer[] = [{ url: displayMeshUrl, color: VESSEL_COLOR, opacity: vesselOpacity }];
    // En Morfometría se marcan el cuello y el ápice PINCHANDO la superficie, y
    // una mancha opaca encima tapa justo el sitio donde hay que pinchar. Así
    // que ahí el resalte se vuelve translúcido: sigue diciendo dónde está, y
    // deja ver el relieve por debajo.
    const marcando = step === "morpho" || pickMode !== null;
    const resalte = showDevice ? 0.5 : marcando ? 0.35 : 1;

    // El saco cerrado manda sobre el localizador: en cuanto está marcado el
    // cuello hay una malla que SÍ es el cuerpo del aneurisma, y enseñar las
    // dos a la vez volvería a mezclar «dónde mirar» con «qué es».
    // Durante el cierre del ensayo, el saco es el fotograma constreñido: el
    // sin deformar al lado diría que el clip no toca nada.
    const sacFrames = clipRehearsal?.sac_frames ?? [];
    const sacUrl = (sacFrame !== null && sacFrames[sacFrame])
      ? sacFrames[sacFrame]
      : morphometry?.sac_mesh_url;
    if (showField && clipField) {
      // Opaco: los colores son el dato, y translúcidos sobre el árbol se
      // mezclarían con el rojo del vaso y dejarían de casar con la leyenda.
      // Más tenue mientras el clip se mueve: los colores son los de la pose de
      // antes y, opacos, se leerían como el veredicto de la de ahora.
      out.push({ url: clipField.field_mesh_url, color: SAC_COLOR, opacity: fieldStale ? 0.35 : 1, id: "clip-field", scalars: { array: "colors" }, silhouette: true });
    } else if (sacUrl && step !== "segment" && step !== "upload") {
      // Con contorno: translúcido sobre el árbol, su borde se perdía.
      out.push({ url: sacUrl, color: SAC_COLOR, opacity: resalte, id: "sac", silhouette: true, frame: step === "morpho" });
    } else if (candidate?.dome_mesh_url && step !== "segment" && step !== "upload") {
      out.push({ url: candidate.dome_mesh_url, color: DOME_COLOR, opacity: resalte });
    }
    // While rehearsing, the placed clip is replaced by its three moving parts:
    // showing both would put two clips on screen, one of them frozen.
    if (clipRehearsal) {
      out.push({ url: clipRehearsal.body_url,    color: DEVICE_COLOR, opacity: 1, id: "clip-body" });
      out.push({ url: clipRehearsal.blade_a_url, color: DEVICE_COLOR, opacity: 1, id: "clip-blade-a" });
      out.push({ url: clipRehearsal.blade_b_url, color: DEVICE_COLOR, opacity: 1, id: "clip-blade-b" });
      for (const d of devices) if (d.kind !== "clips") out.push(namedDeviceLayer(d, stentMap));
    } else if (showDevice) {
      // Con nombre: cada recolocación (una por edición asentada) trae un fichero
      // nuevo, y sin nombre la escena entera se rehacía, recargaba el árbol y
      // devolvía la cámara al encuadre inicial un cuarto de segundo después de
      // cada retoque. Con nombre solo se sustituye la geometría del clip.
      // Lo que aún rehace la escena en este paso (la primera llegada del campo,
      // que cambia la capa «sac» por «clip-field», y el conmutador CALOR) conserva
      // la cámara: MeshView recibe `preserveCamera` mientras se está en Dispositivos.
      for (const d of devices) {
        out.push({ ...namedDeviceLayer(d, stentMap), ...(d.kind === "clips" && clipsMatrix ? { userMatrix: clipsMatrix } : null) });
      }
    }
    if (showCenterline && centerlineMesh) {
      out.push({ url: centerlineMesh, color: CENTERLINE_COLOR, opacity: 1 });
    }
    // Lo que se llevaría la tijera, en rojo y encima: el profesional decide
    // mirando esto, no leyendo un número de vértices.
    if (scissorsPreview && step === "segment") {
      out.push({ url: scissorsPreview, color: DOOMED_COLOR, opacity: 1, id: "tijera" });
    }
    // Seguimiento: el mapa de cambio pintado sobre los vasos cerca de la
    // lesión (rojo = creció, azul = encogió, gris = dentro del ruido) y el
    // saco del estudio anterior, translúcido, para ver de dónde venía.
    if (followup && step === "morpho") {
      out.push({ url: followup.mapUrl, color: VESSEL_COLOR, opacity: 1, id: "seguimiento",
                 scalars: { name: "cambio_mm", range: followup.range, deadband: followup.noise } });
      if (followup.ghostUrl) out.push({ url: followup.ghostUrl, color: FOLLOWUP_GHOST_COLOR, opacity: 0.3, id: "saco-anterior" });
    }
    return out;
  }, [followup, stentMap, displayMeshUrl, candidate?.dome_mesh_url, morphometry?.sac_mesh_url, step, showDevice, devices, showCenterline, centerlineMesh, pickMode, clipRehearsal, sacFrame, scissorsPreview, showField, clipField, fieldStale, clipsMatrix, viewMode, slices3dMeshVisible]);

  // Los tres cortes de Cortes 3D sobre el volumen del cliente, con la ventana
  // de los cortes. Sin volumen en el cliente (sin WebGL2 o aún cargando) no
  // hay cortes que dibujar: el modo exige WebGL2, como el oblicuo.
  const slicePlanesProp = useMemo<SlicePlanesProp | null>(() => {
    if (viewMode !== "slices3d" || !meta || !clientVol.image) return null;
    return {
      specs: slicePlaneSpecs(mprVoxel, meta), image: clientVol.image,
      wc: mprWl?.wc ?? meta.wc, ww: mprWl?.ww ?? meta.ww,
    };
  }, [viewMode, meta, clientVol.image, mprVoxel, mprWl]);

  const showPlanes = !planesHidden && !!meta;
  // El plano libre se enseña donde significa algo: en la vista Oblicuo, que lo
  // corta, o cuando VOLUMEN recorta por él. Con el recorte por eje sería ruido.
  const showFreePlane = showPlanes && (viewMode === "oblique" || clipMode === "libre");
  const planes = useMemo(
    () => (showPlanes ? planeOutlines(mprVoxel, meta, showFreePlane ? freePlane : null) : []),
    [showPlanes, showFreePlane, freePlane, meta, mprVoxel],
  );
  // Las asas de los planos salen con sus contornos (PLANOS, y el libre
  // solo en Oblicuo o con VOLUMEN en LIBRE); el clip conserva su propia puerta.
  const sceneHandles = useMemo(() => [...clipGizmoHandles, ...planeHandles(planes)], [clipGizmoHandles, planes]);
  const planesRef = useRef(planes);
  planesRef.current = planes;
  const mprVoxelRef = useRef(mprVoxel);
  mprVoxelRef.current = mprVoxel;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const centerlineRef = useRef(centerline);
  centerlineRef.current = centerline;
  // Punto de la línea central donde dejó el foco el último paso (ver stepTrackIndex).
  const trackIndexRef = useRef<number | null>(null);

  // ── Cine por celda ──────────────────────────────────────────────────── #
  // El eje de VOLUMEN: el elegido en su HUD o, sin elección, el del corte que
  // se recorre en la principal (coronal o sagital; si no, axial). La celda y
  // el cine leen este mismo valor para que el cine mueva lo que se ve.
  const volumeAxis: Plane = storeMipPlane ?? (viewerLayout.main === "coronal" || viewerLayout.main === "sagital" ? viewerLayout.main : "axial");
  // Qué recorre el cine de cada celda: un eje de la rejilla, o el plano libre
  // (VOLUMEN en LIBRE y Oblicuo). null = la celda no tiene nada que recorrer
  // (sin volumen, o la escena enseña la malla o los Cortes 3D).
  const cineTarget = (pane: PaneId): CineTarget | null => {
    if (!meta || !sessionId) return null;
    if (pane === "scene") {
      if (!(viewMode === "oblique" && !legacy && clientVol.image)) return null;
      return centerline && obliqueWalk === "vaso" ? { kind: "vessel" } : { kind: "free" };
    }
    if (pane === "mip") {
      if (!clientVol.image) return null;
      return clipMode === "libre" ? { kind: "free" } : { kind: "axis", axis: PLANE_AXIS[volumeAxis] };
    }
    return { kind: "axis", axis: PLANE_AXIS[pane] };
  };
  // El reloj vive fuera del render: lee la última versión por ref.
  const cineTargetRef = useRef(cineTarget);
  cineTargetRef.current = cineTarget;
  // Sentido actual del recorrido; el rebote lo invierte en los extremos.
  const cineDirRef = useRef<1 | -1>(1);
  /** Un paso del cine en la celda. Con `bounce` (el reloj) da la vuelta en los
   *  extremos; sin él (◀ ▶ de la barra) se queda en el borde. false = la
   *  celda ya no tiene qué recorrer (cambió de modo) y el reloj debe pararse.
   *  El plano libre avanza por el espaciado más fino, como la rueda. */
  /** Lleva el punto compartido al punto i de la línea central y pone el plano
   *  libre perpendicular al vaso allí. Adelantado al render, como el eje. */
  const goToTrackIndex = (i: number) => {
    const t = centerlineRef.current, m = metaRef.current; if (!t || !m) return;
    const v = mmToVoxel(t.points[i], m);
    mprVoxelRef.current = v; setMprVoxel(v);
    const fp = planeFromNormal(tangentAt(t.points, i));
    freePlaneRef.current = fp; setFreePlane(fp);
    trackIndexRef.current = i;
  };
  const currentTrackIndex = (): number | null => {
    const t = centerlineRef.current, m = metaRef.current; if (!t || !m) return null;
    return stepTrackIndex(t, voxelToMm(mprVoxelRef.current, m), trackIndexRef.current, Math.max(1, ...m.spacing));
  };
  const cineMove = (pane: PaneId, dir: 1 | -1, bounce: boolean): boolean => {
    const t = cineTargetRef.current(pane), m = metaRef.current;
    if (!t || !m) return false;
    const vox = mprVoxelRef.current;
    if (t.kind === "axis") {
      const count = m.shape[AXIS_DIM[t.axis]], i = vox[t.axis];
      const next = bounce ? nextIndex(i, dir, count, true) : { index: applyStep(i, dir, count), dir };
      if (bounce) cineDirRef.current = next.dir;
      if (next.index !== i) {
        const v = { ...vox, [t.axis]: next.index };
        // Adelantado al render: dos pasos seguidos no pueden partir del mismo vóxel.
        mprVoxelRef.current = v;
        setMprVoxel(v);
      }
      return true;
    }
    if (t.kind === "vessel") {
      const track = centerlineRef.current; if (!track) return false;
      const count = track.points.length, i = currentTrackIndex() ?? 0;
      const next = bounce ? nextIndex(i, dir, count, true) : { index: applyStep(i, dir, count), dir };
      if (bounce) cineDirRef.current = next.dir;
      if (next.index !== i) goToTrackIndex(next.index);
      return true;
    }
    const p = freePlaneRef.current, stepMm = Math.min(...m.spacing);
    const go = (d: 1 | -1): { want: number; got: FreePlane } => {
      const want = p.offsetMm + d * stepMm;
      return { want, got: clampOffsetToBox({ ...p, offsetMm: want }, vox, m) };
    };
    let d = dir, r = go(d);
    // La caja acotó el paso: estamos en el borde y el rebote da la vuelta.
    if (bounce && r.got.offsetMm !== r.want) { d = d === 1 ? -1 : 1; r = go(d); }
    if (bounce) cineDirRef.current = d;
    if (r.got.offsetMm !== p.offsetMm) { freePlaneRef.current = r.got; setFreePlane(r.got); }
    return true;
  };
  const cineMoveRef = useRef(cineMove);
  cineMoveRef.current = cineMove;
  /** Dónde está la celda en su recorrido, para la barra: el índice del eje o,
   *  en el plano libre, el desplazamiento contado en pasos desde el borde. */
  const cinePosition = (pane: PaneId): { index: number; count: number } | null => {
    const t = cineTarget(pane);
    if (!t || !meta) return null;
    if (t.kind === "axis") return { index: mprVoxel[t.axis], count: meta.shape[AXIS_DIM[t.axis]] };
    if (t.kind === "vessel") { const track = centerline!; return { index: currentTrackIndex() ?? 0, count: track.points.length }; }
    const stepMm = Math.min(...meta.spacing);
    const lo = clampOffsetToBox({ ...freePlane, offsetMm: -Infinity }, mprVoxel, meta).offsetMm;
    const hi = clampOffsetToBox({ ...freePlane, offsetMm: Infinity }, mprVoxel, meta).offsetMm;
    const count = Math.max(1, Math.floor((hi - lo) / stepMm) + 1);
    return { index: Math.min(count - 1, Math.max(0, Math.round((freePlane.offsetMm - lo) / stepMm))), count };
  };

  // La cadencia es una preferencia de quien mira: se lee al arrancar el cine
  // y se guarda al cambiarla. Con el cine parado la barra enseña la guardada.
  const [cineFps, setCineFps] = useState(readCineFps);
  const cineFpsRef = useRef(cineFps);
  cineFpsRef.current = cineFps;
  /** Reproducir/parar el cine de una celda (la barra y, en Task 6, el espacio). */
  const toggleCine = useCallback((pane: PaneId) => {
    if (cineRef.current?.pane === pane) { setCine(null); return; }
    if (!cineTargetRef.current(pane)) return;
    cineDirRef.current = 1;
    const fps = readCineFps();
    setCineFps(fps);
    setCine({ pane, fps, bounce: true });
  }, [setCine]);
  /** Un fotograma por segundo más o menos (la barra y, en Task 6, +/−). Con
   *  el cine en marcha cambia su reloj sin perder el sentido del recorrido. */
  const bumpFps = useCallback((d: 1 | -1) => {
    const fps = clampFps((cineRef.current?.fps ?? cineFpsRef.current) + d);
    writeCineFps(fps);
    setCineFps(fps);
    const c = cineRef.current;
    if (c && c.fps !== fps) setCine({ ...c, fps });
  }, [setCine]);
  // El reloj: uno solo, el del cine vigente; se rehace al cambiar de celda o
  // de cadencia y se para al desmontar.
  useEffect(() => {
    if (!cine) return;
    const pane = cine.pane;
    return startClock(cine.fps, () => { if (!cineMoveRef.current(pane, cineDirRef.current, true)) setCine(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cine]);
  // Paradas: otra celda con el foco, una distribución que oculta la celda que
  // reproduce (cineShouldStop), otro paso del pipeline u otra sesión. La
  // visibilidad no depende de vertical/apaisado: `false` basta, como en la
  // captura compuesta. Una celda enfocada que queda oculta suelta el foco:
  // si no, el espacio, C y +/− actuarían sobre una celda que no se ve. Y el
  // foco del teclado pasa a la principal (refocusAfterHide): la celda oculta
  // es `inert` y el navegador la desenfoca, así que Alt+2 ya no llegaría al
  // visor. En efecto de maquetación, para que no haya un fotograma sin foco.
  useLayoutEffect(() => {
    const visible = gridFor(viewerLayout, false).visible;
    if (focusedPane && !visible[focusedPane]) {
      setFocusedPane(null);
      // Después de soltarla: enfocar la principal la vuelve la celda enfocada.
      refocusAfterHide(document.activeElement, cellEls.current[focusedPane], cellEls.current[viewerLayout.main], gridHostRef.current)
        ?.focus({ preventScroll: true });
    }
    if (cineShouldStop(cineRef.current, { focusedPane, visible })) setCine(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPane, viewerLayout]);
  useEffect(() => {
    if (cineRef.current) setCine(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);
  /** La barra del cine de una celda: solo en la enfocada o en la que reproduce.
   *  En VOLUMEN y en el oblicuo la coloca la propia vista (prop `overlay`). */
  const cineBarFor = (id: PaneId, compact: boolean): ReactNode => {
    if (focusedPane !== id && cine?.pane !== id) return null;
    const pos = cinePosition(id);
    if (!pos) return null;
    const playing = cine?.pane === id;
    const fps = playing ? cine.fps : cineFps;
    return (
      <HudCineBar index={pos.index} count={pos.count} playing={playing} fps={fps} compact={compact}
        onPlay={() => toggleCine(id)} onStep={(d) => { cineMoveRef.current(id, d, false); }}
        // La barra emite la cadencia de destino; las teclas +/− harán lo mismo por bumpFps.
        onFps={(f) => { if (f !== fps) bumpFps(f > fps ? 1 : -1); }} />
    );
  };
  // Foto al agarrar el asa: el eje por el centroide de entonces, el parámetro
  // t0 donde cayó el ratón y el índice o desplazamiento de partida. Cada
  // movimiento se mide contra ella, no contra el plano que ya se ha movido.
  const planeDragRef = useRef<{ plane: OutlinePlane; origin: Vec3; dir: Vec3; t0: number; startIndex: number; startOffset: number } | null>(null);
  const onPlaneDrag = useCallback((e: HandleDragEvent) => {
    const m = metaRef.current;
    if (!m) return;
    const writePlane = (plane: OutlinePlane, index: number, offsetMm: number) => {
      const vox = mprVoxelRef.current;
      // El mismo setter que usan las celdas de corte (planeCfg.onIndexChange).
      if (plane === "axial") setMprVoxel({ ...vox, z: index });
      else if (plane === "coronal") setMprVoxel({ ...vox, y: index });
      else if (plane === "sagital") setMprVoxel({ ...vox, x: index });
      else setFreePlane(clampOffsetToBox({ ...freePlaneRef.current, offsetMm }, vox, m));
    };
    if (e.phase === "start") {
      const plane = e.id.slice("plane:".length) as OutlinePlane;
      const outline = planesRef.current.find((o) => o.plane === plane);
      if (!outline) return;
      const origin = polygonCentroid(outline.corners), dir = planeAxis(plane, freePlaneRef.current);
      const t0 = screenToAxis(e.camera, e.viewport, e.px, e.py, { origin, dir });
      if (t0 === null) return;
      const vox = mprVoxelRef.current;
      const startIndex = plane === "axial" ? vox.z : plane === "coronal" ? vox.y : plane === "sagital" ? vox.x : 0;
      planeDragRef.current = { plane, origin, dir, t0, startIndex, startOffset: freePlaneRef.current.offsetMm };
      return;
    }
    const d = planeDragRef.current;
    if (!d) return;
    if (e.phase === "move") {
      const t = screenToAxis(e.camera, e.viewport, e.px, e.py, { origin: d.origin, dir: d.dir });
      if (t === null) return;   // rayo paralelo al eje: el plano se queda donde estaba
      // Con el eje casi de frente un píxel son metros: se acota el salto por
      // gesto para que el corte no salga disparado al otro extremo.
      const dt = Math.max(-PLANE_DRAG_MAX_MM, Math.min(PLANE_DRAG_MAX_MM, t - d.t0));
      if (d.plane === "libre") writePlane(d.plane, 0, d.startOffset + dt);
      else writePlane(d.plane, indexFromDrag(d.plane, d.startIndex, dt, m), 0);
      return;
    }
    // Escape: el plano vuelve a donde estaba al agarrarlo.
    if (e.phase === "cancel") writePlane(d.plane, d.startIndex, d.startOffset);
    planeDragRef.current = null;
  }, [setMprVoxel, setFreePlane]);
  const onSceneHandleDrag = useCallback(
    (e: HandleDragEvent) => (e.id.startsWith("plane:") ? onPlaneDrag(e) : onHandleDrag(e)),
    [onPlaneDrag, onHandleDrag],
  );

  const markers = useMemo<MeshMarker[]>(() => {
    const out: MeshMarker[] = [];
    if (clSource) out.push({ pos: clSource, color: SOURCE_COLOR });
    if (clTarget) out.push({ pos: clTarget, color: TARGET_COLOR });
    for (const p of annotationDraft) out.push({ pos: p, color: PENDING_COLOR });
    for (const a of annotations) {
      if (!a.visible || a.kind !== "marcador" || a.points.length === 0) continue;
      out.push({ pos: a.points[0], color: hexToRgb01(ANNOTATION_HEX.marcador), scale: a.id === selectedAnnotation ? ANNOTATION_SELECTED_SCALE : 1 });
    }
    if (neckOrigin) out.push({ pos: neckOrigin, color: NECK_ORIGIN_COLOR });
    if (neckDome) out.push({ pos: neckDome, color: NECK_DOME_COLOR });
    for (const r of neckRim) out.push({ pos: r, color: NECK_RIM_COLOR });
    for (const r of scissorsPoints) out.push({ pos: r, color: SCISSORS_COLOR });
    if (cropCenter) out.push({ pos: cropCenter, color: CROP_CENTER_COLOR });
    if (lesionMark) out.push({ pos: lesionMark, color: LESION_MARK_COLOR });
    if (trajEntry) out.push({ pos: trajEntry, color: TRAJ_ENTRY_COLOR });
    if (trajTarget) out.push({ pos: trajTarget, color: TRAJ_TARGET_COLOR });
    if (overlay) out.push(...overlay.markers);
    // Where each perforator actually is — but only the ones switched on in the
    // list. The panel gave distances with nothing to say WHICH vessel a row
    // meant; the marker answers that, one at a time, on request.
    for (const p of perforators) {
      if (!visiblePerforators.includes(p.id)) continue;
      out.push({
        pos: [p.position_mm.x, p.position_mm.y, p.position_mm.z],
        color: PERFORATOR_COLOR[p.risk_level] ?? PERFORATOR_COLOR[3],
        scale: PERFORATOR_SCALE,
      });
    }
    return out;
  }, [clSource, clTarget, annotationDraft, annotations, selectedAnnotation, neckOrigin, neckDome, neckRim, scissorsPoints, cropCenter, lesionMark, trajEntry, trajTarget, overlay, perforators, visiblePerforators]);

  // El punto compartido de los cortes, con radio fijo en mm (no depende de la
  // escena). Va aparte de `markers`: MeshView lo dibuja encima de la malla.
  const focusMarker = useMemo<MeshFocus | null>(
    () => (showPlanes && meta ? { pos: voxelToMm(mprVoxel, meta), color: HUD_RGB, radiusMm: 0.6 } : null),
    [showPlanes, meta, mprVoxel],
  );

  // Legend bands built from the radii actually used, so they cannot drift from
  // the computation the way the hard-coded ones had.
  const perforatorBands = useMemo(() => {
    const [hi, mid, lo] = perforatorZones ?? [3, 5, 8];
    return [
      // Mismas palabras que la lista de perforantes: «alto <3 mm · medio 3–5 mm…».
      { color: "#ef4444", label: `ALTO <${hi} mm` },
      { color: "#eab308", label: `MEDIO ${hi}–${mid} mm` },
      { color: "#22c55e", label: `BAJO ${mid}–${lo} mm` },
    ];
  }, [perforatorZones]);

  const lines = useMemo<MeshLine[]>(() => {
    // WHY: los tramos ya pinchados del borrador; un ángulo a medias enseña su
    // primer brazo y se ve dónde caerá el vértice.
    const out: MeshLine[] = annotationDraft.slice(1)
      .map((b, i) => ({ a: annotationDraft[i], b, color: PENDING_COLOR }));
    // Las anotaciones hechas: un tubo por tramo; la región, cerrada.
    for (const a of annotations) {
      if (!a.visible || a.kind === "marcador") continue;
      const color = hexToRgb01(ANNOTATION_HEX[a.kind]);
      const scale = a.id === selectedAnnotation ? ANNOTATION_SELECTED_SCALE : 1;
      const pts = a.points;
      const n = a.kind === "region" ? pts.length : pts.length - 1;
      for (let k = 0; k < n; k++) out.push({ a: pts[k], b: pts[(k + 1) % pts.length], color, scale });
    }
    // El abordaje no es una regla: es el CORREDOR por el que tiene que caber el
    // clip con su aplicador. Dibujarlo con su radio real y translúcido es lo
    // que hace que el ensayo de colocación enseñe la maniobra y no una flecha.
    if (trajEntry && trajTarget) {
      out.push({ a: trajEntry, b: trajTarget, color: TRAJ_LINE_COLOR,
                 radiusMm: CORRIDOR_RADIUS_MM, opacity: 0.22 });
    }
    if (overlay) out.push(...overlay.lines);
    return out;
  }, [annotationDraft, annotations, selectedAnnotation, trajEntry, trajTarget, overlay]);

  // Rótulos del 3D: nombre y valor siempre, que en la escena no hay celda estrecha.
  const meshLabels = useMemo<MeshLabel[]>(
    () => annotations.filter((a) => a.visible && a.points.length > 0)
      .map((a) => ({ pos: labelAnchor(a), text: labelFor(a, false), color: ANNOTATION_HEX[a.kind] })),
    [annotations],
  );

  // Translucent preview of the crop ROI so the user SEES what will be kept
  // (cyan) or removed (red) before applying — the crop is otherwise blind.
  const cropPreview = useMemo(
    () => (cropCenter && step === "segment")
      ? { center: cropCenter, radius: cropRadius, shape: cropShape, invert: cropInvert }
      : null,
    [cropCenter, cropRadius, cropShape, cropInvert, step],
  );

  // Con la sincronización activa, un pick 3D o un clic en un corte mueven el
  // foco común; sin ella, los cortes siguen enlazados por mprVoxel y las
  // cámaras 3D no se mueven.
  const focusFromMm = useCallback((mm: Vec3) => { if (meta && syncViews) setFocusMm(mm, meta); }, [meta, syncViews, setFocusMm]);

  // La cámara 3D sigue al foco sin cambiar el zoom. También al registrarse
  // una escena nueva (cambio de paso, subir la escena al principal). El MIP no
  // mueve su cámara: su corte ya sale de mprVoxel.
  //
  // Salvo cuando el foco viene de un clic sobre el propio 3D: ahí la cámara se
  // queda quieta. Recentrarla tras cada punto movía la malla bajo el cursor,
  // y al marcar varios seguidos (el borde del cuello, el anillo de la tijera)
  // el siguiente clic caía en otro sitio, o fuera de la malla.
  //
  // Y salvo una escena rehecha dentro de Dispositivos con el mismo foco (primera
  // llegada del mapa de calor, CALOR): ahí MeshView ya ha devuelto la cámara del
  // usuario, y volver a centrar la desplazaría también en profundidad, que se ve
  // como un zoom. Al entrar en el paso el foco se aplica con normalidad.
  const focusFromPick = useRef(false);
  const lastFocus = useRef<{ point: Vec3 | null; inDevices: boolean }>({ point: null, inDevices: false });
  useEffect(() => {
    if (focusFromPick.current) { focusFromPick.current = false; return; }
    if (!focusPoint || !syncViews || !camera) return;
    const inDevices = devicesCameras.current.has(camera);
    if (inDevices && lastFocus.current.inDevices && lastFocus.current.point === focusPoint) return;
    camera.focus(focusPoint);
    lastFocus.current = { point: focusPoint, inDevices };
  }, [focusPoint, syncViews, camera]);

  // Al volver a activar SINCRO, el 3D y los cortes pueden estar en puntos
  // distintos (los cortes siguieron moviéndose solos). Se parte del crosshair:
  // es lo último que el usuario señaló.
  const prevSync = useRef(syncViews);
  useEffect(() => {
    const rising = syncViews && !prevSync.current;
    prevSync.current = syncViews;
    if (rising && meta) setFocusMm(voxelToMm(mprVoxel, meta), meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncViews]);

  // Candidato elegido en Detección → foco. Con la meta en las dependencias:
  // al reanudar una sesión el candidato llega antes que el volumen.
  useEffect(() => {
    const c = allCandidates[selectedCandidate];
    if (c && syncViews && meta && step === "detect") setFocusMm([c.center_mm.x, c.center_mm.y, c.center_mm.z], meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidate, allCandidates, step, meta]);

  // Entrar en Morfometría o Dispositivos con el cuello medido → foco.
  useEffect(() => {
    const n = morphometry?.neck_origin;
    if (n && syncViews && meta && (step === "morpho" || step === "devices")) setFocusMm([n.x, n.y, n.z], meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, morphometry?.neck_origin, meta]);

  // El preajuste de VOLUMEN tiene que existir en esta modalidad: la sesión
  // arranca en «Vasos» (XA) y un TC lo cambia a «CTA» al llegar la meta.
  useEffect(() => {
    if (!meta) return;
    const list = volumePresetsFor(meta.modality);
    if (!list.includes(volumePreset)) setVolumePreset(list[0]);
  }, [meta, volumePreset, setVolumePreset]);

  // «Centrar en la lesión»: el cuello medido si lo hay; si no, el candidato.
  const neck = morphometry?.neck_origin;
  const lesion: Vec3 | null = neck
    ? [neck.x, neck.y, neck.z]
    : candidate ? [candidate.center_mm.x, candidate.center_mm.y, candidate.center_mm.z] : null;
  // Para la caja LOCAL de VOLUMEN: memorizado por valor, para que MipView no rehaga sus planos en cada render.
  const lesionDiam = morphometry?.max_diameter_mm ?? candidate?.max_diameter_mm ?? 0;
  const mipLesion = useMemo(() => (lesion ? { center: lesion, diameterMm: lesionDiam } : null), [lesion?.[0], lesion?.[1], lesion?.[2], lesionDiam]);   // eslint-disable-line react-hooks/exhaustive-deps
  const centerOnLesion = () => {
    if (!lesion || !meta) return;
    setFocusMm(lesion, meta);
    camera?.frame(lesion, lesionFrameRadiusMm(morphometry?.max_diameter_mm ?? candidate?.max_diameter_mm ?? 0));
  };
  // «ABORDAJE»: la cámara mira por el corredor hacia la diana y el plano
  // libre queda perpendicular a él en la diana (spec §4.2). Oblicuo y VOLUMEN
  // en LIBRE siguen ese plano sin más.
  const viewApproach = () => {
    if (!trajEntry || !trajTarget || !meta) return;
    const dir = approachDirection(trajEntry, trajTarget);
    if (!dir) return;
    camera?.lookAlong(dir, trajTarget, lesionFrameRadiusMm(morphometry?.max_diameter_mm ?? candidate?.max_diameter_mm ?? 0));
    setFocusMm(trajTarget, meta);
    setFreePlane(planeFromNormal(dir));
  };
  // Los paneles lo llaman a través del store. Se registra una envoltura
  // estable que lee la versión vigente: registrar la función de cada render
  // en el store volvería a renderizar el visor, y así sin fin.
  const centerRef = useRef(centerOnLesion);
  centerRef.current = centerOnLesion;
  const canCenter = !!lesion && !!meta;
  useEffect(() => {
    setCenterOnLesion(canCenter ? () => centerRef.current() : null);
  }, [canCenter, setCenterOnLesion]);
  useEffect(() => () => setCenterOnLesion(null), [setCenterOnLesion]);

  // `aviso`: un mensaje (tope de anotaciones, cine…) que hay que leer en
  // cualquier nivel del HUD; sin él es la pista del gesto, que esencial y
  // limpio esconden (hud.css).
  const [hint, setHint] = useState<{ text: string; aviso: boolean } | null>(null);
  // La animación de desvanecido corre una vez, al montar el div: reaparecer al
  // cambiar la principal necesita un nodo nuevo (de ahí `key`) o se vería ya apagada.
  const [hintSeq, setHintSeq] = useState(0);
  // Antes que finishAnnotation, que la usa para el aviso del tope.
  const showHintText = useCallback((text: string, aviso = true) => {
    setHint({ text, aviso });
    setHintSeq((n) => n + 1);
  }, []);
  // El retiro va en un efecto y no en `showHintText`: el doble montaje de
  // StrictMode limpia un temporizador armado a mano y, con la pista ya marcada
  // como vista, nada lo rearmaba (la pista se quedaba en el estado).
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3000);
    return () => clearTimeout(t);
  }, [hint, hintSeq]);
  const showHint = useCallback((kind: HintKind) => showHintText(HINT_TEXT[kind], false), [showHintText]);

  // Pista del nivel del HUD («HUD esencial»), arriba y 1,2 s. Aparte de la de
  // la vista: esa la esconden los niveles y, al cargar, el cambio de pista de
  // la principal (llega la sesión) la pisaría antes de leerse.
  const [levelHint, setLevelHint] = useState<{ text: string; seq: number } | null>(null);
  const levelHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLevelHint = useCallback((level: HudLevel) => {
    setLevelHint((p) => ({ text: `HUD ${level}`, seq: (p?.seq ?? 0) + 1 }));
    if (levelHintTimer.current) clearTimeout(levelHintTimer.current);
    levelHintTimer.current = setTimeout(() => setLevelHint(null), 1200);
  }, []);
  const changeHudLevel = useCallback((level: HudLevel) => {
    setHudLevel(level);
    showLevelHint(level);
  }, [setHudLevel, showLevelHint]);
  // Al abrir el visor fuera de completo se dice una vez: si no, un HUD
  // esencial heredado de la última sesión parecería un visor roto.
  useEffect(() => {
    if (hudLevelRef.current !== "completo") showLevelHint(hudLevelRef.current);
    return () => { if (levelHintTimer.current) clearTimeout(levelHintTimer.current); };
  }, [showLevelHint]);

  // Cierra el borrador como anotación nueva: queda elegida y el modo se desarma.
  const finishAnnotation = useCallback((points: Vec3[], plane: AnnotationPlane | null) => {
    const kind = kindOfMode(pickMode);
    if (!kind) return;
    // WHY: el servidor no acepta más de ANNOTATIONS_MAX y cada PUT lleva la
    // lista entera; la 201 dejaría sin guardar todo lo que viniera después.
    if (annotations.length >= ANNOTATIONS_MAX) {
      setAnnotationDraft([]);
      setPickMode(null);
      showHintText(`Máximo ${ANNOTATIONS_MAX} anotaciones por sesión`);
      return;
    }
    const a: Annotation = {
      id: newId(), kind, points, plane, label: "", note: "",
      visible: true, created_at: new Date().toISOString(), created_by: "",
    };
    // WHY: la etiqueta se calcula sobre la lista vigente, no sobre la del
    // render; dos cierres en el mismo tick darían la misma.
    setAnnotations((p) => [...p, { ...a, label: nextLabel(kind, p) }]);
    setSelectedAnnotation(a.id);
    // El marcador existe para llevar una nota: el panel se abre con su campo enfocado.
    if (kind === "marcador") setNoteFocusRequest(a.id);
    setAnnotationDraft([]);
    setPickMode(null);
  }, [pickMode, annotations.length, setAnnotations, setSelectedAnnotation, setAnnotationDraft, setPickMode, setNoteFocusRequest, showHintText]);

  // Corte de la región en curso: se fija con su primer punto.
  const draftPlaneRef = useRef<AnnotationPlane | null>(null);
  // `plane` es el corte del clic (null en el 3D); una regla o un ángulo pueden
  // mezclar cortes y 3D, y se quedan con el corte del último clic.
  const addAnnotationPoint = useCallback((xyz: Vec3, plane: AnnotationPlane | null) => {
    const kind = kindOfMode(pickMode);
    if (!kind) return;
    if (kind === "region") {
      // WHY: una región es un contorno sobre un corte; en la malla 3D sus puntos
      // no caen en un plano y el área no significaría nada. El aviso lo dice.
      if (!plane) return;
      // Y un solo corte: un punto en otra celda, o tras mover la rueda, haría
      // un contorno alabeado que no se enseña entero en ningún corte.
      const first = draftPlaneRef.current;
      if (annotationDraft.length === 0) draftPlaneRef.current = plane;
      else if (!first || first.plane !== plane.plane || first.index !== plane.index) return;
    }
    const step = addPoint(kind, annotationDraft, xyz);
    if (step.done) finishAnnotation(step.done, plane);
    else setAnnotationDraft(step.draft);
  }, [pickMode, annotationDraft, finishAnnotation, setAnnotationDraft]);

  const onAnnotationKey = useCallback((key: "Enter" | "Backspace" | "Escape") => {
    if (key === "Escape") { setAnnotationDraft([]); setPickMode(null); return; }
    if (key === "Backspace") { setAnnotationDraft(removeLast); return; }
    if (pickMode !== "anot_region") return;
    const points = closeRegion(annotationDraft);
    if (points && draftPlaneRef.current) finishAnnotation(points, draftPlaneRef.current);
  }, [pickMode, annotationDraft, finishAnnotation, setAnnotationDraft, setPickMode]);

  const onPick = useCallback(
    (xyz: [number, number, number]) => {
      // Cualquier punto marcado en el 3D es también el nuevo foco común: los
      // cortes van a él; la cámara 3D no se mueve (ver focusFromPick).
      focusFromPick.current = syncViews && !!meta;
      focusFromMm(xyz);
      if (pickMode === "cl_source") { setClSource(xyz); setPickMode(null); }
      else if (pickMode === "cl_target") { setClTarget(xyz); setPickMode(null); }
      else if (pickMode === "neck_origin") { setNeckOrigin(xyz); setPickMode(null); }
      else if (pickMode === "neck_dome") { setNeckDome(xyz); setPickMode(null); }
      else if (pickMode === "crop_center") { setCropCenter(xyz); setPickMode(null); }
      else if (pickMode === "lesion_mark") { setLesionMark(xyz); setPickMode(null); }
      // Sigue armado: borrar una pieza y tener que rearmar para la siguiente
      // convierte una limpieza de diez clics en veinte.
      else if (pickMode === "erase_piece") { setErasePick(xyz); }
      else if (pickMode === "traj_entry") { setTrajEntry(xyz); setPickMode(null); }
      else if (pickMode === "traj_target") { setTrajTarget(xyz); setPickMode(null); }
      // Also stays armed: the rim needs at least three points to define a plane.
      else if (pickMode === "neck_rim") { setNeckRim([...neckRim, xyz]); }
      else if (pickMode === "scissors") { setScissorsPoints([...scissorsPoints, xyz]); }
      else if (kindOfMode(pickMode)) addAnnotationPoint(xyz, null);
    },
    [pickMode, addAnnotationPoint, setClSource, setClTarget, setNeckOrigin, setNeckDome, setCropCenter, setLesionMark, setErasePick, setTrajEntry, setTrajTarget, setPickMode, focusFromMm, syncViews, meta],
  );

  // Un marcado se hace sobre la malla: si la escena es una vista lateral, sube
  // a principal, porque en una celda pequeña ni se apunta ni se lee el aviso.
  // Las anotaciones no: se marcan también en los cortes, y la región solo en ellos.
  useEffect(() => {
    if (pickMode !== null && kindOfMode(pickMode) === null && viewerLayout.main !== "scene") setViewerLayout(promote(viewerLayout, "scene"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickMode]);

  // Configuración por plano. El eje vertical de coronal/sagital es 1 − f(z)
  // porque se ven con superior arriba (como los PNG); axial no se voltea. Las
  // líneas de referencia van en las mismas coordenadas que el crosshair: en
  // cada plano marcan dónde lo cortan los otros dos.
  const f = (n: number, i: number) => (n > 1 ? i / (n - 1) : 0.5);
  const annotationKind = kindOfMode(pickMode);
  const planeCfg = (plane: Plane) => ({ ...planeNav(plane), ...planeAnnotation(plane) });
  // Lo que cada corte necesita para marcar anotaciones con el índice que enseña.
  const planeAnnotation = (plane: Plane) => {
    const index = plane === "axial" ? mprVoxel.z : plane === "coronal" ? mprVoxel.y : mprVoxel.x;
    const dp = draftPlaneRef.current;
    return {
      annotationMode: annotationKind !== null,
      annotationKind,
      // La región se proyecta solo en su propio corte: en otro sus px no significan nada.
      annotationDraft: annotationKind !== "region" || (dp?.plane === plane && dp.index === index) ? annotationDraft : [],
      onPlaneClickMm: (p: Vec3) => addAnnotationPoint(p, { plane, index }),
      onAnnotationKey,
    };
  };
  const planeNav = (plane: Plane) => {
    const vox = mprVoxel;
    const set = (v: Partial<typeof vox>) => setMprVoxel({ ...vox, ...v });
    // Un clic en un corte, con SINCRO, es el nuevo foco de todo (el 3D
    // incluido); setFocusMm deja el mismo vóxel en mprVoxel.
    const click = (v: Partial<typeof vox>) => {
      if (syncViews && meta) setFocusMm(voxelToMm({ ...vox, ...v }, meta), meta);
      else set(v);
    };
    if (plane === "axial") return {
      index: vox.z, crosshair: { u: f(nx, vox.x), v: f(ny, vox.y) },
      referenceLines: { u: f(nx, vox.x), v: f(ny, vox.y) },      // sagital vertical, coronal horizontal
      onIndexChange: (i: number) => set({ z: i }),
      onPlaneClick: (u: number, v: number) => click({ x: clampIdx(nx, u), y: clampIdx(ny, v) }),
    };
    if (plane === "coronal") return {
      index: vox.y, crosshair: { u: f(nx, vox.x), v: 1 - f(nz, vox.z) },
      referenceLines: { u: f(nx, vox.x), v: 1 - f(nz, vox.z) },
      onIndexChange: (i: number) => set({ y: i }),
      onPlaneClick: (u: number, v: number) => click({ x: clampIdx(nx, u), z: clampIdx(nz, 1 - v) }),
    };
    return {
      index: vox.x, crosshair: { u: f(ny, vox.y), v: 1 - f(nz, vox.z) },
      referenceLines: { u: f(ny, vox.y), v: 1 - f(nz, vox.z) },
      onIndexChange: (i: number) => set({ x: i }),
      onPlaneClick: (u: number, v: number) => click({ y: clampIdx(ny, u), z: clampIdx(nz, 1 - v) }),
    };
  };

  // Sin malla, la escena ES el corte axial: el principal enseña cortes aunque
  // su celda se llame «scene».
  const sceneIsSlice = meshScene && !meshVisible && !!sessionId && !!meta;
  const mainIsSlice = viewerLayout.main === "axial" || viewerLayout.main === "coronal"
    || viewerLayout.main === "sagital" || (viewerLayout.main === "scene" && sceneIsSlice);

  // La pista del panel principal ocupaba la esquina para siempre; ahora aparece
  // 3 s cuando cambia lo que hay en él y se desvanece (la animación de
  // .hud-hint dura lo mismo). El texto depende de si el principal es girable
  // (3D o VOLUMEN) o un corte; en cualquier otro caso (oblicuo, sin sesión) no
  // hay nada que enseñar. «?» ya no la repite: abre la hoja de atajos, que
  // tiene todas las teclas y no se desvanece.
  const mainRotatable = viewerLayout.main === "scene" && sceneHasMesh;
  // En limpio no hay pista: es pantalla para la imagen.
  const hintKind: HintKind | null = hudLevel === "limpio" ? null
    : viewerLayout.main === "mip" ? "mip" : mainRotatable ? "rotate" : mainIsSlice ? "slice" : null;
  useEffect(() => {
    if (hintKind) {
      if (shouldShowHint(hintKind, window.sessionStorage)) showHint(hintKind);
    } else {
      // Solo se retira la pista del gesto: un aviso en pantalla (p. ej. el tope
      // de anotaciones) no es de este efecto.
      setHint((h) => (h && !h.aviso ? null : h));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKind]);

  // Hoja «Atajos». Viewer solo la ABRE con «help»: el cierre (Esc, «?», clic
  // fuera) es de la hoja. Si los dos alternaran con el mismo «?», según el
  // orden de las escuchas se cerraría y se volvería a abrir en la misma tecla;
  // la ref se lee en el momento de la tecla, antes del nuevo render.
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;
  const openSheet = useCallback(() => { if (!sheetOpenRef.current) setSheetOpen(true); }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Atajos del visor que reenvía Workspace (vtk/shortcuts). Actúan sobre la
  // celda enfocada; sin foco todavía, sobre la principal, que es la que se mira.
  const onShortcut = (id: string) => {
    // Con la hoja abierta el visor queda detrás: una tecla no puede cambiarlo sin verse.
    if (sheetOpenRef.current) return;
    const pane = focusedPane ?? viewerLayout.main;
    switch (id) {
      case "sync": setSyncViews(!syncViews); return;
      // Ningún atajo mira el nivel: en limpio todos siguen actuando.
      case "hud-cycle": {
        // De la ref, adelantada aquí: dos H antes del siguiente render avanzan dos.
        const next = nextHudLevel(hudLevelRef.current);
        hudLevelRef.current = next;
        changeHudLevel(next);
        return;
      }
      case "help": openSheet(); return;
      case "anot-regla": case "anot-angulo": case "anot-region": case "anot-marcador": {
        // Misma tecla otra vez desarma; setPickMode ya vacía el borrador al cambiar.
        const m = ANNOTATION_MODES[id.slice(5) as keyof typeof ANNOTATION_MODES];
        setPickMode(pickMode === m ? null : m);
        return;
      }
      case "anot-borrar":
        if (selectedAnnotation) {
          const gone = selectedAnnotation;
          setAnnotations((p) => p.filter((a) => a.id !== gone));
          setSelectedAnnotation(null);
        }
        return;
      case "anot-deshacer-punto":
        if (annotationDraft.length > 0) onAnnotationKey("Backspace");
        return;
      case "cine-toggle": toggleCine(pane); return;   // sin recorrido (3D) no hace nada
      case "cine-faster": bumpFps(1); return;
      case "cine-slower": bumpFps(-1); return;
      // Escape llega de Workspace esté donde esté el foco: el espacio arranca el
      // cine desde cualquier sitio y Escape tiene que pararlo igual.
      case "escape": setCine(null); return;
      case "center":
        // La escena es oblicuo o corte axial (sin malla) con encuadre propio;
        // si no, 3D o CORTES 3D de MeshView, que encuadra con su propia cámara.
        if (pane === "scene" && viewMode !== "oblique" && !sceneIsSlice) camera?.setView("fit");
        else paneFits.current.get(pane)?.();
        return;
    }
  };
  // Dónde va la pista de la principal (hud.css): bajo la cinta de rumbo en la
  // escena 3D y, en VOLUMEN, bajo la fila de controles de arriba.
  const hintPlace = viewerLayout.main === "mip" ? " hud-hint-vol" : viewerLayout.main === "scene" ? " hud-hint-cinta" : "";
  // Por ref: la escucha se pone una vez y siempre ve el estado del último render.
  const onShortcutRef = useRef(onShortcut);
  onShortcutRef.current = onShortcut;
  useEffect(() => {
    const on = (e: Event) => onShortcutRef.current(String((e as CustomEvent).detail));
    window.addEventListener("viewer:shortcut", on);
    return () => window.removeEventListener("viewer:shortcut", on);
  }, []);

  // «Ir» del panel de anotaciones. Llega por evento porque la meta del volumen
  // (mm → vóxel) solo la tiene el visor. El foco va al centroide; con corte
  // propio, ese corte se fija a su índice exacto: el centroide de una regla
  // trazada en AX 152 podría redondear a 151 y la regla no se vería.
  const focusAnnotation = (id: string) => {
    const a = annotations.find((x) => x.id === id);
    if (!a || !meta || a.points.length === 0) return;
    const c = centroid(a.points);
    setFocusMm(c, meta);
    if (a.plane) setMprVoxel({ ...mmToVoxel(c, meta), [PLANE_AXIS[a.plane.plane]]: a.plane.index });
    // Sin SINCRO la cámara 3D no sigue al foco; «Ir» es una petición explícita.
    if (!syncViews) camera?.focus(c);
  };
  const focusAnnotationRef = useRef(focusAnnotation);
  focusAnnotationRef.current = focusAnnotation;
  useEffect(() => {
    const on = (e: Event) => focusAnnotationRef.current(String((e as CustomEvent).detail));
    window.addEventListener("viewer:focus-annotation", on);
    return () => window.removeEventListener("viewer:focus-annotation", on);
  }, []);

  // Los preajustes de ventana viven en cada celda de corte no compacta, bajo
  // su lectura W/L (los monta SliceView): antes solo en la principal, y una
  // lateral no tenía cómo elegir uno. Fuera de TC no hay presets HU con
  // sentido clínico: se derivan de la meta y de la banda activa (vista previa
  // viva mientras se ajusta el umbral; si no, la banda de vasos del volumen,
  // que sobrevive a la segmentación).
  const wlPresets = meta
    ? windowPresets(meta, previewBand ?? vesselBand)
    : [];

  // `captureAs`: con qué nombre registra su captura. Casi siempre el propio
  // panel; pero sin malla la escena ES un corte axial, y registrándose como
  // «axial» chocaba con el axial lateral: la escena quedaba sin captura
  // («SIN IMAGEN» en el principal) y, al desmontarse uno, el otro perdía la suya.
  // `ctx.compact` lo decide el ancho REAL de la celda (ViewerGrid), no si es la
  // principal: una principal estrecha también necesita el HUD reducido.
  const renderPane = (id: PaneId, ctx: PaneContext, captureAs: PaneId = id): ReactNode => {
    const compact = ctx.compact;
    const active = ctx.isMain;
    if (id === "scene") return renderScene(ctx);
    if (id === "mip") {
      // El MIP necesita el volumen en el navegador (WebGL2 + vtkImageData);
      // sin él la celda dice por qué está vacía en lugar de quedarse negra.
      if (!meta || !clientVol.image) {
        return (
          <HudFrame label="VOLUMEN" active={active}>
            <HudReadout at="bl" lines={[meta && hasWebGL2() && !clientVol.error ? "CARGANDO…" : "SIN VOLUMEN"]} />
          </HudFrame>
        );
      }
      // Acumula en el eje elegido en su HUD; sin elección, en el del corte que
      // se está recorriendo: el del panel principal si es coronal o sagital;
      // si no (axial, 3D, MIP), el axial.
      const mipPlane: Plane = volumeAxis;
      return (
        <Suspense fallback={<ViewerLoading label="Cargando VOLUMEN…" />}>
          <MipView image={clientVol.image} meta={meta} orientation={orientation} compact={compact} plane={mipPlane} onPlaneChange={setMipPlane} registerCapture={regPane("mip")} registerFit={regFit("mip")}
            overlay={cineBarFor("mip", compact)} showInset={hudLevel !== "limpio"} vesselBand={vesselBand} lesion={mipLesion} />
        </Suspense>
      );
    }
    if (!meta || !sessionId) {
      return <HudFrame label={id.toUpperCase()}><HudReadout at="bl" lines={[series ? "CARGANDO…" : "SIN VOLUMEN"]} /></HudFrame>;
    }
    const c = planeCfg(id);
    // El tinte de banda solo tiene sentido mientras se ajusta el umbral.
    const band = step === "segment" ? previewBand : null;
    if (legacy) {
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {/* Ruta sin WebGL2: MprView no tiene selector de preajustes. */}
          <MprView sessionId={sessionId} meta={meta} plane={id} compact={compact} showSlider={!compact} wc={mprWl?.wc} ww={mprWl?.ww} band={band}
            index={c.index} onIndexChange={c.onIndexChange} crosshair={c.crosshair} onPlaneClick={c.onPlaneClick} onWindowLevel={(wc, ww) => setMprWl({ wc, ww })} />
          {!hasWebGL2() && <HudFrame><HudReadout at="tr" lines={["SIN WEBGL2 · VISOR REDUCIDO"]} tone="warn" /></HudFrame>}
        </div>
      );
    }
    return (
      <Suspense fallback={<ViewerLoading label="Cargando visor de cortes…" />}>
        <SliceView image={clientVol.image!} meta={meta} plane={id} index={c.index} onIndexChange={c.onIndexChange}
          wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww} onWindowLevel={(wc, ww) => setMprWl({ wc, ww })}
          onWindowLevelReset={() => setMprWl(null)} presets={wlPresets}
          onPreset={(preset) => setMprWl(preset.reset ? null : { wc: preset.wc, ww: preset.ww })}
          crosshair={c.crosshair} onPlaneClick={c.onPlaneClick} referenceLines={c.referenceLines}
          freeSegment={showFreePlane ? sliceSegment(freePlane, mprVoxel, meta, id, c.index) : null}
          band={band} orientation={orientation}
          active={active} compact={compact} registerCapture={regPane(captureAs)} registerFit={regFit(captureAs)}
          annotationMode={c.annotationMode} annotationKind={c.annotationKind} annotationDraft={c.annotationDraft}
          onPlaneClickMm={c.onPlaneClickMm} onAnnotationKey={c.onAnnotationKey}
          annotationShapes={(box: Box) => shapesForSlice(annotations,
            c.annotationKind && c.annotationDraft.length > 0 ? { kind: c.annotationKind, points: c.annotationDraft } : null,
            id, c.index, meta, box, { compact, selected: selectedAnnotation })} />
      </Suspense>
    );
  };

  // La escena: 3D / volumen / oblicuo, o el corte axial mientras no hay malla.
  // Todo el cromo es HUD: lecturas en mono y grupos de conmutadores sin fondo,
  // en esquinas que no pisan las lecturas propias de SliceView (bl/br/tr).
  const renderScene = (ctx: PaneContext): ReactNode => {
    // `compact` es el tamaño de la celda; `isMain`, si es la principal: una
    // principal estrecha va compacta pero sigue siendo la activa.
    const { compact, isMain } = ctx;
    const isMesh = sceneHasMesh;
    // Dispositivos y bandas de perforantes comparten esquina: en el paso de
    // dispositivos pueden verse las dos cosas a la vez. Las bandas salen de
    // los radios del resultado, no de constantes de aquí.
    const br: HudLine[] = [];
    if (isMesh && showDevice) {
      for (const d of devices) {
        br.push({ text: DEVICE_LABEL[d.kind].toUpperCase(), color: `rgb(${d.color.map((c) => Math.round(c * 255)).join(",")})` });
      }
      if (showField && clipField) br.push(...legendLines(clipField.summary));
    }
    if (isMesh && meshUrl && visiblePerforators.length > 0 && (step === "morpho" || step === "treatment" || step === "devices")) {
      for (const b of perforatorBands) br.push({ text: b.label, color: b.color });
    }
    // Con leyenda abajo a la derecha, el recuadro del maniquí sube encima de ella.
    const insetRaised = !compact && br.length > 0;
    let body: ReactNode;
    let mode: string | null = null;
    // El cuerpo dibuja su propio HudFrame (esquinas y rótulo): el marco de la
    // escena no repite ni esquinas, ni rótulo, ni la lectura del modo.
    let bodyFramed = sceneIsSlice;
    if (viewMode === "oblique" && sessionId && meta) {
      // Sin WebGL2 o sin volumen en el cliente, el oblicuo del servidor (PNG),
      // que no trae marco: ese sí lleva el de la escena.
      if (legacy || !clientVol.image) {
        body = <ObliqueMprView sessionId={sessionId} wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww} />;
        mode = "OBLICUO";
      } else {
        // En PLANO la posición del cine es un desplazamiento, no un punto de la línea.
        const walkIndex = obliqueWalk === "vaso" ? (cinePosition("scene")?.index ?? 0) : 0;
        body = (
          <Suspense fallback={<ViewerLoading label="Cargando oblicuo…" />}>
            <ObliqueView image={clientVol.image} meta={meta} wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww}
              onWindowLevel={(wc, ww) => setMprWl({ wc, ww })} onWindowLevelReset={() => setMprWl(null)} active={isMain}
              registerCapture={registerMeshCapture} registerFit={regFit("scene")} overlay={cineBarFor("scene", compact)}
              walk={centerline ? { mode: obliqueWalk, index: walkIndex, count: centerline.points.length,
                                   diameterMm: 2 * (centerline.radiiMm[walkIndex] ?? 0) } : null}
              onWalkChange={setObliqueWalk}
              onStep={obliqueWalk === "vaso" && centerline ? (step) => { const i = currentTrackIndex() ?? 0; goToTrackIndex(applyStep(i, step, centerline.points.length)); } : undefined} />
          </Suspense>
        );
        bodyFramed = true;
      }
    } else if (isMesh) {
      body = (
        <Suspense fallback={<ViewerLoading label="Cargando visor 3D…" />}>
          <MeshView layers={layers} markers={markers} focus={focusMarker} planes={planes} lines={lines} labels={meshLabels} cropPreview={cropPreview}
            boxPreview={step === "segment" ? boxCut : null} referenceDiameterMm={referenceDiameterMm} pickMode={pickMode !== null} onPick={onPick} onPickMiss={onPickMiss} focusUrl={focusUrl} registerCapture={registerMeshCapture} registerCamera={registerCamera} registerParts={registerClipParts}
            preserveCamera={step === "devices"}
            handles={sceneHandles} onHandleDrag={onSceneHandleDrag} onHandleDoubleClick={onHandleDoubleClick}
            onLayerLoaded={onLayerLoaded} slicePlanes={slicePlanesProp}
            orientation={orientation} onCameraChange={onCameraChange} insetRaised={insetRaised} showInset={hudLevel !== "limpio"} />
        </Suspense>
      );
      mode = viewMode === "slices3d"
        ? (clientVol.image ? "CORTES 3D" : hasWebGL2() ? "CORTES 3D · CARGANDO VOLUMEN" : "CORTES 3D · SIN WEBGL2")
        : segPreview ? "3D · MALLA GRUESA" : "3D";
    } else if (sceneIsSlice) {
      body = renderPane("axial", ctx, "scene");
    } else {
      body = (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--hud-dim)" }}>
            {series ? "Cargando vista previa del volumen…" : "Carga una serie DICOM para comenzar"}
          </div>
        </div>
      );
    }

    // Arriba a la izquierda: el paso, el candidato y el estado de la vista previa.
    const tl: string[] = [STEP_SCENE[step]?.toUpperCase() ?? ""];
    if (candidate && (step === "detect" || (isMesh && focusUrl))) {
      tl.push(`${candidate.id} · Ø ${candidate.max_diameter_mm.toFixed(1)} mm`);
    }
    if (previewActive && previewBand) {
      const u = unitFor(meta?.modality);
      tl.push(`VISTA PREVIA · CAPTURA [${Math.round(previewBand[0])}${u}, ${Math.round(previewBand[1])}${u}]`);
    }
    if (meshScene && segPreview) tl.push("PULSA «SEGMENTAR» PARA LA MALLA FINAL");
    if (isMesh && gizmoOn && selectedClip) tl.push(gizmoReadout(selectedClip));

    // Leyendas de la escena 3D: cada línea lleva la muestra del color con que
    // la escena dibuja lo que nombra; sin ella, «Ø CUELLO» no dice cuál de los
    // trazos es el cuello. Los colores son los de MO_*_COLOR.
    const bl: HudLine[] = [];
    if (isMesh && overlay && morphometry) {
      // El cuello y lo que cuelga de él se anulan cuando no se pudo medir: la
      // leyenda lee la misma bandera que la tabla, para no anotar «Ø cuello
      // 0.0 mm» sobre la escena ni un cuello que la tabla da por no medido.
      if (morphometry.neck_valid !== false) {
        bl.push(
          { text: `Ø CUELLO ${morphometry.neck_mm.toFixed(1)} mm`, color: "rgb(51,191,255)" },
          { text: `H DOMO ${morphometry.dome_height_mm.toFixed(1)} mm`, color: "rgb(255,140,26)" },
        );
      }
      bl.push({ text: `Ø MÁX ${morphometry.max_diameter_mm.toFixed(1)} mm`, color: "rgb(217,51,51)" });
      if (morphometry.neck_valid !== false) bl.push(`AR ${morphometry.ar.toFixed(2)} · DNR ${morphometry.dnr.toFixed(2)}`);
    }
    // Los conmutadores van bajo la lectura de la izquierda: la derecha es de
    // la escalera de cortes y las lecturas de nivel. SINCRO y los demás
    // conmutadores del visor van en la banda de cabecera (ViewerHeader).
    const togglesTop = 22 + tl.length * 16 + 8;

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--viewer-bg)", overflow: "hidden" }}>
        {body}
        {/* Con el corte axial o el oblicuo dentro, su HudFrame ya dibuja esquinas
            y rótulo; aquí solo queda la lectura del paso (y, para el oblicuo, el
            nivel del volumen, que SliceView ya pinta por su cuenta). */}
        {bodyFramed ? (
          !compact && (
            <div className="hud">
              <HudReadout at="tl" lines={tl} />
            </div>
          )
        ) : (
          <HudFrame active={isMain} label={compact ? (mode ?? "ESCENA") : undefined}>
            {!compact && <HudReadout at="tl" lines={tl} />}
            {!compact && mode && <HudReadout at="tr" lines={[mode]} />}
            {!compact && bl.length > 0 && <HudReadout at="bl" lines={bl} />}
            {!compact && br.length > 0 && <HudReadout at="br" lines={br} />}
            {/* En la celda pequeña no cabe (el rumbo pisa las marcas): se lee al maximizar. */}
            {!compact && isMesh && <SceneHeading feed={cameraFeed} orientation={orientation} />}
            {/* El maniquí gris no puede ser la única señal de que la orientación
                es supuesta: una línea ámbar justo encima del recuadro, que sube
                con él cuando hay leyenda abajo a la derecha. */}
            {/* Solo con la meta ya llegada: sin ella la orientación no es
                «asumida», aún no se sabe. */}
            {isMesh && meta && !effectiveDirection(orientation).known && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: insetRaised ? "calc(48% - 18px)" : "calc(24% - 18px)" }}>
                <HudReadout at="br" lines={["ORIENTACIÓN ASUMIDA"]} tone="warn" />
              </div>
            )}
          </HudFrame>
        )}

        {!compact && sessionId && meta && !pickMode && (
          <div style={{ position: "absolute", top: togglesTop, left: 14, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, fontFamily: "var(--font-mono)" }}>
            {/* Cortes 3D solo con malla: sin ella la escena es el corte axial
                y no hay escena en la que colocar los cortes. */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <HudToggleGroup
                options={[
                  { key: "default", label: meshVisible ? "3D" : "MPR" },
                  ...(meshVisible ? [{ key: "slices3d", label: "Cortes 3D", title: "Los tres cortes en su posición dentro de la escena" }] : []),
                  { key: "oblique", label: "Oblicuo" },
                ]}
                value={viewMode === "slices3d" && !meshVisible ? "default" : viewMode} onChange={(k) => setViewMode(k as typeof viewMode)} />
              {viewMode === "slices3d" && isMesh && (
                <HudToggleGroup options={[{ key: "malla", label: slices3dMeshVisible ? "MALLA ●" : "MALLA ○",
                                            title: slices3dMeshVisible ? "Ocultar la malla para ver solo los cortes" : "Enseñar la malla translúcida" }]}
                  value={slices3dMeshVisible ? "malla" : ""} onChange={() => setSlices3dMeshVisible(!slices3dMeshVisible)} />
              )}
            </div>
            {/* Vistas estándar + reencuadre. Sin esto, perder la orientación
                rotando no tenía vuelta atrás. */}
            {isMesh && camera && (
              <HudToggleGroup
                label="VISTA ▸"
                options={[
                  ...CAMERA_BUTTONS.map(([key, label, title]) => ({ key, label, title })),
                  ...(lesion ? [{ key: "lesion", label: "LESIÓN", title: "Acercar la cámara a la lesión" }] : []),
                  ...(trajEntry && trajTarget ? [{ key: "abordaje", label: "ABORDAJE", title: "Mirar a lo largo del corredor; el plano Oblicuo se pone perpendicular a él" }] : []),
                ]}
                value="" onChange={(k) => (k === "lesion" ? centerOnLesion() : k === "abordaje" ? viewApproach() : camera.setView(k as CameraView))} />
            )}
            {/* Solo sin orientación en el DICOM: con ella no hay nada que fijar. */}
            {meta.orientation_known === false && (
              <HudToggleGroup
                options={[{ key: "fix", label: "Fijar orientación", title: "Decir dónde está anterior y cuál es el primer corte" }]}
                value={manualForSession ? "fix" : ""} onChange={() => setOrientationOpen(true)} />
            )}
          </div>
        )}

        {/* Aviso de marcado: pasa a «clic fuera» un momento si se falla la malla.
            `hud-prompt`: es la instrucción de una herramienta armada, no una
            lectura de esquina; se ve también en limpio. */}
        {pickMode && meshUrl && (
          <div className={`hud-readout hud-prompt${pickMiss ? " hud-err" : ""}`}
               style={{ top: 40, left: "50%", transform: "translateX(-50%)", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: pickMiss ? undefined : "var(--hud)", pointerEvents: "none", zIndex: 5 }}>
            {(pickMiss ? "Clic fuera de la malla — haz clic sobre la superficie 3D" : pickText(pickMode, annotationDraft.length, pickMode === "scissors" ? scissorsPoints.length : neckRim.length)).toUpperCase()}
            {"\nESC · CANCELAR"}
          </div>
        )}
      </div>
    );
  };

  const onLayoutKey = (e: ReactKeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    const p = presetForKey(e.code, e.target, e.altKey);
    if (p) { e.preventDefault(); setViewerLayout(setPreset(viewerLayout, p)); }
  };

  return (
    <div ref={viewerRef}
         style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      {sessionId && (
        <OrientationSheet open={orientationOpen} onClose={() => setOrientationOpen(false)} sessionId={sessionId}
          current={manualForSession} onApply={setOrientationManual} />
      )}
      {/* La cabecera del visor va en su propia banda, encima de la rejilla.
          Estuvo dentro de la celda principal, partida en dos grupos a izquierda
          y derecha, pero en un portátil de 1280 con DERECHA esa celda mide
          ~530 px y los dos grupos se pisaban entre sí y tapaban el rótulo de
          la vista (AXIAL, VOLUMEN…). Fuera de la celda no tapan nada y la
          rejilla toma el resto del alto. En 1280 la banda mide ~740 px: con
          CALOR encendido los grupos solo caben con los presets abreviados y
          «PRINCIPAL» reducido a «▸» (headerLabels). Mismas teclas Alt+1/2/3/4
          que la rejilla, para que el foco en un conmutador no las pierda.
          La banda vive en ViewerHeader, con su prueba. */}
      <ViewerHeader
        layout={viewerLayout} onLayoutChange={setViewerLayout} onKeyDown={onLayoutKey}
        planesHidden={planesHidden} onPlanesHiddenChange={setPlanesHidden}
        hudLevel={hudLevel} onHudLevelChange={changeHudLevel}
        syncViews={syncViews} onSyncViewsChange={setSyncViews}
        hasClipField={!!clipField} showClipField={showClipField} clipRehearsal={!!clipRehearsal}
        onShowClipFieldChange={setShowClipField} onHelp={openSheet}
        levelNote={levelNote} levelNoteShort={levelNoteShort} />
      <ShortcutsSheet open={sheetOpen} onClose={closeSheet} />
      {/* Alt+1/2/3 cambian la distribución mientras el foco está en el visor;
          nunca desde un campo de texto (presetForKey). Los dígitos solos son
          del salto de paso de Workspace, que ignora Alt. */}
      {/* `data-hud` en la rejilla y no en la raíz: la banda de cabecera queda
          fuera, y sus botones (HUD ▸ incluido) se ven en cualquier nivel. */}
      <div ref={gridHostRef} data-hud={hudLevel} style={{ flex: "1 1 0", position: "relative", minHeight: 0, overflow: "hidden" }}
           tabIndex={0}
           // Los lienzos de vtk.js y los cortes anulan la acción por defecto del
           // puntero, y con ella el foco: sin esto, pinchar en el visor dejaba
           // el foco donde estuviera (el botón de un paso), Alt+1 no llegaba al
           // visor y las teclas de corte no llegaban a la celda pinchada. Va a
           // la celda pinchada; fuera de toda celda, al contenedor. Un control
           // nativo se queda su foco (focusOnPointerDown).
           onPointerDownCapture={(e) => {
             // Arrastrar en la celda que reproduce es tomar el mando: el cine
             // se para. Pulsar su propia barra no cuenta.
             const c = cineRef.current, t = e.target as Element;
             if (c && e.button === 0 && !t.closest?.(".hud-cine")
                 && t.closest?.("[data-pane]")?.getAttribute("data-pane") === c.pane) setCine(null);
             focusOnPointerDown(e.target, e.currentTarget, document.activeElement)?.focus({ preventScroll: true });
           }}
           // Marcador en la malla 3D: vtk marca en el pointerdown y el panel
           // enfoca la nota; el mousedown que sigue enfocaría por defecto el
           // visor y se la quitaría (lo tecleado iría a los atajos). Solo en
           // la escena y con ese modo: en los cortes el punto va en el
           // mouseup y el foco ya lo pone onPointerDownCapture.
           onMouseDownCapture={(e) => {
             const t = e.target as Element;
             if (pickMode === "anot_marcador" && e.button === 0
                 && t.closest?.('[data-pane="scene"]') && !t.closest?.("input, select, textarea, button")) e.preventDefault();
           }}
           onKeyDown={onLayoutKey}>
        <ViewerGrid
          layout={viewerLayout}
          onLayoutChange={setViewerLayout}
          registerCell={registerCell}
          onPaneFocus={setFocusedPane}
          // La barra del cine va en la celda, no en la vista; salvo en la escena
          // (el oblicuo la pone encima de sus deslizadores) y en VOLUMEN (la
          // apila con la fila de preajustes para que no se pisen).
          renderPane={(id, ctx) => (
            <>
              {renderPane(id, ctx)}
              {id !== "scene" && id !== "mip" && cineBarFor(id, ctx.compact)}
            </>
          )}
          mainOverlay={
            <>
              {/* Pista de la principal: fuera de renderPane/renderScene porque
                  aplica igual a la escena 3D, el MIP o un corte. */}
              {/* La escena y VOLUMEN llevan cinta de rumbo arriba: la pista
                  baja para no cruzarla (`hud-hint-cinta`); en VOLUMEN además
                  va por debajo de la fila EJE · RECORTE (`hud-hint-vol`). */}
              {hint && <div key={hintSeq} className={`${hint.aviso ? "hud-hint hud-hint-aviso" : "hud-hint"}${hintPlace}`}>{hint.text}</div>}
              {levelHint && <div key={`nivel-${levelHint.seq}`} className={`hud-hint hud-hint-level${hintPlace}`}>{levelHint.text}</div>}
            </>
          }
        />
      </div>
    </div>
  );
}

/** La capa de un dispositivo. El stent sobre la línea central trae en su malla
 *  la distancia a la pared (`aposicion_mm`): rojo, separado; azul, comprimido;
 *  gris, dentro del ruido. Si la malla no lo trae (el stent recto), MeshView
 *  usa el color liso. */
/** La capa de un dispositivo con nombre, para que una recolocación sustituya
 *  solo su geometría (ver el comentario de los clips). El stent con mapa va sin
 *  nombre: su color sale de una escala que solo se monta al rehacer la escena,
 *  y cambiar de mapa (aposición ↔ cobertura) tiene que rehacerla. */
function namedDeviceLayer(d: { kind: "clips" | "coils" | "stent"; url: string; color: Vector3 }, map: StentMap): MeshLayer {
  const layer = deviceLayer(d, map);
  return layer.scalars ? layer : { ...layer, id: `device-${d.kind}` };
}

function deviceLayer(d: { kind: "clips" | "coils" | "stent"; url: string; color: Vector3 }, map: StentMap): MeshLayer {
  const layer: MeshLayer = { url: d.url, color: d.color, opacity: 1 };
  if (d.kind === "stent") {
    // La cobertura va cambiada de signo: el rojo es siempre «lo que hay que
    // mirar», y ahí es MENOS metal que en el catálogo (poros más abiertos).
    if (map === "coverage") {
      // El fragmento no viaja al servidor: solo hace que la escena vea otra
      // capa y la vuelva a pintar (se identifica por su URL).
      layer.url = `${d.url}#cobertura`;
      layer.scalars = { name: "cobertura_delta_pct", range: COVERAGE_RANGE_PP, deadband: COVERAGE_NOISE_PP, invert: true };
    } else {
      layer.scalars = { name: "aposicion_mm", range: APPOSITION_RANGE_MM, deadband: APPOSITION_NOISE_MM };
    }
  }
  return layer;
}

/** Texto del aviso de marcado para cada modo. */
function pickText(mode: NonNullable<PickMode>, draftCount: number, rimCount: number): string {
  switch (mode) {
    case "cl_source": return "Clic sobre el vaso para marcar el origen";
    case "cl_target": return "Clic sobre el vaso para marcar el destino";
    case "neck_origin": return "Clic sobre el cuello del aneurisma";
    case "neck_dome": return "Clic sobre el ápice del domo";
    case "neck_rim": return `Clic alrededor del borde del cuello (${rimCount}${rimCount < 3 ? " · faltan " + (3 - rimCount) : ""})`;
    case "scissors": return `Clic alrededor de la arteria, rodeándola (${rimCount}${rimCount < 3 ? " · faltan " + (3 - rimCount) : ""})`;
    case "crop_center": return "Clic sobre la malla para el centro del recorte";
    case "lesion_mark": return "Clic sobre la lesión";
    case "erase_piece": return "Clic sobre lo que quieres borrar";
    case "traj_entry": return "Clic para el punto de entrada del abordaje";
    case "traj_target": return "Clic sobre el aneurisma (punto diana)";
    case "anot_regla": return draftCount === 0 ? "Regla: clic en el primer punto" : "Regla: clic en el segundo punto";
    case "anot_angulo": return `Ángulo: clic en el ${["primer punto", "vértice", "tercer punto"][Math.min(draftCount, 2)]}`;
    case "anot_region": return `Región: clic en un corte alrededor del hallazgo (${draftCount} punto${draftCount === 1 ? "" : "s"}) · Intro o el primer punto cierra`;
    case "anot_marcador": return "Marcador: clic donde quieras la nota";
  }
}

/** A 0–1 click position back to a clamped voxel index. */
const clampIdx = (n: number, u: number) => Math.max(0, Math.min(n - 1, Math.round(u * (n - 1))));
