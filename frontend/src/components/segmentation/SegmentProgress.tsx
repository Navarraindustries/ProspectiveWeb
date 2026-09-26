import { useEffect, useState } from "react";
import type { ProgressState } from "../../api/types";
import { ProgressBar } from "../ProgressBar";

/** Fase y porcentaje de la segmentación, con aviso cuando el servidor va lento. */
export function SegmentProgress({ state }: { state: ProgressState | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [state?.phase]);
  const pct = state ? Math.round(state.pct) : 0;
  return (
    <div style={{ marginTop: 18 }} aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", marginBottom: 6, letterSpacing: ".06em", textTransform: "uppercase" }}>
        <span>{state?.phase || "preparando"}</span>
        <span>{pct} %</span>
      </div>
      <ProgressBar value={state ? state.pct : undefined} />
      {/* Genérico a propósito: bajo el 5 % se está en «carga» o «núcleo», o en
          el umbral clásico, que no calcula tubularidad; culparla ahí era falso. */}
      {slow && pct < 5 && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
          El servidor tarda: en un equipo pequeño la segmentación lleva minutos.
        </div>
      )}
    </div>
  );
}
