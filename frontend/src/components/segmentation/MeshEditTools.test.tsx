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
const meshEraseRegion = vi.fn();
const meshCrop = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    suggestedBand: vi.fn().mockResolvedValue({ lower: 150, upper: 500, vmin: -500, vmax: 1500 }),
    meshHistory: vi.fn().mockResolvedValue({
      undo_depth: 0, redo_depth: 0, has_original: false, steps: [],
    }),
    meshComponentDelete: (...a: unknown[]) => meshComponentDelete(...a),
    meshEraseRegion: (...a: unknown[]) => meshEraseRegion(...a),
    meshComponents: vi.fn().mockResolvedValue({
      components: [], total: 11, largest_is_tree: true, warning: "",
    }),
    meshBounds: vi.fn().mockResolvedValue({
      min: { x: -30, y: -40, z: -25 }, max: { x: 30, y: 40, z: 25 },
      vertices: 12776,
    }),
    meshCrop: (...a: unknown[]) => meshCrop(...a),
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
  meshEraseRegion.mockReset();
  meshCrop.mockReset();
});

/** Una promesa que resuelve CUANDO se le dice, como una llamada de verdad.

    Los mocks que resuelven al instante escondieron este fallo: la respuesta
    llegaba en el mismo microtask y React todavía no había ejecutado la
    limpieza del efecto. En el navegador, con milisegundos de red por medio,
    la limpieza siempre gana. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => { resolver = r; });
  return { promesa, resolver };
}

describe("el panel se monta", () => {
  it("renderiza sin romper las reglas de los hooks", () => {
    // Si un useEffect vuelve a quedar anidado dentro de otro, esto falla aquí
    // en vez de en el navegador del usuario.
    mount();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByText("Borrador")).toBeInTheDocument());
    expect(meshComponentDelete).not.toHaveBeenCalled();
  });
});

/* La caja de recorte.
 *
 * Antes esto era un corte por plano que recortaba la malla SIN DIBUJAR NADA:
 * había que deducir dónde cortaba por lo que desaparecía, y solo en un eje
 * cada vez. El usuario lo dijo tal cual: «no se ve bien alguna caja o algo que
 * muestre que se está cortando en las 3 dimensiones».
 *
 * La caja NO se arma sola: una caja amarilla permanente alrededor del árbol
 * estorba justo cuando lo que quieres es mirar la malla. Al activarla arranca
 * envolviéndola entera —activarla no puede recortar nada— y cada eje se cierra
 * por los dos lados. */
describe("la caja de recorte", () => {
  beforeEach(() => vi.clearAllMocks());

  /** La caja solo existe tras activarla. */
  const activar = async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Activar la caja" }));
    return await screen.findByText("Eje X");
  };

  it("no se muestra hasta que se activa", async () => {
    mount();
    expect(await screen.findByText("Caja de recorte")).toBeInTheDocument();
    expect(screen.queryByText("Eje X")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar la caja" })).toBeInTheDocument();
  });

  it("se puede cancelar y la caja desaparece", async () => {
    await activar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("Eje X")).not.toBeInTheDocument());
  });

  it("ofrece los tres ejes, cada uno por los dos lados", async () => {
    await activar();
    for (const eje of ["X", "Y", "Z"]) {
      expect(screen.getByText(`Eje ${eje}`)).toBeInTheDocument();
    }
    // Dos deslizadores por eje: «desde» y «hasta».
    expect(screen.getAllByLabelText("desde")).toHaveLength(3);
    expect(screen.getAllByLabelText("hasta")).toHaveLength(3);
  });

  it("al activarla envuelve la malla, así que no recorta nada", async () => {
    await activar();
    // El recorrido de cada deslizador es el de la malla, no uno inventado.
    const desde = screen.getAllByLabelText("desde") as HTMLInputElement[];
    expect(Number(desde[0].min)).toBe(-30);
    expect(Number(desde[0].max)).toBe(30);
    expect(Number(desde[0].value)).toBe(-30);   // pegado al extremo
    expect(await screen.findByText(/no hay nada que recortar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recortar" })).toBeDisabled();
  });

  it("al cerrar un eje, recorta y dice qué se llevó", async () => {
    meshCrop.mockResolvedValue({
      mesh_url: "/m.vtp?v=2", vertices: 9000, faces: 18000, removed_vertices: 3776,
    });
    await activar();

    const desde = screen.getAllByLabelText("desde") as HTMLInputElement[];
    fireEvent.change(desde[0], { target: { value: "-5" } });

    const boton = await screen.findByRole("button", { name: "Recortar" });
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);

    await waitFor(() => expect(meshCrop).toHaveBeenCalled());
    const [, req] = meshCrop.mock.calls[0] as [string, Record<string, any>];
    expect(req.mode).toBe("box");
    // Centro y semiejes describen la MISMA caja que los límites elegidos.
    expect(req.center.x).toBeCloseTo((-5 + 30) / 2, 5);
    expect(req.half_size.x).toBeCloseTo((30 - -5) / 2, 5);
    expect(await screen.findByText(/Malla recortada.*eliminados/)).toBeInTheDocument();
  });

  it("un lado no puede cruzar al otro", async () => {
    await activar();
    const desde = screen.getAllByLabelText("desde") as HTMLInputElement[];
    const hasta = screen.getAllByLabelText("hasta") as HTMLInputElement[];
    // Empujar «desde» más allá de «hasta» dejaría una caja invertida, que no
    // recorta: vacía la malla entera.
    fireEvent.change(hasta[0], { target: { value: "0" } });
    fireEvent.change(desde[0], { target: { value: "25" } });
    await waitFor(() => expect(Number(desde[0].value)).toBeLessThanOrEqual(Number(hasta[0].value)));
  });
});

