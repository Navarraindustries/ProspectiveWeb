/* Slider — range control with mono numeric readout (HU thresholds, smoothing…). */

import { useId } from "react";
import { cifra } from "../lib/numero";

/** Al décimo del paso, con coma; un valor entero se queda entero. */
const legible = (v: number) => { const r = Math.round(v * 10) / 10; return Number.isInteger(r) ? String(r) : cifra(r, 1); };

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit = "",
  disabled = false,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  /** Atenuado y sin interacción: el valor sigue visible, pero no rige. */
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div style={disabled ? { opacity: 0.45 } : undefined}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <label htmlFor={id} style={{ flex: 1, fontSize: 13, color: "var(--muted-foreground)" }}>
          {label}
        </label>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--foreground)" }}>
          {/* Los límites de la caja salen de la malla y traen todos los
              decimales del flotante: «19.8441951751789 mm» no dice más que
              «19.8» y llena la fila. Se redondea al paso del deslizador. */}
          {Number.isInteger(step) ? value : legible(value)}
          <span style={{ color: "var(--muted-foreground)", fontSize: 11 }}>{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--primary)" }}
      />
    </div>
  );
}
