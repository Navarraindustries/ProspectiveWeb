/* Meta del volumen de la sesión, compartida por todas las celdas del visor. */

import { useCallback, useEffect, useState } from "react";
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
/** Esperas antes de cada reintento. Un 500 suelto en la meta dejaba el visor
 *  en «CARGANDO…» para siempre (F1-8): se tragaba el error y nadie la volvía a
 *  pedir. Tras el último, `error` y el «Reintentar» del visor. */
export const META_RETRY_DELAYS_MS = [1000, 2000, 4000];

export interface VolumeMetaState {
  meta: VolumeMeta | null;
  forSession: string | null;
  /** El último error, una vez agotados los reintentos; null mientras se intenta. */
  error: string | null;
  /** Vuelve a pedirla (el «Reintentar» del visor). */
  retry: () => void;
}

export function useVolumeMeta(sessionId: string | null, volumeVersion = 0): VolumeMetaState {
  const [state, setState] = useState<{ meta: VolumeMeta | null; forSession: string | null; forVersion: number; error: string | null }>({ meta: null, forSession: null, forVersion: -1, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pedir = (intento: number) => {
      api
        .volumeMeta(sessionId)
        .then((m) => { if (!cancelled) setState({ meta: m, forSession: sessionId, forVersion: volumeVersion, error: null }); })
        .catch((e: unknown) => {
          if (cancelled) return;
          const espera = META_RETRY_DELAYS_MS[intento];
          if (espera !== undefined) {
            timer = setTimeout(() => pedir(intento + 1), espera);
            return;
          }
          setState({
            meta: null, forSession: sessionId, forVersion: volumeVersion,
            error: e instanceof Error ? e.message : "No se pudo abrir el volumen",
          });
        });
    };
    // Un «Reintentar» empieza limpio: sin el error de antes mientras pide.
    setState((s) => (s.error ? { ...s, error: null } : s));
    pedir(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId, volumeVersion, attempt]);
  // La versión también cuenta: al cambiar de serie (o reescribir el volumen)
  // la meta vieja describe un volumen que ya no es el de la sesión. Seguir
  // devolviéndola dejaba el visor pintando la serie anterior, con el rótulo
  // de la nueva, los veinte segundos que tarda el servidor en cargarla.
  return sessionId && state.forSession === sessionId && state.forVersion === volumeVersion
    ? { meta: state.meta, forSession: state.forSession, error: state.error, retry }
    : { meta: null, forSession: null, error: null, retry };
}
