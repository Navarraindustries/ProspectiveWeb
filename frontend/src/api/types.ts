/* TypeScript mirror of the backend Pydantic models (backend/models/*.py).
   Field names match the JSON contract exactly — see openapi.json. */

/* ── auth ──────────────────────────────────────────────────────────────── */
export interface UserInfo {
  id: number;
  username: string;
  full_name: string;
  role: string;
  institution: string;
  avatar_initials: string;
  has_photo?: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
}

export interface SignupRequest {
  username: string;
  password: string;
  full_name: string;
  national_id?: string;
  professional_id?: string;
  specialty?: string;
  university?: string;
  hospital?: string;
  position?: string;
  orcid?: string;
}

export interface SignupResponse {
  status: string;
  message: string;
}

export interface PendingUser {
  id: number;
  username: string;
  full_name: string;
  national_id: string;
  professional_id: string;
  specialty: string;
  university: string;
  hospital: string;
  position: string;
  orcid: string;
  has_photo: boolean;
  has_cv: boolean;
  created_at: string;
}

export interface UserAdminInfo {
  id: number;
  username: string;
  full_name: string;
  role: string;
  status: string;
  is_active: boolean;
  specialty: string;
  hospital: string;
  has_photo: boolean;
  has_cv: boolean;
  created_at: string;
}

