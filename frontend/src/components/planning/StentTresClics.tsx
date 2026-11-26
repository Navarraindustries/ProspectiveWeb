/* P10: flow diverter en tres clics — proximal, distal y saco (como Siemens).

   Antes eran ocho pasos entre Morfometría y Dispositivos: marcar origen y
   destino, extraer la línea central, medir el cuello, dimensionar, aplicar y
   desplegar. Aquí los tres clics se encadenan solos en el visor y el backend
   hace el resto (POST /api/stent-tres-clics). El resultado queda en la
   pestaña como cualquier despliegue: se puede corregir tramo, diámetro y
   dispositivo y volver a desplegar. */

import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { StentTresClicsResult } from "../../api/types";
import { usePlanning } from "../../store/planning";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, ErrorNote, SectionLabel } from "../PanelHead";

type Vec3 = [number, number, number];
const MODOS = ["stent_prox", "stent_dist", "stent_saco"] as const;
const PASOS = ["Proximal: sobre la arteria, antes del cuello",
               "Distal: sobre la arteria, después del cuello",
               "Saco: sobre el aneurisma"];

export function StentTresClics({ onDone }: { onDone: (r: StentTresClicsResult) => void }) {
  const {
    sessionId, segmentation, pickMode, setPickMode, clSource, clTarget, stentSac,
    setClSource, setClTarget, setStentSac, morphometry, allCandidates, centerlineMesh,
    setCenterlineMesh, setCenterline, setCenterlineArcMm, setDeviceMesh,
  } = usePlanning();
  const [activo, setActivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<StentTresClicsResult | null>(null);
  const lanzado = useRef(false);

  const haySaco = !!morphometry?.sac_mesh_url || allCandidates.length > 0;
  const hechos = [!!clSource, !!clTarget, !!stentSac];
  const paso = MODOS.indexOf(pickMode as (typeof MODOS)[number]);

  const empezar = () => {
    setClSource(null); setClTarget(null); setStentSac(null);
    setRes(null); setError(null); lanzado.current = false;
    setActivo(true);
    setPickMode("stent_prox");
  };
  const cancelar = () => {
    setActivo(false);
    if (paso >= 0) setPickMode(null);
  };

  const lanzar = async (sac: Vec3 | null) => {
    if (!sessionId || !clSource || !clTarget || lanzado.current) return;
    lanzado.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.stentTresClics(sessionId, {
        source: { x: clSource[0], y: clSource[1], z: clSource[2] },
        target: { x: clTarget[0], y: clTarget[1], z: clTarget[2] },
        sac: sac ? { x: sac[0], y: sac[1], z: sac[2] } : null,
      });
      setRes(r);
      // La línea nueva sustituye a la anterior: los puntos viejos se vacían
      // para que el visor pida los nuevos (useCenterlineTrack). El stent de
      // antes se fue con la línea vieja: si nada encaja, el visor lo quita.
      setCenterlineMesh(r.centerline.centerline_mesh_url);
      setCenterline(null);
      setCenterlineArcMm(r.centerline.arc_length_mm);
      setDeviceMesh("stent", r.stent?.stent_mesh_url || null);
      onDone(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo colocar el stent. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
      setActivo(false);
    }
  };

  // El tercer clic lanza el cálculo sin otro botón: son tres clics, no cuatro.
  useEffect(() => {
    if (activo && stentSac && clSource && clTarget) void lanzar(stentSac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, stentSac]);

  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionLabel>Flow diverter en tres clics</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, margin: "4px 0 10px" }}>
        Proximal, distal y saco: extrae la línea central entre los dos primeros, localiza el cuello,
        dimensiona y despliega la primera opción del catálogo que encaja. Después se puede corregir abajo.
        {centerlineMesh && <> <b style={{ color: "var(--foreground)" }}>Sustituye la línea central actual.</b></>}
      </div>

      {(activo || busy) && (
        <ol style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
          {PASOS.map((t, i) => (
            <li key={t} aria-current={paso === i ? "step" : undefined}
                style={{ color: hechos[i] ? "var(--success)" : paso === i ? "var(--foreground)" : "var(--muted-foreground)",
                         fontWeight: paso === i ? 600 : 400 }}>
              {hechos[i] ? "✓ " : ""}{t}
            </li>
          ))}
        </ol>
      )}

      {paso === 2 && haySaco && (
        <Button variant="outline" style={{ width: "100%", marginBottom: 8 }}
                onClick={() => { setPickMode(null); void lanzar(null); }}>
          {morphometry?.sac_mesh_url ? "Usar el saco medido, sin tercer clic" : "Usar el candidato elegido, sin tercer clic"}
        </Button>
      )}

      {res && (
        <div role="status" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8,
                                    color: res.stent ? "var(--foreground)" : "var(--warning)" }}>
          {res.message}
          {res.stent && (
            <div style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
              Cuello {res.neck_source !== "morfometria" ? "localizado donde la línea toca el saco"
                : res.neck_marked ? "medido en Morfometría"
                : "estimado en Morfometría: márcalo allí para que el despliegue se centre en el cuello real"}.
            </div>
          )}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {activo ? (
        <Button variant="outline" style={{ width: "100%" }} onClick={cancelar} disabled={busy}>
          Cancelar
        </Button>
      ) : (
        <Button style={{ width: "100%" }} onClick={empezar} disabled={busy || !segmentation?.mesh_url}
                leadingIcon={<Icon name="STENT" />}>
          {busy ? "Colocando el stent…" : res ? "Repetir los tres clics" : "Empezar: tres clics en el visor"}
        </Button>
      )}
    </Card>
  );
}
