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

it.each([360, 768, 1707, 2560])("a %i px el marcado es el mismo (el fondo no depende del ancho)", (ancho) => {
  const s = simularPantalla({ ancho });
  const { container } = render(<Ambiente><p>x</p></Ambiente>);
  expect(container.querySelectorAll("[data-ambiente]")).toHaveLength(1);
  s.restaurar();
});

it("CSS: capa fija sin puntero, dos brillos en vmax sobre --canvas, grano ≤ 4 % y plano con transparencia reducida", () => {
  const css = readFileSync(join(__dirname, "../styles/ambiente.css"), "utf8");
  expect(css).toMatch(/\.ambiente\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/);
  expect(css).toMatch(/radial-gradient\(60vmax 60vmax at 8% 0%, var\(--ambient-glow-1\)/);
  expect(css).toMatch(/radial-gradient\(40vmax 40vmax at 100% 100%, var\(--ambient-glow-2\)/);
  expect(css).toMatch(/opacity:\s*var\(--ambient-grain-opacity\)/);
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\.ambiente\s*\{\s*background:\s*var\(--canvas\);\s*\}\s*\.ambiente::after\s*\{\s*display:\s*none;/);
  expect(css).not.toMatch(/@media[^{]*(max|min)-width/);
  expect(css).not.toMatch(/animation/);
});
