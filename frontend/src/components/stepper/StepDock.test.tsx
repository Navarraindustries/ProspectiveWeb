import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MORPHO_AUTO_HINT, STEPS } from "../../pipeline/steps";
import { BURBUJA_MS, StepDock } from "./StepDock";
import * as commands from "../../lib/commands";

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
  it("un paso completado después del actual lleva la marca de hecho", () => {
    render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} doneFor={(i) => i <= 2} onGo={() => {}} />);
    expect(screen.getByRole("button", { name: /Paso 2,/ })).toHaveAttribute("data-estado", "hecho");
    expect(screen.getByRole("button", { name: /Paso 3,/ })).toHaveAttribute("data-estado", "hecho");
    expect(screen.getByRole("button", { name: /Paso 4,/ })).toHaveAttribute("data-estado", "pendiente");
  });
  it("el aviso va en el tooltip y en el nombre accesible, y pulsar sigue navegando", () => {
    const onGo = vi.fn();
    render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} avisoFor={(i) => (i === 3 ? MORPHO_AUTO_HINT : null)} onGo={onGo} />);
    const b = screen.getByRole("button", { name: `Paso 4, Morfometría. ${MORPHO_AUTO_HINT}` });
    expect(b).toHaveAttribute("title", `Morfometría — ${MORPHO_AUTO_HINT}`);
    fireEvent.click(b);
    expect(onGo).toHaveBeenCalledWith(3);
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

  describe("por pantalla", () => {
    const nav = () => screen.getByRole("navigation", { name: "Flujo de planificación" });
    it("mini: tres botones (anterior, píldora, siguiente), sin ⌘K", () => {
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} modo="mini" />);
      expect(nav()).toHaveAttribute("data-modo", "mini");
      expect(screen.getAllByRole("button")).toHaveLength(3);
      expect(screen.queryByRole("button", { name: /paleta de mandos/ })).toBeNull();
      expect(screen.getByRole("button", { name: `Paso 3 de 8, ${steps[2].label}. Ver todos los pasos` })).toHaveTextContent(`3/8 · ${steps[2].label}`);
    });
    it("mini: la píldora abre la paleta; anterior y siguiente navegan", () => {
      const abrir = vi.spyOn(commands, "openCommandPalette").mockImplementation(() => {});
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={onGo} modo="mini" />);
      fireEvent.click(screen.getByRole("button", { name: /Ver todos los pasos/ }));
      expect(abrir).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: /^Paso anterior:/ }));
      expect(onGo).toHaveBeenLastCalledWith(1);
      fireEvent.click(screen.getByRole("button", { name: /^Paso siguiente:/ }));
      expect(onGo).toHaveBeenLastCalledWith(3);
      abrir.mockRestore();
    });
    it("mini: «‹» en el paso 0 está deshabilitado", () => {
      render(<StepDock steps={steps} activeIndex={0} missingFor={() => null} onGo={() => {}} modo="mini" />);
      expect(screen.getByRole("button", { name: "Primer paso" })).toBeDisabled();
    });
    it("mini: «›» bloqueado lleva aria-disabled, el motivo en title y no navega", () => {
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={0} missingFor={(i) => (i === 1 ? "Sube un estudio" : null)} onGo={onGo} modo="mini" />);
      const b = screen.getByRole("button", { name: /^Paso siguiente:/ });
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b).toHaveAttribute("title", "Sube un estudio");
      expect(b.getAttribute("aria-label")).toContain("Sube un estudio");
      fireEvent.click(b);
      expect(onGo).not.toHaveBeenCalled();
    });
    it("mini: el aviso del paso siguiente llega a su nombre accesible", () => {
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} avisoFor={(i) => (i === 3 ? MORPHO_AUTO_HINT : null)} onGo={() => {}} modo="mini" />);
      expect(screen.getByRole("button", { name: new RegExp(MORPHO_AUTO_HINT.slice(0, 20)) })).toHaveAttribute("title", expect.stringContaining(MORPHO_AUTO_HINT));
    });
    it("tactil: los 8 pasos miden 44 px, sin ⌘K (no hay teclado), sin rótulo flotante", () => {
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} modo="tactil" />);
      expect(nav()).toHaveAttribute("data-modo", "tactil");
      const bs = screen.getAllByRole("button", { name: /^Paso [0-9]/ });
      expect(bs).toHaveLength(8);
      for (const b of bs) expect((b as HTMLElement).style.width).toBe("44px");
      expect(screen.queryByRole("button", { name: /paleta de mandos/ })).toBeNull();
      expect(screen.getAllByRole("button")).toHaveLength(8);
      expect(screen.queryByText(`3 · ${steps[2].label}`)).toBeNull();
    });
    it.each(["completo", "compacto"] as const)("%s: conserva el atajo de la paleta (Ctrl K fuera de Mac)", (modo) => {
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} modo={modo} />);
      const boton = screen.getByRole("button", { name: /paleta de mandos/ });
      expect(boton).toHaveTextContent("Ctrl K");
      expect(boton).toHaveAttribute("aria-keyshortcuts", "Control+K");
    });
    it("tactil: un paso hecho enseña su número y el ✓; con ratón, solo el ✓", () => {
      const { unmount } = render(<StepDock steps={steps} activeIndex={4} missingFor={() => null} onGo={() => {}} modo="tactil" />);
      const b = screen.getByRole("button", { name: /^Paso 3,/ });
      expect(b).toHaveAttribute("data-estado", "hecho");
      expect(b).toHaveTextContent(/^3$/);
      expect(b.querySelector('[data-marca="hecho"] svg')).not.toBeNull();
      unmount();
      render(<StepDock steps={steps} activeIndex={4} missingFor={() => null} onGo={() => {}} modo="compacto" />);
      const c = screen.getByRole("button", { name: /^Paso 3,/ });
      expect(c.textContent).toBe("");
      expect(c.querySelector("svg")).not.toBeNull();
    });
    it("compacto: 36 px; completo: 44 px y el activo 60", () => {
      const { unmount } = render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} modo="compacto" />);
      for (const b of screen.getAllByRole("button", { name: /^Paso [0-9]/ })) expect((b as HTMLElement).style.width).toBe("36px");
      unmount();
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} onGo={() => {}} />);
      expect(nav()).toHaveAttribute("data-modo", "completo");
      expect(screen.getByRole("button", { name: /^Paso 3,/ }).style.width).toBe("60px");
    });
  });

  describe("burbuja en táctil (nada solo en title)", () => {
    afterEach(() => { vi.useRealTimers(); });
    const burbuja = () => screen.getByRole("status");
    const bloqueaDeteccion = (i: number) => (i === 2 ? "Segmenta el vaso primero" : null);

    it.each(["tactil", "mini"] as const)("%s: tocar un bloqueado enseña el motivo a la vista y no navega", (modo) => {
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={1} missingFor={bloqueaDeteccion} onGo={onGo} modo={modo} />);
      expect(burbuja()).toBeEmptyDOMElement();
      const b = modo === "mini"
        ? screen.getByRole("button", { name: /^Paso siguiente:/ })
        : screen.getByRole("button", { name: /^Paso 3,/ });
      fireEvent.click(b);
      expect(onGo).not.toHaveBeenCalled();
      expect(burbuja()).toHaveTextContent("Segmenta el vaso primero");
      expect(burbuja().textContent).toContain("Detección");
    });

    it("se oculta sola a los 3 s", () => {
      reducida.valor = true; // sin la animación de salida, que no avanza con relojes falsos
      vi.useFakeTimers();
      render(<StepDock steps={steps} activeIndex={1} missingFor={bloqueaDeteccion} onGo={() => {}} modo="tactil" />);
      fireEvent.click(screen.getByRole("button", { name: /^Paso 3,/ }));
      expect(burbuja()).toHaveTextContent("Segmenta el vaso primero");
      act(() => { vi.advanceTimersByTime(BURBUJA_MS + 600); });
      expect(burbuja()).toBeEmptyDOMElement();
    });

    it("se oculta al tocar fuera del dock", () => {
      reducida.valor = true;
      render(<div><p>fuera</p><StepDock steps={steps} activeIndex={1} missingFor={bloqueaDeteccion} onGo={() => {}} modo="tactil" /></div>);
      fireEvent.click(screen.getByRole("button", { name: /^Paso 3,/ }));
      expect(burbuja()).toHaveTextContent("Segmenta el vaso primero");
      fireEvent.pointerDown(screen.getByText("fuera"));
      expect(burbuja()).toBeEmptyDOMElement();
    });

    it("con movimiento reducido la burbuja aparece sin capa animada", () => {
      reducida.valor = true;
      render(<StepDock steps={steps} activeIndex={1} missingFor={bloqueaDeteccion} onGo={() => {}} modo="tactil" />);
      fireEvent.click(screen.getByRole("button", { name: /^Paso 3,/ }));
      const pastilla = burbuja().firstElementChild as HTMLElement;
      expect(pastilla).toHaveAttribute("data-glass");
      expect(pastilla).toHaveTextContent("Segmenta el vaso primero");
    });

    it.each(["tactil", "mini"] as const)("%s: el paso 4 con aviso lo enseña al primer toque y navega al segundo", (modo) => {
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={2} missingFor={() => null} avisoFor={(i) => (i === 3 ? MORPHO_AUTO_HINT : null)} onGo={onGo} modo={modo} />);
      const b = () => modo === "mini"
        ? screen.getByRole("button", { name: /^Paso siguiente:/ })
        : screen.getByRole("button", { name: /^Paso 4,/ });
      fireEvent.click(b());
      expect(onGo).not.toHaveBeenCalled();
      expect(burbuja()).toHaveTextContent(MORPHO_AUTO_HINT);
      fireEvent.click(b());
      expect(onGo).toHaveBeenCalledWith(3);
    });

    /* R17: en el paso activo no hay nada que confirmar antes de entrar. */
    it("táctil: el paso ACTIVO con aviso navega al primer toque y la burbuja solo informa", () => {
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={3} missingFor={() => null} avisoFor={(i) => (i === 3 ? MORPHO_AUTO_HINT : null)} onGo={onGo} modo="tactil" />);
      fireEvent.click(screen.getByRole("button", { name: /^Paso 4,/ }));
      expect(onGo).toHaveBeenCalledTimes(1);
      expect(onGo).toHaveBeenCalledWith(3);
      expect(burbuja()).toHaveTextContent(MORPHO_AUTO_HINT);
      expect(burbuja().textContent).not.toMatch(/Toca otra vez/);
    });

    it("mini: «‹» respeta el bloqueo del paso anterior como «›»", () => {
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={3} missingFor={bloqueaDeteccion} onGo={onGo} modo="mini" />);
      const b = screen.getByRole("button", { name: /^Paso anterior:/ });
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b.getAttribute("aria-label")).toContain("Segmenta el vaso primero");
      fireEvent.click(b);
      expect(onGo).not.toHaveBeenCalled();
      expect(burbuja()).toHaveTextContent("Segmenta el vaso primero");
    });

    it.each(["completo", "compacto"] as const)("%s (ratón): el clic en un bloqueado enseña el motivo; el aviso navega al primer clic", async (modo) => {
      const onGo = vi.fn();
      render(<StepDock steps={steps} activeIndex={2} missingFor={(i) => (i === 5 ? "Falta" : null)} avisoFor={(i) => (i === 3 ? MORPHO_AUTO_HINT : null)} onGo={onGo} modo={modo} />);
      expect(screen.queryByRole("status")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^Paso 6,/ }));
      expect(onGo).not.toHaveBeenCalled();
      expect(burbuja()).toHaveTextContent("Paso 6, Dispositivos — Falta");
      // Un paso libre navega sin segundo clic y se lleva la burbuja.
      fireEvent.click(screen.getByRole("button", { name: /^Paso 4,/ }));
      expect(onGo).toHaveBeenCalledWith(3);
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    });
  });

  describe("«opcional» a la vista (no solo en el tooltip)", () => {
    it("completo: el rótulo del paso 7 activo lo dice", () => {
      render(<StepDock steps={steps} activeIndex={6} missingFor={() => null} onGo={() => {}} />);
      expect(screen.getByText("7 · Fabricación · opcional")).toBeInTheDocument();
    });

    it("mini: la píldora del paso 7 lo dice", () => {
      render(<StepDock steps={steps} activeIndex={6} missingFor={() => null} onGo={() => {}} modo="mini" />);
      expect(screen.getByText(`7/${steps.length} · Fabricación · opcional`)).toBeInTheDocument();
    });
  });
});
