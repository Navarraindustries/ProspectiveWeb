import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));

import { OPEN_PALETTE_EVENT } from "../../lib/commands";
import { QuirofanoBar } from "./QuirofanoBar";

describe("QuirofanoBar", () => {
  it("la miga «Pacientes» es un botón que llama a su destino", () => {
    const onClick = vi.fn();
    render(<QuirofanoBar crumbs={[{ label: "Pacientes", onClick }, { label: "Sesión" }]} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Pacientes" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("«Volver a Pacientes» llama a onBack", () => {
    const onBack = vi.fn();
    render(<QuirofanoBar crumbs={[{ label: "Pacientes" }]} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver a Pacientes" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("con riesgo enseña la insignia, sin riesgo no", () => {
    const { rerender } = render(<QuirofanoBar crumbs={[]} onBack={vi.fn()} riskLabel="Alto" />);
    expect(screen.getByText("Alto")).toBeTruthy();
    rerender(<QuirofanoBar crumbs={[]} onBack={vi.fn()} riskLabel={null} />);
    expect(screen.queryByText("Alto")).toBeNull();
  });
  it("las dos pastillas son de cristal", () => {
    const { container } = render(<QuirofanoBar crumbs={[]} onBack={vi.fn()} />);
    expect(container.querySelectorAll("[data-glass]").length).toBe(2);
  });
  it("las dos píldoras van en una sola fila flex: la izquierda encoge, la derecha no", () => {
    // En portátiles (1280–1366) dos píldoras absolutas se solapaban.
    const { container } = render(<QuirofanoBar crumbs={[{ label: "Pacientes" }, { label: "Ana Pérez" }]} onBack={vi.fn()} />);
    const [izq, der] = Array.from(container.querySelectorAll<HTMLElement>("[data-glass]"));
    const fila = izq.parentElement as HTMLElement;
    expect(der.parentElement).toBe(fila);
    const s = fila.style;
    expect([s.position, s.top, s.left, s.right, s.display, s.gap, s.justifyContent])
      .toEqual(["absolute", "16px", "24px", "24px", "flex", "12px", "space-between"]);
    for (const p of [izq, der]) expect(p.style.position).not.toBe("absolute");
    expect(izq.style.flex).toBe("0 1 auto");
    expect(parseFloat(izq.style.minWidth)).toBe(0);
    expect(der.style.flexShrink).toBe("0");
  });
  it("lleva estado, acciones y el botón ⌘K que abre la paleta", () => {
    const fn = vi.fn();
    window.addEventListener(OPEN_PALETTE_EVENT, fn);
    render(<QuirofanoBar crumbs={[]} onBack={vi.fn()} status={<span>estado</span>} actions={<button>Acción</button>} />);
    expect(screen.getByText("estado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acción" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir la paleta de mandos (Ctrl+K)" }));
    window.removeEventListener(OPEN_PALETTE_EVENT, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
