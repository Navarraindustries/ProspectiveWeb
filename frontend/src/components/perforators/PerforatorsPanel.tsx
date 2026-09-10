/* Ramas cerca del cuello — GET /api/perforators/{session}.

   Se llamaba «Perforantes», y eso prometía algo que la imagen no da: una
   perforante mide 0,1–0,5 mm y una angio-TC no la resuelve, así que no llega a
   la malla y no puede detectarse. Lo que el barrido encuentra son ORÍGENES DE
   RAMA VISIBLES, y decirlo importa por las dos direcciones: ninguna fila es
   necesariamente una perforante, y una lista vacía no significa que no las haya.

   Cada fila se puede encender en la escena 3D. Ninguna se muestra de entrada:
   doce marcadores apareciendo sin pedirlos alrededor del cuello tapan justo la
   geometría sobre la que se apoyan. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PerforatorsResult } from "../../api/types";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { SectionLabel, Card } from "../PanelHead";
import { usePlanning } from "../../store/planning";

export function PerforatorsPanel() {
  const { sessionId, setPerforators, visiblePerforators, togglePerforator, setVisiblePerforators } = usePlanning();
  const [result, setResult] = useState<PerforatorsResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.perforators(sessionId)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        // Publish to the store so the 3D viewer can mark them.
        const z = r.zone_radii_mm;
        setPerforators(
          r.candidates,
          z && z.length === 3 ? [z[0], z[1], z[2]] : null,
        );
      })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [sessionId, setPerforators]);

  // Leaving the panel must not leave stale markers in a scene the user is now
  // using for something else.
  useEffect(() => () => setVisiblePerforators([]), [setVisiblePerforators]);

  const zones = result?.zone_radii_mm;
  const all = result?.candidates ?? [];
  const allShown = all.length > 0 && visiblePerforators.length === all.length;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="MARK_PERF" size={15} color="var(--muted-foreground)" />
        <SectionLabel style={{ marginBottom: 0 }}>
          Ramas cerca del cuello {result ? `(radio ${result.search_radius_mm.toFixed(0)} mm)` : ""}
        </SectionLabel>
        {/* Encender doce marcadores de uno en uno para comparar, y apagarlos
            luego, es el gesto que más se repite en cuanto hay más de dos. */}
        {all.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisiblePerforators(allShown ? [] : all.map((c) => c.id))}
            style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
          >
            {allShown ? "Ocultar todas" : "Mostrar todas"}
          </Button>
        )}
      </div>
      {result && result.candidates.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
          Orígenes de rama visibles, con su calibre medido sobre la malla y su
          distancia al cuello.
          {zones && zones.length === 3 && (
            <> Zonas: alto &lt;{zones[0]} mm · medio {zones[0]}–{zones[1]} mm · bajo {zones[1]}–{zones[2]} mm.</>
          )}
          <br />
          Pulsa una fila para mostrarla u ocultarla en el visor 3D.
          {result.calibre_floor_mm > 0 && (
            <>
              <br />
              No son perforantes: por debajo de {result.calibre_floor_mm.toFixed(1)} mm de
              diámetro la imagen no resuelve un vaso, y una perforante mide 0,1–0,5 mm.
            </>
          )}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {error && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            No disponible — ejecuta primero la detección y morfometría.
          </div>
        )}
        {result && result.candidates.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Ninguna rama visible cerca del cuello.
            {result.calibre_floor_mm > 0 && (
              <> Esto no dice que no las haya: por debajo de {result.calibre_floor_mm.toFixed(1)} mm
              de diámetro esta imagen no resuelve un vaso.</>
            )}
          </div>
        )}
        {result?.candidates.map((p) => {
          const active = visiblePerforators.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              title={
                active
                  ? `Ocultar ${p.id} en el visor 3D`
                  : `Mostrar ${p.id} en el visor 3D (${p.distance_to_neck_mm.toFixed(1)} mm del cuello)`
              }
              onClick={() => togglePerforator(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "7px 8px", margin: 0, textAlign: "left", cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                border: "1px solid transparent",
                borderBottom: "1px solid var(--border)",
                borderColor: active ? p.risk_color : undefined,
                background: active ? "color-mix(in srgb, var(--foreground) 7%, transparent)" : "transparent",
                fontFamily: "var(--font-sans)",
              }}
            >
              <span
                style={{
                  width: active ? 13 : 9, height: active ? 13 : 9, borderRadius: "50%",
                  background: p.risk_color, flexShrink: 0,
                  boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${p.risk_color} 30%, transparent)` : undefined,
                }}
              />
              <span style={{ fontSize: 12, color: "var(--foreground)", flex: 1, fontWeight: active ? 700 : 400 }}>
                {p.id}
              </span>
              {/* El calibre, ahora que se mide. Antes todas las filas llevaban
                  0.4 mm: una constante que el API declaraba como «estimated
                  vessel radius» porque el detector de valencia no lo calculaba. */}
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}
                title="Calibre del vaso, medido sobre la malla"
              >
                ⌀{(p.radius_mm * 2).toFixed(1)}
              </span>
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}
                title="Distancia al cuello del aneurisma"
              >
                {p.distance_to_neck_mm.toFixed(1)} mm
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.risk_color }}>{p.risk_label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
