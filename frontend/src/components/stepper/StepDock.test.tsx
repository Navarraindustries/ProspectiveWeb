import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEPS } from "../../pipeline/steps";
import { StepDock } from "./StepDock";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

const steps = STEPS;

describe("StepDock", () => {
  beforeEach(() => { reducida.valor = false; });

  it("un paso bloqueado va apagado con el motivo y no navega", () => {
    const onGo = vi.fn();
    render(<StepDock steps={steps} activeIndex={0} missingFor={(i) => (i === 2 ? "Segmenta el vaso primero" : null)} onGo={onGo} />);
    const b = screen.getByRole("button", { name: /Detección.*Segmenta el vaso primero/ });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAttribute("title", "Segmenta el vaso primero");
    fireEvent.click(b);
    expect(onGo).not.toHaveBeenCalled();
  });
  it("un paso opcional lo dice en su nombre accesible y en el tooltip", () => {
    render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} onGo={() => {}} />);
    const b = screen.getByRole("button", { name: "Paso 7, Fabricación (opcional)" });
    expect(b).toHaveAttribute("title", "Fabricación (opcional)");
    expect(screen.getByRole("button", { name: `Paso 1, ${steps[0].label}` })).toHaveAttribute("title", steps[0].label);
  });
  it("el activo lleva aria-current=step", () => {
    render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} />);
    expect(screen.getByRole("button", { name: /Detección/ })).toHaveAttribute("aria-current", "step");
  });
  it("los completados consecutivos llevan la marca de hecho y uno no consecutivo no", () => {
    render(<StepDock steps={steps} activeIndex={4} missingFor={(i) => (i === 1 ? "Falta" : null)} onGo={() => {}} />);
    expect(screen.getByRole("button", { name: /Paso 1,/ })).toHaveAttribute("data-estado", "hecho");
    expect(screen.getByRole("button", { name: /Paso 3,/ })).not.toHaveAttribute("data-estado", "hecho");
  });
  it("pulsar un paso libre llama a onGo", () => {
    const onGo = vi.fn();
    render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} onGo={onGo} />);
    fireEvent.click(screen.getByRole("button", { name: /Detección/ }));
    expect(onGo).toHaveBeenCalledWith(2);
  });
  it("con movimiento reducido el puntero no cambia ninguna escala", () => {
    reducida.valor = true;
    render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} onGo={() => {}} />);
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Flujo de planificación" }), { clientX: 10 });
    for (const b of screen.getAllByRole("button", { name: /Paso \d/ })) expect(b).toHaveAttribute("data-escala", "1");
  });
  it("sin movimiento reducido el botón bajo el puntero se amplía a 1.25", () => {
    render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} onGo={() => {}} />);
    const b = screen.getByRole("button", { name: /Paso 3,/ });
    b.getBoundingClientRect = () => ({ left: 100, width: 40, right: 140, top: 0, bottom: 40, height: 40, x: 100, y: 0, toJSON() {} });
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Flujo de planificación" }), { clientX: 120 });
    expect(b).toHaveAttribute("data-escala", "1.25");
  });
});
