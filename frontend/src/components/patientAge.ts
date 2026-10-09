/* La edad del paciente a partir de su fecha de nacimiento, una sola vez para
   Decisión, PHASES, ELAPSS y UIATS (spec §8). "" si no hay fecha o no vale. */
export function ageFromDob(dob?: string | null): string {
  if (!dob) return "";
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years <= 120 ? String(years) : "";
}
