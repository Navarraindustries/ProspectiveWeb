/* Las herramientas de malla, renderizadas de verdad.

   Este fichero existe por un fallo concreto: al añadir el borrador, su
   `useEffect` acabó anidado DENTRO de otro efecto. Es sintácticamente válido,
   así que `tsc` pasó y los 169 tests pasaron — porque ninguno montaba este
   panel. En el navegador reventó al instante con «Invalid hook call».

   Montar el componente es lo único que detecta eso. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const meshComponentDelete = vi.fn();
const meshPlaneCut = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    suggestedBand: vi.fn().mockResolvedValue({ lower: 150, upper: 500, vmin: -500, vmax: 1500 }),
    meshHistory: vi.fn().mockResolvedValue({
      undo_depth: 0, redo_depth: 0, has_original: false, steps: [],
    }),
    meshComponentDelete: (...a: unknown[]) => meshComponentDelete(...a),
    meshBounds: vi.fn().mockResolvedValue({
      min: { x: -30, y: -40, z: -25 }, max: { x: 30, y: 40, z: 25 },
      vertices: 12776,
    }),
    meshPlaneCut: (...a: unknown[]) => meshPlaneCut(...a),
  },
}));

import { MeshEditTools } from "./MeshEditTools";
import { PlanningProvider, usePlanning, type Vec3 } from "../../store/planning";
import type { SegmentResult } from "../../api/types";

/* El panel solo existe si hay malla: sin segmentación devuelve null. */
const SEG: SegmentResult = {
  mesh_url: "/data/v.vtp", voxel_fraction: 0.009, strategy: "xa_band_pass",
  is_dsa: false, vertices: 21196, faces: 42691, kept_fraction: 0.807,
  fragments_removed: 2174, largest_removed_mm3: 254.7, downsample_factor: 2,
  main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
};

/** Siembra sesión y segmentación en el store, y opcionalmente un clic. */
function Seed({ erasePick, children }:
  { erasePick?: Vec3; children: ReactNode }) {
  const { setSession, setSegmentation, setErasePick } = usePlanning();
  useEffect(() => {
    setSession("s1");
    setSegmentation(SEG);
    if (erasePick) setErasePick(erasePick);
  }, [setSession, setSegmentation, setErasePick, erasePick]);
  return <>{children}</>;
}

/** Monta el panel dentro del store, opcionalmente con un clic ya señalado. */
function mount(erasePick?: Vec3) {
  return render(
    <PlanningProvider>
      <Seed erasePick={erasePick}><MeshEditTools /></Seed>
    </PlanningProvider>,
  );
}

beforeEach(() => {
  meshComponentDelete.mockReset();
  meshPlaneCut.mockReset();
});

describe("el panel se monta", () => {
  it("renderiza sin romper las reglas de los hooks", () => {
    // Si un useEffect vuelve a quedar anidado dentro de otro, esto falla aquí
    // en vez de en el navegador del usuario.
    mount();
    expect(screen.getByText("Borrar piezas sueltas")).toBeInTheDocument();
    expect(screen.getAllByText(/Recortar malla/).length).toBeGreaterThan(0);
  });

  it("arma y desarma el borrador", () => {
    mount();
    const boton = screen.getByRole("button", { name: /Activar borrador/ });
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: /Pincha la pieza a borrar/ }))
      .toBeInTheDocument();
  });
});

