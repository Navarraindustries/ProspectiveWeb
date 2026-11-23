/* El historial de la malla, fuera y dentro de Segmentación.
 *
 * Fuera de Segmentación restaurar se lleva lo medido sobre la malla (candidatos,
 * morfometría…), así que pregunta antes; dentro, como siempre, actúa al clic. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const meshHistory = vi.fn();
const meshRestore = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    meshHistory: (...a: unknown[]) => meshHistory(...a),
    meshRestore: (...a: unknown[]) => meshRestore(...a),
  },
}));

import { MeshHistoryCard } from "./MeshHistoryCard";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { SegmentResult } from "../../api/types";

const SEG: SegmentResult = {
  mesh_url: "/data/v.vtp?v=1", voxel_fraction: 0.009, strategy: "xa_band_pass",
  is_dsa: false, vertices: 21196, faces: 42691, kept_fraction: 0.807,
  fragments_removed: 2174, largest_removed_mm3: 254.7, downsample_factor: 2,
  main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
};

const CON_RECORTE = {
  undo_depth: 1, redo_depth: 0, has_original: true,
  steps: [{ title: "Recorte de malla", vertices: 86593, at: "2026-11-22T10:00:00" }],
};

/** Sesión, malla y un candidato ya detectado, como en Morfometría. */
function Seed({ children }: { children: ReactNode }) {
  const { setSession, setSegmentation, setCandidates, setDeviceMesh } = usePlanning();
  // Una sola vez: los setters del store cambian de identidad en cada render
  // (los envuelve `touch`), y ponerlos de dependencia sembraba sin fin.
  const sembrado = useRef(false);
  useEffect(() => {
    if (sembrado.current) return;
    sembrado.current = true;
    setSession("s1");
    setSegmentation(SEG);
    setCandidates([{ id: "c1" } as never]);
    setDeviceMesh("stent", "/data/cl_stent.vtp");
  });
  return <>{children}</>;
}

/** Enseña lo que el test necesita leer del store. */
function Sonda() {
  const { candidates, segmentation, deviceMeshes } = usePlanning();
  return (
    <>
      <output data-testid="sonda">{`${candidates.length}|${segmentation?.mesh_url ?? ""}`}</output>
      <output data-testid="stent">{deviceMeshes.stent ?? "sin stent"}</output>
    </>
  );
}

function mount(props: Parameters<typeof MeshHistoryCard>[0] = {}) {
  return render(
    <PlanningProvider>
      <Seed><MeshHistoryCard {...props} /><Sonda /></Seed>
    </PlanningProvider>,
  );
}

beforeEach(() => {
  meshHistory.mockReset().mockResolvedValue(CON_RECORTE);
  meshRestore.mockReset().mockResolvedValue({
    mesh_url: "/data/v.vtp?v=2", vertices: 297045, faces: 590000, undo_depth: 0,
  });
});

describe("historial de la malla", () => {
  it("en Segmentación, deshacer actúa al primer clic", async () => {
    mount();
    const deshacer = await screen.findByRole("button", { name: "↺ Deshacer" });
    await waitFor(() => expect(deshacer).toBeEnabled());
    fireEvent.click(deshacer);
    await waitFor(() => expect(meshRestore).toHaveBeenCalledWith("s1", "undo"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("fuera de Segmentación pregunta antes y cancelar no toca nada", async () => {
    mount({ aviso: "Esto borra lo medido." });
    const deshacer = await screen.findByRole("button", { name: "↺ Deshacer" });
    await waitFor(() => expect(deshacer).toBeEnabled());
    fireEvent.click(deshacer);
    expect(screen.getByRole("alert")).toHaveTextContent("Esto borra lo medido.");
    expect(meshRestore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(meshRestore).not.toHaveBeenCalled();
    expect(screen.getByTestId("sonda")).toHaveTextContent("1|/data/v.vtp?v=1");
  });

  it("al confirmar «Al inicio» restaura, tira lo medido y avisa a quien lo usa", async () => {
    const onRestored = vi.fn();
    mount({ aviso: "Esto borra lo medido.", onRestored });
    const inicio = await screen.findByRole("button", { name: "⊘ Al inicio" });
    await waitFor(() => expect(inicio).toBeEnabled());
    fireEvent.click(inicio);
    fireEvent.click(screen.getByRole("button", { name: "Sí, volver al inicio" }));
    await waitFor(() => expect(meshRestore).toHaveBeenCalledWith("s1", "original"));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    // La malla nueva queda puesta y el candidato de la vieja, fuera.
    expect(screen.getByTestId("sonda")).toHaveTextContent("0|/data/v.vtp?v=2");
    // Y los dispositivos colocados sobre la vieja también: si no, el campo del
    // clip (CALOR) y el stent seguían vivos (Case 3, 22-11).
    expect(screen.getByTestId("stent")).toHaveTextContent("sin stent");
    expect(await screen.findByText(/Malla original restaurada: 297\.045 vértices/)).toBeInTheDocument();
  });

  it("sin pasos guardados los tres botones están apagados", async () => {
    meshHistory.mockResolvedValue({ undo_depth: 0, redo_depth: 0, has_original: false, steps: [] });
    mount({ aviso: "x" });
    expect(await screen.findByText(/Sin pasos que deshacer/)).toBeInTheDocument();
    for (const name of ["↺ Deshacer", "↻ Rehacer", "⊘ Al inicio"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("si restaurar falla, lo dice y no tira nada", async () => {
    meshRestore.mockRejectedValue(new Error("No hay instantánea"));
    const onRestored = vi.fn();
    mount({ onRestored });
    const deshacer = await screen.findByRole("button", { name: "↺ Deshacer" });
    await waitFor(() => expect(deshacer).toBeEnabled());
    fireEvent.click(deshacer);
    expect(await screen.findByText("No hay instantánea")).toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByTestId("sonda")).toHaveTextContent("1|/data/v.vtp?v=1");
    expect(screen.getByTestId("stent")).toHaveTextContent("/data/cl_stent.vtp");
  });
});
