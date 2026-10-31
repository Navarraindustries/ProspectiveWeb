import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "admin", institution: "" }, logout: vi.fn() }) }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));

import { OPEN_PALETTE_EVENT } from "../../lib/commands";
import { TopBar } from "./TopBar";

describe("TopBar", () => {
  it("es de cristal", () => {
    const { container } = render(<TopBar />);
    expect(container.querySelector("header.shell-top")?.hasAttribute("data-glass")).toBe(true);
  });
  it("el botón ⌘K abre la paleta", () => {
    const fn = vi.fn();
    window.addEventListener(OPEN_PALETTE_EVENT, fn);
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir la paleta de mandos (Ctrl+K)" }));
    window.removeEventListener(OPEN_PALETTE_EVENT, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
