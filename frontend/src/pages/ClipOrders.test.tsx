/* El registro de pedidos: qué sube arriba y por qué.

   Una tabla ordenada por fecha de creación es inútil para gestionar: lo que
   importa no es qué se pidió primero, sino qué lleva parado más tiempo y qué
   llegó fuera de especificación. Estas pruebas fijan ese orden y el aviso, que
   es lo único que distingue esta pantalla de un listado cualquiera. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const listClipOrders = vi.fn();
const clipOrdersSummary = vi.fn();
const advanceClipOrder = vi.fn();
const rejectClipOrder = vi.fn();
const auth = { user: null as null | { role: string } };

vi.mock("../api/client", () => ({
  api: {
    listClipOrders: (...a: unknown[]) => listClipOrders(...(a as [])),
    clipOrdersSummary: (...a: unknown[]) => clipOrdersSummary(...(a as [])),
    downloadClipOrderFile: vi.fn(),
    advanceClipOrder: (...a: unknown[]) => advanceClipOrder(...a),
    rejectClipOrder: (...a: unknown[]) => rejectClipOrder(...a),
  },
  ApiError: class ApiError extends Error {},
}));

// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: {
    actions?: import("react").ReactNode; children?: import("react").ReactNode;
    crumbs?: { label: string; onClick?: () => void }[];
  }) => (
    <>
      <nav aria-label="Miga">
        {p.crumbs?.map((c) => c.onClick
          ? <button key={c.label} onClick={c.onClick}>{c.label}</button>
          : <span key={c.label}>{c.label}</span>)}
      </nav>
      {p.actions}{p.children}
    </>
  ),
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => auth }));

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
  advanceClipOrder.mockReset().mockResolvedValue({});
  rejectClipOrder.mockReset().mockResolvedValue({});
  auth.user = null;
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
    expect(screen.getAllByText("Navarro, Ana").length).toBeGreaterThan(0);
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

describe("con el API fallando (F1-99)", () => {
  it("muestra el error sin el texto de vacío y «Reintentar» vuelve a llamar", async () => {
    listClipOrders.mockRejectedValueOnce(Object.assign(new Error("Sin conexión con el servidor"),
      { status: 0, fromServer: false }));
    listClipOrders.mockResolvedValue([order({ part_no: "PR-0009" })]);
    render(<ClipOrdersPage />);

    expect(await screen.findByText("No se pudo leer el registro: Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/Ningún pedido encaja con este filtro/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("PR-0009");
    // Cada carga pide la lista y la base de los recuentos.
    expect(listClipOrders).toHaveBeenCalledTimes(4);
  });
});

/* Verificación cruzada de la Tarea 3 desde un Médico: filtrar por un paciente
   ajeno no enseña pedidos de otro profesional. El servidor devuelve la lista
   vacía (los pedidos ajenos no se ven) o, si responde 403, la pantalla dice el
   motivo en lugar de la tabla. */
