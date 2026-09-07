/* El formulario de pedido: lo que enseña sin que lo pidan y lo que se niega a enviar.

   Lo que importa aquí no es que renderice. Es que el cirujano NO tenga que
   volver a teclear una medida que el sistema ya dedujo, que apartarse de lo
   recomendado deje escrito por qué, y que un residente no pueda firmar un
   implante desde una pantalla. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const clipOrderPrefill = vi.fn();
const createClipOrder = vi.fn();
const listClipOrders = vi.fn(async () => []);

vi.mock("../../api/client", () => ({
  api: {
    clipOrderPrefill: (...a: unknown[]) => clipOrderPrefill(...(a as [])),
    createClipOrder: (...a: unknown[]) => createClipOrder(...(a as [])),
    listClipOrders: (...a: unknown[]) => listClipOrders(...(a as [])),
  },
  // Misma forma que la real: el detalle es el mensaje, y ahí viaja la lista
  // de problemas que el formulario tiene que desplegar.
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  },
}));

vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { ClipOrderForm } from "./ClipOrderForm";
import type { ClipOrderPrefill } from "../../api/types";

const prefill = (over: Partial<ClipOrderPrefill> = {}): ClipOrderPrefill => ({
  session_id: "s1",
  can_order: true,
  reason: "",
  advised_series: "T1",
  advised_angle_deg: 0,
  advised_jaw_mm: 10,
  advised_label: "NAVARRO™ T1 Recto, mordaza 10.0 mm",
  advised_shape: "Recto",
  advised_navarro_shape: "straight",
  advised_window_mm: 0,
  jaw_is_free: true,
  stock_window_mm: [3, 5, 7],
  drawn_angles_deg: [15, 30, 45, 60, 75, 90],
  is_drawn_size: true,
  outside_drawn_range: false,
  commercial_name: "",
  neck_mm: 6.2,
  neck_source: "rim",
  dome_height_mm: 9.3,
  max_diameter_mm: 11.1,
  parent_artery_mm: 3.2,
  region: "ACM",
  caveats: [],
  suggested_extra_sizes_mm: [7, 13],
  suggest_extra_sizes: false,
  extra_sizes_reason: "El cuello se midió sobre el borde marcado.",
  stock_sizes_mm: [7, 10, 13, 16, 19, 22],
  force_band_g: [120, 200],
  max_tip_opening_mm: 10,
  material: "Titanio grado 5 (Ti-6Al-4V), pulido",
  tolerance_jaw_mm: 0.1,
  tolerance_other_mm: 0.2,
  requester_name: "Dra. Navarro",
  can_sign: true,
  institution: "Hospital",
  patient: "",
  case_label: "",
  workshops: [{
    id: "w1", name: "Taller Sur", contact_name: "", email: "", phone: "",
    address: "", tax_id: "", notes: "", created_at: 0, last_used_at: 0, order_count: 0,
  }],
  ...over,
});

const draw = () =>
  render(<ClipOrderForm sessionId="s1" caseId={null} onPlaced={() => {}} />);

beforeEach(() => {
  clipOrderPrefill.mockReset();
  createClipOrder.mockReset();
  createClipOrder.mockResolvedValue({ part_no: "PR-2026-0001", files: {} });
});

describe("what the form already knows", () => {
  it("arrives with the advised piece filled in, not blank", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    expect(await screen.findByText(/NAVARRO™ T1 Recto, mordaza 10.0 mm/)).toBeTruthy();
    const jaw = screen.getByLabelText(/Mordaza/i) as HTMLInputElement;
    expect(jaw.value).toBe("10");
  });

  it("offers ONE control for the jaw, not a size list and a number beside it", async () => {
    // Dos mandos para el mismo dato invitan a que discrepen.
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    await screen.findByLabelText(/Mordaza/i);
    expect(screen.getAllByLabelText(/Mordaza/i)).toHaveLength(1);
    expect(screen.getByText(/Se mecaniza sobre la de 10 mm/)).toBeTruthy();
  });

  it("names both drawn sizes when the jaw sits exactly between two", async () => {
    // 11.5 mm está a 1.5 mm de 10 y de 13: elegir una sería inventar un desempate.
    clipOrderPrefill.mockResolvedValue(prefill({ advised_jaw_mm: 11.5 }));
    draw();
    expect(await screen.findByText(/Se mecaniza sobre la de 10 o 13 mm/)).toBeTruthy();
  });

  it("says where the neck measurement came from, because everything derives from it", async () => {
    clipOrderPrefill.mockResolvedValue(prefill({ neck_source: "auto" }));
    draw();
    expect(await screen.findByText(/estimado automáticamente/)).toBeTruthy();
  });

  it("pre-ticks the spare sizes only when the neck was estimated", async () => {
    clipOrderPrefill.mockResolvedValue(prefill({ suggest_extra_sizes: true }));
    draw();
    const box = await screen.findByRole("checkbox", { name: /tallas contiguas/i });
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it("never pre-ticks a declaration", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    const force = await screen.findByRole("checkbox", { name: /objetivo/i });
    expect((force as HTMLInputElement).checked).toBe(false);
  });
});

describe("what it refuses to send quietly", () => {
  it("asks why when the piece is not the advised one", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    const jaw = await screen.findByLabelText(/Mordaza/i);
    fireEvent.change(jaw, { target: { value: "16" } });
    expect(await screen.findByText(/Por qué se aparta de lo recomendado/i)).toBeTruthy();
  });

  it("warns when the jaw leaves the drawn range, where the profile extrapolates", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    const jaw = await screen.findByLabelText(/Mordaza/i);
    fireEvent.change(jaw, { target: { value: "28" } });
    expect(await screen.findByText(/fuera del rango dibujado/i)).toBeTruthy();
  });

  it("does not let a resident sign", async () => {
    clipOrderPrefill.mockResolvedValue(prefill({ can_sign: false }));
    draw();
    const sign = await screen.findByRole("button", { name: /Firmar y generar pedido/i });
    expect((sign as HTMLButtonElement).disabled).toBe(true);
    // But the draft is still open to them: preparing one is their job.
    const draft = screen.getByRole("button", { name: /Guardar borrador/i });
    expect((draft as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends the declarations as the user actually left them", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    fireEvent.click(await screen.findByRole("checkbox", { name: /He revisado las medidas/i }));
    fireEvent.click(screen.getByRole("button", { name: /Firmar y generar pedido/i }));
    await waitFor(() => expect(createClipOrder).toHaveBeenCalled());
    const [, body] = createClipOrder.mock.calls[0];
    expect(body.accepts_measurements).toBe(true);
    expect(body.accepts_force_is_target).toBe(false);
    expect(body.sign).toBe(true);
  });

  it("shows every problem the backend returned, not just the first", async () => {
    const { ApiError } = await import("../../api/client");
    clipOrderPrefill.mockResolvedValue(prefill());
    createClipOrder.mockRejectedValue(
      new ApiError(422, JSON.stringify(["Falta el cirujano.", "Falta el taller."])),
    );
    draw();
    fireEvent.click(await screen.findByRole("button", { name: /Guardar borrador/i }));
    expect(await screen.findByText("Falta el cirujano.")).toBeTruthy();
    expect(screen.getByText("Falta el taller.")).toBeTruthy();
  });
});

describe("the workshop", () => {
  it("offers the ones on file and a way to add one that gets saved", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    const select = await screen.findByLabelText(/Destinatario/i);
    expect(screen.getByRole("option", { name: "Taller Sur" })).toBeTruthy();
    fireEvent.change(select, { target: { value: "__nuevo__" } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Taller Nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar borrador/i }));
    await waitFor(() => expect(createClipOrder).toHaveBeenCalled());
    const [, body] = createClipOrder.mock.calls[0];
    expect(body.new_workshop.name).toBe("Taller Nuevo");
    expect(body.workshop_id).toBe("");
  });
});

describe("when the family cannot build it", () => {
  it("says so instead of showing a form that leads nowhere", async () => {
    clipOrderPrefill.mockResolvedValue(prefill({
      can_order: false,
      reason: "La familia NAVARRO™ no tiene todavía un diseño fenestrado.",
      commercial_name: "Yasargil Fenestrado 7mm",
    }));
    draw();
    expect(await screen.findByText(/no tiene todavía un diseño fenestrado/)).toBeTruthy();
    expect(screen.getByText(/Yasargil Fenestrado 7mm/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Firmar/i })).toBeNull();
  });
});

describe("what each series lets you change", () => {
  const withShape = (over: Partial<ClipOrderPrefill>) =>
    clipOrderPrefill.mockResolvedValue(prefill(over));

  it("offers the four drawn series", async () => {
    withShape({});
    draw();
    await screen.findByLabelText("Serie");
    for (const s of ["T1 · Recta", "T2 · Curva", "T3 · Angulada", "T4 · Fenestrada"]) {
      expect(screen.getByRole("option", { name: s })).toBeTruthy();
    }
  });

  it("asks for a bend only on the angled series", async () => {
    withShape({ advised_navarro_shape: "straight" });
    draw();
    await screen.findByLabelText("Serie");
    expect(screen.queryByLabelText("Acodado")).toBeNull();
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "angled" } });
    expect(await screen.findByLabelText("Acodado")).toBeTruthy();
  });

  it("asks for a window only on the fenestrated series, and only the drawn ones", async () => {
    withShape({ advised_navarro_shape: "straight" });
    draw();
    await screen.findByLabelText("Serie");
    expect(screen.queryByLabelText("Ventana")).toBeNull();
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "fenestrated" } });
    const win = await screen.findByLabelText("Ventana");
    expect(win).toBeTruthy();
    for (const w of ["3 mm de diámetro", "5 mm de diámetro", "7 mm de diámetro"]) {
      expect(screen.getByRole("option", { name: w })).toBeTruthy();
    }
  });

  it("turns the jaw into a size list on the curved series, because an arc is not stretched", async () => {
    withShape({ advised_navarro_shape: "straight" });
    draw();
    // Libre en la recta: un deslizador continuo.
    const free = await screen.findByLabelText(/Mordaza/);
    expect((free as HTMLInputElement).type).toBe("range");

    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "curved" } });
    const fixed = await screen.findByLabelText(/Mordaza/);
    expect(fixed.tagName).toBe("SELECT");
    expect(screen.getByText(/estirarla cambiaría la curvatura/i)).toBeTruthy();
  });

  it("sends the series and the window it was told to send", async () => {
    withShape({ advised_navarro_shape: "straight" });
    draw();
    await screen.findByLabelText("Serie");
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "fenestrated" } });
    fireEvent.change(await screen.findByLabelText("Ventana"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/Por qué se aparta/i), { target: { value: "el vaso obliga" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar borrador/i }));
    await waitFor(() => expect(createClipOrder).toHaveBeenCalled());
    const [, body] = createClipOrder.mock.calls[0];
    expect(body.shape).toBe("fenestrated");
    expect(body.window_mm).toBe(5);
  });
});

describe("the heading never contradicts the controls", () => {
  it("names the piece that is selected, not the one that was advised", async () => {
    // Con la etiqueta congelada en la recomendación, cambiar de serie dejaba la
    // cabecera anunciando un T4 mientras los controles decían T2.
    clipOrderPrefill.mockResolvedValue(prefill({
      advised_navarro_shape: "fenestrated", advised_window_mm: 5,
      advised_label: "NAVARRO™ T4 Fenestrado ventana 5 mm, mordaza 10.0 mm",
    }));
    draw();
    await screen.findByLabelText("Serie");
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "curved" } });
    expect(await screen.findByText(/T2 Curvo/)).toBeTruthy();
    // Y lo recomendado sigue visible, como contraste, no como título.
    expect(screen.getByText(/El sistema recomendaba/)).toBeTruthy();
  });
});

describe("switching series leaves every field valid for it", () => {
  it("snaps the bend to a drawn angle instead of leaving a 0 the list cannot show", async () => {
    // El título decía «Angulado 0°» mientras el desplegable mostraba 15°.
    clipOrderPrefill.mockResolvedValue(prefill({ advised_navarro_shape: "straight" }));
    draw();
    await screen.findByLabelText("Serie");
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "angled" } });
    const bend = await screen.findByLabelText("Acodado") as HTMLSelectElement;
    expect(bend.value).toBe("15");
    expect(screen.getByText(/T3 Angulado 15°/)).toBeTruthy();
  });

  it("gives a fenestrated order a drawn window rather than none", async () => {
    clipOrderPrefill.mockResolvedValue(prefill({ advised_navarro_shape: "straight" }));
    draw();
    await screen.findByLabelText("Serie");
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "fenestrated" } });
    const win = await screen.findByLabelText("Ventana") as HTMLSelectElement;
    expect(win.value).toBe("3");
    expect(screen.getByText(/ventana 3 mm/)).toBeTruthy();
  });

  it("moves a stretched jaw onto a drawn size when the series is curved", async () => {
    clipOrderPrefill.mockResolvedValue(prefill({
      advised_navarro_shape: "straight", advised_jaw_mm: 11.5,
    }));
    draw();
    await screen.findByLabelText("Serie");
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "curved" } });
    const jaw = await screen.findByLabelText(/Mordaza/) as HTMLSelectElement;
    expect([10, 13].map(String)).toContain(jaw.value);
  });
});
