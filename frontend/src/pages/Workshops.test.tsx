/* El directorio de talleres: quién puede tocarlo y qué avisa antes de borrar.

   Existe porque el único sitio donde se podía dar de alta un taller era el
   formulario de pedido, y ese formulario no se dibuja cuando la familia
   NAVARRO™ no puede construir la forma que el caso pide. En un caso fenestrado
   no había ninguna puerta al taller. */

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const listWorkshops = vi.fn();
const addWorkshop = vi.fn();
const updateWorkshop = vi.fn();
const deleteWorkshop = vi.fn();
const user = { role: "medico" as string };

vi.mock("../api/client", () => ({
  api: {
    listWorkshops: (...a: unknown[]) => listWorkshops(...(a as [])),
    addWorkshop: (...a: unknown[]) => addWorkshop(...(a as [])),
    updateWorkshop: (...a: unknown[]) => updateWorkshop(...(a as [])),
    deleteWorkshop: (...a: unknown[]) => deleteWorkshop(...(a as [])),
  },
  ApiError: class ApiError extends Error {},
}));

// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", async () => ({ AppShell: (await import("../test/shellMock")).ShellMock }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { WorkshopsPage } from "./Workshops";
import type { Workshop } from "../api/types";
import { fechaEpoch } from "../lib/fecha";
import { simularPantalla } from "../test/pantalla";

// Con la lista vacía hay dos «Nuevo taller» (barra y estado vacío): la de la barra.
const abrirDesdeBarra = async () =>
  within(await screen.findByRole("banner")).getByRole("button", { name: /Nuevo taller/ });

const shop = (over: Partial<Workshop> = {}): Workshop => ({
  id: "w1", name: "Taller Mecánico Sur", contact_name: "J. Pérez",
  email: "taller@example.com", phone: "600000000", address: "Calle 1",
  tax_id: "B12345678", notes: "Entrega en 3 semanas",
  created_at: 1_780_000_000, last_used_at: 0, order_count: 0,
  ...over,
});

beforeEach(() => {
  listWorkshops.mockReset();
  addWorkshop.mockReset();
  updateWorkshop.mockReset();
  deleteWorkshop.mockReset();
  addWorkshop.mockResolvedValue(shop());
  updateWorkshop.mockResolvedValue(shop());
  deleteWorkshop.mockResolvedValue({ deleted: true });
  user.role = "medico";
});

describe("registering a workshop without opening an order", () => {
  it("takes the fields the order form never asked for", async () => {
    // El NIF y las notas los guardaba el backend desde el principio; el
    // formulario del pedido no los pedía, así que un convenio real no cabía.
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    fireEvent.click(await abrirDesdeBarra());
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Precisión Andina" } });
    fireEvent.change(screen.getByLabelText(/NIF/), { target: { value: "B99999999" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Titanio grado 5" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar taller/ }));
    await waitFor(() => expect(addWorkshop).toHaveBeenCalled());
    expect(addWorkshop.mock.calls[0][0]).toMatchObject({
      name: "Precisión Andina", tax_id: "B99999999", notes: "Titanio grado 5",
    });
  });

  it("will not save one without a name, and says so only after trying", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    fireEvent.click(await abrirDesdeBarra());
    // F2-63: antes de escribir nada el campo no nace en rojo.
    expect(screen.getByLabelText(/Nombre/)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: /Registrar taller/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Registrar taller/ }));
    expect(addWorkshop).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText(/Nombre/));
    expect(screen.getByLabelText(/Nombre/)).toHaveAttribute("aria-invalid", "true");
  });

  it("flags the name when it is cleared after typing", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    fireEvent.click(await abrirDesdeBarra());
    const name = screen.getByLabelText(/Nombre/);
    fireEvent.change(name, { target: { value: "X" } });
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("states the copy rule once, under «Cómo se usa» (F2-64)", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    fireEvent.click(await abrirDesdeBarra());
    expect(screen.queryByText(/guardan su propia copia/)).toBeNull();
    expect(screen.getAllByText(/sigue diciendo a dónde se mandó/)).toHaveLength(1);
  });

  it("says where a registered workshop shows up", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    expect(await screen.findByText(/Fabricación/)).toBeInTheDocument();
  });
});

describe("correcting one", () => {
  it("opens with the current details filled in", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe("Taller Mecánico Sur");
    expect((screen.getByLabelText(/NIF/) as HTMLInputElement).value).toBe("B12345678");
  });
});

