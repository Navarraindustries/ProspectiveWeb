/* La columna Casos de la ficha en cascada: los casos del paciente con sus
   datos clínicos, planificar, subir el DICOM, editar y eliminar. Viene de la
   ficha antigua (PatientSheet.test: «acciones de arriba», «casos», «derechos
   sobre los datos del paciente» en lo que toca a los casos, «restos de F2-30 y
   acciones sin la fila de la lista», «imágenes diagnósticas del caso») y de
   Patients.test («el glosario en Pacientes»: el vacío nuevo). */

import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const deleteStudy = vi.fn();

vi.mock("../../api/client", () => ({
  api: { deleteStudy: (patientId: number, studyId: number) => deleteStudy(patientId, studyId) },
}));
vi.mock("../../pages/NuevoCaso", () => ({
  NuevoEstudioSheet: (p: { open: boolean; study?: { dx_principal?: string } | null; onCreated: (s?: unknown) => void; onClose: () => void }) =>
    p.open ? (
      <div>
        <span>{p.study ? `formulario del caso ${p.study.dx_principal}` : "formulario del caso"}</span>
        <button onClick={() => { p.onCreated({ id: 50, patient_id: 2, dx_principal: "Aneurisma ACM" }); p.onClose(); }}>
          guardar el caso
        </button>
      </div>
    ) : null,
}));

import { ColumnaCasos, type SeleccionCaso } from "./ColumnaCasos";
import type { StudySummary } from "../../api/types";

const caso = (o: Partial<StudySummary> & { id: number }): StudySummary => ({
  patient_id: 2, dicom_path: "", modality: "", description: "", acquired_at: "", session_count: 0,
  sintomas_positivos: "", dx_principal: "", dx_secundario: "", tipo_aneurisma: "", tratamiento_propuesto: "",
  region_anatomica: "", lateralidad: "", angiographer: "", mod_tac: false, mod_angio: false, mod_rm: false,
  mod_pangio: false, ...o,
});

const onPlanificar = vi.fn();
const onCambio = vi.fn();
const onSeleccionar = vi.fn();
const onReintentar = vi.fn();

/** La columna con la selección viva, como la monta la página. */
function Arnes({ casos, puedePlanificar = true, puedeEliminar = true, nSesionesSinCaso = 0, error = null }: {
  casos: StudySummary[] | null; puedePlanificar?: boolean; puedeEliminar?: boolean; nSesionesSinCaso?: number; error?: string | null;
}) {
  const [sel, setSel] = useState<SeleccionCaso | null>(null);
  return (
    <ColumnaCasos
      patientId={2} patientName="Segura, Juan" casos={casos} error={error} onReintentar={onReintentar}
      seleccionado={sel} onSeleccionar={(s) => { onSeleccionar(s); setSel(s); }}
      puedePlanificar={puedePlanificar} puedeEliminar={puedeEliminar} nSesionesSinCaso={nSesionesSinCaso}
      onPlanificar={onPlanificar} onCambio={onCambio}
    />
  );
}

beforeEach(() => {
  for (const f of [deleteStudy, onPlanificar, onCambio, onSeleccionar, onReintentar]) f.mockReset();
});

