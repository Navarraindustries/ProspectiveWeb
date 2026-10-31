import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientSummary } from "../api/types";

const listPatients = vi.fn();
vi.mock("../api/client", () => ({ api: { listPatients: () => listPatients() } }));

let role = "medico";
vi.mock("../store/auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role, institution: "" } }),
}));

import { OPEN_PALETTE_EVENT, registerCommands } from "../lib/commands";
import { CommandPalette } from "./CommandPalette";

const patient = (id: number, name: string, hc: string, extra: Partial<PatientSummary> = {}): PatientSummary => ({
  id, full_name: name, hospital_id: hc, dob: "1970-01-01", sex: "F", institution: "", study_count: 1,
  created_at: "2026-01-01", owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
  last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "",
  last_risk_label: null, ...extra,
} as PatientSummary);

const P96 = patient(96, "Zenodo, Caso 096", "ZENODO-096");
const P2 = patient(2, "Zenodo, Caso 002", "ZENODO-002", {
  last_session_at: "2026-10-30T10:00:00Z", last_session_id: "s-002", last_session_step: 2,
});
const P3 = patient(3, "Álvarez, Ana", "HC-3", {
  last_session_at: "2026-10-01T10:00:00Z", last_session_id: "s-003", last_session_step: 1,
});

function setup() {
  const onOpenPatient = vi.fn();
  const onResume = vi.fn();
  render(
    <>
      <input aria-label="Campo previo" />
      <CommandPalette onOpenPatient={onOpenPatient} onResume={onResume} />
    </>,
  );
  return { onOpenPatient, onResume };
}

function open() {
  const field = screen.getByLabelText("Campo previo");
  field.focus();
  fireEvent.keyDown(field, { key: "k", ctrlKey: true });
  return field;
}

beforeEach(() => {
  role = "medico";
  listPatients.mockReset();
  listPatients.mockResolvedValue([P96, P2, P3]);
});
afterEach(() => vi.restoreAllMocks());

