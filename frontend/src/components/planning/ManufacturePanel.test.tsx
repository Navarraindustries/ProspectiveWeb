/* Fabricación: la ficha que se manda al taller, y cuándo NO hay nada que mandar.

   Estas pruebas vivían en la suite de selección de clip porque la ficha estaba
   dentro de aquel panel. La ficha se mudó al paso «Fabricación» y las pruebas
   con ella: comprueban lo mismo, en el sitio donde ahora ocurre.

   Lo que fijan: que la especificación nombre la pieza real y no una etiqueta
   genérica, que declare lo que un taller todavía tiene que confirmar, que la
   copia del taller se anuncie como libre de datos de paciente, y que un clip de
   catálogo —que se compra, no se fabrica— no ofrezca un STL. */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clipSelection = vi.fn();
const clipManufacture = vi.fn();
const listClipOrders = vi.fn(async () => []);
const clipOrderPrefill = vi.fn(async () => ({ can_order: false, reason: "" }));

vi.mock("../../api/client", () => ({
  api: {
    clipSelection: (...a: unknown[]) => clipSelection(...a),
    clipManufacture: (...a: unknown[]) => clipManufacture(...a),
    listClipOrders: (...a: unknown[]) => listClipOrders(...(a as [])),
    clipOrderPrefill: (...a: unknown[]) => clipOrderPrefill(...(a as [])),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("../../store/planning", () => ({
  usePlanning: () => ({ sessionId: "s1", caseId: null }),
}));

import { ManufacturePanel } from "./ManufacturePanel";
import type { ClipSelectionResult, ManufactureSpecOut } from "../../api/types";

const spec: ManufactureSpecOut = {
  blade_length_mm: 27, blade_width_mm: 3.5, blade_height_mm: 3,
  spring_length_mm: 24, shape: "Angulado 90°", angle_deg: 90,
  closing_force_g: 155, fenestration_mm: 0, neck_mm: 20,
  label: "Angulado 90° de 27.0 mm · 155 g",
  reasons: ["Ninguna hoja del catálogo cubre este cuello con margen suficiente"],
  confidence_notes: ["La fuerza de cierre (155 g) es el centro de la ventana heurística"],
  stl_url: null,
  part_no: "PR-TEST-0001",
  source: "navarro",
  piece_label: "NAVARRO™ T3 Angulado 90°, mordaza 27.0 mm",
  commercial_name: "",
  fallback_reason: "",
  dossier_internal_url: null,
  dossier_workshop_url: null,
};


const result = (over: Partial<ClipSelectionResult> = {}): ClipSelectionResult => ({
  outcome: "manufacture",
  summary: "",
  case: {
    neck_mm: 20,
    required_jaw_mm: 30, required_jaw_source: "factor",
    required_jaw_detail: "Cuello de 20.0 mm × 1.5 = 30.0 mm al quedar aplastado entre las hojas.",
    dome_height_mm: 12, max_diameter_mm: 22, ar: 1.5, dnr: 2.1,
    parent_artery_mm: 3.2, neck_source: "rim", neck_tilt_deg: 0,
    region: "", laterality: "", aneurysm_type: "",
  },
  recommended: [],
  rejected: [],
  manufacture: null,
  custom_jaw: null,
  caveats: [],
  ...over,
});

const draw = () => render(<ManufacturePanel onNext={() => {}} />);

beforeEach(() => {
  clipSelection.mockReset();
  clipManufacture.mockReset();
});

describe("the step announces that it can be skipped", () => {
  it("says so before anything else", async () => {
    // Un paso nuevo entre dos obligatorios se lee como obligatorio si nadie
    // dice lo contrario, y una pieza a medida tarda semanas.
    clipSelection.mockResolvedValue(result({ manufacture: null }));
    draw();
    expect(await screen.findByText(/Paso opcional/)).toBeInTheDocument();
  });

  it("explains what to do when the case has no specification yet", async () => {
    clipSelection.mockResolvedValue(result({ manufacture: null }));
    draw();
    expect(await screen.findByText(/marca el cuello en Morfometría/i)).toBeInTheDocument();
  });
});

describe("the manufacturing package", () => {
  const spec2 = { ...spec, part_no: "PR-ABC-0270",
    dossier_internal_url: "/data/interno.pdf?v=1",
    dossier_workshop_url: "/data/taller.pdf?v=1" };

  it("offers both dossiers and says how they differ", async () => {
    // The workshop copy carries no patient data; that has to be visible, not a
    // property the user is expected to trust silently.
    clipSelection.mockResolvedValue(result({
      outcome: "manufacture", recommended: [], manufacture: spec2,
    }));
    draw();
    expect(await screen.findByRole("button", { name: /Copia interna/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Para el taller/ })).toBeInTheDocument();
    expect(screen.getByText(/no lleva ningún dato de paciente/)).toBeInTheDocument();
  });

  it("shows the traceability number", async () => {
    clipSelection.mockResolvedValue(result({
      outcome: "manufacture", recommended: [], manufacture: spec2,
    }));
    draw();
    expect(await screen.findByText("PR-ABC-0270")).toBeInTheDocument();
  });

  it("explains when the family cannot build the shape", async () => {
    // A catalogue clip is bought, not made: no STL, and the reason on screen.
    clipSelection.mockResolvedValue(result({
      outcome: "manufacture", recommended: [],
      manufacture: { ...spec2, source: "commercial", stl_url: null,
        commercial_name: "Yasargil Fenestrado 9mm",
        fallback_reason: "La familia NAVARRO™ no tiene todavía un diseño fenestrado." },
    }));
    draw();
    expect(await screen.findByText(/no tiene todavía un diseño fenestrado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descargar STL/ })).not.toBeInTheDocument();
  });

  it("offers the STL when the family does build it", async () => {
    clipSelection.mockResolvedValue(result({
      outcome: "manufacture", recommended: [],
      manufacture: { ...spec2, source: "navarro", stl_url: "/data/clip.stl?v=1" },
    }));
    draw();
    expect(await screen.findByRole("button", { name: /Descargar STL/ })).toBeInTheDocument();
  });
});


describe("the ideal clip is reachable whatever the outcome", () => {
  // Reported while testing: with a stock clip already fitting, the whole
  // manufacturing section was absent, so the STL and the dossiers could not be
  // reached at all. "What is on the shelf" and "what would fit best" are
  // different questions; the second has an answer either way.
  // As the selection endpoint returns it: the part number and the documents
  // only exist once the manufacturing package has actually been generated.
  const withSpec = { ...spec, part_no: "",
    piece_label: "NAVARRO™ T1 Recto, mordaza 8.5 mm" };

  it("offers it even when the inventory already serves", async () => {
    clipSelection.mockResolvedValue(result({ outcome: "stock", manufacture: withSpec }));
    draw();
    expect(await screen.findByText(/Clip ideal a medida/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generar STL y dossiers/ })).toBeInTheDocument();
  });

  it("says it is an option, not a recommendation to manufacture", async () => {
    clipSelection.mockResolvedValue(result({ outcome: "stock", manufacture: withSpec }));
    draw();
    expect(await screen.findByText(/Ya hay clips del inventario que cumplen/)).toBeInTheDocument();
  });

  it("reads as the only route when nothing fits", async () => {
    clipSelection.mockResolvedValue(result({
      outcome: "manufacture", recommended: [], manufacture: withSpec,
    }));
    draw();
    expect(await screen.findByText("Especificación de fabricación")).toBeInTheDocument();
  });
});
