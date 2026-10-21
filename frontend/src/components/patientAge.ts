/* La edad del paciente a partir de su fecha de nacimiento, una sola vez para
   Decisión, PHASES, ELAPSS y UIATS (spec §8). "" si no hay fecha o no vale. */
export function ageFromDob(dob?: string | null, today: Date = new Date()): string {
  if (!dob) return "";
  // «AAAA-MM-DD» es un día del calendario, no un instante: `new Date` lo toma
  // como medianoche UTC y los getters locales lo leían como el día anterior al
  // oeste de UTC, así que la edad subía un día antes del cumpleaños.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  const born = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(dob);
  if (Number.isNaN(born.getTime())) return "";
  let years = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years <= 120 ? String(years) : "";
}
