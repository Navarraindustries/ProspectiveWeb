/* UIATS — tratar frente a vigilar (Etminan, Neurology 2015). POST /api/uiats.
   Dos sumas: con 3 puntos o más de diferencia sugiere la mayor; con menos,
   «no concluyente». La edad sale de la fecha de nacimiento si está, y el
   diámetro de la morfometría; lo demás lo marca el profesional. Las pistas
   (SR/AR, cuello ancho) solo se enseñan: no se marcan solas. */

import { useState } from "react";
import { api } from "../../api/client";
import type { MorphometryResult, UiatsRequest, UiatsResult } from "../../api/types";
import { Button } from "../Button";
import { Input } from "../Input";
import { Select } from "../Select";
import { ErrorNote, SectionLabel } from "../PanelHead";

type Opt = [key: string, label: string, pts: number];

const RISK: Opt[] = [
  ["previous_sah", "HSA previa por otro aneurisma", 4], ["familial", "Aneurismas o HSA familiares (≥ 2 de 1.er grado)", 3],
  ["ethnicity", "Etnia japonesa, finlandesa o inuit", 2], ["smoking", "Fumador actual", 3],
  ["hypertension", "Hipertensión (PAS > 140 mm Hg)", 2], ["adpkd", "Poliquistosis renal (ADPKD)", 2],
  ["drug_abuse", "Consumo de drogas (cocaína, anfetaminas)", 2], ["alcohol_abuse", "Abuso de alcohol", 1],
];
const SYMPTOMS: Opt[] = [
  ["cranial_nerve_deficit", "Déficit de par craneal", 4], ["mass_effect", "Efecto masa clínico o radiológico", 4],
  ["thromboembolic", "Eventos tromboembólicos desde el aneurisma", 3], ["epilepsy", "Epilepsia", 1],
];
const PATIENT_OTHER: Opt[] = [
  ["fear_of_rupture", "Calidad de vida reducida por miedo a la rotura", 2], ["multiplicity", "Aneurismas múltiples", 1],
];
const MORPHOLOGY: Opt[] = [["irregular", "Irregularidad o lobulación", 3], ["sr_ar", "SR > 3 o AR > 1,6", 1]];
const ANEURYSM_OTHER: Opt[] = [
  ["growth", "Crecimiento en imagen seriada", 4], ["de_novo", "Formación de novo en imagen seriada", 3],
  ["contralateral_stenoocclusive", "Enfermedad estenooclusiva contralateral", 1],
];
const COMORBID: Opt[] = [
  ["neurocognitive", "Trastorno neurocognitivo", 3], ["coagulopathy", "Coagulopatía o trombofilia", 2],
  ["psychiatric", "Trastorno psiquiátrico", 2],
];
const LOCATIONS = [
  { value: "other", label: "Otra localización (0)" },
  { value: "acom_pcom", label: "AComA o AComP (+2)" },
  { value: "vertebrobasilar", label: "Arteria vertebral o basilar (+4)" },
  { value: "basilar_bifurcation", label: "Bifurcación basilar (+5)" },
];
const LIFE = [
  { value: "", label: "Sin enfermedad crónica o maligna que la limite" },
  { value: "gt10", label: "> 10 años (+1 vigilar)" },
  { value: "5to10", label: "5-10 años (+3 vigilar)" },
  { value: "lt5", label: "< 5 años (+4 vigilar)" },
];

function edadDesde(dob?: string): string {
  if (!dob) return "";
  const n = new Date(dob);
  if (Number.isNaN(n.getTime())) return "";
  const hoy = new Date();
  let a = hoy.getFullYear() - n.getFullYear();
  if (hoy < new Date(hoy.getFullYear(), n.getMonth(), n.getDate())) a--;
  return a > 0 ? String(a) : "";
}

const REC: Record<UiatsResult["recommendation"], [string, string]> = {
  repair: ["A favor de tratar", "var(--warning)"],
  conservative: ["A favor de vigilar", "var(--success)"],
  not_definitive: ["No concluyente", "var(--muted-foreground)"],
};

