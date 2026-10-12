/* «Guardar progreso» tras «Reanudar» guarda sobre la sesión de origen (F1-108).

   Reanudar da a la sesión viva un id nuevo y cada guardado añadía otra fila casi
   igual a «Sesiones guardadas». El botón pide guardar sobre la de origen y dice
   qué guarda. El visor y los paneles de cada paso no pintan nada aquí: se
   sustituyen por cajas vacías para montar solo la barra superior. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { saveSession, markSaved, Nada } = vi.hoisted(() => ({
  saveSession: vi.fn(), markSaved: vi.fn(), Nada: () => null,
}));
vi.mock("../api/client", () => ({ api: { saveSession: (...a: unknown[]) => saveSession(...a) } }));

vi.mock("../store/planning", () => ({
  usePlanning: () => ({
    morphometry: null, sessionId: "vivo-1", caseId: 7, caseLabel: "Caso", imagingStudyId: 9,
    centerlineMesh: null, setPickMode: vi.fn(), markSaved, captureCase: null,
    annotations: [], annotationsSync: "idle", setAnnotationsSync: vi.fn(),
    annotationsLoadedRef: { current: true }, setAnnotationsLoaded: vi.fn(),
    annotationsFlushRef: { current: null }, annotationsLoadState: "loaded", noteFocusRequest: null,
    series: null, segmentation: null, candidates: [], rejectedCandidates: [],
    setPatient: vi.fn(), setCase: vi.fn(), setImagingStudyId: vi.fn(),
  }),
}));
vi.mock("../components/annotations/useAnnotationsSync", () => ({ useAnnotationsSync: () => ({ flush: async () => true }) }));

vi.mock("../vtk/Viewer", () => ({ ViewerWorkspace: Nada }));
vi.mock("../components/upload/UploadPanel", () => ({ UploadPanel: Nada }));
vi.mock("../components/segmentation/SegmentPanel", () => ({ SegmentPanel: Nada }));
vi.mock("../components/planning/DetectPanel", () => ({ DetectPanel: Nada }));
vi.mock("../components/morphometry/MorphometryPanel", () => ({ MorphometryPanel: Nada }));
vi.mock("../components/perforators/PerforatorsPanel", () => ({ PerforatorsPanel: Nada }));
vi.mock("../components/vessels/CenterlinePanel", () => ({ CenterlinePanel: Nada }));
vi.mock("../components/planning/TreatmentPanel", () => ({ TreatmentPanel: Nada }));
vi.mock("../components/planning/DevicesPanel", () => ({ DevicesPanel: Nada }));
vi.mock("../components/planning/ManufacturePanel", () => ({ ManufacturePanel: Nada }));
vi.mock("../components/planning/ReportPanel", () => ({ ReportPanel: Nada }));
vi.mock("../components/annotations/AnnotationsPanel", () => ({ AnnotationsPanel: Nada }));
vi.mock("../components/AttachCaseSheet", () => ({ AttachCaseSheet: Nada }));
vi.mock("../components/RecordButton", () => ({ RecordButton: Nada }));

import { Workspace } from "./Workspace";

const montar = () => render(
  <Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />,
);

describe("«Guardar progreso»", () => {
  beforeEach(() => { saveSession.mockReset(); saveSession.mockResolvedValue({}); markSaved.mockReset(); });

  it("guarda sobre la sesión de origen", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Guardar progreso/ }));
    await waitFor(() => expect(saveSession).toHaveBeenCalledTimes(1));
    expect(saveSession.mock.calls[0][0]).toMatchObject({ session_id: "vivo-1", overwrite_origin: true });
    await waitFor(() => expect(markSaved).toHaveBeenCalled());
  });

  it("dice qué guarda", () => {
    montar();
    expect(screen.getByRole("button", { name: /Guardar progreso/ }).getAttribute("title")).toBe(
      "Guarda el estudio, la malla, las medidas, la decisión, los dispositivos y las anotaciones de esta sesión",
    );
  });
});
