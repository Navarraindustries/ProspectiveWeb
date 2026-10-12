/* «Guardar progreso» tras «Reanudar» guarda sobre la sesión de origen (F1-108).

   Reanudar da a la sesión viva un id nuevo y cada guardado añadía otra fila casi
   igual a «Sesiones guardadas». El botón pide guardar sobre la de origen y dice
   qué guarda. El visor y los paneles de cada paso no pintan nada aquí: se
   sustituyen por cajas vacías para montar solo la barra superior. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { saveSession, markSaved, captureCase, registerSaver, estado, Nada } = vi.hoisted(() => ({
  saveSession: vi.fn(), markSaved: vi.fn(), captureCase: vi.fn(), registerSaver: vi.fn(),
  // Lo que cada prueba cambia del store: con paciente, sin estudio, con cambios…
  estado: {} as Record<string, unknown>,
  Nada: () => null,
}));
vi.mock("../api/client", () => ({ api: { saveSession: (...a: unknown[]) => saveSession(...a) } }));

vi.mock("../store/planning", () => ({
  usePlanning: () => ({
    morphometry: null, sessionId: "vivo-1", caseId: 7, caseLabel: "Caso", imagingStudyId: 9,
    centerlineMesh: null, setPickMode: vi.fn(), markSaved, captureCase,
    annotations: [], annotationsSync: "idle", setAnnotationsSync: vi.fn(),
    annotationsLoadedRef: { current: true }, setAnnotationsLoaded: vi.fn(),
    annotationsFlushRef: { current: null }, annotationsLoadState: "loaded", noteFocusRequest: null,
    series: null, segmentation: null, candidates: [], rejectedCandidates: [],
    setPatient: vi.fn(), setCase: vi.fn(), setImagingStudyId: vi.fn(),
    dirty: false, registerSaver,
    ...estado,
  }),
}));
vi.mock("../components/annotations/useAnnotationsSync", () => ({ useAnnotationsSync: () => ({ flush: async () => true }), annotationsSubtitle: () => "" }));

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
import { hora } from "../lib/fecha";
import type { PatientSummary } from "../api/types";

const montar = () => render(
  <Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />,
);

describe("«Guardar progreso»", () => {
  beforeEach(() => {
    saveSession.mockReset(); saveSession.mockResolvedValue({}); markSaved.mockReset();
    for (const k of Object.keys(estado)) delete estado[k];
  });

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

describe("captura sin estudio archivado (F1-122)", () => {
  it("el aviso es informativo, no un error rojo", async () => {
    // Descargar la imagen es el comportamiento esperado sin caso: pintarlo como
    // alerta destructiva hacía creer que algo había fallado.
    captureCase.mockReset().mockResolvedValue("downloaded");
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Captura/ }));
    const aviso = await screen.findByRole("status");
    expect(aviso.textContent).toContain("Captura descargada en la carpeta de descargas. No queda en la ficha porque la sesión no tiene caso: «Archivar en un caso».");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(aviso.getAttribute("style") ?? "").not.toContain("var(--destructive)");
  });
});

const PACIENTE = { id: 3, full_name: "Ana Pérez" } as PatientSummary;

/* F1-107: con el paciente ya fijado, «Adjuntar a un caso» sonaba a elegir
   paciente otra vez; lo que falta es el caso donde archivar. */
describe("botón del caso en la barra superior", () => {
  beforeEach(() => { for (const k of Object.keys(estado)) delete estado[k]; });

  it("con paciente: «Archivar en un caso» y dice qué guarda", () => {
    estado.imagingStudyId = null;
    render(<Workspace patient={PACIENTE} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    const b = screen.getByRole("button", { name: /Archivar en un caso/ });
    expect(b.getAttribute("title")).toBe("Crea o elige un caso de este paciente y guarda en él el DICOM, las capturas y los vídeos");
    expect(screen.queryByRole("button", { name: /Adjuntar a un caso/ })).toBeNull();
  });

  it("sin paciente sigue siendo «Adjuntar a un caso»", () => {
    estado.imagingStudyId = null;
    montar();
    expect(screen.getByRole("button", { name: /Adjuntar a un caso/ })).toBeTruthy();
  });
});

/* F1-109: «Guardado ✓» desaparecía a los 1,8 s y el botón volvía a decir
   «Guardar progreso» haya o no algo nuevo que guardar. */
describe("estado del guardado en el botón", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    saveSession.mockReset(); saveSession.mockResolvedValue({});
  });

  it("tocar el estado muestra el punto; guardar muestra la hora", async () => {
    estado.dirty = true;
    const { rerender } = montar();
    expect(screen.getByRole("button", { name: /Guardar progreso/ }).textContent).toContain("Guardar progreso •");
    const antes = new Date();
    fireEvent.click(screen.getByRole("button", { name: /Guardar progreso/ }));
    await waitFor(() => expect(markSaved).toHaveBeenCalled());
    // El store limpia `dirty` en markSaved: aquí se hace a mano.
    estado.dirty = false;
    rerender(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    const boton = await screen.findByRole("button", { name: /Guardado \d{2}:\d{2}$/ });
    // El texto lleva delante el glifo del icono.
    expect([hora(antes), hora(new Date())].some((h) => boton.textContent?.endsWith(`Guardado ${h}`))).toBe(true);
    // Volver a tocar algo devuelve el punto, sin esperar a ningún temporizador.
    estado.dirty = true;
    rerender(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    expect(screen.getByRole("button", { name: /Guardar progreso •/ })).toBeTruthy();
  });

  it("sin cambios ni guardado en esta pantalla, «Guardar progreso» a secas", () => {
    montar();
    const t = screen.getByRole("button", { name: /Guardar progreso/ }).textContent ?? "";
    expect(t.endsWith("Guardar progreso")).toBe(true);
    expect(t).not.toContain("•");
  });
});

/* F1-110: el aviso de salida de App guarda con el mismo «Guardar progreso»
   de esta pantalla; Workspace se lo presta al store mientras está montada. */
describe("guardado prestado al aviso de salida", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    registerSaver.mockReset(); saveSession.mockReset(); saveSession.mockResolvedValue({});
  });

  it("registra su guardado al montarse y lo retira al desmontarse", async () => {
    const { unmount } = montar();
    const fn = registerSaver.mock.calls.find((c) => typeof c[0] === "function")?.[0] as () => Promise<boolean>;
    expect(fn).toBeTypeOf("function");
    await expect(fn()).resolves.toBe(true);
    expect(saveSession).toHaveBeenCalledTimes(1);
    unmount();
    expect(registerSaver).toHaveBeenLastCalledWith(null);
  });

  it("si el guardado falla, devuelve false", async () => {
    saveSession.mockRejectedValue(new Error("caído"));
    montar();
    const fn = registerSaver.mock.calls.find((c) => typeof c[0] === "function")?.[0] as () => Promise<boolean>;
    let ok: boolean | undefined;
    await act(async () => { ok = await fn(); });
    expect(ok).toBe(false);
  });
});
