/* «Adjuntar a un caso»: ligar a un paciente y un caso una sesión empezada sin
   ellos, en un solo paso. Ver backend/routers/attach.py.

   La cabecera DICOM solo PROPONE los datos: aparecen en el formulario para que
   el profesional los revise, y si ya hay un paciente con ese nº de historia se
   ofrece elegirlo antes que crear otro. */

import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AttachResult, PatientSummary, SessionIdentity, StudySummary } from "../api/types";
import { Button } from "./Button";
import { Input } from "./Input";
import { ErrorNote, SectionLabel } from "./PanelHead";
import { Sheet } from "./Sheet";

type PatientChoice = { kind: "existing"; id: number } | { kind: "new" };
type CaseChoice = { kind: "existing"; id: number } | { kind: "new" };

const radio = (on: boolean): React.CSSProperties => ({
  display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", cursor: "pointer",
  border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius-md)",
  background: on ? "var(--brand-subtle)" : "transparent", fontSize: 13,
});

export function AttachCaseSheet({
  open, onClose, sessionId, onAttached,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onAttached: (r: AttachResult) => void;
}) {
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientChoice, setPatientChoice] = useState<PatientChoice>({ kind: "new" });
  const [search, setSearch] = useState("");
  const [np, setNp] = useState({ surname: "", given_name: "", hospital_id: "", dob: "", sex: "" });
  const [cases, setCases] = useState<StudySummary[]>([]);
  const [caseChoice, setCaseChoice] = useState<CaseChoice>({ kind: "new" });
  const [motivo, setMotivo] = useState("");
  const [studyDate, setStudyDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: lo que propone la cabecera y la lista de pacientes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    let vivo = true;
    api.sessionIdentity(sessionId).then((id) => {
      if (!vivo) return;
      setIdentity(id);
      setStudyDate(id.study_date);
      const m = id.matches.find((x) => x.reason === "hospital_id");
      setPatientChoice(m ? { kind: "existing", id: m.id } : { kind: "new" });
    }).catch(() => {});
    api.listPatients().then((ps) => { if (vivo) setPatients(ps); }).catch(() => {});
    return () => { vivo = false; };
  }, [open, sessionId]);

  // Los casos del paciente elegido.
  useEffect(() => {
    if (patientChoice.kind !== "existing") { setCases([]); setCaseChoice({ kind: "new" }); return; }
    let vivo = true;
    api.patientStudies(patientChoice.id).then((cs) => { if (vivo) setCases(cs); }).catch(() => setCases([]));
    setCaseChoice({ kind: "new" });
    return () => { vivo = false; };
  }, [patientChoice]);

  const usarCabecera = () => {
    if (!identity) return;
    setNp({ ...identity.suggestion });
  };

  const q = search.trim().toLowerCase();
  const filtrados = (q
    ? patients.filter((p) => p.full_name.toLowerCase().includes(q) || (p.hospital_id || "").toLowerCase().includes(q))
    : patients).slice(0, 8);

  const listo = (patientChoice.kind === "existing" || np.surname.trim() || np.given_name.trim())
    && (caseChoice.kind === "existing" || motivo.trim());

  const adjuntar = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.attachSession(sessionId, {
        ...(patientChoice.kind === "existing" ? { patient_id: patientChoice.id } : { new_patient: np }),
        ...(caseChoice.kind === "existing" ? { case_id: caseChoice.id }
          : { new_case: { dx_principal: motivo.trim(), study_date: studyDate } }),
      });
      onAttached(r);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo adjuntar");
    } finally {
      setBusy(false);
    }
  };

  const s = identity?.suggestion;
  const hayCabecera = !!s && !!(s.surname || s.given_name || s.hospital_id);

  return (
    <Sheet open={open} onClose={onClose} title="Adjuntar a un caso" width={460}>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 14 }}>
        Liga lo que has hecho a un paciente y un caso. El DICOM ya subido se archiva
        como estudio del caso, sin volver a subirlo, y desde ahí «Guardar progreso»,
        las capturas y la confirmación de lesión quedan en el caso. Las capturas que
        ya se descargaron no se recuperan.
      </div>

      <SectionLabel>1 · Paciente</SectionLabel>
      {identity && identity.matches.length > 0 && (
        <div role="note" style={{ fontSize: 12, color: "var(--warning)", margin: "6px 0", lineHeight: 1.5 }}>
          {identity.matches[0]!.reason === "hospital_id"
            ? "Ya hay un paciente con el nº de historia de la cabecera DICOM: está elegido abajo. Crear otro lo duplicaría."
            : "Hay pacientes con el mismo apellido que la cabecera DICOM: comprueba que no sea uno de ellos."}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0 4px" }}>
        {identity?.matches.map((m) => (
          <label key={`m${m.id}`} style={radio(patientChoice.kind === "existing" && patientChoice.id === m.id)}>
            <input type="radio" checked={patientChoice.kind === "existing" && patientChoice.id === m.id}
                   onChange={() => setPatientChoice({ kind: "existing", id: m.id })} />
            <span><b>{m.full_name}</b> · {m.hospital_id || "sin nº de historia"}{m.dob ? ` · ${m.dob}` : ""}</span>
          </label>
        ))}
      </div>
      <Input label="Buscar otro paciente existente" value={search} onChange={(e) => setSearch(e.target.value)}
             placeholder="Nombre o nº de historia" />
      {q && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "6px 0" }}>
          {filtrados.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Ninguno coincide.</div>}
          {filtrados.map((p) => (
            <label key={p.id} style={radio(patientChoice.kind === "existing" && patientChoice.id === p.id)}>
              <input type="radio" checked={patientChoice.kind === "existing" && patientChoice.id === p.id}
                     onChange={() => setPatientChoice({ kind: "existing", id: p.id })} />
              <span><b>{p.full_name}</b> · {p.hospital_id || "sin nº de historia"}</span>
            </label>
          ))}
        </div>
      )}
      <label style={{ ...radio(patientChoice.kind === "new"), marginTop: 8 }}>
        <input type="radio" checked={patientChoice.kind === "new"} onChange={() => setPatientChoice({ kind: "new" })} />
        <span>Paciente nuevo</span>
      </label>
      {patientChoice.kind === "new" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0 0 4px" }}>
          {hayCabecera && (
            <Button size="sm" variant="ghost" onClick={usarCabecera}>
              Rellenar con la cabecera DICOM ({[s!.surname, s!.given_name].filter(Boolean).join(", ") || s!.hospital_id})
            </Button>
          )}
          <Input label="Apellidos" value={np.surname} onChange={(e) => setNp({ ...np, surname: e.target.value })} />
          <Input label="Nombres" value={np.given_name} onChange={(e) => setNp({ ...np, given_name: e.target.value })} />
          <Input label="Nº de historia / cédula" value={np.hospital_id} onChange={(e) => setNp({ ...np, hospital_id: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <Input label="Fecha de nacimiento" type="date" value={np.dob} onChange={(e) => setNp({ ...np, dob: e.target.value })} />
            <Input label="Sexo (M/F/O)" value={np.sex} maxLength={1} onChange={(e) => setNp({ ...np, sex: e.target.value.toUpperCase() })} />
          </div>
        </div>
      )}

      <div style={{ height: 18 }} />
      <SectionLabel>2 · Caso</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
        {cases.map((c) => (
          <label key={c.id} style={radio(caseChoice.kind === "existing" && caseChoice.id === c.id)}>
            <input type="radio" checked={caseChoice.kind === "existing" && caseChoice.id === c.id}
                   onChange={() => setCaseChoice({ kind: "existing", id: c.id })} />
            <span><b>{c.dx_principal || c.description || "Caso"}</b>{c.acquired_at ? ` · ${c.acquired_at}` : ""}</span>
          </label>
        ))}
        <label style={radio(caseChoice.kind === "new")}>
          <input type="radio" checked={caseChoice.kind === "new"} onChange={() => setCaseChoice({ kind: "new" })} />
          <span>Caso nuevo</span>
        </label>
      </div>
      {caseChoice.kind === "new" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 4 }}>
          <Input label="Motivo / diagnóstico" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                 placeholder="p. ej. Aneurisma basilar" />
          <Input label="Fecha del estudio" type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} />
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      <Button style={{ width: "100%", marginTop: 18 }} disabled={!listo || busy} onClick={() => void adjuntar()}>
        {busy ? "Archivando el estudio…" : "Adjuntar y archivar el estudio"}
      </Button>
    </Sheet>
  );
}
