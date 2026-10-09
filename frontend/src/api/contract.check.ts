/* El contrato entre la API y la interfaz, comprobado al compilar.

   Lo que el servidor envía tiene que caber en lo que la interfaz espera. Cada
   línea comprueba que el tipo generado desde la API (schema.gen.ts, que sale
   de `npm run gen:api`) se puede asignar al tipo escrito a mano (types.ts).
   Si el backend quita o cambia un campo que la interfaz usa, `tsc` falla aquí
   y no en la pantalla del usuario.

   Al añadir un tipo de respuesta a types.ts, añade aquí su línea. */

import type { components } from "./schema.gen";
import type * as ui from "./types";

type S = components["schemas"];

/** Una respuesta trae SIEMPRE los campos que tienen valor por defecto, aunque
 *  el esquema los marque opcionales (lo son al enviar, no al recibir). */
type Completo<T> = T extends (infer U)[] ? Completo<U>[]
  : T extends object ? { [K in keyof T]-?: Completo<T[K]> }
  : T;
type Cabe<Servidor extends Interfaz, Interfaz> = [Servidor, Interfaz];

export type Contrato = [
  Cabe<Completo<S["AneurysmCandidate"]>, ui.AneurysmCandidate>,
  Cabe<Completo<S["AneurysmDetectionResult"]>, ui.AneurysmDetectionResult>,
  Cabe<Completo<S["Annotation"]>, ui.AnnotationWire>,
  Cabe<Completo<S["AnnotationPlane"]>, ui.AnnotationPlane>,
  Cabe<Completo<S["AnnotationsResult"]>, ui.AnnotationsResult>,
  Cabe<Completo<S["AttachResult"]>, ui.AttachResult>,
  Cabe<Completo<S["AuditBlock"]>, ui.AuditBlock>,
  Cabe<Completo<S["AuditVerifyResult"]>, ui.AuditVerifyResult>,
  Cabe<Completo<S["CaptureCreate"]>, ui.CaptureCreate>,
  Cabe<Completo<S["CaptureOut"]>, ui.CaptureOut>,
  Cabe<Completo<S["CeilingCompareRequest"]>, ui.CeilingCompareRequest>,
  Cabe<Completo<S["CeilingCompareResult"]>, ui.CeilingCompareResult>,
  Cabe<Completo<S["CenterlineClearResult"]>, ui.CenterlineClearResult>,
  Cabe<Completo<S["CenterlineRequest"]>, ui.CenterlineRequest>,
  Cabe<Completo<S["CenterlineResult"]>, ui.CenterlineResult>,
  Cabe<Completo<S["CenterlinePoints"]>, ui.CenterlinePoints>,
  Cabe<Completo<S["ClStentApposition"]>, ui.ClStentApposition>,
  Cabe<Completo<S["ClStentCoverage"]>, ui.ClStentCoverage>,
  Cabe<Completo<S["ClStentRequest"]>, ui.ClStentRequest>,
  Cabe<Completo<S["ClStentResult"]>, ui.ClStentResult>,
  Cabe<Completo<S["ClipAnimationResult"]>, ui.ClipAnimationResult>,
  Cabe<Completo<S["ClipCandidateOut"]>, ui.ClipCandidateOut>,
  Cabe<Completo<S["ClipCaseOut"]>, ui.ClipCaseOut>,
  Cabe<Completo<S["ClipCriterion"]>, ui.ClipCriterion>,
  Cabe<Completo<S["ClipFitCheck"]>, ui.ClipFitCheck>,
  Cabe<Completo<S["ClipLibraryItem"]>, ui.ClipLibraryItem>,
  Cabe<Completo<S["ClipPlacement"]>, ui.ClipPlacement>,
  Cabe<Completo<S["ClipPlanRequest"]>, ui.ClipPlanRequest>,
  Cabe<Completo<S["ClipPlanResult"]>, ui.ClipPlanResult>,
  Cabe<Completo<S["ClipRecommendation"]>, ui.ClipRecommendation>,
  Cabe<Completo<S["CoilConstructResult"]>, ui.CoilConstructResult>,
  Cabe<Completo<S["CoilConstructStep"]>, ui.CoilConstructStep>,
  Cabe<Completo<S["CoilLibraryItem"]>, ui.CoilLibraryItem>,
  Cabe<Completo<S["CoilPlacement"]>, ui.CoilPlacement>,
  Cabe<Completo<S["CoilPlanResult"]>, ui.CoilPlanResult>,
  Cabe<Completo<S["ComparedCandidate"]>, ui.ComparedCandidate>,
  Cabe<Completo<S["CorridorAssessmentOut"]>, ui.CorridorAssessmentOut>,
  Cabe<Completo<S["CrossSectionRequest"]>, ui.CrossSectionRequest>,
  Cabe<Completo<S["CrossSectionResult"]>, ui.CrossSectionResult>,
  Cabe<Completo<S["CustomClipInfo"]>, ui.CustomClipInfo>,
  Cabe<Completo<S["DecisionFactor"]>, ui.DecisionFactor>,
  Cabe<Completo<S["DetectionDiagnostics"]>, ui.DetectionDiagnostics>,
  Cabe<Completo<S["DicomSegResult"]>, ui.DicomSegResult>,
  Cabe<Completo<S["ElapssRequest"]>, ui.ElapssRequest>,
  Cabe<Completo<S["ElapssResult"]>, ui.ElapssResult>,
  Cabe<Completo<S["ExportRequest"]>, ui.ExportRequest>,
  Cabe<Completo<S["FdLandingZone"]>, ui.FdLandingZone>,
  Cabe<Completo<S["FollowupStudy"]>, ui.FollowupStudy>,
  Cabe<Completo<S["GlbExportResult"]>, ui.GlbExportResult>,
  Cabe<Completo<S["LesionSummary"]>, ui.LesionSummary>,
  Cabe<Completo<S["LoginResponse"]>, ui.LoginResponse>,
  Cabe<Completo<S["LongitudinalDelta"]>, ui.LongitudinalDelta>,
  Cabe<Completo<S["LongitudinalEntry"]>, ui.LongitudinalEntry>,
  Cabe<Completo<S["LongitudinalResult"]>, ui.LongitudinalResult>,
  Cabe<Completo<S["ManufactureSpecOut"]>, ui.ManufactureSpecOut>,
  Cabe<Completo<S["MeshCropRequest"]>, ui.MeshCropRequest>,
  Cabe<Completo<S["MeshCropResult"]>, ui.MeshCropResult>,
  Cabe<Completo<S["MeshRestoreResult"]>, ui.MeshRestoreResult>,
  Cabe<Completo<S["MorphometryResult"]>, ui.MorphometryResult>,
  Cabe<Completo<S["MultiClipConstructOut"]>, ui.MultiClipConstructOut>,
  Cabe<Completo<S["NeckPlaneRequest"]>, ui.NeckPlaneRequest>,
  Cabe<Completo<S["OcclusionOut"]>, ui.OcclusionOut>,
  Cabe<Completo<S["PatientCreate"]>, ui.PatientCreate>,
  Cabe<Completo<S["PatientDetail"]>, ui.PatientDetail>,
  Cabe<Completo<S["PatientSessionInfo"]>, ui.PatientSessionInfo>,
  Cabe<Completo<S["PatientSuggestion"]>, ui.PatientSuggestion>,
  Cabe<Completo<S["PatientSummary"]>, ui.PatientSummary>,
  Cabe<Completo<S["PendingUser"]>, ui.PendingUser>,
  Cabe<Completo<S["PerforatorCandidate"]>, ui.PerforatorCandidate>,
  Cabe<Completo<S["PerforatorsResult"]>, ui.PerforatorsResult>,
  Cabe<Completo<S["PhasesRequest"]>, ui.PhasesRequest>,
  Cabe<Completo<S["PhasesResult"]>, ui.PhasesResult>,
  Cabe<Completo<S["Position3D"]>, ui.Position3D>,
  Cabe<Completo<S["PreprocessRequest"]>, ui.PreprocessRequest>,
  Cabe<Completo<S["PreprocessResult"]>, ui.PreprocessResult>,
  Cabe<Completo<S["PreprocessStatus"]>, ui.PreprocessStatus>,
  Cabe<Completo<S["PreviewRequest"]>, ui.PreviewRequest>,
  Cabe<Completo<S["PreviewResult"]>, ui.PreviewResult>,
  Cabe<Completo<S["PrintBed"]>, ui.PrintBed>,
  Cabe<Completo<S["PrintPrepRequest"]>, ui.PrintPrepRequest>,
  Cabe<Completo<S["PrintPrepResult"]>, ui.PrintPrepResult>,
  Cabe<Completo<S["ProposedCorridorOut"]>, ui.ProposedCorridorOut>,
  Cabe<Completo<S["RegionEraseResult"]>, ui.RegionEraseResult>,
  Cabe<Completo<S["ReportRequest"]>, ui.ReportRequest>,
  Cabe<Completo<S["ReportResult"]>, ui.ReportResult>,
  Cabe<Completo<S["ScissorsRequest"]>, ui.ScissorsRequest>,
  Cabe<Completo<S["ScissorsResult"]>, ui.ScissorsResult>,
  Cabe<Completo<S["SegmentRequest"]>, ui.SegmentRequest>,
  Cabe<Completo<S["SeriesInfo"]>, ui.SeriesInfo>,
  Cabe<Completo<S["SessionRestoreResult"]>, ui.SessionRestoreResult>,
  Cabe<Completo<S["SessionSaveRequest"]>, ui.SessionSaveRequest>,
  Cabe<Completo<S["SessionSaveResult"]>, ui.SessionSaveResult>,
  Cabe<Completo<S["SignupResponse"]>, ui.SignupResponse>,
  Cabe<Completo<S["SpacingXYZ"]>, ui.SpacingXYZ>,
  Cabe<Completo<S["StentLibraryItem"]>, ui.StentLibraryItem>,
  Cabe<Completo<S["StentParams"]>, ui.StentParams>,
  Cabe<Completo<S["StudyCard"]>, ui.StudyCard>,
  Cabe<Completo<S["StudyCreate"]>, ui.StudyCreate>,
  Cabe<Completo<S["StudySummary"]>, ui.StudySummary>,
  Cabe<Completo<S["SuggestCorridorsResult"]>, ui.SuggestCorridorsResult>,
  Cabe<Completo<S["SuggestedBand"]>, ui.SuggestedBand>,
  Cabe<Completo<S["TrajectoryRequest"]>, ui.TrajectoryRequest>,
  Cabe<Completo<S["TrajectoryResult"]>, ui.TrajectoryResult>,
  Cabe<Completo<S["TreatmentDecisionRequest"]>, ui.TreatmentDecisionRequest>,
  Cabe<Completo<S["UiatsRequest"]>, ui.UiatsRequest>,
  Cabe<Completo<S["UiatsResult"]>, ui.UiatsResult>,
  Cabe<Completo<S["UploadResult"]>, ui.UploadResult>,
  Cabe<Completo<S["UserAdminInfo"]>, ui.UserAdminInfo>,
  Cabe<Completo<S["UserInfo"]>, ui.UserInfo>,
  Cabe<Completo<S["VesselCrossingOut"]>, ui.VesselCrossingOut>,
  Cabe<Completo<S["WorkshopIn"]>, ui.WorkshopIn>,
];

/* Fuera de la comprobación, a propósito:

   - La interfaz es MÁS ESTRICTA que la API: declara una unión de literales o
     una pareja donde el esquema solo promete `string` o `number[]`. No es un
     fallo hoy, pero el servidor podría mandar otro valor sin romper su
     contrato. Para meterlos aquí hay que estrechar el modelo de Pydantic
     (Literal[...], tuple[float, float]):
       ClipSelectionResult, CustomJawOut, DeviceClearResult, FdOption, FdSizingResult, MeshHistoryResult, MeshHistoryStep, SegmentResult, SessionIdentity, TreatmentDecisionResult, WebOption, WebSacDims, WebSizingResult

   - Son cuerpos de PETICIÓN, donde la dirección es la contraria (lo que la
     interfaz envía tiene que caber en lo que el servidor acepta):
       AnnotationsIn, AttachRequest, LesionConfirmIn, SuggestCorridorsRequest, UserUpdate
*/
