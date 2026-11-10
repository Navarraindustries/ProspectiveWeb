/* Tarjetas de Pacientes sobre la rejilla: la invitación al recorrido (cuentas
   que ya existían) y «Primeros pasos sugeridos», plegable y que se cierra a
   mano. Sin contadores ni marcas de hecho. Ninguna sale mientras el recorrido
   está en marcha. */

import { useState } from "react";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { glass } from "../styles/glass";
import { INVITACION, LISTO, PISTAS_UI, PRIMEROS_PASOS } from "./copy";
import { useOnboarding } from "./OnboardingProvider";
import { usePrimerosPasos } from "./primerosPasos";

const TARJETA = {
  display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px", marginBottom: 16,
  borderRadius: "var(--radius-xl)", color: "var(--foreground)", fontSize: 14,
} as const;

export function TarjetasPacientes() {
  const { estado, activo, empezar, descartarInvitacion, cerrarTarjeta } = useOnboarding();
  const ejecutar = usePrimerosPasos();
  const [plegada, setPlegada] = useState(false);
  if (activo) return null;

  if (estado.estado === "invitado") {
    return (
      <div role="region" aria-label={INVITACION.texto} data-glass style={{ ...glass("normal"), ...TARJETA, flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ flex: 1, minWidth: 200 }}>{INVITACION.texto}</span>
        <Button style={{ minHeight: 44 }} onClick={empezar}>{INVITACION.ver}</Button>
        <Button variant="ghost" style={{ minHeight: 44 }} onClick={() => void descartarInvitacion()}>{INVITACION.ahoraNo}</Button>
      </div>
    );
  }

  if ((estado.estado === "completado" || estado.estado === "saltado") && !estado.tarjeta_cerrada) {
    return (
      <section aria-label={LISTO.primerosPasos} data-glass style={{ ...glass("normal"), ...TARJETA }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 700 }}>{LISTO.primerosPasos}</h2>
          <Button variant="ghost" style={{ minHeight: 44 }} aria-expanded={!plegada} onClick={() => setPlegada((p) => !p)}>
            {plegada ? PISTAS_UI.desplegar : PISTAS_UI.plegar}
          </Button>
          <Button size="icon" variant="ghost" style={{ minWidth: 44, minHeight: 44 }} aria-label={PISTAS_UI.cerrarTarjeta}
                  title={PISTAS_UI.cerrarTarjeta} onClick={() => void cerrarTarjeta()}>
            <Icon name="CLOSE" size={14} />
          </Button>
        </div>
        {!plegada && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {PRIMEROS_PASOS.map((p) => (
              <li key={p.accion} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div>{p.texto}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{p.lugar}</div>
                </div>
                <Button variant="outline" style={{ minHeight: 44 }} onClick={() => ejecutar(p.accion)}>{p.cta}</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  return null;
}
