/* Supr en el visor (F1-6): el atajo «anot-borrar» del visor borraba la
   anotación elegida sin preguntar, igual que la fila del panel. Las dos rutas
   pasan ahora por la misma confirmación; aquí se prueba la del visor, que solo
   tiene la id de la anotación elegida. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Annotation } from "../../vtk/annotations";
import { PlanningProvider, usePlanning } from "../../store/planning";
import { useAnnotationDelete } from "./useAnnotationDelete";

const regla: Annotation = {
  id: "a1", kind: "regla", points: [[0, 0, 3], [5, 0, 3]], plane: { plane: "axial", index: 2 },
  label: "R1", note: "", visible: true, created_at: "2026-10-08T10:00:00Z", created_by: "",
};

let visto: ReturnType<typeof usePlanning> | null = null;

/** Lo que hace el visor con Supr: pedir el borrado de la elegida. */
function VisorFalso() {
  const p = usePlanning();
  const { askDelete, deleteDialog } = useAnnotationDelete();
  useEffect(() => { visto = p; });
  return (
    <>
      <button onClick={() => p.selectedAnnotation && askDelete(p.selectedAnnotation)}>Supr</button>
      {deleteDialog}
    </>
  );
}

function montar(children: ReactNode) {
  function Semilla() {
    const p = usePlanning();
    useEffect(() => { p.setSession("s1"); p.setAnnotationsLoaded([regla]); p.setSelectedAnnotation("a1"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }
  return render(<PlanningProvider><Semilla />{children}</PlanningProvider>);
}

describe("borrar una anotación desde el visor", () => {
  it("pide confirmación y no borra hasta confirmar", async () => {
    montar(<VisorFalso />);
    await waitFor(() => expect(visto?.selectedAnnotation).toBe("a1"));
    fireEvent.click(screen.getByText("Supr"));
    expect(screen.getByRole("alertdialog", { name: "¿Borrar la anotación?" })).toHaveTextContent("R1");
    expect(visto?.annotations).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Borrar anotación" }));
    await waitFor(() => expect(visto?.annotations).toEqual([]));
    expect(visto?.selectedAnnotation).toBeNull();
  });

  it("«Cancelar» la conserva", async () => {
    montar(<VisorFalso />);
    await waitFor(() => expect(visto?.selectedAnnotation).toBe("a1"));
    fireEvent.click(screen.getByText("Supr"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(visto?.annotations).toHaveLength(1);
  });
});
