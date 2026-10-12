/* El panel de decisión: qué se lee de un vistazo y qué se pide aparte.

   Dos cosas que se vieron mal en la aplicación real, a 265 px de ancho:

   1. El titular compartía un flex con dos insignias que no encogen, y con
      `overflow-wrap: anywhere` se quedaba sin ancho y envolvía por LETRAS —
      «TRAT / AMIE / NTO / ENDO / VASC / ULAR». Ahora manda en su propia línea.
   2. Cada factor arrastraba su procedencia completa debajo. Con siete factores
      eran siete párrafos tapando lo que se lee a diario, así que la procedencia
      se pliega: sigue estando, ya no grita. */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const treatmentDecision = vi.fn();
const clearTreatmentDecision = vi.fn(async () => {});
const clearTreatment = vi.fn(async () => {});
const NO_TEAM = { team_decision: null, decided_by: "", other_text: "" };
const setTeamDecision = vi.fn(async (_sid: string, t: unknown) => t);
const getTeamDecision = vi.fn(async (_sid: string): Promise<unknown> => NO_TEAM);

vi.mock("../../api/client", () => ({
  api: {
    treatmentDecision: (...a: unknown[]) => treatmentDecision(...a),
    clearTreatmentDecision: (...a: unknown[]) => clearTreatmentDecision(...(a as [])),
    clearTreatment: (...a: unknown[]) => clearTreatment(...(a as [])),
    setTeamDecision: (sid: string, t: unknown) => setTeamDecision(sid, t),
    getTeamDecision: (sid: string) => getTeamDecision(sid),
  },
  ApiError: class ApiError extends Error {},
}));

let stored: unknown = null;
let site: string | null = null;
let morpho: unknown = { max_diameter_mm: 7 };
vi.mock("../../store/planning", () => ({
  usePlanning: () => ({
    sessionId: "s1",
    patient: null,
    treatment: stored,
    setTreatment: (t: unknown) => { stored = t; },
    setTreatmentInputs: () => {},
    aneurysmSite: site,
    morphometry: morpho,
  }),
}));

import { TreatmentPanel } from "./TreatmentPanel";
import type { TreatmentDecisionResult } from "../../api/types";

const RESULT: TreatmentDecisionResult = {
  recommendation: "TRATAMIENTO ENDOVASCULAR", recommendation_key: "endo",
  confidence: "Moderada", confidence_reason: "", coverage_pct: 100, missing_inputs: [], notes: [],
  endovascular: null,
  jsdb: null,
  perforators: {
    arteries: "Talamoperforantes posteriores",
    supplies: "tálamo y mesencéfalo",
    consequence: "infarto talámico, coma, muerte",
    surgical_note: "Pueden nacer directamente del ápex.",
    sources: ["Acta Neurochir 2025"],
  },
  factors: [
    {
      name: "Cuello intermedio (4.1 mm, 4–5 mm)",
      detail: "Cuello borderline: posible stent-assisted coiling o clipping.",
      direction: "endo", votes: true,
      source: "Umbral: cuello ≥ 4 mm, definición estándar de cuello ancho (Brinjikji, AJNR 2009). Peso: heurístico.",
    },
    {
      name: "Aspect Ratio bajo (AR = 1.16 < 1.3)",
      detail: "AR < 1.3: saco corto y ancho — acceso quirúrgico favorable.",
      direction: "clip", votes: false,
      source: "Ya no vota: índice de RIESGO DE ROTURA, sin validación para elegir modalidad.",
    },
  ],
  clip_factors: [], endo_factors: [],
};

/** Una vía del JSDB tal como llega ahora: sus variables, sin puntos. */
const ARM = (arm: "clip" | "coil", labels: string[]) => ({
  arm, label: arm === "clip" ? "Clipaje quirúrgico" : "Tratamiento endovascular",
  items: labels.map((label) => ({ label, detail: "" })),
  missing: [],
});

beforeEach(() => {
  stored = RESULT;
  site = null;
  morpho = { max_diameter_mm: 7 };
  treatmentDecision.mockReset();
  treatmentDecision.mockResolvedValue(RESULT);
  clearTreatment.mockClear();
  setTeamDecision.mockClear();
  getTeamDecision.mockReset();
  getTeamDecision.mockResolvedValue(NO_TEAM);
});

