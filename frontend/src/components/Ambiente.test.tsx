import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { simularPantalla } from "../test/pantalla";
import { Ambiente } from "./Ambiente";

afterEach(() => vi.unstubAllGlobals());

it("pinta la capa decorativa y los hijos encima; sin imagen", () => {
  const { container } = render(<Ambiente><p>contenido</p></Ambiente>);
  const capa = container.querySelector<HTMLElement>("[data-ambiente]")!;
  expect(capa).toHaveClass("ambiente");
  expect(capa).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("contenido").parentElement!.style.zIndex).toBe("1");
});

/** El marcado del Ambiente a un ancho dado. */
function marcadoA(ancho: number): string {
  const s = simularPantalla({ ancho });
  const { container, unmount } = render(<Ambiente><p>x</p></Ambiente>);
  const html = container.innerHTML;
  unmount();
  s.restaurar();
  return html;
}

it.each([360, 768, 1024, 2560])("a %i px el marcado es idéntico al de 1707 (el fondo no depende del ancho)", (ancho) => {
  const referencia = marcadoA(1707);
  expect(referencia).toContain("data-ambiente");
  expect(marcadoA(ancho)).toBe(referencia);
});

it("CSS: capa fija sin puntero, dos brillos en vmax sobre --canvas, grano ≤ 4 % y plano con transparencia reducida", () => {
  const css = readFileSync(join(__dirname, "../styles/ambiente.css"), "utf8").replace(/\r\n/g, "\n");
  expect(css).toMatch(/\.ambiente\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/);
  expect(css).toMatch(/radial-gradient\(\s*60vmax\s+60vmax\s+at\s+8%\s+0%\s*,\s*var\(--ambient-glow-1\)/);
  expect(css).toMatch(/radial-gradient\(\s*40vmax\s+40vmax\s+at\s+100%\s+100%\s*,\s*var\(--ambient-glow-2\)/);
  expect(css).toMatch(/opacity:\s*var\(--ambient-grain-opacity\)/);
  expect(css).toMatch(/@media\s*\(\s*prefers-reduced-transparency:\s*reduce\s*\)\s*\{\s*\.ambiente\s*\{\s*background:\s*var\(--canvas\);?\s*\}\s*\.ambiente::after\s*\{\s*display:\s*none;?/);
  expect(css).not.toMatch(/@media[^{]*(max|min)-width/);
  expect(css).not.toMatch(/animation/);
});
