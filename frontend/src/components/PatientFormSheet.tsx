/* La hoja de los datos del paciente: el alta («Nuevo paciente») y la edición
   desde la columna Datos de la ficha («Editar datos»), o su consulta de solo
   lectura para una cuenta con la que está compartido («Ver datos»).

   Es el formulario de la ficha antigua (PatientSheet.tsx) sacado a su propia
   hoja: la ficha ya es una pantalla con columnas y los datos se editan aparte.
   Quien la abre ya tiene el detalle cargado; aquí no se pide nada al abrir. */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { PatientDetail, PatientSummary } from "../api/types";
import { Button } from "./Button";
import { DiscardChanges } from "./DiscardChanges";
import { Input } from "./Input";
import { ErrorNote, SectionLabel } from "./PanelHead";
import { Select } from "./Select";
import { Sheet } from "./Sheet";
import { ageFromDob } from "./patientAge";

const BLANK = {
  // F1-62: «Sexo» arrancaba en «F» y un paciente sin el dato se guardaba como
  // mujer; ahora arranca vacío y vacío se guarda.
  surname: "", given_name: "", hospital_id: "", sex: "", dob: "",
  institution: "", ocupacion: "",
  antecedentes_patologicos: "", antecedentes_toxicologicos: "", antecedentes_quirurgicos: "",
  antecedentes_alergicos: "", antecedentes_farmacologicos: "", notes: "",
};
type Formulario = typeof BLANK;

const SEXO_OPTS = [
  { value: "", label: "— sin dato —" },
  { value: "F", label: "F" },
  { value: "M", label: "M" },
  { value: "O", label: "O" },
];

/** El formulario con lo que trae el detalle; los campos nulos, vacíos. */
function desdeDetalle(p: PatientDetail | null): Formulario {
  if (!p) return { ...BLANK };
  const f = { ...BLANK };
  for (const k of Object.keys(BLANK) as (keyof Formulario)[]) f[k] = p[k] ?? "";
  return f;
}

/** «Segura, Juan», como lo escribe la lista; "" sin apellidos ni nombre. */
const nombreDe = (f: { surname: string; given_name: string }) =>
  [f.surname, f.given_name].filter(Boolean).join(", ");

/** F2-25: «16/09/1999 · 27 años». La ficha mostraba la fecha y ninguna parte
 *  de la gestión la edad, que es la que se usa para el riesgo. */
function lineaNacimiento(dob: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return undefined;
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  const edad = ageFromDob(dob);
  return edad ? `${dia} · ${edad} ${edad === "1" ? "año" : "años"}` : dia;
}

const fila: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const ayuda: React.CSSProperties = { fontSize: 12, color: "var(--muted-foreground)" };

