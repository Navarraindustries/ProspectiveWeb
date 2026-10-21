/* Qué decir cuando una petición falla, según si el servidor llegó a contestar.

   Vive aparte de api/client.ts a propósito: las pruebas de cada pantalla
   simulan el cliente con `vi.mock`, y estas funciones tienen que seguir
   funcionando con esa simulación. Por eso miran la forma del error
   (`status`, `fromServer`, como los pone `ApiError`) y no su clase. */

/** Familia Y (F1-41, F1-50, F1-51): el aviso de «Entrar», «Crear cuenta» y el
 *  cambio obligatorio de contraseña cuando el servidor no contesta. Antes decía
 *  «¿Está el backend en marcha?»: una palabra que el médico no tiene por qué
 *  conocer, sobre algo que no está en su mano arrancar. */
export const SERVER_UNREACHABLE_TEXT = "El servidor no responde. Avisa al responsable de la instalación.";

type MaybeApiError = Error & { status?: unknown; fromServer?: unknown };

/** ¿Falló sin que el backend contestara? `fetch` sin red (TypeError), el
 *  ApiError 0 de la conexión o del límite, y el 5xx vacío del proxy. */
export function noServerAnswer(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  if (err instanceof TypeError) return true;
  const e = err as MaybeApiError;
  return e.fromServer === false || e.status === 0;
}

/** El texto de un fallo al enviar algo: el aviso de conexión si no hubo
 *  respuesta; si la hubo, lo que dijo el servidor, y «Error NNN» a secas
 *  (un cuerpo sin detalle) se reescribe porque no le dice nada a un médico. */
export function serverErrorText(err: unknown): string {
  if (noServerAnswer(err)) return SERVER_UNREACHABLE_TEXT;
  const e = err as MaybeApiError;
  const bare = /^Error (\d+)$/.exec(e.message);
  if (bare) {
    const code = typeof e.status === "number" ? e.status : Number(bare[1]);
    return `El servidor respondió con el error ${code} y sin más detalle. Inténtalo de nuevo en unos minutos.`;
  }
  return e.message || SERVER_UNREACHABLE_TEXT;
}
