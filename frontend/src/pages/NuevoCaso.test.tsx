/* F1-81: «Cancelar», Escape o el clic fuera tiraban el caso a medio escribir
   sin preguntar. */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { createStudy: vi.fn(), updateStudy: vi.fn() } }));

import { NuevoEstudioSheet } from "./NuevoCaso";
import { hoyLocal } from "../lib/fecha";

const onClose = vi.fn();
const montar = () =>
  render(<NuevoEstudioSheet open patientId={1} patientName="Restrepo, María" onClose={onClose} onCreated={() => {}} />);

beforeEach(() => onClose.mockReset());

describe("descartar el caso a medio escribir", () => {
  it("«Cancelar» con diagnóstico escrito pregunta y no cierra hasta confirmar", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Diagnóstico principal *"), { target: { value: "Aneurisma ACM" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape también pregunta, y «Seguir editando» conserva lo escrito", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Diagnóstico principal *"), { target: { value: "Aneurisma ACM" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Diagnóstico principal *") as HTMLInputElement).value).toBe("Aneurisma ACM");
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