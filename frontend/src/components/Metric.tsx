/* Metric — one clinical metric row: label · mono value · optional risk badge. */

import { Badge } from "./Badge";

type BadgeVariant = "default" | "secondary" | "outline" | "subtle" | "success" | "warning" | "destructive";

export function Metric({
  label,
  value,
  unit,
  badge,
}: {
  label: string;
  value: string | number;
  unit?: string;
  badge?: [string, BadgeVariant];
}) {
  // Una cifra no se parte: si no cabe, la que se dobla es la etiqueta. Antes
  // era al revés, y «27.3 %» o «0.84 mm» salían con un carácter por línea en
  // cuanto la etiqueta era larga y había una insignia al lado. Un valor largo
  // (una descripción, un nombre de fichero) sí se sigue partiendo.
  const corto = String(value).length <= 14;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--muted-foreground)", flexShrink: corto ? 1 : 0, minWidth: 0 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--foreground)", fontWeight: 500, marginLeft: "auto", textAlign: "right", minWidth: 0, ...(corto ? { whiteSpace: "nowrap", flexShrink: 0 } : { overflowWrap: "break-word" }) }}>
        {value}
        {unit && <span style={{ color: "var(--muted-foreground)", fontSize: 11 }}>{unit}</span>}
      </span>
      {badge && (
        <span style={{ flexShrink: 0 }}>
          <Badge variant={badge[1]}>{badge[0]}</Badge>
        </span>
      )}
    </div>
  );
}
