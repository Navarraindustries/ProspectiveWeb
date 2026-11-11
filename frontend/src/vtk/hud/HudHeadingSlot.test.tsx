import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HudHeadingSlot } from "./HudHeadingSlot";

const TL = ["CANDIDATOS ANEURISMÁTICOS", "Candidato 1 · Ø 11,6 mm"];

function conAncho(w: number) {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(w);
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("HudHeadingSlot", () => {
  it("coloca la cinta a la derecha del rótulo", () => {
    conAncho(800);
    render(<HudHeadingSlot tl={TL} tr={["3D"]} azimuthDeg={0} elevationDeg={0} known />);
    const tape = screen.getByTestId("heading-band").parentElement!;
    expect(tape.style.left).toBe("198px");
    expect(tape.style.top).toBe("24px");
  });
  it("no pinta nada si no cabe", () => {
    conAncho(450);
    render(<HudHeadingSlot tl={TL} tr={["3D"]} azimuthDeg={0} elevationDeg={0} known />);
    expect(screen.getByTestId("heading-slot")).toBeInTheDocument();
    expect(screen.queryByTestId("heading-band")).toBeNull();
  });
});
