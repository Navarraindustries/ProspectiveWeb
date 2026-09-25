import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HudToggleGroup } from "./HudToggleGroup";

describe("HudToggleGroup", () => {
  const opts = [{ key: "3d", label: "3D" }, { key: "vol", label: "VOLUMEN" }];
  it("brackets the active option and exposes it as pressed", () => {
    render(<HudToggleGroup options={opts} value="vol" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /VOLUMEN/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /VOLUMEN/ }).textContent).toBe("[ VOLUMEN ]");
    expect(screen.getByRole("button", { name: /3D/ }).textContent).toBe("3D");
  });
  it("calls onChange with the key", () => {
    const on = vi.fn();
    render(<HudToggleGroup options={opts} value="3d" onChange={on} />);
    fireEvent.click(screen.getByRole("button", { name: /VOLUMEN/ }));
    expect(on).toHaveBeenCalledWith("vol");
  });
});
