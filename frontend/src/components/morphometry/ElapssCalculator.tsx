/* ELAPSS — riesgo de CRECIMIENTO a 3 y 5 años (Backes, Neurology 2017).
   POST /api/elapss. Predice crecimiento, no rotura: orienta cada cuánto
   repetir la imagen. El tamaño se rellena desde la morfometría. */

import { useEffect, useRef, useState } from "react";
import { ageFromDob } from "../patientAge";
import { api } from "../../api/client";
import type { ElapssPopulation, ElapssResult } from "../../api/types";
import { usePlanning } from "../../store/planning";
import { Button } from "../Button";
import { Input } from "../Input";
import { Select } from "../Select";
import { Metric } from "../Metric";
import { ErrorNote, SectionLabel } from "../PanelHead";
import { DiameterSource } from "./DiameterSource";
import { ELAPSS_CUTS } from "./diameterCut";
import { InheritedSite } from "./InheritedSite";
import { isSiteKnown, siteFor } from "./thresholds";

const POPULATIONS: { value: ElapssPopulation; label: string }[] = [
  { value: "other", label: "Norteamérica, China o Europa (salvo Finlandia)" },
  { value: "japan", label: "Japón" },
  { value: "finland", label: "Finlandia" },
];

export function ElapssCalculator({
  maxDiameterMm, sessionId, irregularHint, dob, bodyDiameterMm, provisional,
}: {
  maxDiameterMm: number;
  /** Ø del cuerpo sin ramas finas: si cae en otro tramo, se avisa (F1-14). */
  bodyDiameterMm?: number | null;
  /** El saco aislado llega al límite del recorte: el Ø mide también vaso padre. */
  provisional?: boolean;
  sessionId: string | null;
  /** La morfometría sugiere contorno irregular (UI alto): solo se avisa, no se marca. */
  irregularHint?: boolean;
  /** Fecha de nacimiento del paciente: rellena la edad, como en UIATS. */
  dob?: string;
}) {
  const [population, setPopulation] = useState<ElapssPopulation>("other");
  // F1-165: la localización se hereda de Morfometría; aquí arrancaba en
  // «ACI / ACA / AComA» y, sin tocarla, restaba los puntos de una posterior.
  const { aneurysmSite } = usePlanning();
  const location = siteFor("elapss", aneurysmSite);
  const siteKnown = isSiteKnown("elapss", aneurysmSite);
  const [age, setAge] = useState(ageFromDob(dob));
  const [size, setSize] = useState(maxDiameterMm > 0 ? maxDiameterMm.toFixed(1) : "");
  const [earlierSah, setEarlierSah] = useState(false);
  const [irregular, setIrregular] = useState(false);
  const [result, setResult] = useState<ElapssResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Al cambiar la localización en Morfometría el servidor recalcula lo guardado
  // con sus mismas entradas; aquí se recalcula lo que está en pantalla, para
  // que la cifra que se ve sea la del informe. Sin categoría, no hay cifra.
  const prevSite = useRef(location);
  useEffect(() => {
    if (prevSite.current === location) return;
    prevSite.current = location;
    if (result && siteKnown) void compute();
    else setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const compute = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.elapss({
        session_id: sessionId, population, location, age_years: Number(age) || 0,
        size_mm: Number(size) || 0, earlier_sah: earlierSah, irregular,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error calculando ELAPSS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
        Riesgo de <b style={{ color: "var(--foreground)" }}>crecimiento</b> a 3 y 5 años (Backes
        et al., <i>Neurology</i> 2017). No es riesgo de rotura: sirve para decidir cada
        cuánto repetir la imagen. El tamaño se rellena desde la morfometría.
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5,
                    padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--muted)" }}>
        Es una referencia poblacional, no una predicción para este paciente: fuera de sus
        cohortes discrimina mal, como PHASES. Otras poblaciones (p. ej. Latinoamérica) no
        estaban en las cohortes.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Población" options={POPULATIONS} value={population} onChange={(e) => setPopulation(e.target.value as ElapssPopulation)} />
        <InheritedSite site={aneurysmSite} known={siteKnown} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Edad (años)" type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
          <Input label="Tamaño (mm)" type="number" step="0.1" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <DiameterSource maxMm={maxDiameterMm} sizeMm={Number(size) || 0} bodyMm={bodyDiameterMm} provisional={provisional}
                        cuts={ELAPSS_CUTS} score="ELAPSS" />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={earlierSah} onChange={(e) => setEarlierSah(e.target.checked)} />
          HSA previa (otro aneurisma)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={irregular} onChange={(e) => setIrregular(e.target.checked)} />
          Forma irregular (varios lóbulos, blebs o protrusiones)
        </label>
        {irregularHint && !irregular && (
          <div style={{ fontSize: 11, color: "var(--warning)", lineHeight: 1.5, marginTop: -6 }}>
            La morfometría da un contorno ondulado (UI alto): mira en el visor si tiene
            lóbulos o blebs antes de dejarlo como regular.
          </div>
        )}
      </div>

      <Button style={{ marginTop: 14, width: "100%" }} onClick={() => void compute()} disabled={busy || !age || !siteKnown}>
        {busy ? "Calculando…" : "Calcular ELAPSS"}
      </Button>
      <ErrorNote>{error}</ErrorNote>

      {result && (
        <>
          <div style={{
            marginTop: 16, padding: "16px 18px", borderRadius: "var(--radius-lg)",
            background: "var(--muted)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 800, lineHeight: 1 }}>
                {result.total_score}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>ELAPSS · {result.score_band}</div>
            </div>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
              <div><b>{result.growth_3yr_pct.toFixed(1)} %</b> de crecimiento a 3 años</div>
              <div><b>{result.growth_5yr_pct.toFixed(1)} %</b> a 5 años</div>
            </div>
          </div>

          <SectionLabel style={{ marginTop: 16 }}>Desglose de factores</SectionLabel>
          <Metric label="HSA previa (sin = 1)" value={`+${result.earlier_sah_pts}`} />
          <Metric label="Localización" value={`+${result.location_pts}`} />
          <Metric label="Edad (1 por cada 5 años sobre 60)" value={`+${result.age_pts}`} />
          <Metric label="Población" value={`+${result.population_pts}`} />
          <Metric label="Tamaño" value={`+${result.size_pts}`} />
          <Metric label="Forma" value={`+${result.shape_pts}`} />
          {result.notes.map((n) => (
            <div key={n} style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>{n}</div>
          ))}
        </>
      )}
    </div>
  );
}
