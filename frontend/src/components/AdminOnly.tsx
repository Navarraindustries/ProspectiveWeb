/* Lo que ve quien no es administrador al escribir a mano una ruta de
   administración (/app/usuarios, /app/auditoria).

   Antes la página se montaba entera: «Nuevo usuario» y «Verificar integridad»
   quedaban a la vista y solo fallaban al pulsarlos con un 403. Ahora la página
   no se monta y queda esta tarjeta (F1-254, F1-255).

   F1b-3: la tarjeta sola, sin barra ni botón, era un callejón sin salida.
   Desde F2 la página la monta dentro del shell (barra lateral y miga), así que
   aquí solo queda la tarjeta y la vuelta explícita a pacientes. */

import { Button } from "./Button";
import { Card } from "./PanelHead";

export function AdminOnlyCard({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Card style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div role="alert" style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
          Solo para administradores
        </div>
        <Button variant="secondary" onClick={onBack}>Volver a pacientes</Button>
      </Card>
    </div>
  );
}
