/* Los puntos de la línea central los usan la gráfica de calibre y el recorrido
   VASO del Oblicuo. Si solo los pidiera el panel de la línea central, tras
   «Reanudar» el visor no tendría qué recorrer hasta abrir ese panel. */
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { usePlanning } from "../store/planning";
import { trackFromWire } from "./centerlineWalk";

/** Carga los puntos de la línea central cuando hay tubo y aún no están (tras extraer y tras «Reanudar»). Idempotente: el store los guarda una vez.
 *  Devuelve `true` solo si el servidor no tiene puntos para ese tubo: entonces
 *  el visor pinta el tubo del servidor. Mientras cargan, `false`; añadir el tubo
 *  y quitarlo al llegar los puntos rehacía la escena 3D dos veces seguidas. */
export function useCenterlineTrack(): boolean {
  const { sessionId, centerlineMesh, centerline, setCenterline } = usePlanning();
  const [sinPuntos, setSinPuntos] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId || !centerlineMesh || centerline) return;
    let vivo = true;
    api.centerlinePoints(sessionId)
      .then((w) => { if (vivo) setCenterline(trackFromWire(w)); })
      .catch(() => { if (vivo) setSinPuntos(centerlineMesh); /* sin puntos la gráfica no lleva a ningún sitio; lo demás sigue */ });
    return () => { vivo = false; };
  }, [sessionId, centerlineMesh, centerline, setCenterline]);
  return !!centerlineMesh && !centerline && sinPuntos === centerlineMesh;
}
