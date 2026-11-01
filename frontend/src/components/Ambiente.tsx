/* Ambiente — fondo de toda la aplicación: lienzo con dos brillos tenues de la marca y grano fino.
   Lo resuelve el CSS (styles/ambiente.css), así que reacciona en vivo al tema y a la transparencia reducida. */

import type { ReactNode } from "react";

export function Ambiente({ children }: { children?: ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      <div className="ambiente" data-ambiente aria-hidden="true" />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
