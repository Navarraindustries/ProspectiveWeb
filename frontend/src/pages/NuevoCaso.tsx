/* Nuevo Caso — formulario clínico del caso y selector de paciente.

   El antiguo NuevoCasoSheet (paciente + caso en un solo formulario) se retiró:
   duplicaba pacientes que ya existían. El flujo vivo es CasePatientPicker →
   NuevoEstudioSheet, que adjunta el caso a un paciente existente. */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { PatientSummary, StudyCreate, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { DiscardChanges } from "../components/DiscardChanges";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { EstadoVacio } from "../components/EstadoVacio";
import { Switch } from "../components/Switch";
import { Sheet } from "../components/Sheet";
import { ErrorNote } from "../components/PanelHead";
import "../styles/office.css";
import { hoyLocal } from "../lib/fecha";
import { MORFOLOGIAS, TAMANOS, joinTipo, splitTipo } from "../lib/tipoAneurisma";

// Marcador de los menús sin valor: el dato queda vacío en vez de inventar una opción.
const SIN_DATO = "— sin dato —";
const REGIONES = [
  "", "Arteria cerebral media (ACM)", "Arteria comunicante anterior (AComA)",
  "Arteria comunicante posterior (AComP)", "Arteria carótida interna (ACI)", "Arteria basilar",
  "Arteria cerebelosa posteroinferior (PICA)", "Arteria cerebral anterior (ACA)",
  "Arteria cerebral posterior (ACP)", "Arteria vertebral", "Arteria cerebelosa superior (SCA)",
  "Arteria cerebelosa anteroinferior (AICA)", "Arteria pericallosa", "Bifurcación carotídea", "Otra",
];
const LATERALIDAD = ["", "Derecha", "Izquierda", "Bilateral", "Línea media"];
const TRATAMIENTOS = [
  "Clipaje", "Diversor de flujo + Clip", "Coils + Clips",
  "Embolización con coils", "Stent + coils", "Diversor de flujo", "Observación",
];
const ANGIO_TIPO = ["", "BIPLANO", "MONOPLANO"];
// «Angiografía» y «Panangiografía» se solapaban (F2-40): una sola casilla. El backend
// conserva las dos columnas, así que se guardan iguales y al leer vale cualquiera.
const MODALIDADES: [keyof Mods, string][] = [
  ["tac", "TAC"], ["angio", "Angiografía por catéter"], ["rm", "Resonancia"],
];

type Mods = { tac: boolean; angio: boolean; rm: boolean };

export function NuevoEstudioSheet({
  open, patientId, patientName, study, onClose, onCreated,
}: { open: boolean; patientId: number | null; patientName?: string; study?: StudySummary | null; onClose: () => void; onCreated: (created?: StudySummary) => void }) {
  const editing = !!study;
  // Día local: con toISOString (UTC) pasadas las 19:00 en UTC−5 proponía el de mañana.
  const today = hoyLocal();
  const [f, setF] = useState({
    study_date: today, sintomas_positivos: "", dx_principal: "", dx_secundario: "",
    morfologia: "", tamano: "", region_anatomica: "", lateralidad: "", angio_marca: "", angio_tipo: "",
  });
  const [trat, setTrat] = useState<Record<string, boolean>>(Object.fromEntries(TRATAMIENTOS.map((t) => [t, false])));
  const [mods, setMods] = useState<Mods>({ tac: false, angio: false, rm: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El error de validación va junto al campo y le da el foco (F2-41).
  // Casos antiguos con «Panangiografía»: se conserva su marca; los nuevos nunca la ponen y desmarcar la casilla la apaga.
  const [pangioPrevio, setPangioPrevio] = useState(false);
  const dxBox = useRef<HTMLDivElement>(null);
  const [dxError, setDxError] = useState<string | null>(null);
  // F1-81: «Cancelar», Escape o el clic fuera tiraban el caso a medio escribir.
  // Lo que había al abrir, para saber si hay algo que perder.
  const [initial, setInitial] = useState("");
  const [askDiscard, setAskDiscard] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const snapshot = JSON.stringify({ f, trat, mods });
  const requestClose = () => (snapshot !== initial ? setAskDiscard(true) : onClose());

  // Reset (or prefill from `study` when editing) each time it opens.
  useEffect(() => {
    if (!open) return;
    setAskDiscard(false);
    let nf: typeof f;
    let nt: Record<string, boolean>;
    let nm: Mods;
    if (study) {
      const [marca, tipo] = (study.angiographer || "").split(" | ");
      nf = {
        study_date: study.acquired_at || today,
        sintomas_positivos: study.sintomas_positivos || "",
        dx_principal: study.dx_principal || "",
        dx_secundario: study.dx_secundario || "",
        ...splitTipo(study.tipo_aneurisma),
        region_anatomica: study.region_anatomica || "",
        lateralidad: study.lateralidad || "",
        angio_marca: marca || "",
        angio_tipo: (tipo || "").trim(),
      };
      const chosen = (study.tratamiento_propuesto || "").split(",").map((s) => s.trim());
      nt = Object.fromEntries(TRATAMIENTOS.map((t) => [t, chosen.includes(t)]));
      nm = { tac: study.mod_tac, angio: study.mod_angio || study.mod_pangio, rm: study.mod_rm };
    } else {
      nf = { study_date: today, sintomas_positivos: "", dx_principal: "", dx_secundario: "", morfologia: "", tamano: "", region_anatomica: "", lateralidad: "", angio_marca: "", angio_tipo: "" };
      nt = Object.fromEntries(TRATAMIENTOS.map((t) => [t, false]));
      nm = { tac: false, angio: false, rm: false };
    }
    setF(nf);
    setTrat(nt);
    setMods(nm);
    setPangioPrevio(!!study?.mod_pangio);
    // La foto de partida sale de los mismos valores que se acaban de poner.
    setInitial(JSON.stringify({ f: nf, trat: nt, mods: nm }));
    setError(null);
    setDxError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId, study]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (patientId === null) return;
    if (!f.dx_principal.trim()) {
      setDxError("El diagnóstico es obligatorio.");
      dxBox.current?.querySelector("input")?.focus();
      return;
    }
    const payload: StudyCreate = {
      study_date: f.study_date, sintomas_positivos: f.sintomas_positivos.trim(),
      dx_principal: f.dx_principal.trim(), dx_secundario: f.dx_secundario.trim(),
      tipo_aneurisma: joinTipo(f.morfologia, f.tamano), region_anatomica: f.region_anatomica, lateralidad: f.lateralidad,
      tratamiento_propuesto: TRATAMIENTOS.filter((t) => trat[t]).join(", "),
      angiographer: [f.angio_marca.trim(), f.angio_tipo].filter(Boolean).join(" | "),
      mod_tac: mods.tac, mod_angio: mods.angio, mod_rm: mods.rm, mod_pangio: pangioPrevio && mods.angio,
    };
    setBusy(true);
    try {
      // El caso recién creado vuelve a quien abrió el formulario, que puede
      // ofrecer planificarlo (F2-22); al editar no hay nada nuevo que ofrecer.
      if (study) { await api.updateStudy(patientId, study.id, payload); onCreated(); }
      else onCreated(await api.createStudy(patientId, payload));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el caso");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Sheet open={open} onClose={requestClose} title={editing ? "Editar caso" : "Nuevo caso"} width={460}
      footer={
        <>
          {error && (
            <div style={{ flexBasis: "100%" }}>
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <Button type="submit" form="form-nuevo-caso" disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear caso"}</Button>
          <Button type="button" variant="outline" onClick={requestClose}>Cancelar</Button>
        </>
      }>
      {patientName && <div className="nc-nota" style={{ marginBottom: 12 }}>Paciente: <b style={{ color: "var(--foreground)" }}>{patientName}</b></div>}
      <form id="form-nuevo-caso" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Input label="Fecha del caso" hint="Fecha del diagnóstico" type="date" value={f.study_date} onChange={set("study_date")} />

        <div className="nc-seccion">Datos clínicos</div>
        <Input label="Clínica" multiline value={f.sintomas_positivos} onChange={set("sintomas_positivos")} placeholder="Síntomas actuales, cefalea, déficit neurológico…" />
        <div style={{ height: 12 }} />
        <div ref={dxBox}>
          <Input label="Diagnóstico" obligatorio value={f.dx_principal}
                 onChange={(e) => { set("dx_principal")(e); setDxError(null); }}
                 placeholder="Aneurisma basilar sacular"
                 hint={dxError ?? "Da nombre al caso en toda la aplicación"} invalid={!!dxError} />
        </div>
        <div style={{ height: 12 }} />
        <Input label="Diagnóstico secundario" value={f.dx_secundario} onChange={set("dx_secundario")} placeholder="Diagnóstico secundario (opcional)" />

        <div className="nc-seccion">Caracterización aneurismática</div>
        <div className="hoja-dos-columnas">
          <Select label="Morfología" options={[SIN_DATO, ...MORFOLOGIAS]} value={f.morfologia || SIN_DATO} onChange={(e) => setF((s) => ({ ...s, morfologia: e.target.value === SIN_DATO ? "" : e.target.value }))} />
          <Select label="Tamaño" options={[SIN_DATO, ...TAMANOS]} value={f.tamano || SIN_DATO} onChange={(e) => setF((s) => ({ ...s, tamano: e.target.value === SIN_DATO ? "" : e.target.value }))} />
        </div>
        <div style={{ height: 12 }} />
        <div>
          <Select label="Lateralidad" options={LATERALIDAD.map((t) => t || "—")} value={f.lateralidad || "—"} onChange={(e) => setF((s) => ({ ...s, lateralidad: e.target.value === "—" ? "" : e.target.value }))} />
        </div>
        <div style={{ height: 12 }} />
        <Select label="Región anatómica" options={REGIONES.map((t) => t || "— seleccionar —")} value={f.region_anatomica || "— seleccionar —"} onChange={(e) => setF((s) => ({ ...s, region_anatomica: e.target.value === "— seleccionar —" ? "" : e.target.value }))} />
        <div style={{ height: 12 }} />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Tratamiento propuesto</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {TRATAMIENTOS.map((t) => <Switch key={t} label={t} checked={trat[t]} onChange={(on) => setTrat((s) => ({ ...s, [t]: on }))} />)}
        </div>

        <div className="nc-seccion">Imágenes diagnósticas</div>
        <div className="nc-nota">El DICOM se sube en el paso 1 al abrir el caso.</div>
        <div className="hoja-dos-columnas">
          {MODALIDADES.map(([k, label]) => <Switch key={k} label={label} checked={mods[k]} onChange={(on) => setMods((s) => ({ ...s, [k]: on }))} />)}
        </div>
        <div style={{ height: 14 }} />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Angiógrafo</div>
        <div className="hoja-dos-columnas">
          <Input label="Marca / modelo" value={f.angio_marca} onChange={set("angio_marca")} placeholder="Marca / modelo" />
          <Select label="Tipo" options={ANGIO_TIPO.map((t) => t || "Tipo")} value={f.angio_tipo || "Tipo"} onChange={(e) => setF((s) => ({ ...s, angio_tipo: e.target.value === "Tipo" ? "" : e.target.value }))} />
        </div>

      </form>
    </Sheet>
    <DiscardChanges
      open={askDiscard}
      onKeep={() => setAskDiscard(false)}
      onDiscard={() => { setAskDiscard(false); onClose(); }}
    />
    </>
  );
}

/* Nuevo caso — paso 1: elegir el paciente al que pertenece el caso.
   Un caso se adjunta a UN solo paciente ya registrado; al elegirlo se abre el
   formulario del caso (NuevoEstudioSheet). Si no hay pacientes, invita a crear
   uno primero. Reemplaza al antiguo NuevoCasoSheet (que creaba paciente+caso a
   la vez y duplicaba pacientes). */
export function CasePatientPicker({
  open, patients, onPick, onClose, onCreatePatient,
}: {
  open: boolean;
  patients: PatientSummary[];
  onPick: (p: PatientSummary) => void;
  onClose: () => void;
  onCreatePatient: () => void;
}) {
  const [q, setQ] = useState("");
  const rows = patients.filter(
    (p) =>
      p.full_name.toLowerCase().includes(q.toLowerCase()) ||
      (p.hospital_id || "").toLowerCase().includes(q.toLowerCase()),
  );
  const nuevoPaciente = (
    <Button type="button" variant="outline" onClick={onCreatePatient} leadingIcon={<Icon name="PLUS" size={14} />}>
      Nuevo paciente
    </Button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Nuevo caso — elegir paciente" width={460}
      footer={patients.length === 0 ? undefined : nuevoPaciente}>
      <div className="nc-nota" style={{ marginBottom: 12 }}>
        Selecciona el paciente al que pertenece este caso. Un caso se adjunta a un solo paciente.
      </div>
      {patients.length === 0 ? (
        <EstadoVacio icono="USER" titulo="Aún no hay pacientes registrados"
          accion={<Button onClick={onCreatePatient} leadingIcon={<Icon name="PLUS" size={14} />}>Crear el primer paciente</Button>}>
          Crea el primero para poder abrirle un caso.
        </EstadoVacio>
      ) : (
        <>
          <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--glass-dense)", paddingBottom: 10 }}>
            <Input icon={<Icon name="SEARCH" size={14} />} aria-label="Buscar paciente o HC"
              placeholder="Buscar por nombre o N.º de historia…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "8px 2px" }}>
                Ningún paciente coincide con la búsqueda.
              </div>
            )}
            {rows.map((p) => (
              <button key={p.id} type="button" onClick={() => onPick(p)} className="nc-fila">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{p.full_name}</div>
                  <div className="meta-mono" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
                    {p.hospital_id || "sin HC"} · {p.sex || "—"} · {p.study_count} {p.study_count === 1 ? "caso" : "casos"}
                  </div>
                </div>
                <Icon name="STEP_PLAN" size={14} color="var(--muted-foreground)" />
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
