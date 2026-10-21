/* Aviso de que las cuentas pendientes cambiaron.

   La barra lateral cuenta las pendientes cada minuto; «Cuentas pendientes» lanza
   este aviso al aprobar o rechazar para que la insignia se ponga al día al
   momento. Es un evento del `window` y no un contexto: la página y la barra
   viven en ramas distintas del árbol y no comparten estado. */
export const PENDING_CHANGED_EVENT = "prospective:pending-changed";
