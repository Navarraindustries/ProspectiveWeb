/* The segmentation panel has to say what the cleanup threw away. */

import { render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    // The panel asks for a starting band on mount; keep it out of the way.
    suggestedBand: vi.fn().mockResolvedValue({ lower: 150, upper: 500, vmin: -500, vmax: 1500 }),
    segment: vi.fn(),
    segmentPreview: vi.fn().mockRejectedValue(new Error("sin vista previa en test")),
  },
}));

import { SegmentPanel } from "./SegmentPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { SegmentResult } from "../../api/types";

const base: SegmentResult = {
  mesh_url: "/data/vessel_tree.vtp",
  voxel_fraction: 0.004,
  strategy: "dsa",
  is_dsa: true,
  vertices: 8574,
  faces: 17228,
  kept_fraction: 0.597,
  fragments_removed: 1319,
  largest_removed_mm3: 175.4,
  downsample_factor: 2,
  main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
};

/** Renders the panel with a segmentation already in the store. */
function withResult(result: SegmentResult) {
  function Seed({ children }: { children: ReactNode }) {
    const { setSegmentation } = usePlanning();
    useEffect(() => setSegmentation(result), [setSegmentation]);
    return <>{children}</>;
  }
  return render(
    <PlanningProvider>
      <Seed>
        <SegmentPanel onNext={() => {}} />
      </Seed>
    </PlanningProvider>,
  );
}

describe("what the cleanup discarded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports the kept volume and the discarded fragments", async () => {
    // These numbers are case 9's real output. Before this the loss was invisible:
    // 40% of the thresholded volume left the mesh and nothing said so.
    const { container } = withResult(base);

    expect(await screen.findByText("Volumen conservado")).toBeInTheDocument();
    expect(screen.getByText("59.7")).toBeInTheDocument();
    // The count and its unit sit in separate text nodes, so read the block.
    const text = container.textContent ?? "";
    expect(text).toMatch(/1[.,]?319\s*fragmentos/);
    expect(text).toMatch(/175[.,]4\s*mm³/);
  });

  it("warns when a discarded piece is big enough to be a vessel", async () => {
    withResult(base);
    expect(await screen.findByText("Revisar")).toBeInTheDocument();
    expect(screen.getByText(/segmento de vaso desconectado/)).toBeInTheDocument();
  });

  it("stays quiet when only specks were removed", async () => {
    withResult({ ...base, kept_fraction: 0.98, fragments_removed: 40, largest_removed_mm3: 3.1 });
    expect(await screen.findByText("Limpio")).toBeInTheDocument();
    expect(screen.queryByText(/segmento de vaso desconectado/)).not.toBeInTheDocument();
  });

  it("flags a downsampled mesh, because that is where the gaps come from", async () => {
    withResult(base);
    expect(await screen.findByText("Submuestreada")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("calls a native-resolution mesh native", async () => {
    withResult({ ...base, downsample_factor: 1 });
    expect(await screen.findByText("Nativa")).toBeInTheDocument();
  });

  /* El hueso no se quita con el umbral: medido en case 3, el 99 % del hueso cae
     DENTRO del rango de intensidad del propio árbol. Lo que sí lo separa es que
     no se toca — de ahí «solo el árbol principal». Pero en angio-TC todo está
     conectado y la regla no vale, así que el backend se niega y el panel tiene
     que decir por qué: un botón que no hace nada en silencio parece roto. */
  it("dice cuántas estructuras sueltas dejó fuera el árbol principal", async () => {
    withResult({ ...base, main_tree_applied: true, main_tree_removed: 10 });
    expect(await screen.findByText(/Árbol principal aislado/)).toBeInTheDocument();
    expect(screen.getByText(/fuera 10 estructuras sueltas/)).toBeInTheDocument();
  });

  it("explica por qué NO lo aisló en vez de callarse", async () => {
    withResult({
      ...base,
      main_tree_applied: false,
      main_tree_warning: "La estructura mayor ocupa 1220 cm³: no es un árbol vascular.",
    });
    expect(await screen.findByText(/No se aisló el árbol principal/)).toBeInTheDocument();
    expect(screen.getByText(/1220 cm³/)).toBeInTheDocument();
  });

  it("no informa de nada cuando no se pidió", async () => {
    // Ojo con el matcher: la casilla se llama «Solo el árbol principal» y está
    // siempre en pantalla. Lo que no debe aparecer es el RESULTADO.
    withResult(base);
    await screen.findByText("Submuestreada");
    expect(screen.queryByText(/Árbol principal aislado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se aisló el árbol principal/)).not.toBeInTheDocument();
  });
});
