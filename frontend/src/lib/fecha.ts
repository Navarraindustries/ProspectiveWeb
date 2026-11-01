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

/** «09:05»: la hora de un instante del navegador (no del servidor), p. ej. la
 *  de un guardado recién hecho. «Guardado ✓» se borraba a los 1,8 s y no
 *  decía cuándo; con la hora queda a la vista hasta el próximo cambio (F1-109). */
export function hora(d: Date = new Date(), o?: OpcionesFecha): string {
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", ...(o?.timeZone ? { timeZone: o.timeZone } : {}) });
}

/** Un día sin hora («2026-10-30» o el DICOM «20261030») → «30/10/26», SIN cambio de zona:
 *  el día escrito es el día (`fecha("2026-10-30")` en UTC−5 daría el 29). Con hora (ISO con
 *  «T») delega en `fecha()`. Vacío → «—». Texto libre que no es fecha → tal cual. */
export function fechaDia(valor: string | null | undefined, o?: OpcionesFecha): string {
  if (!valor || !valor.trim()) return SIN_DATO;
  const t = valor.trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(t);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-ES", { dateStyle: "short", timeZone: "UTC" });
  }
  const f = fecha(t, o);
  return f === SIN_DATO ? t : f;
}

/** Segundos Unix (talleres y pedidos) → «26/10/24» o, con `conHora`, «26/10/24, 22:33». 0/null → «—». */
export function fechaEpoch(seg: number | null | undefined, o?: OpcionesFecha & { conHora?: boolean }): string {
  if (!seg) return SIN_DATO;
  const d = new Date(seg * 1000);
  if (Number.isNaN(d.getTime())) return SIN_DATO;
  return d.toLocaleString("es-ES", {
    dateStyle: "short",
    ...(o?.conHora ? { timeStyle: "short" as const } : {}),
    ...(o?.timeZone ? { timeZone: o.timeZone } : {}),
  });
}

/** Sello para un nombre de fichero: «20261030-0905» en la zona de quien mira
 *  (el servidor manda UTC sin zona). Si el texto no es una fecha → «sin-fecha». */
export function selloArchivo(iso: string, o?: OpcionesFecha): string {
  const d = desdeServidor(iso ?? "");
  if (Number.isNaN(d.getTime())) return "sin-fecha";
  const zona = o?.timeZone ? { timeZone: o.timeZone } : {};
  // «sv-SE» da AAAA-MM-DD y HH:MM en 24 h; se quitan los separadores.
  return d.toLocaleDateString("sv-SE", zona).replace(/-/g, "")
    + "-" + d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false, ...zona }).replace(/:/g, "");
}

/** Cómo se pinta una fecha en las páginas de gestión: un solo criterio, en sans
 *  (no en mono, que queda para cifras y códigos) con cifras tabulares para que
 *  las columnas de fechas alineen. */
export const ESTILO_FECHA = { fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" } as const;
