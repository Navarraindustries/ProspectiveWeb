import { useEffect, useRef, useState } from "react";
import type { ProgressState } from "../../api/types";
import { Icon } from "../Icon";
import { ProgressBar } from "../ProgressBar";

/** Redondeo del tiempo restante a múltiplos de 5 s: más fino sería falsa precisión. */
const round5 = (s: number) => Math.round(s / 5) * 5;

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
  // Fases vistas, en orden, con su último mensaje. Se acumula en render (es
  // idempotente: repetir el mismo estado no cambia nada).
  const phases = useRef<{ phase: string; message: string }[]>([]);
  const startedAt = useRef<number | null>(null);
  if (state) {
    if (startedAt.current === null) startedAt.current = Date.now();
    const last = phases.current[phases.current.length - 1];
    if (!last || last.phase !== state.phase) {
      phases.current.push({ phase: state.phase, message: state.message });
    } else {
      last.message = state.message;
    }
  }
  const pct = state ? Math.round(state.pct) : 0;
  const elapsedS = startedAt.current === null ? 0 : (Date.now() - startedAt.current) / 1000;
  // Solo con un porcentaje que ya dice algo (≥ 5 %) y algo de historia (≥ 3 s).
  const remainingS = state && state.pct >= 5 && elapsedS >= 3
    ? round5((elapsedS / state.pct) * (100 - state.pct))
    : null;
  const rows = phases.current.length > 0 ? phases.current : [{ phase: "preparando", message: "" }];
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
      <ProgressBar value={state ? state.pct : undefined} />
      {/* Las fases vistas: las anteriores con marca y su mensaje, la actual con
          punto. Sustituye al «Fases» plegado: la espera enseña qué ocurre. */}
      <ol
        className="ws-phases"
        style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}
      >
        {rows.map((r, i) => {
          const current = i === rows.length - 1;
          return (
            <li key={`${i}-${r.phase}`} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11 }}>
              <span aria-hidden style={{ width: 14, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
                {current ? (
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: "50%", background: "var(--primary)",
                      animation: "pulse 1.2s ease-in-out infinite",
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
