import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CeilingControls, TubularControls } from "./TubularControls";

describe("TubularControls", () => {
  it("muestra el deslizador solo en el método tubular", () => {
    const { rerender } = render(<TubularControls method="tubular" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.getByLabelText(/Recuperar pared y sacos/)).toBeInTheDocument();
    rerender(<TubularControls method="threshold" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.queryByLabelText(/Recuperar pared y sacos/)).toBeNull();
  });
  it("cambia de método y de radio", () => {
    const onMethod = vi.fn(); const onReclaim = vi.fn();
    render(<TubularControls method="tubular" reclaimMm={3} onMethod={onMethod} onReclaim={onReclaim} />);
    fireEvent.click(screen.getByRole("radio", { name: /Umbral clásico/ }));
    expect(onMethod).toHaveBeenCalledWith("threshold");
    fireEvent.change(screen.getByLabelText(/Recuperar pared y sacos/), { target: { value: "2" } });
    expect(onReclaim).toHaveBeenCalledWith(2);
  });
  /* F1-132 y decisión 17: el deslizador del techo y su casilla salían
     apagados en tubular, con dos párrafos explicando que no mandaban. */
  it("en tubular no hay deslizador de techo, solo una línea", () => {
    const techo = <input type="range" aria-label="Umbral superior" />;
    const { rerender } = render(<CeilingControls method="tubular">{techo}</CeilingControls>);
    expect(screen.queryByLabelText("Umbral superior")).toBeNull();
    expect(screen.getByText("Sin techo en el método tubular")).toBeInTheDocument();
    rerender(<CeilingControls method="threshold">{techo}</CeilingControls>);
    expect(screen.getByLabelText("Umbral superior")).toBeInTheDocument();
    expect(screen.queryByText("Sin techo en el método tubular")).toBeNull();
  });
  it("el bloque tubular ya no repite que no usa el techo", () => {
    render(<TubularControls method="tubular" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.queryByText(/no usa el techo/)).toBeNull();
  });
});
