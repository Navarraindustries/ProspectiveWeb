/* Visor clínico — superficie de imagenología siempre negra.
   - Con malla segmentada: render 3D real (.vtp) con vtk.js.
   - Sin malla pero con volumen cargado: vista previa DICOM (MPR axial navegable).
   - Sin nada: placeholder honesto.
   Distribución 1+4: un panel principal y una franja de cuatro celdas (escena,
   axial, coronal, sagital, MIP); doble clic en una celda la sube al principal.
   Todas las celdas leen el mismo volumen del navegador. */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePlanning, type PickMode } from "../store/planning";
import type { CameraController, CameraView, MeshLayer, MeshMarker, MeshLine } from "./MeshView";
import { MprViewLegacy as MprView } from "./MprViewLegacy";
import { useClientVolume } from "./volume/useClientVolume";
import { useVolumeMeta } from "./useVolumeMeta";
import { hasWebGL2 } from "./webgl";
import { ObliqueMprView } from "./ObliqueMprView";
import { cameraHeading, voxelToMm, type Orientation, type Plane, type Vec3 } from "./geometry";
import { swapPane, type PaneId, type ViewerLayout } from "./layout";
import { captureWithLayout, type CaptureFn } from "./captureWithLayout";
import { HudFrame } from "./hud/HudFrame";
import { HudReadout, type HudLine } from "./hud/HudReadout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { HudHeadingTape } from "./hud/HudHeadingTape";
import { OrientationSheet } from "./OrientationSheet";
import { manualFromMeta, shouldSeed } from "./orientationSeed";
import { windowPresets } from "./windowPresets";
import type { Vector3 } from "@kitware/vtk.js/types";

// vtk.js (~1 MB) is only needed once a 3D mesh is shown, so load MeshView — and
// with it the whole vtk.js runtime — lazily. The landing/login/MPR-only views
// never pull it into their bundle.
const MeshView = lazy(() => import("./MeshView").then((m) => ({ default: m.MeshView })));
const VolumeView = lazy(() => import("./VolumeView").then((m) => ({ default: m.VolumeView })));
const SliceView = lazy(() => import("./SliceView").then((m) => ({ default: m.SliceView })));
const MipView = lazy(() => import("./MipView").then((m) => ({ default: m.MipView })));
const ObliqueView = lazy(() => import("./ObliqueView").then((m) => ({ default: m.ObliqueView })));

/* Pistas efímeras del panel principal (Task 14): qué gesto usar según lo que
   haya montado ahí. */