describe("cómo se lee la recomendación", () => {
  it("mantiene el titular en una sola cadena, sin partirlo", () => {
    // Si vuelve a repartirse entre nodos por el envoltorio, esto falla.
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Recomendación: TRATAMIENTO ENDOVASCULAR/))
      .toBeInTheDocument();
  });

  it("enseña la cobertura junto a la confianza", () => {
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText("100 % de los datos")).toBeInTheDocument();
    expect(screen.getByText(/Confianza moderada/)).toBeInTheDocument();
  });
});

describe("la procedencia de cada factor", () => {
  it("no aparece hasta que se pide", () => {
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Cuello intermedio/)).toBeInTheDocument();
    expect(screen.queryByText(/Brinjikji/)).not.toBeInTheDocument();
  });

  it("se despliega entera y se vuelve a plegar", () => {
    render(<TreatmentPanel onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver procedencia/ }));
    expect(screen.getByText(/Brinjikji/)).toBeInTheDocument();
    // El factor descriptivo está en su grupo plegado (F1-178).
    fireEvent.click(screen.getByRole("button", { name: /Descriptivos \(no influyen\)/ }));
    expect(screen.getByText(/RIESGO DE ROTURA/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ocultar procedencia/ }));
    expect(screen.queryByText(/Brinjikji/)).not.toBeInTheDocument();
  });

  it("marca el factor que no influye aunque la procedencia esté plegada", () => {
    // Sin la marca, un factor que no empuja se lee como si lo hiciera. F1-178:
    // la marca es ahora el título del grupo, a la vista aunque esté plegado.
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByRole("button", { name: /Descriptivos \(no influyen\)/ })).toBeInTheDocument();
  });

  /* Lo que dirección pidió retirar: ni el sumatorio del motor ni los puntos
     del JSDB. Un «CLIP 72 %» se lee como una probabilidad, y es el cociente de
     dos sumas con pesos elegidos a mano; un «4 / 7» se lee como el doble de
     riesgo que un «2 / 7», y el modelo no dice eso — sus autores no publican
     bandas. La recomendación y los factores se quedan; las cifras, no. */
  it("no queda ningún puntaje en pantalla", () => {
    stored = {
      ...RESULT,
      jsdb: {
        clip: ARM("clip", ["Edad ≥ 72 años (75)"]),
        coil: ARM("coil", ["WFNS V", "Fisher 4"]),
        favours: "clip", both_poor: false, known_pct: 100, missing: [],
        verdict: "Clipaje quirúrgico sale menos penalizado.",
        source: "",
      },
    };
    const { container } = render(<TreatmentPanel onNext={() => {}} />);
    const texto = container.textContent ?? "";
    expect(texto).not.toMatch(/ pts/);
    expect(texto).not.toMatch(/\d+\s*\/\s*7/);
    expect(texto).not.toMatch(/\+\d/);
    // Y lo que SÍ tiene que seguir ahí.
    expect(screen.getByText(/Recomendación: TRATAMIENTO ENDOVASCULAR/)).toBeInTheDocument();
    expect(screen.getByText(/Cuello intermedio/)).toBeInTheDocument();
    expect(screen.getByText(/menos penalizado/)).toBeInTheDocument();
  });
});

