/* Meta del volumen de la sesión, compartida por todas las celdas del visor. */

import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { VolumeMeta } from "../api/types";

/* Load the volume meta once per session; shared by every pane.

   The meta is stored with the session it was fetched for and only handed out
   while that is still the current session. Clearing it inside the effect left
   one commit, the one where sessionId changes, in which every consumer saw
   the previous study's meta; the orientation seeding took it for the new one.

   `volumeVersion` sube cuando el volumen cambia dentro de la misma sesión
   (otra serie, preproceso, reversión): se vuelve a pedir la meta y su
   cache_key nuevo recarga el volumen del navegador. */
export function useVolumeMeta(sessionId: string | null, volumeVersion = 0): { meta: VolumeMeta | null; forSession: string | null } {
  const [state, setState] = useState<{ meta: VolumeMeta | null; forSession: string | null }>({ meta: null, forSession: null });
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    api
      .volumeMeta(sessionId)
      .then((m) => { if (!cancelled) setState({ meta: m, forSession: sessionId }); })
      .catch(() => { if (!cancelled) setState({ meta: null, forSession: sessionId }); });
    return () => { cancelled = true; };
  }, [sessionId, volumeVersion]);
  return sessionId && state.forSession === sessionId ? state : { meta: null, forSession: null };
}
