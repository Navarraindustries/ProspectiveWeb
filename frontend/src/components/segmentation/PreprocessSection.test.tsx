/* F1-10: «Aplicar preprocesamiento» reescribe el volumen, reinicia la
   segmentación y borra las anotaciones. Lo hacía al primer clic. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preprocess = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    preprocess: (...a: unknown[]) => preprocess(...a),
    preprocessStatus: vi.fn().mockResolvedValue({ ops: "" }),
  },
}));

import { PreprocessSection } from "./PreprocessSection";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { SegmentResult } from "../../api/types";

const malla = { mesh_url: "/m/vessel_tree.vtp" } as unknown as SegmentResult;
const resultado = {
  shape_before: [1, 1, 1], spacing_before: [1, 1, 1], shape_after: [1, 1, 1], spacing_after: [1, 1, 1], note: "ok",
};

function montar(conMalla: boolean, spacing?: { x: number; y: number; z: number }) {
  function Semilla({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => {
      p.setSession("s1");
      p.setSeries({ series_id: "1", modality: "CT", spacing } as never);
      if (conMalla) p.setSegmentation(malla);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return p.sessionId ? <>{children}</> : null;
  }
  render(<PlanningProvider><Semilla><PreprocessSection /></Semilla></PlanningProvider>);
  fireEvent.click(screen.getByText("Preprocesamiento (avanzado)"));
}

beforeEach(() => { preprocess.mockReset().mockResolvedValue(resultado); });

describe("«Aplicar preprocesamiento»", () => {
  it("con trabajo hecho pide confirmación y no reescribe el volumen hasta confirmar", async () => {
    montar(true);
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar preprocesamiento" }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Aplicar el preprocesamiento?" });
    expect(dialogo).toHaveTextContent("Se reinicia la segmentación y se borran las anotaciones");
    expect(preprocess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar y reiniciar" }));
    await waitFor(() => expect(preprocess).toHaveBeenCalledTimes(1));
  });

  it("sin nada que perder aplica directamente", async () => {
    montar(false);
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar preprocesamiento" }));
    await waitFor(() => expect(preprocess).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

/* F1-135: «Remuestreo isotrópico» se ofrecía sobre un volumen ya isotrópico
   y, con el objetivo por defecto de 0,5 mm, bajaba la resolución sin decirlo. */
describe("«Remuestreo isotrópico»", () => {
  const casilla = () => screen.getByRole("checkbox", { name: /Remuestreo isotrópico/ }) as HTMLInputElement;

  it("con vóxel 0,32 isotrópico, apagado", async () => {
    montar(false, { x: 0.32, y: 0.32, z: 0.32 });
    await screen.findByRole("button", { name: "Aplicar preprocesamiento" });
    expect(casilla().checked).toBe(false);
    expect(casilla()).toBeDisabled();
    expect(screen.getByText("El volumen ya es isotrópico (0,32 mm)")).toBeInTheDocument();
  });

  it("anisótropo con objetivo mayor que el vóxel, avisa de que baja la resolución", async () => {
    montar(false, { x: 0.32, y: 0.32, z: 0.8 });
    await screen.findByRole("button", { name: "Aplicar preprocesamiento" });
    expect(casilla()).not.toBeDisabled();
    fireEvent.click(casilla());
    expect(screen.getByText("Baja la resolución de 0,32 a 0,5 mm")).toBeInTheDocument();
  });
});
