import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "./Switch";
import { simularPantalla } from "../test/pantalla";

afterEach(() => vi.unstubAllGlobals());

describe("Switch", () => {
  it("es un role=switch con el rótulo como nombre y alterna", () => {
    const onChange = vi.fn();
    render(<Switch checked label="Solo los abiertos" onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Solo los abiertos" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });
  it("deshabilitado no cambia", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} disabled label="A" onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toBeDisabled();
  });
  it("la descripción es aria-describedby", () => {
    render(<Switch checked={false} label="A" descripcion="x" onChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAccessibleDescription("x");
  });
  it("≥ 44 px por debajo de 1024 y 36 px por encima", () => {
    simularPantalla(1024);
    const { unmount } = render(<Switch checked={false} label="A" onChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveStyle({ minHeight: "44px" });
    unmount();
    vi.unstubAllGlobals();
    simularPantalla(1280);
    render(<Switch checked={false} label="A" onChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveStyle({ minHeight: "36px" });
  });
});
