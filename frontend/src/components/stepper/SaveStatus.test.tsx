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

  it("compacta: solo el punto a la vista, el texto accesible y en title", () => {
    render(<SaveStatus state="dirty" compacta />);
    const s = screen.getByRole("status");
    expect(s).toHaveTextContent("Cambios sin guardar");
    expect(s.getAttribute("title")).toBe("Cambios sin guardar");
  });

  it("saved muestra la hora local", () => {
    render(<SaveStatus state="saved" savedAt={new Date(2026, 9, 31, 12, 3)} />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Guardado 12:03$/);
  });
});
