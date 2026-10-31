/* Badge — status / risk pill. Variants map to the clinical color convention:
   destructive = high risk, warning = moderate, success = low/OK; data = ranking/measured values (--data). */

import type { CSSProperties, ReactNode } from "react";

type Variant = "default" | "secondary" | "outline" | "subtle" | "success" | "warning" | "destructive" | "muted" | "brand" | "data";

/* Pastilla de cristal: borde del color al 60 %, texto del color, fondo transparente. */
const COLORS: Record<Variant, string> = {
  default: "var(--primary)",
  data: "var(--data)",
  secondary: "var(--secondary-foreground)",
  outline: "var(--foreground)",
  subtle: "var(--muted-foreground)",
  muted: "var(--muted-foreground)",
  brand: "var(--brand-subtle-foreground)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
};

function variantStyle(v: Variant): CSSProperties {
  return {
    background: "transparent",
    color: COLORS[v],
    border: `1px solid color-mix(in srgb, ${COLORS[v]} 60%, transparent)`,
  };
}

export function Badge({ variant = "default", children, style, title }: { variant?: Variant; children: ReactNode; style?: CSSProperties; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: "var(--radius-full)",
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...variantStyle(variant),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export type RiskLike = "Alto" | "Moderado" | "Medio" | "Bajo" | string;

/** Map a clinical risk label to its badge variant. */
export function riskVariant(risk: RiskLike): "destructive" | "warning" | "success" {
  if (risk === "Alto") return "destructive";
  if (risk === "Moderado" || risk === "Medio") return "warning";
  return "success";
}