describe("casos (F2-28, F2-T5, fusión nº 9)", () => {
  it("un caso sin diagnóstico se llama «Caso sin diagnóstico», y se edita con «Editar caso»", () => {
    render(<Arnes casos={[caso({ id: 9 })]} />);
    expect(screen.getByText("Caso sin diagnóstico")).toBeTruthy();
    expect(screen.getByTitle("Editar caso")).toBeTruthy();
    expect(screen.queryByText(/Estudio|Nuevo estudio/)).toBeNull();
  });

  it("cada caso dice su fecha, tipo, región y lateralidad", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM", acquired_at: "2026-10-01", tipo_aneurisma: "Sacular", region_anatomica: "ACM", lateralidad: "Izquierda" })]} />);
    expect(screen.getByText("Fecha: 2026-10-01")).toBeTruthy();
    expect(screen.getByText("Tipo: Sacular · ACM (Izquierda)")).toBeTruthy();
  });

  it("«Editar caso» abre el formulario de ese caso", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar caso «Aneurisma ACM»" }));
    expect(screen.getByText("formulario del caso Aneurisma ACM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "guardar el caso" }));
    expect(onCambio).toHaveBeenCalled();
    expect(onPlanificar).not.toHaveBeenCalled();
  });

  it("elegir un caso lo marca y lo comunica (abre Estudios)", () => {
    render(<Arnes casos={[caso({ id: 4, dx_principal: "Aneurisma ACoA" }), caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    const fila = screen.getByRole("button", { name: /^Aneurisma ACoA/ });
    expect(fila.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(fila);
    expect(onSeleccionar).toHaveBeenCalledWith(4);
    expect(fila.getAttribute("aria-pressed")).toBe("true");
  });

  it("eliminar un caso pide confirmación, lo borra y avisa", async () => {
    deleteStudy.mockResolvedValue(undefined);
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM", session_count: 2 })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar caso «Aneurisma ACM»" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Eliminar caso" });
    expect(dialogo.textContent).toContain("Aneurisma ACM");
    expect(dialogo.textContent).toContain("Sus 2 sesión(es) de planificación se conservarán pero quedarán desvinculadas.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deleteStudy).toHaveBeenCalledWith(2, 9));
    await waitFor(() => expect(onCambio).toHaveBeenCalledWith(9));
  });

  it("si el servidor no deja eliminar el caso, dice por qué", async () => {
    deleteStudy.mockRejectedValue(new Error("Solo quien creó al paciente puede borrar casos."));
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar caso «Aneurisma ACM»" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("Solo quien creó al paciente puede borrar casos.")).toBeTruthy();
    expect(onCambio).not.toHaveBeenCalled();
  });
});

describe("acciones de arriba (F2-27, F2-29, F2-72)", () => {
  it("«Planificar este caso» va al caso más reciente; elegir otro caso lo cambia", () => {
    render(<Arnes casos={[caso({ id: 4, dx_principal: "Aneurisma ACoA" }), caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Planificar este caso" }));
    expect(onPlanificar).toHaveBeenLastCalledWith(expect.objectContaining({ id: 9 }));
    fireEvent.click(screen.getByRole("button", { name: /^Aneurisma ACoA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Planificar este caso" }));
    expect(onPlanificar).toHaveBeenLastCalledWith(expect.objectContaining({ id: 4 }));
  });

  it("«Subir DICOM de este paciente» entra al paso 1 con el caso fijado", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    const subir = screen.getByRole("button", { name: "Subir DICOM de este paciente" });
    expect(subir.getAttribute("title")).toBe("Abre el paso 1 con el caso «Aneurisma ACM» fijado");
    fireEvent.click(subir);
    expect(onPlanificar).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("sin casos, «Subir DICOM» pide primero el caso y luego entra con él", async () => {
    render(<Arnes casos={[]} />);
    const subir = screen.getByRole("button", { name: "Subir DICOM de este paciente" });
    expect(subir.getAttribute("title")).toBe("Crea primero el caso al que se archiva el DICOM");
    fireEvent.click(subir);
    expect(onPlanificar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "guardar el caso" }));
    await waitFor(() => expect(onPlanificar).toHaveBeenCalledWith(expect.objectContaining({ id: 50 })));
    expect(onCambio).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Planificar este caso" })).toBeNull();
  });

  it("sin la fila de la lista no salen «Planificar» ni «Subir DICOM» (no tendrían a quién llevar)", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} puedePlanificar={false} />);
    expect(screen.getByText("Aneurisma ACM")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Planificar este caso" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Subir DICOM de este paciente" })).toBeNull();
  });
});

describe("derechos sobre los casos (T7-rights)", () => {
  it("una cuenta compartida edita casos pero no ve «Eliminar caso»", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} puedeEliminar={false} />);
    expect(screen.getByRole("button", { name: "Editar caso «Aneurisma ACM»" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Eliminar caso/ })).toBeNull();
  });

  it("quien lo creó sigue viendo «Eliminar caso»", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    expect(screen.getByRole("button", { name: "Eliminar caso «Aneurisma ACM»" })).toBeTruthy();
  });
});

describe("imágenes diagnósticas del caso (F2-40)", () => {
  it("con angio y pangio muestra «Angiografía por catéter» una vez y nunca «Pangio»", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "A", mod_angio: true, mod_pangio: true })]} />);
    expect(screen.getByText(/Imágenes: Angiografía por catéter$/)).toBeTruthy();
    expect(screen.queryByText(/Pangio/)).toBeNull();
  });

  it("un caso antiguo con solo pangio también la muestra", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "A", mod_pangio: true })]} />);
    expect(screen.getByText(/Imágenes: Angiografía por catéter/)).toBeTruthy();
  });
});

describe("vacío, carga y sesiones sin caso", () => {
  it("el vacío nuevo del glosario (familia V, W, X)", () => {
    render(<Arnes casos={[]} />);
    expect(screen.getByText("Sin casos. Crea uno con «Nuevo caso» para archivar el DICOM y las capturas de este paciente.")).toBeTruthy();
    expect(screen.queryByText(/Casos \/ estudios|Nuevo estudio|Sesiones de estudio/)).toBeNull();
  });

  it("si los casos no cargan, lo dice y «Reintentar» los vuelve a pedir", () => {
    render(<Arnes casos={[]} error="La base de datos está bloqueada" />);
    expect(screen.getByText("La base de datos está bloqueada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentar).toHaveBeenCalled();
    expect(screen.queryByText(/^Sin casos\./)).toBeNull();
  });

  it("las sesiones que no cuelgan de ningún caso tienen su entrada al final", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} nSesionesSinCaso={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Sesiones sin caso · 2" }));
    expect(onSeleccionar).toHaveBeenCalledWith("sin-caso");
  });

  it("sin sesiones sueltas no hay entrada", () => {
    render(<Arnes casos={[caso({ id: 9, dx_principal: "Aneurisma ACM" })]} />);
    expect(screen.queryByRole("button", { name: /Sesiones sin caso/ })).toBeNull();
  });
});
