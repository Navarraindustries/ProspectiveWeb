/* Paso 6 · Coils. Decisión nº 24: una sola vía de coils, el montaje sugerido,
   editable coil a coil (la condición del propietario). Antes había dos: la
   tarjeta del montaje y un formulario aparte («Coil (n disponibles)»,
   «Número de coils», «Calcular empaque») que mandaba N coils idénticos.
   F1-203: el primer dato del montaje es el cuello, con el aviso de cuello ancho. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoilConstructResult, CoilLibraryItem, MorphometryResult } from "../../api/types";

vi.mock("../../api/client", async (orig) => {
  const mod = await orig<typeof import("../../api/client")>();
  return { ...mod, api: { ...mod.api,
    clipRecommendations: vi.fn(() => new Promise(() => {})),
    listCustomClips: vi.fn(async () => []),
    clipSelection: vi.fn(() => new Promise(() => {})),
    coilRecommendations: vi.fn(),
    listCoils: vi.fn(),
    coilConstructPreview: vi.fn(),
    planCoils: vi.fn(),
    clearDevices: vi.fn(async () => ({ status: "ok" })),
    placedDevices: vi.fn(async () => ({ remaining: [], mesh_urls: {}, strategy: null, placed_counts: {} })),
    getTeamDecision: vi.fn(async () => ({ team_decision: "endovascular", decided_by: "", other_text: "" })),
  } };
});
import { api } from "../../api/client";
import { DevicesPanel } from "./DevicesPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";

const morpho = {
  neck_origin: { x: 1, y: 2, z: 3 }, principal_axis: [0, 0, 1],
  centroid: { x: 1, y: 2, z: 5 }, dome_height_mm: 4, reliable: true, neck_mm: 6.6,
} as unknown as MorphometryResult;

const construct: CoilConstructResult = {
  steps: [
    { coil_id: "enmarcado-10", name: "Enmarcado 10", manufacturer: "A", diameter_mm: 10, length_cm: 30, role: "framing", count: 1, rationale: "Enmarcado Ø10 mm" },
    { coil_id: "relleno-7", name: "Relleno 7", manufacturer: "A", diameter_mm: 7, length_cm: 20, role: "filling", count: 4, rationale: "Relleno Ø7 mm × 4" },
    { coil_id: "acabado-3", name: "Acabado 3", manufacturer: "A", diameter_mm: 3, length_cm: 6, role: "finishing", count: 1, rationale: "Acabado Ø3 mm" },
  ],
  dome_mm: 9.1, volume_mm3: 210.5, projected_packing: 0.24, feasible: true,
  note: "Cuello 6.6 mm, domo/cuello 1.38: cuello ancho: probable adyuvante (balón o stent). Proyección 24 %.",
  neck_mm: 6.6, wide_neck: true,
};

const catalogo: CoilLibraryItem[] = [
  { id: "enmarcado-10", name: "Enmarcado 10", manufacturer: "A", diameter_mm: 10, length_cm: 30, coil_type: "framing", is_detachable: true },
  { id: "relleno-7", name: "Relleno 7", manufacturer: "A", diameter_mm: 7, length_cm: 20, coil_type: "filling", is_detachable: true },
  { id: "acabado-3", name: "Acabado 3", manufacturer: "A", diameter_mm: 3, length_cm: 6, coil_type: "finishing", is_detachable: true },
  { id: "otro-9", name: "Otro 9", manufacturer: "B", diameter_mm: 9, length_cm: 25, coil_type: "framing", is_detachable: true },
];

function montar() {
  function Seed({ children }: { children: ReactNode }) {
    const { sessionId, setSession, setMorphometry } = usePlanning();
    useEffect(() => {
      if (!sessionId) { setSession("s1"); setMorphometry(morpho); }
    }, [sessionId, setSession, setMorphometry]);
    return sessionId ? <>{children}</> : null;
  }
  render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
}

async function abrirCoils() {
  montar();
  fireEvent.click(await screen.findByRole("button", { name: "Coils" }));
  await screen.findByLabelText("Modelo (fila 1)");
}

const modelo = (fila: number) => screen.getByLabelText(`Modelo (fila ${fila})`) as HTMLSelectElement;
const cuantos = (fila: number) => screen.getByLabelText(`Cuántos (fila ${fila})`) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.coilRecommendations).mockResolvedValue(construct);
  vi.mocked(api.listCoils).mockResolvedValue(catalogo);
  vi.mocked(api.coilConstructPreview).mockResolvedValue({
    projected_packing: 0.18, n_coils: 4, packing_min: 0.2, meets_minimum: false,
    durability: "", warning: "Densidad de empaquetamiento 18 % por debajo del 20 %",
  });
  vi.mocked(api.planCoils).mockResolvedValue({
    coils_mesh_url: "/m/coils.vtp", total_packing_density: 0.18, packing_min: 0.2,
    meets_minimum: false, durability: "", sources: [], warning: null,
  });
});

describe("una sola vía de coils (decisión nº 24)", () => {
  it("no hay segundo formulario de coils", async () => {
    await abrirCoils();
    expect(screen.queryByText("Calcular empaque")).toBeNull();
    expect(screen.queryByText("Número de coils")).toBeNull();
    expect(screen.queryByText(/Coil \(\d+ disponibles\)/)).toBeNull();
    expect(screen.queryByText("Colocar el montaje completo")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Colocar el montaje" })).toHaveLength(1);
  });

  it("el montaje sugerido llega como filas editables, una por escalón", async () => {
    await abrirCoils();
    expect(modelo(1).value).toBe("enmarcado-10");
    expect(modelo(2).value).toBe("relleno-7");
    expect(cuantos(2).value).toBe("4");
    expect(modelo(3).value).toBe("acabado-3");
    // Sin editar, la proyección es la de la sugerencia y no se pide otra.
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(api.coilConstructPreview).not.toHaveBeenCalled();
  });

  it("cambiar el modelo y el número de un coil recalcula el empaque y cambia lo que se coloca", async () => {
    await abrirCoils();
    fireEvent.click(screen.getByLabelText(/Ver todo el catálogo/));
    await waitFor(() => expect(within(modelo(1)).getByRole("option", { name: /Otro 9/ })).toBeInTheDocument());

    fireEvent.change(modelo(1), { target: { value: "otro-9" } });
    // Diámetro y longitud salen del modelo elegido.
    expect(screen.getByText("Ø9 mm × 25 cm")).toBeInTheDocument();
    fireEvent.change(cuantos(2), { target: { value: "2" } });

    await waitFor(() => expect(api.coilConstructPreview).toHaveBeenLastCalledWith("s1", [
      { coil_id: "otro-9", count: 1 },
      { coil_id: "relleno-7", count: 2 },
      { coil_id: "acabado-3", count: 1 },
    ]));
    expect(await screen.findByText("18")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Colocar el montaje" }));
    await waitFor(() => expect(api.planCoils).toHaveBeenCalledTimes(1));
    const enviados = vi.mocked(api.planCoils).mock.calls[0]![1].map((p) => p.coil_id);
    expect(enviados).toEqual(["otro-9", "relleno-7", "relleno-7", "acabado-3"]);
  });

  it("se añade y se quita un coil", async () => {
    await abrirCoils();
    fireEvent.click(screen.getByRole("button", { name: "Añadir coil" }));
    expect(modelo(4)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar (fila 1)" }));
    expect(screen.queryByLabelText("Modelo (fila 4)")).toBeNull();
    expect(modelo(1).value).toBe("relleno-7");
    await waitFor(() => expect(api.coilConstructPreview).toHaveBeenCalled());
  });

  it("«Volver a la sugerencia» deshace lo editado", async () => {
    await abrirCoils();
    fireEvent.change(cuantos(2), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Volver a la sugerencia" }));
    expect(cuantos(2).value).toBe("4");
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("sin montaje posible se añaden coils del catálogo", async () => {
    vi.mocked(api.coilRecommendations).mockResolvedValue({
      ...construct, steps: [], feasible: false, projected_packing: 0, neck_mm: 0, wide_neck: false,
      note: "Hace falta la morfometría",
    });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Coils" }));
    await waitFor(() => expect(api.listCoils).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Añadir coil" }));
    expect(modelo(1).value).toBe("enmarcado-10");
  });
});

/* Como F1-22 con los clips: «Limpiar coils» quitaba el montaje colocado y su
   empaque, también del informe, al primer clic. */
