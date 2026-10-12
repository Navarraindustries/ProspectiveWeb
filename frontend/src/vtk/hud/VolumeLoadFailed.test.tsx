/* F1-8: con la meta del volumen caída la celda decía «CARGANDO…» para siempre. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VolumeLoadFailed } from "./VolumeLoadFailed";

describe("VolumeLoadFailed", () => {
  it("dice que no se pudo abrir el volumen y «Reintentar» vuelve a pedirlo", () => {
    const retry = vi.fn();
    render(<VolumeLoadFailed onRetry={retry} />);
    expect(screen.getByText("No se pudo abrir el volumen")).toBeInTheDocument();
    expect(screen.queryByText("CARGANDO…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
