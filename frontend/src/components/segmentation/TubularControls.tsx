import { useId, type ReactNode } from "react";
import { Slider } from "../Slider";

export type SegmentMethod = "tubular" | "threshold";

/** El techo del umbral (deslizador, casilla y su ayuda) solo con el umbral
 *  clásico. F1-132, decisión 17: en tubular el backend ignora `upper`, y el
 *  panel enseñaba el deslizador apagado, la casilla apagada y dos párrafos
 *  explicando que no mandaban. Ahora queda una sola línea en su sitio. */
/** En tubular, UNA línea en lugar del techo. `nota` la cambia cuando sí hay
 *  techo propio (TC): «Sin techo» contradecía la explicación de al lado. */
export function CeilingControls({ method, children, nota = "Sin techo en el método tubular" }: {
  method: SegmentMethod; children: ReactNode; nota?: string;
}) {
  if (method !== "tubular") return <>{children}</>;
  return (
    <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
      {nota}
    </div>
  );
}

/** Qué método segmenta, y cuánta pared y saco se recupera alrededor del tubo.
 *  En TC (`ct`) el método tubular usa la receta de angio-TC (backend
 *  `services.cta_vessels`, 15-11-2026): no hay radio de recuperación que mover,
 *  así que en vez del deslizador se dice qué hace. */
export function TubularControls({ method, reclaimMm, onMethod, onReclaim, ct = false }: {
  method: SegmentMethod; reclaimMm: number; onMethod: (m: SegmentMethod) => void; onReclaim: (mm: number) => void;
  ct?: boolean;
}) {
  const name = useId();
  const opt = (value: SegmentMethod, label: string, hint: string) => (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "var(--glass-rim) solid var(--glass-border)", background: method === value ? "var(--brand-subtle)" : "var(--glass)", cursor: "pointer", flex: 1 }}>
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
      {method === "tubular" && ct && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.45 }}>
          En angio-TC se queda el árbol de vasos conectado dentro del cráneo: lo que supera el umbral
          inferior y todo lo unido a ello con un umbral más bajo, calculado del propio estudio, para no
          cortar las ramas finas. Fuera quedan el cráneo, el cuero cabelludo y los senos paranasales.
          Las venas van incluidas. La búsqueda de aneurismas trabaja por ahora sobre una segunda malla,
          hecha con la receta anterior, a la que está ajustado el detector; por eso tarda un poco más.
        </div>
      )}
      {method === "tubular" && !ct && (
        <div style={{ marginTop: 10 }}>
          <Slider label="Recuperar pared y sacos" min={0} max={5} step={0.5} value={reclaimMm} onChange={onReclaim} unit=" mm" />
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: -2, lineHeight: 1.45 }}>
            El filtro de tubularidad adelgaza la pared y no ve los sacos, que no son tubos. Este radio devuelve
            lo que queda a esa distancia del vaso; el hueso en forma de lámina no vuelve.
          </div>
        </div>
      )}
    </div>
  );
}
