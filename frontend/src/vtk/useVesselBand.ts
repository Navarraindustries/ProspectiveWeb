/* La banda de intensidades de los vasos, una sola para toda la app.

   Antes «Vasos» (preajustes de los cortes) se construía con
   `[threshold_lower, NaN]` al acabar de segmentar y `windowPresets` lo
   descartaba por el NaN: el preajuste existía mientras se ajustaba el umbral y
   desaparecía justo cuando el estudio quedaba segmentado. El techo sí existe
   en el servidor (`suggested-band.vmax` = máx(p99,9, techo de la banda), que
   incluye los núcleos brillantes de una DSA); se pide una vez por volumen. */
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SegmentResult } from "../api/types";

/** [suelo, techo] en intensidades del volumen. */
export type VesselBand = [number, number];

export function useVesselBand(sessionId: string | null, segmentation: SegmentResult | null, volumeVersion = 0): VesselBand | null {
  const [state, setState] = useState<{ forSession: string | null; forVersion: number; suggested: { lower: number; vmax: number } | null }>({ forSession: null, forVersion: -1, suggested: null });
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    api.suggestedBand(sessionId)
      .then((b) => { if (!cancelled) setState({ forSession: sessionId, forVersion: volumeVersion, suggested: { lower: b.lower, vmax: b.vmax } }); })
      // Sin banda no hay «Vasos»: mejor que un preajuste inventado. No se
      // reintenta hasta cambiar de sesión o de volumen.
      .catch(() => { if (!cancelled) setState({ forSession: sessionId, forVersion: volumeVersion, suggested: null }); });
    return () => { cancelled = true; };
  }, [sessionId, volumeVersion]);
  if (!sessionId || state.forSession !== sessionId || state.forVersion !== volumeVersion || !state.suggested) return null;
  // El suelo es el umbral con el que se segmentó, si lo hay: es lo que el
  // profesional decidió que es vaso en ESTE estudio.
  const lo = segmentation?.threshold_lower ?? state.suggested.lower;
  const hi = state.suggested.vmax;
  return hi > lo ? [lo, hi] : null;
}
