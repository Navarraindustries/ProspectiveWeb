/* Cambio de contraseña propia: el texto de la sesión (A61). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { changePassword: vi.fn() } }));

import { ChangePasswordSheet } from "./ChangePasswordSheet";

describe("ChangePasswordSheet", () => {
  it("dice que la sesión sigue abierta, sin jerga (A61)", () => {
    render(<ChangePasswordSheet open onClose={() => {}} />);
    expect(screen.getByText("Tu sesión seguirá abierta en este equipo.")).toBeInTheDocument();
    expect(screen.queryByText(/token/)).toBeNull();
  });
  it("la nota de la sesión y el aviso de validación van a 13 px (M8)", () => {
    render(<ChangePasswordSheet open onClose={() => {}} />);
    expect(screen.getByText("Tu sesión seguirá abierta en este equipo.").style.fontSize).toBe("13px");
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: "abc" } });
    expect(screen.getByText(/al menos/).style.fontSize).toBe("13px");
  });
});
