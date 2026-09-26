/* Progreso de un trabajo largo: WebSocket cuando el proxy lo deja pasar, GET
   cada medio segundo cuando no (Amplify y algunos proxies no reenvían WS). El
   panel no distingue una vía de otra. */

import { useEffect, useState } from "react";
import { ApiError, api, getToken } from "./client";
import type { ProgressState } from "./types";
export type { ProgressState };

const finished = (s: ProgressState) => !s.running && s.ok !== null;

// Cinco intentos de GET seguidos sin respuesta (o un 401/404, que no se va a
// arreglar reintentando) y se rinde: sin esto un token vencido o una sesión
// que ya no existe hacían que el cliente golpeara el backend cada pollMs para
// siempre sin que nadie se enterara.
const MAX_POLL_FAILURES = 5;
const CONNECTION_LOST: ProgressState = {
  phase: "",
  pct: 0,
  running: false,
  ok: false,
  message: "Sin conexión con el progreso del servidor",
};

function wsUrl(sessionId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/progress/${sessionId}?token=${encodeURIComponent(getToken() ?? "")}`;
}

export function watchProgress(
  sessionId: string,
  onState: (s: ProgressState) => void,
  opts: { pollMs?: number; wsFactory?: (url: string) => WebSocket; fetchState?: (sid: string) => Promise<ProgressState> } = {},
): () => void {
  const pollMs = opts.pollMs ?? 500;
  const make = opts.wsFactory ?? ((u: string) => new WebSocket(u));
  const fetchState = opts.fetchState ?? ((sid: string) => api.progress(sid));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ws: WebSocket | null = null;
  let consecutiveFailures = 0;

  const giveUp = () => { stopped = true; onState(CONNECTION_LOST); };

  const poll = async () => {
    if (stopped) return;
    try {
      const s = await fetchState(sessionId);
      if (stopped) return;
      consecutiveFailures = 0;
      onState(s);
      if (finished(s)) { stopped = true; return; }
    } catch (err) {
      // Igual que en el camino de éxito: si stop() llegó mientras el GET
      // estaba en vuelo (p. ej. useProgress cambiando de sesión), este
      // sondeo ya es de otra vida y no debe emitir nada, ni el estado
      // terminal, sobre el vigilante actual.
      if (stopped) return;
      // Un 401/404 no se arregla reintentando: el token venció o la sesión ya
      // no existe (el propio request() ya deslogueó en el caso del 401).
      const hardFailure = err instanceof ApiError && (err.status === 401 || err.status === 404);
      consecutiveFailures += 1;
      if (hardFailure || consecutiveFailures >= MAX_POLL_FAILURES) { giveUp(); return; }
    }
    if (!stopped) timer = setTimeout(poll, pollMs);
  };
  // Se llama desde onerror/onclose: si ya hay un polling en marcha (timer no
  // nulo) no se arranca uno nuevo, así el respaldo no duplica llamadas.
  const fallback = () => { if (!stopped && timer === null) void poll(); };

  try {
    ws = make(wsUrl(sessionId));
    ws.onmessage = (e) => {
      if (stopped) return;
      const s = JSON.parse(String(e.data)) as ProgressState;
      onState(s);
      if (finished(s)) { stopped = true; ws?.close(); }
    };
    ws.onerror = () => { ws = null; fallback(); };
    ws.onclose = () => { if (!stopped) { ws = null; fallback(); } };
  } catch {
    fallback();
  }
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try { ws?.close(); } catch { /* ya cerrado */ }
  };
}

export function useProgress(sessionId: string | null, active: boolean): ProgressState | null {
  const [state, setState] = useState<ProgressState | null>(null);
  useEffect(() => {
    // Se limpia siempre, no solo cuando falta sesión: sin esto, cambiar de
    // sesión con el panel ya activo dejaba ver la fase/porcentaje de la
    // sesión anterior hasta que llegara el primer mensaje de la nueva.
    setState(null);
    if (!sessionId || !active) return;
    return watchProgress(sessionId, setState);
  }, [sessionId, active]);
  return state;
}
