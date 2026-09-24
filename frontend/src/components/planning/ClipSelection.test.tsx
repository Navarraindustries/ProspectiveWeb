/* The clip panel's job is to be defensible: every clip it offers has to show
   the measurement behind each verdict, and every clip it withholds has to say
   why. A ranked list of names and scores — which is what this replaced — is not
   something a surgeon can check. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clipSelection = vi.fn();
const clipManufacture = vi.fn();

const buildNavarroClip = vi.fn();

const listClipOrders = vi.fn(async () => []);
const clipOrderPrefill = vi.fn(async () => ({ can_order: false, reason: "" }));

vi.mock("../../api/client", () => ({
  api: {
    clipSelection: (...a: unknown[]) => clipSelection(...a),
    clipManufacture: (...a: unknown[]) => clipManufacture(...a),
    buildNavarroClip: (...a: unknown[]) => buildNavarroClip(...a),
    listClipOrders: (...a: unknown[]) => listClipOrders(...(a as [])),
    clipOrderPrefill: (...a: unknown[]) => clipOrderPrefill(...(a as [])),
  },
  ApiError: class ApiError extends Error {},
}));

import { ClipSelectionPanel } from "./ClipSelection";
import type {
  ClipCandidateOut,
  ClipSelectionResult,
  CustomJawOut,
  ManufactureSpecOut,
} from "../../api/types";

const candidate = (over: Partial<ClipCandidateOut> = {}): ClipCandidateOut => ({
  clip_id: "yasargil-recto-9mm",
  clip_name: "Yasargil Recto 9mm",
  manufacturer: "Yasargil/KS",
  shape: "Recto",
  blade_length_mm: 9,
  closing_force_g: 110,
  score: 88.4,
  verdict: "ok",
  headline: "Cumple todos los criterios",
  coverage_ratio: 1.5,
  safety_margin_mm: 3,
  availability: "stock",
  bend_angle_deg: 0,
  closing_force_min_g: 110,
  closing_force_max_g: 110,
  force_provisional: false,
  criteria: [
    { key: "coverage", label: "Cobertura", verdict: "ok", detail: "Cubre el cuello con 3.0 mm de margen (×1.50)" },
    { key: "force", label: "Fuerza de cierre", verdict: "ok", detail: "110 g dentro de la ventana 100–150 g" },
  ],
  fit: null,
  ...over,
});

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
  outcome: "stock",
  summary: "1 clip del inventario cumple todos los criterios para un cuello de 6.0 mm.",
  case: {
    neck_mm: 6,
    // Un cuello de 6 mm mide 9 al quedar aplastado: eso es lo que la hoja
    // tiene que cerrar, y es lo que el panel enseña.
    required_jaw_mm: 9, required_jaw_source: "factor",
    required_jaw_detail: "Cuello de 6.0 mm × 1.5 = 9.0 mm al quedar aplastado entre las hojas.",
    dome_height_mm: 8, max_diameter_mm: 11, ar: 1.33, dnr: 1.8,
    parent_artery_mm: 3.2, neck_source: "rim", neck_tilt_deg: 4,
    region: "ACM izquierda", laterality: "izquierda", aneurysm_type: "sacular",
  },
  recommended: [candidate()],
  rejected: [],
  manufacture: null,
  custom_jaw: null,
  caveats: ["Las preferencias clínicas son heurísticas de la literatura."],
  ...over,
});

beforeEach(() => {
  clipSelection.mockReset();
  clipManufacture.mockReset();
});

describe("showing the reasoning, not a score", () => {
  it("shows each criterion with the measurement behind it", async () => {
    clipSelection.mockResolvedValue(result());
    render(<ClipSelectionPanel sessionId="s1" />);

    expect(await screen.findByText("Yasargil Recto 9mm")).toBeInTheDocument();
    // The number, not just the word "Cobertura".
    expect(screen.getByText(/3\.0 mm de margen/)).toBeInTheDocument();
    expect(screen.getByText(/ventana 100–150 g/)).toBeInTheDocument();
  });

  it("leads with the verdict so it is read before the list", async () => {
    clipSelection.mockResolvedValue(result());
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("Hay clip en inventario")).toBeInTheDocument();
  });

  it("reports how many approach angles clear the neighbouring vessels", async () => {
    // A clip clean at one angle out of six is usable but demands precision;
    // reporting only "no collision" hid that entirely.
    clipSelection.mockResolvedValue(result({
      recommended: [candidate({
        fit: {
          collision: false, n_contacts: 0, span_mm: 7.2, neck_coverage_pct: 100,
          clean_rolls: 1, n_rolls: 6, note: "Solo libra los vasos vecinos en 1 de 6 orientaciones",
        },
      })],
    }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("1/6")).toBeInTheDocument();
  });
});

describe("when nothing in the inventory fits", () => {
  it("says the inventory does not serve, and points to where the piece is ordered", async () => {
    // La ficha de fabricación se mudó al paso «Fabricación»; aquí solo queda el
    // veredicto y el puntero, para que nadie la busque en esta pantalla.
    clipSelection.mockResolvedValue(result({
      outcome: "manufacture",
      summary: "Ningún clip del inventario sirve para un cuello de 20.0 mm.",
      recommended: [],
      manufacture: spec,
    }));
    render(<ClipSelectionPanel sessionId="s1" />);

    expect(await screen.findByText("Requiere fabricación")).toBeInTheDocument();
    expect(screen.getByText(/paso/)).toBeInTheDocument();
    expect(screen.getByText("Fabricación")).toBeInTheDocument();
  });

  it("names the piece that would be ordered", async () => {
    clipSelection.mockResolvedValue(result({
      outcome: "marginal",
      recommended: [candidate({ verdict: "warn" })],
      manufacture: spec,
    }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("Utilizable con reservas")).toBeInTheDocument();
    expect(screen.getByText(spec.label)).toBeInTheDocument();
  });
});

describe("accountability for what was withheld", () => {
  it("lists the rejected clips with their reason", async () => {
    clipSelection.mockResolvedValue(result({
      rejected: [candidate({
        clip_id: "mini", clip_name: "Yasargil Mini recto", verdict: "fail", score: 0,
        headline: "Hoja de 5 mm insuficiente para un cuello de 6.0 mm",
        criteria: [{
          key: "coverage", label: "Cobertura", verdict: "fail",
          detail: "Hoja de 5 mm insuficiente para un cuello de 6.0 mm (hacen falta ≥ 7.0 mm)",
        }],
      })],
    }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText(/Por qué se descartaron otros/)).toBeInTheDocument();
  });

  it("surfaces what limits the recommendation", async () => {
    clipSelection.mockResolvedValue(result());
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText(/Qué limita esta recomendación/)).toBeInTheDocument();
  });

  it("opens the limitations by default when there is no measured neck", async () => {
    // With no neck there is nothing else on screen worth reading first.
    clipSelection.mockResolvedValue(result({
      outcome: "unmeasured",
      summary: "No hay una medida de cuello fiable.",
      recommended: [], caveats: ["Sin cuello medido no se puede recomendar un clip."],
    }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("Falta medir el cuello")).toBeInTheDocument();
    expect(screen.getByText(/Sin cuello medido/)).toBeInTheDocument();
  });
});

describe("failures", () => {
  it("reports an error instead of rendering an empty panel", async () => {
    clipSelection.mockRejectedValue(new Error("backend caído"));
    render(<ClipSelectionPanel sessionId="s1" />);
    await waitFor(() => expect(screen.getByText(/backend caído/)).toBeInTheDocument());
  });
});


describe("made-to-order designs", () => {
  const navarro = candidate({
    clip_id: "navarro-t1-16", clip_name: "NAVARRO™ T1 Recto 16.0 mm",
    manufacturer: "NAVARRO™ (UNINAVARRA)", blade_length_mm: 16,
    availability: "made_to_order",
    closing_force_min_g: 120, closing_force_max_g: 200, force_provisional: true,
  });

  it("marks a clip that has to be manufactured for the case", async () => {
    // Not worse than stock — but it is not on a shelf, and the plan needs to
    // account for the lead time.
    clipSelection.mockResolvedValue(result({ recommended: [navarro] }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findAllByText("bajo pedido")).not.toHaveLength(0);
  });

  it("shows the force as a band, never as a midpoint", async () => {
    clipSelection.mockResolvedValue(result({ recommended: [navarro] }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText(/120–200 g/)).toBeInTheDocument();
    expect(screen.queryByText(/160 g/)).not.toBeInTheDocument();
    expect(screen.getByText(/sin caracterizar/)).toBeInTheDocument();
  });
});

describe("sizing a made-to-order clip", () => {
  const custom: CustomJawOut = {
    clip_id: "",
    series: "T1", shape: "straight", angle_deg: 0, window_mm: 0, resizable: true,
    jaw_mm: 27, nearest_drawn_mm: 22,
    label: "NAVARRO™ T1 Recto, mordaza 27.0 mm",
    reason: "Un cuello de 20.0 mm pide 27.0 mm de mordaza, fuera de las tallas dibujadas (7–22 mm).",
    mesh_url: null, stl_url: null,
  };

  it("offers the exact jaw the neck asks for", async () => {
    clipSelection.mockResolvedValue(result({ custom_jaw: custom }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("NAVARRO™ T1 Recto, mordaza 27.0 mm")).toBeInTheDocument();
    expect(screen.getByText(/fuera de las tallas dibujadas/)).toBeInTheDocument();
  });

  it("lets the jaw be set by hand as well", async () => {
    // The suggestion is a starting point, not a verdict.
    clipSelection.mockResolvedValue(result({ custom_jaw: custom }));
    render(<ClipSelectionPanel sessionId="s1" />);
    const slider = await screen.findByRole("slider");
    fireEvent.change(slider, { target: { value: "18.5" } });
    // The design-system Slider keeps the value and its unit in separate spans,
    // so the readout is asserted the way that component renders it.
    expect(screen.getByText("18.5")).toBeInTheDocument();
    expect(slider).toHaveValue("18.5");
  });

  it("builds the clip at the chosen jaw", async () => {
    buildNavarroClip.mockResolvedValue({ ...custom, jaw_mm: 27, stl_url: "/x.stl?v=1",
      reason: "Mordaza estirada desde la talla dibujada de 22 mm." });
    clipSelection.mockResolvedValue(result({ custom_jaw: custom }));
    render(<ClipSelectionPanel sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Generar clip/ }));
    await waitFor(() => expect(buildNavarroClip)
      .toHaveBeenCalledWith("s1", 27, 0, "straight", 0));
    expect(await screen.findByText(/estirada desde la talla dibujada/)).toBeInTheDocument();
  });

  it("hands the chosen length to the plan, not just to a download", async () => {
    // Esto era un mirador: se podía marcar una longitud, verla y bajarse el
    // STL, pero no llevarla al plan. Así nunca pasaba por la comprobación de
    // colisión y fabricación volvía a proponer la medida deducida de la
    // morfometría, no la que se acababa de elegir.
    const onPick = vi.fn();
    buildNavarroClip.mockResolvedValue({
      ...custom, clip_id: "navarro:t1:0:18.5", jaw_mm: 18.5,
      label: "NAVARRO™ T1 Recto, mordaza 18.5 mm", stl_url: "/x.stl",
    });
    clipSelection.mockResolvedValue(result({ custom_jaw: custom }));
    render(<ClipSelectionPanel sessionId="s1" onPick={onPick} />);

    fireEvent.change(await screen.findByRole("slider"), { target: { value: "18.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Generar clip/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Elegir esta medida/ }));

    expect(onPick).toHaveBeenCalledWith("navarro:t1:0:18.5",
                                        "NAVARRO™ T1 Recto, mordaza 18.5 mm");
  });

  it("does not offer to place a piece that has not been generated", async () => {
    // Sin generar no hay id, y sin id no hay nada que colocar.
    clipSelection.mockResolvedValue(result({ custom_jaw: custom }));
    render(<ClipSelectionPanel sessionId="s1" onPick={vi.fn()} />);
    await screen.findByRole("slider");
    expect(screen.queryByRole("button", { name: /Elegir esta medida/ })).not.toBeInTheDocument();
  });

  it("says nothing about a custom size when a drawn one fits", async () => {
    clipSelection.mockResolvedValue(result({ custom_jaw: null }));
    render(<ClipSelectionPanel sessionId="s1" />);
    await screen.findByText("Yasargil Recto 9mm");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});



describe("a custom jaw keeps the shape the case argued for", () => {
  it("asks the server for the fenestrated piece, window and all", async () => {
    // Antes solo viajaban mordaza y ángulo, así que una sugerencia fenestrada
    // volvía como hoja maciza: la pieza equivocada con la medida correcta.
    const fen: CustomJawOut = {
      clip_id: "",
      series: "T4", shape: "fenestrated", angle_deg: 0, window_mm: 5,
      resizable: true, jaw_mm: 8.5, nearest_drawn_mm: 7,
      label: "NAVARRO™ T4 Fenestrado ventana 5 mm, mordaza 8.5 mm",
      reason: "El cuello pide 8.5 mm.", mesh_url: null, stl_url: null,
    };
    clipSelection.mockResolvedValue(result({ outcome: "stock", custom_jaw: fen }));
    buildNavarroClip.mockResolvedValue({ ...fen, stl_url: "/data/c.stl" });
    render(<ClipSelectionPanel sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Generar clip/ }));
    await waitFor(() => expect(buildNavarroClip).toHaveBeenCalled());
    const [, jaw, angle, shape, win] = buildNavarroClip.mock.calls.at(-1)!;
    expect(jaw).toBe(8.5);
    expect(angle).toBe(0);
    expect(shape).toBe("fenestrated");
    expect(win).toBe(5);
  });
});

/* La mordaza se dimensiona sobre el cuello APLASTADO.
 *
 * Al cerrar las hojas el cuello queda plano y su línea de cierre mide más que
 * el diámetro: se conserva el perímetro, así que un cuello redondo de D pasa a
 * πD/2 ≈ 1,5·D. Es el número que elige la pieza, y quedarse corto es la causa
 * más frecuente de que el domo siga rellenándose — así que tiene que estar en
 * pantalla, y con su origen: no es lo mismo haberlo medido sobre el contorno
 * que haber supuesto que el cuello es redondo. */
describe("la mordaza mínima que pide el cuello", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enseña el mínimo y dice que sale de la regla del cuello aplastado", async () => {
    clipSelection.mockResolvedValue(result());
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("9.0 mm")).toBeInTheDocument();
    expect(screen.getByText(/regla del cuello aplastado/)).toBeInTheDocument();
  });

  it("distingue el contorno medido de la regla", async () => {
    // Un cuello ovalado pide más que su diámetro equivalente, y eso solo se
    // sabe midiendo: decirlo cambia cuánto se fía el cirujano del número.
    clipSelection.mockResolvedValue(result({
      case: {
        ...result().case,
        required_jaw_mm: 7.1, required_jaw_source: "perimeter",
        required_jaw_detail: "Contorno del cuello medido: 14.2 mm de perímetro.",
      },
    }));
    render(<ClipSelectionPanel sessionId="s1" />);
    expect(await screen.findByText("7.1 mm")).toBeInTheDocument();
    expect(screen.getByText(/medida sobre el contorno del cuello/)).toBeInTheDocument();
    expect(screen.queryByText(/regla del cuello aplastado/)).not.toBeInTheDocument();
  });
});