const HINT_TEXT: Record<"rotate" | "slice", string> = {
  rotate: "ARRASTRAR ROTA · RUEDA ZOOM · DOBLE CLIC EN UNA CELDA LA MAXIMIZA",
  slice: "RUEDA CORTE · CTRL+RUEDA ZOOM · ARRASTRAR VENTANA · SHIFT DESPLAZA",
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

const VESSEL_COLOR: Vector3 = [0.65, 0.7, 0.76];
const DOME_COLOR: Vector3 = [0.32, 0.55, 0.75];
/* El saco cerrado, en verde para no confundirlo con el localizador azul del
   candidato: aquel señala dónde mirar, este ES el cuerpo del aneurisma. */
const SAC_COLOR: Vector3 = [0.25, 0.80, 0.45];
const DEVICE_COLOR: Vector3 = [0.92, 0.82, 0.45];     // warm gold — placed clip
const COIL_COLOR: Vector3 = [0.85, 0.55, 0.85];       // orchid — packed coils
const STENT_COLOR: Vector3 = [0.55, 0.80, 0.95];      // steel blue — deployed stent
const DEVICE_LABEL: Record<"clips" | "coils" | "stent", string> = {
  clips: "clips", coils: "coils", stent: "stent",
};

/* Vistas del visor 3D, nombradas como los planos MPR del resto de la app.
   Un segundo clic en la misma vista la mira desde el lado opuesto. */
const CAMERA_BUTTONS: [CameraView, string, string][] = [
  ["fit", "Ajustar", "Reencuadrar la escena completa"],
  ["axial", "Ax", "Vista axial (desde superior)"],
  ["coronal", "Cor", "Vista coronal (desde anterior)"],
  ["sagital", "Sag", "Vista sagital (lateral)"],
];
const CENTERLINE_COLOR: Vector3 = [0.36, 0.85, 0.86]; // cyan — vessel centreline tube
const SOURCE_COLOR: Vector3 = [0.25, 0.73, 0.31];     // green — picked source endpoint
const TARGET_COLOR: Vector3 = [0.97, 0.32, 0.29];     // red — picked target endpoint
const MEASURE_COLOR: Vector3 = [0.98, 0.75, 0.18];    // amber — caliper rulers
const PENDING_COLOR: Vector3 = [0.98, 0.55, 0.10];    // orange — first measurement point
const NECK_ORIGIN_COLOR: Vector3 = [0.85, 0.35, 0.85]; // magenta — neck-plane point
const NECK_DOME_COLOR: Vector3 = [0.36, 0.85, 0.86];   // cyan — dome apex
const NECK_RIM_COLOR: Vector3 = [0.90, 0.45, 0.95];    // violet — marked neck rim
const CROP_CENTER_COLOR: Vector3 = [0.98, 0.60, 0.20]; // orange — crop ROI centre
const TRAJ_ENTRY_COLOR: Vector3 = [0.40, 0.80, 1.00];  // sky blue — approach entry
const TRAJ_TARGET_COLOR: Vector3 = [0.97, 0.32, 0.29]; // red — approach target
const TRAJ_LINE_COLOR: Vector3 = [0.55, 0.85, 1.00];   // light blue — approach corridor
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
    sessionId, segmentation, candidates, selectedCandidate, series, deviceMeshes,
    centerlineMesh, pickMode, clSource, clTarget, setPickMode, setClSource, setClTarget,
    neckOrigin, neckDome, setNeckOrigin, setNeckDome, neckRim, setNeckRim,
    measurements, measurePending, setMeasurements, setMeasurePending, previewBand, previewMeshUrl,
    cropCenter, setCropCenter, setErasePick,
    cropRadius, cropShape, cropInvert, planeCut, boxCut,
    trajEntry, trajTarget, setTrajEntry, setTrajTarget,
    morphometry, morphoOverlay, setCaptureViewport, perforators, visiblePerforators, perforatorZones,
    clipRehearsal, registerClipParts,
    mprWl, mprVoxel, setMprWl, setMprVoxel,
    viewerLayout, setViewerLayout, syncViews, setSyncViews, orientationManual, setOrientationManual,
    focusPoint, setFocusMm, setCenterOnLesion, volumeVersion,
  } = usePlanning();

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
  const candidate = candidates[selectedCandidate];

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
  // Un solo volumen en el navegador para las cinco celdas: la franja y el
  // principal leen el mismo vtkImageData, así que no se descarga dos veces ni
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
  const orientation: Orientation = { direction: meta?.direction ?? null, manual: manualForSession };
  const [orientationOpen, setOrientationOpen] = useState(false);
  const cameraFeed = useRef<CameraFeed>({ last: null, listener: null });
  const onCameraChange = useCallback((dir: Vec3, up: Vec3) => {
    const cam = { dir: [...dir] as Vec3, up: [...up] as Vec3 };
    cameraFeed.current.last = cam;
    cameraFeed.current.listener?.(cam);
  }, []);
  const levelNote = clientVol.level === "coarse"
    ? `RESOLUCIÓN REDUCIDA${clientVol.progress ? ` · ${clientVol.progress.done}/${clientVol.progress.total}` : ""}`
    : clientVol.error ? "SIN VOLUMEN COMPLETO" : null;
  // En una celda de la franja (~¼ del ancho) la nota larga se monta sobre el
  // rótulo del plano; allí basta con la forma corta.
  const levelNoteShort = clientVol.level === "coarse"
    ? `REDUCIDA${clientVol.progress ? ` ${clientVol.progress.done}/${clientVol.progress.total}` : ""}`
    : clientVol.error ? "SIN COMPLETO" : null;
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
  const [viewMode, setViewMode] = useState<"default" | "volume" | "oblique">("default");
  // Camera controller published by MeshView while its scene is on screen.
  const [camera, setCamera] = useState<CameraController | null>(null);
  const registerCamera = useCallback((c: CameraController | null) => setCamera(c), []);

  // Captura del 3D para el informe. MeshView registra aquí la suya (cuando
  // la escena ya está en pantalla); al store va una envoltura que, si la
  // escena está en la franja, la sube al principal para capturarla a tamaño
  // completo y luego deja la distribución como estaba (captureWithLayout.ts).
  const meshCapture = useRef<CaptureFn | null>(null);
  // Cada espera devuelve true cuando acepta la captura y deja de esperar.
  const captureWaiters = useRef<((fn: CaptureFn) => boolean)[]>([]);
  const registerMeshCapture = useCallback((fn: CaptureFn | null) => {
    meshCapture.current = fn;
    if (fn) captureWaiters.current = captureWaiters.current.filter((w) => !w(fn));
  }, []);
  // La envoltura es estable: lee la distribución y su setter por refs.
  const layoutRef = useRef<ViewerLayout>(viewerLayout);
  layoutRef.current = viewerLayout;
  const setLayoutRef = useRef(setViewerLayout);
  setLayoutRef.current = setViewerLayout;
  const captureScene = useCallback((): Promise<string | null> => {
    const before = layoutRef.current;
    // La captura de la celda de la franja, que se desmonta al subir: no vale.
    const stale = meshCapture.current;
    return captureWithLayout({
      sceneIsMain: () => layoutRef.current.main === "scene",
      current: () => meshCapture.current,
      promote: () => setLayoutRef.current(swapPane(before, "scene")),
      restore: () => setLayoutRef.current(before),
      waitForCapture: () => new Promise<CaptureFn | null>((resolve) => {
        // Una malla grande tarda en volver a cargarse; si ni así llega, el
        // informe sale sin imagen en lugar de quedarse colgado.
        const timer = setTimeout(() => {
          captureWaiters.current = captureWaiters.current.filter((w) => w !== waiter);
          resolve(null);
        }, 15000);
        const waiter = (fn: CaptureFn) => {
          if (fn === stale) return false;
          clearTimeout(timer);
          resolve(fn);
          return true;
        };
        captureWaiters.current.push(waiter);
      }),
      nextFrame: () => new Promise<void>((r) => requestAnimationFrame(() => r())),
    });
  }, []);
  const sceneHasMesh = viewMode === "default" && meshVisible;
  useEffect(() => {
    setCaptureViewport(sceneHasMesh ? captureScene : null);
  }, [sceneHasMesh, captureScene, setCaptureViewport]);
  useEffect(() => () => setCaptureViewport(null), [setCaptureViewport]);
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
  const showDevice = step === "devices" && devices.length > 0;
  const showCenterline = !!centerlineMesh && centerlineMesh.startsWith("/data/");

  const layers = useMemo<MeshLayer[]>(() => {
    if (!displayMeshUrl) return [];
    const vesselDim = step === "detect" || step === "morpho" || showDevice || pickMode !== null || showCenterline;
    const out: MeshLayer[] = [{ url: displayMeshUrl, color: VESSEL_COLOR, opacity: vesselDim ? 0.45 : 1 }];
    // En Morfometría se marcan el cuello y el ápice PINCHANDO la superficie, y
    // una mancha opaca encima tapa justo el sitio donde hay que pinchar. Así
    // que ahí el resalte se vuelve translúcido: sigue diciendo dónde está, y
    // deja ver el relieve por debajo.
    const marcando = step === "morpho" || pickMode !== null;
    const resalte = showDevice ? 0.5 : marcando ? 0.35 : 1;

    // El saco cerrado manda sobre el localizador: en cuanto está marcado el
    // cuello hay una malla que SÍ es el cuerpo del aneurisma, y enseñar las
    // dos a la vez volvería a mezclar «dónde mirar» con «qué es».
    const sacUrl = morphometry?.sac_mesh_url;
    if (sacUrl && step !== "segment" && step !== "upload") {
      out.push({ url: sacUrl, color: SAC_COLOR, opacity: resalte, id: "sac" });
    } else if (candidate?.dome_mesh_url && step !== "segment" && step !== "upload") {
      out.push({ url: candidate.dome_mesh_url, color: DOME_COLOR, opacity: resalte });
    }
    // While rehearsing, the placed clip is replaced by its three moving parts:
    // showing both would put two clips on screen, one of them frozen.
    if (clipRehearsal) {
      out.push({ url: clipRehearsal.body_url,    color: DEVICE_COLOR, opacity: 1, id: "clip-body" });
      out.push({ url: clipRehearsal.blade_a_url, color: DEVICE_COLOR, opacity: 1, id: "clip-blade-a" });
      out.push({ url: clipRehearsal.blade_b_url, color: DEVICE_COLOR, opacity: 1, id: "clip-blade-b" });
      for (const d of devices) if (d.kind !== "clips") out.push({ url: d.url, color: d.color, opacity: 1 });
    } else if (showDevice) {
      for (const d of devices) out.push({ url: d.url, color: d.color, opacity: 1 });
    }
    if (showCenterline && centerlineMesh) {
      out.push({ url: centerlineMesh, color: CENTERLINE_COLOR, opacity: 1 });
    }
    return out;
  }, [displayMeshUrl, candidate?.dome_mesh_url, morphometry?.sac_mesh_url, step, showDevice, devices, showCenterline, centerlineMesh, pickMode, clipRehearsal]);

  const markers = useMemo<MeshMarker[]>(() => {
    const out: MeshMarker[] = [];
    if (clSource) out.push({ pos: clSource, color: SOURCE_COLOR });
    if (clTarget) out.push({ pos: clTarget, color: TARGET_COLOR });
    if (measurePending) out.push({ pos: measurePending, color: PENDING_COLOR });
    if (neckOrigin) out.push({ pos: neckOrigin, color: NECK_ORIGIN_COLOR });
    if (neckDome) out.push({ pos: neckDome, color: NECK_DOME_COLOR });
    for (const r of neckRim) out.push({ pos: r, color: NECK_RIM_COLOR });
    if (cropCenter) out.push({ pos: cropCenter, color: CROP_CENTER_COLOR });
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
  }, [clSource, clTarget, measurePending, neckOrigin, neckDome, neckRim, cropCenter, trajEntry, trajTarget, overlay, perforators, visiblePerforators]);

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
    const out: MeshLine[] = measurements
      .filter((m) => m.visible)
      .map((m) => ({ a: m.a, b: m.b, color: MEASURE_COLOR }));
    if (trajEntry && trajTarget) out.push({ a: trajEntry, b: trajTarget, color: TRAJ_LINE_COLOR });
    if (overlay) out.push(...overlay.lines);
    return out;
  }, [measurements, trajEntry, trajTarget, overlay]);

  // Translucent preview of the crop ROI so the user SEES what will be kept
  // (cyan) or removed (red) before applying — the crop is otherwise blind.
  const cropPreview = useMemo(
    () => (cropCenter && step === "segment")
      ? { center: cropCenter, radius: cropRadius, shape: cropShape, invert: cropInvert }
      : null,
    [cropCenter, cropRadius, cropShape, cropInvert, step],
  );

  // El plano se convierte en un recorte del render: la normal apunta al lado
  // que SE CONSERVA, así que invertirla enseña exactamente lo contrario.
  const planePreview = useMemo(() => {
    if (!planeCut || step !== "segment") return null;
    const eje = { x: 0, y: 1, z: 2 }[planeCut.axis];
    const n: [number, number, number] = [0, 0, 0];
    n[eje] = planeCut.keepPositive ? 1 : -1;
    const o: [number, number, number] = [0, 0, 0];
    o[eje] = planeCut.offset;
    return { origin: o, normal: n };
  }, [planeCut, step]);

  // Con la sincronización activa, un pick 3D o un clic en un corte mueven el
  // foco común; sin ella, los cortes siguen enlazados por mprVoxel y las
  // cámaras 3D no se mueven.
  const focusFromMm = useCallback((mm: Vec3) => { if (meta && syncViews) setFocusMm(mm, meta); }, [meta, syncViews, setFocusMm]);

  // La cámara 3D sigue al foco sin cambiar el zoom. También al registrarse
  // una escena nueva (cambio de paso, subir la escena al principal). El MIP no
  // mueve su cámara: su corte ya sale de mprVoxel.
  useEffect(() => { if (focusPoint && syncViews) camera?.focus(focusPoint); }, [focusPoint, syncViews, camera]);

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
    const c = candidates[selectedCandidate];
    if (c && syncViews && meta && step === "detect") setFocusMm([c.center_mm.x, c.center_mm.y, c.center_mm.z], meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidate, candidates, step, meta]);

  // Entrar en Morfometría o Dispositivos con el cuello medido → foco.
  useEffect(() => {
    const n = morphometry?.neck_origin;
    if (n && syncViews && meta && (step === "morpho" || step === "devices")) setFocusMm([n.x, n.y, n.z], meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, morphometry?.neck_origin, meta]);

  // «Centrar en la lesión»: el cuello medido si lo hay; si no, el candidato.
  const neck = morphometry?.neck_origin;
  const lesion: Vec3 | null = neck
    ? [neck.x, neck.y, neck.z]
    : candidate ? [candidate.center_mm.x, candidate.center_mm.y, candidate.center_mm.z] : null;
  const centerOnLesion = () => {
    if (!lesion || !meta) return;
    setFocusMm(lesion, meta);
    camera?.frame(lesion, 30);
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

  const onPick = useCallback(
    (xyz: [number, number, number]) => {
      // Cualquier punto marcado en el 3D es también el nuevo foco común.
      focusFromMm(xyz);
      if (pickMode === "cl_source") { setClSource(xyz); setPickMode(null); }
      else if (pickMode === "cl_target") { setClTarget(xyz); setPickMode(null); }
      else if (pickMode === "neck_origin") { setNeckOrigin(xyz); setPickMode(null); }
      else if (pickMode === "neck_dome") { setNeckDome(xyz); setPickMode(null); }
      else if (pickMode === "crop_center") { setCropCenter(xyz); setPickMode(null); }
      // Sigue armado: borrar una pieza y tener que rearmar para la siguiente
      // convierte una limpieza de diez clics en veinte.
      else if (pickMode === "erase_piece") { setErasePick(xyz); }
      else if (pickMode === "traj_entry") { setTrajEntry(xyz); setPickMode(null); }
      else if (pickMode === "traj_target") { setTrajTarget(xyz); setPickMode(null); }
      // Also stays armed: the rim needs at least three points to define a plane.
      else if (pickMode === "neck_rim") { setNeckRim([...neckRim, xyz]); }
      else if (pickMode === "measure") {
        if (!measurePending) {
          setMeasurePending(xyz);           // first click — wait for the second
        } else {
          const d = Math.hypot(xyz[0] - measurePending[0], xyz[1] - measurePending[1], xyz[2] - measurePending[2]);
          const nextId = (measurements.reduce((mx, m) => Math.max(mx, m.id), 0)) + 1;
          setMeasurements([...measurements, { id: nextId, a: measurePending, b: xyz, distance: d, label: `M${nextId}`, visible: true }]);
          setMeasurePending(null);
          setPickMode(null);
        }
      }
    },
    [pickMode, measurePending, measurements, setClSource, setClTarget, setNeckOrigin, setNeckDome, setCropCenter, setErasePick, setTrajEntry, setTrajTarget, setPickMode, setMeasurePending, setMeasurements, focusFromMm],
  );

  // Un marcado se hace sobre la malla: si la escena está en la franja, sube al
  // principal, porque en una celda de ~235 px ni se apunta ni se lee el aviso.
  useEffect(() => {
    if (pickMode !== null && viewerLayout.main !== "scene") setViewerLayout(swapPane(viewerLayout, "scene"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickMode]);

  // Configuración por plano. El eje vertical de coronal/sagital es 1 − f(z)
  // porque se ven con superior arriba (como los PNG); axial no se voltea. Las
  // líneas de referencia van en las mismas coordenadas que el crosshair: en
  // cada plano marcan dónde lo cortan los otros dos.
  const f = (n: number, i: number) => (n > 1 ? i / (n - 1) : 0.5);
  const planeCfg = (plane: Plane) => {
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
  const sceneIsSlice = viewMode === "default" && !meshVisible && !!sessionId && !!meta;
  const mainIsSlice = viewerLayout.main === "axial" || viewerLayout.main === "coronal"
    || viewerLayout.main === "sagital" || (viewerLayout.main === "scene" && sceneIsSlice);

  // La pista del panel principal ocupaba la esquina para siempre; ahora aparece
  // 3 s cuando cambia lo que hay en él y se desvanece (la animación de
  // .hud-hint dura lo mismo). El texto depende de si el principal es girable
  // (3D o MIP) o un corte; en cualquier otro caso (volumen sin malla, oblicuo,
  // sin sesión) no hay nada que enseñar. «?» la vuelve a mostrar.
  const mainRotatable = viewerLayout.main === "mip"
    || (viewerLayout.main === "scene" && ((viewMode === "default" && meshVisible) || viewMode === "volume"));
  const hintKind: "rotate" | "slice" | null = mainRotatable ? "rotate" : mainIsSlice ? "slice" : null;
  const [hint, setHint] = useState<string | null>(null);
  // La animación de desvanecido corre una vez, al montar el div: reaparecer con
  // «?» necesita un nodo nuevo (de ahí `key`) o se vería ya apagada.
  const [hintSeq, setHintSeq] = useState(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((kind: "rotate" | "slice") => {
    setHint(HINT_TEXT[kind]);
    setHintSeq((n) => n + 1);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3000);
  }, []);
  useEffect(() => {
    if (hintKind) showHint(hintKind);
    else setHint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKind]);
  useEffect(() => {
    const onHint = () => { if (hintKind) showHint(hintKind); };
    window.addEventListener("viewer:hint", onHint);
    return () => window.removeEventListener("viewer:hint", onHint);
  }, [hintKind, showHint]);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  // Los preajustes de ventana van junto a la lectura W/L del corte que ocupa
  // el panel principal, nunca en una celda de la franja: allí no hay lectura
  // W/L y el desplegable tapaba la etiqueta inferior. Qué preajustes hay lo
  // decide Task 14.
  const wlHost: PaneId | null = !sessionId || !meta || !mainIsSlice ? null : viewerLayout.main;
  // Fuera de TC no hay presets HU con sentido clínico: se derivan de la meta
  // y de la banda activa (vista previa de segmentación, o el umbral guardado
  // si ya no hay vista previa) para que «Vasos» siga el umbral real.
  const wlPresets = meta
    ? windowPresets(meta, previewBand ?? (segmentation?.threshold_lower != null ? [segmentation.threshold_lower, NaN] : null))
    : [];
  const wlSelect = (
    <select
      className="hud-toggle"
      title="Preajuste de ventana/nivel"
      value=""
      onChange={(e) => {
        const p = wlPresets.find((x) => x.name === e.target.value);
        if (p) setMprWl({ wc: p.wc, ww: p.ww });
      }}
      // Abrir el desplegable no debe maximizar la celda.
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", bottom: 3, right: 24, zIndex: 6, width: 96, background: "transparent", border: "none", color: "var(--hud-dim)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}
    >
      {/* El select es transparente para no tapar la imagen; las opciones
          llevan fondo propio porque el desplegable hereda el del select. */}
      <option value="" disabled style={{ background: "#000" }}>Preajuste</option>
      {wlPresets.map((p) => (
        <option key={p.name} value={p.name} style={{ background: "#000", color: "var(--hud)" }}>{p.name} · {p.wc}/{p.ww}</option>
      ))}
    </select>
  );

  const renderPane = (id: PaneId, slot: "main" | "strip"): ReactNode => {
    const compact = slot === "strip";
    if (id === "scene") return renderScene(compact);
    if (id === "mip") {
      // El MIP necesita el volumen en el navegador (WebGL2 + vtkImageData);
      // sin él la celda dice por qué está vacía en lugar de quedarse negra.
      if (!meta || !clientVol.image) {
        return (
          <HudFrame label="MIP" active={slot === "main"}>
            <HudReadout at="bl" lines={[meta && hasWebGL2() && !clientVol.error ? "CARGANDO…" : "SIN VOLUMEN"]} />
          </HudFrame>
        );
      }
      // Recorta según el corte que se está recorriendo: el del panel principal
      // si es coronal o sagital; si no (axial, 3D, MIP), el axial.
      const mipPlane: Plane = viewerLayout.main === "coronal" || viewerLayout.main === "sagital" ? viewerLayout.main : "axial";
      return (
        <Suspense fallback={<ViewerLoading label="Cargando MIP…" />}>
          <MipView image={clientVol.image} meta={meta} orientation={orientation} compact={compact} mainPlane={mipPlane} />
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
          crosshair={c.crosshair} onPlaneClick={c.onPlaneClick} referenceLines={c.referenceLines}
          band={band} orientation={orientation} levelNote={compact ? levelNoteShort : levelNote}
          active={slot === "main"} compact={compact} />
      </Suspense>
    );
  };

  // La escena: 3D / volumen / oblicuo, o el corte axial mientras no hay malla.
  // Todo el cromo es HUD: lecturas en mono y grupos de conmutadores sin fondo,
  // en esquinas que no pisan las lecturas propias de SliceView (bl/br/tr).
  const renderScene = (compact: boolean): ReactNode => {
    const isMesh = viewMode === "default" && meshVisible;
    // Dispositivos y bandas de perforantes comparten esquina: en el paso de
    // dispositivos pueden verse las dos cosas a la vez. Las bandas salen de
    // los radios del resultado, no de constantes de aquí.
    const br: HudLine[] = [];
    if (isMesh && showDevice) {
      for (const d of devices) {
        br.push({ text: DEVICE_LABEL[d.kind].toUpperCase(), color: `rgb(${d.color.map((c) => Math.round(c * 255)).join(",")})` });
      }
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
    if (viewMode === "volume" && sessionId && meta) {
      body = <Suspense fallback={<ViewerLoading label="Cargando volumen 3D…" />}><VolumeView sessionId={sessionId} /></Suspense>;
      mode = "VOLUMEN";
    } else if (viewMode === "oblique" && sessionId && meta) {
      // Sin WebGL2 o sin volumen en el cliente, el oblicuo del servidor (PNG),
      // que no trae marco: ese sí lleva el de la escena.
      if (legacy || !clientVol.image) {
        body = <ObliqueMprView sessionId={sessionId} wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww} />;
        mode = "OBLICUO";
      } else {
        body = (
          <Suspense fallback={<ViewerLoading label="Cargando oblicuo…" />}>
            <ObliqueView image={clientVol.image} meta={meta} wc={mprWl?.wc ?? meta.wc} ww={mprWl?.ww ?? meta.ww}
              onWindowLevel={(wc, ww) => setMprWl({ wc, ww })} active={!compact} />
          </Suspense>
        );
        bodyFramed = true;
      }
    } else if (isMesh) {
      body = (
        <Suspense fallback={<ViewerLoading label="Cargando visor 3D…" />}>
          <MeshView layers={layers} markers={markers} lines={lines} cropPreview={cropPreview} planePreview={planePreview}
            boxPreview={step === "segment" ? boxCut : null} referenceDiameterMm={referenceDiameterMm} pickMode={pickMode !== null} onPick={onPick} onPickMiss={onPickMiss} focusUrl={focusUrl} registerCapture={registerMeshCapture} registerCamera={registerCamera} registerParts={registerClipParts}
            orientation={orientation} onCameraChange={onCameraChange} insetRaised={insetRaised} />
        </Suspense>
      );
      mode = segPreview ? "3D · MALLA GRUESA" : "3D";
    } else if (sceneIsSlice) {
      body = renderPane("axial", compact ? "strip" : "main");
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
    if (previewActive && previewBand) tl.push(`VISTA PREVIA · CAPTURA [${Math.round(previewBand[0])}, ${Math.round(previewBand[1])}]`);
    if (viewMode === "default" && segPreview) tl.push("PULSA «SEGMENTAR» PARA LA MALLA FINAL");

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
    // la escalera de cortes, las lecturas de nivel y SINCRO.
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
              {!sceneIsSlice && levelNote && <HudReadout at="tr" lines={[levelNote]} tone="warn" />}
            </div>
          )
        ) : (
          <HudFrame active={!compact} label={compact ? (mode ?? "ESCENA") : undefined}>
            {!compact && <HudReadout at="tl" lines={tl} />}
            {!compact && mode && <HudReadout at="tr" lines={[mode]} />}
            {/* El nivel del volumen, una línea más abajo y en ámbar. */}
            {!compact && levelNote && (
              <div style={{ position: "absolute", inset: 0, top: 16 }}><HudReadout at="tr" lines={[levelNote]} tone="warn" /></div>
            )}
            {!compact && bl.length > 0 && <HudReadout at="bl" lines={bl} />}
            {!compact && br.length > 0 && <HudReadout at="br" lines={br} />}
            {/* En la celda pequeña no cabe (el rumbo pisa las marcas): se lee al maximizar. */}
            {!compact && isMesh && <SceneHeading feed={cameraFeed} orientation={orientation} />}
          </HudFrame>
        )}

        {!compact && sessionId && meta && !pickMode && (
          <div style={{ position: "absolute", top: togglesTop, left: 14, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, fontFamily: "var(--font-mono)" }}>
            <HudToggleGroup
              options={[{ key: "default", label: meshVisible ? "3D" : "MPR" }, { key: "volume", label: "Volumen" }, { key: "oblique", label: "Oblicuo" }]}
              value={viewMode} onChange={(k) => setViewMode(k as typeof viewMode)} />
            {/* Vistas estándar + reencuadre. Sin esto, perder la orientación
                rotando no tenía vuelta atrás. */}
            {isMesh && camera && (
              <HudToggleGroup
                options={[
                  ...CAMERA_BUTTONS.map(([key, label, title]) => ({ key, label, title })),
                  ...(lesion ? [{ key: "lesion", label: "LESIÓN", title: "Centrar en la lesión (encuadre de 30 mm)" }] : []),
                ]}
                value="" onChange={(k) => (k === "lesion" ? centerOnLesion() : camera.setView(k as CameraView))} />
            )}
            {/* Solo sin orientación en el DICOM: con ella no hay nada que fijar. */}
            {meta.orientation_known === false && (
              <HudToggleGroup
                options={[{ key: "fix", label: "Fijar orientación", title: "Decir dónde está anterior y cuál es el primer corte" }]}
                value={manualForSession ? "fix" : ""} onChange={() => setOrientationOpen(true)} />
            )}
          </div>
        )}

        {/* Aviso de marcado: pasa a «clic fuera» un momento si se falla la malla. */}
        {pickMode && meshUrl && (
          <div className={`hud-readout${pickMiss ? " hud-err" : ""}`}
               style={{ top: 40, left: "50%", transform: "translateX(-50%)", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: pickMiss ? undefined : "var(--hud)", pointerEvents: "none", zIndex: 5 }}>
            {(pickMiss ? "Clic fuera de la malla — haz clic sobre la superficie 3D" : pickText(pickMode, measurePending !== null, neckRim.length)).toUpperCase()}
            {"\nESC · CANCELAR"}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      {sessionId && (
        <OrientationSheet open={orientationOpen} onClose={() => setOrientationOpen(false)} sessionId={sessionId}
          current={manualForSession} onApply={setOrientationManual} />
      )}
      <div style={{ flex: 1, position: "relative", background: "#000", minHeight: 0, overflow: "hidden" }}>
        {renderPane(viewerLayout.main, "main")}
        {wlHost === viewerLayout.main && wlSelect}
        {/* Pista del panel principal: fuera de renderPane/renderScene porque
            aplica igual a la escena 3D, el MIP o un corte. */}
        {hint && <div key={hintSeq} className="hud-hint">{hint}</div>}
        {/* Arriba del todo (top 2) para no pisar las lecturas `tr` de la celda,
            que empiezan a 22 px; a 24 px del borde, fuera de la marca de esquina. */}
        <div style={{ position: "absolute", top: 2, right: 24, zIndex: 6, lineHeight: 1.2, fontFamily: "var(--font-mono)" }}>
          <HudToggleGroup options={[{ key: "sync", label: syncViews ? "SINCRO ●" : "SINCRO ○", title: "Centrar todas las vistas en el punto" }]}
            value={syncViews ? "sync" : ""} onChange={() => setSyncViews(!syncViews)} />
        </div>
      </div>
      <div className="mpr-strip" style={{ height: "clamp(160px, 26vh, 240px)", flexShrink: 0, display: "flex", gap: 1, background: "var(--hud-dim)" }}>
        {viewerLayout.strip.map((id) => (
          <div key={id} style={{ flex: 1, position: "relative", minWidth: 0, background: "#000", overflow: "hidden" }}
               onDoubleClick={() => setViewerLayout(swapPane(viewerLayout, id))}
               title="Doble clic: maximizar">
            {renderPane(id, "strip")}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Texto del aviso de marcado para cada modo. */
function pickText(mode: NonNullable<PickMode>, measurePending: boolean, rimCount: number): string {
  switch (mode) {
    case "cl_source": return "Clic sobre el vaso para marcar el origen";
    case "cl_target": return "Clic sobre el vaso para marcar el destino";
    case "neck_origin": return "Clic sobre el cuello del aneurisma";
    case "neck_dome": return "Clic sobre el ápice del domo";
    case "neck_rim": return `Clic alrededor del borde del cuello (${rimCount}${rimCount < 3 ? " · faltan " + (3 - rimCount) : ""})`;
    case "crop_center": return "Clic sobre la malla para el centro del recorte";
    case "erase_piece": return "Clic sobre la pieza que quieres borrar";
    case "traj_entry": return "Clic para el punto de entrada del abordaje";
    case "traj_target": return "Clic sobre el aneurisma (punto diana)";
    case "measure": return measurePending ? "Clic en el segundo punto" : "Clic en el primer punto";
  }
}

/** A 0–1 click position back to a clamped voxel index. */
const clampIdx = (n: number, u: number) => Math.max(0, Math.min(n - 1, Math.round(u * (n - 1))));
