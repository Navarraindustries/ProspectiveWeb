import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HEADING_READOUT_PX, HudHeadingTape } from "./HudHeadingTape";

describe("HudHeadingTape", () => {
  it("brackets the cardinals and the readout while the orientation is assumed", () => {
    render(<HudHeadingTape azimuthDeg={0} elevationDeg={0} known={false} />);
    expect(screen.getByText("[ANT]")).toBeInTheDocument();
    expect(screen.getByTestId("heading-readout").textContent).toBe("[AZ 0° · EL 0°]");
  });

  it("drops the brackets when the orientation is known", () => {
    render(<HudHeadingTape azimuthDeg={90} elevationDeg={30} known />);
    expect(screen.getByText("IZQ")).toBeInTheDocument();
    expect(screen.getByTestId("heading-readout").textContent).toBe("AZ 90° · EL 30°");
  });

  it("keeps the cardinals in a clipped band that ends before the readout", () => {
    // Un rótulo cerca del borde derecho no puede pasar bajo «AZ … · EL …».
    render(<HudHeadingTape azimuthDeg={-40} elevationDeg={0} known />);
    const band = screen.getByTestId("heading-band");
    expect(band.style.overflow).toBe("hidden");
    expect(band.style.right).toBe(`${HEADING_READOUT_PX}px`);
    expect(band.contains(screen.getByText("ANT"))).toBe(true);
    expect(band.contains(screen.getByTestId("heading-readout"))).toBe(false);
  });
});