describe("who may delete", () => {
  it("does not offer it to a médico", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    await screen.findByText("Taller Mecánico Sur");
    expect(screen.queryByRole("button", { name: /Borrar/ })).toBeNull();
    expect(screen.getByText(/cosa del administrador/)).toBeInTheDocument();
  });

  it("offers it to an admin, and asks first", async () => {
    user.role = "admin";
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Borrar/ }));
    expect(screen.getByText(/Deja de poder elegirse en\s+pedidos nuevos/)).toBeInTheDocument();
    expect(deleteWorkshop).not.toHaveBeenCalled();
  });

  it("un doble clic en «Borrar» manda un solo DELETE, y mientras viaja no se cancela", async () => {
    user.role = "admin";
    listWorkshops.mockResolvedValue([shop()]);
    let terminar: (v: { deleted: boolean }) => void = () => {};
    deleteWorkshop.mockReturnValue(new Promise((r) => { terminar = r; }));
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Borrar/ }));
    const dialogo = screen.getByRole("alertdialog", { name: "Borrar taller" });
    const confirmar = within(dialogo).getByRole("button", { name: "Borrar" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    expect(deleteWorkshop).toHaveBeenCalledTimes(1);
    expect(within(dialogo).getByRole("button", { name: "Borrando…" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "Borrar taller" })).toBeInTheDocument();
    terminar({ deleted: true });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

/* «Cancelar», el ✕, Escape y el clic fuera cerraban la hoja y tiraban lo
   escrito sin preguntar. */
describe("descartar el taller a medio escribir", () => {
  it("«Cancelar» con algo escrito pregunta, y «Seguir editando» lo conserva", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    fireEvent.click(await abrirDesdeBarra());
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Precisión Andina" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const pregunta = screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    fireEvent.click(within(pregunta).getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe("Precisión Andina");
  });

  it("Escape también pregunta, y «Descartar cambios» cierra sin guardar", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Otra nota" } });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" }))
      .getByRole("button", { name: "Descartar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar taller" })).toBeNull());
    expect(updateWorkshop).not.toHaveBeenCalled();
  });

  it("sin cambios, «Cancelar» cierra sin preguntar", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar taller" })).toBeNull());
  });
});

