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
    const jaw = screen.getByLabelText(/A medida/i) as HTMLInputElement;
    expect(jaw.value).toBe("10");
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
    const jaw = await screen.findByLabelText(/A medida/i);
    fireEvent.change(jaw, { target: { value: "16" } });
    expect(await screen.findByText(/Por qué se aparta de lo recomendado/i)).toBeTruthy();
  });

  it("warns when the jaw leaves the drawn range, where the profile extrapolates", async () => {
    clipOrderPrefill.mockResolvedValue(prefill());
    draw();
    const jaw = await screen.findByLabelText(/A medida/i);
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