describe("un Médico filtrando por un paciente ajeno", () => {
  beforeEach(() => { auth.user = { role: "medico" }; });

  it("con la lista vacía del servidor no hay tabla ni pedidos", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage patientFilter={{ id: 99, full_name: "Ajeno, Paciente" } as never} />);
    expect(await screen.findByText(/Este paciente aún no tiene pedidos/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("con un 403 muestra el motivo y no la tabla", async () => {
    listClipOrders.mockRejectedValue(Object.assign(new Error("No autorizado sobre este paciente."),
      { status: 403, fromServer: true }));
    render(<ClipOrdersPage patientFilter={{ id: 99, full_name: "Ajeno, Paciente" } as never} />);
    expect(await screen.findByText("No se pudo leer el registro: No autorizado sobre este paciente.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/Ningún pedido encaja con este filtro/)).toBeNull();
  });
});

/* F1-97, F1-98: «Firmar» se ofrecía a quien el servidor no deja firmar, y
   firmar o rechazar la pieza ocurría al primer clic. */
describe("firmar y rechazar", () => {
  const borrador = () => order({ part_no: "PR-BOR", status: "borrador", status_label: "Borrador", next_states: ["firmado"] });

  it("un residente ve «Firmar» apagado con el motivo", async () => {
    auth.user = { role: "residente" };
    listClipOrders.mockResolvedValue([borrador()]);
    render(<ClipOrdersPage />);
    (await screen.findByText("PR-BOR")).click();
    const firmar = await screen.findByRole("button", { name: "Firmar" });
    expect(firmar).toBeDisabled();
    expect(screen.getByText("Solo un médico responsable puede firmar un pedido.")).toBeInTheDocument();
  });

  it("un observador tampoco puede firmar", async () => {
    auth.user = { role: "viewer" };
    listClipOrders.mockResolvedValue([borrador()]);
    render(<ClipOrdersPage />);
    (await screen.findByText("PR-BOR")).click();
    expect(await screen.findByRole("button", { name: "Firmar" })).toBeDisabled();
  });

  it("un médico confirma la firma antes de que se mande", async () => {
    auth.user = { role: "medico" };
    listClipOrders.mockResolvedValue([borrador()]);
    render(<ClipOrdersPage />);
    (await screen.findByText("PR-BOR")).click();
    fireEvent.click(await screen.findByRole("button", { name: "Firmar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Firmar el pedido PR-BOR?" })).toBeInTheDocument();
    expect(advanceClipOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Firmar el pedido" }));
    await waitFor(() => expect(advanceClipOrder).toHaveBeenCalledWith("PR-BOR", "firmado"));
  });

  it("«Rechazar» la pieza abre la confirmación y no rechaza hasta confirmar", async () => {
    listClipOrders.mockResolvedValue([order({
      part_no: "PR-REC", status: "recibida", status_label: "Recibida",
      next_states: ["verificada", "rechazada"],
      reception: { measured_jaw_mm: 7, measured_force_g: 150, jaw_within_tolerance: true, force_within_band: true },
    })]);
    render(<ClipOrdersPage />);
    (await screen.findByText("PR-REC")).click();
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Rechazar la pieza PR-REC?" })).toBeInTheDocument();
    expect(rejectClipOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar la pieza" }));
    await waitFor(() => expect(rejectClipOrder).toHaveBeenCalledWith("PR-REC", "Pieza no conforme"));
  });
});

describe("el glosario de pedidos (F1-93)", () => {
  it("el subtítulo dice «pedidos» y ningún texto dice «solicitud» ni «encargado»", async () => {
    listClipOrders.mockResolvedValue([order()]);
    const { container } = render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByText("Todos los pedidos de fabricación, con su estado y lo que falta por hacer.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/solicitud|encargad/i);
  });
});

/* F2-27: «Pedidos» desde la ficha llevaba aquí sin camino de vuelta al paciente. */
describe("la vuelta a la ficha", () => {
  it("«← Volver a la ficha» solo sale cuando se llega desde una ficha, y vuelve a ella", async () => {
    listClipOrders.mockResolvedValue([]);
    const volver = vi.fn();
    const r = render(<ClipOrdersPage patientFilter={{ id: 7, full_name: "Navarro, Ana" } as never} onBackToPatient={volver} />);
    fireEvent.click(await screen.findByRole("button", { name: "← Volver a la ficha" }));
    expect(volver).toHaveBeenCalledTimes(1);
    r.unmount();

    render(<ClipOrdersPage />);
    await waitFor(() => expect(listClipOrders).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Volver a la ficha/ })).toBeNull();
  });
});


describe("empty states (F2-53)", () => {
  it("says there are no orders yet when none exist", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage />);
    expect(await screen.findByText(/No hay pedidos todavía/)).toBeInTheDocument();
    expect(screen.queryByText(/Ningún pedido encaja/)).toBeNull();
  });

  it("says nothing matches when a filter excludes everything", async () => {
    // El recuento base (sin búsqueda) sigue teniendo el pedido; la búsqueda no.
    listClipOrders.mockImplementation(async (o: { q?: string }) => (o.q ? [] : [order()]));
    render(<ClipOrdersPage />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "zzz" } });
    expect(await screen.findByText("Ningún pedido encaja con este filtro.")).toBeInTheDocument();
    expect(screen.queryByText(/No hay pedidos todavía/)).toBeNull();
  });
});

describe("crumbs with a patient filter (F2-52)", () => {
  const patient = { id: 7, full_name: "segura, Juan" } as never;

  it("shows Pacientes / name / Pedidos and navigates", async () => {
    listClipOrders.mockResolvedValue([]);
    const onCrumbPatients = vi.fn();
    const onBackToPatient = vi.fn();
    render(<ClipOrdersPage patientFilter={patient} onBackToPatient={onBackToPatient}
                           onCrumbPatients={onCrumbPatients} />);
    const nav = screen.getByRole("navigation", { name: "Miga" });
    expect(nav).toHaveTextContent("Pacientes");
    expect(nav).toHaveTextContent("segura, Juan");
    expect(nav).toHaveTextContent("Pedidos");
    fireEvent.click(within(nav).getByRole("button", { name: "Pacientes" }));
    expect(onCrumbPatients).toHaveBeenCalled();
    fireEvent.click(within(nav).getByRole("button", { name: "segura, Juan" }));
    expect(onBackToPatient).toHaveBeenCalled();
  });

  it("is just «Pedidos de clips» without a filter", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage />);
    expect(screen.getByRole("navigation", { name: "Miga" })).toHaveTextContent(/^Pedidos de clips$/);
  });
});

