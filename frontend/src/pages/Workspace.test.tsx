/* «Guardar progreso» tras «Reanudar» guarda sobre la sesión de origen (F1-108).

   Reanudar da a la sesión viva un id nuevo y cada guardado añadía otra fila casi
   igual a «Sesiones guardadas». El botón pide guardar sobre la de origen y dice
   qué guarda. El visor y los paneles de cada paso no pintan nada aquí: se
   sustituyen por cajas vacías para montar solo la barra superior. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { saveSession, markSaved, captureCase, registerSaver, estado, Nada } = vi.hoisted(() => ({
  saveSession: vi.fn(), markSaved: vi.fn(), captureCase: vi.fn(), registerSaver: vi.fn(),
  // Lo que cada prueba cambia del store: con paciente, sin estudio, con cambios…
  estado: {} as Record<string, unknown>,
  Nada: () => null,
}));
vi.mock("../api/client", () => ({ api: { saveSession: (...a: unknown[]) => saveSession(...a) } }));

vi.mock("../store/auth", () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock("../store/nav", () => ({ useNav: () => ({ go: vi.fn() }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));

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
vi.mock("../components/RecordButton", () => ({ RecordButton: () => <button type="button">Grabar</button> }));

import { Workspace } from "./Workspace";
import { MATRIZ_ALTOS, MATRIZ_ANCHOS, simularPantalla } from "../test/pantalla";
import { getCommands } from "../lib/commands";
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
    // El estado del guardado también es un `status`: se busca el de la captura.
    const aviso = await screen.findByText(/Captura descargada en la carpeta/);
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

  it("tocar el estado muestra «Cambios sin guardar»; guardar muestra la hora", async () => {
    estado.dirty = true;
    const { rerender } = montar();
    expect(screen.getByRole("status")).toHaveTextContent("Cambios sin guardar");
    // El botón dice siempre lo mismo y es el primario de la barra.
    const boton = screen.getByRole("button", { name: /Guardar progreso/ });
    expect(boton.textContent).toContain("Guardar progreso");
    expect(boton.getAttribute("data-variant")).toBe("default");
    fireEvent.click(boton);
    await waitFor(() => expect(markSaved).toHaveBeenCalled());
    // El store limpia `dirty` en markSaved: aquí se hace a mano.
    estado.dirty = false;
    rerender(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Guardado \d{2}:\d{2}$/));
    // Volver a tocar algo devuelve el aviso, sin esperar a ningún temporizador.
    estado.dirty = true;
    rerender(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cambios sin guardar");
  });

  it("sin cambios ni guardado en esta pantalla: «Sin guardar»", () => {
    montar();
    expect(screen.getByRole("status")).toHaveTextContent("Sin guardar");
    expect(screen.getByRole("button", { name: /Guardar progreso/ }).textContent).not.toContain("•");
  });

  it("si el guardado falla, el estado vuelve a «Cambios sin guardar» y sale el aviso rojo", async () => {
    estado.dirty = true;
    saveSession.mockRejectedValue(new Error("caído"));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Guardar progreso/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar el progreso");
    expect(screen.getByRole("status")).toHaveTextContent("Cambios sin guardar");
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

describe("pestaña de plegado del panel", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  });

  it("un clic en «Plegar el panel del paso (P)» oculta la columna", () => {
    montar();
    const col = document.querySelector("[data-panel-column]") as HTMLElement;
    expect(col.style.display).not.toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Plegar el panel del paso (P)" }));
    expect((document.querySelector("[data-panel-column]") as HTMLElement).style.display).toBe("none");
  });
});

describe("zona libre del visor", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  });
  const render_ = (paso: number) => render(
    <Workspace patient={null} initialStep={paso} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />,
  );

  it("en Detección deja 428 px a la derecha; en Decisión, 568", () => {
    const { unmount } = render_(2);
    expect((document.querySelector("[data-zona-libre]") as HTMLElement).style.right).toBe("428px");
    unmount();
    render_(4);
    expect((document.querySelector("[data-zona-libre]") as HTMLElement).style.right).toBe("568px");
  });

  it("aísla sus capas: los z-index internos del visor no compiten con avisos, hoja ni dock", () => {
    render_(2);
    expect((document.querySelector("[data-zona-libre]") as HTMLElement).style.isolation).toBe("isolate");
  });

  it("plegado el panel, el visor llega hasta la tira (36 px y sus márgenes)", () => {
    localStorage.setItem("ws.panelCollapsed", "1");
    render_(2);
    const z = document.querySelector("[data-zona-libre]") as HTMLElement;
    expect(z.style.right).toBe("84px");
    expect(z.style.top).toBe("72px");
  });
});

describe("avisos del pipeline como toasts", () => {
  it("el aviso global de App entra en el apilado y se cierra al pulsarlo", () => {
    const onClose = vi.fn();
    render(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}}
                      aviso={{ texto: "Restaurando sesión…", onClose }} />);
    fireEvent.click(screen.getByText("Restaurando sesión…"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("«Reintentar» del aviso global llama a retry y no cierra el aviso", () => {
    const onClose = vi.fn();
    const retry = vi.fn();
    render(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}}
                      aviso={{ texto: "No se pudo restaurar la sesión", retry, onClose }} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("error de guardado y aviso global se apilan sin taparse; cada uno se cierra solo", async () => {
    estado.dirty = true;
    saveSession.mockRejectedValue(new Error("caído"));
    const onClose = vi.fn();
    render(<Workspace patient={null} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}}
                      aviso={{ texto: "Restaurando sesión…", retry: () => {}, onClose }} />);
    fireEvent.click(screen.getByRole("button", { name: /Guardar progreso/ }));
    await screen.findByText(/No se pudo guardar el progreso: caído/);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    fireEvent.click(screen.getByText(/No se pudo guardar el progreso/));
    expect(screen.queryByText(/No se pudo guardar el progreso/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Restaurando sesión…")).toBeTruthy();
  });
});

describe("Registro de la sesión", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin persistencia */ }
  });

  it("va bajo «Anotaciones», plegado, con sesión", () => {
    montar();
    const titulos = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const a = titulos.findIndex((t) => t.includes("Anotaciones"));
    const r = titulos.findIndex((t) => t.includes("Registro"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(r).toBeGreaterThan(a);
    expect(screen.queryByText("Aún no ha pasado nada en esta sesión")).toBeNull();
  });

  it("sin sesión no aparece", () => {
    estado.sessionId = null;
    montar();
    expect(screen.queryByText("Registro")).toBeNull();
  });
});

