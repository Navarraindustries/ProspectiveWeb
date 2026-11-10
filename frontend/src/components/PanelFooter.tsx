/* PanelFooter — pie fijo del panel del paso: la nota encima, los botones debajo.

   Va dentro del cuerpo que desplaza (`.ws-panel-body`) y se queda pegado abajo
   (sticky); los márgenes negativos (en responsive.css) igualan el padding del
   cuerpo para que el pie ocupe todo el ancho.

   «Volver» al paso anterior se pinta aquí, a la izquierda de lo que ponga cada
   panel: así está en todos los pasos y también con la hoja inferior a altura
   completa, que tapa el carril. */

import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { useStepNav } from "../pipeline/stepNav";

export function PanelFooter({ children, note }: { children: ReactNode; note?: ReactNode }) {
  const back = useStepNav()?.back ?? null;
  return (
    <div className="ws-panel-footer">
      {note && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>{note}</div>
      )}
      {back ? (
        <div className="ws-panel-actions" style={{ alignItems: "flex-start" }}>
          {/* En el panel de 380 px no caben los dos rótulos: la fila envuelve y
              «Volver» queda encima, a la izquierda. */}
          <Button variant="ghost" size="sm" onClick={back.go} leadingIcon={<Icon name="BACK" />}
                  style={{ flex: "0 0 auto" }}>
            {back.label}
          </Button>
          <div style={{ flex: "1 1 180px", minWidth: 0, whiteSpace: "normal" }}>{children}</div>
        </div>
      ) : children}
    </div>
  );
}

/** Los botones del pie: no se parten y, si no caben en una fila, bajan de fila
    y ocupan todo el ancho (reglas en responsive.css). */
export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="ws-panel-actions">{children}</div>;
}
