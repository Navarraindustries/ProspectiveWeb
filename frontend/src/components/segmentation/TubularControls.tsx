import { useId } from "react";
import { Slider } from "../Slider";

export type SegmentMethod = "tubular" | "threshold";

/** Qué método segmenta, y cuánta pared y saco se recupera alrededor del tubo. */
export function TubularControls({ method, reclaimMm, onMethod, onReclaim }: {
  method: SegmentMethod; reclaimMm: number; onMethod: (m: SegmentMethod) => void; onReclaim: (mm: number) => void;
}) {
  const name = useId();
  const opt = (value: SegmentMethod, label: string, hint: string) => (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: method === value ? "var(--brand-subtle)" : "var(--card)", cursor: "pointer", flex: 1 }}>
      <input type="radio" name={name} value={value} checked={method === value} onChange={() => onMethod(value)} style={{ marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{hint}</span>
      </span>
    </label>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {opt("tubular", "Tubular (recomendado)", "Vasos macizos, hueso fuera por forma, sacos recuperados.")}
        {opt("threshold", "Umbral clásico", "Solo la banda de intensidad; deja láminas y cáscaras.")}
      </div>
      {method === "tubular" && (
        <div style={{ marginTop: 10 }}>
          <Slider label="Recuperar pared y sacos" min={0} max={5} step={0.5} value={reclaimMm} onChange={onReclaim} unit=" mm" />
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: -2, lineHeight: 1.45 }}>
            El filtro de tubularidad adelgaza la pared y no ve los sacos, que no son tubos. Este radio devuelve
            lo que queda a esa distancia del vaso; el hueso en forma de lámina no vuelve.
          </div>
          {/* El backend ignora `upper` en este método: sin decirlo, el
              deslizador del techo parece que manda y no manda. */}
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.45 }}>
            El método tubular no usa el techo; el hueso se descarta por forma.
          </div>
        </div>
      )}
    </div>
  );
}
