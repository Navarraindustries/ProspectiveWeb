import type { CSSProperties } from "react";

export type GlassKind = "normal" | "dense" | "viewer" | "flat";

// Superficie de cristal. No fija backgroundColor: el fondo opaco de reserva lo ponen
// las reglas de base.css sobre [data-glass], así que el elemento debe llevar ese atributo.
// "flat" es el cristal de las tarjetas: mismo fondo, borde y brillo, pero sin desenfoque
// propio (la tarjeta se apoya en el cristal que ya la desenfoca por debajo).
export function glass(kind: GlassKind = "normal"): CSSProperties {
  if (kind === "flat") {
    return {
      background: "var(--glass)",
      border: "var(--glass-rim) solid var(--glass-border)",
      boxShadow: "var(--glass-highlight)",
    };
  }
  const blur = kind === "viewer" ? "var(--glass-blur-viewer)" : "var(--glass-blur)";
  const filter = `blur(${blur}) saturate(130%)`;
  const fondo = { normal: "var(--glass)", dense: "var(--glass-dense)", viewer: "var(--glass-viewer)" }[kind];
  return {
    background: fondo,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    border: "var(--glass-rim) solid var(--glass-border)",
    boxShadow: "var(--glass-highlight), var(--shadow-md)",
  };
}
