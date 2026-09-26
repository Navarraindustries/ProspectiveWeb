import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TubularControls } from "./TubularControls";

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
  it("dice que el método tubular no usa el techo", () => {
    const { rerender } = render(<TubularControls method="tubular" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.getByText(/El método tubular no usa el techo; el hueso se descarta por forma/)).toBeInTheDocument();
    rerender(<TubularControls method="threshold" reclaimMm={3} onMethod={() => {}} onReclaim={() => {}} />);
    expect(screen.queryByText(/no usa el techo/)).toBeNull();
  });
});