describe("dock por tamaño de pantalla", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  const MODO: Record<number, string> = { 360: "mini", 390: "mini", 768: "tactil", 1024: "tactil", 1280: "compacto",
    1366: "completo", 1440: "completo", 1707: "completo", 1920: "completo", 2560: "completo" };
  it.each(MATRIZ_ANCHOS)("a %i px el dock va en su modo, a cualquier alto", (w) => {
    for (const h of MATRIZ_ALTOS) {
      simularPantalla(w, h);
      const { unmount } = montar();
      expect(screen.getByRole("navigation", { name: "Flujo de planificación" })).toHaveAttribute("data-modo", MODO[w]);
      unmount();
    }
  });
  /* La lectura de abajo a la izquierda sube lo que tapa el dock de esa pantalla. */
  const HOLGURA: Record<string, string> = { mini: "80px", tactil: "80px", compacto: "72px", completo: "96px" };
  it.each(MATRIZ_ANCHOS)("a %i px la holgura del dock sigue a su alto", (w) => {
    simularPantalla(w);
    montar();
    const z = document.querySelector("[data-zona-libre]") as HTMLElement;
    expect(z.style.getPropertyValue("--dock-holgura")).toBe(HOLGURA[MODO[w]]);
  });
});

describe("dock: hechos por resultado y aviso del paso 4", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin persistencia */ }
  });
  it("con serie, segmentación y un candidato, el dock marca hechos 2 y 3 desde el paso 1 y el 4 avisa", () => {
    estado.series = {};
    estado.segmentation = {};
    estado.candidates = [{ id: "cand-001", rank: 1 }];
    montar();
    expect(screen.getByRole("button", { name: /^Paso 2,/ })).toHaveAttribute("data-estado", "hecho");
    expect(screen.getByRole("button", { name: /^Paso 3,/ })).toHaveAttribute("data-estado", "hecho");
    expect(screen.getByRole("button", { name: /^Paso 4, Morfometría. Al abrirlo calcula/ })).toBeInTheDocument();
  });
});

