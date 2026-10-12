/* PHASES calculator — 5-year rupture risk (Greving 2014). POST /api/phases.
   The Size factor auto-fills from the morphometric max diameter. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PhasesPopulation, PhasesResult } from "../../api/types";
import { Button } from "../Button";
import { Input } from "../Input";
import { Select } from "../Select";
import { Metric } from "../Metric";
import { ErrorNote, SectionLabel } from "../PanelHead";
import { usePlanning } from "../../store/planning";
import { ageFromDob } from "../patientAge";
import { CUT_WARN, DiameterSource } from "./DiameterSource";
import {
  PHASES_AGE_MIN, PHASES_AGE_PTS, PHASES_CUTS, PHASES_HTN_PTS, PHASES_POP_PTS, PHASES_SAH_PTS,
  PHASES_SITE_PTS, mm, nearCut, phasesLabel, phasesSizePoints,
} from "./diameterCut";
import { InheritedSite } from "./InheritedSite";
import { isSiteKnown, siteFor } from "./thresholds";

const POPULATIONS: { value: PhasesPopulation; label: string }[] = [
  { value: "other", label: "Otra población" },
  { value: "japan", label: "Japón" },
  { value: "finland", label: "Finlandia" },
];

const BAND_COLOR: Record<PhasesResult["risk_band"], string> = {
  low: "var(--success)",
  moderate: "var(--warning)",
  high: "var(--destructive)",
};
const BAND_BG: Record<PhasesResult["risk_band"], string> = {
  low: "var(--success-bg)",
  moderate: "var(--warning-bg)",
  high: "color-mix(in srgb, var(--destructive) 12%, transparent)",
};
const BAND_LABEL: Record<PhasesResult["risk_band"], string> = {
  low: "Riesgo bajo", moderate: "Riesgo moderado", high: "Riesgo alto",
};

export function PhasesCalculator({
  maxDiameterMm,
  sessionId,
  bodyDiameterMm,
  provisional,
}: {
  maxDiameterMm: number;
  sessionId: string | null;
  /** Ø del cuerpo sin ramas finas: el otro diámetro posible, si lo hay. */
  bodyDiameterMm?: number | null;
  /** El saco aislado llega al límite del recorte: el Ø mide también vaso padre. */
  provisional?: boolean;
}) {
  const planning = usePlanning();
  const [population, setPopulation] = useState<PhasesPopulation>("other");
  const [hypertension, setHypertension] = useState(false);
  const [age, setAge] = useState(ageFromDob(planning.patient?.dob));
  const [size, setSize] = useState(maxDiameterMm > 0 ? maxDiameterMm.toFixed(1) : "");
  const [earlierSah, setEarlierSah] = useState(false);
  // F1-165: la localización ya no se elige aquí (arrancaba en «ACI» y, sin
  // tocarla, quitaba los +4 de un aneurisma posterior). Se hereda de
  // Morfometría y se traduce a la categoría de PHASES.
  const site = siteFor("phases", planning.aneurysmSite);
  const siteKnown = isSiteKnown("phases", planning.aneurysmSite);
  const [result, setResult] = useState<PhasesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un resultado calculado con otra localización ya no es de este aneurisma
  // (el backend también lo borra al cambiarla).
  useEffect(() => { setResult(null); }, [site]);

  // F1-15: a menos de 1 mm de un corte, decir cuántos puntos cambia, con los
  // demás factores tal como están. Se enuncia siempre del lado alto al bajo,
  // como la fila del anexo: «con 9,5 mm el PHASES baja de 10 a 7 puntos». El
  // otro valor es el Ø del cuerpo si cae al otro lado; si no, el tamaño
  // desplazado el margen de 1 mm.
  const sizeNum = Number(size) || 0;
  const corte = nearCut(sizeNum, PHASES_CUTS);
  let avisoCorte: string | null = null;
  if (corte != null) {
    const resto = PHASES_POP_PTS[population] + (hypertension ? PHASES_HTN_PTS : 0)
      + ((Number(age) || 0) >= PHASES_AGE_MIN ? PHASES_AGE_PTS : 0)
      + (earlierSah ? PHASES_SAH_PTS : 0) + PHASES_SITE_PTS[site];
    const body = bodyDiameterMm != null && bodyDiameterMm > 0 ? bodyDiameterMm : null;
    let alto: number, bajo: number;
    if (sizeNum >= corte) {
      alto = sizeNum;
      bajo = body != null && body < corte ? body : Math.round((sizeNum - 1) * 10) / 10;
    } else {
      bajo = sizeNum;
      alto = body != null && body >= corte ? body : Math.round((sizeNum + 1) * 10) / 10;
    }
    avisoCorte =
      `El tamaño (${mm(sizeNum)} mm) está junto al corte de ${corte} mm: con ${mm(bajo)} mm el PHASES ` +
      `baja de ${resto + phasesSizePoints(alto)} a ${resto + phasesSizePoints(bajo)} puntos.`;
  }

  const compute = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.phases({
        session_id: sessionId,
        population,
        hypertension,
        age_years: Number(age) || 0,
        size_mm: Number(size) || 0,
        earlier_sah: earlierSah,
        site,
      });
      setResult(res);
      // El atajo del aneurisma pequeño decide «vigilancia» o «discusión
      // multidisciplinaria» según la banda de riesgo, así que un PHASES nuevo
      // deja obsoleta la recomendación anterior. El backend la borra cuando el
      // riesgo cambia; esto evita que la pantalla siga enseñando la vieja.
      planning.setTreatment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error calculando PHASES");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
        Riesgo de rotura a 5 años (Greving et al., <i>Lancet Neurology</i> 2014). El tamaño se
        auto-rellena desde la morfometría.
      </div>
      {/* Lo que vale la cifra, dicho junto a ella y no solo en el informe: en
          series externas PHASES discrimina mal los aneurismas que se rompen de
          los que no (también ELAPSS y UIATS, serie de un centro, 2025). */}
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5,
                    padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--muted)" }}>
        Es una referencia poblacional, no una predicción para este paciente: fuera de la
        cohorte en que se desarrolló, PHASES distingue mal los aneurismas que acaban
        rompiéndose de los que no. Úsala para la conversación, no como umbral.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Población" options={POPULATIONS} value={population} onChange={(e) => setPopulation(e.target.value as PhasesPopulation)} />
        <InheritedSite site={planning.aneurysmSite} known={siteKnown} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Edad (años)" type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
          <Input label="Tamaño (mm)" type="number" step="0.1" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <DiameterSource maxMm={maxDiameterMm} sizeMm={sizeNum} bodyMm={bodyDiameterMm} provisional={provisional}
                        cuts={PHASES_CUTS} score="PHASES" showTramo={false} />
        {avisoCorte && <div style={CUT_WARN}>{avisoCorte}</div>}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={hypertension} onChange={(e) => setHypertension(e.target.checked)} />
          Hipertensión arterial
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={earlierSah} onChange={(e) => setEarlierSah(e.target.checked)} />
          HSA previa (otro aneurisma)
        </label>
      </div>

      <Button style={{ marginTop: 14, width: "100%" }} onClick={() => void compute()} disabled={busy || !age || !siteKnown}>
        {busy ? "Calculando…" : "Calcular PHASES"}
      </Button>
      <ErrorNote>{error}</ErrorNote>

      {result && (
        <>
          <div
            style={{
              marginTop: 16,
              padding: "16px 18px",
              borderRadius: "var(--radius-lg)",
              background: BAND_BG[result.risk_band],
              border: `1px solid ${BAND_COLOR[result.risk_band]}`,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 800, color: BAND_COLOR[result.risk_band], lineHeight: 1 }}>
                {result.total_score}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>PHASES</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: BAND_COLOR[result.risk_band] }}>
                {mm(result.risk_5yr_pct)} %
              </div>
              {/* El mismo rótulo que Decisión y el PDF, con la tabla de la que sale. */}
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                {phasesLabel(result.total_score, result.risk_5yr_pct)}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {BAND_LABEL[result.risk_band]} · rotura a 5 años
              </div>
            </div>
          </div>

          <SectionLabel style={{ marginTop: 16 }}>Desglose de factores</SectionLabel>
          <Metric label="Población" value={`+${result.population_pts}`} />
          <Metric label="Hipertensión" value={`+${result.hypertension_pts}`} />
          <Metric label="Edad (≥70)" value={`+${result.age_pts}`} />
          <Metric label="Tamaño" value={`+${result.size_pts}`} />
          <Metric label="HSA previa" value={`+${result.sah_pts}`} />
          <Metric label="Localización" value={`+${result.site_pts}`} />
        </>
      )}
    </div>
  );
}