export function PatientFormSheet({
  open,
  patient,
  soloLectura = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = alta de un paciente nuevo. */
  patient: PatientDetail | null;
  /** T7-rights: quien lo tiene compartido consulta los datos pero no los cambia;
   *  el servidor le daba un 403 después de dejarle escribir. */
  soloLectura?: boolean;
  onClose: () => void;
  /** Con el paciente recién creado; sin él, al editar. */
  onSaved: (creado?: PatientSummary) => void;
}) {
  const editing = patient !== null;
  const [form, setForm] = useState<Formulario>(() => desdeDetalle(patient));
  // Lo que había al abrir: «Cancelar», el ✕, Escape y el clic fuera tiraban lo
  // escrito sin preguntar (F1-60, F1-71). Contra esto se mide si hay cambios.
  const [initial, setInitial] = useState<Formulario>(() => desdeDetalle(patient));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  // Cada apertura parte del detalle que llega (o del formulario en blanco).
  useEffect(() => {
    if (!open) return;
    const cargado = desdeDetalle(patient);
    setForm(cargado);
    setInitial(cargado);
    setError(null);
    setAskDiscard(false);
  }, [open, patient]);

  const set = (k: keyof Formulario) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dirty = (Object.keys(form) as (keyof Formulario)[]).some((k) => form[k] !== initial[k]);
  const requestClose = () => {
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (soloLectura) return;
    setBusy(true);
    setError(null);
    try {
      if (patient) { await api.updatePatient(patient.id, form); onSaved(); }
      else onSaved(await api.createPatient(form));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el paciente");
    } finally {
      setBusy(false);
    }
  };

  // F2-T1, F1-59: el título es el nombre, con «Datos del paciente» como rótulo.
  const nombre = nombreDe(initial);
  const title = editing ? nombre || "Datos del paciente" : "Nuevo paciente";
  const eyebrow = editing && nombre ? "Datos del paciente" : undefined;
  const ro = soloLectura ? { readOnly: true, style: { cursor: "default" } } : {};
  const fechaNac = lineaNacimiento(form.dob);

  // F2-31: las acciones en el pie de la hoja, con el motivo si está apagado.
  const pie = soloLectura ? undefined : (
    <>
      {error && (
        <div style={{ flexBasis: "100%" }}>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {!form.surname && (
        <div style={{ flexBasis: "100%" }}>
          <div style={ayuda}>Escribe los apellidos para guardar.</div>
        </div>
      )}
      <Button type="submit" form="ficha-paciente-datos" disabled={busy || !form.surname}>
        {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear paciente"}
      </Button>
      <Button type="button" variant="outline" onClick={requestClose}>Cancelar</Button>
    </>
  );

  return (
    <>
      <Sheet open={open} onClose={requestClose} title={title} eyebrow={eyebrow} width={460} footer={pie}>
        <form id="ficha-paciente-datos" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {soloLectura && (
            <div style={ayuda}>Solo lectura: los cambia quien lo creó o un administrador.</div>
          )}
          <div style={fila}>
            <Input {...ro} label="Apellidos" placeholder="Restrepo" value={form.surname} onChange={set("surname")} required
                   hint="Puedes usar iniciales o un código en lugar del nombre real" />
            <Input {...ro} label="Nombre" placeholder="María" value={form.given_name} onChange={set("given_name")} />
          </div>
          <div style={fila}>
            <Input {...ro} label="N.º historia clínica" placeholder="HC-00000" value={form.hospital_id} onChange={set("hospital_id")} />
            <Select disabled={soloLectura} label="Sexo" options={SEXO_OPTS} value={form.sex} onChange={set("sex")} />
          </div>
          <div style={fila}>
            <Input {...ro} label="Fecha de nacimiento" type="date" value={form.dob} onChange={set("dob")} hint={fechaNac} />
            <Input {...ro} label="Institución" placeholder="Hospital…" value={form.institution} onChange={set("institution")} />
          </div>
          <Input {...ro} label="Ocupación" placeholder="—" value={form.ocupacion} onChange={set("ocupacion")} />
          <div style={{ marginTop: 6 }}>
            <SectionLabel style={{ marginBottom: 2 }}>Antecedentes</SectionLabel>
            {/* F1-63: se rellenaban creyendo que alimentaban el riesgo o el informe. */}
            <div style={ayuda}>Solo para consulta: no entran en el cálculo de riesgo ni en el informe.</div>
          </div>
          <Input {...ro} label="Patológicos" placeholder="HTA, tabaquismo…" value={form.antecedentes_patologicos} onChange={set("antecedentes_patologicos")} />
          <Input {...ro} label="Toxicológicos" placeholder="Tabaco, alcohol…" value={form.antecedentes_toxicologicos} onChange={set("antecedentes_toxicologicos")} />
          <Input {...ro} label="Quirúrgicos" placeholder="—" value={form.antecedentes_quirurgicos} onChange={set("antecedentes_quirurgicos")} />
          <Input {...ro} label="Alérgicos" placeholder="—" value={form.antecedentes_alergicos} onChange={set("antecedentes_alergicos")} />
          <Input {...ro} label="Farmacológicos" placeholder="—" value={form.antecedentes_farmacologicos} onChange={set("antecedentes_farmacologicos")} />
          {/* F2-26: una nota clínica de varias frases no cabía en una línea. */}
          <Input {...ro} label="Notas" placeholder="Notas clínicas libres…" multiline value={form.notes} onChange={set("notes")} />
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
