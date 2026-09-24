/* The segmentation panel has to say what the cleanup threw away. */

import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => {
  // Los hijos del panel (PreprocessSection, MeshEditTools) piden varias cosas
  // en cuanto hay sesión. Mockearlas una a una convierte cada test nuevo en una
  // cacería, así que lo no declarado devuelve una promesa vacía por defecto.
  const declarados: Record<string, unknown> = {
    suggestedBand: vi.fn().mockResolvedValue({ lower: 150, upper: 500, vmin: -500, vmax: 1500 }),
    segment: vi.fn(),
    segmentPreview: vi.fn().mockRejectedValue(new Error("sin vista previa en test")),
  };
  const api = new Proxy(declarados, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue({});
      return target[prop];
    },
  });
  return { api };
});

import {
  SegmentPanel, PREVIA_BORRADOR_DS, PREVIA_BORRADOR_MS,
  PREVIA_AFINADO_DS, PREVIA_AFINADO_MS,
} from "./SegmentPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { SegmentResult } from "../../api/types";

const base: SegmentResult = {
  mesh_url: "/data/vessel_tree.vtp",
  voxel_fraction: 0.004,
  strategy: "dsa",
  is_dsa: true,
  vertices: 8574,
  faces: 17228,
  kept_fraction: 0.597,
  fragments_removed: 1319,
  largest_removed_mm3: 175.4,
  downsample_factor: 2,
  main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
};

/** Entra al paso con la sesión y la malla YA puestas, que es el caso del
 *  usuario: volver a Segmentación después de haber segmentado. El panel no se
 *  monta hasta que el store tiene las dos cosas, así que no existe el render
 *  intermedio «hay sesión pero aún no hay malla» en el que el efecto correría
 *  igualmente y el fallo pasaría inadvertido. */
function withMeshReady(result: SegmentResult, sid: string) {
  function Gate({ children }: { children: ReactNode }) {
    const { sessionId, segmentation, setSession, setSegmentation } = usePlanning();
    useEffect(() => { setSession(sid); setSegmentation(result); }, [setSession, setSegmentation]);
    return <>{sessionId && segmentation ? children : null}</>;
  }
  return render(
    <PlanningProvider>
      <Gate>
        <SegmentPanel onNext={() => {}} />
      </Gate>
    </PlanningProvider>,
  );
}

/** Solo siembra la sesión: el panel sin malla renderiza un subárbol pequeño,
 *  que es donde se pueden mirar los sliders sin mockear media API. */
function SessionOnly({ sid, children }: { sid: string; children: ReactNode }) {
  const { setSession } = usePlanning();
  useEffect(() => { setSession(sid); }, [setSession, sid]);
  return <>{children}</>;
}

/** Renders the panel with a segmentation already in the store.
 *  `sid` siembra también la sesión: sin ella el panel no pide nada al backend,
 *  que es lo correcto, pero deja fuera de prueba todo lo que depende de eso. */
function withResult(result: SegmentResult, sid: string | null = null) {
  function Seed({ children }: { children: ReactNode }) {
    const { setSegmentation, setSession } = usePlanning();
    useEffect(() => {
      if (sid) setSession(sid);
      setSegmentation(result);
    }, [setSegmentation, setSession]);
    return <>{children}</>;
  }
  return render(
    <PlanningProvider>
      <Seed>
        <SegmentPanel onNext={() => {}} />
      </Seed>
    </PlanningProvider>,
  );
}

