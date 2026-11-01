/* Cambio de contraseña propia: el texto de la sesión (A61). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { changePassword: vi.fn() } }));

import { ChangePasswordSheet } from "./ChangePasswordSheet";

describe("ChangePasswordSheet", () => {
  it("dice que la sesión sigue abierta, sin jerga (A61)", () => {
    render(<ChangePasswordSheet open onClose={() => {}} />);
    expect(screen.getByText("Tu sesión seguirá abierta en este equipo.")).toBeInTheDocument();
    expect(screen.queryByText(/token/)).toBeNull();
  });
});
