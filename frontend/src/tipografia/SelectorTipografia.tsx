/* UNI-135 · Selector flotante de variantes tipográficas, para compararlas
   sobre pantallas reales. Solo aparece si se entró con `?tipografia=…`. */

import { useState } from "react";
import { ETIQUETAS, VARIANTES, aplicar, type Variante } from "./variantes";

export function SelectorTipografia({ inicial }: { inicial: Variante | null }) {
  const [activa, setActiva] = useState<Variante | null>(inicial);
  if (activa === null) return null;
  return (
    <div className="selector-tipografia" role="group" aria-label="Variante tipográfica (UNI-135)">
      {VARIANTES.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={activa === v}
          title={ETIQUETAS[v]}
          onClick={() => {
            aplicar(v);
            setActiva(v);
          }}
        >
          {v === "actual" ? "Actual" : v.toUpperCase()}
        </button>
      ))}
      <span className="selector-tipografia__nombre">{ETIQUETAS[activa]}</span>
    </div>
  );
}