describe("CommandPalette", () => {
  it("Ctrl+K abre el diálogo con el foco en el buscador y Esc devuelve el foco al campo", async () => {
    setup();
    const field = open();
    expect(await screen.findByRole("dialog", { name: "Paleta de mandos" })).toBeTruthy();
    const search = screen.getByLabelText("Buscar en la paleta");
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("Ctrl+K con la paleta abierta la cierra y devuelve el foco al campo", async () => {
    setup();
    const field = open();
    const search = await screen.findByLabelText("Buscar en la paleta");
    fireEvent.keyDown(search, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("Meta+K con la paleta abierta la cierra y devuelve el foco al campo", async () => {
    setup();
    const field = screen.getByLabelText("Campo previo");
    field.focus();
    fireEvent.keyDown(field, { key: "k", metaKey: true });
    const search = await screen.findByLabelText("Buscar en la paleta");
    fireEvent.keyDown(search, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("el evento de abrir con la paleta abierta no cambia a quién se devuelve el foco", async () => {
    setup();
    const field = open();
    const search = await screen.findByLabelText("Buscar en la paleta");
    act(() => { window.dispatchEvent(new Event(OPEN_PALETTE_EVENT)); });
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("con el foco fuera del buscador, Esc sigue cerrando", async () => {
    setup();
    open();
    const dialog = await screen.findByRole("dialog");
    const search = screen.getByLabelText("Buscar en la paleta");
    dialog.focus();
    expect(document.activeElement).toBe(dialog);
    const down = createEvent.mouseDown(await screen.findByText("Ir a"));
    fireEvent(screen.getByText("Ir a"), down);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tab no saca el foco del diálogo", async () => {
    setup();
    open();
    const search = await screen.findByLabelText("Buscar en la paleta");
    for (const shiftKey of [false, true]) {
      const ev = createEvent.keyDown(search, { key: "Tab", shiftKey });
      fireEvent(search, ev);
      expect(ev.defaultPrevented).toBe(true);
    }
    expect(document.activeElement).toBe(search);
  });

  it("un fallo al cargar pacientes se reintenta al reabrir", async () => {
    listPatients.mockReset();
    listPatients.mockRejectedValueOnce(new Error("x")).mockResolvedValue([P96, P2, P3]);
    setup();
    open();
    expect(await screen.findByText("No se pudo cargar la lista de pacientes")).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Buscar en la paleta"), { key: "Escape" });
    await act(async () => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }); });
    fireEvent.change(screen.getByLabelText("Buscar en la paleta"), { target: { value: "096" } });
    expect(await screen.findByText("Zenodo, Caso 096")).toBeTruthy();
    expect(listPatients).toHaveBeenCalledTimes(2);
  });

  it("Meta+K también abre", async () => {
    setup();
    await act(async () => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
    expect(screen.getByRole("dialog", { name: "Paleta de mandos" })).toBeTruthy();
  });

  it("un médico no ve Usuarios ni Auditoría; un administrador sí", async () => {
    const { unmount } = render(<CommandPalette onOpenPatient={vi.fn()} onResume={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByText("Estudios")).toBeTruthy();
    expect(screen.queryByText("Usuarios")).toBeNull();
    expect(screen.queryByText("Auditoría")).toBeNull();
    expect(screen.queryByText("Cuentas pendientes")).toBeNull();
    unmount();
    role = "admin";
    render(<CommandPalette onOpenPatient={vi.fn()} onResume={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByText("Usuarios")).toBeTruthy();
    expect(screen.getByText("Auditoría")).toBeTruthy();
  });

  it("filtra pacientes por nombre o HC sin mayúsculas ni tildes y Enter abre la ficha", async () => {
    const { onOpenPatient } = setup();
    open();
    const search = screen.getByLabelText("Buscar en la paleta");
    await waitFor(() => expect(listPatients).toHaveBeenCalledTimes(1));
    fireEvent.change(search, { target: { value: "zenodo 096" } });
    expect(await screen.findByText("Zenodo, Caso 096")).toBeTruthy();
    expect(screen.queryByText("Zenodo, Caso 002")).toBeNull();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onOpenPatient).toHaveBeenCalledWith(96);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignora las tildes y busca por HC", async () => {
    setup();
    open();
    const search = screen.getByLabelText("Buscar en la paleta");
    fireEvent.change(search, { target: { value: "alvarez" } });
    expect(await screen.findByText("Álvarez, Ana")).toBeTruthy();
    fireEvent.change(search, { target: { value: "ZENODO-096" } });
    expect(await screen.findByText("Zenodo, Caso 096")).toBeTruthy();
  });

  it("Recientes pone primero la sesión más reciente y Enter la reanuda", async () => {
    const { onResume } = setup();
    open();
    const search = screen.getByLabelText("Buscar en la paleta");
    fireEvent.change(search, { target: { value: "reanudar" } });
    const rows = await screen.findAllByRole("option");
    expect(rows[0].textContent).toContain("Reanudar · Zenodo, Caso 002");
    expect(rows[1].textContent).toContain("Reanudar · Álvarez, Ana");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onResume).toHaveBeenCalledWith("s-002", P2);
  });

  it("si la lista de pacientes falla lo dice y «Ir a» sigue", async () => {
    listPatients.mockRejectedValue(new Error("x"));
    setup();
    open();
    expect(await screen.findByText("No se pudo cargar la lista de pacientes")).toBeTruthy();
    expect(screen.getByText("Estudios")).toBeTruthy();
  });

  it("un mando registrado aparece y Enter lo ejecuta", async () => {
    const run = vi.fn();
    const off = registerCommands("t", [{ id: "x", group: "acciones", label: "Guardar progreso", run }]);
    setup();
    open();
    const search = screen.getByLabelText("Buscar en la paleta");
    fireEvent.change(search, { target: { value: "guardar" } });
    expect(await screen.findByText("Guardar progreso")).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(1);
    act(() => off());
  });

  it("un mando desactivado se ve pero no se ejecuta", async () => {
    const run = vi.fn();
    const off = registerCommands("t", [{ id: "d", group: "pasos", label: "Paso apagado", run, disabled: true }]);
    setup();
    open();
    const search = screen.getByLabelText("Buscar en la paleta");
    fireEvent.change(search, { target: { value: "apagado" } });
    expect(await screen.findByText("Paso apagado")).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => off());
  });

  it("↑/↓ mueven la selección y sin resultados lo dice", async () => {
    setup();
    open();
    const search = screen.getByLabelText("Buscar en la paleta");
    const rows = await screen.findAllByRole("option");
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.change(search, { target: { value: "qqqq" } });
    expect(await screen.findByText("Nada coincide con «qqqq»")).toBeTruthy();
  });
});
