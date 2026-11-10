/* Si las anotaciones no cargan al reanudar, el panel lo decía sin dar salida:
   «Reintentar» las vuelve a pedir y conserva lo anotado entretanto. */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../vtk/annotations";

const getAnnotations = vi.fn();
vi.mock("../../api/client", () => ({
  api: { getAnnotations: (...a: unknown[]) => getAnnotations(...a) },
}));

import { PlanningProvider, usePlanning } from "../../store/planning";
import { AnnotationsPanel } from "./AnnotationsPanel";

const enDisco: Annotation = {
  id: "a1", kind: "regla", points: [[0, 0, 3], [5, 0, 3]], plane: { plane: "axial", index: 2 },
  label: "R1", note: "", visible: true, created_at: "2026-10-08T10:00:00Z", created_by: "",
};
const local: Annotation = { ...enDisco, id: "a2", label: "R2" };

let visto: ReturnType<typeof usePlanning> | null = null;
function montar() {
  function Semilla({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => { visto = p; });
    // Como deja la sesión una reanudación cuya lectura falló.
    useEffect(() => { p.setSession("s1"); p.setAnnotationsLoadState("error"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <>{children}</>;
  }
  return render(<PlanningProvider><Semilla><AnnotationsPanel /></Semilla></PlanningProvider>);
}

beforeEach(() => { visto = null; getAnnotations.mockReset(); });

describe("anotaciones que no cargaron", () => {
  it("lo dice con «Reintentar», y al cargar quita el aviso y enseña la lista", async () => {
    getAnnotations.mockResolvedValue([enDisco]);
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las anotaciones guardadas");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("R1")).toBeInTheDocument();
    expect(getAnnotations).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(visto?.annotationsLoadState).toBe("cargado");
  });

  it("si vuelve a fallar, el aviso y el botón siguen", async () => {
    getAnnotations.mockRejectedValue(new Error("caído"));
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(getAnnotations).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("lo anotado mientras no cargaba se conserva detrás de lo leído", async () => {
    getAnnotations.mockResolvedValue([enDisco]);
    montar();
    await screen.findByRole("alert");
    act(() => { visto!.setAnnotations([local]); });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(visto?.annotations.map((a) => a.id)).toEqual(["a1", "a2"]));
  });
});
