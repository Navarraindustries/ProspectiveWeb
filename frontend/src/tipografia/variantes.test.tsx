import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SelectorTipografia } from "./SelectorTipografia";
import { aplicar, deLaUrl, iniciar } from "./variantes";

const raiz = () => document.documentElement;

afterEach(() => {
  delete raiz().dataset.tipografia;
  window.localStorage.clear();
});

describe("variantes tipográficas (UNI-135)", () => {
  it("sin parámetro ni nada guardado no toca nada", () => {
    expect(iniciar("")).toBeNull();
    expect(raiz().dataset.tipografia).toBeUndefined();
  });

  it("lee la variante de la URL e ignora la basura", () => {
    expect(deLaUrl("?tipografia=b")).toBe("b");
    expect(deLaUrl("?tipografia=C")).toBe("c");
    expect(deLaUrl("?tipografia=z")).toBeNull();
    expect(deLaUrl("?otra=a")).toBeNull();
  });

  it("la de la URL se aplica y se recuerda para la siguiente pantalla", () => {
    expect(iniciar("?tipografia=a")).toBe("a");
    expect(raiz().dataset.tipografia).toBe("a");
    delete raiz().dataset.tipografia;
    expect(iniciar("")).toBe("a");
    expect(raiz().dataset.tipografia).toBe("a");
  });

  it("«actual» vuelve a la identidad y apaga el modo", () => {
    iniciar("?tipografia=c");
    expect(iniciar("?tipografia=actual")).toBeNull();
    expect(raiz().dataset.tipografia).toBeUndefined();
    expect(iniciar("")).toBeNull();
  });

  it("el selector no aparece fuera del modo de variantes", () => {
    const { container } = render(<SelectorTipografia inicial={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("el selector cambia la variante de <html>", () => {
    aplicar("a");
    render(<SelectorTipografia inicial="a" />);
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(raiz().dataset.tipografia).toBe("b");
    expect(screen.getByText("B · Cifras de puntos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actual" }));
    expect(raiz().dataset.tipografia).toBeUndefined();
  });

  it("las variantes solo cuelgan de data-tipografia: la identidad no cambia", () => {
    const css = readFileSync(join(__dirname, "../styles/tokens/variantes-tipograficas.css"), "utf8");
    // Ninguna regla de :root a secas: todo va tras [data-tipografia=…].
    expect(css).not.toMatch(/:root\s*\{/);
    expect(css).toMatch(/:root\[data-tipografia="a"\][\s\S]*--font-sans:\s*"Helvetica Neue"/);
    expect(css).toMatch(/:root\[data-tipografia="b"\][\s\S]*--font-mono:\s*"Doto Cifras"/);
    // Doto recortada a cifras: las letras siguen en JetBrains Mono.
    expect(css).toMatch(/font-family:\s*"Doto Cifras";[\s\S]*unicode-range:[^;]*U\+0030-0039/);
    expect(css).not.toMatch(/googleapis/);
  });
});
