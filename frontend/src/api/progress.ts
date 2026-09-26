/* Progreso de un trabajo largo: WebSocket cuando el proxy lo deja pasar, GET
   cada medio segundo cuando no (Amplify y algunos proxies no reenvían WS). El
   panel no distingue una vía de otra. */

import { useEffect, useState } from "react";
import { api, getToken } from "./client";
import type { ProgressState } from "./types";
export type { ProgressState };

const finished = (s: ProgressState) => !s.running && s.ok !== null;

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

  const poll = async () => {
    if (stopped) return;
    try {
      const s = await fetchState(sessionId);
      if (stopped) return;
      onState(s);
      if (finished(s)) { stopped = true; return; }
    } catch { /* el siguiente intento lo dirá */ }
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
    if (!sessionId || !active) { setState(null); return; }
    return watchProgress(sessionId, setState);
  }, [sessionId, active]);
  return state;
}
