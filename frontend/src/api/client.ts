/* Thin typed client for the ProspectiveWeb FastAPI backend.
   All routes are same-origin in dev thanks to the Vite proxy. */

import type {
  AneurysmDetectionResult,
  AuditBlock,
  AuditVerifyResult,
  CeilingCompareRequest,
  CeilingCompareResult,
  CenterlineClearResult,
  CenterlineRequest,
  CenterlineResult,
  ClipAnimationResult,
  ClipOrder,
  ClipOrderIn,
  ClipOrderPrefill,
  ClipOrderSummary,
  NavarroShape,
  OrderStatus,
  Workshop,
  WorkshopIn,
  ClipLibraryItem,
  ClipPlanRequest,
  ClipPlanResult,
  ClipRecommendation,
  ClipSelectionResult,
  ClipShapeSuggestion,
  ClStentRequest,
  ClStentResult,
  CoilConstructResult,
  CoilLibraryItem,
  CoilPlacement,
  CoilPlanResult,
  CrossSectionRequest,
  CrossSectionResult,
  CustomClipInfo,
  CustomJawOut,
  DeviceClearResult,
  DeviceKind,
  ExportRequest,
  LibraryClip,
  LoginResponse,
  LongitudinalResult,
  ManufactureSpecOut,
  MeshCropRequest,
  MeshBounds,
  MeshComponentDeleteResult,
  MeshComponentList,
  MeshCropResult,
  MeshPlaneCutRequest,
  MeshPlaneCutResult,
  MeshHistoryResult,
  MeshRestoreResult,
  MeshRestoreScope,
  Position3D,
  RegionEraseResult,
  MorphometryResult,
  NeckPlaneRequest,
  PatientCreate,
  PatientDetail,
  PatientSessionInfo,
  PatientSummary,
  PendingUser,
  PerforatorsResult,
  PhasesRequest,
  PhasesResult,
  PreprocessRequest,
  PreprocessResult,
  PreprocessStatus,
  PreviewRequest,
  PreviewResult,
  PrintBed,
  PrintPrepRequest,
  PrintPrepResult,
  ReportRequest,
  ReportResult,
  SegmentRequest,
  SegmentResult,
  SeriesInfo,
  SessionRestoreResult,
  SessionSaveRequest,
  SessionSaveResult,
  SignupRequest,
  SignupResponse,
  StentLibraryItem,
  StentParams,
  StentPlanResult,
  StudyCard,
  StudyCreate,
  StudySummary,
  SuggestedBand,
  SuggestCorridorsRequest,
  SuggestCorridorsResult,
  TrajectoryRequest,
  TrajectoryResult,
  TreatmentDecisionRequest,
  TreatmentDecisionResult,
  UploadResult,
  UserAdminInfo,
  UserInfo,
  UserUpdate,
  VolumeMeta,
} from "./types";

const TOKEN_KEY = "prospective.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Notified when the server rejects our credentials, so the app can return to
 *  login instead of leaving the user clicking through per-panel errors with a
 *  token that expired underneath them. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** Endpoints where a 401 is the expected answer, not a dead session. */
