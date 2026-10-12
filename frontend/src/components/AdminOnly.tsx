/* Lo que ve quien no es administrador al escribir a mano una ruta de
   administración (/app/usuarios, /app/auditoria).

   Antes la página se montaba entera: «Nuevo usuario» y «Verificar integridad»
   quedaban a la vista y solo fallaban al pulsarlos con un 403. Ahora la página
   no se monta y queda esta tarjeta, nada más (F1-254, F1-255). */

import { Card } from "./PanelHead";

export function AdminOnlyCard() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas)" }}>
      <Card style={{ padding: "20px 24px" }}>
        <div role="alert" style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
          Solo para administradores
        </div>
      </Card>
    </div>
  );
}
