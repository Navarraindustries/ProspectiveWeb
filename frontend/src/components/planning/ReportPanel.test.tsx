/* Paso de informe: la exportación de la escena a GLB. */

import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    exportGlb: vi.fn().mockResolvedValue({
      glb_url: "/data/sessions/s1/exports/escena.glb?v=1",
      parts: ["Vaso", "Saco", "Clip"], size_kb: 1273.4,
    }),
    exportDicomSeg: vi.fn().mockResolvedValue({
      seg_url: "/data/sessions/s1/exports/segmentacion.dcm?v=1", segments: ["Vaso", "Aneurisma"],
      n_frames: 287, voxel_volumes_mm3: {}, mesh_volumes_mm3: {},
      warnings: ["Sin saco aislado: el SEG solo lleva el vaso."],
    }),
    exportStl: vi.fn(), report: vi.fn(), dicomSr: vi.fn(), saveSession: vi.fn(),
    listCaptures: vi.fn().mockResolvedValue([]), captureObjectUrl: vi.fn(),
  },
}));
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: { username: "admin", full_name: "" } }) }));
vi.mock("./PrintPrepPanel", () => ({ PrintPrepPanel: () => null }));

import { api } from "../../api/client";
import { ReportPanel } from "./ReportPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";

function montar() {
  function Seed({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => { if (!p.sessionId) p.setSession("s1"); }, [p]);
    return p.sessionId ? <>{children}</> : null;
  }
  return render(<PlanningProvider><Seed><ReportPanel onFinish={() => {}} /></Seed></PlanningProvider>);
}

describe("exportar la escena 3D", () => {
  it("dice qué objetos lleva y descarga con un nombre sin datos del paciente", async () => {
    montar();
    fireEvent.click(await screen.findByText("Exportar escena 3D (GLB)"));
    const link = await screen.findByText(/Descargar escena \(Vaso, Saco, Clip · 1273 KB\)/);
    expect(api.exportGlb).toHaveBeenCalledWith("s1");
    expect(link.closest("a")).toHaveAttribute("download", "prospective-escena.glb");
    expect(link.closest("a")).toHaveAttribute("href", "/data/sessions/s1/exports/escena.glb?v=1");
  });
});

describe("exportar la segmentación como DICOM SEG", () => {
  it("dice qué segmentos lleva, enseña los avisos y descarga sin datos del paciente en el nombre", async () => {
    montar();
    fireEvent.click(await screen.findByText("Generar DICOM SEG (segmentación)"));
    const link = await screen.findByText(/Descargar segmentación DICOM \(Vaso \+ Aneurisma\)/);
    expect(api.exportDicomSeg).toHaveBeenCalledWith("s1");
    expect(link.closest("a")).toHaveAttribute("download", "prospective-segmentacion.dcm");
    expect(screen.getByText(/Sin saco aislado/)).toBeInTheDocument();
  });
});