export interface UserUpdate {
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

/* ── PHASES score ──────────────────────────────────────────────────────── */
export type PhasesPopulation = "other" | "japan" | "finland";
export type PhasesSite = "ica" | "mca" | "aca_pcom_posterior";

export interface PhasesRequest {
  /** Records the score in the session so it reaches the report and the DICOM SR. */
  session_id?: string | null;
  population: PhasesPopulation;
  hypertension: boolean;
  age_years: number;
  size_mm: number;
  earlier_sah: boolean;
  site: PhasesSite;
}

export interface PhasesResult {
  population_pts: number;
  hypertension_pts: number;
  age_pts: number;
  size_pts: number;
  sah_pts: number;
  site_pts: number;
  total_score: number;
  risk_5yr_pct: number;
  risk_band: "low" | "moderate" | "high";
}

/* ── centerline ────────────────────────────────────────────────────────── */
export interface CenterlineRequest {
  session_id: string;
  source: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  voxel_size_mm: number;
}

export interface CenterlineResult {
  centerline_mesh_url: string;
  n_points: number;
  arc_length_mm: number;
  chord_length_mm: number;
  tortuosity: number;
  tortuosity_index_pct: number;
  mean_diameter_mm: number;
  min_diameter_mm: number;
  max_diameter_mm: number;
  warning: string | null;
}

export interface CrossSectionRequest {
  session_id: string;
  n_samples: number;
}

export interface CrossSectionResult {
  arc_positions_mm: number[];
  diameters_mm: number[];
  mean_diameter_mm: number;
  median_diameter_mm: number;
  min_diameter_mm: number;
  max_diameter_mm: number;
  mean_area_mm2: number;
  stenosis_ratio: number;
  stenosis_pct: number;
  stenosis_label: string;
  warning: string | null;
}

/* ── audit (SkullChain) ─────────────────────────────────────────────────── */
export interface AuditBlock {
  id: number;
  iso_ts: string;
  username: string;
  action: string;
  patient_hash: string;
  payload_json: string;
  block_hash: string;
  prev_hash: string;
}

export interface AuditVerifyResult {
  ok: boolean;
  total_blocks: number;
  broken: { id: number; iso_ts: string; action: string; reason: string }[];
}

/* ── patients ──────────────────────────────────────────────────────────── */
export interface PatientCreate {
  surname: string;
  given_name?: string;
  hospital_id?: string;
  dob?: string;
  sex?: string;
  institution?: string;
  ocupacion?: string;
  antecedentes_patologicos?: string;
  antecedentes_toxicologicos?: string;
  antecedentes_quirurgicos?: string;
  antecedentes_alergicos?: string;
  antecedentes_farmacologicos?: string;
  notes?: string;
}

export interface PatientDetail extends PatientCreate {
  id: number;
}

export interface PatientSummary {
  id: number;
  full_name: string;
  hospital_id: string;
  dob: string;
  sex: string;
  institution: string;
  study_count: number;
  created_at: string;
}

/** Full "Nuevo Caso" payload — creates a Patient + a Study. */
export interface CaseCreate {
  surname: string;
  given_name?: string;
  hospital_id?: string;
  dob?: string;
  sex?: string;
  institution?: string;
  ocupacion?: string;
  antecedentes_patologicos?: string;
  antecedentes_toxicologicos?: string;
  antecedentes_quirurgicos?: string;
  antecedentes_alergicos?: string;
  antecedentes_farmacologicos?: string;
  notes?: string;
  study_date?: string;
  sintomas_positivos?: string;
  dx_principal: string;
  dx_secundario?: string;
  tipo_aneurisma?: string;
  tratamiento_propuesto?: string;
  region_anatomica?: string;
  lateralidad?: string;
  angiographer?: string;
  mod_tac?: boolean;
  mod_angio?: boolean;
  mod_rm?: boolean;
  mod_pangio?: boolean;
}

/** Clinical study/case for an existing patient (sections 3-5 of Nuevo Caso). */
export interface StudyCreate {
  study_date?: string;
  sintomas_positivos?: string;
  dx_principal: string;
  dx_secundario?: string;
  tipo_aneurisma?: string;
  tratamiento_propuesto?: string;
  region_anatomica?: string;
  lateralidad?: string;
  angiographer?: string;
  mod_tac?: boolean;
  mod_angio?: boolean;
  mod_rm?: boolean;
  mod_pangio?: boolean;
}

export interface StudySummary {
  id: number;
  patient_id: number;
  dicom_path: string;
  modality: string;
  description: string;
  acquired_at: string;
  session_count: number;
  sintomas_positivos: string;
  dx_principal: string;
  dx_secundario: string;
  tipo_aneurisma: string;
  tratamiento_propuesto: string;
  region_anatomica: string;
  lateralidad: string;
  angiographer: string;
  mod_tac: boolean;
  mod_angio: boolean;
  mod_rm: boolean;
  mod_pangio: boolean;
}

export interface PatientSessionInfo {
  session_id: string;
  label: string;
  current_step: number;
  max_diameter_mm: number | null;
  rupture_risk_label: string | null;
  created_at: string;
  updated_at: string;
}

/* ── dicom / upload ────────────────────────────────────────────────────── */
export interface SpacingXYZ {
  x: number;
  y: number;
  z: number;
}

export interface SeriesInfo {
  session_id: string;
  series_id: string;
  description: string;
  modality: string;
  slices: number;
  spacing: SpacingXYZ;
  window_center: number;
  window_width: number;
  is_projection: boolean;
  projection_warning: string | null;
  size_mb: number;
}

export interface UploadResult {
  session_id: string;
  series: SeriesInfo[];
  total_files: number;
}

/* ── MPR / volume ──────────────────────────────────────────────────────── */
export interface VolumeMeta {
  /** [z, y, x] */
  shape: [number, number, number];
  /** [sz, sy, sx] mm */
  spacing: [number, number, number];
  wc: number;
  ww: number;
  modality: string;
}

/* ── segmentation ──────────────────────────────────────────────────────── */
export interface SuggestedBand {
  lower: number;
  upper: number;
  vmin: number;
  vmax: number;
}

export interface PreviewRequest {
  lower: number;
  upper: number;
  cleanup?: number;
  downsample?: number;
}

export interface PreviewResult {
  mesh_url: string;
  vertices: number;
  voxel_fraction: number;
}

export interface SegmentRequest {
  session_id: string;
  series_id: string;
  lower: number;
  upper: number;
  smoothing: number;
  cleanup: number;
  /** Segment at native resolution. Downsampling halves the tree's connectivity,
   *  which is what leaves gaps in thin vessels. Costs minutes, not seconds. */
  full_resolution?: boolean;
  /** Quedarse solo con el componente conexo mayor. Medido en los estudios
   *  angiográficos de este proyecto ESE componente es el árbol (case 3: 60,3 %;
   *  case 9: 63,7 %) y lo demás es hueso: bloques de 228–2948 mm³ a 37–92 mm,
   *  que ningún filtro de motas alcanza y ningún umbral HU separa — el 99 % del
   *  hueso cae dentro del rango de intensidad del propio árbol. En angio-TC se
   *  rechaza con un mensaje: allí la pieza mayor es la cabeza entera. */
  main_tree_only?: boolean;
}

export interface SegmentResult {
  mesh_url: string;
  voxel_fraction: number | null;
  strategy: string;
  is_dsa: boolean;
  vertices: number;
  faces: number;
  /** 1 = native resolution; above 1 the mesh is expected to have more gaps. */
  downsample_factor: number;
  /** Share of the thresholded volume kept by the cleanup filter (0–1). */
  kept_fraction: number;
  fragments_removed: number;
  /** Biggest discarded component, mm³. Tens of mm³ = a vessel segment left out. */
  largest_removed_mm3: number;
  /** Si «solo el árbol principal» llegó a aplicarse. */
  main_tree_applied: boolean;
  /** Y si no, por qué: un botón que no hace nada en silencio es peor que uno
   *  que explica. */
  main_tree_warning: string;
  main_tree_removed: number;
}

/* ── interactive mesh editing: ROI crop + grow-from-seeds ───────────────── */
export interface MeshCropRequest {
  mode: "box" | "sphere";
  center: Position3D;
  radius?: number;
  half_size?: Position3D | null;
  invert?: boolean;
}

export interface MeshCropResult {
  mesh_url: string;
  vertices: number;
  faces: number;
  removed_vertices: number;
  undo_depth: number;
}

export interface GrowRequest {
  seeds: Position3D[];
  lower?: number;
  upper?: number;
  auto_band?: boolean;
  smoothing?: number;
  cleanup?: number;
}

export interface GrowResult {
  mesh_url: string;
  vertices: number;
  faces: number;
  n_voxels: number;
  fragments_removed: number;
  seeds: number;
  band_lower: number;
  band_upper: number;
  undo_depth: number;
}

/* ── undoing mesh edits ────────────────────────────────────────────────── */
/** "undo" steps back one crop/grow; "original" returns to the segmented mesh. */
export type MeshRestoreScope = "undo" | "redo" | "original";

export interface MeshRestoreResult {
  mesh_url: string;
  vertices: number;
  faces: number;
  scope: MeshRestoreScope;
  undo_depth: number;
  redo_depth: number;
}

/** One recoverable mesh state, named by what produced it. */
export interface MeshHistoryStep {
  label: "segment" | "crop" | "grow" | "edit";
  title: string;
  vertices: number;
  at: number;
}

export interface MeshHistoryResult {
  undo_depth: number;
  redo_depth: number;
  has_original: boolean;
  steps: MeshHistoryStep[];
}

/* ── clearing placed devices ───────────────────────────────────────────── */
/** "stent" covers both the straight catalogue stent and the centreline-guided one. */
export type DeviceKind = "clips" | "coils" | "stent";

export interface DeviceClearResult {
  cleared: DeviceKind[];
  remaining: DeviceKind[];
  meshes_removed: number;
  /** Mesh URL per still-placed family — lets a resumed session redraw its devices. */
  mesh_urls: Partial<Record<DeviceKind, string>>;
}

export interface PreprocessStatus {
  applied: boolean;
  ops: string;
}

export interface CenterlineClearResult {
  removed: string[];
  had_centerline: boolean;
}

/* ── surgical approach trajectory ──────────────────────────────────────── */
export interface TrajectoryRequest {
  entry: Position3D;
  target: Position3D;
}

export interface TrajectoryResult {
  entry: number[];
  target: number[];
  depth_mm: number;
  angle_deg: number;
}

/* ── DICOM volume preprocessing ────────────────────────────────────────── */
export interface PreprocessRequest {
  clip_hu?: boolean;
  resample_isotropic?: boolean;
  target_spacing_mm?: number;
  smooth?: boolean;
  smooth_sigma?: number;
}

export interface PreprocessResult {
  shape_before: number[];
  shape_after: number[];
  spacing_before: number[];
  spacing_after: number[];
  note: string;
}

/* ── 3D-print preparation ──────────────────────────────────────────────── */
export interface PrintBed {
  name: string;
  x_mm: number;
  y_mm: number;
  z_mm: number;
}

export interface PrintPrepRequest {
  target_size_mm?: number;
  smooth_iterations?: number;
  smooth_relaxation?: number;
  fill_holes?: boolean;
  hole_size?: number;
  subdivide?: boolean;
  bed_x_mm?: number;
  bed_y_mm?: number;
  bed_z_mm?: number;
}

export interface PrintPrepResult {
  stl_url: string;
  scale_factor: number;
  dimensions_mm: number[];
  volume_cm3: number;
  surface_area_cm2: number;
  is_watertight: boolean;
  open_edge_count: number;
  fits_in_bed: boolean;
  warnings: string[];
}

/* ── centreline-guided stent (cl_stent) ────────────────────────────────── */
export interface ClStentRequest {
  session_id: string;
  stent_diameter_mm: number;
  start_arc_mm?: number | null;
  end_arc_mm?: number | null;
  braid?: boolean;
  braid_count?: number;
}

export interface ClStentResult {
  stent_mesh_url: string;
  length_mm: number;
  nominal_diameter_mm: number;
  mean_vessel_diameter_mm: number;
  coverage_ratio: number;
  total_arc_mm: number;
  warning: string | null;
}

/* ── detection / morphometry ───────────────────────────────────────────── */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface AneurysmCandidate {
  id: string;
  center_mm: Position3D;
  max_diameter_mm: number;
  confidence: number;
  dome_mesh_url: string;
  selected: boolean;
  /** Qué criterios encontraron este sitio: «curvatura» (la superficie se
      abomba), «calibre» (es más gruesa que el resto del árbol) y «cociente»
      (más gruesa que el vaso de al lado). Que coincidan varios es información;
      el ORDEN no está validado contra casos anotados. */
  channels: string[];
  /** Qué es la malla azul. «region»: lo que el canal de curvatura detectó.
      «locator»: una bola alrededor del punto — enseña DÓNDE mirar, no qué
      parte es la lesión, e incluye pared de vaso. Ninguno de los dos afecta a
      la morfometría, que se mide sobre el saco aislado desde el volumen a
      partir del plano de cuello marcado. */
  patch_kind: "region" | "locator";
}

/** Why the detector kept or rejected what it did. An empty result used to be
 *  indistinguishable from a failure; these counts say which gate did it. */
export interface DetectionDiagnostics {
  regions_analyzed: number;
  rejected_too_few_points: number;
  rejected_size: number;
  rejected_mean_curvature: number;
  rejected_positive_gauss: number;
  rejected_compactness: number;
  rejected_sphericity: number;
  merged: number;
  removed_components: number;
  min_radius_mm: number;
  max_radius_mm: number;
}

export interface AneurysmDetectionResult {
  found: boolean;
  candidates: AneurysmCandidate[];
  diagnostics: DetectionDiagnostics;
}

export type RiskLabel = "Alto" | "Moderado" | "Bajo";

export interface MorphometryResult {
  volume_mm3: number;
  surface_area_mm2: number;
  eq_sphere_diam_mm: number;
  max_diameter_mm: number;
  bbox_w_mm: number;
  bbox_h_mm: number;
  neck_mm: number;
  dome_height_mm: number;
  dnr: number;
  ar: number;
  bf: number;
  compactness: number;
  ui: number;
  ei: number;
  nsi: number;
  sr: number;
  rupture_risk_label: RiskLabel;
  reliable: boolean;
  /** El saco CERRADO aislado al marcar el cuello. Es la única malla que
      delimita el cuerpo del aneurisma: la del candidato en Detección solo
      señala dónde mirar. Vacío mientras no se marque el cuello.

      No se puede sacar automáticamente de los criterios de detección: el
      calibre se derrama por el tronco, el cociente no tiene corte natural, y
      la gaussiana no frena en un vaso porque un cilindro la tiene cero
      —comprobado con sacos sintéticos de 4, 6 y 8 mm, que devolvían los tres
      la misma región de 27,5 mm—. Lo que lo delimita es el cuello. */
  sac_mesh_url: string;
  neck_source: "auto" | "manual" | "rim";
  /** Angle between the neck plane and the neck→dome axis (degrees). Only
   *  meaningful for neck_source "rim": near 0° the two-click method would have
   *  landed in the same place. */
  neck_tilt_deg: number;
  /** False when the sac mesh was open or its volume implausible: volume,
   *  equivalent sphere, compactness, UI, EI and NSI were nulled. Independent
   *  of `neck_valid` — an open cap can still yield a good neck. */
  volume_valid: boolean;
  neck_valid: boolean;
  warning: string | null;
  centroid: Position3D | null;
  principal_axis: number[] | null;
  /** Centre of the neck — where a clip/stent goes. Do not re-derive it. */
  /** Origin of the neck plane ACTUALLY used, when one was placed by hand. */
  /** The points marked around the neck rim, echoed back so a resumed session
   *  can restore the marks instead of showing a plane with nothing behind it. */
  rim_points: Position3D[];
  plane_origin: Position3D | null;
  /** Its unit normal, pointing at the dome. The 3D ring used to be rebuilt from
   *  the PCA axis instead, so on an oblique neck it drew a plane that was not
   *  the one that measured the neck. */
  plane_normal: Position3D | null;
  neck_origin: Position3D | null;
}

/** User-defined neck plane for semi-automatic closed-sac morphometry. */
export interface NeckPlaneRequest {
  origin: Position3D;
  normal: number[];          // [x, y, z] toward the dome
  dome_seed?: Position3D | null;
  /** Points around the neck rim. With three or more the plane is fitted to them
   *  and `origin`/`normal` are ignored — real necks are often oblique to the
   *  dome axis, and assuming perpendicularity overestimates the opening. */
  rim_points?: Position3D[];
}

/* ── perforators ───────────────────────────────────────────────────────── */
export interface PerforatorCandidate {
  id: string;
  position_mm: Position3D;
  radius_mm: number;
  distance_to_neck_mm: number;
  risk_level: 1 | 2 | 3;
  risk_label: string;
  risk_color: string;
}

export interface PerforatorsResult {
  /** Diámetro por debajo del cual este barrido no resuelve nada, fijado por el
      tamaño de vóxel. Viaja con el resultado para que una lista vacía no se lea
      como «no hay ninguna»: una perforante verdadera mide 0,1–0,5 mm y la
      angiografía no la resuelve. */
  calibre_floor_mm: number;
  scanned_mesh_points: number;
  candidates: PerforatorCandidate[];
  high_count: number;
  medium_count: number;
  low_count: number;
  search_radius_mm: number;
  /** Outer radius of each risk zone [high, medium, low] in mm. Reported so the
   *  legend states the bands actually used — it used to hard-code its own and
   *  had drifted (it said 3–6 mm for a computation that uses 3–5). */
  zone_radii_mm: number[];
}

/* ── treatment decision ────────────────────────────────────────────────── */
export const ANEURYSM_LOCATIONS = [
  "Desconocida / No especificada",
  "ACM — Arteria Cerebral Media",
  "ACA / ACoA — Arteria Comunicante Anterior",
  "ACI proximal (segm. cavernoso / clinoideo)",
  "ACI distal (PCOM / oftálmica)",
  "ACoP — Arteria Comunicante Posterior",
  "Basilar (punta, tronco o AICA)",
  "PICA / Vertebral",
  "Otra localización",
] as const;

export type AneurysmLocation = (typeof ANEURYSM_LOCATIONS)[number];

export interface DecisionFactor {
  name: string;
  detail: string;
  direction: "clip" | "endo" | "neutral";
  points: number;
  /** De dónde sale el umbral y de dónde el peso. Rara vez del mismo sitio. */
  source: string;
  /** False para lo que se enseña y no suma: los índices de forma, que vienen de
      literatura de riesgo de rotura y describen la vía endovascular en vez de
      elegir modalidad. Borrarlos los escondería; enseñarlos los deja discutibles. */
  votes: boolean;
}

/** Las perforantes que la anatomía hace esperar en una localización.

    NO es una medida de este paciente: una perforante mide 0,1–0,5 mm y el vóxel
    de una angio-TC ronda 0,5–1,0 mm, así que no llega a la malla. Esto es lo que
    un cirujano usa en su lugar — saber dónde nacen. */
export interface PerforatorTerritory {
  arteries: string;
  supplies: string;
  consequence: string;
  surgical_note: string;
  sources: string[];
}

/** Cómo sería la vía endovascular para esta geometría. No es una segunda
    recomendación: describe una de las dos opciones. */
export interface EndovascularProfile {
  technique: "simple" | "assisted" | "diverter" | "unknown";
  technique_label: string;
  rationale: string;
  durability: string;
  cautions: string[];
  sources: string[];
}

/** Una de las dos puntuaciones del Japan Stroke Data Bank. Más puntos es peor:
    estima el riesgo de mal resultado al alta (mRS > 2) POR ESA VÍA. */
export interface JsdbArm {
  arm: "clip" | "coil";
  label: string;
  points: number;
  max_points: number;
  items: { label: string; points: number; detail: string }[];
  missing: string[];
}

/** Japan Stroke Data Bank — el único modelo ajustado del paso.

    No vota: sus variables (edad, WFNS, Fisher) ya estaban en el motor copiadas
    a mano, así que sumarlo sería contarlas dos veces. Y es lo único que puede
    decir «las dos vías van mal»: el saldo del motor es una resta, y un 0 ahí
    significa empate, nunca eso.

    Null en un aneurisma no roto: su cohorte entera es hemorragia. */
export interface Jsdb {
  clip: JsdbArm;
  coil: JsdbArm;
  favours: "clip" | "coil" | "tie";
  verdict: string;
  both_poor: boolean;
  known_pct: number;
  missing: string[];
  source: string;
}

export interface TreatmentDecisionRequest {
  session_id: string;
  location: AneurysmLocation;
  is_ruptured: boolean;
  patient_age: number | null;
  has_comorbidities: boolean;
  /** Sólo existen si el aneurisma está roto: gradúan la hemorragia, no el
      aneurisma. Nunca obligatorios. */
  wfns_grade: number | null;
  fisher_grade: number | null;
  /** Número de ictus previos. La única variable del JSDB que esta aplicación no
      recogía en ninguna parte, y es asimétrica: al coiling le penaliza desde el
      primero, al clipaje desde el segundo. No es lo mismo que el `earlier_sah`
      del PHASES, que es más estrecho (HSA previa por OTRO aneurisma). */
  prior_stroke: number | null;
}

export interface TreatmentDecisionResult {
  /** Los puntos que de verdad se han sumado. */
  clip_points: number;
  endo_points: number;
  /** Su cociente normalizado a 100. Sirve para dibujar la barra, no para leerlo
      como una probabilidad: son pesos heurísticos, no frecuencias. */
  clip_pct: number;
  endo_pct: number;
  /** Razonamiento que no es un factor puntuado: por qué un aneurisma pequeño es
      —o no— un caso de vigilancia, y qué dice el PHASES al respecto. */
  notes: string[];
  /** Qué parte del caso se ha podido evaluar. La confianza está limitada por
      esto: el acuerdo entre los factores vistos no cubre a los que faltan. */
  coverage_pct: number;
  missing_inputs: string[];
  /** Se calcula también cuando gana el clipaje: una sesión multidisciplinar
      compara las dos opciones, no sólo la ganadora. */
  endovascular: EndovascularProfile | null;
  /** Null sin localización: inventar un territorio por defecto sería relleno. */
  perforators: PerforatorTerritory | null;
  /** Null si no está roto: el modelo se derivó sólo sobre hemorragias, así que
      sobre un incidental no dice nada — y eso no es un hueco. */
  jsdb: Jsdb | null;
  balance: number;
  recommendation: string;
  recommendation_key: "clip" | "endo" | "mdt" | "surveillance";
  confidence: "Alta" | "Moderada" | "Baja";
  factors: DecisionFactor[];
  clip_factors: string[];
  endo_factors: string[];
}

/* ── devices: clips ────────────────────────────────────────────────────── */
export interface ClipLibraryItem {
  id: string;
  name: string;
  manufacturer: string;
  length_mm: number;
  angle_deg: number;
  is_fenestrated: boolean;
  closing_force_g: number;
  compatible_applier: string;
}

export interface ClipPlacement {
  clip_id: string;
  position: Position3D;
  normal: number[];
  rotation_deg: number;
}

export interface ClipRecommendation {
  clip_id: string;
  clip_name: string;
  score: number;
  reason: string;
  suggested_placement: ClipPlacement | null;
}

/* ── Criteria-based clip selection ──────────────────────────────────────── */

export type ClipVerdict = "ok" | "warn" | "fail";

export interface ClipCriterion {
  key: string;
  label: string;
  verdict: ClipVerdict;
  detail: string;
}

/** Result of posing the clip on the patient's measured neck plane. */
export interface ClipFitCheck {
  collision: boolean;
  n_contacts: number;
  span_mm: number;
  neck_coverage_pct: number;
  /** Approach angles, of those tried, that clear neighbouring vessels. */
  clean_rolls: number;
  n_rolls: number;
  note: string;
}

export interface ClipCandidateOut {
  clip_id: string;
  clip_name: string;
  manufacturer: string;
  shape: string;
  blade_length_mm: number;
  closing_force_g: number;
  score: number;
  verdict: ClipVerdict;
  headline: string;
  coverage_ratio: number;
  safety_margin_mm: number;
  /** 'made_to_order' is a real design manufactured for the case — it competes
   *  like stock, but is not on a shelf today. */
  availability: "stock" | "made_to_order" | "template";
  /** True bend angle; `shape` is only a coarse class. */
  bend_angle_deg: number;
  closing_force_min_g: number;
  closing_force_max_g: number;
  /** True when the force is a design band, not a characterised figure. */
  force_provisional: boolean;
  criteria: ClipCriterion[];
  /** Only present for the candidates checked against the mesh. */
  fit: ClipFitCheck | null;
}

export interface ManufactureSpecOut {
  blade_length_mm: number;
  blade_width_mm: number;
  blade_height_mm: number;
  spring_length_mm: number;
  shape: string;
  angle_deg: number;
  closing_force_g: number;
  fenestration_mm: number;
  neck_mm: number;
  label: string;
  reasons: string[];
  confidence_notes: string[];
  /** Watertight STL from the NAVARRO™ design. Null when the family has no such
   *  shape yet — a catalogue clip is bought, not made. */
  stl_url: string | null;
  part_no: string;
  /** 'navarro' = made from the family; 'commercial' = buy this catalogue clip
   *  instead; 'unavailable' = neither route serves this neck. */
  source: "navarro" | "commercial" | "unavailable";
  piece_label: string;
  commercial_name: string;
  fallback_reason: string;
  dossier_internal_url: string | null;
  /** For a third-party workshop. Carries no patient data by construction. */
  dossier_workshop_url: string | null;
}

export interface ClipCaseOut {
  neck_mm: number;
  dome_height_mm: number;
  max_diameter_mm: number;
  ar: number;
  dnr: number;
  parent_artery_mm: number;
  neck_source: string;
  neck_tilt_deg: number;
  region: string;
  laterality: string;
  aneurysm_type: string;
}

/** A made-to-order clip sized exactly to this case. */
export interface CustomJawOut {
  /** El id con el que se coloca. Vacío hasta que la pieza se genera. */
  clip_id: string;
  series: string;
  shape: NavarroShape;
  angle_deg: number;
  window_mm: number;
  resizable: boolean;
  jaw_mm: number;
  nearest_drawn_mm: number;
  label: string;
  reason: string;
  mesh_url: string | null;
  stl_url: string | null;
}

/** The pieces a viewer needs to play a clip being applied. */
export interface ClipAnimationResult {
  body_url: string;
  blade_a_url: string;
  blade_b_url: string;
  hinge: Position3D;
  hinge_axis: number[];
  swing_deg: number;
  /** True while the opening is inferred from commercial clips rather than
   *  specified by the manufacturer — a closed STL records no mechanism. */
  mechanics_assumed: boolean;
  approach_entry: Position3D;
  approach_target: Position3D;
  approach_is_default: boolean;
  position: Position3D;
  normal: number[];
  rotation_deg: number;
  clip_name: string;
}

export type ClipOutcome = "stock" | "marginal" | "manufacture" | "unmeasured";

export interface ClipSelectionResult {
  outcome: ClipOutcome;
  summary: string;
  case: ClipCaseOut;
  recommended: ClipCandidateOut[];
  rejected: ClipCandidateOut[];
  manufacture: ManufactureSpecOut | null;
  custom_jaw: CustomJawOut | null;
  caveats: string[];
}

/* ── Global clip library ────────────────────────────────────────────────── */

export interface LibraryClip {
  id: string;
  name: string;
  kind: "stock" | "template";
  manufacturer: string;
  shape: string;
  closing_force_g: number;
  fenestration_mm: number;
  notes: string;
  blade_length_mm: number;
  /** Two blades plus the jaw gap — NOT one blade's width. */
  envelope_width_mm: number;
  envelope_height_mm: number;
  volume_mm3: number;
  source_filename: string;
  created_at: number;
  mesh_url: string;
}

export interface ClipShapeSuggestion {
  shape: string;
  why: string;
  blade_length_mm: number;
  envelope_width_mm: number;
  envelope_height_mm: number;
  volume_mm3: number;
}

export interface CustomClipInfo {
  clip_id: string;
  name: string;
}

export interface ClipPlanRequest {
  session_id: string;
  placements: ClipPlacement[];
  trajectory_entry?: Position3D | null;
  trajectory_target?: Position3D | null;
}

/** Un origen de rama visible al alcance del clip colocado. */
export interface BranchUnderClip {
  index: number;
  position_mm: Position3D;
  calibre_mm: number;
  distance_to_clip_mm: number;
}

export interface ClipPlanResult {
  clips_mesh_url: string;
  trajectory_mesh_url: string | null;
  neck_coverage_pct: number;
  /** Choque con anatomía FUERA del cuello. Tocar el cuello es a lo que va el clip. */
  collision_detected: boolean;
  /** Si se pudo recortar el cuello antes de comprobar. Sin él la cifra no juzga nada. */
  neck_region_excluded: boolean;
  /** Ramas visibles que el clip colocado alcanza, la más próxima primero. Se
      miden contra la geometría del clip y no contra el centro del cuello, porque
      la longitud de la mordaza es lo que decide hasta dónde llega el cierre. */
  branches_under_clip: BranchUnderClip[];
  warning: string | null;
}

/* ── devices: coils ────────────────────────────────────────────────────── */
export interface CoilLibraryItem {
  id: string;
  name: string;
  manufacturer: string;
  diameter_mm: number;
  length_cm: number;
  coil_type: string;
  is_detachable: boolean;
}

export interface CoilPlacement {
  coil_id: string;
  position: Position3D;
  packing_density: number;
}

export interface CoilPlanResult {
  coils_mesh_url: string;
  total_packing_density: number;
  estimated_occlusion_pct: number;
  warning: string | null;
}

/* ── devices: stents ───────────────────────────────────────────────────── */
export interface StentLibraryItem {
  id: string;
  name: string;
  manufacturer: string;
  min_diameter_mm: number;
  max_diameter_mm: number;
  available_lengths_mm: number[];
  type: string;
}

export interface StentParams {
  stent_id: string;
  diameter_mm: number;
  length_mm: number;
  position: Position3D;
  rotation_deg: number;
}

export interface StentPlanResult {
  stent_mesh_url: string;
  coverage_pct: number;
  neck_diameter_covered_mm: number;
  deployed: boolean;
  warning: string | null;
}

/* ── report / export ───────────────────────────────────────────────────── */
export interface ReportRequest {
  session_id: string;
  patient_name?: string;
  patient_dob?: string;
  patient_sex?: string;
  hospital_id?: string;
  surgeon_name?: string;
  institution?: string;
  report_date?: string;
  clinical_notes?: string;
  include_3d_screenshot?: boolean;
  screenshot_png_b64?: string | null;
}

export interface ReportResult {
  pdf_url: string | null;
  dicom_sr_url: string | null;
  stl_url: string | null;
  generated_at: string;
  page_count: number | null;
}

export interface ExportRequest {
  session_id: string;
  include_vessel_tree?: boolean;
  include_aneurysm_dome?: boolean;
  include_skull?: boolean;
  scale_factor?: number;
}

/* ── sessions ──────────────────────────────────────────────────────────── */
export interface SessionSaveRequest {
  session_id: string;
  label?: string;
  patient_id?: number | null;
  study_id?: number | null;
  imaging_study_id?: number | null;
  current_step?: number;
}

export interface SessionSaveResult {
  file_path: string;
  download_url: string;
  saved_at: string;
}

export interface SessionRestoreResult {
  session_id: string;      // NEW live session id to use from now on
  current_step: number;
  label: string;
  has_segmentation: boolean;
  has_detection: boolean;
  has_morphometry: boolean;
  has_plan: boolean;
  restored_at: string;
  mesh_url: string;
  n_vertices: number;
  n_faces: number;
  modality: string;
  patient_id: number | null;
  study_id: number | null;          // clinical case
  study_label: string;
  imaging_study_id: number | null;  // acquisition being analysed
  series: SeriesInfo | null;        // so step 1 shows the restored series
  centerline_mesh_url: string;      // "" when the session had no centreline
  centerline_arc_mm: number;
}

/* ── longitudinal ──────────────────────────────────────────────────────── */
export interface LongitudinalEntry {
  session_date: string;
  session_label: string;
  max_diameter_mm: number;
  neck_mm: number;
  volume_mm3: number;
  ar: number;
  dnr: number;
  rupture_risk_label: string;
}

export interface LongitudinalDelta {
  metric: string;
  label: string;
  value_current: number;
  value_previous: number;
  delta: number;
  delta_pct: number;
  trend: string;
  is_concerning: boolean;
}

export interface LongitudinalResult {
  patient_id: number | null;
  entries: LongitudinalEntry[];
  deltas: LongitudinalDelta[];
  growth_alert: boolean;
  growth_alert_message: string | null;
}

/* ── study gallery ─────────────────────────────────────────────────────── */
export interface StudyCard {
  id: number;            // ImagingStudy id
  case_id: number;       // clinical case it belongs to
  patient_id: number;
  patient_name: string;
  hospital_id: string;
  description: string;
  modality: string;
  acquired_at: string;
  dx_principal: string;
  created_at: string;
  archived: boolean;
  has_thumbnail: boolean;
  n_files: number;
  n_slices: number;
  size_mb: number;
  session_count: number;
  last_step: number | null;
  max_diameter_mm: number | null;
  rupture_risk_label: string | null;
  /** Most recent session that can actually be restored, or null. */
  resumable_session_id: string | null;
}

export interface OpenStudyResult {
  session_id: string;
  study_id: number;
  n_files: number;
}

/* ── Pedidos de clip ──────────────────────────────────────────────────────── */

/** Un taller registrado, para reutilizar en pedidos sucesivos. */
export interface Workshop {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  notes: string;
  created_at: number;
  last_used_at: number;
  order_count: number;
}

export type WorkshopIn = Omit<
  Workshop, "id" | "created_at" | "last_used_at" | "order_count"
>;

/** Con qué arranca el formulario: todo lo que el sistema ya sabe del caso. */
export interface ClipOrderPrefill {
  session_id: string;
  can_order: boolean;
  reason: string;
  advised_series: string;
  advised_angle_deg: number;
  advised_jaw_mm: number;
  advised_label: string;
  advised_shape: string;
  advised_navarro_shape: NavarroShape;
  advised_window_mm: number;
  jaw_is_free: boolean;
  stock_window_mm: number[];
  drawn_angles_deg: number[];
  is_drawn_size: boolean;
  outside_drawn_range: boolean;
  commercial_name: string;
  neck_mm: number;
  neck_source: string;
  dome_height_mm: number;
  max_diameter_mm: number;
  parent_artery_mm: number;
  region: string;
  caveats: string[];
  suggested_extra_sizes_mm: number[];
  suggest_extra_sizes: boolean;
  extra_sizes_reason: string;
  stock_sizes_mm: number[];
  force_band_g: number[];
  max_tip_opening_mm: number;
  material: string;
  tolerance_jaw_mm: number;
  tolerance_other_mm: number;
  requester_name: string;
  can_sign: boolean;
  institution: string;
  patient: string;
  case_label: string;
  workshops: Workshop[];
}

/** Las cuatro series dibujadas de la familia. */
export type NavarroShape = "straight" | "curved" | "angled" | "fenestrated";

export type OrderStatus =
  | "borrador" | "firmado" | "enviado" | "en_fabricacion"
  | "recibida" | "verificada" | "rechazada";

/** Lo que el usuario rellena. Todo lo demás lo pone el sistema. */
export interface ClipOrderIn {
  case_id?: number | null;
  series: string;
  shape: NavarroShape;
  angle_deg: number;
  jaw_mm: number;
  window_mm: number;
  quantity: number;
  extra_sizes_mm: number[];
  override_reason: string;
  intended_use: "implante" | "prototipo" | "inventario";
  needed_by: string;
  urgency: "programada" | "preferente";
  steriliser: "hospital" | "taller";
  marking: "cuerpo" | "ninguno";
  notes: string;
  authorization_ref: string;
  workshop_id: string;
  new_workshop?: WorkshopIn | null;
  surgeon: string;
  sign: boolean;
  accepts_measurements: boolean;
  accepts_force_is_target: boolean;
  accepts_not_approved_device: boolean;
}

/** Lo que la pieza midió al llegar. La fuerza no es un hecho hasta aquí. */
export interface ClipOrderReception {
  received_at?: number;
  by?: string;
  notes?: string;
  measured_jaw_mm?: number;
  measured_force_g?: number;
  jaw_within_tolerance?: boolean;
  force_within_band?: boolean;
  expected_jaw_mm?: number;
  expected_force_band_g?: number[];
  verified_at?: number;
  verified_by?: string;
  deviation_accepted?: string;
  rejected_at?: number;
  rejection_reason?: string;
}

export interface ClipOrder {
  part_no: string;
  status: OrderStatus;
  status_label: string;
  created_at: number;
  updated_at: number;
  session_id: string;
  case_id: number | null;
  patient: string;
  patient_id: number | null;
  case_label: string;
  requested_by: string;
  requested_by_name: string;
  surgeon: string;
  signed_at: number;
  institution: string;
  series: string;
  shape: NavarroShape;
  angle_deg: number;
  jaw_mm: number;
  window_mm: number;
  is_drawn_size: boolean;
  quantity: number;
  extra_sizes_mm: number[];
  total_pieces: number;
  intended_use: string;
  needed_by: string;
  urgency: string;
  steriliser: string;
  marking: string;
  notes: string;
  authorization_ref: string;
  workshop_id: string;
  workshop_name: string;
  advised_label: string;
  override_reason: string;
  spec_snapshot: Record<string, unknown>;
  reception: ClipOrderReception;
  next_states: OrderStatus[];
  files: Record<string, string>;
}

/** Cuántos pedidos hay en cada estado, para la cabecera del registro. */
export interface ClipOrderSummary {
  counts: Record<string, number>;
  labels: Record<string, string>;
}

/* ── Piezas sueltas de la malla ─────────────────────────────────────────── */

/** Una pieza conexa, con la forma que distingue un vaso de una lámina de hueso. */
export interface MeshComponentInfo {
  n_points: number;
  volume_mm3: number;
  extent_mm: number;
  thickness_mm: number;
  sphericity: number;
}

export interface MeshComponentList {
  components: MeshComponentInfo[];
  total: number;
  /** False en angio-TC, donde el contraste toca el hueso y la pieza mayor es
      la cabeza entera (795 000–1 220 000 mm³ medidos). */
  largest_is_tree: boolean;
  warning: string;
}

export interface MeshComponentDeleteResult {
  mesh_url: string;
  vertices: number;
  faces: number;
  /** Null cuando el clic no borró nada. */
  removed: MeshComponentInfo | null;
  components_left: number;
  warning: string;
  undo_depth: number;
}

/* ── Corte por plano: el recorte que no pide un centro ──────────────────── */

export interface MeshBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  vertices: number;
}

export interface MeshPlaneCutRequest {
  axis: "x" | "y" | "z" | "custom";
  offset_mm: number;
  normal?: { x: number; y: number; z: number } | null;
  /** True conserva el lado hacia el que apunta la normal. */
  keep_positive: boolean;
}

export interface MeshPlaneCutResult {
  mesh_url: string;
  vertices: number;
  faces: number;
  removed_vertices: number;
  components_left: number;
  undo_depth: number;
}
