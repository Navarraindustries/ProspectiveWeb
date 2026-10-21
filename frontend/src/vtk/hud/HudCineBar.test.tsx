import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HudCineBar } from "./HudCineBar";

describe("HudCineBar", () => {
  it("muestra el estado y emite las acciones", () => {
    const onPlay = vi.fn(), onStep = vi.fn(), onFps = vi.fn();
    render(<HudCineBar index={151} count={384} playing={false} fps={8} compact={false} onPlay={onPlay} onStep={onStep} onFps={onFps} />);
    expect(screen.getByText("152/384")).toBeInTheDocument(); expect(screen.getByText("8 fps")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Reproducir (espacio)")); expect(onPlay).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Corte siguiente (↑)")); expect(onStep).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTitle("Más rápido (+)")); expect(onFps).toHaveBeenCalledWith(9);
  });
});
