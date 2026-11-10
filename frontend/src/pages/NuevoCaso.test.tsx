/* F1-81: «Cancelar», Escape o el clic fuera tiraban el caso a medio escribir
   sin preguntar. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createStudy = vi.fn();
const updateStudy = vi.fn();
vi.mock("../api/client", () => ({ api: { createStudy: (...a: unknown[]) => createStudy(...a), updateStudy: (...a: unknown[]) => updateStudy(...a) } }));

import { CasePatientPicker, NuevoEstudioSheet } from "./NuevoCaso";
import type { PatientSummary } from "../api/types";
import { simularPantalla } from "../test/pantalla";
import { hoyLocal } from "../lib/fecha";

const onClose = vi.fn();
const montar = () =>
  render(<NuevoEstudioSheet open patientId={1} patientName="Restrepo, María" onClose={onClose} onCreated={() => {}} />);

beforeEach(() => onClose.mockReset());

describe("descartar el caso a medio escribir", () => {
  it("«Cancelar» con diagnóstico escrito pregunta y no cierra hasta confirmar", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Diagnóstico"), { target: { value: "Aneurisma ACM" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape también pregunta, y «Seguir editando» conserva lo escrito", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Diagnóstico"), { target: { value: "Aneurisma ACM" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Diagnóstico") as HTMLInputElement).value).toBe("Aneurisma ACM");
  });

  it("«Cancelar» sin cambios cierra sin preguntar", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* «Nuevo caso» son dos pasos (elegir paciente → formulario) y el segundo no
   tenía vuelta al primero: había que cancelar y empezar de nuevo. */
describe("cambiar de paciente desde el formulario", () => {
  const onCambiar = vi.fn();
  beforeEach(() => onCambiar.mockReset());
  const conVuelta = () =>
    render(<NuevoEstudioSheet open patientId={1} patientName="Restrepo, María" onClose={onClose}
                              onCreated={() => {}} onCambiarPaciente={onCambiar} />);

  it("sin nada escrito, «Cambiar paciente» vuelve al selector sin preguntar ni cerrar", () => {
    conVuelta();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar paciente" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("con el caso a medio escribir pregunta antes; al descartar vuelve al selector, no cierra", () => {
    conVuelta();
    fireEvent.change(screen.getByLabelText("Diagnóstico"), { target: { value: "Aneurisma ACM" } });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar paciente" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(onCambiar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("abierto desde la ficha de un paciente (sin vuelta) no lo ofrece; al editar, tampoco", () => {
    const { unmount } = montar();
    expect(screen.queryByRole("button", { name: "Cambiar paciente" })).toBeNull();
    unmount();
    render(<NuevoEstudioSheet open patientId={1} patientName="Restrepo, María" onClose={onClose} onCreated={() => {}}
                              onCambiarPaciente={onCambiar}
                              study={{ id: 3, dx_principal: "Aneurisma ACM" } as import("../api/types").StudySummary} />);
    expect(screen.queryByRole("button", { name: "Cambiar paciente" })).toBeNull();
  });
});

/* Con la lista caída, el selector decía «Aún no hay pacientes registrados» y
   ofrecía crear «el primero»: invitaba a duplicar a un paciente que ya existe. */
