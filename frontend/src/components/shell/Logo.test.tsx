import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, LogoIcono, trazoIcono } from "./Logo";

describe("Logo", () => {
  it("trazoIcono sigue el lienzo por tamaño", () => {
    expect(trazoIcono(48)).toEqual({ trazo: 3.5, punto: 4.4, detalle: true });
    expect(trazoIcono(33)).toEqual({ trazo: 3.5, punto: 4.4, detalle: true });
    expect(trazoIcono(32)).toEqual({ trazo: 4, punto: 5, detalle: false });
    expect(trazoIcono(17)).toEqual({ trazo: 4, punto: 5, detalle: false });
    expect(trazoIcono(16)).toEqual({ trazo: 5, punto: 6, detalle: false });
  });
  it("app grande: cuadrado primario, icono a 2/3 y tres puntos", () => {
    const { container } = render(<LogoIcono size={48} variante="app" />);
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe("var(--primary)");
    expect(container.querySelector("g")!.getAttribute("transform")).toBe("translate(8 8) scale(0.666667)");
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(container.querySelector('circle[r="4.4"]')!.getAttribute("fill")).toBe("var(--logo-dot)");
  });
  it("la raíz lleva data-logo", () => {
    const { container } = render(<Logo />);
    expect(container.firstElementChild).toHaveAttribute("data-logo");
  });
  it("app de 32: simplificado, sin los puntos pequeños", () => {
    const { container } = render(<LogoIcono size={32} variante="app" />);
    expect(container.querySelector("g")!.getAttribute("transform")).toBe("translate(7.5 7.5) scale(0.6875)");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("circle")!.getAttribute("r")).toBe("5");
    expect(container.querySelector("g")!.getAttribute("stroke-width")).toBe("4");
  });
  it("app de 16: trazo 5, punto 6 y escala 0.8125", () => {
    const { container } = render(<LogoIcono size={16} variante="app" />);
    expect(container.querySelector("g")!.getAttribute("transform")).toBe("translate(4.5 4.5) scale(0.8125)");
    expect(container.querySelector("circle")!.getAttribute("r")).toBe("6");
  });
  it("línea: sin cuadrado, trazo currentColor y punto --data; con tono media, --brand-mist", () => {
    const { container, rerender } = render(<LogoIcono size={38} variante="linea" />);
    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelector("ellipse")!.closest("[stroke]")!.getAttribute("stroke")).toBe("currentColor");
    expect(container.querySelector('circle[r="4.4"]')!.getAttribute("fill")).toBe("var(--data)");
    rerender(<LogoIcono size={38} variante="linea" tono="media" />);
    expect(container.querySelector('circle[r="4.4"]')!.getAttribute("fill")).toBe("var(--brand-mist)");
  });
  it("completo: «Prospective» en Sora 600 con ™ y la firma", () => {
    render(<Logo size={38} />);
    const nombre = screen.getByText("Prospective");
    expect(nombre.style.fontFamily).toBe("var(--font-brand)");
    expect(nombre.style.fontWeight).toBe("600");
    expect(nombre.style.letterSpacing).toBe("-0.02em");
    expect(nombre.style.fontSize).toBe("24px");
    expect(nombre.querySelector("sup")!.textContent).toBe("™");
    expect(screen.getByText("por SkullApp").style.fontSize).toBe("12px");
  });
  it("sin firma y compacto", () => {
    const { container, rerender } = render(<Logo firma={false} />);
    expect(screen.queryByText("por SkullApp")).toBeNull();
    rerender(<Logo compact />);
    expect(container.textContent).toBe("");
  });
  it("tono media: firma en --on-media-muted", () => {
    render(<Logo tono="media" />);
    expect(screen.getByText("por SkullApp").style.color).toBe("var(--on-media-muted)");
  });
});