function isAuthAttempt(path: string): boolean {
  return path.startsWith("/api/auth/login") || path.startsWith("/api/auth/signup");
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && !isAuthAttempt(path)) {
    // The token is gone or expired: drop it and let the app show the login
    // screen once, rather than surfacing an error in whichever panel asked.
    setToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/** Authenticated fetch returning the raw Blob (for images / documents that an
 *  <img src> or download link can't carry the JWT header for). */
async function getBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { headers });
  if (res.status === 401) {
    setToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
  return res.blob();
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

export const api = {
  /* auth */
  login: (username: string, password: string) =>
    post<LoginResponse>("/api/auth/login", { username, password }),
  me: () => get<UserInfo>("/api/auth/me"),
  logout: () => post<{ status: string }>("/api/auth/logout"),
  changePassword: (current_password: string, new_password: string) =>
    post<{ status: string }>("/api/auth/change-password", { current_password, new_password }),
  resetPassword: (userId: number, new_password: string) =>
    post<{ status: string }>(`/api/auth/users/${userId}/reset-password`, { new_password }),
  myPhotoObjectUrl: async () =>
    URL.createObjectURL(await getBlob("/api/auth/me/photo")),
  signup: (req: SignupRequest, photo?: File | null, cv?: File | null) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(req)) fd.append(k, v ?? "");
    if (photo) fd.append("photo", photo, photo.name);
    if (cv) fd.append("cv", cv, cv.name);
    return post<SignupResponse>("/api/auth/signup", fd);
  },
  listPending: () => get<PendingUser[]>("/api/auth/pending"),
  pendingPhotoObjectUrl: async (id: number) =>
    URL.createObjectURL(await getBlob(`/api/auth/pending/${id}/photo`)),
  downloadPendingCv: async (id: number, username: string) => {
    const url = URL.createObjectURL(await getBlob(`/api/auth/pending/${id}/cv`));
    const a = document.createElement("a");
    a.href = url; a.download = `CV_${username}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
  approvePending: (id: number) => post<{ status: string }>(`/api/auth/pending/${id}/approve`),
  rejectPending: (id: number) => post<{ status: string }>(`/api/auth/pending/${id}/reject`),
  listUsers: () => get<UserAdminInfo[]>("/api/auth/users"),
  createUser: (fields: Record<string, string>, photo?: File | null, cv?: File | null) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v ?? "");
    if (photo) fd.append("photo", photo, photo.name);
    if (cv) fd.append("cv", cv, cv.name);
    return post<UserAdminInfo>("/api/auth/users", fd);
  },
  updateUser: (id: number, u: UserUpdate) =>
    request<UserAdminInfo>(`/api/auth/users/${id}`, { method: "PUT", body: JSON.stringify(u), headers: { "Content-Type": "application/json" } }),
  deleteUser: (id: number) =>
    request<void>(`/api/auth/users/${id}`, { method: "DELETE" }),

  /* patients */
  listPatients: () => get<PatientSummary[]>("/api/patients"),
  createPatient: (p: PatientCreate) => post<PatientSummary>("/api/patients", p),
  patientStudies: (id: number) => get<StudySummary[]>(`/api/patients/${id}/studies`),
  createStudy: (patientId: number, s: StudyCreate) =>
    post<StudySummary>(`/api/patients/${patientId}/studies`, s),
  updateStudy: (patientId: number, studyId: number, s: StudyCreate) =>
    request<StudySummary>(`/api/patients/${patientId}/studies/${studyId}`, { method: "PUT", body: JSON.stringify(s), headers: { "Content-Type": "application/json" } }),
  deleteStudy: (patientId: number, studyId: number) =>
    request<void>(`/api/patients/${patientId}/studies/${studyId}`, { method: "DELETE" }),
  getPatient: (id: number) => get<PatientDetail>(`/api/patients/${id}`),
  updatePatient: (id: number, p: PatientCreate) =>
    request<PatientSummary>(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(p), headers: { "Content-Type": "application/json" } }),
  deletePatient: (id: number) =>
    request<void>(`/api/patients/${id}`, { method: "DELETE" }),
  patientSessions: (id: number) =>
    get<PatientSessionInfo[]>(`/api/patients/${id}/sessions`),

  /* dicom pipeline */
  upload: (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    return post<UploadResult>("/api/upload", form);
  },
  segment: (req: SegmentRequest) => post<SegmentResult>("/api/segment", req),
  suggestedBand: (sessionId: string) =>
    get<SuggestedBand>(`/api/segment/suggested-band/${sessionId}`),
  /** Segmenta y detecta CON y SIN techo del umbral y devuelve ambas listas.
   *  Cuesta dos segmentaciones y dos detecciones; no toca la malla de la
   *  sesión, así que elegir configuración es un paso aparte. */
  compareCeiling: (sessionId: string, req: CeilingCompareRequest) =>
    post<CeilingCompareResult>(`/api/segment/compare-ceiling/${sessionId}`, req),
  segmentPreview: (sessionId: string, req: PreviewRequest) =>
    post<PreviewResult>(`/api/segment/preview/${sessionId}`, req),
  /** Step the working mesh back: "undo" one crop/grow, or "original" for the
      mesh the segmentation produced. Cheap file ops — no re-segmentation. */
  meshRestore: (sessionId: string, scope: MeshRestoreScope) =>
    post<MeshRestoreResult>(`/api/mesh-restore/${sessionId}`, { scope }),
  meshHistory: (sessionId: string) =>
    get<MeshHistoryResult>(`/api/mesh-restore/${sessionId}`),
  meshCrop: (sessionId: string, req: MeshCropRequest) =>
    post<MeshCropResult>(`/api/mesh-crop/${sessionId}`, req),
  /** La caja de la malla, para dar recorrido real al deslizador del plano. */
  meshBounds: (sessionId: string) =>
    get<MeshBounds>(`/api/mesh-bounds/${sessionId}`),
  /** Corta por un plano y conserva un lado. No hace falta elegir un centro:
      una dirección y una altura. */
  meshPlaneCut: (sessionId: string, req: MeshPlaneCutRequest) =>
    post<MeshPlaneCutResult>(`/api/mesh-plane-cut/${sessionId}`, req),
  /** Las piezas conexas de la malla, la mayor primero. */
  meshComponents: (sessionId: string) =>
    get<MeshComponentList>(`/api/mesh-components/${sessionId}`),
  /** Borra de un clic la pieza que contiene el punto. El ruido angiográfico
      viene en piezas enteras, así que no hace falta un borrador de pintar. */
  /** Borra el tejido pegado alrededor del punto. Para el hueso que TOCA el
   *  árbol, donde el borrador de piezas no puede hacer nada. */
  meshEraseRegion: (sessionId: string, point: Position3D, radius_mm: number) =>
    post<RegionEraseResult>(`/api/mesh-erase-region/${sessionId}`, { point, radius_mm }),
  meshComponentDelete: (
    sessionId: string,
    point: { x: number; y: number; z: number },
    maxDistanceMm = 5,
  ) =>
    post<MeshComponentDeleteResult>(`/api/mesh-component-delete/${sessionId}`, {
      point, max_distance_mm: maxDistanceMm,
    }),
  detect: (sessionId: string) =>
    post<AneurysmDetectionResult>(`/api/detect/${sessionId}`),
  morphometry: (sessionId: string) =>
    get<MorphometryResult>(`/api/morphometry/${sessionId}`),
  morphometryNeckPlane: (sessionId: string, req: NeckPlaneRequest) =>
    post<MorphometryResult>(`/api/morphometry/${sessionId}/neck-plane`, req),
  perforators: (sessionId: string) =>
    get<PerforatorsResult>(`/api/perforators/${sessionId}`),
  longitudinal: (sessionId: string) =>
    get<LongitudinalResult>(`/api/longitudinal/${sessionId}`),
  phases: (req: PhasesRequest) => post<PhasesResult>("/api/phases", req),
  /** Drop the candidate domes and the morphometry derived from them (including a
      manually marked neck plane, which is otherwise reused by every later run). */
  clearDetection: (sessionId: string) =>
    request<{ status: string; candidate_meshes_removed: number }>(
      `/api/detect/${sessionId}`, { method: "DELETE" },
    ),
  centerline: (sessionId: string, req: CenterlineRequest) =>
    post<CenterlineResult>(`/api/centerline/${sessionId}`, req),
  /** Discard the centreline, its cached points and any stent built along it. */
  clearCenterline: (sessionId: string) =>
    request<CenterlineClearResult>(`/api/centerline/${sessionId}`, { method: "DELETE" }),
  crossSection: (sessionId: string, req: CrossSectionRequest) =>
    post<CrossSectionResult>(`/api/cross-section/${sessionId}`, req),
  deployClStent: (sessionId: string, req: ClStentRequest) =>
    post<ClStentResult>(`/api/cl-stent/${sessionId}`, req),
  setTrajectory: (sessionId: string, req: TrajectoryRequest) =>
    post<TrajectoryResult>(`/api/trajectory/${sessionId}`, req),
  /** Por dónde entrar: barre direcciones y devuelve las despejadas que además
   *  se pueden operar. Sin la orientación del paciente no propone nada. */
  suggestCorridors: (sessionId: string, req: SuggestCorridorsRequest = {}) =>
    post<SuggestCorridorsResult>(`/api/trajectory/${sessionId}/suggest`, req),
  clearTrajectory: (sessionId: string) =>
    request<void>(`/api/trajectory/${sessionId}`, { method: "DELETE" }),
  preprocess: (sessionId: string, req: PreprocessRequest) =>
    post<PreprocessResult>(`/api/preprocess/${sessionId}`, req),
  preprocessStatus: (sessionId: string) =>
    get<PreprocessStatus>(`/api/preprocess/${sessionId}`),
  /** Rebuild the volume from the DICOM still in the session — a full undo of the
      HU clip / resample / smooth, without re-uploading the study. */
  revertPreprocess: (sessionId: string) =>
    request<PreprocessResult>(`/api/preprocess/${sessionId}`, { method: "DELETE" }),
  printBeds: () => get<PrintBed[]>("/api/print-prep/beds"),
  printPrep: (sessionId: string, req: PrintPrepRequest) =>
    post<PrintPrepResult>(`/api/print-prep/${sessionId}`, req),

  /* MPR / DICOM slice preview */
  volumeMeta: (sessionId: string) => get<VolumeMeta>(`/api/volume/${sessionId}/meta`),
  volumeRawUrl: (sessionId: string) => `/api/volume/${sessionId}/raw`,
  sliceObliqueUrl: (sessionId: string, tilt: number, pos: number, axis: string, wc?: number, ww?: number) => {
    const q = new URLSearchParams({ tilt: String(tilt), pos: String(pos), axis });
    if (wc !== undefined) q.set("wc", String(Math.round(wc)));
    if (ww !== undefined) q.set("ww", String(Math.round(ww)));
    return `/api/slice-oblique/${sessionId}?${q.toString()}`;
  },
  sliceUrl: (sessionId: string, plane: string, index: number, wc?: number, ww?: number, band?: [number, number] | null) => {
    const q = new URLSearchParams();
    if (wc !== undefined) q.set("wc", String(Math.round(wc)));
    if (ww !== undefined) q.set("ww", String(Math.round(ww)));
    if (band) { q.set("lower", String(Math.round(band[0]))); q.set("upper", String(Math.round(band[1]))); }
    const qs = q.toString();
    return `/api/slice/${sessionId}/${plane}/${index}${qs ? `?${qs}` : ""}`;
  },

  /* treatment planning */
  /** Forget the recommendation, its clinical context and the PHASES score, so
      none of them reach the PDF describing morphometry that no longer exists. */
  clearTreatment: (sessionId: string) =>
    request<{ status: string }>(`/api/treatment-decision/${sessionId}`, { method: "DELETE" }),
  treatmentDecision: (req: TreatmentDecisionRequest) =>
    post<TreatmentDecisionResult>("/api/treatment-decision", req),
  listClips: () => get<ClipLibraryItem[]>("/api/clips"),
  clipRecommendations: (sessionId: string) =>
    get<ClipRecommendation[]>(`/api/clips/recommendations/${sessionId}`),
  planClips: (req: ClipPlanRequest) => post<ClipPlanResult>("/api/clips/plan", req),
  listCustomClips: (sessionId: string) =>
    get<CustomClipInfo[]>(`/api/clips/custom/${sessionId}`),
  /** Remove an imported clip from the session catalogue (geometry included). */
  deleteCustomClip: (sessionId: string, clipId: string) =>
    request<CustomClipInfo[]>(
      `/api/clips/custom/${sessionId}/${clipId.replace("custom:", "")}`,
      { method: "DELETE" },
    ),
  uploadCustomClip: (sessionId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return post<CustomClipInfo>(`/api/clips/custom/${sessionId}`, fd);
  },
  /** Criteria-based selection: what fits this case, or what to have made. */
  clipSelection: (sessionId: string, caseId?: number | null, verify = true) =>
    get<ClipSelectionResult>(
      `/api/clips/selection/${sessionId}?verify=${verify ? "true" : "false"}`
      + (caseId ? `&case_id=${caseId}` : ""),
    ),
  /** Generate the STL of the clip this case would need. */
  clipManufacture: (sessionId: string, caseId?: number | null) =>
    post<ManufactureSpecOut>(
      `/api/clips/manufacture/${sessionId}` + (caseId ? `?case_id=${caseId}` : ""),
      {},
    ),
  listClipLibrary: (kind?: "stock" | "made_to_order" | "template") =>
    get<LibraryClip[]>("/api/clip-library" + (kind ? `?kind=${kind}` : "")),
  /** Build a NAVARRO™ clip at any jaw length — drawn size or stretched. */
  buildNavarroClip: (
    sessionId: string, jawMm: number, angleDeg = 0,
    shape: NavarroShape = "straight", windowMm = 0,
  ) => {
    // La forma y la ventana viajan: sin ellas el endpoint solo podía construir
    // rectos y angulados, y una sugerencia fenestrada volvía como hoja maciza.
    const q = new URLSearchParams({
      jaw_mm: String(jawMm), angle_deg: String(angleDeg), shape,
    });
    if (windowMm > 0) q.set("window_mm", String(windowMm));
    return post<CustomJawOut>(`/api/clips/navarro/${sessionId}?${q}`, {});
  },
  /** Measure a mesh before importing, to pre-fill the form. */
  measureClipMesh: (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return post<ClipShapeSuggestion>("/api/clip-library/measure", fd);
  },
  addClipToLibrary: (file: File, spec: {
    name: string; kind: "stock" | "template"; shape: string;
    closing_force_g: number; fenestration_mm: number;
    manufacturer: string; notes: string;
  }) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    Object.entries(spec).forEach(([k, v]) => fd.append(k, String(v)));
    return post<LibraryClip>("/api/clip-library", fd);
  },
  deleteClipFromLibrary: (clipId: string) =>
    request<{ deleted: string }>(`/api/clip-library/${clipId}`, { method: "DELETE" }),
  /** The body + two blades, the hinge and the approach run, for the rehearsal. */
  clipAnimation: (sessionId: string, req: ClipPlanRequest) =>
    post<ClipAnimationResult>(`/api/clips/animation/${sessionId}`, req),

  /* ── Pedidos de clip ─────────────────────────────────────────────────── */

  /** Everything the form starts with, so nothing measured is retyped. */
  clipOrderPrefill: (sessionId: string, caseId?: number | null) =>
    get<ClipOrderPrefill>(
      `/api/clip-orders/prefill/${sessionId}` + (caseId ? `?case_id=${caseId}` : ""),
    ),
  listWorkshops: () => get<Workshop[]>("/api/clip-orders/workshops"),
  addWorkshop: (w: WorkshopIn) => post<Workshop>("/api/clip-orders/workshops", w),
  updateWorkshop: (id: string, w: WorkshopIn) =>
    request<Workshop>(`/api/clip-orders/workshops/${id}`, {
      method: "PUT", body: JSON.stringify(w),
    }),
  /** Solo admin: un taller borrado desaparece de la lista de todos. */
  deleteWorkshop: (id: string) =>
    request<{ deleted: boolean }>(`/api/clip-orders/workshops/${id}`, { method: "DELETE" }),
  /** Place the request. `sign: false` leaves a draft a resident can prepare. */
  createClipOrder: (sessionId: string, req: ClipOrderIn) =>
    post<ClipOrder>(`/api/clip-orders/${sessionId}`, req),
  listClipOrders: (opts: {
    sessionId?: string; openOnly?: boolean; patientId?: number; status?: string; q?: string;
  } = {}) => {
    const p = new URLSearchParams();
    if (opts.sessionId) p.set("session_id", opts.sessionId);
    if (opts.openOnly) p.set("open_only", "true");
    if (opts.patientId != null) p.set("patient_id", String(opts.patientId));
    if (opts.status) p.set("status", opts.status);
    if (opts.q) p.set("q", opts.q);
    const qs = p.toString();
    return get<ClipOrder[]>("/api/clip-orders" + (qs ? `?${qs}` : ""));
  },
  /** Cuántos pedidos hay en cada estado. */
  clipOrdersSummary: () => get<ClipOrderSummary>("/api/clip-orders/summary"),
  advanceClipOrder: (partNo: string, status: OrderStatus) =>
    post<ClipOrder>(`/api/clip-orders/${partNo}/status`, { status }),
  receiveClipOrder: (
    partNo: string, measured_jaw_mm: number, measured_force_g: number, notes = "",
  ) =>
    post<ClipOrder>(`/api/clip-orders/${partNo}/reception`,
                    { measured_jaw_mm, measured_force_g, notes }),
  verifyClipOrder: (partNo: string, accept_deviation_reason = "") =>
    post<ClipOrder>(`/api/clip-orders/${partNo}/verify`, { accept_deviation_reason }),
  rejectClipOrder: (partNo: string, reason: string) =>
    post<ClipOrder>(`/api/clip-orders/${partNo}/reject`, { reason }),
  deleteClipOrder: (partNo: string) =>
    request<{ deleted: boolean }>(`/api/clip-orders/${partNo}`, { method: "DELETE" }),
  /** The documents are behind auth: the order directory is private. */
  downloadClipOrderFile: async (
    partNo: string, what: "stl" | "dossier_internal" | "dossier_workshop" | "packet",
  ) => {
    const path = what === "packet"
      ? `/api/clip-orders/${partNo}/packet`
      : `/api/clip-orders/${partNo}/files/${what}`;
    const ext = what === "packet" ? "zip" : what === "stl" ? "stl" : "pdf";
    const url = URL.createObjectURL(await getBlob(path));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${partNo}_${what}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
  listCoils: () => get<CoilLibraryItem[]>("/api/coils"),
  /** El catálogo acotado al saco medido, con la secuencia enmarcado →
   *  relleno → acabado. Sin morfometría devuelve `feasible: false`. */
  coilRecommendations: (sessionId: string) =>
    get<CoilConstructResult>(`/api/coils/recommendations/${sessionId}`),
  planCoils: (sessionId: string, placements: CoilPlacement[]) =>
    post<CoilPlanResult>("/api/coils/plan", { session_id: sessionId, placements }),
  listStents: () => get<StentLibraryItem[]>("/api/stents"),
  /** Which device families still hold a plan (used after resuming a session). */
  placedDevices: (sessionId: string) =>
    get<DeviceClearResult>(`/api/devices/${sessionId}`),
  /** Remove a placed device family — mesh AND the record the report reads — so
      another device can be planned on a clean scene. Omit `kind` to clear all. */
  clearDevices: (sessionId: string, kind?: DeviceKind) =>
    request<DeviceClearResult>(
      `/api/devices/${sessionId}${kind ? `?kind=${kind}` : ""}`, { method: "DELETE" },
    ),
  planStent: (sessionId: string, stent: StentParams) =>
    post<StentPlanResult>("/api/plan", { session_id: sessionId, stent }),

  /* report & export */
  report: (req: ReportRequest) => post<ReportResult>("/api/report", req),
  dicomSr: (req: ReportRequest) => post<ReportResult>("/api/report/dicom-sr", req),
  exportStl: (req: ExportRequest) => post<ReportResult>("/api/export/stl", req),

  /* sessions */
  saveSession: (req: SessionSaveRequest) =>
    post<SessionSaveResult>("/api/sessions/save", req),
  restoreSession: (sessionId: string) =>
    post<SessionRestoreResult>(`/api/sessions/${sessionId}/restore`),
  /** Switch which DICOM series of the study the session works on. */
  setActiveSeries: (sessionId: string, seriesId: string) =>
    post<SeriesInfo>(`/api/upload/${sessionId}/series/${encodeURIComponent(seriesId)}`),

  /* study gallery */
  listStudies: (q = "", patientId?: number, caseId?: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (patientId != null) p.set("patient_id", String(patientId));
    if (caseId != null) p.set("case_id", String(caseId));
    const qs = p.toString();
    return get<StudyCard[]>(`/api/studies${qs ? `?${qs}` : ""}`);
  },
  /** Preview image; needs the JWT, so fetch as a blob and use an object URL. */
  studyThumbnailObjectUrl: async (studyId: number) =>
    URL.createObjectURL(await getBlob(`/api/studies/${studyId}/thumbnail`)),
  /** Archive the session's DICOM as a NEW imaging study of this clinical case. */
  archiveStudy: (caseId: number, sessionId: string) =>
    post<StudyCard>(`/api/studies/cases/${caseId}/archive?session_id=${encodeURIComponent(sessionId)}`),
  /** Restore an archived study into a fresh working session, series already
   *  scanned and activated — same payload shape as `upload`. */
  openStudy: (studyId: number) =>
    post<UploadResult>(`/api/studies/${studyId}/open`),

  /* audit (SkullChain) */
  auditBlocks: () => get<AuditBlock[]>("/api/audit/blocks"),
  auditVerify: () => get<AuditVerifyResult>("/api/audit/verify"),
};
