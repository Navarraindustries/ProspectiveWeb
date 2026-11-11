/* Las escalas de riesgo en Decisión (decidido el 11-11): vienen de las
   pestañas de Morfometría y conservan lo que allí se comprobaba. */

import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { phases: vi.fn(), elapss: vi.fn(), uiats: vi.fn() },
}));

import { EscalasClinicas } from "./EscalasClinicas";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { AneurysmLocation, MorphometryResult } from "../../api/types";

const medida = {
  volume_mm3: 300, surface_area_mm2: 225.3, eq_sphere_diam_mm: 8,
  max_diameter_mm: 11.0, bbox_w_mm: 8, bbox_h_mm: 6,
  neck_mm: 7.0, dome_height_mm: 7.9, dnr: 1.58, ar: 1.13, bf: 1.58,
  compactness: 0, ui: 0, ei: 0, nsi: 0, sr: 0, rupture_risk_label: "Moderado",
  reliable: true, volume_valid: true, neck_valid: true, neck_source: "auto", neck_tilt_deg: 0, warning: null,
  centroid: { x: 0, y: 0, z: 0 }, principal_axis: [0, 0, 1], neck_origin: { x: 0, y: 0, z: 0 },
} as unknown as MorphometryResult;

function montar(m: MorphometryResult | null, sitio: AneurysmLocation | null = null) {
  function Seed({ children }: { children: ReactNode }) {
    const { setSession, setMorphometry, setAneurysmSite, sessionId } = usePlanning();
    useEffect(() => {
      if (!sessionId) { setSession("s1"); setMorphometry(m); setAneurysmSite(sitio); }
    }, [sessionId, setSession, setMorphometry, setAneurysmSite]);
    return <>{children}</>;
  }
  return render(<PlanningProvider><Seed><EscalasClinicas /></Seed></PlanningProvider>);
}

describe("EscalasClinicas", () => {
  it("sin morfometría no pinta nada", () => {
    const { container } = montar(null);
    expect(container.textContent).toBe("");
  });

  it("tres pestañas, PHASES abierta, y dice que es una referencia poblacional", async () => {
    montar(medida);
    for (const t of ["PHASES", "ELAPSS", "UIATS"]) expect(await screen.findByRole("tab", { name: t })).toBeInTheDocument();
    expect(await screen.findByText(/referencia poblacional, no una predicción/)).toBeInTheDocument();
  });

  it("sin localización manda a elegirla en Morfometría; con ella, PHASES la hereda", async () => {
    const { unmount } = montar(medida);
    expect(await screen.findByText("Elige la localización en Morfometría")).toBeInTheDocument();
    unmount();
    montar(medida, "Tronco basilar");
    await screen.findByText(/referencia poblacional/);
    expect(screen.queryByText("Elige la localización en Morfometría")).not.toBeInTheDocument();
    expect(screen.getByText("Tronco basilar", { selector: "b" })).toBeInTheDocument();
  });

  it("cambia de escala con las pestañas", async () => {
    montar(medida);
    fireEvent.click(await screen.findByRole("tab", { name: "UIATS" }));
    expect(screen.getByRole("tab", { name: "UIATS" })).toHaveAttribute("aria-selected", "true");
  });
});
