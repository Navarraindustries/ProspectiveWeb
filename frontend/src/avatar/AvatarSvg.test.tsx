import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarSvg, tono } from "./AvatarSvg";
import { COLORES_PELO, FONDOS, PIJAMAS, configPorDefecto, type AvatarConfig } from "./config";

const base = { ...configPorDefecto(1), peinado: "corto", cabeza: "nada", ojos: "nada", mascarilla: false };
const q = (c: typeof base, s: string) => render(<AvatarSvg config={c} size={64} />).container.querySelector(s);

describe("AvatarSvg", () => {
  it("pinta pelo superior sin gorro y no con gorro", () => {
    expect(q(base, '[data-pieza="pelo-superior"]')).not.toBeNull();
    expect(q({ ...base, cabeza: "gorro" }, '[data-pieza="pelo-superior"]')).toBeNull();
    expect(q({ ...base, cabeza: "gorro" }, '[data-pieza="gorro"]')).not.toBeNull();
    expect(q({ ...base, cabeza: "gorro_amplio" }, '[data-pieza="pelo-superior"]')).toBeNull();
  });
  it("mascarilla oculta la boca", () => {
    expect(q(base, '[data-pieza="boca"]')).not.toBeNull();
    expect(q({ ...base, mascarilla: true }, '[data-pieza="boca"]')).toBeNull();
    expect(q({ ...base, mascarilla: true }, '[data-pieza="mascarilla"]')).not.toBeNull();
  });
  it("lupas y gafas", () => {
    expect(q({ ...base, ojos: "lupas" }, '[data-pieza="lupas"]')).not.toBeNull();
    expect(q(base, '[data-pieza="lupas"]')).toBeNull();
    expect(q({ ...base, ojos: "gafas" }, '[data-pieza="gafas"]')).not.toBeNull();
  });
  it("cada peinado se dibuja", () => {
    for (const p of ["corto", "largo", "mono", "rapado", "rizado", "coleta"])
      expect(q({ ...base, peinado: p }, "svg")).not.toBeNull();
  });
  it("title -> aria-label; sin title aria-hidden", () => {
    const { container, rerender } = render(<AvatarSvg config={base} size={40} title="Ana" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Ana");
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    rerender(<AvatarSvg config={base} size={40} />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });
  it("una config incompleta o con colores raros no rompe: cada color cae al primero de su lista", () => {
    const rota = { v: 1, piel: 99, peinado: "corto", cabeza: "nada", ojos: "nada", mascarilla: false,
      pelo: "rojo", fondo: "#12" } as unknown as AvatarConfig;
    const { container } = render(<AvatarSvg config={rota} size={64} title="Ana" />);
    expect(container.querySelector('[data-pieza="fondo"]')!.getAttribute("fill")).toBe(FONDOS[0]);
    expect(container.querySelector('[data-pieza="cuerpo"] path')!.getAttribute("fill")).toBe(PIJAMAS[0]);
    expect(container.querySelector('[data-pieza="pelo-superior"] path')!.getAttribute("fill")).toBe(COLORES_PELO[0]);
    expect(container.querySelector('[data-pieza="cabeza"]')!.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("tono() devuelve tal cual lo que no es #rrggbb", () => {
    expect(tono("rojo", -0.2)).toBe("rojo");
    expect(tono("#abc", 0.2)).toBe("#abc");
    expect(tono("#000000", 0.5)).toBe("#808080");
  });
});
