/* El registro de pedidos: qué sube arriba y por qué.

   Una tabla ordenada por fecha de creación es inútil para gestionar: lo que
   importa no es qué se pidió primero, sino qué lleva parado más tiempo y qué
   llegó fuera de especificación. Estas pruebas fijan ese orden y el aviso, que
   es lo único que distingue esta pantalla de un listado cualquiera. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const listClipOrders = vi.fn();
const clipOrdersSummary = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    listClipOrders: (...a: unknown[]) => listClipOrders(...(a as [])),
    clipOrdersSummary: (...a: unknown[]) => clipOrdersSummary(...(a as [])),
    downloadClipOrderFile: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("../components/Topbar", () => ({ Topbar: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { ClipOrdersPage } from "./ClipOrders";
import type { ClipOrder } from "../api/types";

const DAY = 86400;
const now = () => Date.now() / 1000;

const order = (over: Partial<ClipOrder> = {}): ClipOrder => ({
  part_no: "PR-2026-0001", status: "enviado", status_label: "Enviado al taller",
  created_at: now() - 2 * DAY, updated_at: now() - 2 * DAY,
  session_id: "s1", case_id: 1, patient: "Navarro, Ana", patient_id: 1,
  case_label: "Aneurisma ACM", requested_by: "u", requested_by_name: "U",
  surgeon: "Dra. Navarro", signed_at: 0, institution: "",
  series: "T1", shape: "straight", angle_deg: 0, jaw_mm: 7, window_mm: 0,
  is_drawn_size: true,
  quantity: 1, extra_sizes_mm: [], total_pieces: 1,
  intended_use: "implante", needed_by: "", urgency: "programada",
  steriliser: "hospital", marking: "cuerpo", notes: "", authorization_ref: "",
  workshop_id: "w1", workshop_name: "Taller Sur",
  advised_label: "", override_reason: "", spec_snapshot: {},
  reception: {}, next_states: [], files: {},
  ...over,
});

const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

beforeEach(() => {
  listClipOrders.mockReset();
  clipOrdersSummary.mockReset();
  clipOrdersSummary.mockResolvedValue({
    counts: { enviado: 2, recibida: 1 },
    labels: { enviado: "Enviado al taller", recibida: "Recibida" },
  });
});

describe("what rises to the top", () => {
  it("puts an out-of-spec piece above everything else", async () => {
    // Una pieza recibida cuya fuerza cayó fuera de la banda es lo único que no
    // puede quedar enterrado en la lista.
    listClipOrders.mockResolvedValue([
      order({ part_no: "PR-0001", updated_at: now() - 1 * DAY }),
      order({
        part_no: "PR-0002", status: "recibida", status_label: "Recibida",
        updated_at: now() - 1 * DAY,
        reception: { measured_jaw_mm: 7.0, measured_force_g: 60,
                     jaw_within_tolerance: true, force_within_band: false },
      }),
    ]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveTextContent("PR-0002");
    expect(rows()[0]).toHaveTextContent("fuera de especificación");
  });

  it("ranks a stalled order above a fresh one, whatever the order they were created", async () => {
    listClipOrders.mockResolvedValue([
      order({ part_no: "PR-NUEVO", updated_at: now() - 1 * DAY }),
      order({ part_no: "PR-VIEJO", updated_at: now() - 40 * DAY }),
    ]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveTextContent("PR-VIEJO");
    expect(rows()[0]).toHaveTextContent(/40 días parado/);
  });

  it("does not cry wolf on an order that is simply recent", async () => {
    listClipOrders.mockResolvedValue([order({ updated_at: now() - 2 * DAY })]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.queryByText(/días parado/)).toBeNull();
    expect(screen.queryByText(/piden atención/)).toBeNull();
  });

  it("counts how many need attention", async () => {
    listClipOrders.mockResolvedValue([
      order({ part_no: "A", updated_at: now() - 40 * DAY }),
      order({ part_no: "B", updated_at: now() - 1 * DAY }),
    ]);
    render(<ClipOrdersPage />);
    expect(await screen.findByText(/1 pedido\(s\) piden atención/)).toBeInTheDocument();
  });
});

describe("the thresholds follow the state", () => {
  it("gives a workshop three weeks before nagging, but a received piece only one", async () => {
    // No es una promesa del taller: es cuándo conviene preguntar. Una pieza que
    // ya está en casa y nadie ha aceptado ni rechazado se pudre mucho antes.
    listClipOrders.mockResolvedValue([
      order({ part_no: "ENVIADO", status: "enviado", updated_at: now() - 10 * DAY }),
      order({ part_no: "RECIBIDA", status: "recibida", status_label: "Recibida",
              updated_at: now() - 10 * DAY,
              reception: { jaw_within_tolerance: true, force_within_band: true } }),
    ]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveTextContent("RECIBIDA");
    expect(rows()[1]).toHaveTextContent("ENVIADO");
    expect(screen.getByText(/1 pedido\(s\) piden atención/)).toBeInTheDocument();
  });
});

describe("filtering", () => {
  it("asks the server for one patient when it arrives from their sheet", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage patientFilter={{ id: 7, full_name: "Navarro, Ana" } as never} />);
    await waitFor(() => expect(listClipOrders).toHaveBeenCalled());
    expect(listClipOrders.mock.calls[0][0]).toMatchObject({ patientId: 7 });
    expect(screen.getByText("Navarro, Ana")).toBeInTheDocument();
  });

  it("hides closed orders by default", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(listClipOrders).toHaveBeenCalled());
    expect(listClipOrders.mock.calls[0][0]).toMatchObject({ openOnly: true });
  });

  it("says where orders come from when there are none", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage />);
    expect(await screen.findByText(/paso/)).toBeInTheDocument();
    expect(screen.getByText("Fabricación")).toBeInTheDocument();
  });
});

describe("the actions on a received piece", () => {
  it("does not repeat «aceptar» and «rechazar» as generic next steps", async () => {
    // `next_states` de una pieza recibida son verificada y rechazada, que ya
    // tienen botón propio. Recorrerlos sin filtrar pintaba dos botones idénticos
    // al lado de los de verdad.
    listClipOrders.mockResolvedValue([order({
      part_no: "PR-REC", status: "recibida", status_label: "Recibida",
      next_states: ["verificada", "rechazada"],
      reception: { measured_jaw_mm: 7, measured_force_g: 150,
                   jaw_within_tolerance: true, force_within_band: true },
    })]);
    render(<ClipOrdersPage />);
    (await screen.findByText("PR-REC")).click();
    await waitFor(() => expect(screen.getByRole("button", { name: /Aceptar la pieza/ })).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /Rechazar/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^verificada$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /En fabricación/ })).toBeNull();
  });

  it("still offers the real next step on an order in transit", async () => {
    listClipOrders.mockResolvedValue([order({
      part_no: "PR-ENV", status: "enviado", next_states: ["en_fabricacion", "recibida"],
    })]);
    render(<ClipOrdersPage />);
    (await screen.findByText("PR-ENV")).click();
    await waitFor(() => expect(screen.getByRole("button", { name: /En fabricación/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Registrar recepción/ })).toBeInTheDocument();
  });
});

describe("cómo se nombra la pieza en la lista", () => {
  /* La fila deducía el nombre SOLO del acodado, y un acodado de cero es lo único
     que un recto, un curvo y un fenestrado tienen en común: los tres salían como
     «recto» mientras el albarán que recibía el taller decía otra cosa. */

  it("no llama «recto» a un curvo", async () => {
    listClipOrders.mockResolvedValue([
      order({ part_no: "PR-CUR", series: "T2", shape: "curved", angle_deg: 0 }),
    ]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("T2 Curvo");
    expect(rows()[0]).not.toHaveTextContent("recto");
  });

  it("no llama «recto» a un fenestrado, y dice su ventana", async () => {
    // La ventana es parte del nombre de la pieza: un fenestrado sin calibre no
    // identifica nada que el taller pueda fabricar.
    listClipOrders.mockResolvedValue([
      order({ part_no: "PR-FEN", series: "T4", shape: "fenestrated",
              angle_deg: 0, window_mm: 5 }),
    ]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("T4 Fenestrado ventana 5 mm");
    expect(rows()[0]).not.toHaveTextContent("recto");
  });

  it("sigue nombrando bien lo que ya nombraba bien", async () => {
    listClipOrders.mockResolvedValue([
      order({ part_no: "PR-REC", series: "T1", shape: "straight", angle_deg: 0 }),
      order({ part_no: "PR-ANG", series: "T3", shape: "angled", angle_deg: 60 }),
    ]);
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    const text = rows().map((r) => r.textContent).join(" | ");
    expect(text).toContain("T1 Recto");
    expect(text).toContain("T3 Angulado 60°");
  });
});
