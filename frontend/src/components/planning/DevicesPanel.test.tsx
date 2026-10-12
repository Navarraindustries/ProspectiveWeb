/* F1-188: el paso 6 abría siempre en «Clips», aunque el equipo hubiera
   decidido tratamiento endovascular, y «En el plan (n)» listaba lo colocado
   sin decir cuál de esas familias era la estrategia elegida. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", async (orig) => {
  const mod = await orig<typeof import("../../api/client")>();
  return { ...mod, api: { ...mod.api,
    clipRecommendations: vi.fn(() => new Promise(() => { /* no es lo que se prueba */ })),
    listCustomClips: vi.fn(async () => []),
    clipSelection: vi.fn(() => new Promise(() => {})),
    coilRecommendations: vi.fn(() => new Promise(() => {})),
    placedDevices: vi.fn(async () => ({ remaining: [], mesh_urls: {}, strategy: null, placed_counts: {} })),
    getTeamDecision: vi.fn(async () => ({ team_decision: null, decided_by: "", other_text: "" })),
    setDeviceStrategy: vi.fn(async (_sid: string, strategy: unknown) => ({ strategy })),
  } };
});
import { api } from "../../api/client";
import { DevicesPanel } from "./DevicesPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { MorphometryResult, TeamDecision, TreatmentDecisionResult } from "../../api/types";

const morpho = {
  neck_origin: { x: 1, y: 2, z: 3 }, principal_axis: [0, 0, 1],
  centroid: { x: 1, y: 2, z: 5 }, dome_height_mm: 4, reliable: true,
} as unknown as MorphometryResult;

function conEquipo(team: TeamDecision | null): TreatmentDecisionResult {
  return {
    recommendation: "TRATAMIENTO ENDOVASCULAR", recommendation_key: "endo", confidence: "Moderada", confidence_reason: "",
    coverage_pct: 100, missing_inputs: [], notes: [], endovascular: null, jsdb: null,
    perforators: null, factors: [], clip_factors: [], endo_factors: [], team,
  };
}

function montar(treatment: TreatmentDecisionResult | null) {
  function Seed({ children }: { children: ReactNode }) {
    const { sessionId, setSession, setMorphometry, setTreatment } = usePlanning();
    useEffect(() => {
      if (!sessionId) { setSession("s1"); setMorphometry(morpho); setTreatment(treatment); }
    }, [sessionId, setSession, setMorphometry, setTreatment]);
    return sessionId ? <>{children}</> : null;
  }
  return render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe("la pestaña con la que abre", () => {
  it("con la decisión «endovascular» abre en Coils", async () => {
    montar(conEquipo({ team_decision: "endovascular", decided_by: "Comité", other_text: "" }));
    await waitFor(() => expect(api.coilRecommendations).toHaveBeenCalled());
    expect(api.clipRecommendations).not.toHaveBeenCalled();
  });

  it("con «clipaje», o sin decisión, abre en Clips", async () => {
    montar(conEquipo({ team_decision: "clipaje", decided_by: "", other_text: "" }));
    await waitFor(() => expect(api.clipRecommendations).toHaveBeenCalled());
    expect(api.coilRecommendations).not.toHaveBeenCalled();
  });

  it("sin recomendación lee la decisión del servidor", async () => {
    vi.mocked(api.getTeamDecision).mockResolvedValueOnce(
      { team_decision: "endovascular", decided_by: "", other_text: "" });
    montar(null);
    await waitFor(() => expect(api.coilRecommendations).toHaveBeenCalled());
  });
});

describe("«Estrategia del equipo» en «En el plan (n)»", () => {
  it("enseña la guardada y guarda la que se marca", async () => {
    vi.mocked(api.placedDevices).mockResolvedValue({
      cleared: [], remaining: ["clips", "coils"], meshes_removed: 0,
      mesh_urls: { clips: "/m/clips.vtp", coils: "/m/coils.vtp" },
      strategy: "coils", placed_counts: { clips: 1, coils: 3 },
    });
    montar(null);
    const sel = await screen.findByLabelText("Estrategia del equipo") as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe("coils"));
    expect(Array.from(sel.options).map((o) => o.text))
      .toEqual(["—", "Clips", "Coils", "Stent", "Stent CL", "WEB"]);
    fireEvent.change(sel, { target: { value: "clips" } });
    await waitFor(() => expect(api.setDeviceStrategy).toHaveBeenCalledWith("s1", "clips"));
    fireEvent.change(sel, { target: { value: "" } });
    await waitFor(() => expect(api.setDeviceStrategy).toHaveBeenLastCalledWith("s1", null));
  });
});

/* Revisión de la Tarea 12: sin nada colocado la tarjeta no se pintaba, así
   que el WEB (que se dimensiona pero no se coloca) nunca se podía marcar, ni
   ninguna estrategia antes de colocar. */
describe("«Estrategia del equipo» sin nada colocado", () => {
  it("el selector está y guarda «WEB»", async () => {
    vi.mocked(api.placedDevices).mockResolvedValue({
      cleared: [], remaining: [], meshes_removed: 0, mesh_urls: {},
      strategy: null, placed_counts: {},
    });
    montar(null);
    const sel = await screen.findByLabelText("Estrategia del equipo") as HTMLSelectElement;
    expect(screen.getByText("En el plan (0)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Limpiar todos los dispositivos/ })).toBeNull();
    fireEvent.change(sel, { target: { value: "web" } });
    await waitFor(() => expect(api.setDeviceStrategy).toHaveBeenCalledWith("s1", "web"));
    expect(sel.value).toBe("web");
  });
});
