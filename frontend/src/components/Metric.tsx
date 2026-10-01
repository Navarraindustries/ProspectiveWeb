/* Metric — one clinical metric row: label · mono value · optional risk badge. */

import { Badge } from "./Badge";

type BadgeVariant = "default" | "secondary" | "outline" | "subtle" | "success" | "warning" | "destructive";

export function Metric({
  label,
  value,
  unit,
  badge,
  wrapLabel = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  badge?: [string, BadgeVariant];
  /** Para rótulos largos: el rótulo parte en líneas y la cifra se queda entera.
   *  Por defecto el rótulo no encoge, y uno largo apretaba la cifra hasta
   *  partirla carácter a carácter y sacar el distintivo del panel. */
  wrapLabel?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--muted-foreground)", flexShrink: wrapLabel ? 1 : 0, minWidth: wrapLabel ? 0 : undefined }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--foreground)", fontWeight: 500, marginLeft: "auto", textAlign: "right", minWidth: 0, overflowWrap: "break-word", ...(wrapLabel ? { flexShrink: 0, whiteSpace: "nowrap" as const } : {}) }}>
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
