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

  it("saved muestra la hora local", () => {
    render(<SaveStatus state="saved" savedAt={new Date(2026, 9, 31, 12, 3)} />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Guardado 12:03$/);
  });
});