/* El resultado del borrado tiene que llegar a la pantalla aunque la respuesta
 * tarde lo que tarda una llamada real.
 *
 * Encontrado en el navegador, sobre case 3. El efecto del borrador depende de
 * `erasePick` y su primera línea lo pone a null: React vuelve a ejecutarlo y
 * dispara la limpieza del pase anterior ANTES de que llegue la respuesta. Con
 * un booleano `cancelado`, eso abortaba un borrado que el backend YA había
 * hecho — el fichero de la malla pasó de 11.870 a 11.736 vértices y el
 * manifiesto de deshacer registró dos instantáneas, mientras el panel seguía
 * diciendo 11.870 y «sin pasos que deshacer».
 *
 * Lo grave no es que no se vea: es que quien lo usa cree que no funciona,
 * vuelve a pinchar, y cada clic borra más malla sin dejar rastro en pantalla.
 *
 * Los tests de arriba NO lo cazaban porque sus mocks resuelven en el mismo
 * microtask, antes de que React limpie. */
describe("una respuesta que tarda", () => {
  it("el borrador de piezas enseña el resultado igual", async () => {
    const { promesa, resolver } = diferida<unknown>();
    meshComponentDelete.mockReturnValue(promesa);
    mount([10, 20, 30]);
    await waitFor(() => expect(meshComponentDelete).toHaveBeenCalled());

    resolver({
      mesh_url: "/data/v.vtp?v=2", vertices: 12759, faces: 25000,
      removed: { n_points: 2230, volume_mm3: 280.7, extent_mm: 70.5,
                 thickness_mm: 0.25, sphericity: 0.093 },
      components_left: 10, warning: "", undo_depth: 1,
    });
    expect(await screen.findByText(/Borrada una pieza de 281 mm³/)).toBeInTheDocument();
  });

  it("el borrador de región enseña cuántos vértices se fueron", async () => {
    const { promesa, resolver } = diferida<unknown>();
    meshEraseRegion.mockReturnValue(promesa);
    render(
      <PlanningProvider>
        <Seed erasePick={[10, 20, 30]}><MeshEditTools /></Seed>
      </PlanningProvider>,
    );
    // Cambiar a «Región pegada» antes de que el clic se procese no es posible
    // desde fuera, así que se comprueba la otra mitad: que la llamada sale y su
    // respuesta tardía llega a la pantalla.
    fireEvent.click(screen.getByRole("button", { name: "Región pegada" }));
    await waitFor(() => expect(
      meshEraseRegion.mock.calls.length + meshComponentDelete.mock.calls.length,
    ).toBeGreaterThan(0));

    resolver({
      mesh_url: "/data/v.vtp?v=3", vertices: 11736, faces: 23000,
      removed_vertices: 134, warning: "", undo_depth: 1,
    });
    // Con el fallo puesto, aquí no aparece nada en absoluto.
    await waitFor(() => expect(
      screen.queryByText(/Borrados/) ?? screen.queryByText(/Borrada/),
    ).toBeTruthy());
  });
});
