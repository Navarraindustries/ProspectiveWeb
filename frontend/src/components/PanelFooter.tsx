/* PanelFooter — pie fijo del panel del paso: la nota encima, los botones debajo.

   Va dentro del cuerpo que desplaza (`.ws-panel-body`) y se queda pegado abajo
   (sticky); los márgenes negativos (en responsive.css) igualan el padding del
   cuerpo para que el pie ocupe todo el ancho. */

import type { ReactNode } from "react";

export function PanelFooter({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="ws-panel-footer">
      {note && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>{note}</div>
      )}
      {children}
    </div>
  );
}
