/* El paso de detección: lo que dice mientras trabaja y lo que avisa de la malla.

   Dos cosas que antes no estaban a la vista:
   - una barra muda durante medio minuto: ahora se ve la fase (curvatura,
     calibre y cociente, regiones) del mismo registro de progreso que la
     segmentación;
   - que la malla está a media resolución, con lo que el orden de candidatos
     empeora de forma medida. Solo lo decía el README. */

import { render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProgressState, SegmentResult } from "../../api/types";

vi.mock("../../api/client", () => ({
  api: {
    // Nunca resuelve: el panel se queda «trabajando» y se puede ver su progreso.
    detect: vi.fn(() => new Promise(() => {})),
    clearDetection: vi.fn(),
  },
}));

const enCurso: ProgressState = { phase: "calibre y cociente", pct: 45, running: true, ok: null, message: "" };
vi.mock("../../api/progress", () => ({
  CONNECTION_LOST: { phase: "", pct: 0, running: false, ok: false, message: "x" },
  useProgress: (_sid: string | null, active: boolean) => (active ? enCurso : null),
}));

import { DetectPanel } from "./DetectPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";

const malla = (downsample_factor: number): SegmentResult => ({
  mesh_url: "/data/x.vtp", voxel_fraction: 0.01, strategy: "dsa", is_dsa: true,
  vertices: 100, faces: 200, kept_fraction: 1, fragments_removed: 0,
  largest_removed_mm3: 0, downsample_factor,
  main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
} as SegmentResult);

function conMalla(seg: SegmentResult) {
  function Seed({ children }: { children: ReactNode }) {
    const { setSession, setSegmentation, sessionId } = usePlanning();
    useEffect(() => {
      if (!sessionId) { setSession("s1"); setSegmentation(seg); }
    }, [sessionId, setSession, setSegmentation]);
    return sessionId ? <>{children}</> : null;
  }
  return render(
    <PlanningProvider>
      <Seed><DetectPanel onNext={() => {}} /></Seed>
    </PlanningProvider>,
  );
}

describe("mientras detecta", () => {
  it("enseña la fase y el porcentaje del servidor", async () => {
    conMalla(malla(1));
    expect(await screen.findByText("calibre y cociente")).toBeInTheDocument();
    expect(screen.getByText("45 %")).toBeInTheDocument();
  });
});

describe("malla a media resolución", () => {
  it("avisa de que el orden de candidatos es menos fiable", async () => {
    conMalla(malla(2));
    expect(await screen.findByText("La malla está a media resolución")).toBeInTheDocument();
  });

  it("no dice nada a resolución completa", async () => {
    conMalla(malla(1));
    await screen.findByText("calibre y cociente");
    expect(screen.queryByText("La malla está a media resolución")).toBeNull();
  });
});
