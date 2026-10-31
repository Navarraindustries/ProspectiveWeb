import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STEPS } from "../../pipeline/steps";
import { StepRail } from "./StepRail";

const steps = STEPS;

describe("StepRail", () => {
  it("la línea de progreso llega hasta el último paso completado", () => {
    render(<StepRail steps={steps} activeIndex={3} missingFor={() => null} onGo={() => {}} />);
    const fill = document.querySelector(".ws-rail-progress > span") as HTMLElement;
    expect(fill.style.height).toBe(`${(100 * 3) / (steps.length - 1)}%`);
  });
  it("un paso bloqueado va apagado con el motivo y no navega", () => {
    const onGo = vi.fn();
    render(<StepRail steps={steps} activeIndex={0} missingFor={(i) => (i === 2 ? "Segmenta el vaso primero" : null)} onGo={onGo} />);
    const b = screen.getByRole("button", { name: /Detección/ });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("title", "Segmenta el vaso primero");
    fireEvent.click(b);
    expect(onGo).not.toHaveBeenCalled();
  });
  it("el activo lleva aria-current=step y los completados la marca", () => {
    render(<StepRail steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} />);
    expect(screen.getByRole("button", { name: /Detección/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Carga DICOM/ }).querySelector("svg")).not.toBeNull();
  });
});
