/* «Reanudar»: del resultado de restaurar una sesión guardada al store.

   Vivía dentro de App.tsx, donde no se podía probar sin montar la aplicación
   entera. Lo que vuelve con la sesión se pone tal cual; solo se recalcula lo
   que no se guarda (la morfometría, que se rehace del plano guardado, y el
   mapa de calor de los clips, que se pide para la lista guardada). */

import { api, ApiError } from "./api/client";
import { restoredSegmentation } from "./api/restoredSegmentation";
import type { AneurysmDetectionResult, MorphometryResult, SessionRestoreResult } from "./api/types";
import { fromStoredClip, toPlacement } from "./components/planning/placedClips";
import { STEPS, clampStep } from "./pipeline/steps";
import { clampTilt } from "./vtk/clipPose";
import type { PlacedClip, usePlanning } from "./store/planning";

type Planning = ReturnType<typeof usePlanning>;

/** La detección guardada; si no la hay (404), la de siempre. Recalcular daba
 *  otra lista —su orden es inestable— y la lesión confirmada dejaba de
 *  corresponder a lo que se veía (F1-246). */
async function detection(sessionId: string): Promise<AneurysmDetectionResult> {
  try {
    return await api.detect(sessionId, { cached: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return api.detect(sessionId);
    throw err;
  }
}

/** Rellena el store con la sesión restaurada. Devuelve el paso en el que abrir
 *  y si el backend invalidó la medida (solo puede pasar al recalcular). */
export async function rehydrateSession(
  planning: Planning,
  r: SessionRestoreResult,
): Promise<{ step: number; invalidated: boolean }> {
  // A resumed session keeps planning the same case and acquisition, so the
  // breadcrumb and the next "Guardar progreso" don't lose that link.
  planning.setCase(r.study_id, r.study_label);
  planning.setImagingStudyId(r.imaging_study_id);
  planning.setSession(r.session_id);
  // The volume came back with the snapshot; mirror its series so step 1
  // shows the study instead of an empty drop zone.
  planning.setSeries(r.series);
  if (r.has_segmentation && r.mesh_url) {
    planning.setSegmentation(restoredSegmentation(r));
  }
  // The centreline geometry comes back with the snapshot; without this the
  // store stays empty and the centreline-guided stent asks to extract one
  // that already exists (a ~30 s recomputation for nothing).
  if (r.centerline_mesh_url) {
    planning.setCenterlineMesh(r.centerline_mesh_url);
    planning.setCenterlineArcMm(r.centerline_arc_mm || null);
  }
  // Failures are non-fatal — the user can re-run a step.
  let restoredIds: string[] = [];
  // El backend tiró la medida al re-detectar: el sitio medido ya no está.
  let invalidated = false;
  if (r.current_step >= 2) {
    try {
      const det = await detection(r.session_id);
      planning.setCandidates(det.candidates);
      // Al reanudar puede no haber aceptados y sí descartados: el índice elegido los recorre.
      planning.setRejectedCandidates(det.rejected ?? []);
      planning.setSelectedCandidate(0);
      // La misma lista combinada que allCandidates: una morfometría medida
      // sobre un descartado también recupera su índice.
      restoredIds = [...det.candidates, ...(det.rejected ?? [])].map((c) => c.id);
      if (det.morphometry_invalidated === true) {
        invalidated = true;
        planning.setMorphoInvalidatedNotice(true);
      }
    } catch { /* leave candidates empty */ }
  }
  // Con la medida invalidada no se pide otra: sin elección guardada el
  // backend mediría cand-001 y la enseñaría como la de la sesión, aunque
  // sea otro sitio. El clínico vuelve a Detección, ve el aviso y elige.
  let morpho: MorphometryResult | null = null;
  if (r.current_step >= 3 && !invalidated) {
    try {
      // Sin id: el backend repite el candidato que se eligió al medir
      // (detect.selected_candidate). La selección se lleva a ese mismo
      // candidato ANTES de poner la medida, porque cambiar de selección
      // vacía la morfometría (y la decisión) del store.
      const m = await api.morphometry(r.session_id);
      const idx = m.candidate_id ? restoredIds.indexOf(m.candidate_id) : -1;
      if (idx > 0) planning.setSelectedCandidate(idx);
      planning.setMorphometry(m);
      morpho = m;
      // Put the hand-marked neck back in the scene. The measurement is
      // rebuilt from the stored plane either way, but the marks are what
      // the user actually placed, and re-marking a rim is real work.
      if (m.rim_points?.length) {
        planning.setNeckRim(m.rim_points.map((p) => [p.x, p.y, p.z] as [number, number, number]));
      }
      // El ápice también, y el punto de cuello cuando se marcó uno solo:
      // sin ellos «Medir saco cerrado» quedaba apagado tras reanudar y
      // había que volver a marcar para corregir una medida.
      if (m.dome_seed) planning.setNeckDome([m.dome_seed.x, m.dome_seed.y, m.dome_seed.z]);
      if (m.neck_source === "manual" && m.plane_origin) {
        planning.setNeckOrigin([m.plane_origin.x, m.plane_origin.y, m.plane_origin.z]);
      }
    } catch { /* leave morphometry empty */ }
  }
  // La decisión, DESPUÉS de elegir el candidato: cambiar la selección la
  // vacía. Sin ella «Planificar dispositivos» quedaba apagado (F1-27). Con la
  // medida invalidada el backend ya la borró.
  if (!invalidated) {
    if (r.treatment) planning.setTreatment(r.treatment);
    if (r.treatment_inputs) planning.setTreatmentInputs(r.treatment_inputs);
  }
  // El abordaje establecido con su análisis. Sin los puntos el visor no
  // dibujaba corredor y el ensayo de colocación caía a su aproximación por
  // defecto; sin el análisis el botón no decía «Guardada ✓» (F1-247).
  if (r.trajectory) {
    const tr = r.trajectory;
    planning.setTrajEntry([tr.entry[0], tr.entry[1], tr.entry[2]]);
    planning.setTrajTarget([tr.target[0], tr.target[1], tr.target[2]]);
    planning.setTrajSaved(tr);
  }
  // Los clips como fila editable, no solo como malla (F1-28): la lista es
  // también lo planificado (con ella se coció la malla guardada), así que la
  // pestaña no recoloca nada al montarse.
  // Con el tope de inclinación del store ya aplicado: si lo planificado no
  // fuera idéntico a la lista, la pestaña lo leería como un clip movido.
  const clips = (r.placed_clips?.clips ?? []).map(fromStoredClip)
    .filter((c): c is PlacedClip => c !== null)
    .map((c) => ({ ...c, ...clampTilt(c) }));
  const plan = r.placed_clips?.plan ?? null;
  // F1b-5: una lista sin verificación (guardado anterior a F1a, rehecha desde
  // los clips del informe) vuelve como fila editable «sin verificar»: nada
  // planificado ni malla, y «Colocar y verificar» ya está encendido.
  if (clips.length) planning.setPlacedClips(clips);
  if (clips.length && plan) {
    planning.setPlannedClips(clips);
    planning.setClipPlan(plan);
    planning.restoreDeviceMesh("clips", plan.clips_mesh_url);
    // El mapa de calor y su veredicto no se guardan (son mallas de la
    // colocación): se piden para la lista guardada, como hace el panel tras
    // colocar. Si falla, la lista y la verificación siguen en pie.
    try {
      const field = await api.clipField(r.session_id, {
        session_id: r.session_id, placements: clips.map((c) => toPlacement(morpho, c)),
      });
      planning.setClipField(field, clips);
    } catch { /* sin mapa; el panel lo vuelve a pedir al mover el clip */ }
  }
  // La ventana con que se dejaron los cortes (F1-248). El visor aún no ha
  // montado y sembrará la del DICOM al llegar la meta: esta la gana.
  planning.restoreWl(r.window ?? null);
  // El PDF y el SR que siguen en disco (F1-249).
  planning.setReportUrls(r.report_urls ?? null);
  // Las anotaciones vuelven por el setter «cargado»: no ensucian la sesión
  // ni disparan el guardado automático (ya están en disco).
  try {
    planning.setAnnotationsLoaded(await api.getAnnotations(r.session_id));
  } catch {
    // WHY no «sin anotaciones»: un fallo pasajero dejaba [] y la primera
    // anotación nueva se guardaba ENCIMA de todas las del disco. Con
    // «error» el guardado automático no escribe y el panel lo dice.
    planning.setAnnotationsLoadState("error");
  }
  // The store now mirrors what is on disk, so the session is NOT dirty: it
  // was, because rehydrating goes through the same setters a real edit does,
  // and resuming then immediately asked "tienes cambios sin guardar" before
  // the user had touched anything (F1-250).
  planning.markSaved();
  const step = clampStep(invalidated
    ? Math.min(r.current_step, STEPS.findIndex((s) => s.key === "detect"))
    : r.current_step);
  return { step, invalidated };
}
