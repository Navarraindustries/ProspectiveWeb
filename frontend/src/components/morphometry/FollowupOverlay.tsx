/* Superposición de un estudio anterior: DÓNDE ha cambiado el aneurisma.

   La gráfica de seguimiento dice cuánto; esto lo pinta en el visor. Rojo,
   creció; azul, encogió; gris, dentro del ruido de la comparación (lo que
   tampoco encajan los vasos de alrededor, que no deberían cambiar). Ver
   backend/services/followup.py. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { FollowupResult, FollowupStudy } from "../../api/types";
import { Button } from "../Button";
import { ErrorNote, SectionLabel } from "../PanelHead";
import { usePlanning } from "../../store/planning";
import { cifra, mm } from "../../lib/numero";
import { degradadoLeyenda } from "../../vtk/mapaDivergente";

export function FollowupOverlay({ sessionId }: { sessionId: string }) {
  const { followup, setFollowup } = usePlanning();
  const [studies, setStudies] = useState<FollowupStudy[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<FollowupResult | null>(null);

  useEffect(() => {
    let vivo = true;
    api.followupStudies(sessionId).then((s) => { if (vivo) setStudies(s); }).catch(() => setStudies([]));
    return () => { vivo = false; };
  }, [sessionId]);

  const superponer = async (s: FollowupStudy) => {
    setBusy(s.session_id);
    setError(null);
    try {
      const res = await api.followup(sessionId, s.session_id);
      setR(res);
      // Satura el color en el doble del ruido o en el crecimiento máximo, lo que
      // sea mayor: así un cambio real se ve rojo y el ruido no.
      setFollowup({ mapUrl: res.map_url, ghostUrl: res.ghost_url, noise: res.noise_mm, previousSessionId: s.session_id,
                    range: Math.max(res.max_growth_mm, res.max_shrink_mm, res.noise_mm * 2, 0.5) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo superponer el estudio. Vuelve a intentarlo.");
    } finally {
      setBusy(null);
    }
  };

  const crecio = r ? r.max_growth_mm > r.noise_mm : false;

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel>Superponer un estudio anterior</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 10px", lineHeight: 1.5 }}>
        Coloca el estudio anterior sobre el actual (encajando los vasos de alrededor) y
        pinta en el visor dónde ha cambiado: <b style={{ color: "var(--cambio-crece)" }}>rojo</b>, creció;{" "}
        <b style={{ color: "var(--cambio-encoge)" }}>azul</b>, encogió; gris, sin cambio distinguible.
      </div>

      {studies === null && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Buscando estudios…</div>}
      {studies && studies.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          No hay otro estudio de este paciente con una sesión guardada. Hace falta que la
          sesión esté adjunta a un paciente y que el estudio anterior se haya segmentado y guardado.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {studies?.map((s) => (
          <div key={s.session_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                                           border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <span style={{ flex: 1, fontSize: 12.5 }}>
              <b>{s.acquired_at || "sin fecha"}</b> · {s.modality || "—"} · {s.description || "Estudio"}
              {!s.has_lesion && <span style={{ color: "var(--warning)" }}> · sin lesión localizada</span>}
            </span>
            <Button size="sm" variant="outline" disabled={busy !== null || !s.has_lesion}
                    onClick={() => void superponer(s)}>
              {busy === s.session_id ? "Superponiendo…" : "Superponer"}
            </Button>
          </div>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {r && (
        <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: crecio ? "var(--warning)" : "var(--foreground)" }}>
            {crecio
              ? `Ha crecido hasta ${mm(r.max_growth_mm, 2)} en ${r.grew_area_pct.toFixed(0)} % de la lesión`
              : "Sin crecimiento distinguible del ruido"}
          </div>
          {/* La barra de color, con la franja gris del ruido en medio. */}
          <div aria-hidden style={{ height: 8, borderRadius: 4, margin: "8px 0 2px",
                                    background: degradadoLeyenda(40, 60) }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--muted-foreground)" }}>
            <span>encogió</span><span>± {mm(r.noise_mm, 2)} = ruido</span><span>creció</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.6 }}>
            Encaje de los vasos de alrededor: residuo mediano {mm(r.residual_median_mm, 2)}, giro corregido {cifra(r.rotation_deg, 1)}°.
            {r.max_shrink_mm > r.noise_mm && <> Encogió hasta {mm(r.max_shrink_mm, 2)} en algún punto.</>}
            {r.volume_prev_mm3 != null && r.volume_curr_mm3 != null && (
              <> Volumen del saco: {r.volume_prev_mm3.toFixed(0)} → {r.volume_curr_mm3.toFixed(0)} mm³.</>
            )}
            <br />Centrado en: {r.lesion_source_prev} (antes) · {r.lesion_source_curr} (ahora).
            Un bulto estrecho se mide algo por debajo (~90 % de su altura).
          </div>
          {r.warnings.map((w) => (
            <div key={w} role="alert" style={{ fontSize: 12, color: "var(--warning)", marginTop: 6, lineHeight: 1.5 }}>{w}</div>
          ))}
          {followup && (
            <Button size="sm" variant="ghost" style={{ marginTop: 8 }} onClick={() => setFollowup(null)}>
              Quitar la superposición del visor
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