describe("el borrador de un clic", () => {
  it("borra la pieza y dice qué era", async () => {
    meshComponentDelete.mockResolvedValue({
      mesh_url: "/data/v.vtp?v=2", vertices: 12759, faces: 25000,
      removed: { n_points: 2230, volume_mm3: 280.7, extent_mm: 70.5, thickness_mm: 0.25, sphericity: 0.093 },
      components_left: 10, warning: "", undo_depth: 1,
    });
    mount([10, 20, 30]);
    await waitFor(() => expect(meshComponentDelete).toHaveBeenCalled());
    expect(meshComponentDelete).toHaveBeenCalledWith("s1", { x: 10, y: 20, z: 30 });
    expect(await screen.findByText(/Borrada una pieza de 281 mm³/)).toBeInTheDocument();
    expect(screen.getByText(/Quedan 10 piezas/)).toBeInTheDocument();
  });

  it("dice por qué no borró nada en vez de callarse", async () => {
    meshComponentDelete.mockResolvedValue({
      mesh_url: "/data/v.vtp", vertices: 21196, faces: 42691, removed: null,
      components_left: 11, undo_depth: 0,
      warning: "El punto señalado está a 42.0 mm de la malla más cercana.",
    });
    mount([900, 900, 900]);
    expect(await screen.findByText(/42.0 mm de la malla más cercana/)).toBeInTheDocument();
  });

  it("no llama a la API si no se ha señalado nada", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Borrar piezas sueltas")).toBeInTheDocument());
    expect(meshComponentDelete).not.toHaveBeenCalled();
  });
});

/* El recorte por caja y esfera obliga a acertar un centro a ojo, y para quitar
   la chapa pegada bajo el árbol eso son varios intentos. Un plano no tiene
   centro: una dirección y una altura. */
describe("el corte por plano", () => {
  it("ofrece los tres ejes y un deslizador con recorrido real", async () => {
    mount();
    expect(await screen.findByText("Cortar por un plano")).toBeInTheDocument();
    for (const eje of ["Eje X", "Eje Y", "Eje Z"]) {
      expect(screen.getByRole("button", { name: eje })).toBeInTheDocument();
    }
    // Los extremos salen de la malla, no de un rango inventado.
    const slider = await screen.findByRole("slider", { name: "Altura del corte" });
    expect(slider).toHaveAttribute("min", "-40");
    expect(slider).toHaveAttribute("max", "40");
  });

  it("corta por la altura elegida y dice qué se llevó", async () => {
    meshPlaneCut.mockResolvedValue({
      mesh_url: "/data/v.vtp?v=3", vertices: 9000, faces: 18000,
      removed_vertices: 3776, components_left: 1, undo_depth: 1,
    });
    mount();
    const slider = await screen.findByRole("slider", { name: "Altura del corte" });
    fireEvent.change(slider, { target: { value: "-22" } });
    fireEvent.click(screen.getByRole("button", { name: /^Cortar$/ }));
    await waitFor(() => expect(meshPlaneCut).toHaveBeenCalled());
    expect(meshPlaneCut).toHaveBeenCalledWith("s1", {
      axis: "y", offset_mm: -22, keep_positive: true,
    });
    // El separador de miles lo pone toLocaleString y depende del ICU del
    // entorno, así que se comprueba el mensaje, no su tipografía.
    expect(await screen.findByText(/Fuera .*vértices/)).toBeInTheDocument();
    expect(screen.getByText(/Queda 1 pieza/)).toBeInTheDocument();
  });

  it("deja elegir qué lado se conserva", async () => {
    meshPlaneCut.mockResolvedValue({
      mesh_url: "/data/v.vtp", vertices: 100, faces: 200,
      removed_vertices: 10, components_left: 1, undo_depth: 1,
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Conservar abajo" }));
    fireEvent.click(screen.getByRole("button", { name: /^Cortar$/ }));
    await waitFor(() => expect(meshPlaneCut).toHaveBeenCalled());
    expect(meshPlaneCut.mock.calls[0][1].keep_positive).toBe(false);
  });

  it("publica la previa para que el visor recorte en vivo", async () => {
    // El usuario dijo que cortar por ejes es poco intuitivo «porque no hay de
    // dónde guiarse». El problema no era el plano: era que no se veía nada
    // hasta pulsar Cortar. El visor recorta el render con estos tres valores.
    let visto: unknown = null;
    function Espia() {
      const { planeCut } = usePlanning();
      visto = planeCut;
      return null;
    }
    render(
      <PlanningProvider>
        <Seed><MeshEditTools /><Espia /></Seed>
      </PlanningProvider>,
    );
    const slider = await screen.findByRole("slider", { name: "Altura del corte" });
    fireEvent.change(slider, { target: { value: "-18" } });
    await waitFor(() =>
      expect(visto).toEqual({ axis: "y", offset: -18, keepPositive: true }));
  });
});
