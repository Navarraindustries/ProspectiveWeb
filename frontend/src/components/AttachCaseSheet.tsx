/* «Adjuntar a un caso»: ligar a un paciente y un caso una sesión empezada sin
   ellos, en un solo paso. Ver backend/routers/attach.py.

   La cabecera DICOM solo PROPONE los datos: aparecen en el formulario para que
   el profesional los revise, y si ya hay un paciente con ese nº de historia se
   ofrece elegirlo antes que crear otro.

   UNI-178: una sesión guardada en la ficha de un paciente ya es suya, y se
   propone ese paciente con su caso. La cabecera casó con otro (uno antiguo
   creado con el mismo DICOM y con un caso del mismo nombre) y se adjuntó al
   equivocado sin forma de corregirlo: por eso el modo «mover» pasa una sesión
   ya adjunta, con su estudio archivado, a otro paciente o caso. */

import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { AttachResult, PatientSummary, SessionIdentity, StudySummary } from "../api/types";
import { Button } from "./Button";
import { DiscardChanges } from "./DiscardChanges";
import { Input } from "./Input";
import { LoadState } from "./LoadState";
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
  open, onClose, sessionId, onAttached, mode = "adjuntar",
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onAttached: (r: AttachResult) => void;
  /** «mover»: la sesión ya está adjunta y se pasa a otro paciente o caso. */
  mode?: "adjuntar" | "mover";
}) {
  const mover = mode === "mover";
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  // Para el efecto de los casos, que no debe volver a correr cuando llega la identidad.
  const identityRef = useRef<SessionIdentity | null>(null);
  identityRef.current = identity;
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
  // Qué no se pudo cargar. Callado, un fallo dejaba la búsqueda en «Ninguno
  // coincide» y el paciente sin sus casos: invitaba a crear duplicados.
  const [fallos, setFallos] = useState<{ cabecera?: true; pacientes?: true; casos?: true }>({});
  const [intento, setIntento] = useState(0);
  const [askDiscard, setAskDiscard] = useState(false);

  // Al abrir: lo que propone la cabecera y la lista de pacientes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setFallos((f) => ({ casos: f.casos }));
    let vivo = true;
    api.sessionIdentity(sessionId).then((id) => {
      if (!vivo) return;
      setIdentity(id);
      identityRef.current = id;
      setStudyDate(id.study_date);
      // El paciente de la sesión manda sobre lo que case con la cabecera.
      const m = id.session_patient ?? id.matches.find((x) => x.reason === "hospital_id");
      setPatientChoice(m ? { kind: "existing", id: m.id } : { kind: "new" });
    }).catch(() => { if (vivo) setFallos((f) => ({ ...f, cabecera: true })); });
    api.listPatients().then((ps) => { if (vivo) setPatients(ps); })
      .catch(() => { if (vivo) setFallos((f) => ({ ...f, pacientes: true })); });
    return () => { vivo = false; };
  }, [open, sessionId, intento]);

  // Los casos del paciente elegido.
  useEffect(() => {
    setFallos((f) => ({ ...f, casos: undefined }));
    if (patientChoice.kind !== "existing") { setCases([]); setCaseChoice({ kind: "new" }); return; }
    let vivo = true;
    const pid = patientChoice.id;
    // Mientras llegan, no se enseñan los casos del paciente de antes: se podía
    // elegir uno que no es de este.
    setCases([]);
    api.patientStudies(pid).then((cs) => {
      if (!vivo) return;
      setCases(cs);
      // Del paciente de la sesión, su caso queda elegido.
      const id = identityRef.current;
      if (id?.session_patient?.id === pid && id.session_case_id != null
          && cs.some((c) => c.id === id.session_case_id)) {
        setCaseChoice({ kind: "existing", id: id.session_case_id });
      }
    }).catch(() => { if (vivo) { setCases([]); setFallos((f) => ({ ...f, casos: true })); } });
    setCaseChoice({ kind: "new" });
    return () => { vivo = false; };
  }, [patientChoice, intento]);

  const sinCargar = [
    fallos.cabecera && "la propuesta de la cabecera DICOM",
    fallos.pacientes && "la lista de pacientes",
    fallos.casos && "los casos de este paciente",
  ].filter((x): x is string => !!x);

  // Cerrar (Cancelar, ✕, Escape, clic fuera) con algo escrito pregunta antes.
  const escrito = Object.values(np).some((v) => v.trim() !== "") || motivo.trim() !== "";
  const pedirCerrar = () => {
    if (busy) return;
    if (escrito) setAskDiscard(true);
    else onClose();
  };
  const descartar = () => {
    setAskDiscard(false);
    setNp({ surname: "", given_name: "", hospital_id: "", dob: "", sex: "" });
    setMotivo("");
    setSearch("");
    onClose();
  };

  const usarCabecera = () => {
    if (!identity) return;
    setNp({ ...identity.suggestion });
  };

  const q = search.trim().toLowerCase();
  const filtrados = (q
    ? patients.filter((p) => p.full_name.toLowerCase().includes(q) || (p.hospital_id || "").toLowerCase().includes(q))
    : patients).slice(0, 8);

  const faltaPaciente = !(patientChoice.kind === "existing" || np.surname.trim() || np.given_name.trim());
  const faltaCaso = !(caseChoice.kind === "existing" || motivo.trim());
  // Mover al caso en el que ya está no cambia nada (el servidor da 409).
  const mismoCaso = mover && caseChoice.kind === "existing" && caseChoice.id === identity?.session_case_id;
  const listo = !faltaPaciente && !faltaCaso && !mismoCaso;
  const falta = [
    faltaPaciente && "elige un paciente o escribe sus apellidos o nombres",
    faltaCaso && "elige un caso o escribe el motivo del caso nuevo",
    mismoCaso && "elige otro caso: la sesión ya está en este",
  ].filter((x): x is string => !!x).join("; ");

  const adjuntar = async () => {
    setBusy(true);
    setError(null);
    try {
      const cuerpo = {
        ...(patientChoice.kind === "existing" ? { patient_id: patientChoice.id } : { new_patient: np }),
        ...(caseChoice.kind === "existing" ? { case_id: caseChoice.id }
          : { new_case: { dx_principal: motivo.trim(), study_date: studyDate } }),
      };
      const r = mover ? await api.moveSession(sessionId, cuerpo) : await api.attachSession(sessionId, cuerpo);
      onAttached(r);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : mover ? "No se pudo mover" : "No se pudo adjuntar");
    } finally {
      setBusy(false);
    }
  };

  const s = identity?.suggestion;
  const hayCabecera = !!s && !!(s.surname || s.given_name || s.hospital_id);
  const propio = identity?.session_patient ?? null;

  return (
    <>
    <Sheet open={open} onClose={pedirCerrar} title={mover ? "Cambiar de paciente o caso" : "Adjuntar a un caso"} width={460}
      footer={
        <>
          {error && (
            <div style={{ flexBasis: "100%" }}>
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          {/* Apagado no decía qué faltaba. */}
          {!listo && (
            <div style={{ flexBasis: "100%", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              {mover ? "Para mover" : "Para adjuntar"}: {falta}
            </div>
          )}
          <Button disabled={!listo || busy} onClick={() => void adjuntar()}>
            {mover
              ? (busy ? "Moviendo…" : "Mover al caso elegido")
              : (busy ? "Archivando el estudio…" : "Adjuntar y archivar el estudio")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={pedirCerrar}>Cancelar</Button>
        </>
      }>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 14 }}>
        {mover ? <>
          La sesión y su estudio archivado pasan al paciente y al caso que elijas, con las
          capturas y la confirmación de lesión. No se vuelve a archivar el DICOM, y el cambio
          queda en el registro de auditoría.
        </> : <>
          Liga lo que has hecho a un paciente y un caso. El DICOM ya subido se archiva
          como estudio del caso, sin volver a subirlo, y desde ahí «Guardar progreso»,
          las capturas y la confirmación de lesión quedan en el caso. Las capturas que
          ya se descargaron no se recuperan.
        </>}
      </div>
      {sinCargar.length > 0 && (
        <LoadState state="error" onRetry={() => setIntento((n) => n + 1)}
          mensaje={`No se pudo cargar ${sinCargar.join(" ni ")}. Sin ello puedes duplicar un paciente o un caso que ya existe`} />
      )}

      <SectionLabel>1 · Paciente</SectionLabel>
      {identity && identity.matches.length > 0 && (
        <div role="note" style={{ fontSize: 12, color: "var(--warning)", margin: "6px 0", lineHeight: 1.5 }}>
          {propio
            ? `La cabecera DICOM coincide con otro paciente: ${identity.matches.map((m) => m.full_name).join(", ")}. `
              + `Esta sesión es de ${propio.full_name}${mover ? "" : ", que está elegido abajo"}: elegir otro la pasa a ese paciente.`
            : identity.matches[0]!.reason === "hospital_id"
              ? "Ya hay un paciente con el nº de historia de la cabecera DICOM: está elegido abajo. Crear otro lo duplicaría."
              : "Hay pacientes con el mismo apellido que la cabecera DICOM: comprueba que no sea uno de ellos."}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0 4px" }}>
        {propio && (
          <label key={`s${propio.id}`} style={radio(patientChoice.kind === "existing" && patientChoice.id === propio.id)}>
            <input type="radio" checked={patientChoice.kind === "existing" && patientChoice.id === propio.id}
                   onChange={() => setPatientChoice({ kind: "existing", id: propio.id })} />
            <span><b>{propio.full_name}</b> · {mover ? "paciente actual" : "paciente de esta sesión"}
              {propio.hospital_id ? ` · ${propio.hospital_id}` : ""}</span>
          </label>
        )}
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
          <Input label="Nº de historia o documento" value={np.hospital_id} onChange={(e) => setNp({ ...np, hospital_id: e.target.value })} />
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
    </Sheet>
    <DiscardChanges open={askDiscard} onKeep={() => setAskDiscard(false)} onDiscard={descartar} />
    </>
  );
}
