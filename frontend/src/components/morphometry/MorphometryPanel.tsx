/* Paso 4 — Morfometría. GET /api/morphometry/{session} + seguimiento longitudinal. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { ANEURYSM_LOCATIONS, LEGACY_BASILAR, LEGACY_BASILAR_LABEL } from "../../api/types";
import type { AneurysmLocation, ClinicalSiteResult, LongitudinalResult } from "../../api/types";
import { Badge, riskVariant } from "../Badge";
import { MorphoRiskBadge, MORPHO_RISK_CRITERIA } from "./MorphoRiskBadge";
import { PHASES_CUTS, crossedCut, isProvisional, mm, nearCut } from "./diameterCut";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Metric } from "../Metric";
import { PanelHead, ErrorNote, Collapsible } from "../PanelHead";
import { ProgressBar } from "../ProgressBar";
import { Select } from "../Select";
import { Tabs } from "../Tabs";
import { EI_MOD, THRESHOLD_TIP, UI_HIGH, badgeFor } from "./thresholds";
import { NECK_DOME_COLOR, NECK_ORIGIN_COLOR, rgbCss, type Rgb } from "../../vtk/markerColors";
import { FollowupOverlay } from "./FollowupOverlay";
import { UiatsCalculator } from "./UiatsCalculator";
import { ElapssCalculator } from "./ElapssCalculator";
import { PhasesCalculator } from "./PhasesCalculator";
import { LongitudinalChart } from "./LongitudinalChart";
import { usePlanning } from "../../store/planning";
import type { MorphometryResult } from "../../api/types";
import { MANUAL_NO_SAC, isManual } from "../planning/detectCopy";

const TABS = ["Métricas", "Índices", "PHASES", "ELAPSS", "UIATS", "Seguimiento"] as const;

/** Lo que ha pasado al cambiar la localización, en una línea; «» si nada. */
export function siteChangeNotice(r: Pick<ClinicalSiteResult, "cleared" | "recalculated" | "pending">): string {
  const partes: string[] = [];
  if (r.cleared.length) {
    partes.push(r.cleared.length === 1 && r.cleared[0] === "Decisión"
      ? "Se ha borrado: Decisión — vuelve a calcularla."
      : `Se han borrado: ${r.cleared.join(", ")} — vuelve a calcularlos.`);
  }
  if (r.recalculated.length) {
    partes.push(`Recalculados con la nueva localización: ${r.recalculated.join(", ")}.`);
  }
  if (r.pending.length) {
    partes.push(`Sin categoría para esta localización: ${r.pending.join(", ")}. ` +
      "Salen del informe y se recalculan al elegir otra.");
  }
  return partes.join(" ");
}

/** Las opciones del selector. F1-174: la basilar antigua ya no se ofrece,
 *  pero si una sesión guardada la trae se enseña —como sin precisar y junto a
 *  las tres nuevas— en vez de que el selector salte a otra en silencio. */
function siteOptions(current: string | null | undefined) {
  const opts = ANEURYSM_LOCATIONS.map((o) => ({ value: o as string, label: o as string }));
  if (current !== LEGACY_BASILAR) return opts;
  const at = opts.findIndex((o) => o.value === "Punta basilar");
  return [...opts.slice(0, at), { value: LEGACY_BASILAR, label: LEGACY_BASILAR_LABEL }, ...opts.slice(at)];
}

/** «(1,2; 4,6; −7,9) mm»: coma decimal y punto y coma entre ejes, para que
 *  la coma de los decimales no se confunda con la que separa x, y, z. */
export function coordMm(p: readonly [number, number, number]): string {
  const f = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace(".", ",").replace("-", "−");
  return `(${p.map(f).join("; ")}) mm`;
}

/* F1-153: tras «Marcar cuello» el botón decía «Cuello ✓» y nada más; en el 3D
   había dos bolas de colores y no se sabía cuál era cuál ni si la marca había
   caído donde se quería. Al lado del botón, la muestra del color de la bola y
   dónde quedó. */
