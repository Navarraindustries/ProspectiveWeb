/* Quién puede salir propuesto como «Cirujano responsable».

   F1-221 (informe) y F1b-2 (pedido de clips): el campo arrancaba con el nombre
   de la cuenta, y la del administrador firmaba como «Administrador». Solo se
   propone el nombre de quien puede ser el cirujano —médico o residente— y lo
   tiene; en cualquier otro caso el campo arranca vacío y hay que escribirlo.
   Una sola regla para los dos formularios, para que no vuelvan a discrepar. */

export type SurgeonCandidate = { role?: string | null; full_name?: string | null } | null | undefined;

export function surgeonPrefill(user: SurgeonCandidate): string {
  const name = user?.full_name?.trim() ?? "";
  return name && (user?.role === "medico" || user?.role === "residente") ? name : "";
}
