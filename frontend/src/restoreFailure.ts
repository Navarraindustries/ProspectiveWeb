/* Qué decir cuando «Reanudar» falla (F1-24, F1-25).

   Con el servidor caído, «Restaurando sesión…» se quedaba para siempre; ahora
   la petición tiene límite (api/client.ts) y aquí se decide el texto y si
   «Reintentar» tiene sentido: sí cuando el servidor no respondió o falló al
   copiar (la guardada sigue en disco), no cuando la sesión ya no existe. */
import { ApiError } from "./api/client";

export const RESTORE_NO_SERVER = "No se pudo restaurar; el servidor no responde";

export function restoreFailure(e: unknown): { text: string; retry: boolean } {
  // Sin conexión, colgado, o el 500 vacío del proxy con el backend caído: en
  // ninguno «Error 500» explica nada.
  if (e instanceof ApiError && !e.fromServer) return { text: RESTORE_NO_SERVER, retry: true };
  const text = e instanceof Error ? e.message : "No se pudo restaurar la sesión";
  return { text, retry: e instanceof ApiError && e.status >= 500 };
}
