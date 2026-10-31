import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => true,
}));

import { Odometro } from "./Odometro";

describe("Odometro", () => {
  it("con null pinta — y no anima", () => {
    render(<Odometro value={null} decimals={1} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("con movimiento reducido pinta el valor final", () => {
    const { rerender } = render(<Odometro value={null} decimals={1} />);
    rerender(<Odometro value={12.3} decimals={1} />);
    expect(screen.getByText("12,3")).toBeInTheDocument();
  });
  it("formatea con coma y los decimales pedidos", () => {
    render(<Odometro value={7} decimals={2} />);
    expect(screen.getByText("7,00")).toBeInTheDocument();
  });
});