describe("el selector de paciente con la lista sin cargar", () => {
  const selector = (extra: Partial<Parameters<typeof CasePatientPicker>[0]>) =>
    render(<CasePatientPicker open patients={[]} onPick={vi.fn()} onClose={vi.fn()} onCreatePatient={vi.fn()} {...extra} />);

  it("con error dice que no se pudo cargar y ofrece «Reintentar», no crear el primero", () => {
    const onRetry = vi.fn();
    selector({ error: "Sin conexión con el servidor", onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la lista de pacientes: Sin conexión con el servidor");
    expect(screen.queryByText(/Aún no hay pacientes/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Crear el primer paciente|Nuevo paciente/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("mientras carga dice «Cargando…», no que no hay pacientes", () => {
    selector({ loading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText(/Aún no hay pacientes/)).toBeNull();
  });

  it("vacía de verdad, sigue invitando a crear el primero", () => {
    selector({});
    expect(screen.getByText("Aún no hay pacientes registrados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear el primer paciente" })).toBeInTheDocument();
  });
});

describe("la fecha propuesta (F1-77)", () => {
  it("a las 22:15 en UTC−5 propone el día local, no el de mañana en UTC", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-12T03:15:00Z"));
      montar();
      const campo = screen.getByLabelText("Fecha del caso") as HTMLInputElement;
      expect(campo.value).toBe(hoyLocal());
      expect(campo.value).toBe(hoyLocal(new Date("2026-10-12T03:15:00Z")));
      expect(screen.getByText("Fecha del diagnóstico")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

/* F1-76, F1-80: el formulario del caso decía «caso / estudio» y «Crear estudio». */
describe("el glosario en el formulario del caso", () => {
  it("el título es «Nuevo caso» y el botón «Crear caso»", () => {
    montar();
    expect(screen.getByText("Nuevo caso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear caso" })).toBeInTheDocument();
    expect(screen.queryByText(/caso \/ estudio|Crear estudio/)).toBeNull();
  });
});

/* F2-37…F2-41: rótulos, morfología/tamaño, imágenes y error junto al campo. */
describe("el formulario del caso (F2)", () => {
  it("«Diagnóstico *» explica que da nombre al caso y propone un formato", () => {
    montar();
    const campo = screen.getByLabelText("Diagnóstico") as HTMLInputElement;
    expect(campo.placeholder).toBe("Aneurisma basilar sacular");
    expect(screen.getByText("Da nombre al caso en toda la aplicación")).toBeInTheDocument();
    expect(screen.getByLabelText("Clínica")).toBeInTheDocument();
    expect(screen.queryByText(/Síntomas positivos|Diagnóstico principal/)).toBeNull();
  });

  it("separa «Morfología» y «Tamaño» y guarda «Morfología · Tamaño»", async () => {
    createStudy.mockResolvedValue({ id: 9 });
    montar();
    expect(screen.queryByLabelText("Tipo de aneurisma")).toBeNull();
    fireEvent.change(screen.getByLabelText("Diagnóstico"), { target: { value: "Aneurisma ACM" } });
    fireEvent.change(screen.getByLabelText("Morfología"), { target: { value: "Sacular" } });
    fireEvent.change(screen.getByLabelText("Tamaño"), { target: { value: "Pequeño (< 10 mm)" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear caso" }));
    await waitFor(() => expect(createStudy).toHaveBeenCalled());
    expect(createStudy.mock.calls[0][1].tipo_aneurisma).toBe("Sacular · Pequeño (< 10 mm)");
  });

  it("al editar, un valor antiguo «Gigante (> 25 mm)» cae en Tamaño", () => {
    render(
      <NuevoEstudioSheet open patientId={1} onClose={onClose} onCreated={() => {}}
        study={{ id: 3, dx_principal: "X", tipo_aneurisma: "Gigante (> 25 mm)" } as never} />,
    );
    expect((screen.getByLabelText("Tamaño") as HTMLSelectElement).value).toBe("Gigante (> 25 mm)");
    expect((screen.getByLabelText("Morfología") as HTMLSelectElement).value).toBe("— sin dato —");
  });

  it("«Imágenes diagnósticas»: TAC, angiografía por catéter y resonancia, con la nota nueva", async () => {
    createStudy.mockClear();
    createStudy.mockResolvedValue({ id: 9 });
    montar();
    expect(screen.getByText("El DICOM se sube en el paso 1 al abrir el caso.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Panangiografía/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Diagnóstico"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("switch", { name: "Angiografía por catéter" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear caso" }));
    await waitFor(() => expect(createStudy).toHaveBeenCalled());
    const p = createStudy.mock.calls[0][1];
    expect(p.mod_angio).toBe(true);
    expect(p.mod_pangio).toBe(false);
  });

  it("sin diagnóstico, el error sale junto al campo, lo marca y le da el foco", () => {
    createStudy.mockClear();
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Crear caso" }));
    const campo = screen.getByLabelText("Diagnóstico");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("El diagnóstico es obligatorio.")).toBeInTheDocument();
    expect(document.activeElement).toBe(campo);
    expect(createStudy).not.toHaveBeenCalled();
  });
});

describe("marca antigua de panangiografía", () => {
  it("al editar un caso antiguo con mod_pangio la conserva y la casilla sale marcada", async () => {
    updateStudy.mockReset();
    updateStudy.mockResolvedValue({});
    render(
      <NuevoEstudioSheet open patientId={1} onClose={onClose} onCreated={() => {}}
        study={{ id: 3, dx_principal: "X", mod_pangio: true } as never} />,
    );
    expect(screen.getByRole("switch", { name: "Angiografía por catéter" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateStudy).toHaveBeenCalled());
    expect(updateStudy.mock.calls[0][2].mod_pangio).toBe(true);
  });
});

describe("al desmarcar la angiografía de un caso antiguo", () => {
  it("la casilla única apaga también la marca antigua", async () => {
    updateStudy.mockReset();
    updateStudy.mockResolvedValue({});
    render(
      <NuevoEstudioSheet open patientId={1} onClose={onClose} onCreated={() => {}}
        study={{ id: 3, dx_principal: "X", mod_pangio: true } as never} />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Angiografía por catéter" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateStudy).toHaveBeenCalled());
    const p = updateStudy.mock.calls[0][2];
    expect(p.mod_angio).toBe(false);
    expect(p.mod_pangio).toBe(false);
  });
});

/* Rediseño fase 2: la acción principal vive en el pie fijo de la hoja. */
describe("pie de la hoja del caso", () => {
  it("el botón de crear el caso está en el pie de la hoja", () => {
    montar();
    const boton = screen.getByRole("button", { name: "Crear caso" });
    expect(boton.closest("[data-sheet-footer]")).not.toBeNull();
  });
});

const pac = (id: number): PatientSummary => ({
  id, full_name: `Paciente Prueba ${id}`, hospital_id: `HC-${id}`, dob: "", sex: "F", institution: "",
  study_count: 1, created_at: "", owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
} as PatientSummary);

describe("hojas de caso y paciente (A30–A33)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("elegir paciente: la lista crece y «Nuevo paciente» va en el pie fijo", () => {
    render(<CasePatientPicker open patients={[pac(1), pac(2)]} onPick={vi.fn()} onClose={vi.fn()} onCreatePatient={vi.fn()} />);
    const pie = document.querySelector("[data-sheet-footer]")!;
    const nuevo = within(pie as HTMLElement).getByRole("button", { name: "Nuevo paciente" });
    expect(nuevo.textContent).toBe("Nuevo paciente");
    expect(nuevo.querySelector("svg")).not.toBeNull();
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.innerHTML).not.toMatch(/max-height/);
    expect(within(dialogo).getAllByRole("button", { name: /Paciente Prueba/ })[0]).toHaveClass("nc-fila");
    expect(within(dialogo).getByRole("textbox", { name: "Buscar paciente o HC" })).toBeInTheDocument();
  });

  it("el caso usa interruptores, no casillas, y el diagnóstico es obligatorio", () => {
    render(<NuevoEstudioSheet open patientId={1} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getAllByRole("switch")).toHaveLength(10);
    expect(screen.getByLabelText("Diagnóstico", { selector: "input" })).toHaveAttribute("aria-required", "true");
    expect(document.querySelectorAll(".hoja-dos-columnas").length).toBeGreaterThan(0);
  });

  it("a ≤ 640 la hoja ocupa la pantalla y sus filas son de 44 px", () => {
    simularPantalla(390);
    render(<CasePatientPicker open patients={[pac(1)]} onPick={vi.fn()} onClose={vi.fn()} onCreatePatient={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveStyle({ width: "100%" });
    const css = readFileSync(join(__dirname, "../styles/office.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{[^}]*\.nc-fila\s*\{[^}]*min-height:\s*44px/);
  });
});
