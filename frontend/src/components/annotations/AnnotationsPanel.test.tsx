/* Panel «Anotaciones»: herramientas, lista editable y exportación. */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../vtk/annotations";
import { PlanningProvider, usePlanning } from "../../store/planning";
import { AnnotationsPanel } from "./AnnotationsPanel";

const regla: Annotation = {
  id: "a1", kind: "regla", points: [[0, 0, 3], [5, 0, 3]], plane: { plane: "axial", index: 2 },
  label: "R1", note: "", visible: true, created_at: "2026-10-08T10:00:00Z", created_by: "",
};
const marcador: Annotation = {
  id: "m1", kind: "marcador", points: [[1, 2, 3]], plane: null,
  label: "M1", note: "rama", visible: true, created_at: "2026-10-08T10:00:00Z", created_by: "",
};

let visto: ReturnType<typeof usePlanning> | null = null;
function montar(list: Annotation[] = []) {
  function Espia({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => { visto = p; });
    return <>{children}</>;
  }
  function Semilla() {
    const p = usePlanning();
    // Una vez: sesión y lista de partida.
    useEffect(() => { p.setSession("s1"); p.setAnnotationsLoaded(list); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }
  return render(<PlanningProvider><Semilla /><Espia><AnnotationsPanel /></Espia></PlanningProvider>);
}

beforeEach(() => { visto = null; });
afterEach(() => vi.restoreAllMocks());

describe("AnnotationsPanel", () => {
  it("vacío explica qué hacer", () => {
    montar();
    expect(screen.getByText("Sin anotaciones. Elige una herramienta y pincha en un corte o en la malla")).toBeInTheDocument();
  });

  it("«Regla (R)» arma anot_regla y queda pulsado", async () => {
    montar();
    const b = screen.getByTitle("Regla (R)");
    fireEvent.click(b);
    await waitFor(() => expect(visto?.pickMode).toBe("anot_regla"));
    expect(screen.getByTitle("Regla (R)")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Ángulo (A)")).toHaveAttribute("aria-pressed", "false");
    // Pulsarlo otra vez lo desarma.
    fireEvent.click(screen.getByTitle("Regla (R)"));
    await waitFor(() => expect(visto?.pickMode).toBeNull());
  });

  it("la fila enseña nombre, valor y corte", async () => {
    montar([regla, marcador]);
    expect(await screen.findByText("R1")).toBeInTheDocument();
    expect(screen.getByText("5,0 mm")).toBeInTheDocument();
    // El índice 2 es el corte que el HUD numera 3.
    expect(screen.getByText("AX 3")).toBeInTheDocument();
    expect(screen.getByText("3D")).toBeInTheDocument();
  });

  it("renombrar por clic escribe en el store", async () => {
    montar([regla]);
    fireEvent.click(await screen.findByText("R1"));
    const input = screen.getByDisplayValue("R1");
    fireEvent.change(input, { target: { value: "Cuello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(visto?.annotations[0].label).toBe("Cuello"));
  });

  it("Escape cancela el renombrado", async () => {
    montar([regla]);
    fireEvent.click(await screen.findByText("R1"));
    const input = screen.getByDisplayValue("R1");
    fireEvent.change(input, { target: { value: "Otro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(await screen.findByText("R1")).toBeInTheDocument();
    expect(visto?.annotations[0].label).toBe("R1");
  });

  it("la nota del marcador se edita en la fila", async () => {
    montar([marcador]);
    const nota = await screen.findByDisplayValue("rama");
    fireEvent.change(nota, { target: { value: "rama temporal" } });
    fireEvent.blur(nota);
    await waitFor(() => expect(visto?.annotations[0].note).toBe("rama temporal"));
  });

  it("«Ocultar» alterna visible", async () => {
    montar([regla]);
    fireEvent.click(await screen.findByTitle("Ocultar"));
    await waitFor(() => expect(visto?.annotations[0].visible).toBe(false));
    fireEvent.click(screen.getByTitle("Mostrar"));
    await waitFor(() => expect(visto?.annotations[0].visible).toBe(true));
  });

  it("«Ocultar todas» y «Mostrar todas»", async () => {
    montar([regla, marcador]);
    fireEvent.click(await screen.findByText("Ocultar todas"));
    await waitFor(() => expect(visto?.annotations.every((a) => !a.visible)).toBe(true));
    fireEvent.click(screen.getByText("Mostrar todas"));
    await waitFor(() => expect(visto?.annotations.every((a) => a.visible)).toBe(true));
  });

  it("clic en la fila la elige y Supr la borra", async () => {
    montar([regla, marcador]);
    const fila = (await screen.findByText("R1")).closest("[data-annotation]") as HTMLElement;
    fireEvent.click(fila);
    await waitFor(() => expect(visto?.selectedAnnotation).toBe("a1"));
    fireEvent.keyDown(fila, { key: "Delete" });
    await waitFor(() => expect(visto?.annotations.map((a) => a.id)).toEqual(["m1"]));
    expect(visto?.selectedAnnotation).toBeNull();
  });

  it("«Borrar (Supr)» borra la fila", async () => {
    montar([regla]);
    fireEvent.click(await screen.findByTitle("Borrar (Supr)"));
    await waitFor(() => expect(visto?.annotations).toEqual([]));
  });

  it("«Ir» pide al visor que vaya a la anotación y la elige", async () => {
    montar([regla]);
    const seen: string[] = [];
    const on = (e: Event) => seen.push(String((e as CustomEvent).detail));
    window.addEventListener("viewer:focus-annotation", on);
    fireEvent.click(await screen.findByText("Ir"));
    window.removeEventListener("viewer:focus-annotation", on);
    expect(seen).toEqual(["a1"]);
    await waitFor(() => expect(visto?.selectedAnnotation).toBe("a1"));
  });

  it("el nombre se queda en 40 caracteres y sin espacios a los lados", async () => {
    montar([regla]);
    fireEvent.click(await screen.findByText("R1"));
    const input = screen.getByDisplayValue("R1");
    expect(input).toHaveAttribute("maxLength", "40");
    // fireEvent.change se salta maxLength, como pegar o un IME: lo corta el commit.
    fireEvent.change(input, { target: { value: "  " + "x".repeat(45) } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(visto?.annotations[0].label).toBe("x".repeat(40)));
  });

  it("la nota se queda en 500 caracteres", async () => {
    montar([marcador]);
    const nota = await screen.findByDisplayValue("rama");
    expect(nota).toHaveAttribute("maxLength", "500");
    fireEvent.change(nota, { target: { value: "n".repeat(520) + "  " } });
    fireEvent.blur(nota);
    await waitFor(() => expect(visto?.annotations[0].note).toBe("n".repeat(500)));
  });

  it("con 200 anotaciones las herramientas se apagan y lo dice", async () => {
    const llena = Array.from({ length: 200 }, (_, i) => ({ ...regla, id: `a${i}`, label: `R${i + 1}` }));
    montar(llena);
    expect(await screen.findByText(/Máximo 200 anotaciones por sesión/)).toBeInTheDocument();
    expect(screen.getByTitle("Regla (R)")).toBeDisabled();
    expect(screen.getByTitle("Marcador (T)")).toBeDisabled();
  });

  it("un marcador recién puesto enfoca su nota", async () => {
    montar([regla]);
    await screen.findByText("R1");
    const nuevo = { ...marcador, id: "m2", label: "M2", note: "" };
    act(() => { visto?.setAnnotations((p) => [...p, nuevo]); visto?.setNoteFocusRequest("m2"); });
    await waitFor(() => expect(screen.getByLabelText("Nota de M2")).toHaveFocus());
    expect(visto?.noteFocusRequest).toBeNull();
  });

  it("Supr sobre un botón de la fila no borra la anotación", async () => {
    montar([regla]);
    fireEvent.keyDown(await screen.findByText("Ir"), { key: "Delete" });
    expect(visto?.annotations.map((a) => a.id)).toEqual(["a1"]);
  });

  it("«Exportar CSV» descarga un blob con la cabecera", async () => {
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    montar([regla]);
    await screen.findByText("R1");
    act(() => { fireEvent.click(screen.getByText("Exportar CSV")); });
    expect(click).toHaveBeenCalled();
    expect(blob).not.toBeNull();
    // jsdom no tiene Blob.text(); FileReader sí.
    const raw = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(blob as unknown as Blob);
    });
    const text = raw.replace(/^﻿/, "");
    expect(text.split("\n")[0]).toBe("nombre;tipo;valor;unidad;corte;nota;puntos_mm");
    expect(text).toContain("R1;regla;5,0;mm;");
  });
});
