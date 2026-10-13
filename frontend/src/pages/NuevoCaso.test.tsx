/* F1-81: «Cancelar», Escape o el clic fuera tiraban el caso a medio escribir
   sin preguntar. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createStudy = vi.fn();
const updateStudy = vi.fn();
vi.mock("../api/client", () => ({ api: { createStudy: (...a: unknown[]) => createStudy(...a), updateStudy: (...a: unknown[]) => updateStudy(...a) } }));

import { NuevoEstudioSheet } from "./NuevoCaso";
import { hoyLocal } from "../lib/fecha";

const onClose = vi.fn();
const montar = () =>
  render(<NuevoEstudioSheet open patientId={1} patientName="Restrepo, María" onClose={onClose} onCreated={() => {}} />);

beforeEach(() => onClose.mockReset());

describe("descartar el caso a medio escribir", () => {
  it("«Cancelar» con diagnóstico escrito pregunta y no cierra hasta confirmar", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Diagnóstico *"), { target: { value: "Aneurisma ACM" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape también pregunta, y «Seguir editando» conserva lo escrito", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Diagnóstico *"), { target: { value: "Aneurisma ACM" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Diagnóstico *") as HTMLInputElement).value).toBe("Aneurisma ACM");
  });

  it("«Cancelar» sin cambios cierra sin preguntar", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
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
    const campo = screen.getByLabelText("Diagnóstico *") as HTMLInputElement;
    expect(campo.placeholder).toBe("Aneurisma basilar sacular");
    expect(screen.getByText("Da nombre al caso en toda la aplicación")).toBeInTheDocument();
    expect(screen.getByLabelText("Clínica")).toBeInTheDocument();
    expect(screen.queryByText(/Síntomas positivos|Diagnóstico principal/)).toBeNull();
  });

  it("separa «Morfología» y «Tamaño» y guarda «Morfología · Tamaño»", async () => {
    createStudy.mockResolvedValue({ id: 9 });
    montar();
    expect(screen.queryByLabelText("Tipo de aneurisma")).toBeNull();
    fireEvent.change(screen.getByLabelText("Diagnóstico *"), { target: { value: "Aneurisma ACM" } });
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
    fireEvent.change(screen.getByLabelText("Diagnóstico *"), { target: { value: "X" } });
    fireEvent.click(screen.getByLabelText("Angiografía por catéter"));
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
    const campo = screen.getByLabelText("Diagnóstico *");
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
    expect((screen.getByLabelText("Angiografía por catéter") as HTMLInputElement).checked).toBe(true);
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
    fireEvent.click(screen.getByLabelText("Angiografía por catéter"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateStudy).toHaveBeenCalled());
    const p = updateStudy.mock.calls[0][2];
    expect(p.mod_angio).toBe(false);
    expect(p.mod_pangio).toBe(false);
  });
});