function MarkCoord({ p, color, what }: { p: readonly [number, number, number]; color: Rgb; what: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
      <span role="img" aria-label={`Color de la marca de ${what}`}
            style={{ width: 10, height: 10, borderRadius: "50%", background: rgbCss(color), flexShrink: 0 }} />
      {coordMm(p)}
    </span>
  );
}

/** F1-166: cómo llama el backend a la entrada de la sesión abierta
 *  (routers/longitudinal.py): «Estudio actual» si está guardada, «Sesion actual» si no. */
const CURRENT_LABELS = new Set(["Estudio actual", "Sesion actual", "Sesión actual"]);

/* F1-164: los cuatro índices que la etiqueta de riesgo no usa (o usa solo el
   EI), con qué miden y desde qué valor importan. Los cortes son los de
   thresholds.ts; el NSI y la compacidad no tienen ninguno en la aplicación, y
   así se dice en vez de inventarlo. */
const MORE_TIP = {
  ei: `Elipticidad: alargamiento del saco frente a una esfera (Raghavan 2005). Alto desde ${EI_MOD.toFixed(2).replace(".", ",")}, el mismo corte que la etiqueta de riesgo.`,
  nsi: "No-esfericidad: desviación global de la esfera (1 − compacidad; Raghavan 2005). La aplicación no le pone corte ni lo usa en la etiqueta de riesgo.",
  compactness: "Wadell: 1 es una esfera; valores bajos indican lobulación",
  eq: "Diámetro de la esfera con el mismo volumen",
};

