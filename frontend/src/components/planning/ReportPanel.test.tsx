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
    placedDevices: vi.fn().mockResolvedValue({ remaining: [], mesh_urls: {}, strategy: null, placed_counts: {} }),
    getTeamDecision: vi.fn().mockResolvedValue({ team_decision: null, decided_by: "", other_text: "" }),
  },
}));
// La cuenta es mutable: F1-221 depende del rol y del nombre de quien entra.
const auth = vi.hoisted(() => ({
  user: { username: "admin", full_name: "", role: "admin" } as Record<string, unknown>,
}));
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: auth.user }) }));
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

/* F1-220: el resumen decía paciente, Ø, riesgo y recomendación, pero no por
   dónde se entra, qué dispositivo se eligió ni qué decidió el equipo; y
   «Riesgo (morfometría)» se leía como el riesgo del PHASES. */
describe("«Resumen del caso»", () => {
  function montarCon(seed: (p: ReturnType<typeof usePlanning>) => void) {
    function Seed({ children }: { children: ReactNode }) {
      const p = usePlanning();
      useEffect(() => { if (!p.sessionId) { p.setSession("s1"); seed(p); } }, [p]);
      return p.sessionId ? <>{children}</> : null;
    }
    return render(<PlanningProvider><Seed><ReportPanel onFinish={() => {}} /></Seed></PlanningProvider>);
  }

  it("lista abordaje, dispositivo elegido y decisión del equipo", async () => {
    vi.mocked(api.placedDevices).mockResolvedValueOnce({
      cleared: [], remaining: ["coils"], meshes_removed: 0, mesh_urls: {},
      strategy: "coils", placed_counts: { clips: 0, coils: 3, stent: 0, stent_cl: 0 },
    });
    vi.mocked(api.getTeamDecision).mockResolvedValueOnce(
      { team_decision: "endovascular", decided_by: "Comité neurovascular", other_text: "" });
    montarCon((p) => p.setTrajSaved({
      entry: [0, 0, 0], target: [3, 4, 0], depth_mm: 62.4, angle_deg: 18.2,
      corridor: { radius_mm: 5, vessels_crossed: [], nearest_branch_mm: null, nearest_branch_calibre_mm: 0,
        dense_tissue_mm: 0, dense_tissue_measurable: true, verdict: "viable", verdict_reason: "",
        findings: [], assumptions: [] },
    }));
    expect(await screen.findByText("Abordaje")).toBeInTheDocument();
    expect(screen.getByText("Corredor libre · 62 mm · 18°")).toBeInTheDocument();
    expect(screen.getByText("Dispositivo elegido")).toBeInTheDocument();
    expect(await screen.findByText("Coils · 3 en el plan")).toBeInTheDocument();
    expect(await screen.findByText("Endovascular · por Comité neurovascular")).toBeInTheDocument();
  });

  it("sin nada de eso dice «—» en cada fila", async () => {
    montarCon(() => {});
    await screen.findByText("Abordaje");
    for (const rotulo of ["Abordaje", "Dispositivo elegido", "Decisión del equipo"]) {
      const fila = screen.getByText(rotulo).parentElement!;
      expect(fila).toHaveTextContent("—");
    }
  });

  it("el riesgo de la morfometría se distingue del PHASES", async () => {
    montarCon((p) => p.setMorphometry({ max_diameter_mm: 7, rupture_risk_label: "Alto" } as never));
    expect(await screen.findByText("Índice de forma (AR, BF, UI); no es el PHASES, que está en Morfometría"))
      .toBeInTheDocument();
  });
});

/* F1-221: el campo arrancaba con el nombre de la cuenta; la del administrador
   firmaba el PDF como «Administrador». */