describe("Abrir el caso (F2-54)", () => {
  const select = async () => {
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(rows()[0]);
  };

  it("resumes the session that raised the order", async () => {
    listClipOrders.mockResolvedValue([order({ session_id: "s9", patient_id: 4 })]);
    const onOpenSession = vi.fn().mockResolvedValue(undefined);
    render(<ClipOrdersPage onOpenSession={onOpenSession} />);
    await select();
    fireEvent.click(screen.getByRole("button", { name: "Abrir el caso" }));
    expect(onOpenSession).toHaveBeenCalledWith("s9", 4);
  });

  it("shows the failure inline when the session cannot be resumed", async () => {
    listClipOrders.mockResolvedValue([order()]);
    const onOpenSession = vi.fn().mockRejectedValue(
      Object.assign(new Error("Sesión no encontrada"), { status: 404 }));
    render(<ClipOrdersPage onOpenSession={onOpenSession} />);
    await select();
    fireEvent.click(screen.getByRole("button", { name: "Abrir el caso" }));
    expect(await screen.findByText("Sesión no encontrada")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Abrir el caso" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "La sesión de este pedido ya no existe");
  });

  it("is absent when the page has no way to open a session", async () => {
    listClipOrders.mockResolvedValue([order()]);
    render(<ClipOrdersPage />);
    await select();
    expect(screen.queryByRole("button", { name: "Abrir el caso" })).toBeNull();
  });
});


describe("chip counts over the filtered list (F1-95)", () => {
  it("counts only the patient's orders and gives «Todos» its count", async () => {
    listClipOrders.mockImplementation(async (o: { patientId?: number }) =>
      o.patientId === 7
        ? [order({ part_no: "A", status: "enviado" }), order({ part_no: "B", status: "enviado" }),
           order({ part_no: "C", status: "recibida", status_label: "Recibida" })]
        : []);
    render(<ClipOrdersPage patientFilter={{ id: 7, full_name: "Navarro, Ana" } as never} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    // El resumen global dice 2 enviados y 1 recibida de TODOS; aquí, de este paciente.
    expect(screen.getByRole("button", { name: /^Todos\s*3$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviado al taller\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recibida\s*1/ })).toBeInTheDocument();
  });
});

describe("closed states (F1-96)", () => {
  it("unticks «Solo los abiertos» when choosing Verificada or Rechazada", async () => {
    clipOrdersSummary.mockResolvedValue({
      counts: {}, labels: { verificada: "Verificada", rechazada: "Rechazada" },
    });
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage />);
    const box = await screen.findByLabelText("Solo los abiertos") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: /Verificada/ }));
    await waitFor(() => expect(box.checked).toBe(false));
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /Rechazada/ }));
    await waitFor(() => expect(box.checked).toBe(false));
  });
});

describe("a patient without orders (F2-53)", () => {
  it("says so, not the global or the filter text", async () => {
    listClipOrders.mockResolvedValue([]);
    render(<ClipOrdersPage patientFilter={{ id: 7, full_name: "Navarro, Ana" } as never} />);
    expect(await screen.findByText(/Este paciente aún no tiene pedidos/)).toBeInTheDocument();
    expect(screen.queryByText(/Ningún pedido encaja/)).toBeNull();
  });
});