export function MorphometryPanel({ onNext }: { onNext: () => void }) {
  const planning = usePlanning();
  const {
    sessionId, morphometry, allCandidates, selectedCandidate,
    pickMode, setPickMode, neckOrigin, neckDome, setNeckOrigin, setNeckDome,
    neckRim, setNeckRim,
  } = planning;
  const [tab, setTab] = useState<string>("Métricas");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [longi, setLongi] = useState<LongitudinalResult | null>(null);
  const [neckBusy, setNeckBusy] = useState(false);
  const [siteBusy, setSiteBusy] = useState(false);
  /** La que se está guardando: el selector la enseña ya, el store la recibe al guardarse. */
  const [sitePending, setSitePending] = useState<AneurysmLocation | null>(null);
  const [siteNotice, setSiteNotice] = useState<string | null>(null);

  // F1-165 (fusión nº 21): la localización se elige aquí, una vez, y la heredan
  // PHASES, ELAPSS, UIATS y Decisión. Se guarda en `clinical.site` para el PDF,
  // el WEB y «Reanudar». Cambiarla no borra nada escrito a mano: el backend
  // recalcula lo guardado cuya categoría cambia y solo borra una decisión
  // tomada con otra localización, y aquí se dice qué ha pasado con cada cosa.
  // El store la recibe DESPUÉS de guardarse: la calculadora abierta recalcula
  // al verla cambiar, y así su POST llega detrás del recálculo del servidor.
  async function changeSite(next: AneurysmLocation) {
    setSiteNotice(null);
    if (!sessionId) { planning.setAneurysmSite(next); return; }
    setSitePending(next);
    setSiteBusy(true);
    setError(null);
    try {
      const r = await api.setClinicalSite(sessionId, next);
      if (r.cleared.includes("Decisión")) planning.setTreatment(null);
      planning.setAneurysmSite(next);
      setSiteNotice(siteChangeNotice(r) || null);
    } catch (e) {
      // Sin guardar, el PDF y la sesión siguen con la anterior, y el selector
      // vuelve a ella para no enseñar una que no está guardada.
      setError(e instanceof Error ? e.message : "No se pudo guardar la localización");
    } finally {
      setSitePending(null);
      setSiteBusy(false);
    }
  }

  // Three or more rim points fit the plane to the anatomy; otherwise the plane
  // is inferred from the neck point and the apex, which assumes the neck is
  // perpendicular to the dome axis.
  const usesRim = neckRim.length >= 3;
  const canMeasure = !!neckDome && (usesRim || !!neckOrigin);
  // Se mide el candidato elegido en Detección, no siempre el primero.
  const selected = allCandidates[selectedCandidate];
  const candidateId = selected?.id;
  // Revisión de F1-146: un candidato «marcado a mano» no tiene saco detectado
  // y la medida automática responde 422. Su camino es marcar cuello y ápice,
  // así que esos controles tienen que estar aunque no haya medida.
  const manualSel = !!selected && isManual(selected);

  async function recomputeWithNeckPlane() {
    if (!sessionId || !neckDome || !canMeasure) return;
    const anchor = usesRim ? neckRim[0]! : neckOrigin!;
    const normal: [number, number, number] = [
      neckDome[0] - anchor[0],
      neckDome[1] - anchor[1],
      neckDome[2] - anchor[2],
    ];
    setNeckBusy(true);
    setError(null);
    try {
      const m = await api.morphometryNeckPlane(sessionId, {
        origin: { x: anchor[0], y: anchor[1], z: anchor[2] },
        normal,
        dome_seed: { x: neckDome[0], y: neckDome[1], z: neckDome[2] },
        rim_points: usesRim
          ? neckRim.map(([x, y, z]) => ({ x, y, z }))
          : [],
        // A qué candidato pertenece la medida: con uno marcado a mano es la
        // única ruta que lo deja elegido, y «Reanudar» la repite sobre él.
        candidate_id: candidateId ?? null,
      });
      planning.setMorphometry(m);
      // Volver a medir el cuello a mano deja obsoleta la recomendación que se
      // calculó con el anterior — el backend la borra cuando las medidas
      // cambian, y sin esto la pantalla seguiría enseñando la vieja mientras el
      // informe ya no la lleva. Se limpia siempre en esta ruta: si el plano
      // reprodujera exactamente la medida anterior el backend la conservaría y
      // aquí se pediría reevaluar de más, que es el lado seguro.
      planning.setTreatment(null);
      setNeckOrigin(null);
      setNeckDome(null);
      setNeckRim([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al medir con el plano de cuello");
    } finally {
      setNeckBusy(false);
    }
  }

  // Se mide el candidato elegido en Detección, no siempre el primero: en
  // Case 3 la lesión es cand-002. Cambiar la elección vacía `morphometry` en el
  // store, y este efecto vuelve a pedirla para el nuevo.
  useEffect(() => {
    if (morphometry || !sessionId) return;
    let alive = true;
    setBusy(true);
    setError(null);
    api
      .morphometry(sessionId, candidateId)
      .then((m) => { if (alive) planning.setMorphometry(m); })
      // Con un marcado a mano el 422 «mide marcando cuello y ápice» es lo
      // esperado si aún no se midió: la nota de abajo lo dice como
      // información. Cualquier otro fallo (500, sesión caducada, red) sí es
      // un error y se enseña.
      .catch((e) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "Error en morfometría";
        if (!(manualSel && msg === MANUAL_NO_SAC)) setError(msg);
      })
      .finally(() => { if (alive) setBusy(false); });
    // Una respuesta que llega tras cambiar de candidato (o tras medir a mano)
    // es de otro sitio: se descarta, y la barra no se queda colgada.
    return () => { alive = false; setBusy(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, candidateId, morphometry === null]);

  useEffect(() => {
    if (tab === "Seguimiento" && sessionId && !longi) {
      api.longitudinal(sessionId).then(setLongi).catch(() => setLongi(null));
    }
  }, [tab, sessionId, longi]);

  const m = morphometry;
  // The two measurement groups fail independently on the backend, so they are
  // reported independently here. `volume_valid` is new; sessions measured before
  // it existed only carry `reliable`, so fall back to that rather than showing
  // nulled zeros as if they were measurements.
  const volOk = m ? (m.volume_valid ?? m.reliable) : false;
  const neckOk = m ? (m.neck_valid ?? m.reliable) : false;
  // F1-151: sin ningún índice de forma medido la etiqueta no tiene de qué salir.
  const riskMeasured = volOk || neckOk;
  // F1-157: con el saco hasta el límite del recorte, Ø, volumen e índices
  // miden también vaso padre; se marcan como provisionales aquí, en PHASES y
  // (desde el backend) en la nota de Decisión.
  const provisional = isProvisional(m?.warning);
  // F1-13: a menos de 1 mm de un corte de PHASES el error de medida cambia el
  // tramo; si el Ø del cuerpo cae al otro lado, se dice con su cifra.
  const corte = m ? nearCut(m.max_diameter_mm, PHASES_CUTS) : null;
  const bodyMm = m?.body_max_diameter_mm ?? null;
  const avisoCorte = m && corte != null
    ? `Ø máximo junto al corte de ${corte} mm de PHASES: un error de medida de menos de 1 mm cambia de tramo` +
      (bodyMm != null && crossedCut(m.max_diameter_mm, bodyMm, [corte]) != null
        ? `, y con el Ø del cuerpo (${mm(bodyMm)} mm) ya cae al otro lado.`
        : ".")
    : null;

  // El bloque «Plano de cuello»: con una medida que refinar o, con un
  // candidato marcado a mano, sin ninguna todavía (*mr* = null).
  const neckBlock = (mr: MorphometryResult | null) => (
    <div style={{ background: "var(--muted, rgba(120,130,140,0.08))", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon name="STEP_PLAN" size={15} color="var(--muted-foreground)" />
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          Plano de cuello{" "}
          {/* F1-156: «manual» solo no decía que la cifra de la tabla salía de
              esas marcas, no de la medida automática que acababa de fallar. */}
          {(mr?.neck_source === "manual" || mr?.neck_source === "rim") && <Badge variant="success">medida manual</Badge>}
          {mr?.neck_source === "rim" && <> <Badge variant="success">ajustado al borde</Badge></>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10 }}>
        {!mr
          ? "Marca el cuello y el ápice del domo sobre el modelo 3D para medir sobre un saco cerrado."
          : mr.neck_source === "rim"
          ? `Saco cerrado medido alrededor de las marcas. Plano ajustado a los puntos del borde, a ${mr.neck_tilt_deg.toFixed(0)}° del eje del domo. ${
              mr.neck_tilt_deg < 10
                ? "El cuello es casi perpendicular al eje, así que dos clics habrían dado lo mismo."
                : "Con un solo punto el plano habría cortado el cuello en diagonal y lo habría medido más ancho de lo que es."
            }`
          : mr.neck_source === "manual"
          ? "Saco cerrado medido alrededor de las marcas. Recolócalas y vuelve a medir si no están bien."
          : "La detección automática aísla una superficie abierta y no mide un cuello válido. Marca el cuello y el ápice del domo sobre el modelo 3D para medir sobre un saco cerrado."}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          variant={neckOrigin ? "secondary" : "default"}
          onClick={() => setPickMode("neck_origin")}
          disabled={pickMode === "neck_origin"}
          title="Pincha en la unión del saco con el vaso"
          leadingIcon={<Icon name={neckOrigin ? "STATUS_OK" : "TARGET"} size={14} />}
        >
          {neckOrigin ? "Cuello ✓" : "Marcar cuello"}
        </Button>
        {neckOrigin && <MarkCoord p={neckOrigin} color={NECK_ORIGIN_COLOR} what="cuello" />}
        <Button
          variant={neckDome ? "secondary" : "default"}
          onClick={() => setPickMode("neck_dome")}
          disabled={pickMode === "neck_dome"}
          title="Pincha en la punta del domo"
          leadingIcon={<Icon name={neckDome ? "STATUS_OK" : "TARGET"} size={14} />}
        >
          {neckDome ? "Ápice ✓" : "Marcar ápice del domo"}
        </Button>
        {neckDome && <MarkCoord p={neckDome} color={NECK_DOME_COLOR} what="ápice" />}
        {/* F1-155: un solo botón pasaba por «Ajustar con varios puntos», «Clic
            en el borde (n)» y «Borde del cuello (n)», y para terminar había que
            volver a pulsar el mismo botón sin que nada lo dijera. Ahora entrar
            y terminar son dos botones, y el recuento está siempre a la vista. */}
        {pickMode === "neck_rim" ? (
          <>
            <Button variant="secondary" disabled leadingIcon={<Icon name="TARGET" size={14} />}>
              {`Marcando borde · ${neckRim.length} ${neckRim.length === 1 ? "punto" : "puntos"}`}
            </Button>
            <Button onClick={() => setPickMode(null)} leadingIcon={<Icon name="STATUS_OK" size={14} />}>
              Terminar borde
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={neckRim.length ? "secondary" : "outline"}
              onClick={() => setPickMode("neck_rim")}
              leadingIcon={<Icon name={usesRim ? "STATUS_OK" : "TARGET"} size={14} />}
            >
              Marcar borde del cuello
            </Button>
            <span style={{ alignSelf: "center", fontSize: 11, color: "var(--muted-foreground)" }}>
              {`${neckRim.length} ${neckRim.length === 1 ? "punto" : "puntos"} de borde`}
            </span>
          </>
        )}
        {(neckRim.length > 0 || neckOrigin || neckDome) && (
          // Only the rim used to be clearable, so a cuello or ápice put on
          // the wrong spot stayed as a marker in the 3D scene with no way
          // to take it off — and «Medir saco cerrado» kept using it.
          <Button
            variant="ghost"
            onClick={() => { setNeckRim([]); setNeckOrigin(null); setNeckDome(null); setPickMode(null); }}
            leadingIcon={<Icon name="CLEAR" size={14} />}
          >
            Limpiar marcas
          </Button>
        )}
        <Button
          onClick={recomputeWithNeckPlane}
          disabled={!canMeasure || neckBusy}
        >
          {neckBusy ? "Midiendo…" : "Medir saco cerrado"}
        </Button>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
        {usesRim
          ? `El plano se ajustará a los ${neckRim.length} puntos del borde: la orientación sale de la anatomía en vez de suponerse perpendicular al eje del domo.`
          : neckRim.length > 0
            ? `Marca al menos 3 puntos del borde para ajustar el plano (llevas ${neckRim.length}). Con menos se usa el punto de cuello y el ápice.`
            : "Con un solo punto de cuello el plano se supone perpendicular al eje del domo. Si el cuello es oblicuo —típico en bifurcaciones— marca varios puntos de su borde."}
      </div>
      {pickMode === "neck_origin" && (
        <div role="status" style={{ fontSize: 11, color: "var(--foreground)", marginTop: 6 }}>
          Pincha en la unión del saco con el vaso
        </div>
      )}
      {neckBusy && <div style={{ marginTop: 8 }}><ProgressBar /></div>}
    </div>
  );

  return (
    <div className="fade-rise">
      <PanelHead
        title="Morfometría"
        desc="Medidas e índices del aneurisma. Todas las dimensiones en milímetros."
        right={m && <MorphoRiskBadge label={m.rupture_risk_label} measured={riskMeasured} />}
      />

      {busy && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 6 }}>
            Calculando cuello, domo e índices…
          </div>
          <ProgressBar />
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {/* Revisión de F1-146: sin esto el panel decía «marca cuello y ápice»
          y los botones solo existían con una medida ya hecha. */}
      {!m && manualSel && !busy && (
        <>
          <div role="note" aria-label="Candidato marcado a mano" style={{
            fontSize: 12, lineHeight: 1.5, marginBottom: 10, padding: "8px 12px",
            borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
            background: "var(--card)", color: "var(--muted-foreground)",
          }}>
            {MANUAL_NO_SAC}
          </div>
          {neckBlock(null)}
        </>
      )}

      {m && (
        <>
          {/* Cualquier aviso, no solo el de cuello inválido: el de «cuello mayor
              que el saco», el del recorte y el de las partes finas que inflan el
              Ø máximo llegaban con un cuello válido y no se veían. */}
          {m.warning && (
            <div style={{ background: "var(--warning-bg)", border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)", borderRadius: "var(--radius-lg)", padding: "12px 14px", marginBottom: 12, display: "flex", gap: 10 }}>
              <Icon name="STATUS_WARN" color="var(--warning)" size={18} />
              <div style={{ fontSize: 12, color: "var(--warning)" }}>{m.warning}</div>
            </div>
          )}

          {/* Semi-automatic neck plane — shown when the automatic analysis ran on
              an open detector cap (unreliable), or to refine a manual result. */}
          {(!m.reliable || m.neck_source === "manual" || m.neck_source === "rim") && neckBlock(m)}

          {m.centroid && m.principal_axis && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--foreground)", cursor: "pointer", margin: "4px 0 12px", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: planning.morphoOverlay ? "var(--brand-subtle)" : "transparent" }}>
              <input type="checkbox" checked={planning.morphoOverlay} onChange={(e) => planning.setMorphoOverlay(e.target.checked)} />
              Mostrar anotaciones 3D (cuello, altura de domo, Ø máximo) en el visor
            </label>
          )}

          <div style={{ marginBottom: 12 }}>
            <Select
              label="Localización"
              data-localizacion=""
              options={siteOptions(sitePending ?? planning.aneurysmSite)}
              value={sitePending ?? planning.aneurysmSite ?? ANEURYSM_LOCATIONS[0]}
              disabled={siteBusy}
              onChange={(e) => void changeSite(e.target.value as AneurysmLocation)}
            />
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
              La usan PHASES, ELAPSS, UIATS, la decisión terapéutica y el informe.
            </div>
            {siteNotice && (
              <div role="status" style={{ fontSize: 12, color: "var(--warning)", marginTop: 6, lineHeight: 1.5 }}>
                {siteNotice}
              </div>
            )}
          </div>

          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <div style={{ marginTop: 12 }}>
            {tab === "Métricas" && (
              <div>
                {/* Dos grupos, dos banderas. El backend anula el grupo de volumen y
                    el de cuello por separado, así que la tabla tiene que hacer lo
                    mismo: con una sola bandera combinada, un cuello perfectamente
                    medido se ocultaba en cuanto fallaba el volumen — mientras el
                    visor, que no consulta la bandera, seguía anotándolo en 3D. */}
                <Metric label="Ø máximo" value={m.max_diameter_mm.toFixed(1)} unit=" mm"
                        badge={provisional ? ["provisional", "warning"] : undefined} />
                {avisoCorte && (
                  <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--warning)", margin: "4px 0 6px" }}>
                    {avisoCorte}
                  </div>
                )}
                {/* El mismo Ø sin ramas finas pegadas al saco: si se separa del de
                    arriba, el aviso explica por qué (services/sac_body.py). */}
                {m.body_max_diameter_mm != null && (
                  <Metric label="Ø máximo del cuerpo (sin ramas finas)" value={m.body_max_diameter_mm.toFixed(1)} unit=" mm" />
                )}
                <Metric label="Cuello" value={neckOk ? m.neck_mm.toFixed(1) : "—"} unit={neckOk ? " mm" : ""} />
                <Metric label="Altura de domo" value={neckOk ? m.dome_height_mm.toFixed(1) : "—"} unit={neckOk ? " mm" : ""} />
                <Metric label="Volumen" value={volOk ? m.volume_mm3.toFixed(1) : "—"} unit={volOk ? " mm³" : ""}
                        badge={provisional && volOk ? ["provisional", "warning"] : undefined} />
                {/* F1-159: con la malla abierta el área es la del parche, no la del
                    saco, igual que el volumen: «—» como el resto del grupo. */}
                <Metric label="Área superficie" value={volOk ? m.surface_area_mm2.toFixed(1) : "—"} unit={volOk ? " mm²" : ""} />
                {/* F1-160/161/162: un corte por índice, el mismo que la etiqueta de
                    riesgo y Decisión (thresholds.ts), con su fuente en el tooltip.
                    El BF decía «Cuello ancho» justo con el cuello estrecho. */}
                <div title={THRESHOLD_TIP.dnr}>
                  <Metric
                    label="DNR"
                    value={neckOk ? m.dnr.toFixed(2) : "—"}
                    badge={!neckOk ? ["sin medir", "outline"] : badgeFor("dnr", m.dnr)}
                  />
                </div>
                <div title={THRESHOLD_TIP.ar}>
                  <Metric
                    label="AR"
                    value={neckOk ? m.ar.toFixed(2) : "—"}
                    badge={!neckOk ? ["sin medir", "outline"] : badgeFor("ar", m.ar)}
                  />
                </div>
                <div title={THRESHOLD_TIP.bf}>
                  <Metric
                    label="BF"
                    value={neckOk ? m.bf.toFixed(2) : "—"}
                    badge={!neckOk ? ["sin medir", "outline"] : badgeFor("bf", m.bf)}
                  />
                </div>
                {/* F1-151 / F1-68: la etiqueta de forma, con su criterio y separada
                    del riesgo de rotura de la pestaña de al lado. */}
                <div data-fila-riesgo title={riskMeasured ? MORPHO_RISK_CRITERIA : undefined}>
                  <Metric
                    label="Riesgo morfométrico (forma)"
                    value={riskMeasured ? m.rupture_risk_label : "Sin medir"}
                    badge={riskMeasured ? undefined : ["sin medir", "outline"]}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, margin: "4px 0 6px" }}>
                    {MORPHO_RISK_CRITERIA}
                  </div>
                </div>
              </div>
            )}
            {tab === "Índices" && (
              <div>
                {/* Todo este grupo se calcula sobre el volumen encerrado, así que
                    cuelga de volume_valid. Compacidad y Ø equivalente NO estaban
                    filtrados y mostraban el 0,00 con el que se anulan como si
                    fuera una medida. */}
                {/* F1-163: «Ondulación», y el corte de la etiqueta de riesgo y de
                    Decisión (aquí era 0,15; allí 0,10/0,25 y 0,20). */}
                <div title={THRESHOLD_TIP.ui}>
                  <Metric label="UI · Ondulación" value={volOk ? m.ui.toFixed(2) : "—"} badge={!volOk ? ["sin medir", "outline"] : badgeFor("ui", m.ui)} />
                </div>
                {/* El SR depende de la arteria madre, que se mide justo por debajo
                    del cuello: con un cuello estimado automáticamente esa referencia
                    es frágil, y la cifra se presenta como orientativa. */}
                <div title={THRESHOLD_TIP.sr}>
                  <Metric
                    label="SR · Size Ratio"
                    value={m.sr > 0 ? m.sr.toFixed(2) : "—"}
                    badge={m.sr <= 0 ? ["sin medir", "outline"]
                      : m.neck_source === "auto" ? ["orientativo", "outline"]
                      : badgeFor("sr", m.sr)}
                  />
                </div>
                {m.sr > 0 && m.neck_source === "auto" && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, margin: "-2px 0 8px" }}>
                    SR orientativo: el cuello está estimado, no marcado. La arteria madre se
                    mide justo bajo el cuello, así que marca el borde para fiarte de esta cifra.
                  </div>
                )}
                {/* F1-164: cuatro siglas sin decir qué miden ni desde cuándo
                    importan, al mismo nivel que UI y SR, que sí puntúan. Van
                    plegadas y cada una con su tooltip (MORE_TIP). */}
                <div style={{ marginTop: 12 }}>
                  <Collapsible title="Más índices" subtitle="Elipticidad, no-esfericidad, compacidad, Ø esfera equivalente" storageKey="morfo.mas-indices">
                    <div title={MORE_TIP.ei}>
                      <Metric label="EI · Elipticidad" value={volOk ? m.ei.toFixed(2) : "—"} badge={!volOk ? ["sin medir", "outline"] : badgeFor("ei", m.ei)} />
                    </div>
                    <div title={MORE_TIP.nsi}>
                      <Metric label="NSI · No-esfericidad" value={volOk ? m.nsi.toFixed(2) : "—"} badge={!volOk ? ["sin medir", "outline"] : undefined} />
                    </div>
                    <div title={MORE_TIP.compactness}>
                      <Metric label="Compacidad (Wadell)" value={volOk ? m.compactness.toFixed(2) : "—"} badge={!volOk ? ["sin medir", "outline"] : undefined} />
                    </div>
                    <div title={MORE_TIP.eq}>
                      <Metric label="Ø esfera equivalente" value={volOk ? m.eq_sphere_diam_mm.toFixed(1) : "—"} unit={volOk ? " mm" : ""} />
                    </div>
                  </Collapsible>
                </div>
              </div>
            )}
            {tab === "PHASES" && (
              <PhasesCalculator maxDiameterMm={m.max_diameter_mm} sessionId={sessionId}
                                bodyDiameterMm={bodyMm} provisional={provisional} />
            )}
            {tab === "UIATS" && (
              <UiatsCalculator m={m} sessionId={sessionId} dob={planning.patient?.dob} />
            )}
            {tab === "ELAPSS" && (
              <ElapssCalculator maxDiameterMm={m.max_diameter_mm} sessionId={sessionId} dob={planning.patient?.dob}
                                bodyDiameterMm={bodyMm} provisional={provisional}
                                irregularHint={m.volume_valid && m.ui >= UI_HIGH} />
            )}
            {tab === "Seguimiento" && (
              <div>
                {sessionId && <FollowupOverlay sessionId={sessionId} />}
                {longi?.growth_alert && (
                  <div style={{ background: "var(--warning-bg)", border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)", borderRadius: "var(--radius-lg)", padding: "12px 14px", marginBottom: 12, display: "flex", gap: 10 }}>
                    <Icon name="GROWTH" color="var(--warning)" size={18} />
                    <div style={{ fontSize: 12, color: "var(--warning)" }}>
                      <b>Alerta de crecimiento:</b> {longi.growth_alert_message}
                    </div>
                  </div>
                )}
                {longi && longi.entries.length >= 2 && <LongitudinalChart entries={longi.entries} />}
                {/* F1-166: con una sola entrada la lista era la propia sesión,
                    una fecha suelta que parecía un control anterior. Hasta que
                    haya dos no hay nada que comparar; con dos, la abierta se
                    rotula «esta sesión». */}
                {longi && longi.entries.length >= 2 ? (
                  longi.entries.map((e) => (
                    <Metric
                      key={e.session_date + e.session_label}
                      label={CURRENT_LABELS.has(e.session_label) ? `esta sesión · ${e.session_date}` : e.session_date}
                      value={`${e.max_diameter_mm.toFixed(1)} mm · AR ${e.ar.toFixed(2)}`}
                      badge={[e.rupture_risk_label, riskVariant(e.rupture_risk_label)]}
                    />
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "14px 0" }}>
                    Sin sesiones previas guardadas para este paciente. Guarda esta sesión al finalizar
                    para iniciar el seguimiento longitudinal.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <Button
        style={{ marginTop: 18, width: "100%" }}
        onClick={onNext}
        disabled={!m}
        trailingIcon={<Icon name="STEP_PLAN" />}
      >
        {/* Glosario: todo botón de avance dice «Continuar a …». */}
        Continuar a decisión
      </Button>
      {/* F1-171: se podía pasar a Decisión con «Medición no fiable» arriba y
          nada junto al botón. Sigue encendido (el carril deja pasar), pero dice
          qué falta. */}
      {m && !m.reliable && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
          La medida no es fiable: marca cuello y ápice antes de decidir
        </div>
      )}
    </div>
  );
}
