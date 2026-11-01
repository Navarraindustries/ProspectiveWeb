/* EstadoVacio — tarjeta de cristal plana para listas sin contenido: icono, título, texto y acción. */

import type { ReactNode } from "react";
import { glass } from "../styles/glass";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export function EstadoVacio({ icono, titulo, children, accion }: {
  icono: IconName;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div
      data-glass
      style={{
        ...glass("flat"),
        borderRadius: "var(--radius-lg)",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        textAlign: "center",
      }}
    >
      <span style={{ color: "var(--muted-foreground)", display: "flex" }}><Icon name={icono} size={28} /></span>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{titulo}</div>
      {children && <div style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 420 }}>{children}</div>}
      {accion && <div style={{ marginTop: 8 }}>{accion}</div>}
    </div>
  );
}