describe("el modelo ajustado, junto a la recomendación", () => {

  it("no aparece en un aneurisma no roto", () => {
    // Su cohorte entera es hemorragia: sobre un incidental no dice nada, y dos
    // ceros habrían dicho «las dos vías salen impecables».
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.queryByText(/Riesgo estimado por cada vía/)).not.toBeInTheDocument();
  });

  it("describe las dos vías por separado, no una resta", () => {
    stored = {
      ...RESULT,
      jsdb: {
        clip: ARM("clip", ["Edad ≥ 72 años (75)"]),
        coil: ARM("coil", ["WFNS V", "Fisher 4"]),
        favours: "clip", both_poor: false, known_pct: 100, missing: [],
        verdict: "Clipaje quirúrgico sale menos penalizado.",
        source: "Japan Stroke Data Bank — Neurol Med Chir 2021;61(2).",
      },
    };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Riesgo estimado por cada vía/)).toBeInTheDocument();
    // Lo que penaliza a cada vía, que es lo que el modelo sostiene sin cifras.
    expect(screen.getByText(/Edad ≥ 72 años/)).toBeInTheDocument();
    expect(screen.getByText(/WFNS V · Fisher 4/)).toBeInTheDocument();
    expect(screen.getByText(/menos penalizado/)).toBeInTheDocument();
  });

  it("puede decir que las DOS vías van mal, que es lo que el saldo no puede", () => {
    stored = {
      ...RESULT,
      jsdb: {
        clip: ARM("clip", ["WFNS V"]), coil: ARM("coil", ["WFNS V"]),
        favours: "tie", both_poor: true, known_pct: 100, missing: [],
        verdict: "Las DOS vías salen penalizadas: el modelo no está diciendo cuál es mejor.",
        source: "",
      },
    };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Las DOS vías salen penalizadas/)).toBeInTheDocument();
  });

  it("declara qué parte del modelo no ha podido rellenar", () => {
    stored = {
      ...RESULT,
      jsdb: {
        clip: ARM("clip", []), coil: ARM("coil", []),
        favours: "tie", both_poor: false, known_pct: 33,
        missing: ["grado WFNS", "ictus previo"],
        verdict: "Las dos vías salen igual de penalizadas.", source: "",
      },
    };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Rellenado el 33 % del modelo/)).toBeInTheDocument();
    expect(screen.getByText(/no es una\s+variable en cero/)).toBeInTheDocument();
  });
});

describe("las perforantes que la imagen no ve", () => {
  it("dice qué esperar por la localización", () => {
    // Una perforante mide 0,1–0,5 mm y el vóxel de una angio-TC ronda 0,5–1,0:
    // no llega a la malla. Callar aquí dejaría un informe de punta de basilar
    // sin lo único que en esa localización importa.
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Talamoperforantes posteriores/)).toBeInTheDocument();
    expect(screen.getByText(/infarto talámico, coma, muerte/)).toBeInTheDocument();
  });

  it("no lo presenta como una medida de este paciente", () => {
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/No es una medida de este paciente/)).toBeInTheDocument();
    expect(screen.getByText(/no resuelve un vaso de/)).toBeInTheDocument();
  });

  /* F1-181: el tronco salía con la tarjeta de la punta. */
  it("el tronco basilar tiene su tarjeta, sin talamoperforantes", () => {
    site = "Tronco basilar";
    stored = { ...RESULT, perforators: {
      arteries: "Perforantes pontinas paramedianas y circunferenciales cortas, desde la cara posterior y lateral del tronco",
      supplies: "Protuberancia (base y tegmento)",
      consequence: "Infarto pontino: paresia bilateral, afectación de pares craneales, locked-in en los extensos",
      surgical_note: "", sources: [], notice: "",
    } };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(/Perforantes pontinas paramedianas/)).toBeInTheDocument();
    expect(screen.queryByText(/alamoperforantes/)).not.toBeInTheDocument();
  });

  it("con la localización antigua avisa antes de la tarjeta", () => {
    site = "Basilar (punta, tronco o AICA)";
    stored = { ...RESULT, perforators: { ...RESULT.perforators!,
      notice: "Localización sin precisar: elige punta o tronco para la tarjeta exacta" } };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText("Localización sin precisar: elige punta o tronco para la tarjeta exacta"))
      .toBeInTheDocument();
    // Y la localización heredada no se enseña como si fuera precisa.
    expect(screen.getByText("Basilar (sin precisar: elige punta, tronco o AICA)")).toBeInTheDocument();
  });

  it("no inventa un territorio cuando no hay localización", () => {
    stored = { ...RESULT, perforators: null };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.queryByText(/Perforantes que esperar/)).not.toBeInTheDocument();
  });
});

/* F1-173 / F1-165: Decisión tenía su propio «Localización», que arrancaba en
   «Desconocida» aunque PHASES ya la tuviera. Ahora la hereda de Morfometría. */
