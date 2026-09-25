import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HudReadout } from "./HudReadout";

describe("HudReadout", () => {
  it("renders plain lines one per row", () => {
    const { container } = render(<HudReadout at="bl" lines={["193/384", "W 80  L 40"]} />);
    expect(container.firstElementChild?.textContent).toBe("193/384\nW 80  L 40");
  });

  it("draws the scene colour as a swatch before a coloured line", () => {
    const { container } = render(
      <HudReadout at="bl" lines={[{ text: "Ø CUELLO 1.7 mm", color: "rgb(51, 191, 255)" }]} />,
    );
    expect(screen.getByText("Ø CUELLO 1.7 mm")).toBeInTheDocument();
    const swatch = container.querySelector(".hud-swatch") as HTMLElement;
    expect(swatch).not.toBeNull();
    expect(swatch.style.background).toBe("rgb(51, 191, 255)");
  });
});
