/* Los tres estados de una lista que se carga: «Cargando…», el error con
   «Reintentar», o el texto de vacío que da cada pantalla.

   Familia A de la auditoría: las pantallas de gestión trataban un fallo al
   cargar como una lista vacía. Con el servidor caído, «Pacientes» decía
   «0 registros» y «No hay pacientes registrados», «Solicitudes» enseñaba la
   marca verde de «todo al día» y «Auditoría» decía que la cadena estaba
   vacía: la persona creía haber perdido datos, o que no había nada que hacer.
   Aquí el error se dice en el sitio de la lista y se puede reintentar sin
   recargar la página. La banda de «servidor caído» (ServerDownBanner) es el
   aviso global; esto es el local, de cada lista.

   No importa el cliente del API a propósito: las pruebas de cada página lo
   simulan con `vi.mock`, y el texto del error se deduce de la forma del objeto
   (`status`, `fromServer`) que lanza `ApiError`. Los textos de conexión salen
   de api/connectionText.ts, el mismo módulo que usa el cliente, que no importa
   nada y por eso sobrevive a esa simulación. */

import { NO_RESPONDE, SIN_CONEXION } from "../api/connectionText";
import { Button } from "./Button";

export type LoadStatus = "cargando" | "error" | "vacio";

/** El texto de un fallo de carga, en castellano y sin jerga del navegador. */
export function loadErrorText(e: unknown): string {
  if (e instanceof Error) {
    const err = e as Error & { status?: number; fromServer?: boolean };
    // `fetch` sin red lanza un TypeError («Failed to fetch»): es conexión.
    if (e instanceof TypeError) return SIN_CONEXION;
    if (err.fromServer === false) {
      // Status 0 ya trae «Sin conexión…» o «El servidor no responde»;
      // un 5xx sin `detail` es el proxy con el backend caído.
      // El 500 sin cuerpo del proxy: «Error 500» no le dice nada a quien lo lee.
      return err.status === 0 && e.message ? e.message : NO_RESPONDE;
    }
    if (e.message) return e.message;
  }
  return "No se pudo cargar";
}

export function LoadState({
  state,
  mensaje,
  onRetry,
}: {
  state: LoadStatus;
  /** El texto del error (ver `loadErrorText`) o el del vacío. */
  mensaje?: string;
  onRetry?: () => void;
}) {
  if (state === "cargando") {
    return (
      <div role="status" style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
        Cargando…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div
        role="alert"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap",
          padding: "20px 16px", fontSize: 13, color: "var(--destructive)",
        }}
      >
        <span>{mensaje || "No se pudo cargar"}</span>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
      {mensaje}
    </div>
  );
}
