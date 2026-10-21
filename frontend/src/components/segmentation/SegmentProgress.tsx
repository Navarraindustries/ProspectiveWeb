import { useEffect, useState } from "react";
import type { ProgressState } from "../../api/types";
import { ProgressBar } from "../ProgressBar";

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
  const pct = state ? Math.round(state.pct) : 0;
  return (
    <div style={{ marginTop: 18 }}>
      {/* F1-136: el rótulo era la fase interna («TUBULARIDAD 3/6»), que no le
          dice nada a quien espera. Lo que necesita saber es que avanza y
          cuánto suele durar; las fases quedan plegadas para quien las quiera.
          Solo el rótulo se anuncia: leer cada cambio de fase sería ruido. */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--foreground)", marginBottom: 6 }}>
        {/* Solo el rótulo es región viva: con el porcentaje dentro se
            anunciaba cada punto que avanzaba. */}
        <span aria-live="polite">{headline}</span>
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