export function UiatsCalculator({
  m, sessionId, dob,
}: { m: MorphometryResult; sessionId: string | null; dob?: string }) {
  const [age, setAge] = useState(edadDesde(dob));
  const [diameter, setDiameter] = useState(m.max_diameter_mm > 0 ? m.max_diameter_mm.toFixed(1) : "");
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [location, setLocation] = useState("other");
  const [life, setLife] = useState("");
  const [complexity, setComplexity] = useState<"high" | "low">("low");
  const [r, setR] = useState<UiatsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (grupo: string, k: string) => setSel((s) => {
    const n = new Set(s[grupo] ?? []);
    if (n.has(k)) n.delete(k); else n.add(k);
    return { ...s, [grupo]: n };
  });
  const lista = (grupo: string) => [...(sel[grupo] ?? [])];

  const checks = (grupo: string, opts: Opt[]) => opts.map(([k, label, pts]) => (
    <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
      <input type="checkbox" checked={sel[grupo]?.has(k) ?? false} onChange={() => toggle(grupo, k)} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>+{pts}</span>
    </label>
  ));

  // Pistas que da la morfometría, sin marcar nada.
  const parent = m.sr > 0 ? m.max_diameter_mm / m.sr : 0;
  const pistaSrAr = (m.sr > 3 || m.ar > 1.6) && (m.sr > 0 || m.ar > 0);
  const pistaComplejo = (parent > 0 && m.neck_mm > parent) || (m.max_diameter_mm > 0 && m.max_diameter_mm < 3);

  const calcular = async () => {
    setBusy(true);
    setError(null);
    try {
      const req: UiatsRequest = {
        session_id: sessionId, age_years: Number(age) || 0, diameter_mm: Number(diameter) || 0,
        risk_factors: lista("risk"), symptoms: lista("symptoms"), patient_other: lista("patient_other"),
        morphology: lista("morphology"), location: location as UiatsRequest["location"],
        aneurysm_other: lista("aneurysm_other"),
        life_expectancy: (life || null) as UiatsRequest["life_expectancy"], comorbid: lista("comorbid"),
        complexity,
      };
      setR(await api.uiats(req));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error calculando UIATS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
        Suma lo que pesa a favor de <b style={{ color: "var(--foreground)" }}>tratar</b> y lo que pesa a
        favor de <b style={{ color: "var(--foreground)" }}>vigilar</b> (Etminan et al., <i>Neurology</i> 2015).
        Con 3 puntos o más de diferencia sugiere la mayor; con menos, cualquiera de las dos se puede defender.
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5,
                    padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--muted)" }}>
        Es un consenso de 69 especialistas, no un modelo ajustado a desenlaces, y en series
        externas no discriminó de forma fiable: ordena la conversación, no decide.
      </div>

      <SectionLabel>Paciente</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "8px 0" }}>
        <Input label="Edad (años)" type="number" min={18} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
        <Input label="Diámetro máximo (mm)" type="number" step="0.1" value={diameter} onChange={(e) => setDiameter(e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {checks("risk", RISK)}
        <div style={{ height: 4 }} />
        {checks("symptoms", SYMPTOMS)}
        <div style={{ height: 4 }} />
        {checks("patient_other", PATIENT_OTHER)}
      </div>

      <SectionLabel>Aneurisma</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0 10px" }}>
        <Select label="Localización" options={LOCATIONS} value={location} onChange={(e) => setLocation(e.target.value)} />
        {checks("morphology", MORPHOLOGY)}
        {pistaSrAr && !(sel.morphology?.has("sr_ar")) && (
          <div style={{ fontSize: 11, color: "var(--warning)" }}>
            La morfometría da SR {m.sr.toFixed(2)} y AR {m.ar.toFixed(2)}: revisa si aplica.
          </div>
        )}
        {checks("aneurysm_other", ANEURYSM_OTHER)}
      </div>

      <SectionLabel>A favor de vigilar</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0 10px" }}>
        <Select label="Esperanza de vida por enfermedad crónica o maligna" options={LIFE} value={life} onChange={(e) => setLife(e.target.value)} />
        {checks("comorbid", COMORBID)}
        <Select label="Complejidad del tratamiento" value={complexity}
                options={[{ value: "low", label: "Baja (0)" }, { value: "high", label: "Alta (+3 vigilar)" }]}
                onChange={(e) => setComplexity(e.target.value as "high" | "low")} />
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Alta si hay cuello más ancho que la arteria madre, lobulaciones importantes, calcificación,
          trombo, tortuosidad o estenosis proximal, una rama en el cuello o el saco, o &lt; 3 mm.
          {pistaComplejo && complexity === "low" && (
            <span style={{ color: "var(--warning)" }}> La morfometría sugiere complejidad alta (cuello
              {" "}{m.neck_mm.toFixed(1)} mm{parent > 0 ? ` frente a ${parent.toFixed(1)} mm de arteria madre` : ""}).</span>
          )}
        </div>
      </div>

      <Button style={{ width: "100%" }} onClick={() => void calcular()} disabled={busy || !age || !diameter}>
        {busy ? "Calculando…" : "Calcular UIATS"}
      </Button>
      <ErrorNote>{error}</ErrorNote>

      {r && (
        <div style={{ marginTop: 14, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
            <div><div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>TRATAR</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 800 }}>{r.repair}</div></div>
            <div><div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>VIGILAR</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 800 }}>{r.conservative}</div></div>
            <div style={{ flex: 1, textAlign: "right", fontWeight: 700, color: REC[r.recommendation][1] }}>
              {REC[r.recommendation][0]}
              <div style={{ fontSize: 11, fontWeight: 400, color: "var(--muted-foreground)" }}>diferencia {r.difference > 0 ? "+" : ""}{r.difference}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, fontSize: 11.5, lineHeight: 1.6 }}>
            <div>{r.repair_items.map((it) => <div key={it.label}>{it.label} <b>+{it.points}</b></div>)}</div>
            <div>{r.conservative_items.map((it) => <div key={it.label}>{it.label} <b>+{it.points}</b></div>)}</div>
          </div>
          {r.notes.map((n) => <div key={n} style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>{n}</div>)}
        </div>
      )}
    </div>
  );
}
