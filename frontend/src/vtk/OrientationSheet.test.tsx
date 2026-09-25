import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const setOrientation = vi.fn();
vi.mock("../api/client", () => ({ api: { setOrientation: (...a: unknown[]) => setOrientation(...a) } }));

import { OrientationSheet } from "./OrientationSheet";

describe("OrientationSheet", () => {
  // Con llaves: una función devuelta por beforeEach es un hook de limpieza, y
  // mockReset() devuelve el propio mock, que vitest llamaría al terminar.
  beforeEach(() => { setOrientation.mockReset(); });

  it("applies optimistically and closes once the session saved it", async () => {
    setOrientation.mockResolvedValue({});
    const onApply = vi.fn(), onClose = vi.fn();
    render(<OrientationSheet open onClose={onClose} sessionId="s1" current={null} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onApply).toHaveBeenCalledWith({ anteriorEdge: "top", firstSliceSuperior: false });
    expect(setOrientation).toHaveBeenCalledWith("s1", { anterior_edge: "top", first_slice_superior: false });
  });

  it("restores the previous orientation and says so when the save fails", async () => {
    // Sin revertir, el visor enseñaría sin corchetes algo que al reanudar no vuelve.
    setOrientation.mockImplementation(async () => { throw new Error("Error 500"); });
    const previous = { anteriorEdge: "left" as const, firstSliceSuperior: true };
    const onApply = vi.fn(), onClose = vi.fn();
    render(<OrientationSheet open onClose={onClose} sessionId="s1" current={previous} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("En el axial, el borde anterior está…"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByText("No se guardó la orientación; se ha restablecido la anterior")).toBeInTheDocument();
    expect(onApply.mock.calls).toEqual([
      [{ anteriorEdge: "right", firstSliceSuperior: true }],
      [previous],
    ]);
    expect(onClose).not.toHaveBeenCalled();
  });
});
