/* «Usuarios» con el API fallando (F1-88).

   El error salía junto a «0 usuarios» y «No hay usuarios que coincidan con la
   búsqueda»: parecía que la búsqueda no encontraba a nadie. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const listUsers = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const deleteUser = vi.fn();
const usersBrief = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    listUsers: () => listUsers(),
    createUser: (...a: unknown[]) => createUser(...a),
    updateUser: (...a: unknown[]) => updateUser(...a),
    deleteUser: (...a: unknown[]) => deleteUser(...a),
    usersBrief: () => usersBrief(),
    setUserPhoto: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));
// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { actions?: import("react").ReactNode; children?: import("react").ReactNode }) => <>{p.actions}{p.children}</>,
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", username: "admin" } }) }));

import { UsersAdmin } from "./UsersAdmin";
import { fechaHora } from "../lib/fecha";
import { ROLE_PERMITE } from "../lib/roles";

beforeEach(() => {
  listUsers.mockReset();
  createUser.mockReset().mockResolvedValue({});
  updateUser.mockReset().mockResolvedValue({});
  deleteUser.mockReset().mockResolvedValue(undefined);
  usersBrief.mockReset().mockResolvedValue([]);
  sessionStorage.clear();
});

const cuenta = (o: Record<string, unknown> = {}) => ({
  id: 2, username: "mrestrepo", full_name: "María Restrepo", role: "medico", status: "active",
  is_active: true, created_at: "2026-10-01T00:00:00Z", specialty: "Neurología", hospital: "H. Navarra",
  university: "UNAV", position: "Médico adjunto", has_photo: false, has_cv: false, rejected_at: null, ...o,
});

describe("«Usuarios» con el API fallando", () => {
  it("muestra el error sin el vacío de búsqueda y «Reintentar» vuelve a llamar", async () => {
    listUsers.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<UsersAdmin onBack={() => {}} />);

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/No hay usuarios que coincidan/)).toBeNull();
    expect(screen.queryByText(/0 usuarios/)).toBeNull();

    listUsers.mockResolvedValueOnce([{
      id: 2, username: "mrestrepo", full_name: "María Restrepo", role: "medico", is_active: true,
      created_at: "2026-10-01T00:00:00Z", specialty: "", hospital: "",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("María Restrepo")).toBeTruthy();
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});

describe("la columna «Creado» (F1-83)", () => {
  it("lee la fecha del servidor como UTC y la muestra en hora local", async () => {
    listUsers.mockResolvedValueOnce([{
      id: 2, username: "mrestrepo", full_name: "María Restrepo", role: "medico", is_active: true,
      created_at: "2026-10-11T03:28:00+00:00", specialty: "", hospital: "",
    }]);
    render(<UsersAdmin onBack={() => {}} />);
    // La conversión a UTC−5 (22:28 del día anterior) se fija en fecha.test.ts con zona explícita.
    expect(await screen.findByText(fechaHora("2026-10-11T03:28:00+00:00"))).toBeTruthy();
  });
});
describe("la línea bajo «Rol» (F1-86)", () => {
  it("cambia con el rol elegido y el rótulo de la contraseña dice «mín. 8»", async () => {
    listUsers.mockResolvedValueOnce([]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo usuario/ }));
    expect(screen.getByText("Médico: ves y editas los pacientes que creas; firmas pedidos")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña * (mín. 8)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "viewer" } });
    expect(screen.getByText("Observador: ves y editas los pacientes que creas; no firmas pedidos")).toBeTruthy();
    expect(screen.queryByText(/^Médico: ves/)).toBeNull();
  });
});

/* F2-44: el administrador iba en rojo, el color de error y de borrar. */
describe("la insignia de rol (F2-44)", () => {
  it("ningún rol va en el color de error", async () => {
    listUsers.mockResolvedValueOnce([
      cuenta({ id: 1, username: "admin", full_name: "Admin", role: "admin" }),
      cuenta(),
    ]);
    render(<UsersAdmin onBack={() => {}} />);
    for (const t of ["Administrador", "Médico"]) {
      const insignia = await screen.findByText(t);
      expect(insignia.getAttribute("style") ?? "").not.toContain("destructive");
    }
  });
});

