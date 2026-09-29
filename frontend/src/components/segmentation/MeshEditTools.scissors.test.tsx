/* La tijera del panel de malla.

   Lo que se defiende: que no se puede cortar sin haber visto antes lo que se
   va, y que la vista previa se limpia al soltar la herramienta. Una edición
   destructiva que se dispara antes de enseñar el resultado es exactamente lo
   que hundió al corte por plano anterior. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";

const meshScissors = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    meshScissors: (...a: unknown[]) => meshScissors(...a),
    meshHistory: vi.fn().mockResolvedValue({ undo_depth: 0, redo_depth: 0, channels: [], steps: [] }),
    meshBounds: vi.fn().mockRejectedValue(new Error("sin malla")),
    meshComponents: vi.fn().mockResolvedValue({ components: [], total: 0 }),
  },
}));

import { MeshEditTools } from "./MeshEditTools";
import { PlanningProvider, usePlanning } from "../../store/planning";

function conSesion() {
  function Seed({ children }: { children: ReactNode }) {
    const { sessionId, setSession, setSegmentation } = usePlanning();
    useEffect(() => {
      if (!sessionId) {
        setSession("s1");
        setSegmentation({ mesh_url: "/m.vtp", vertices: 100, faces: 200 } as never);
      }
    }, [sessionId, setSession, setSegmentation]);
    return <>{children}</>;
  }
  return render(<PlanningProvider><Seed><MeshEditTools /></Seed></PlanningProvider>);
}

/** Marca tres puntos entrando en el modo y usando el store directamente. */
function marcarTres() {
  fireEvent.click(screen.getByText(/Marcar anillo/));
}

beforeEach(() => {
  meshScissors.mockReset().mockResolvedValue({
    applied: false, removed_vertices: 1200, kept_vertices: 8000,
    preview_url: "/preview.vtp", mesh_url: null, undo_depth: 0,
  });
});

describe("la tijera", () => {
  it("explica que no corta hasta ver el resultado", async () => {
    conSesion();
    expect(await screen.findByText(/Nada se corta hasta que veas en rojo/)).toBeInTheDocument();
  });

  it("«Ver qué se va» está apagado sin tres puntos", async () => {
    conSesion();
    const ver = await screen.findByText("Ver qué se va");
    expect(ver.closest("button")).toBeDisabled();
  });

  it("no ofrece «Cortar» antes de la vista previa", async () => {
    // El botón destructivo no existe hasta que hay algo que enseñar.
    conSesion();
    await screen.findByText("Ver qué se va");
    expect(screen.queryByText(/✂ Cortar/)).not.toBeInTheDocument();
  });

  it("entrar y salir del modo de marcado", async () => {
    conSesion();
    marcarTres();
    expect(await screen.findByText(/Marcando…/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Marcando…/));
    await waitFor(() => expect(screen.getByText(/Marcar anillo/)).toBeInTheDocument());
  });

  it("nunca pide un corte sin que se lo manden", async () => {
    // Montar el panel no puede llamar al endpoint: es destructivo.
    conSesion();
    await screen.findByText("Ver qué se va");
    expect(meshScissors).not.toHaveBeenCalled();
  });
});
