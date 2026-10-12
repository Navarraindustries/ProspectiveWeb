/* Banda fija de «servidor caído» (F1-26).

   La auditoría vio morir el backend tras reanudar y la app no dijo nada: cada
   panel fallaba por su lado («Failed to fetch», un «CARGANDO…» eterno) y la
   persona no sabía que el problema era el servidor ni que su sesión seguía en
   disco. El cliente avisa tras dos fallos de conexión seguidos; la banda se
   retira sola con la primera respuesta. */
import { useEffect, useState } from "react";
import { onServerDown, retryLastFailed } from "../api/client";
import { Button } from "./Button";

export const SERVER_DOWN_TEXT =
  "El servidor no responde. Tu sesión sigue en disco: reinícialo y pulsa «Reintentar»";

export function ServerDownBanner() {
  const [down, setDown] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => onServerDown(setDown), []);
  if (!down) return null;

  const reintentar = async () => {
    setRetrying(true);
    try {
      await retryLastFailed();
    } catch {
      /* sigue caído: la banda se queda */
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        padding: "10px 18px",
        background: "var(--destructive)", color: "var(--background)",
        fontSize: 13, fontWeight: 600, boxShadow: "var(--shadow-lg)",
      }}
    >
      <span>{SERVER_DOWN_TEXT}</span>
      <Button size="sm" variant="outline" disabled={retrying} onClick={() => void reintentar()}>
        Reintentar
      </Button>
    </div>
  );
}