/* F2-45: especialidad, hospital, universidad y cargo también se corrigen. */
describe("«Editar usuario» (F2-45, F1-84)", () => {
  it("muestra los campos del alta y guarda lo cambiado sin enviar is_active si no cambió", async () => {
    listUsers.mockResolvedValue([cuenta()]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByTitle("Editar"));
    for (const l of ["Nombre completo", "Rol", "Especialidad", "Hospital / Centro", "Universidad", "Cargo"]) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
    expect(screen.getByText("Foto de perfil")).toBeTruthy();
    expect((screen.getByLabelText("Hospital / Centro") as HTMLInputElement).value).toBe("H. Navarra");
    fireEvent.change(screen.getByLabelText("Hospital / Centro"), { target: { value: "Clínica Universidad" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    const [id, cuerpo] = updateUser.mock.calls[0];
    expect(id).toBe(2);
    expect(cuerpo).toMatchObject({ hospital: "Clínica Universidad", specialty: "Neurología", university: "UNAV", position: "Médico adjunto" });
    expect("is_active" in cuerpo).toBe(false);
  });

  it("envía is_active cuando la casilla cambia", async () => {
    listUsers.mockResolvedValue([cuenta()]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByTitle("Editar"));
    fireEvent.click(screen.getByLabelText(/Cuenta activa/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser.mock.calls[0][1].is_active).toBe(false);
  });

  /* F2-T3: la línea del rol en la hoja de edición, para cada rol. */
  it.each(["admin", "medico", "residente", "viewer"])("la línea del rol %s sale en la hoja", async (rol) => {
    listUsers.mockResolvedValue([cuenta({ role: rol })]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByTitle("Editar"));
    expect(screen.getByText(ROLE_PERMITE[rol])).toBeTruthy();
  });
});

/* F2-47 y F2-48. */
describe("«Nuevo usuario» (F2-47, F2-48)", () => {
  it("pide cuatro campos y esconde el resto en «Más datos (opcional)», sin nada preseleccionado", async () => {
    listUsers.mockResolvedValue([]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo usuario/ }));
    for (const l of ["Nombre completo", "Usuario", "Rol"]) expect(screen.getByLabelText(new RegExp(`^${l}`))).toBeTruthy();
    expect(screen.queryByLabelText("Universidad")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Más datos \(opcional\)/ }));
    expect(screen.getByLabelText("Universidad")).toBeTruthy();
    expect((screen.getByLabelText("Especialidad") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Cargo") as HTMLSelectElement).value).toBe("");
  });

  it("crea con los cuatro datos y deja especialidad y cargo vacíos", async () => {
    listUsers.mockResolvedValue([]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo usuario/ }));
    fireEvent.change(screen.getByLabelText(/^Nombre completo/), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByLabelText(/^Usuario/), { target: { value: "aperez" } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: "claveSegura1" } });
    fireEvent.change(screen.getByLabelText(/^Confirmar/), { target: { value: "claveSegura1" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));
    expect(createUser.mock.calls[0][0]).toMatchObject({ username: "aperez", full_name: "Ana Pérez", specialty: "", position: "" });
  });

  it("cada error sale junto a su campo, todos a la vez, y no al pie", async () => {
    listUsers.mockResolvedValue([]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo usuario/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    expect(await screen.findByText("El nombre completo es obligatorio.")).toBeTruthy();
    expect(screen.getByText("El usuario debe tener al menos 3 caracteres.")).toBeTruthy();
    expect(screen.getByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
    expect(screen.getByLabelText(/^Nombre completo/).getAttribute("aria-invalid")).toBe("true");
    expect(createUser).not.toHaveBeenCalled();
  });
});

/* F2-46: los pacientes de la cuenta borrada pasan a quien se elige. */
describe("«Eliminar usuario» (F2-46)", () => {
  const brief = [
    { id: 1, username: "admin", full_name: "Admin", role: "admin" },
    { id: 2, username: "mrestrepo", full_name: "María Restrepo", role: "medico" },
    { id: 3, username: "jgil", full_name: "Juan Gil", role: "medico" },
  ];
  const abrir = async () => {
    listUsers.mockResolvedValue([cuenta()]);
    usersBrief.mockResolvedValue(brief);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByTitle("Eliminar"));
    return (await screen.findByLabelText("Reasignar sus pacientes a…")) as HTMLSelectElement;
  };

  it("por defecto los pacientes pasan a quien borra", async () => {
    const sel = await abrir();
    expect(screen.getByText(/Sus pacientes pasarán a la cuenta elegida/)).toBeTruthy();
    expect(screen.queryByText(/quedarán sin propietario/)).toBeNull();
    expect(sel.value).toBe("");
    expect(within(sel).getByText("A mí (admin)")).toBeTruthy();
    expect(within(sel).queryByText(/María Restrepo/)).toBeNull();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(2, undefined));
  });

  it("manda la cuenta elegida", async () => {
    const sel = await abrir();
    fireEvent.change(sel, { target: { value: "3" } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(2, 3));
  });
});

/* F1-82: Activo, Pendiente, Rechazada o Desactivada según lo que envía el servidor. */
describe("la columna «Estado» (F1-82)", () => {
  it("distingue rechazo de desactivación a mano", async () => {
    listUsers.mockResolvedValueOnce([
      cuenta({ id: 2, username: "a", full_name: "Cuenta A" }),
      cuenta({ id: 3, username: "b", full_name: "Cuenta B", status: "pending", is_active: false }),
      cuenta({ id: 4, username: "c", full_name: "Cuenta C", status: "rejected", is_active: false, rejected_at: "2026-10-02T10:00:00+00:00" }),
      cuenta({ id: 5, username: "d", full_name: "Cuenta D", status: "rejected", is_active: false }),
    ]);
    render(<UsersAdmin onBack={() => {}} />);
    await screen.findByText("Cuenta A");
    for (const t of ["Activo", "Pendiente", "Rechazada", "Desactivada"]) expect(screen.getAllByText(t)).toHaveLength(1);
  });
});

describe("«Restablecer contraseña»", () => {
  it("el campo conserva el foco al teclear y pulsar con el campo vacío dice el mínimo", async () => {
    listUsers.mockResolvedValue([cuenta()]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByTitle("Restablecer contraseña"));
    const dialogo = screen.getByRole("alertdialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Restablecer" }));
    expect(within(dialogo).getByText("Mínimo 8 caracteres.")).toBeTruthy();
    const campo = within(dialogo).getByLabelText("Nueva contraseña (mín. 8)") as HTMLInputElement;
    campo.focus();
    fireEvent.change(campo, { target: { value: "abc" } });
    expect(document.activeElement).toBe(campo);
  });
});
