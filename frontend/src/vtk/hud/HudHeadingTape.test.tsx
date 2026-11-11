import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HudHeadingTape } from "./HudHeadingTape";

describe("HudHeadingTape", () => {
  it("pone los cardinales entre corchetes mientras la orientación es supuesta", () => {
    render(<HudHeadingTape azimuthDeg={0} elevationDeg={0} known={false} />);
    expect(screen.getByText("[ANT]")).toBeInTheDocument();
  });

  it("sin corchetes con la orientación conocida, y sin la cifra AZ · EL (decidido el 11-11)", () => {
    const { container } = render(<HudHeadingTape azimuthDeg={90} elevationDeg={30} known />);
    expect(screen.getByText("IZQ")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/AZ|EL \d/);
    expect(screen.queryByTestId("heading-readout")).toBeNull();
  });

  it("los cardinales van en una banda recortada a todo el ancho", () => {
    render(<HudHeadingTape azimuthDeg={-40} elevationDeg={0} known />);
    const band = screen.getByTestId("heading-band");
    expect(band.style.overflow).toBe("hidden");
    expect(band.style.right).toBe("0px");
    expect(band.contains(screen.getByText("ANT"))).toBe(true);
  });

  it("sin colocación propia mantiene el 20 % y la línea 6 (el MIP no cambia)", () => {
    render(<HudHeadingTape azimuthDeg={0} elevationDeg={0} known />);
    const tape = screen.getByTestId("heading-band").parentElement!;
    expect(tape.style.left).toBe("20%");
    expect(tape.style.top).toBe("6px");
  });
});
