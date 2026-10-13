/* Lo que ve quien no es administrador al escribir a mano una ruta de
   administración (/app/usuarios, /app/auditoria).

   Antes la página se montaba entera: «Nuevo usuario» y «Verificar integridad»
   quedaban a la vista y solo fallaban al pulsarlos con un 403. Ahora la página
   no se monta y queda esta tarjeta (F1-254, F1-255).

   F1b-3: la tarjeta sola, sin barra ni botón, era un callejón sin salida —
   solo se salía con «atrás» del navegador. Cada página monta su propio
   Topbar, así que la tarjeta monta el suyo y ofrece la vuelta. */

import { Button } from "./Button";
import { Card } from "./PanelHead";
import { Topbar } from "./Topbar";

export function AdminOnlyCard({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--canvas)" }}>
      <Topbar crumbs={[{ label: "Pacientes", onClick: onBack }, { label: "Administración" }]} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Card style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <div role="alert" style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
            Solo para administradores
          </div>
          <Button variant="secondary" onClick={onBack}>Volver a pacientes</Button>
        </Card>
      </div>
    </div>
  );
}