describe("la localización de Decisión", () => {
  it("arranca con la localización de Morfometría y la manda", async () => {
    site = "ACM — Arteria Cerebral Media";
    stored = null;
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.queryByLabelText("Localización")).not.toBeInTheDocument();
    expect(screen.getByText("ACM — Arteria Cerebral Media")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Evaluar CLIP vs ENDOVASCULAR"));
    expect(treatmentDecision).toHaveBeenCalledWith(
      expect.objectContaining({ location: "ACM — Arteria Cerebral Media" }));
  });

  it("sin elegir, dice «Desconocida» y lleva a Morfometría", () => {
    const irA = vi.fn();
    stored = null;
    render(<TreatmentPanel onNext={() => {}} onChangeSite={irA} />);
    expect(screen.getByText("Desconocida / No especificada")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cambiar en Morfometría"));
    expect(irA).toHaveBeenCalled();
  });
});

/* F1-18: «Limpiar decisión y PHASES» borraba la recomendación al primer clic. */
describe("«Limpiar decisión y PHASES»", () => {
  it("abre la confirmación y no borra hasta confirmar", async () => {
    render(<TreatmentPanel onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar decisión y PHASES" }));
    expect(screen.getByRole("alertdialog", { name: "¿Limpiar la decisión y PHASES?" })).toBeInTheDocument();
    expect(clearTreatment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await vi.waitFor(() => expect(clearTreatment).toHaveBeenCalledWith("s1"));
  });
});

/* F1-176: la pantalla solo tenía la recomendación del algoritmo. El equipo
   registra aquí lo que decide, y eso es lo que va primero en el informe. */
describe("«Decisión del equipo»", () => {
  const select = () => screen.getByLabelText("Decisión del equipo") as HTMLSelectElement;

  it("ofrece clipaje, endovascular, vigilar u otra y lo guarda al elegir", async () => {
    render(<TreatmentPanel onNext={() => {}} />);
    expect(Array.from(select().options).map((o) => o.text))
      .toEqual(["Sin registrar", "Clipaje", "Endovascular", "Vigilar", "Otra"]);
    fireEvent.change(select(), { target: { value: "clipaje" } });
    await vi.waitFor(() => expect(setTeamDecision).toHaveBeenCalledWith(
      "s1", { team_decision: "clipaje", decided_by: "", other_text: "" }));
  });

  it("«Quién decide» no se rellena con el usuario conectado y se guarda al salir", async () => {
    render(<TreatmentPanel onNext={() => {}} />);
    const quien = screen.getByLabelText("Quién decide") as HTMLInputElement;
    expect(quien.value).toBe("");
    expect(quien.placeholder).toBe("Nombre o comité");
    fireEvent.change(select(), { target: { value: "endovascular" } });
    fireEvent.change(quien, { target: { value: "Comité neurovascular" } });
    fireEvent.blur(quien);
    await vi.waitFor(() => expect(setTeamDecision).toHaveBeenLastCalledWith(
      "s1", { team_decision: "endovascular", decided_by: "Comité neurovascular", other_text: "" }));
  });

  it("«Otra» pide qué", async () => {
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.queryByLabelText("Cuál")).not.toBeInTheDocument();
    fireEvent.change(select(), { target: { value: "otra" } });
    const cual = screen.getByLabelText("Cuál");
    fireEvent.change(cual, { target: { value: "Bypass y trapping" } });
    fireEvent.blur(cual);
    await vi.waitFor(() => expect(setTeamDecision).toHaveBeenLastCalledWith(
      "s1", { team_decision: "otra", decided_by: "", other_text: "Bypass y trapping" }));
  });

  it("se puede registrar sin recomendación del algoritmo", async () => {
    stored = null;
    render(<TreatmentPanel onNext={() => {}} />);
    fireEvent.change(select(), { target: { value: "vigilar" } });
    await vi.waitFor(() => expect(setTeamDecision).toHaveBeenCalled());
  });

  it("vuelve la guardada: la de la recomendación o, sin ella, la del servidor", async () => {
    stored = { ...RESULT, team: { team_decision: "clipaje", decided_by: "Comité", other_text: "" } };
    const { unmount } = render(<TreatmentPanel onNext={() => {}} />);
    expect(select().value).toBe("clipaje");
    expect((screen.getByLabelText("Quién decide") as HTMLInputElement).value).toBe("Comité");
    unmount();

    stored = null;
    getTeamDecision.mockResolvedValue({ team_decision: "vigilar", decided_by: "Dr. Gil", other_text: "" });
    render(<TreatmentPanel onNext={() => {}} />);
    await vi.waitFor(() => expect(select().value).toBe("vigilar"));
    expect((screen.getByLabelText("Quién decide") as HTMLInputElement).value).toBe("Dr. Gil");
  });
});

/* F1-183: «Planificar dispositivos» se apagaba sin recomendación, aunque el
   carril deja entrar en Dispositivos con la morfometría; y apagado no decía
   por qué. Ahora sigue la regla del carril y se rotula según el glosario. */
describe("«Continuar a dispositivos»", () => {
  const boton = () => screen.getByRole("button", { name: /Continuar a dispositivos/ });

  it("con morfometría está encendido aunque no haya recomendación", () => {
    stored = null;
    render(<TreatmentPanel onNext={() => {}} />);
    expect(boton()).not.toBeDisabled();
    expect(screen.queryByText("Calcula la morfometría primero")).toBeNull();
  });

  it("sin morfometría está apagado con el motivo del carril", () => {
    morpho = null;
    render(<TreatmentPanel onNext={() => {}} />);
    expect(boton()).toBeDisabled();
    expect(screen.getByText("Calcula la morfometría primero")).toBeInTheDocument();
  });
});


/* ── Arreglos F1a, tarea 19: paso 5 ───────────────────────────────────── */

describe("F1-172: la entradilla", () => {
  it("entradilla nueva", () => {
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText(
      "Propone una vía, clipaje o endovascular, a partir de la localización, el estado y la morfometría. La decisión es tuya",
    )).toBeInTheDocument();
    expect(screen.queryByText(/Los índices de forma no puntúan/)).toBeNull();
  });
});

describe("F1-175: el JSDB, veredicto arriba y WFNS antes de evaluar", () => {
  const AVISO = "Sin WFNS el modelo del Japan Stroke Data Bank pierde su variable de más peso: rellénalo antes de evaluar";

  it("roto sin WFNS muestra el aviso antes de evaluar", () => {
    stored = null;
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.queryByText(AVISO)).toBeNull();
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "si" } });
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Evaluar CLIP vs ENDOVASCULAR/ })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("WFNS"), { target: { value: "2" } });
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("el veredicto va arriba de la tarjeta, antes de las vías", () => {
    stored = {
      ...RESULT,
      jsdb: {
        clip: ARM("clip", ["Edad ≥ 72 años (75)"]), coil: ARM("coil", ["WFNS V"]),
        favours: "clip", both_poor: false, known_pct: 100, missing: [],
        verdict: "Clipaje quirúrgico sale menos penalizado.", source: "",
      },
    };
    render(<TreatmentPanel onNext={() => {}} />);
    const veredicto = screen.getByText("Clipaje quirúrgico sale menos penalizado.");
    const via = screen.getByText("Clipaje quirúrgico");
    expect(veredicto.compareDocumentPosition(via) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(veredicto).toHaveStyle({ fontWeight: "700" });
  });
});

