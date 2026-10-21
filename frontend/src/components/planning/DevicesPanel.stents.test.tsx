/* Paso 6 · Stents. F1-189 (pestañas «Stents» / «Stent CL» y un solo stent por
   sesión), F1-205 (diámetro nominal desde el vaso medido), F1-206 (una sola
   expresión para la geometría), F1-207 («OK» con infradimensionado) y F1-208
   (dónde se mide cada calibre). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClStentResult, MorphometryResult, StentLibraryItem, StentPlanResult } from "../../api/types";

vi.mock("../../api/client", async (orig) => {
  const mod = await orig<typeof import("../../api/client")>();
  return { ...mod, api: { ...mod.api,
    clipRecommendations: vi.fn(() => new Promise(() => {})),
    listCustomClips: vi.fn(async () => []),
    clipSelection: vi.fn(() => new Promise(() => {})),
    coilRecommendations: vi.fn(() => new Promise(() => {})),
    listStents: vi.fn(),
    planStent: vi.fn(),
    deployClStent: vi.fn(),
    placedDevices: vi.fn(async () => ({ remaining: [], mesh_urls: {}, strategy: null, placed_counts: {} })),
    getTeamDecision: vi.fn(async () => ({ team_decision: null, decided_by: "", other_text: "" })),
  } };
});
import { api } from "../../api/client";
import { DevicesPanel } from "./DevicesPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";

const UN_SOLO_STENT = "Un solo stent por sesión: colocar uno sustituye al otro";

const morpho = {
  neck_origin: { x: 1, y: 2, z: 3 }, principal_axis: [0, 0, 1],
  centroid: { x: 1, y: 2, z: 5 }, dome_height_mm: 4, reliable: true, neck_mm: 4.2,
  parent_artery_mm: 4.83,
} as unknown as MorphometryResult;

const stents: StentLibraryItem[] = [
  { id: "pipeline", name: "Pipeline", manufacturer: "M", min_diameter_mm: 2.5, max_diameter_mm: 5, available_lengths_mm: [16, 20], type: "flow_diverter" },
];

const plan: StentPlanResult = {
  stent_mesh_url: "/m/stent.vtp", coverage_pct: 100, neck_diameter_covered_mm: 4.2, required_length_mm: 14,
  deployed: true, sizing: "undersized", parent_artery_mm: 4.83, follows_centerline: true,
  notes: [], sources: [], warning: null,
};

function montar(opts: { conLineaCentral?: boolean; morfo?: MorphometryResult } = {}) {
  function Seed({ children }: { children: ReactNode }) {
    const { sessionId, setSession, setMorphometry, setCenterlineMesh, setCenterlineArcMm } = usePlanning();
    useEffect(() => {
      if (!sessionId) {
        setSession("s1");
        setMorphometry(opts.morfo ?? morpho);
        if (opts.conLineaCentral) { setCenterlineMesh("/m/cl.vtp"); setCenterlineArcMm(40); }
      }
    }, [sessionId, setSession, setMorphometry, setCenterlineMesh, setCenterlineArcMm]);
    return sessionId ? <>{children}</> : null;
  }
  render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listStents).mockResolvedValue(stents);
  vi.mocked(api.planStent).mockResolvedValue(plan);
});

describe("las pestañas de stent (F1-189)", () => {
  it("se llaman «Stent recto» y «Stent sobre la línea central»", async () => {
    montar();
    expect(await screen.findByRole("button", { name: "Stent recto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stent sobre la línea central" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stents" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stent CL" })).toBeNull();
  });

  it("las dos avisan de que hay un solo stent por sesión", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Stent recto" }));
    expect(await screen.findByText(UN_SOLO_STENT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stent sobre la línea central" }));
    expect(await screen.findByText(UN_SOLO_STENT)).toBeInTheDocument();
  });

  it("la estrategia del equipo usa los mismos nombres", async () => {
    montar();
    const sel = await screen.findByLabelText("Estrategia del equipo") as HTMLSelectElement;
    const nombres = Array.from(sel.options).map((o) => o.textContent);
    expect(nombres).toContain("Stent recto");
    expect(nombres).toContain("Stent sobre la línea central");
  });
});

describe("stent recto", () => {
  async function abrir(morfo?: MorphometryResult) {
    montar({ morfo });
    fireEvent.click(await screen.findByRole("button", { name: "Stent recto" }));
    await screen.findByLabelText("Diámetro nominal");
  }
  const diametro = () => screen.getByLabelText("Diámetro nominal") as HTMLInputElement;

  it("con vaso de 4,83 mm el valor inicial no es 4 (F1-205)", async () => {
    await abrir();
    await waitFor(() => expect(Number(diametro().value)).not.toBe(4));
    // Al paso del deslizador (0,25) y dentro del modelo.
    expect(Number(diametro().value)).toBe(4.75);
  });

  it("un vaso más ancho que el modelo se queda en su máximo (F1-205)", async () => {
    await abrir({ ...morpho, parent_artery_mm: 6.2 } as MorphometryResult);
    await waitFor(() => expect(Number(diametro().value)).toBe(5));
  });

  it("infradimensionado no muestra «OK» (F1-207)", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desplegar y evaluar" }));
    expect(await screen.findByText("Infradimensionado")).toBeInTheDocument();
    expect(screen.queryByText("OK")).toBeNull();
    expect(screen.getAllByText("Revisar").length).toBeGreaterThan(0);
  });

  it("nominal y desplegado sí dice «OK»", async () => {
    vi.mocked(api.planStent).mockResolvedValue({ ...plan, sizing: "nominal" });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desplegar y evaluar" }));
    expect((await screen.findAllByText("OK")).length).toBeGreaterThan(0);
  });

  it("la arteria portadora dice dónde se mide y la geometría usa una sola expresión (F1-206, F1-208)", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desplegar y evaluar" }));
    expect(await screen.findByText("Arteria portadora (en el cuello)")).toBeInTheDocument();
    expect(screen.getByText("Sigue la línea central")).toBeInTheDocument();
    expect(screen.queryByText("Sigue el vaso")).toBeNull();
    expect(screen.queryByText("Línea central")).toBeNull();
  });

  it("sin línea central la geometría es «Tubo recto»", async () => {
    vi.mocked(api.planStent).mockResolvedValue({ ...plan, follows_centerline: false });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desplegar y evaluar" }));
    expect(await screen.findByText("Tubo recto")).toBeInTheDocument();
  });
});

describe("stent sobre la línea central (F1-208)", () => {
  it("el Ø del vaso dice que es la media del tramo cubierto", async () => {
    const res: ClStentResult = {
      stent_mesh_url: "/m/cl.vtp", length_mm: 20, nominal_diameter_mm: 4, mean_vessel_diameter_mm: 4.24,
      coverage_ratio: 0.94, total_arc_mm: 40, warning: null,
    };
    vi.mocked(api.deployClStent).mockResolvedValue(res);
    montar({ conLineaCentral: true });
    fireEvent.click(await screen.findByRole("button", { name: "Stent sobre la línea central" }));
    fireEvent.click(await screen.findByRole("button", { name: "Desplegar sobre la línea central" }));
    expect(await screen.findByText("Ø medio del tramo cubierto")).toBeInTheDocument();
    expect(screen.queryByText("Ø vaso medio")).toBeNull();
  });
});