describe("«Cirujano responsable»", () => {
  const conCuenta = (user: Record<string, unknown>) => { auth.user = user; };

  it("con la cuenta admin el campo arranca vacío y el PDF pide el nombre", async () => {
    conCuenta({ username: "admin", full_name: "Administrador", role: "admin" });
    montar();
    const campo = await screen.findByLabelText("Cirujano responsable") as HTMLInputElement;
    expect(campo.value).toBe("");
    expect(screen.getByText("Generar informe PDF").closest("button")).toBeDisabled();
    expect(screen.getByText("Escribe el cirujano responsable")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "Dra. Ruiz" } });
    expect(screen.getByText("Generar informe PDF").closest("button")).not.toBeDisabled();
    expect(screen.queryByText("Escribe el cirujano responsable")).toBeNull();
  });

  it("una cuenta de médico con nombre lo propone", async () => {
    conCuenta({ username: "jruiz", full_name: "Dra. Ruiz", role: "medico" });
    montar();
    const campo = await screen.findByLabelText("Cirujano responsable") as HTMLInputElement;
    expect(campo.value).toBe("Dra. Ruiz");
  });

  it("una cuenta de médico sin nombre no propone el usuario", async () => {
    conCuenta({ username: "jruiz", full_name: "  ", role: "medico" });
    montar();
    const campo = await screen.findByLabelText("Cirujano responsable") as HTMLInputElement;
    expect(campo.value).toBe("");
  });
});

/* F1-239 y F1-240: el botón guarda y cierra; el pie solo promete el vínculo
   con el paciente cuando hay caso. */
describe("guardar desde el informe", () => {
  function montarConCaso(caseId: number | null) {
    function Seed({ children }: { children: ReactNode }) {
      const p = usePlanning();
      useEffect(() => { if (!p.sessionId) { p.setSession("s1"); p.setCase(caseId); } }, [p]);
      return p.sessionId ? <>{children}</> : null;
    }
    return render(<PlanningProvider><Seed><ReportPanel onFinish={() => {}} /></Seed></PlanningProvider>);
  }

  it("el botón dice «Guardar y cerrar»", async () => {
    montarConCaso(null);
    expect(await screen.findByText("Guardar y cerrar")).toBeInTheDocument();
    expect(screen.queryByText("Guardar sesión")).toBeNull();
  });

  it("sin caso no promete el vínculo y remite a «Adjuntar a un caso»", async () => {
    montarConCaso(null);
    expect(await screen.findByText(
      "Sin caso, la sesión se guarda suelta: con «Adjuntar a un caso» queda ligada al paciente",
    )).toBeInTheDocument();
    expect(screen.queryByText(/se vincula al paciente/)).toBeNull();
  });

  it("con caso dice que se vincula", async () => {
    montarConCaso(4);
    expect(await screen.findByText("La sesión se vincula al paciente y estudio en la base de datos."))
      .toBeInTheDocument();
  });
});

/* F1-222: la foto del informe encuadra la lesión y devuelve la cámara. */
describe("la captura 3D del informe", () => {
  it("encuadra con el encuadrador del visor antes de capturar y restaura después", async () => {
    auth.user = { username: "jruiz", full_name: "Dra. Ruiz", role: "medico" };
    const orden: string[] = [];
    const restaurar = vi.fn(() => { orden.push("restaurar"); });
    function Seed({ children }: { children: ReactNode }) {
      const p = usePlanning();
      useEffect(() => {
        if (!p.sessionId) {
          p.setSession("s1");
          p.setCaptureViewport(async () => { orden.push("capturar"); return "data:image/png;base64,QUJD"; });
          p.registerSceneFramer(() => { orden.push("encuadrar"); return restaurar; });
        }
      }, [p]);
      return p.sessionId ? <>{children}</> : null;
    }
    vi.mocked(api.report).mockResolvedValueOnce({ pdf_url: "/x.pdf", generated_at: "" } as never);
    render(<PlanningProvider><Seed><ReportPanel onFinish={() => {}} /></Seed></PlanningProvider>);
    fireEvent.click(await screen.findByText("Generar informe PDF"));
    await screen.findByText(/Descargar PDF/);
    expect(orden).toEqual(["encuadrar", "capturar", "restaurar"]);
    expect(vi.mocked(api.report).mock.calls.at(-1)?.[0]).toMatchObject({
      screenshot_png_b64: "QUJD", surgeon_name: "Dra. Ruiz",
    });
  });
});