describe("con el API fallando (F1-104)", () => {
  it("muestra el error sin «Todavía no hay talleres…» y «Reintentar» vuelve a llamar", async () => {
    listWorkshops.mockRejectedValueOnce(Object.assign(new Error("Error 500"), { status: 500, fromServer: false }));
    render(<WorkshopsPage />);

    expect(await screen.findByText("No se pudo leer el directorio: El servidor no responde")).toBeTruthy();
    expect(screen.queryByText(/Todavía no hay talleres/)).toBeNull();

    listWorkshops.mockResolvedValueOnce([shop()]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Taller Mecánico Sur")).toBeTruthy();
    expect(listWorkshops).toHaveBeenCalledTimes(2);
  });
});

describe("la cabecera de «Talleres» en la oficina", () => {
  it("el título está en la miga y el subtítulo en la barra", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    await screen.findByText(/Todavía no hay talleres/);
    const barra = within(screen.getByRole("banner"));
    expect(barra.getByText("Quién fabrica las piezas. Se escriben una vez y se eligen en cada pedido.")).toBeInTheDocument();
    // «Nuevo taller» vive en la barra, no en el cuerpo.
    expect(barra.getByRole("button", { name: /Nuevo taller/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getAllByText(/Quién fabrica las piezas/)).toHaveLength(1);
  });
});

describe("cristal (fase 2)", () => {
  it("la lista de talleres está dentro de un panel de cristal", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    const nombre = await screen.findByText("Taller Mecánico Sur");
    const panel = nombre.closest("[data-glass]");
    expect(panel).not.toBeNull();
    expect(panel!.tagName).toBe("ARTICLE");
  });
});

describe("Talleres con el estilo D (A47–A50)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cada taller es una tarjeta de cristal con Editar y Borrar del mismo sistema (A47, A48)", async () => {
    user.role = "admin";
    listWorkshops.mockResolvedValue([shop({ name: "Taller Uno" })]);
    render(<WorkshopsPage />);
    const tarjeta = (await screen.findByText("Taller Uno")).closest("article")!;
    expect(tarjeta).toHaveAttribute("data-glass");
    expect(within(tarjeta).getByRole("button", { name: "Editar el taller Taller Uno" })).toHaveAttribute("data-variant", "outline");
    expect(within(tarjeta).getByRole("button", { name: "Borrar el taller Taller Uno" })).toHaveAttribute("data-variant", "destructive-ghost");
    // El rótulo visible sigue siendo corto.
    expect(within(tarjeta).getByRole("button", { name: "Editar el taller Taller Uno" })).toHaveTextContent(/^Editar$/);
  });

  it("alta y último pedido en sans 13 px; mono solo en el NIF (M1)", async () => {
    listWorkshops.mockResolvedValue([shop({ created_at: 1730000000, last_used_at: 1740000000 })]);
    render(<WorkshopsPage />);
    await screen.findByText("Taller Mecánico Sur");
    const linea = screen.getByTestId("tl-alta");
    expect(linea).toHaveStyle({ fontSize: "13px" });
    expect(linea.getAttribute("style") ?? "").not.toContain("--font-mono");
    expect([...linea.querySelectorAll("[data-mono]")].map((e) => e.textContent)).toEqual(["B12345678"]);
    expect(within(linea).getByText(fechaEpoch(1730000000))).toHaveStyle({ fontVariantNumeric: "tabular-nums" });
  });

  it("fechas de alta y uso en dd/mm/aa y plural escrito", async () => {
    listWorkshops.mockResolvedValue([shop({ created_at: 1730000000, last_used_at: 1740000000, order_count: 2 })]);
    render(<WorkshopsPage />);
    const tarjeta = (await screen.findByText("Taller Mecánico Sur")).closest("article")!;
    expect(tarjeta.textContent).toContain(`alta ${fechaEpoch(1730000000)}`);
    expect(tarjeta.textContent).toContain(`último pedido ${fechaEpoch(1740000000)}`);
    expect(within(tarjeta).getByText("2 pedidos")).toBeInTheDocument();
  });

  it("hoja: nombre obligatorio, notas en varias líneas y registrar apagado sin nombre (A49)", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    fireEvent.click(await abrirDesdeBarra());
    expect(screen.getByLabelText(/Nombre/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("Notas").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: "Registrar taller" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Taller Dos" } });
    expect(screen.getByRole("button", { name: "Registrar taller" })).not.toBeDisabled();
  });

  it("«Cómo se usa» es una pista con icono, solo con talleres en la lista (A50, P4)", async () => {
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    await screen.findByText("Taller Mecánico Sur");
    expect(screen.getByText("Cómo se usa")).toBeInTheDocument();
    expect(screen.getByRole("note").querySelector("svg")).not.toBeNull();
  });

  it("con error de carga no sale «Cómo se usa» (P4)", async () => {
    listWorkshops.mockRejectedValue(new Error("caído"));
    render(<WorkshopsPage />);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("Cómo se usa")).toBeNull();
  });

  it("sin talleres, estado vacío con botón y sin «Cómo se usa» (A50, P4)", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    expect(await screen.findByText("Todavía no hay talleres")).toBeInTheDocument();
    expect(screen.queryByText("Cómo se usa")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    const vacio = screen.getByText("Todavía no hay talleres").closest("[data-glass]") as HTMLElement;
    fireEvent.click(within(vacio).getByRole("button", { name: "Nuevo taller" }));
    expect(screen.getByRole("button", { name: "Registrar taller" })).toBeInTheDocument();
  });

  it("a 360 la rejilla es una columna y la hoja usa dos columnas hasta 640", async () => {
    simularPantalla(360);
    listWorkshops.mockResolvedValue([shop()]);
    const { container } = render(<WorkshopsPage />);
    await screen.findByText("Taller Mecánico Sur");
    expect(container.querySelector(".tl-rejilla")).not.toBeNull();
    fireEvent.click(await abrirDesdeBarra());
    expect(document.querySelector(".hoja-dos-columnas")).not.toBeNull();
  });
});

describe("Talleres · enlace a sus pedidos", () => {
  it("la insignia «N pedidos» lleva a Pedidos buscando por el taller", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    listWorkshops.mockResolvedValue([shop({ name: "Taller Ñu & Cía", order_count: 2 })]);
    render(<MemoryRouter><WorkshopsPage /></MemoryRouter>);
    const enlace = await screen.findByRole("link", { name: "2 pedidos" });
    expect(enlace.getAttribute("href")).toBe(`/app/pedidos?q=${encodeURIComponent("Taller Ñu & Cía")}`);
  });
});
