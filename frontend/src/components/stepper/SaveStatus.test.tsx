import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SaveStatus } from "./SaveStatus";

describe("SaveStatus", () => {
  it.each([
    ["saving", null, "Guardando…"],
    ["dirty", null, "Cambios sin guardar"],
    ["clean", null, "Sin guardar"],
  ] as const)("%s → %s", (state, at, text) => {
    render(<SaveStatus state={state} savedAt={at} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("compacta: el texto entero sigue accesible y en title", () => {
    render(<SaveStatus state="dirty" compacta />);
    const s = screen.getByRole("status");
    expect(s).toHaveTextContent("Cambios sin guardar");
    expect(s.getAttribute("title")).toBe("Cambios sin guardar");
  });

  /* Táctil y móvil: el estado se distingue sin el color del punto. */
  it.each([
    ["saved", new Date(2026, 9, 31, 12, 3), "12:03 ✓", "Guardado 12:03"],
    ["dirty", null, "Sin guardar", "Cambios sin guardar"],
    ["clean", null, "Sin guardar", "Sin guardar"],
    ["saving", null, "…", "Guardando…"],
  ] as const)("compacta %s: «%s» a la vista a 13 px", (state, at, corto, entero) => {
    render(<SaveStatus state={state} savedAt={at} compacta />);
    const s = screen.getByRole("status");
    const visible = s.querySelector("[data-corto]")!;
    expect(visible.textContent).toBe(corto);
    expect(visible).toHaveAttribute("aria-hidden");
    expect(s.style.fontSize).toBe("13px");
    expect(s.getAttribute("title")).toBe(entero);
  });

  /* R13: en móvil solo el punto; la frase en aria-label, title y para la región viva. */
  it.each([
    ["dirty", null, "Cambios sin guardar"],
    ["clean", null, "Sin guardar"],
    ["saved", new Date(2026, 9, 31, 12, 3), "Guardado 12:03"],
  ] as const)("punto %s: sin texto a la vista, «%s» en aria-label y title", (state, at, frase) => {
    render(<SaveStatus state={state} savedAt={at} compacta punto />);
    const s = screen.getByRole("status", { name: frase });
    expect(s).toHaveAttribute("data-punto");
    expect(s.getAttribute("title")).toBe(frase);
    expect(s.querySelector("[data-corto]")).toBeNull();
    expect(s.querySelector(".ws-save-dot")).not.toBeNull();
    expect(s).toHaveTextContent(frase); // texto oculto: lo anuncia la región viva
  });

  it("saved muestra la hora local", () => {
    render(<SaveStatus state="saved" savedAt={new Date(2026, 9, 31, 12, 3)} />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Guardado 12:03$/);
  });
});

describe("SaveStatus: la forma del punto no depende del color", () => {
  it.each([
    ["dirty", null, "anillo"],
    ["clean", null, "anillo"],
    ["saved", new Date(2026, 9, 31, 12, 3), "lleno"],
    ["saving", null, "pulso"],
  ] as const)("%s → %s", (state, at, forma) => {
    render(<SaveStatus state={state} savedAt={at} compacta />);
    const s = screen.getByRole("status");
    expect(s.querySelector(".ws-save-dot")).toHaveAttribute("data-forma", forma);
  });

  it("el CSS dibuja el anillo hueco, el punto lleno y el pulso", async () => {
    const css = readFileSync(join(__dirname, "../shell/shell.css"), "utf8");
    expect(css).toMatch(/\[data-forma="anillo"\][^}]*background:\s*transparent/);
    expect(css).toMatch(/\[data-forma="lleno"\][^}]*background:\s*var\(--success\)/);
    expect(css).toMatch(/\[data-forma="pulso"\][^}]*animation:\s*ws-pulse/);
  });
});