describe("«Limpiar coils»", () => {
  it("abre la confirmación y no borra hasta confirmar", async () => {
    await abrirCoils();
    fireEvent.click(screen.getByRole("button", { name: "Colocar el montaje" }));
    await screen.findByText("Densidad de empaque");
    fireEvent.click(screen.getByRole("button", { name: "Limpiar coils" }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Limpiar los coils colocados?" });
    expect(dialogo).toHaveTextContent("los coils colocados y su densidad de empaque, también en el informe");
    expect(api.clearDevices).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.clearDevices).not.toHaveBeenCalled();
    expect(screen.getByText("Densidad de empaque")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar coils" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar los coils" }));
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledWith("s1", "coils"));
    await waitFor(() => expect(screen.queryByText("Densidad de empaque")).toBeNull());
  });
});

describe("el montaje empieza por el cuello (F1-203)", () => {
  it("el primer dato es el cuello, con el aviso de cuello ancho", async () => {
    await abrirCoils();
    const etiquetas = screen.getAllByText(/^(Cuello|Domo|Volumen del saco)$/).map((e) => e.textContent);
    expect(etiquetas[0]).toBe("Cuello");
    expect(etiquetas).toEqual(["Cuello", "Domo", "Volumen del saco"]);
    expect(screen.getByText("cuello ancho: probable adyuvante")).toBeInTheDocument();
  });

  it("sin cuello ancho no hay aviso", async () => {
    vi.mocked(api.coilRecommendations).mockResolvedValue({ ...construct, wide_neck: false, neck_mm: 2.5, note: "Proyección 24 %." });
    await abrirCoils();
    expect(screen.queryByText("cuello ancho: probable adyuvante")).toBeNull();
  });
});
