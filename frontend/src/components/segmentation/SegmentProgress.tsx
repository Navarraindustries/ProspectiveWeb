import { useEffect, useState } from "react";
import type { ProgressState } from "../../api/types";
import { Icon } from "../Icon";
import { ProgressBar } from "../ProgressBar";

/** Redondeo del tiempo restante a múltiplos de 5 s: más fino sería falsa precisión. */
const round5 = (s: number) => Math.round(s / 5) * 5;

type Track = { rows: { phase: string; message: string }[]; startedAt: number | null; lastPct: number };
const EMPTY_TRACK: Track = { rows: [], startedAt: null, lastPct: 0 };

/** Siguiente seguimiento a partir del estado. Sin estado, o con un porcentaje
 *  que baja (pasada nueva), se parte de cero. Devuelve el mismo objeto si nada cambia. */
function advance(track: Track, state: ProgressState | null): Track {
  if (!state) return track === EMPTY_TRACK ? track : EMPTY_TRACK;
  const base = state.pct < track.lastPct ? EMPTY_TRACK : track;
  const startedAt = base.startedAt ?? Date.now();
  const known = base.rows.some((r) => r.phase === state.phase);
  const rows = known
    ? base.rows.map((r) => (r.phase === state.phase ? { ...r, message: state.message } : r))
    : [...base.rows, { phase: state.phase, message: state.message }];
  const same = base === track && startedAt === track.startedAt && state.pct === track.lastPct
    && rows.every((r, i) => r.message === track.rows[i]?.message) && rows.length === track.rows.length;
  return same ? track : { rows, startedAt, lastPct: state.pct };
}

/** Fase y porcentaje de la segmentación, con aviso cuando el servidor va lento. */
export function SegmentProgress({
  state,
  slowNote = "El servidor tarda: en un equipo pequeño la segmentación lleva minutos.",
  headline = "Segmentando… suele tardar menos de un minuto",
}: {
  state: ProgressState | null;
  /** Rótulo principal. La detección usa esta misma barra: con el de la
   *  segmentación, el paso 3 decía «Segmentando…» mientras detectaba. */
  headline?: string;
  /** Lo que se dice cuando la fase no avanza en 10 s. */
  slowNote?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [state?.phase]);
  // Fases vistas, en orden, con su último mensaje, y cuándo empezó la pasada.
  // Se derivan en render con el patrón de «estado derivado» (setState durante
  // el render contra el estado previo): es determinista salvo por Date.now() y no le afecta el doble
  // render de StrictMode, y la lista sale al día en el mismo commit.
  const [track, setTrack] = useState<Track>(EMPTY_TRACK);
  const next = advance(track, state);
  if (next !== track) setTrack(next);
  const pct = state ? Math.round(state.pct) : 0;
  const elapsedS = next.startedAt === null ? 0 : (Date.now() - next.startedAt) / 1000;
  // Solo con un porcentaje que ya dice algo (≥ 5 %) y algo de historia (≥ 3 s).
  const remainingS = state && state.pct >= 5 && elapsedS >= 3
    ? round5((elapsedS / state.pct) * (100 - state.pct))
    : null;
  const rows = next.rows.length > 0 ? next.rows : [{ phase: "preparando", message: "" }];
  const currentPhase = state ? state.phase : "preparando";
  return (
    <div style={{ marginTop: 18 }}>
      {/* F1-136: el rótulo era la fase interna («TUBULARIDAD 3/6»), que no le
          dice nada a quien espera. Lo que necesita saber es que avanza y
          cuánto suele durar; las fases van en una lista debajo.
          Solo el rótulo se anuncia: leer cada cambio de fase sería ruido. */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--foreground)", marginBottom: 6 }}>
        {/* Solo el rótulo es región viva: con el porcentaje dentro se
            anunciaba cada punto que avanzaba. */}
        <span aria-live="polite">{headline}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{pct} %</span>
      </div>
      <ProgressBar marca value={state ? state.pct : undefined} />
      {/* Las fases vistas: las anteriores con marca y su mensaje, la actual con
          punto. Sustituye al «Fases» plegado: la espera enseña qué ocurre. */}
      <ol
        className="ws-phases"
        style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}
      >
        {rows.map((r, i) => {
          const current = r.phase === currentPhase;
          return (
            <li key={`${i}-${r.phase}`} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11 }}>
              <span aria-hidden style={{ width: 14, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
                {current ? (
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: "50%", background: "var(--primary)",
                      animation: "ws-pulse 1.2s ease-in-out infinite",
                    }}
                  />
                ) : (
                  <Icon name="STATUS_OK" size={12} color="var(--success)" />
                )}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "lowercase",
                  color: current ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {r.phase}
              </span>
              {!current && r.message && (
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{r.message}</span>
              )}
            </li>
          );
        })}
      </ol>
      {remainingS !== null && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
          ≈ {remainingS} s restantes
        </div>
      )}
      {/* Genérico a propósito: bajo el 5 % se está en «carga» o «núcleo», o en
          el umbral clásico, que no calcula tubularidad; culparla ahí era falso. */}
      {slow && pct < 5 && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
          {slowNote}
        </div>
      )}
    </div>
  );
}