describe("Mandos del pipeline en la paleta", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin persistencia */ }
  });
  const mios = () => getCommands().filter((c) => ["pasos", "acciones"].includes(c.group));

  it("los 8 pasos van en «pasos» y los bloqueados, deshabilitados", () => {
    estado.series = {};
    montar();
    const pasos = getCommands().filter((c) => c.group === "pasos");
    expect(pasos).toHaveLength(8);
    expect(pasos[0].label).toMatch(/^1 · /);
    const deteccion = pasos.find((c) => c.label === "3 · Detección");
    expect(deteccion?.disabled).toBe(true);
    expect(pasos.find((c) => c.label.startsWith("2 · "))?.disabled).toBe(false);
    expect(pasos.find((c) => c.label.startsWith("1 · "))?.disabled).toBe(false);
  });

  /* Táctil: sin tooltip, el paso bloqueado dice por qué en la propia paleta. */
  it("un paso bloqueado lleva su motivo de pista; uno libre con aviso, el aviso", () => {
    estado.series = {};
    montar();
    const pasos = getCommands().filter((c) => c.group === "pasos");
    expect(pasos.find((c) => c.label === "3 · Detección")?.hint).toBe("Segmenta el vaso primero");
    expect(pasos.find((c) => c.label.startsWith("4 · "))?.hint).toBe("Detecta un candidato primero");
    expect(pasos.find((c) => c.label.startsWith("2 · "))?.hint).toBeUndefined();
  });

  it("«Guardar progreso» se deshabilita sin sesión", () => {
    estado.sessionId = null;
    montar();
    expect(getCommands().find((c) => c.label === "Guardar progreso")?.disabled).toBe(true);
  });

  it("con sesión, «Guardar progreso» guarda y «Captura» sigue el botón", async () => {
    estado.captureCase = null;
    saveSession.mockReset().mockResolvedValue({});
    montar();
    const g = getCommands().find((c) => c.label === "Guardar progreso");
    expect(g?.group).toBe("acciones");
    expect(g?.disabled).toBeFalsy();
    expect(getCommands().find((c) => c.label === "Captura")?.disabled).toBe(true);
    act(() => g!.run());
    await waitFor(() => expect(saveSession).toHaveBeenCalledTimes(1));
  });

  it("el mando de plegar cambia de rótulo y hace lo de la tecla P", () => {
    montar();
    expect(getCommands().find((c) => c.label === "Plegar el panel del paso")).toBeTruthy();
    act(() => getCommands().find((c) => c.label === "Plegar el panel del paso")!.run());
    expect(getCommands().find((c) => c.label === "Mostrar el panel del paso")).toBeTruthy();
    expect(getCommands().find((c) => c.label === "Plegar el panel del paso")).toBeUndefined();
  });

  it("al desmontar no queda ningún mando del pipeline", () => {
    const { unmount } = montar();
    expect(mios().length).toBeGreaterThan(0);
    unmount();
    expect(mios()).toHaveLength(0);
  });
});

describe("barra del quirófano por tamaño de pantalla", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it.each(MATRIZ_ANCHOS)("a %i px la barra va en su modo y sus acciones", (w) => {
    simularPantalla(w);
    montar();
    const modo = w <= 640 ? "movil" : w <= 1024 ? "tactil" : "ancho";
    expect(document.querySelector("[data-banda-superior] [data-modo]")).toHaveAttribute("data-modo", modo);
    expect(!!screen.queryByRole("button", { name: /Grabar/ })).toBe(modo !== "movil");
    expect(!!screen.queryByRole("button", { name: "Más acciones" })).toBe(modo !== "ancho");
    if (modo !== "ancho") expect(screen.getByRole("button", { name: "Guardar progreso" }).style.height).toBe("var(--control-md)");
  });
  it("la paleta ofrece el tema y, sin estudio archivado, archivar", () => {
    estado.imagingStudyId = null;
    const { unmount } = render(<Workspace patient={PACIENTE} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    expect(getCommands().find((c) => c.label === "Cambiar a tema claro")?.group).toBe("acciones");
    expect(getCommands().find((c) => c.label === "Archivar en un caso")?.group).toBe("acciones");
    unmount();
    estado.imagingStudyId = 9;
    montar();
    expect(getCommands().find((c) => c.label === "Cambiar a tema claro")).toBeTruthy();
    expect(getCommands().find((c) => /Archivar|Adjuntar/.test(c.label))).toBeUndefined();
  });
});

