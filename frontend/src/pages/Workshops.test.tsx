/* El directorio de talleres: quién puede tocarlo y qué avisa antes de borrar.

   Existe porque el único sitio donde se podía dar de alta un taller era el
   formulario de pedido, y ese formulario no se dibuja cuando la familia
   NAVARRO™ no puede construir la forma que el caso pide. En un caso fenestrado
   no había ninguna puerta al taller. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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

vi.mock("../components/Topbar", () => ({ Topbar: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { WorkshopsPage } from "./Workshops";
import type { Workshop } from "../api/types";

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
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo taller/ }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Precisión Andina" } });
    fireEvent.change(screen.getByLabelText(/NIF/), { target: { value: "B99999999" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Titanio grado 5" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar taller/ }));
    await waitFor(() => expect(addWorkshop).toHaveBeenCalled());
    expect(addWorkshop.mock.calls[0][0]).toMatchObject({
      name: "Precisión Andina", tax_id: "B99999999", notes: "Titanio grado 5",
    });
  });

  it("will not save one without a name", async () => {
    listWorkshops.mockResolvedValue([]);
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo taller/ }));
    const save = screen.getByRole("button", { name: /Registrar taller/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
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
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Taller Mecánico Sur");
    expect((screen.getByLabelText(/NIF/) as HTMLInputElement).value).toBe("B12345678");
  });

  it("warns that a past order keeps its own copy", async () => {
    // Corregir una dirección no puede reescribir a dónde se mandó un pedido.
    listWorkshops.mockResolvedValue([shop()]);
    render(<WorkshopsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    expect(screen.getByText(/no cambia a dónde se mandó un pedido antiguo/)).toBeInTheDocument();
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
    expect(screen.getByText(/no se pierde a dónde se mandó ninguno/)).toBeInTheDocument();
    expect(deleteWorkshop).not.toHaveBeenCalled();
  });
});