describe("F1-177: la confianza baja dice por qué", () => {
  it("la confianza baja lleva el motivo", () => {
    stored = { ...RESULT, confidence: "Baja", confidence_reason: "los factores empujan en sentidos opuestos" };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText("Confianza baja: los factores empujan en sentidos opuestos")).toBeInTheDocument();
    expect(screen.getByText("100 % de los datos")).toHaveAttribute(
      "title", "Parte de los datos del caso que este motor ha podido evaluar");
  });
});

describe("F1-178: los factores que votan, primero", () => {
  it("un factor «no influye» no lleva insignia", () => {
    render(<TreatmentPanel onNext={() => {}} />);
    // El que vota lleva su vía; el descriptivo está plegado y sin insignia.
    expect(screen.getByText("ENDO")).toBeInTheDocument();
    expect(screen.queryByText(/Aspect Ratio bajo/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Descriptivos \(no influyen\)/ }));
    expect(screen.getByText(/Aspect Ratio bajo/)).toBeInTheDocument();
    expect(screen.queryByText("CLIP")).toBeNull();
    expect(screen.queryByText(/CLIP ·|ENDO ·|— ·/)).toBeNull();
    expect(screen.queryByText("no influye")).toBeNull();
  });

  it("los que votan van antes aunque lleguen después", () => {
    stored = { ...RESULT, factors: [...RESULT.factors].reverse() };
    render(<TreatmentPanel onNext={() => {}} />);
    const vota = screen.getByText(/Cuello intermedio/);
    const grupo = screen.getByRole("button", { name: /Descriptivos \(no influyen\)/ });
    expect(vota.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
