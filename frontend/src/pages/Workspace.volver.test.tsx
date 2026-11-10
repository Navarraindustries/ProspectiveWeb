/* «Volver» al paso anterior en el pie de cada panel.

   Para retroceder solo estaba el carril, que con la hoja inferior a altura
   completa no se pinta. El botón sale del pie común (PanelFooter) con lo que
   Workspace le dice por contexto: aquí los paneles se sustituyen por un pie con
   un botón de avance, que es lo único que hace falta para verlo. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

type PropsPanel = { onNext?: () => void; onSkipToReport?: () => void };
const { estado, Nada, ConPie, Panel } = vi.hoisted(() => {
  const ConPie = { actual: null as null | ((p: PropsPanel) => unknown) };
  return {
    estado: {} as Record<string, unknown>,
    Nada: () => null,
    ConPie,
    // Todos los paneles de paso: el pie común con un botón de avance.
    Panel: (p: PropsPanel) => ConPie.actual!(p),
  };
});
vi.mock("../api/client", () => ({ api: { saveSession: vi.fn() } }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock("../store/nav", () => ({ useNav: () => ({ go: vi.fn() }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../store/planning", () => ({
  usePlanning: () => ({
    morphometry: null, sessionId: "vivo-1", caseId: 7, caseLabel: "Caso", imagingStudyId: 9,
    centerlineMesh: null, setPickMode: vi.fn(), markSaved: vi.fn(), captureCase: vi.fn(),
    annotations: [], annotationsSync: "idle", setAnnotationsSync: vi.fn(),
    annotationsLoadedRef: { current: true }, setAnnotationsLoaded: vi.fn(),
    annotationsFlushRef: { current: null }, annotationsLoadState: "loaded", noteFocusRequest: null,
    series: null, segmentation: null, candidates: [], rejectedCandidates: [],
    setPatient: vi.fn(), setCase: vi.fn(), setImagingStudyId: vi.fn(),
    dirty: false, registerSaver: vi.fn(),
    ...estado,
  }),
}));
vi.mock("../components/annotations/useAnnotationsSync", () => ({ useAnnotationsSync: () => ({ flush: async () => true }), annotationsSubtitle: () => "" }));
vi.mock("../vtk/Viewer", () => ({ ViewerWorkspace: Nada }));
vi.mock("../components/perforators/PerforatorsPanel", () => ({ PerforatorsPanel: Nada }));
vi.mock("../components/vessels/CenterlinePanel", () => ({ CenterlinePanel: Nada }));
vi.mock("../components/annotations/AnnotationsPanel", () => ({ AnnotationsPanel: Nada }));
vi.mock("../components/AttachCaseSheet", () => ({ AttachCaseSheet: Nada }));
vi.mock("../components/RecordButton", () => ({ RecordButton: Nada }));
vi.mock("../components/upload/UploadPanel", () => ({ UploadPanel: Panel }));
vi.mock("../components/segmentation/SegmentPanel", () => ({ SegmentPanel: Panel }));
vi.mock("../components/planning/DetectPanel", () => ({ DetectPanel: Panel }));
vi.mock("../components/morphometry/MorphometryPanel", () => ({ MorphometryPanel: Panel }));
vi.mock("../components/planning/TreatmentPanel", () => ({ TreatmentPanel: Panel }));
vi.mock("../components/planning/DevicesPanel", () => ({ DevicesPanel: Panel }));
vi.mock("../components/planning/ManufacturePanel", () => ({ ManufacturePanel: Panel }));
vi.mock("../components/planning/ReportPanel", () => ({ ReportPanel: Panel }));

import { Workspace } from "./Workspace";
import { PanelFooter } from "../components/PanelFooter";
import { STEPS } from "../pipeline/steps";
import { backLabel } from "../pipeline/stepNav";
import { simularPantalla } from "../test/pantalla";

ConPie.actual = ({ onNext, onSkipToReport }) => (
  <PanelFooter>
    <button type="button" onClick={onNext}>Avanzar</button>
    {onSkipToReport && <button type="button" onClick={onSkipToReport}>Saltar al informe</button>}
  </PanelFooter>
);

const montar = (paso: number) => render(
  <Workspace patient={null} initialStep={paso} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />,
);
const cabecera = (n: number) => `PASO ${n} · ${STEPS[n - 1].label.toLocaleUpperCase("es")}`;

beforeEach(() => { for (const k of Object.keys(estado)) delete estado[k]; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("el rótulo de «Volver»", () => {
  it("nombra el paso anterior con los rótulos de steps.ts, y el primero no tiene", () => {
    expect(backLabel(0)).toBeNull();
    expect(backLabel(1)).toBe("Volver a carga DICOM");
    expect(backLabel(2)).toBe("Volver a segmentación");
    expect(backLabel(7)).toBe("Volver a fabricación");
  });
});

describe("«Volver» en el pie del panel", () => {
  it("el primer paso no lo tiene", () => {
    montar(0);
    // La barra de arriba tiene su propio «Volver a pacientes»: se mira el pie.
    const botones = Array.from(document.querySelector(".ws-panel-footer")!.querySelectorAll("button"));
    expect(botones.map((b) => b.textContent)).toEqual(["Avanzar"]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])("el paso %i lo tiene, a la izquierda del avance, y lleva al anterior", (paso) => {
    montar(paso);
    const volver = screen.getByRole("button", { name: backLabel(paso)! });
    const avanzar = screen.getByRole("button", { name: "Avanzar" });
    expect(volver.compareDocumentPosition(avanzar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(volver);
    expect(document.body.textContent).toContain(cabecera(paso));
  });

  it("no lo bloquea lo que le falte al paso anterior", () => {
    // Sin serie el carril da Segmentación por bloqueada; se vuelve igual.
    montar(2);
    expect(screen.getByRole("button", { name: /Segmentación.*Carga una serie DICOM primero/ }))
      .toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Volver a segmentación" }));
    expect(document.body.textContent).toContain(cabecera(2));
  });

  it("desde Dispositivos, «Saltar al informe» lleva al Informe sin pasar por Fabricación", () => {
    montar(5);
    fireEvent.click(screen.getByRole("button", { name: "Saltar al informe" }));
    expect(document.body.textContent).toContain(cabecera(8));
  });
});

describe("con la hoja inferior a altura completa (≤ 1280 px)", () => {
  it("no hay carril, pero «Volver» y el avance siguen en la hoja", () => {
    simularPantalla(1100);
    montar(2);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar la altura del panel" })); // completa
    expect(screen.queryByRole("navigation", { name: "Flujo de planificación" })).toBeNull();
    const hoja = screen.getByRole("region", { name: "Panel del paso" });
    const volver = screen.getByRole("button", { name: "Volver a segmentación" });
    expect(hoja.contains(volver)).toBe(true);
    expect(hoja.contains(screen.getByRole("button", { name: "Avanzar" }))).toBe(true);
    fireEvent.click(volver);
    expect(hoja.textContent).toContain(cabecera(2));
  });
});
