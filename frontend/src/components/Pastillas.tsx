/* Pastillas — filtro de estados con recuento. */
import { useTableta } from "../hooks/useEstrecho";
import { glass } from "../styles/glass";

export interface OpcionPastilla {
  id: string;
  label: string;
  cuenta?: number;
}

export function Pastillas({
  opciones,
  valor,
  onCambiar,
  rotulo,
}: {
  opciones: readonly OpcionPastilla[];
  valor: string;
  onCambiar: (id: string) => void;
  /** aria-label del grupo. */
  rotulo: string;
}) {
  const tableta = useTableta();
  return (
    <div role="group" aria-label={rotulo} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {opciones.map((o) => {
        const activa = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activa}
            data-glass={activa ? undefined : ""}
            onClick={() => onCambiar(o.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: tableta ? 44 : 32,
              padding: "0 14px",
              borderRadius: "var(--radius-full)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: activa ? 600 : 500,
              ...(activa
                ? { background: "var(--primary)", border: "1px solid var(--primary)", color: "var(--primary-foreground)" }
                : { ...glass("flat"), color: "var(--foreground)" }),
            }}
          >
            {o.label}
            {o.cuenta !== undefined && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, opacity: 0.7 }}>{o.cuenta}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
