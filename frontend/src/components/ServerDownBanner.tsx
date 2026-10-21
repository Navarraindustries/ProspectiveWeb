/* Banda fija de «servidor caído» (F1-26).

   La auditoría vio morir el backend tras reanudar y la app no dijo nada: cada
   panel fallaba por su lado («Failed to fetch», un «CARGANDO…» eterno) y la
   persona no sabía que el problema era el servidor ni que su sesión seguía en
   disco. El cliente avisa tras dos fallos de conexión seguidos; la banda se
   retira sola con la primera respuesta.

   «Reintentar» es un sondeo (api/client.ts, retryLastFailed): repite una
   lectura, pero nunca una escritura —pudo hacerse ya en el backend—. Si lo
   que falló era una escritura, se dice que el servidor volvió y que la
   acción se repite desde su panel. */
import { useEffect, useState } from "react";
import { onServerDown, retryLastFailed } from "../api/client";
import { Button } from "./Button";

export const SERVER_DOWN_TEXT =
  "El servidor no responde. Tu sesión sigue en disco: reinícialo y pulsa «Reintentar»";
export const SERVER_BACK_TEXT = "El servidor responde de nuevo; repite la acción que falló";

const bandStyle = (bg: string) => ({
  position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 300,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
  padding: "10px 18px",
  background: bg, color: "var(--background)",
  fontSize: 13, fontWeight: 600, boxShadow: "var(--shadow-lg)",
});

export function ServerDownBanner() {
  const [down, setDown] = useState(false);
  const [back, setBack] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => onServerDown((d) => { setDown(d); if (d) setBack(false); }), []);

  const reintentar = async () => {
    setRetrying(true);
    try {
      if ((await retryLastFailed()) === "probed") setBack(true);
    } catch {
      /* sigue caído: la banda se queda */
    } finally {
      setRetrying(false);
    }
  };

  if (down) {
    return (
      <div role="alert" style={bandStyle("var(--destructive)")}>
        <span>{SERVER_DOWN_TEXT}</span>
        <Button size="sm" variant="outline" disabled={retrying} onClick={() => void reintentar()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (back) {
    return (
      <div role="status" style={bandStyle("var(--foreground)")}>
        <span>{SERVER_BACK_TEXT}</span>
        <Button size="sm" variant="outline" onClick={() => setBack(false)}>
          Entendido
        </Button>
      </div>
    );
  }
  return null;
}
