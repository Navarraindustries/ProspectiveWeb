/* Horas del servidor mostradas en la hora de quien mira.

   El servidor guarda todo en UTC, pero Pydantic serializa un datetime sin zona
   como «2026-10-11T05:05:09», y el navegador lo lee como hora local: una sesión
   guardada a las 00:05 en Bogotá aparecía a las 05:05. Aquí se lee ese texto
   como UTC y se muestra en la zona del navegador. */

/** Zona por defecto: la del navegador. Las pruebas pasan una fija para no depender de la máquina. */
export type OpcionesFecha = { timeZone?: string };

const SIN_DATO = "—";
// Ya trae zona: «Z» o un desfase ±hh:mm / ±hhmm al final.
const CON_ZONA = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Un ISO sin zona es UTC (así lo guarda el servidor); uno con zona se respeta. */
export function desdeServidor(iso: string): Date {
  const t = iso.trim();
  // Solo la fecha («2026-10-11») no es un instante: se deja al parser, que ya la toma como UTC.
  const aislado = /T|\s\d{2}:/.test(t) && !CON_ZONA.test(t) ? `${t.replace(" ", "T")}Z` : t;
  return new Date(aislado);
}

function formatear(iso: string | null | undefined, fmt: Intl.DateTimeFormatOptions, o?: OpcionesFecha): string {
  if (!iso) return SIN_DATO;
  const d = desdeServidor(iso);
  if (Number.isNaN(d.getTime())) return SIN_DATO;
  return d.toLocaleString("es-ES", { ...fmt, ...(o?.timeZone ? { timeZone: o.timeZone } : {}) });
}

/** «11/10/26, 0:05» */
export function fechaHora(iso: string | null | undefined, o?: OpcionesFecha): string {
  return formatear(iso, { dateStyle: "short", timeStyle: "short" }, o);
}

/** «11/10/26» */
export function fecha(iso: string | null | undefined, o?: OpcionesFecha): string {
  return formatear(iso, { dateStyle: "short" }, o);
}

/** «AAAA-MM-DD» del día local: `toISOString` da el de UTC, que a las 19:00 en UTC−5 ya es mañana. */
export function hoyLocal(ahora: Date = new Date(), o?: OpcionesFecha): string {
  // «sv-SE» da justo AAAA-MM-DD, el formato que pide <input type="date">.
  return ahora.toLocaleDateString("sv-SE", o?.timeZone ? { timeZone: o.timeZone } : undefined);
}
