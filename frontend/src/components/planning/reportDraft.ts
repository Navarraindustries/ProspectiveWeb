/* Lo que se escribe en el paso Informe, mientras dure la sesión.

   El panel se desmonta al cambiar de paso y su estado local se iba con él:
   volver de «Dispositivos» dejaba las notas clínicas en blanco, el cirujano en
   el de la cuenta y las capturas sin marcar. Se guarda aquí, por sesión, en
   memoria de la pestaña: no viaja al servidor ni sobrevive a recargar. */

export interface ReportDraft {
  surgeon: string;
  notes: string;
  captureIds: number[];
  includeShot: boolean;
}

const drafts = new Map<string, ReportDraft>();

export function readReportDraft(sessionId: string | null): ReportDraft | null {
  return sessionId ? drafts.get(sessionId) ?? null : null;
}

export function writeReportDraft(sessionId: string | null, draft: ReportDraft): void {
  if (sessionId) drafts.set(sessionId, draft);
}

/** Para las pruebas: cada una empieza sin borradores de la anterior. */
export function clearReportDrafts(): void {
  drafts.clear();
}
