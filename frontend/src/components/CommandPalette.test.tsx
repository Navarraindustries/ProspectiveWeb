import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientSummary } from "../api/types";
import { simularPantalla } from "../test/pantalla";

const listPatients = vi.fn();
vi.mock("../api/client", () => ({ api: { listPatients: () => listPatients() } }));

let role = "medico";
vi.mock("../store/auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role, institution: "" } }),
}));

import { OPEN_PALETTE_EVENT, registerCommands } from "../lib/commands";
import { CommandPalette } from "./CommandPalette";
import { ConfirmDialog } from "./ConfirmDialog";
import { Sheet } from "./Sheet";

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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CommandPalette", () => {
  it("cada opción lleva el icono de su grupo", async () => {
    setup();
    open();
    await screen.findAllByRole("option");
    const opciones = screen.getAllByRole("option");
    expect(opciones.length).toBeGreaterThan(0);
    for (const o of opciones) expect(o.querySelector("svg")).not.toBeNull();
  });

  it("a 1024 las opciones miden al menos 44 px", async () => {
    simularPantalla({ ancho: 1024 });
    setup();
    open();
    const opciones = await screen.findAllByRole("option");
    for (const o of opciones) expect((o as HTMLElement).style.minHeight).toBe("44px");
  });

  it("R8: el buscador no encoge (su fila tampoco) y a 1707 la paleta es la ventana flotante", async () => {
    simularPantalla({ ancho: 1707, alto: 743 });
    setup();
    open();
    const campo = await screen.findByRole("combobox", { name: "Buscar en la paleta" });
    expect(campo.style.flexShrink).toBe("0");
    expect(campo.style.height).toBe("var(--field-h)");
    expect((campo.parentElement as HTMLElement).style.flexShrink).toBe("0");
    expect(campo).toHaveAttribute("placeholder", "Buscar una sección, un paciente o una acción…");
    const dlg = screen.getByRole("dialog", { name: "Paleta de mandos" });
    expect(dlg.style.width).toBe("640px");
    expect(dlg.style.maxHeight).toBe("min(560px, 72vh)");
    expect(screen.queryByRole("button", { name: "Cerrar la paleta" })).toBeNull();
  });

  it("R8: a 390 la paleta ocupa la pantalla, con placeholder corto y cierre de 44 px", async () => {
    simularPantalla({ ancho: 390, alto: 700 });
    setup();
    const field = open();
    const campo = await screen.findByRole("combobox", { name: "Buscar en la paleta" });
    expect(campo).toHaveAttribute("placeholder", "Buscar…");
    const dlg = screen.getByRole("dialog", { name: "Paleta de mandos" });
    expect(dlg.style.width).toBe("100%");
    expect(dlg.style.height).toBe("100dvh");
    expect(dlg.style.maxHeight).toBe("");
    expect((dlg.parentElement as HTMLElement).style.paddingTop).toBe("0px");
    const cerrar = screen.getByRole("button", { name: "Cerrar la paleta" });
    expect(cerrar.style.width).toBe("44px");
    expect(cerrar.style.height).toBe("44px");
    fireEvent.click(cerrar);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("a 1280 no se fuerza el alto táctil", async () => {
    simularPantalla({ ancho: 1280 });
    setup();
    open();
    const opciones = await screen.findAllByRole("option");
    expect((opciones[0] as HTMLElement).style.minHeight).toBe("");
  });

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

  it("con «reanudarBloqueado», Recientes se ve deshabilitado con la pista y Enter no reanuda", async () => {
    const onResume = vi.fn();
    render(<CommandPalette onOpenPatient={vi.fn()} onResume={onResume} reanudarBloqueado="Guarda o descarta los cambios del análisis antes" />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = screen.getByLabelText("Buscar en la paleta");
    fireEvent.change(search, { target: { value: "reanudar" } });
    const rows = await screen.findAllByRole("option");
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.getAttribute("aria-disabled")).toBe("true");
      expect(r.textContent).toContain("Guarda o descarta los cambios del análisis antes");
    }
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.click(rows[1]);
    expect(onResume).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("la lista de pacientes se vuelve a pedir en cada apertura", async () => {
    setup();
    open();
    await waitFor(() => expect(listPatients).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getByLabelText("Buscar en la paleta"), { key: "Escape" });
    listPatients.mockResolvedValue([P96, P2, P3, patient(7, "Nuevo, Paciente", "HC-7")]);
    await act(async () => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }); });
    fireEvent.change(screen.getByLabelText("Buscar en la paleta"), { target: { value: "nuevo, paciente" } });
    expect(await screen.findByText("Nuevo, Paciente")).toBeTruthy();
    expect(listPatients).toHaveBeenCalledTimes(2);
  });

  it("con una hoja abierta, ni Ctrl+K ni el evento abren la paleta", async () => {
    setup();
    const { unmount } = render(<Sheet open onClose={vi.fn()} title="Ficha"><p>cuerpo</p></Sheet>);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    act(() => { window.dispatchEvent(new Event(OPEN_PALETTE_EVENT)); });
    expect(screen.queryByRole("dialog", { name: "Paleta de mandos" })).toBeNull();
    unmount();
  });

  it("con un diálogo de confirmación abierto, Ctrl+K no abre la paleta", async () => {
    setup();
    const { unmount } = render(
      <ConfirmDialog open title="¿Borrar?" confirmLabel="Borrar" onCancel={vi.fn()} onConfirm={vi.fn()}>x</ConfirmDialog>,
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    act(() => { window.dispatchEvent(new Event(OPEN_PALETTE_EVENT)); });
    expect(screen.queryByRole("dialog", { name: "Paleta de mandos" })).toBeNull();
    unmount();
  });

  it("el Escape de la paleta no llega a las capas de debajo", async () => {
    const enDocumento = vi.fn();
    document.addEventListener("keydown", enDocumento);
    try {
      setup();
      open();
      enDocumento.mockClear();
      fireEvent.keyDown(screen.getByLabelText("Buscar en la paleta"), { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(enDocumento).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", enDocumento);
    }
  });

  it("cada grupo es un role=group nombrado por su rótulo, con sus opciones dentro", async () => {
    setup();
    open();
    const grupo = await screen.findByRole("group", { name: "Ir a" });
    expect(within(grupo).getAllByRole("option").map((o) => o.textContent)).toContain("Estudios");
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
