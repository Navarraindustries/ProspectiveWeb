/* F1-110: el aviso «Tienes cambios sin guardar» solo dejaba quedarse o salir
   perdiendo el trabajo; para guardar había que cerrarlo, buscar «Guardar
   progreso» y volver a pulsar el enlace. Ahora tiene «Guardar y salir». */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnsavedExitDialog } from "./UnsavedExitDialog";

function montar(over: Partial<Parameters<typeof UnsavedExitDialog>[0]> = {}) {
  const props = {
    open: true, hasPatient: false, attached: true,
    onStay: vi.fn(), onLeave: vi.fn(), saveNow: vi.fn(async () => true),
    ...over,
  };
  render(<UnsavedExitDialog {...props} />);
  return props;
}

describe("aviso de salida con cambios sin guardar", () => {
  it("el aviso tiene tres botones", () => {
    montar();
    expect(screen.getAllByRole("button").map((b) => b.textContent))
      .toEqual(["Seguir aquí", "Guardar y salir", "Salir sin guardar"]);
  });

  it("«Guardar y salir» guarda antes de navegar", async () => {
    const orden: string[] = [];
    const p = montar({
      saveNow: vi.fn(async () => { orden.push("guardar"); return true; }),
      onLeave: vi.fn(() => { orden.push("salir"); }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" }));
    await waitFor(() => expect(p.onLeave).toHaveBeenCalledTimes(1));
    expect(orden).toEqual(["guardar", "salir"]);
  });

  it("si el guardado falla no navega y lo dice dentro del aviso", async () => {
    const p = montar({ saveNow: vi.fn(async () => false) });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" })); });
    expect(p.onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("No se pudo guardar el progreso. Vuelve a intentarlo o sal sin guardar.");
    expect(screen.getByRole("button", { name: "Guardar y salir" })).not.toBeDisabled();
  });

  it("«Salir sin guardar» no guarda", () => {
    const p = montar();
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(p.onLeave).toHaveBeenCalledTimes(1);
    expect(p.saveNow).not.toHaveBeenCalled();
  });

  it("sin caso nombra el botón que lo ata: «Archivar en un caso» si hay paciente", () => {
    montar({ attached: false, hasPatient: true });
    expect(screen.getByRole("alertdialog").textContent).toContain("Archivar en un caso");
    expect(screen.getByRole("alertdialog").textContent).not.toContain("Adjuntar a un caso");
  });

  it("sin caso ni paciente sigue diciendo «Adjuntar a un caso»", () => {
    montar({ attached: false, hasPatient: false });
    expect(screen.getByRole("alertdialog").textContent).toContain("Adjuntar a un caso");
  });

  /* Revisión de la Tarea 16: Escape o clic fuera durante «Guardando…»
     cerraban el aviso, y al terminar el guardado se navegaba igual con el
     blocker viejo; un fallo dejaba el error para la próxima vez. */
  it("mientras guarda, Escape y clic fuera no cancelan; al terminar sale", async () => {
    let terminar!: (ok: boolean) => void;
    const p = montar({ saveNow: vi.fn(() => new Promise<boolean>((r) => { terminar = r; })) });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("alertdialog").parentElement!);
    expect(p.onStay).not.toHaveBeenCalled();
    await act(async () => { terminar(true); });
    expect(p.onLeave).toHaveBeenCalledTimes(1);
  });

  it("si el aviso se cierra desde fuera mientras guarda, el resultado no navega ni deja error", async () => {
    let terminar!: (ok: boolean) => void;
    const props = {
      hasPatient: false, attached: true, onStay: vi.fn(), onLeave: vi.fn(),
      saveNow: vi.fn(() => new Promise<boolean>((r) => { terminar = r; })),
    };
    const { rerender } = render(<UnsavedExitDialog open {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" }));
    rerender(<UnsavedExitDialog open={false} {...props} />);
    await act(async () => { terminar(false); });
    expect(props.onLeave).not.toHaveBeenCalled();
    rerender(<UnsavedExitDialog open {...props} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un error de un intento anterior no reaparece al volver a abrir", async () => {
    const props = { hasPatient: false, attached: true, onStay: vi.fn(), onLeave: vi.fn(), saveNow: vi.fn(async () => false) };
    const { rerender } = render(<UnsavedExitDialog open {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" })); });
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(<UnsavedExitDialog open={false} {...props} />);
    rerender(<UnsavedExitDialog open {...props} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
