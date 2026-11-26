/* La columna de leyendas de la escena 3D, arriba a la derecha bajo el rótulo
   del modo (abajo y centrada tapaba el árbol, y la barra de pasos la tapaba a
   ella). Las leyendas van una debajo de otra: el mapa de calibre y la red se
   pueden encender a la vez. Fuera del marco del HUD, que es quien da el color
   a las lecturas: el color se pone aquí. */
import type { ReactNode } from "react";

export function LeyendasEscena({ children }: { children: ReactNode }) {
  return (
    <div className="hud-leyendas" style={{
      position: "absolute", right: 14, top: 44, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
      pointerEvents: "none", color: "var(--hud-text)", fontFamily: "var(--font-mono)",
    }}>
      {children}
    </div>
  );
}
