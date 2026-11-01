/* «Auditoría»: error de carga (F1-103), hora local (F1-101) y F2 (16):
   título, «Exportar» siempre, filtro por paciente, filas desplegables. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const auditBlocks = vi.fn();
const listPatients = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    auditBlocks: (o?: { patientId?: number }) => auditBlocks(o),
    listPatients: () => listPatients(),
    auditVerify: () => Promise.resolve({ ok: true, total_blocks: 0, broken: [] }),
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../components/shell/AppShell", async () => ({ AppShell: (await import("../test/shellMock")).ShellMock }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", username: "admin" } }) }));

import { AuditTrail } from "./AuditTrail";
import { fechaHora } from "../lib/fecha";
import { simularPantalla } from "../test/pantalla";

const bloque = (o: Record<string, unknown> = {}) => ({
  id: 1, iso_ts: "2026-10-11T03:01:00Z", username: "admin", action: "LOGIN",
  patient_hash: "", payload_json: "{}", block_hash: "abcdef0123456789abcdef", prev_hash: "0011223344",
  patient_id: null, patient_name: "",
  ...o,
});

afterEach(() => { vi.unstubAllGlobals(); });

beforeEach(() => {
  auditBlocks.mockReset();
  listPatients.mockReset();
  listPatients.mockResolvedValue([
    { id: 7, full_name: "Ana Pérez", hospital_id: "H-7" },
    { id: 8, full_name: "Luis Gil", hospital_id: "H-8" },
  ]);
});

describe("«Auditoría» con el API fallando", () => {
  it("muestra su propio error, no «vacía», y «Reintentar» vuelve a llamar", async () => {
    auditBlocks.mockRejectedValueOnce(Object.assign(new Error("Sin conexión con el servidor"),
      { status: 0, fromServer: false }));
    render(<AuditTrail onBack={() => {}} />);

    expect(await screen.findByText("No se pudo leer la cadena: Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/vacía/)).toBeNull();

    auditBlocks.mockResolvedValueOnce([bloque({ id: 0, username: "", action: "GENESIS" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Inicio de la cadena", { selector: "span" })).toBeTruthy();
    expect(auditBlocks).toHaveBeenCalledTimes(2);
  });

  it("mientras carga no dice que la cadena está vacía", () => {
    auditBlocks.mockReturnValueOnce(new Promise(() => {}));
    render(<AuditTrail onBack={() => {}} />);
    expect(screen.getByText("Cargando…")).toBeTruthy();
    expect(screen.queryByText(/vacía/)).toBeNull();
  });
});

describe("la columna de hora (F1-101)", () => {
  it("la celda muestra la hora local y la UTC va en el tooltip", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const celda = await screen.findByText(fechaHora("2026-10-11T03:01:00Z"));
    expect(celda.getAttribute("title")).toBe("UTC: 2026-10-11T03:01:00Z");
    expect(screen.getByText("Fecha y hora")).toBeTruthy();
  });
});

describe("F2 (16)", () => {
  it("título sin «SkullChain» y «Exportar» visible antes de verificar", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    const { container } = render(<AuditTrail onBack={() => {}} />);
    // El título es la miga de la barra; la descripción, su subtítulo.
    await screen.findByText("Inicio de sesión", { selector: "span" });
    expect(within(screen.getByRole("banner")).getByText("Cadena de bloques con firma; alterar un bloque invalida todos los siguientes.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/SkullChain|SHA-256/);
    const link = screen.getByRole("link", { name: /Exportar/ });
    expect(link.getAttribute("href")).toBe("/api/audit/export");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("el filtro «Paciente» llama al cliente con el id y muestra su nombre", async () => {
    auditBlocks.mockResolvedValue([bloque({ patient_hash: "deadbeef", patient_id: 7, patient_name: "Ana Pérez" })]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    const sel = await screen.findByLabelText("Paciente");
    await screen.findByRole("option", { name: "Ana Pérez · H-7" });
    fireEvent.change(sel, { target: { value: "7" } });
    await waitFor(() => expect(auditBlocks).toHaveBeenLastCalledWith({ patientId: 7 }));
    expect((await screen.findAllByText("Ana Pérez")).length).toBeGreaterThan(0);
  });

  it("con el filtro activo, un bloque sin huella muestra «—» y no el nombre", async () => {
    auditBlocks.mockResolvedValue([bloque({ patient_hash: "" })]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    await screen.findByRole("option", { name: "Ana Pérez · H-7" });
    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "7" } });
    await waitFor(() => expect(auditBlocks).toHaveBeenLastCalledWith({ patientId: 7 }));
    await screen.findByText("Inicio de sesión", { selector: "span" });
    expect(screen.queryByText("Ana Pérez")).toBeNull();
    expect(screen.getByText("—", { selector: "td" })).toBeTruthy();
  });

  it("un 404 del servidor muestra su detalle", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    await screen.findByRole("option", { name: "Luis Gil · H-8" });
    auditBlocks.mockRejectedValueOnce(Object.assign(new Error("Paciente no encontrado."), { status: 404, fromServer: true }));
    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "8" } });
    expect(await screen.findByText(/Paciente no encontrado\./)).toBeTruthy();
  });

  it("la fila se despliega con el detalle y los hashes; la columna «Hash bloque» no existe", async () => {
    auditBlocks.mockResolvedValueOnce([bloque({
      action: "TREATMENT_DECISION", payload_json: JSON.stringify({ decision: "clipaje", clips: [1, 2] }),
    })]);
    render(<AuditTrail onBack={() => {}} />);
    const fila = await screen.findByRole("button", { name: /Decisión de tratamiento/ });
    expect(fila.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Hash bloque")).toBeNull();
    expect(screen.queryByText("abcdef0123456789abcdef")).toBeNull();
    fireEvent.click(fila);
    expect(fila.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Decision")).toBeTruthy();
    expect(screen.getByText("clipaje")).toBeTruthy();
    expect(screen.getByText("1, 2")).toBeTruthy();
    expect(screen.getByText("Hash anterior")).toBeTruthy();
    expect(screen.getByText("abcdef0123456789abcdef")).toBeTruthy();
    expect(screen.getByText("0011223344")).toBeTruthy();
  });

  it("la acción a la vista en castellano; el código solo en tooltip y en el detalle (A58)", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const rotulo = await screen.findByText("Inicio de sesión", { selector: "span" });
    expect(rotulo.getAttribute("title")).toBe("LOGIN");
    expect(screen.queryByText("LOGIN")).toBeNull();
    expect(screen.queryByText(/· LOGIN/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Inicio de sesión/ }));
    const dt = screen.getByText("Código", { selector: "dt" });
    const dd = dt.nextElementSibling as HTMLElement;
    expect(dd.textContent).toBe("LOGIN");
    expect(dd.getAttribute("style")).toContain("--font-mono");
    // el desplegable de acciones solo en castellano
    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toContain("Inicio de sesión");
    expect(opciones.some((o) => o?.includes("LOGIN"))).toBe(false);
  });

  it("claves del detalle traducidas", async () => {
    auditBlocks.mockResolvedValueOnce([bloque({ action: "CAPTURE_SAVED", payload_json: '{"capture": 3, "ok": true}' })]);
    render(<AuditTrail onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Captura guardada/ }));
    expect(screen.getByText("Captura", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("Sí", { selector: "dd" })).toBeTruthy();
  });

  it("Paciente: el nombre, o «Paciente borrado o editado» (A59)", async () => {
    auditBlocks.mockResolvedValueOnce([
      bloque({ id: 1, patient_hash: "h1", patient_id: 7, patient_name: "Ana Prueba" }),
      bloque({ id: 2, patient_hash: "h2", patient_name: "" }),
      bloque({ id: 3, patient_hash: "" }),
    ]);
    render(<AuditTrail onBack={() => {}} />);
    expect(await screen.findByText("Ana Prueba")).toBeTruthy();
    const borrado = screen.getByText("Paciente borrado o editado");
    expect(borrado.getAttribute("title")).toMatch(/huella del paciente/);
    expect(screen.getAllByText("—", { selector: "td, th" }).length).toBeGreaterThan(0);
  });

  it("a 390 tarjetas con la acción de título y el resto a la vista (A60)", async () => {
    simularPantalla(390);
    auditBlocks.mockResolvedValueOnce([bloque({ patient_hash: "h1", patient_name: "Ana Prueba" })]);
    const { container } = render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Ana Prueba");
    expect(container.querySelector("[data-vista='tarjetas']")).not.toBeNull();
    expect(container.querySelector(".tt-tarjeta-titulo")!.textContent).toContain("Inicio de sesión");
    const dts = Array.from(container.querySelectorAll("dt")).map((d) => d.textContent);
    expect(dts).toEqual(expect.arrayContaining(["Fecha y hora", "Usuario", "Paciente"]));
  });

  it("a 1024 la fecha y la etiqueta de la acción pueden partir (I3)", async () => {
    simularPantalla(1024);
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const accion = await screen.findByText("Inicio de sesión", { selector: "span" });
    expect(accion).toHaveStyle({ whiteSpace: "normal" });
    const fecha = screen.getByText(fechaHora("2026-10-11T03:01:00Z"));
    expect(fecha.closest("td, th")!.getAttribute("style") ?? "").not.toMatch(/white-space:\s*nowrap/);
  });

  it("> 1024 la fecha y la acción no parten", async () => {
    simularPantalla(1280);
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const accion = await screen.findByText("Inicio de sesión", { selector: "span" });
    expect(accion).toHaveStyle({ whiteSpace: "nowrap" });
    expect(screen.getByText(fechaHora("2026-10-11T03:01:00Z")).closest("td, th")).toHaveStyle({ whiteSpace: "nowrap" });
  });

  it("la fecha va en sans con cifras tabulares, no en mono (M2)", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const fecha = await screen.findByText(fechaHora("2026-10-11T03:01:00Z"));
    expect(fecha).toHaveStyle({ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums", fontSize: "13px" });
  });

  it("un solo chevron por fila, que gira al desplegar (P6)", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const boton = await screen.findByRole("button", { name: /Inicio de sesión/ });
    const fila = boton.closest("tr")!;
    expect(fila.querySelectorAll("svg")).toHaveLength(1);
    expect(fila.querySelector(".tt-chevron")).toHaveAttribute("data-abierto", "false");
    fireEvent.click(boton);
    expect(fila.querySelectorAll("svg")).toHaveLength(1);
    expect(fila.querySelector(".tt-chevron")).toHaveAttribute("data-abierto", "true");
  });

  it("una sola fila «Paciente» en el detalle y sin claves repetidas (M6)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    auditBlocks.mockResolvedValueOnce([bloque({
      action: "CASE_DELETED", patient_hash: "h9", patient_name: "",
      payload_json: JSON.stringify({ patient: 9, patient_id: 9, case: 3 }),
    })]);
    render(<AuditTrail onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Caso eliminado/ }));
    const dts = screen.getAllByRole("term").map((d) => d.textContent);
    expect(dts.filter((t) => t === "Paciente")).toHaveLength(1);
    expect(dts).toContain("Id. del paciente");
    // El aviso de la huella sin paciente va dentro de esa fila.
    const dd = screen.getByText("Paciente", { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(dd).toHaveTextContent("9");
    expect(dd).toHaveTextContent(/huella del paciente/);
    expect(error.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
    error.mockRestore();
  });

  it("con filtro de paciente y sin bloques dice que el paciente no tiene registros (M6)", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    auditBlocks.mockResolvedValueOnce([]);
    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "7" } });
    expect(await screen.findByText("No hay registros de este paciente")).toBeInTheDocument();
    expect(screen.queryByText("La cadena está vacía.")).toBeNull();
  });

  it("a 1024 la tabla cabe sin minWidth ni scroll horizontal", async () => {
    simularPantalla(1024);
    auditBlocks.mockResolvedValueOnce([bloque()]);
    const { container } = render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    expect(screen.getByRole("table").getAttribute("style") ?? "").not.toMatch(/min-width/i);
    expect(container.innerHTML).not.toMatch(/overflow-x|table-scroll/);
  });

  it("verificación con plural escrito", async () => {
    auditBlocks.mockResolvedValue([bloque()]);
    const verif = vi.fn();
    const { api } = await import("../api/client");
    (api as unknown as { auditVerify: () => unknown }).auditVerify = verif;
    verif.mockResolvedValueOnce({ ok: false, total_blocks: 5, broken: [{ id: 2, action: "LOGIN", reason: "hash" }] });
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    fireEvent.click(screen.getByRole("button", { name: "Verificar integridad" }));
    expect(await screen.findByText("¡1 bloque corrupto!")).toBeTruthy();
    expect(screen.getByText(/Bloque #2 \(Inicio de sesión\)/)).toBeTruthy();
    verif.mockResolvedValueOnce({ ok: false, total_blocks: 5, broken: [{ id: 2, action: "LOGIN", reason: "a" }, { id: 3, action: "LOGIN", reason: "b" }] });
    fireEvent.click(screen.getByRole("button", { name: "Verificar integridad" }));
    expect(await screen.findByText("¡2 bloques corruptos!")).toBeTruthy();
  });
});

describe("la cabecera de «Auditoría» en la oficina", () => {
  it("el título está en la miga y el subtítulo en la barra", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión", { selector: "span" });
    const barra = within(screen.getByRole("banner"));
    expect(barra.getByText("Cadena de bloques con firma; alterar un bloque invalida todos los siguientes.")).toBeInTheDocument();
    // Las dos acciones principales viven en la barra.
    expect(barra.getByRole("button", { name: "Verificar integridad" })).toBeInTheDocument();
    expect(barra.getByRole("link", { name: /Exportar/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Registro de auditoría")).toBeNull();
  });
});

describe("cristal (fase 2)", () => {
  it("la tabla de bloques está dentro de un panel denso", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText(fechaHora("2026-10-11T03:01:00Z"));
    const panel = screen.getByRole("table").closest("[data-glass]");
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("style")).toContain("--glass-dense");
  });

  it("la fila de detalle desplegada va sin línea arriba y con fondo --muted", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Inicio de sesión/ }));
    expect(screen.getByText("Hash anterior").closest("tr")).toHaveClass("fila-detalle");
    const css = readFileSync(join(__dirname, "..", "styles", "office.css"), "utf8");
    const regla = css.match(/\.tabla-oficina tbody tr\.fila-detalle :is\(td, th\)\s*\{([^}]*)\}/);
    expect(regla).not.toBeNull();
    expect(regla![1]).toMatch(/border-top:\s*0/);
    expect(regla![1]).toMatch(/background:\s*var\(--muted\)/);
  });
});
