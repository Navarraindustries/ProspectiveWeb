/* La hoja de los datos del paciente (alta y edición). Viene de la ficha antigua
   (PatientSheet.test: «datos del paciente», «derechos sobre los datos del
   paciente», «salir de la ficha con cambios sin guardar» y el alta a 460 px) y
   de Patients.test («descartar los cambios de la ficha»). */

import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const updatePatient = vi.fn();
const createPatient = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    updatePatient: (id: number, body: unknown) => updatePatient(id, body),
    createPatient: (body: unknown) => createPatient(body),
  },
}));

import { PatientFormSheet } from "./PatientFormSheet";
import { ageFromDob } from "./patientAge";
import type { PatientDetail } from "../api/types";

const detalle = (o: Partial<PatientDetail> = {}): PatientDetail => ({
  id: 2, surname: "Segura", given_name: "Juan", hospital_id: "HC-2", sex: "M", dob: "1999-09-16", notes: "", ...o,
});

const onClose = vi.fn();
const onSaved = vi.fn();

/** La hoja abierta por un padre que la cierra de verdad al llamar a onClose. */
function Envoltorio({ patient, soloLectura }: { patient: PatientDetail | null; soloLectura?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <PatientFormSheet open={open} patient={patient} soloLectura={soloLectura}
                      onClose={() => { onClose(); setOpen(false); }} onSaved={onSaved} />
  );
}
const abrir = (patient: PatientDetail | null = detalle(), soloLectura = false) =>
  render(<Envoltorio patient={patient} soloLectura={soloLectura} />);

beforeEach(() => {
  for (const f of [updatePatient, createPatient, onClose, onSaved]) f.mockReset();
});

describe("datos del paciente", () => {
  it("la edad junto a la fecha de nacimiento (F2-25)", async () => {
    abrir();
    expect(await screen.findByText(`16/09/1999 · ${ageFromDob("1999-09-16")} años`)).toBeTruthy();
  });

  it("«Notas» es un área de texto (F2-26)", async () => {
    abrir();
    expect((await screen.findByLabelText("Notas")).tagName).toBe("TEXTAREA");
  });

  it("las líneas de ayuda de «Apellidos» y «Antecedentes», y «Sexo» sin dato (F1-61, F1-62, F1-63)", async () => {
    abrir(detalle({ given_name: "", sex: "" }));
    expect(await screen.findByText("Puedes usar iniciales o un código en lugar del nombre real")).toBeTruthy();
    expect(screen.getByText("Solo para consulta: no entran en el cálculo de riesgo ni en el informe.")).toBeTruthy();
    const sexo = screen.getByLabelText("Sexo") as HTMLSelectElement;
    expect(sexo.value).toBe("");
    expect(sexo.selectedOptions[0].textContent).toBe("— sin dato —");
  });

  it("«Guardar cambios» dice por qué está apagado (F2-31)", async () => {
    abrir();
    fireEvent.change(await screen.findByLabelText("Apellidos"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Escribe los apellidos para guardar.")).toBeTruthy();
  });

  it("se titula con el nombre y guarda con «Guardar cambios»", async () => {
    updatePatient.mockResolvedValue({});
    abrir();
    expect(await screen.findByRole("dialog", { name: "Segura, Juan" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Cefalea en trueno" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updatePatient).toHaveBeenCalledWith(2, expect.objectContaining({ surname: "Segura", notes: "Cefalea en trueno" })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith();
  });

  it("si el servidor rechaza el guardado, lo dice y no cierra", async () => {
    updatePatient.mockRejectedValue(new Error("Historia clínica duplicada"));
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Historia clínica duplicada")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("alta y pie de la hoja (rediseño fase 2)", () => {
  it("el alta abre a 460 px, se titula «Nuevo paciente» y crea con «Crear paciente»", async () => {
    const creado = { id: 9, full_name: "Restrepo, María" };
    createPatient.mockResolvedValue(creado);
    abrir(null);
    const dialog = await screen.findByRole("dialog", { name: "Nuevo paciente" });
    expect(dialog.style.width).toBe("460px");
    const crear = screen.getByRole("button", { name: "Crear paciente" }) as HTMLButtonElement;
    expect(crear.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Restrepo" } });
    fireEvent.click(crear);
    await waitFor(() => expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ surname: "Restrepo", sex: "" })));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(creado));
    expect(onClose).toHaveBeenCalled();
  });

  it("la edición también abre a 460 px", async () => {
    abrir();
    expect((await screen.findByRole("dialog")).style.width).toBe("460px");
  });

  it("«Guardar cambios» y «Cancelar» viven en el pie de la hoja, no en una barra pegajosa", async () => {
    abrir();
    const dialog = await screen.findByRole("dialog");
    const guardar = await within(dialog).findByRole("button", { name: /Guardar cambios/ });
    expect(guardar.closest("[data-sheet-footer]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar" }).closest("[data-sheet-footer]")).not.toBeNull();
    expect(dialog.querySelector('[style*="sticky"]')).toBeNull();
  });
});

describe("derechos sobre los datos del paciente (T7-rights)", () => {
  it("una cuenta compartida ve los datos de solo lectura, sin «Guardar cambios»", async () => {
    abrir(detalle(), true);
    expect(await screen.findByText("Solo lectura: los cambia quien lo creó o un administrador.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect((screen.getByLabelText("Apellidos") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Notas") as HTMLTextAreaElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Sexo") as HTMLSelectElement).disabled).toBe(true);
  });

  it("quien lo creó sigue viendo «Guardar cambios» y puede escribir", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    expect((screen.getByLabelText("Apellidos") as HTMLInputElement).readOnly).toBe(false);
    expect(screen.queryByText(/Solo lectura/)).toBeNull();
  });
});

/* F1-60, F1-71: «Cancelar», el ✕, Escape y el clic fuera cerraban la hoja y
   tiraban lo escrito sin preguntar. */
describe("descartar los cambios de la ficha", () => {
  it("«Cancelar» con «Notas» editado pregunta y no cierra hasta confirmar", async () => {
    abrir();
    fireEvent.change(await screen.findByLabelText("Notas"), { target: { value: "Cefalea en trueno" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeTruthy();
    expect(screen.getByLabelText("Notas")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Notas") as HTMLTextAreaElement).value).toBe("Cefalea en trueno");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText("Notas")).toBeNull());
    expect(updatePatient).not.toHaveBeenCalled();
  });

  it("Escape con cambios también pregunta, y Escape otra vez cierra solo la pregunta", async () => {
    abrir();
    fireEvent.change(await screen.findByLabelText("Notas"), { target: { value: "x" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Notas")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("«Cancelar» sin cambios cierra sin preguntar", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText("Notas")).toBeNull());
  });
});
