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

function montar(conMalla: boolean) {
  function Semilla({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => {
      p.setSession("s1");
      p.setSeries({ series_id: "1", modality: "CT" } as never);
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
