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

vi.mock("../../api/client", () => ({
  api: {
    treatmentDecision: (...a: unknown[]) => treatmentDecision(...a),
    clearTreatmentDecision: (...a: unknown[]) => clearTreatmentDecision(...(a as [])),
  },
  ApiError: class ApiError extends Error {},
}));

let stored: unknown = null;
vi.mock("../../store/planning", () => ({
  usePlanning: () => ({
    sessionId: "s1",
    patient: null,
    treatment: stored,
    setTreatment: (t: unknown) => { stored = t; },
  }),
}));

import { TreatmentPanel } from "./TreatmentPanel";
import type { TreatmentDecisionResult } from "../../api/types";

const RESULT: TreatmentDecisionResult = {
  recommendation: "TRATAMIENTO ENDOVASCULAR", recommendation_key: "endo",
  confidence: "Moderada", coverage_pct: 100, missing_inputs: [], notes: [],
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
  treatmentDecision.mockReset();
  treatmentDecision.mockResolvedValue(RESULT);
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
    expect(screen.getByText("100 % del caso")).toBeInTheDocument();
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
    expect(screen.getByText(/RIESGO DE ROTURA/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ocultar procedencia/ }));
    expect(screen.queryByText(/Brinjikji/)).not.toBeInTheDocument();
  });

  it("marca el factor que no influye aunque la procedencia esté plegada", () => {
    // Sin la marca, un factor que no empuja se lee como si lo hiciera.
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.getByText("no influye")).toBeInTheDocument();
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

  it("no inventa un territorio cuando no hay localización", () => {
    stored = { ...RESULT, perforators: null };
    render(<TreatmentPanel onNext={() => {}} />);
    expect(screen.queryByText(/Perforantes que esperar/)).not.toBeInTheDocument();
  });
});
