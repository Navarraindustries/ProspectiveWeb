/* El panel de detección enseña los descartados con su motivo, el puesto de
   cada aceptado y el aviso cuando el backend ha limpiado la morfometría. */

import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const detect = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    detect: (...a: unknown[]) => detect(...a),
    clearDetection: vi.fn().mockResolvedValue({}),
  },
}));

import { DetectPanel } from "./DetectPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type {
  AneurysmCandidate, AneurysmDetectionResult, DetectionDiagnostics,
} from "../../api/types";

const diag: DetectionDiagnostics = {
  regions_analyzed: 40,
  rejected_too_few_points: 0,
  rejected_size: 30,
  rejected_mean_curvature: 2,
  rejected_positive_gauss: 1,
  rejected_compactness: 0,
  rejected_sphericity: 0,
  merged: 0,
  removed_components: 0,
  min_radius_mm: 1,
  max_radius_mm: 10,
  n_rejected: 2,
  rejected_by_reason: { borde: 1, isla: 1 },
};

function cand(id: string, rank: number, extra: Partial<AneurysmCandidate> = {}): AneurysmCandidate {
  return {
    id,
    center_mm: { x: 0, y: 0, z: 0 },
    max_diameter_mm: 5.2,
    confidence: 0.6,
    dome_mesh_url: `/data/${id}.vtp`,
    selected: false,
    channels: ["calibre"],
    patch_kind: "locator",
    rank,
    veto: null,
    ...extra,
  };
}

const accepted = [cand("cand-000", 1)];
const rejected = [
  cand("cand-001", 2, { veto: { reason: "borde", label: "Recorte de la malla", detail: "Toca el borde abierto." } }),
  cand("cand-002", 3, { veto: { reason: "isla", label: "Resto de segmentación", detail: "Isla suelta." } }),
];

function mockDetect(over: Partial<AneurysmDetectionResult> = {}) {
  const res: AneurysmDetectionResult = {
    found: (over.candidates ?? accepted).length > 0,
    candidates: accepted,
    rejected,
    morphometry_invalidated: false,
    diagnostics: diag,
    ...over,
  };
  detect.mockResolvedValue(res);
}

function Seed({ children }: { children: ReactNode }) {
  const { sessionId, setSession } = usePlanning();
  useEffect(() => { if (!sessionId) setSession("s1"); }, [sessionId, setSession]);
  // El panel detecta al montarse si ya hay sesión: se monta cuando la hay.
  return sessionId ? <>{children}</> : null;
}

function Wrapped() {
  return (
    <PlanningProvider>
      <Seed><DetectPanel onNext={() => {}} /></Seed>
    </PlanningProvider>
  );
}

beforeEach(() => {
  detect.mockReset();
  mockDetect();
});

describe("DetectPanel", () => {
  it("muestra los aceptados con su puesto y un desplegable cerrado con los descartados", async () => {
    render(<Wrapped />);
    expect(await screen.findByText("Puesto #1")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Descartados \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Recorte de la malla")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Recorte de la malla")).toBeInTheDocument();
    expect(screen.getByText("Resto de segmentación")).toBeInTheDocument();
  });

  it("elegir un descartado lo selecciona y enseña la advertencia", async () => {
    render(<Wrapped />);
    fireEvent.click(await screen.findByRole("button", { name: /Descartados/ }));
    expect(screen.queryByText(/compruébalo en el 3D/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("cand-002"));
    expect(screen.getByText(/compruébalo en el 3D/)).toBeInTheDocument();
    // Volver a un aceptado retira la advertencia.
    fireEvent.click(screen.getByText("cand-000"));
    expect(screen.queryByText(/compruébalo en el 3D/)).not.toBeInTheDocument();
  });

  it("avisa cuando la respuesta trae la morfometría invalidada", async () => {
    mockDetect({ morphometry_invalidated: true });
    render(<Wrapped />);
    expect(await screen.findByText(/La morfometría se ha limpiado/)).toBeInTheDocument();
  });

  it("re-detectar sin invalidación oculta el aviso", async () => {
    mockDetect({ morphometry_invalidated: true });
    render(<Wrapped />);
    await screen.findByText(/La morfometría se ha limpiado/);
    mockDetect({ morphometry_invalidated: false });
    fireEvent.click(screen.getByRole("button", { name: /Re-detectar/ }));
    await screen.findByText("Puesto #1");
    await vi.waitFor(() =>
      expect(screen.queryByText(/La morfometría se ha limpiado/)).not.toBeInTheDocument());
  });

  it("marca «Puesto bajo» pasado el tercer puesto", async () => {
    mockDetect({ candidates: [cand("a", 1), cand("b", 2), cand("c", 3), cand("d", 4)] });
    render(<Wrapped />);
    expect(await screen.findByText("Puesto #4")).toBeInTheDocument();
    expect(screen.getAllByText("Puesto bajo")).toHaveLength(1);
  });

  it("sin candidatos sigue explicando el vacío y no muestra el desplegable", async () => {
    mockDetect({ candidates: [], rejected: [], diagnostics: { ...diag, regions_analyzed: 0 } });
    render(<Wrapped />);
    expect(await screen.findByText(/La malla no tiene regiones de curvatura suficientes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descartados/ })).not.toBeInTheDocument();
  });
});