describe("what the cleanup discarded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports the kept volume and the discarded fragments", async () => {
    // These numbers are case 9's real output. Before this the loss was invisible:
    // 40% of the thresholded volume left the mesh and nothing said so.
    const { container } = withResult(base);

    expect(await screen.findByText("Volumen conservado")).toBeInTheDocument();
    expect(screen.getByText("59.7")).toBeInTheDocument();
    // The count and its unit sit in separate text nodes, so read the block.
    const text = container.textContent ?? "";
    expect(text).toMatch(/1[.,]?319\s*fragmentos/);
    expect(text).toMatch(/175[.,]4\s*mm³/);
  });

  it("warns when a discarded piece is big enough to be a vessel", async () => {
    withResult(base);
    expect(await screen.findByText("Revisar")).toBeInTheDocument();
    expect(screen.getByText(/segmento de vaso desconectado/)).toBeInTheDocument();
  });

  it("stays quiet when only specks were removed", async () => {
    withResult({ ...base, kept_fraction: 0.98, fragments_removed: 40, largest_removed_mm3: 3.1 });
    expect(await screen.findByText("Limpio")).toBeInTheDocument();
    expect(screen.queryByText(/segmento de vaso desconectado/)).not.toBeInTheDocument();
  });

  it("flags a downsampled mesh, because that is where the gaps come from", async () => {
    withResult(base);
    expect(await screen.findByText("Submuestreada")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("calls a native-resolution mesh native", async () => {
    withResult({ ...base, downsample_factor: 1 });
    expect(await screen.findByText("Nativa")).toBeInTheDocument();
  });

  /* El hueso no se quita con el umbral: medido en case 3, el 99 % del hueso cae
     DENTRO del rango de intensidad del propio árbol. Lo que sí lo separa es que
     no se toca — de ahí «solo el árbol principal». Pero en angio-TC todo está
     conectado y la regla no vale, así que el backend se niega y el panel tiene
     que decir por qué: un botón que no hace nada en silencio parece roto. */
  it("dice cuántas estructuras sueltas dejó fuera el árbol principal", async () => {
    withResult({ ...base, main_tree_applied: true, main_tree_removed: 10 });
    expect(await screen.findByText(/Árbol principal aislado/)).toBeInTheDocument();
    expect(screen.getByText(/fuera 10 estructuras sueltas/)).toBeInTheDocument();
  });

  it("explica por qué NO lo aisló en vez de callarse", async () => {
    withResult({
      ...base,
      main_tree_applied: false,
      main_tree_warning: "La estructura mayor ocupa 1220 cm³: no es un árbol vascular.",
    });
    expect(await screen.findByText(/No se aisló el árbol principal/)).toBeInTheDocument();
    expect(screen.getByText(/1220 cm³/)).toBeInTheDocument();
  });

  it("no informa de nada cuando no se pidió", async () => {
    // Ojo con el matcher: la casilla se llama «Solo el árbol principal» y está
    // siempre en pantalla. Lo que no debe aparecer es el RESULTADO.
    withResult(base);
    await screen.findByText("Submuestreada");
    expect(screen.queryByText(/Árbol principal aislado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se aisló el árbol principal/)).not.toBeInTheDocument();
  });
});

/* La banda describe el VOLUMEN, no la malla.
 *
 * El panel sólo la pedía cuando no había malla todavía, así que volver al paso
 * con la malla hecha dejaba los sliders en los valores de reserva —inferior
 * 150, rango −500…3000, que son de TC— sobre una 3DRA cuyo p99 es 1499.
 * Segmentar así mete el tejido blando y el cráneo, y nada en pantalla delataba
 * que los números no tenían que ver con ese volumen. */
describe("la banda del volumen, con una malla ya hecha", () => {
  beforeEach(() => vi.clearAllMocks());

  // Este test no se pudo escribir cuando se arregló el fallo: `MeshEditTools`
  // —que solo se monta cuando hay malla— llamaba a `suggestedBand` por su
  // cuenta para la banda del crecimiento desde semillas, así que la espía daba
  // positivo aunque el bug estuviera puesto. Al retirar las semillas esa
  // llamada desapareció y el test ya distingue.
  it("se pide la banda aunque la malla ya exista", async () => {
    const { api } = await import("../../api/client");
    withMeshReady(base, "sesion-3");
    await vi.waitFor(() => expect(api.suggestedBand).toHaveBeenCalled());
  });

  it("los límites del slider salen del volumen, no de la reserva", async () => {
    const { api } = await import("../../api/client");
    // Una 3DRA: la banda vive muy por encima del rango de reserva de TC
    // (−500…3000), que ni siquiera podía expresar un techo de 4450.
    vi.mocked(api.suggestedBand).mockResolvedValue({
      lower: 1503, upper: 4450, vmin: -20, vmax: 4399,
    });
    render(
      <PlanningProvider>
        <SessionOnly sid="sesion-2">
          <SegmentPanel onNext={() => {}} />
        </SessionOnly>
      </PlanningProvider>,
    );
    const sup = (await screen.findByLabelText("Umbral superior")) as HTMLInputElement;
    await vi.waitFor(() => expect(Number(sup.max)).toBeGreaterThan(4450));
  });

  it("ofrece quitar el techo, que el slider por sí solo no puede", async () => {
    // El tope del slider sale del percentil 99.9, así que subirlo «al máximo»
    // deja el techo donde estaba. Sin esta casilla no hay forma de pedir que
    // no haya límite superior.
    withResult(base);
    expect(await screen.findByText(/Sin límite superior/)).toBeInTheDocument();
  });
});

/* La vista previa en dos etapas.
 *
 * Una sola etapa a submuestreo 3 son 107 ms de cálculo y 21.924 vértices que
 * transportar, con 420 ms de espera encima: arrastrar el deslizador no se
 * siente en vivo. Medido sobre el mismo volumen, ds=5 son 23 ms y ds=2 son
 * 394 ms con 85.187 vértices — el nivel al que se ven las ramas finas.
 *
 * Así que primero un borrador inmediato y, si sueltas, un afinado. Es lógica
 * de temporizadores: se rompe sin hacer ruido, de ahí estos tests. */
describe("la previa se pide en dos etapas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("primero el borrador grueso, y luego el afinado", async () => {
    const { api } = await import("../../api/client");
    vi.mocked(api.segmentPreview).mockResolvedValue({
      mesh_url: "/m.vtp", vertices: 10, voxel_fraction: 0.01,
    });
    render(
      <PlanningProvider>
        <SessionOnly sid="sesion-previa">
          <SegmentPanel onNext={() => {}} />
        </SessionOnly>
      </PlanningProvider>,
    );

    await vi.waitFor(() => expect(api.segmentPreview).toHaveBeenCalled());
    const primero = vi.mocked(api.segmentPreview).mock.calls[0][1];
    expect(primero.downsample).toBe(PREVIA_BORRADOR_DS);

    await vi.waitFor(
      () => expect(vi.mocked(api.segmentPreview).mock.calls.length).toBeGreaterThan(1),
      { timeout: 3000 },
    );
    const segundo = vi.mocked(api.segmentPreview).mock.calls[1][1];
    expect(segundo.downsample).toBe(PREVIA_AFINADO_DS);
    // El afinado tiene que ser MÁS FINO que el borrador, no al revés.
    expect(PREVIA_AFINADO_DS).toBeLessThan(PREVIA_BORRADOR_DS);
  });

  it("el borrador llega antes que el afinado", () => {
    // Si las esperas se cruzaran, el grueso pisaría al fino y la previa
    // acabaría enseñando MENOS detalle del que ya había calculado.
    expect(PREVIA_BORRADOR_MS).toBeLessThan(PREVIA_AFINADO_MS);
  });
});


