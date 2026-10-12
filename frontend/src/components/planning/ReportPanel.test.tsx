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

/* F1-249: reanudar volvía sin los enlaces aunque el PDF y el SR siguieran en
   disco; había que generarlos otra vez para poder descargarlos. */
describe("enlaces del informe tras reanudar", () => {
  function montarReanudada(urls: { pdf_url?: string | null; dicom_sr_url?: string | null; pdf_current?: boolean; sr_current?: boolean } | null) {
    function Seed({ children }: { children: ReactNode }) {
      const p = usePlanning();
      useEffect(() => {
        if (!p.sessionId) { p.setSession("s1"); p.setReportUrls(urls); }
      }, [p]);
      return p.sessionId ? <>{children}</> : null;
    }
    return render(<PlanningProvider><Seed><ReportPanel onFinish={() => {}} /></Seed></PlanningProvider>);
  }

  it("con el PDF y el SR en disco, enlaza a los dos", async () => {
    montarReanudada({ pdf_url: "/data/sessions/s1/reports/vieja_report.pdf?v=1", dicom_sr_url: "/data/sessions/s1/reports/vieja_sr.dcm?v=1", pdf_current: true, sr_current: true });
    const pdf = await screen.findByText(/Descargar PDF/);
    expect(pdf.closest("a")).toHaveAttribute("href", "/data/sessions/s1/reports/vieja_report.pdf?v=1");
    const sr = screen.getByText(/Descargar informe estructurado DICOM/);
    expect(sr.closest("a")).toHaveAttribute("href", "/data/sessions/s1/reports/vieja_sr.dcm?v=1");
  });

  it("sin ficheros guardados no enseña enlaces", async () => {
    montarReanudada(null);
    await screen.findByText("Generar informe PDF");
    expect(screen.queryByText(/Descargar PDF/)).toBeNull();
    expect(screen.queryByText(/Descargar informe estructurado DICOM/)).toBeNull();
  });
  it("un PDF generado con otro plan sale desfasado y ofrece regenerarlo", async () => {
    montarReanudada({ pdf_url: "/data/sessions/s1/reports/vieja_report.pdf?v=1", pdf_current: false });
    expect(await screen.findByText("Regenerar informe PDF")).toBeInTheDocument();
    expect(screen.getByText(/El plan cambió desde que se generó este archivo/)).toBeInTheDocument();
    expect(screen.queryByText(/Descargar PDF/)).toBeNull();
  });

  it("un PDF generado con el plan guardado sale al día", async () => {
    montarReanudada({ pdf_url: "/data/sessions/s1/reports/vieja_report.pdf?v=1", pdf_current: true });
    await screen.findByText(/Descargar PDF/);
    expect(screen.getByText("Generar informe PDF")).toBeInTheDocument();
  });
});