describe("acciones de la píldora derecha a ≤ 1366 px", () => {
  const original = window.matchMedia;
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
    // Portátil: cumple la consulta de 1366, no la del modo estrecho.
    window.matchMedia = ((q: string) => ({
      matches: q === "(max-width: 1366px)", media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = original; });

  it("solo el icono: «Guardar progreso» conserva su nombre accesible y su title, sin texto visible", () => {
    estado.imagingStudyId = null;
    render(<Workspace patient={PACIENTE} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    // Nombre accesible = el texto del modo ancho; title = la explicación.
    for (const nombre of ["Guardar progreso", "Captura", "Archivar en un caso"]) {
      const b = screen.getByRole("button", { name: nombre });
      expect(b.textContent, nombre).toBe("");
      expect(b.getAttribute("title"), nombre).not.toBe(nombre);
      expect(b.getAttribute("title"), nombre).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Guardar progreso" }).getAttribute("title")).toMatch(/^Guarda el estudio/);
    // Captura conserva su explicación (aquí, sin visor o sin estudio archivado).
    expect(screen.getByRole("button", { name: "Captura" }).getAttribute("title")).toMatch(/visor|imagen/);
    // Sigue siendo el modo ancho: el inspector no baja a hoja.
    expect(screen.queryByRole("region", { name: "Panel del paso" })).toBeNull();
  });
});

describe("hoja inferior a ≤ 1280 px", () => {
  beforeEach(() => {
    for (const k of Object.keys(estado)) delete estado[k];
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
    simularPantalla(1100); // L5: estrecho, sin táctil
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const montar_ = () => render(
    <Workspace patient={null} initialStep={2} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />,
  );
  const hoja = () => screen.getByRole("region", { name: "Panel del paso" });
  const dock = () => screen.getByRole("navigation", { name: "Flujo de planificación" });
  const pulsarP = () => fireEvent.keyDown(window, { key: "p", code: "KeyP" });

  it("arranca a media altura, sin escribir la preferencia de plegado y sin plegar", () => {
    montar_();
    expect(hoja().style.height).toBe("50%");
    expect(localStorage.getItem("ws.panelCollapsed")).toBeNull();
    expect((document.querySelector("[data-panel-collapsed]") as HTMLElement).dataset.panelCollapsed).toBe("false");
    expect((document.querySelector("[data-zona-libre]") as HTMLElement).style.bottom).toBe("96px");
  });

  it("P alterna asomar ↔ media y Esc en completa vuelve a asomar", () => {
    montar_();
    pulsarP();
    expect(hoja().style.height).toBe("96px");
    pulsarP();
    expect(hoja().style.height).toBe("50%");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar la altura del panel" })); // completa
    expect(hoja().style.height).toBe("calc(100% - 72px)");
    fireEvent.keyDown(screen.getByRole("button", { name: "Cambiar la altura del panel" }), { key: "Escape" });
    expect(hoja().style.height).toBe("96px");
  });

  it("P desde «completa» baja a «asomar»", () => {
    montar_();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar la altura del panel" })); // completa
    expect(hoja().style.height).toBe("calc(100% - 72px)");
    pulsarP();
    expect(hoja().style.height).toBe("96px");
  });

  it("un Esc con el foco en la hoja la baja y para el cine, pero no cancela el marcado", () => {
    const setPickMode = vi.fn();
    estado.setPickMode = setPickMode;
    montar_();
    const alCine = vi.fn();
    const oyente = (e: Event) => { if ((e as CustomEvent).detail === "escape") alCine(); };
    window.addEventListener("viewer:shortcut", oyente);
    try {
      screen.getByRole("button", { name: "Cambiar la altura del panel" }).focus();
      fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
      expect(hoja().style.height).toBe("96px");
      expect(alCine).toHaveBeenCalledTimes(1);
      expect(setPickMode).not.toHaveBeenCalled();
      // Ya asomada, el siguiente Esc sí cancela el marcado.
      fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
      expect(setPickMode).toHaveBeenCalledWith(null);
    } finally { window.removeEventListener("viewer:shortcut", oyente); }
  });

  it("a «completa» el dock no se muestra; los atajos de paso siguen", () => {
    estado.series = {};
    montar_();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar la altura del panel" })); // completa
    expect(hoja().style.height).toBe("calc(100% - 72px)");
    expect(screen.queryByRole("navigation", { name: "Flujo de planificación" })).toBeNull();
    // El 2 salta a Segmentación aunque el dock no esté.
    fireEvent.keyDown(window, { key: "2", code: "Digit2" });
    expect(hoja().textContent).toContain("PASO 2 · SEGMENTACIÓN");
    pulsarP(); // asomar
    expect(dock()).toBeTruthy();
  });

  it("el dock compacto sube con la hoja y queda sobre ella, igual que la banda de avisos", () => {
    montar_();
    expect(dock().style.bottom).toBe("calc(50% + 12px)");
    pulsarP();
    expect(dock().style.bottom).toBe("108px");
    const zHoja = Number(hoja().style.zIndex);
    expect(Number(dock().style.zIndex)).toBeGreaterThan(zHoja);
    expect(Number((document.querySelector("[data-banda-superior]") as HTMLElement).style.zIndex)).toBeGreaterThan(zHoja);
  });

  it("una nota que espera el foco levanta la hoja asomada a media", () => {
    const { rerender } = montar_();
    pulsarP();
    expect(hoja().style.height).toBe("96px");
    estado.noteFocusRequest = "marcador-1";
    rerender(<Workspace patient={null} initialStep={2} onBack={() => {}} onOpenPatient={() => {}} onFinish={() => {}} />);
    expect(hoja().style.height).toBe("50%");
    expect(localStorage.getItem("ws.panelCollapsed")).toBeNull();
  });
});