/* Con techo o sin él: la app lo prueba sola.
 *
 * La casilla «sin límite superior» decide si la lesión aparece en la lista, y
 * no puede tener un valor por defecto: de los dos casos anotados, uno la
 * necesita puesta y el otro quitada. Tampoco se puede decidir sola —se midió
 * la regla evidente, quitar el techo cuando corta el árbol, y no separa—, así
 * que se segmenta y detecta de las dos formas y se enseñan las dos listas.
 * Medido sobre el examen real: con techo la lesión no sale; sin techo es la
 * primera. Las filas se leen del texto del panel y no por nodo: cada fila son
 * varios nodos de texto («sin techo » + «#1») y buscarlos sueltos hace que el
 * test falle por cómo está partido el JSX, no por lo que enseña. */
describe("comparar con y sin techo", () => {
  beforeEach(() => vi.clearAllMocks());

  const comparacion = {
    candidates: [
      { position: { x: 1, y: 2, z: 3 }, diameter_mm: 6.2, channels: ["curv"],
        rank_con_techo: 1, rank_sin_techo: 2, en_ambas: true },
      { position: { x: 9, y: 9, z: 9 }, diameter_mm: 5.1, channels: ["radio"],
        rank_con_techo: null, rank_sin_techo: 1, en_ambas: false },
    ],
    vertices_con_techo: 88178, vertices_sin_techo: 80227,
    n_con_techo: 1, n_sin_techo: 2,
    note: "1 sitio(s) solo aparecen SIN techo y 0 solo CON él.",
  };

  async function comparar(sid = "sesion-techo") {
    const { api } = await import("../../api/client");
    vi.mocked(api.suggestedBand).mockResolvedValue({
      lower: 1503, upper: 4450, vmin: -20, vmax: 4399,
    });
    vi.mocked(api.compareCeiling).mockResolvedValue(comparacion);
    const vista = render(
      <PlanningProvider>
        <SessionOnly sid={sid}>
          <SegmentPanel onNext={() => {}} />
        </SessionOnly>
      </PlanningProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Probar con y sin techo/ }));
    await vi.waitFor(() => expect(api.compareCeiling).toHaveBeenCalled());
    await screen.findByRole("button", { name: "Usar sin techo" });
    return { api, texto: () => vista.container.textContent ?? "" };
  }

  it("enseña el puesto en cada lista y señala al que sale en una sola", async () => {
    const { texto } = await comparar();
    // El que solo sale sin techo es el interesante: es el que se perdería
    // quien eligiera mal, y en el examen real ése era el aneurisma.
    expect(texto()).toMatch(/con techo —sin techo #1/);
    expect(texto()).toMatch(/con techo #1sin techo #2/);
    expect(texto()).toContain("solo en una");
  });

  it("compara con la misma resolución con la que se va a segmentar", async () => {
    // Comparar a resolución completa y segmentar diezmado —o al revés— daría
    // puestos de una malla que el usuario no llega a ver nunca.
    const { api } = await comparar();
    const [, req] = vi.mocked(api.compareCeiling).mock.calls[0];
    expect(req.full_resolution).toBe(false);
    expect(req.lower).toBe(1503);
    expect(req.upper).toBe(4450);
  });

  it("«Usar sin techo» deja la casilla puesta para la siguiente segmentación", async () => {
    const { texto } = await comparar();
    fireEvent.click(screen.getByRole("button", { name: "Usar sin techo" }));
    const casilla = screen.getByRole("checkbox", { name: /Sin límite superior/ }) as HTMLInputElement;
    expect(casilla.checked).toBe(true);
    // Y el resultado se retira: ya no describe lo que está configurado.
    expect(texto()).not.toContain("solo en una");
  });

  it("se puede comparar con la malla ya hecha", async () => {
    // La duda aparece justo entonces: al ver que en la lista de candidatos no
    // está la lesión. Si el botón solo saliera antes de segmentar, el usuario
    // tendría que adivinar en el único momento en que no tiene información.
    const { api } = await import("../../api/client");
    // `MeshEditTools` se monta con la malla y pinta el historial; el mock por
    // defecto devuelve {} y ahí revienta al leer `steps`.
    vi.mocked(api.meshHistory).mockResolvedValue({
      steps: [], undo_depth: 0, redo_depth: 0, has_original: true,
    });
    withMeshReady(base, "sesion-techo-2");
    expect(
      await screen.findByRole("button", { name: /Probar con y sin techo/ }),
    ).toBeInTheDocument();
  });
});
