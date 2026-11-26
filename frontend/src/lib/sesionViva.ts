/* FE-9: la sesión de trabajo abierta en ESTA pestaña, para volver a ella si se
   recarga la página. El store vive en memoria y se perdía entero; la sesión
   seguía viva en el servidor, pero nada la volvía a abrir.

   sessionStorage y no localStorage: es de esta pestaña (dos pestañas pueden
   llevar dos sesiones) y se va al cerrarla. Solo ids y el paso, nada clínico.
   Un fallo del almacenamiento (modo privado, cuota) no rompe nada: se pierde
   la vuelta, como antes. */

const CLAVE = "prospective.sesionViva";

export interface SesionViva {
  sessionId: string;
  paso: number;
  patientId: number | null;
  userId: number;
}

export function recordarSesionViva(s: SesionViva): void {
  try { sessionStorage.setItem(CLAVE, JSON.stringify(s)); } catch { /* sin almacenamiento: sin vuelta */ }
}

export function leerSesionViva(): SesionViva | null {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SesionViva>;
    if (typeof s.sessionId !== "string" || typeof s.userId !== "number") return null;
    return { sessionId: s.sessionId, paso: Number(s.paso) || 0, patientId: s.patientId ?? null, userId: s.userId };
  } catch {
    return null;
  }
}

export function olvidarSesionViva(): void {
  try { sessionStorage.removeItem(CLAVE); } catch { /* nada que olvidar */ }
}
