/* El panel de detección enseña los descartados con su motivo, el puesto de
   cada aceptado y el aviso cuando el backend ha limpiado la morfometría. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useRef, type ReactNode } from "react";
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
  AneurysmCandidate, AneurysmDetectionResult, DetectionDiagnostics, MorphometryResult,
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
    // La nota nombra el motivo de ESE descartado (spec §5).
    expect(screen.getByText("Descartado por «Resto de segmentación»: compruébalo en el 3D antes de medir.")).toBeInTheDocument();
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

  it("con la morfometría invalidada la borra del store aunque el elegido ya fuera el 0", async () => {
    mockDetect({ morphometry_invalidated: true });
    render(<WithMeasure />);
    // La medida sembrada está antes de que llegue la respuesta.
    await screen.findByText(/La morfometría se ha limpiado/);
    expect(screen.getByTestId("medida")).toHaveTextContent("sin medida");
    expect(screen.getByTestId("cuello")).toHaveTextContent("0 marcas");
  });

  it("sin invalidación la medida del elegido 0 se conserva", async () => {
    mockDetect({ morphometry_invalidated: false });
    render(<WithMeasure />);
    await screen.findByText("Puesto #1");
    expect(screen.getByTestId("medida")).toHaveTextContent("con medida");
  });

  it("con todos los sitios descartados no dice que no encontró nada y deja medir", async () => {
    mockDetect({ found: false, candidates: [], rejected: [rejected[0]!] });
    render(<Wrapped />);
    expect(await screen.findByRole("button", { name: /Descartados \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Todos los sitios encontrados se descartaron/)).toBeInTheDocument();
    expect(screen.queryByText(/No se encontraron candidatos/)).not.toBeInTheDocument();
    expect(screen.queryByText("Por qué no se encontró nada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analizar morfometría/ })).toBeEnabled();
    // El elegido (índice 0) es el descartado: su advertencia se ve con la lista plegada.
    expect(screen.getByText(/cand-001: Descartado por «Recorte de la malla»/)).toBeInTheDocument();
  });

  it("en StrictMode detecta una sola vez al montarse", async () => {
    render(<StrictMode><Wrapped /></StrictMode>);
    await screen.findByText("Puesto #1");
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("la respuesta de una detección anterior no pisa la de la última", async () => {
    let resolveOld!: (r: AneurysmDetectionResult) => void;
    let resolveNew!: (r: AneurysmDetectionResult) => void;
    detect.mockReset();
    detect
      .mockImplementationOnce(() => new Promise((ok) => { resolveOld = ok; }))
      .mockImplementationOnce(() => new Promise((ok) => { resolveNew = ok; }));
    const base = { found: true, rejected: [], morphometry_invalidated: false, diagnostics: diag };
    const { rerender } = render(<Toggle show />);
    await vi.waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
    // Se sale del paso y se vuelve con la primera detección aún en vuelo.
    rerender(<Toggle show={false} />);
    rerender(<Toggle show />);
    await vi.waitFor(() => expect(detect).toHaveBeenCalledTimes(2));
    await act(async () => { resolveNew({ ...base, candidates: [cand("cand-nueva", 1)] }); });
    expect(await screen.findByText("cand-nueva")).toBeInTheDocument();
    await act(async () => { resolveOld({ ...base, candidates: [cand("cand-vieja", 1)] }); });
    expect(screen.queryByText("cand-vieja")).not.toBeInTheDocument();
    expect(screen.getByText("cand-nueva")).toBeInTheDocument();
  });
});

/** Siembra una morfometría y un cuello marcado sobre el elegido 0 antes de
 *  montar el panel, como tras medir y volver a Detección. */
function SeedMeasure({ children }: { children: ReactNode }) {
  const p = usePlanning();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    p.setSession("s1");
    p.setCandidates([]);
    p.setMorphometry({ max_diameter_mm: 7 } as unknown as MorphometryResult);
    p.setNeckRim([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  });
  return p.sessionId && p.morphometry !== undefined ? (
    <>
      <span data-testid="medida">{p.morphometry ? "con medida" : "sin medida"}</span>
      <span data-testid="cuello">{p.neckRim.length} marcas</span>
      {children}
    </>
  ) : null;
}

function WithMeasure() {
  return (
    <PlanningProvider>
      <SeedMeasure><DetectPanel onNext={() => {}} /></SeedMeasure>
    </PlanningProvider>
  );
}

function Toggle({ show }: { show: boolean }) {
  return (
    <PlanningProvider>
      <Seed>{show ? <DetectPanel onNext={() => {}} /> : <span>fuera</span>}</Seed>
    </PlanningProvider>
  );
}
