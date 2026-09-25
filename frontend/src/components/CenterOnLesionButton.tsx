/* «Centrar en la lesión» para los paneles laterales. La acción la registra el
   visor en el store (encuadre de 30 mm y foco común); sin lesión ni volumen
   aún, el botón queda deshabilitado. */

import { usePlanning } from "../store/planning";
import { Button } from "./Button";
import { Icon } from "./Icon";

export function CenterOnLesionButton() {
  const { centerOnLesion } = usePlanning();
  return (
    // En su propia fila: junto al título lo estrujaba en una columna.
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -8, marginBottom: 12 }}>
      <Button variant="ghost" size="sm" disabled={!centerOnLesion} onClick={() => centerOnLesion?.()}
        title="Lleva el 3D y los tres cortes a la lesión, con un encuadre de 30 mm"
        leadingIcon={<Icon name="TARGET" size={14} />}>
        Centrar en la lesión
      </Button>
    </div>
  );
}
