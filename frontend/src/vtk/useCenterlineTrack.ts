/* Los puntos de la línea central los usan la gráfica de calibre y el recorrido
   VASO del Oblicuo. Si solo los pidiera el panel de la línea central, tras
   «Reanudar» el visor no tendría qué recorrer hasta abrir ese panel. */
import { useEffect } from "react";
import { api } from "../api/client";
import { usePlanning } from "../store/planning";
import { trackFromWire } from "./centerlineWalk";

/** Carga los puntos de la línea central cuando hay tubo y aún no están (tras extraer y tras «Reanudar»). Idempotente: el store los guarda una vez. */
export function useCenterlineTrack(): void {
  const { sessionId, centerlineMesh, centerline, setCenterline } = usePlanning();
  useEffect(() => {
    if (!sessionId || !centerlineMesh || centerline) return;
    let vivo = true;
    api.centerlinePoints(sessionId).then((w) => { if (vivo) setCenterline(trackFromWire(w)); }).catch(() => { /* sin puntos la gráfica no lleva a ningún sitio; lo demás sigue */ });
    return () => { vivo = false; };
  }, [sessionId, centerlineMesh, centerline, setCenterline]);
}
