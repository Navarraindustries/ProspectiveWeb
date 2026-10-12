import { useEffect, useState } from "react";
import type { ProgressState } from "../../api/types";
import { ProgressBar } from "../ProgressBar";

/** Fase y porcentaje de la segmentación, con aviso cuando el servidor va lento. */
export function SegmentProgress({ state, slowNote = "El servidor tarda: en un equipo pequeño la segmentación lleva minutos." }: {
  state: ProgressState | null;
  /** Lo que se dice cuando la fase no avanza en 10 s. */
  slowNote?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [state?.phase]);
  const pct = state ? Math.round(state.pct) : 0;
  return (
    <div style={{ marginTop: 18 }}>
      {/* F1-136: el rótulo era la fase interna («TUBULARIDAD 3/6»), que no le
          dice nada a quien espera. Lo que necesita saber es que avanza y
          cuánto suele durar; las fases quedan plegadas para quien las quiera.
          Solo el rótulo se anuncia: leer cada cambio de fase sería ruido. */}
      <div aria-live="polite" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--foreground)", marginBottom: 6 }}>
        <span>Segmentando… suele tardar menos de un minuto</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{pct} %</span>
      </div>
      <ProgressBar value={state ? state.pct : undefined} />
      <details style={{ marginTop: 6, fontSize: 11, color: "var(--muted-foreground)" }}>
        <summary style={{ cursor: "pointer" }}>Fases</summary>
        <div style={{ fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase", marginTop: 4 }}>
          {state?.phase || "preparando"}
        </div>
      </details>
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
