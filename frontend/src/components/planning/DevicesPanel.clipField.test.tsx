// Comprueba que colocar pide el campo justo después del plan y que mover el clip lo
// vuelve a pedir con debounce. No había test previo de DevicesPanel: el wrapper es
// el mínimo — PlanningProvider con una sesión fija y una morfometría con cuello —
// y se simulan las llamadas que el panel hace al montarse para que ninguna salga a
// la red de verdad.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { SELECCION } = vi.hoisted(() => {
  const cand = (clip_id: string, clip_name: string) => ({
    clip_id, clip_name, manufacturer: "", shape: "Recto", blade_length_mm: 10, closing_force_g: 120,
    score: 80, verdict: "ok", headline: "", coverage_ratio: 1.4, safety_margin_mm: 2, availability: "stock",
    bend_angle_deg: 0, closing_force_min_g: 120, closing_force_max_g: 120, force_provisional: false,
    criteria: [], fit: null,
  });
  return { SELECCION: {
    outcome: "stock", summary: "", stock_count: 2,
    case: { neck_mm: 0, required_jaw_mm: 0, required_jaw_source: "factor", required_jaw_detail: "",
            approach_angle_deg: null, approach_bend_deg: null, dome_height_mm: 4, max_diameter_mm: 6,
            ar: 1, dnr: 1, parent_artery_mm: 0, neck_source: "", neck_tilt_deg: 0, region: "", laterality: "", aneurysm_type: "" },
    // Orden de las tarjetas: el ranking, no el catálogo.
    recommended: [cand("navarro:t1:0:10.0", "NAVARRO T1 10 mm"), cand("aesculap-recto-7", "Aesculap Recto 7 mm")],
    rejected: [], manufacture: null, custom_jaw: null, multiclip: null, caveats: [],
  } };
});

vi.mock("../../api/client", async (orig) => {
  const mod = await orig<typeof import("../../api/client")>();
  return { ...mod, api: { ...mod.api,
    // El recomendador viejo, en orden de catálogo: ya no da la lista del menú.
    clipRecommendations: vi.fn(async () => [{ clip_id: "aesculap-recto-7", clip_name: "Aesculap Recto 7 mm" }, { clip_id: "navarro:t1:0:10.0", clip_name: "NAVARRO T1 10 mm" }]),
    listCustomClips: vi.fn(async () => []),
    // Decisión nº 23: el menú de modelos sale de las tarjetas de la selección,
    // así que la selección tiene que llegar para poder añadir un clip.
    clipSelection: vi.fn(async () => SELECCION),
    placedDevices: vi.fn(async () => ({ remaining: [], mesh_urls: {} })),
    coilRecommendations: vi.fn(() => new Promise(() => { /* la pestaña de coils solo se monta y se desmonta */ })),
    clearDevices: vi.fn(async () => ({ status: "ok" })),
    putPlacedClips: vi.fn(async (_sid: string, state: unknown) => state),
    clipOcclusion: vi.fn(() => new Promise(() => { /* la tarjeta de oclusión no es lo que se prueba */ })),
    planClips: vi.fn(async () => ({ clips_mesh_url: "/m/clips.vtp", trajectory_mesh_url: null, neck_coverage_pct: 90, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null })),
    clipField: vi.fn(async () => ({ field_mesh_url: "/m/clip_field.vtp?v=1", scalars: {}, summary: { covered_pct: 90, residual_pct: 10, unreached_pct: 0, contact_area_mm2: 8, force_g: 120, force_is_band_min: true, force_provisional: true, pressure_g_mm2: 15, window_g_mm2: [10, 12, 18, 22], pressure_verdict: "optima", force_window_g: [70, 80, 120, 150], neck_evaluated: true, clips: [{ name: "x", force_g: 120, verdict: "optima" }], verdict: "ok", criteria: [], clip_name: "x", note: "Estimación geométrica" } })),
  } };
});
import { api, ApiError } from "../../api/client";
import { DevicesPanel } from "./DevicesPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { MorphometryResult } from "../../api/types";

const morpho = {
  neck_origin: { x: 1, y: 2, z: 3 }, principal_axis: [0, 0, 1],
  centroid: { x: 1, y: 2, z: 5 }, dome_height_mm: 4, reliable: true,
} as unknown as MorphometryResult;

function Seed({ children }: { children: ReactNode }) {
  const { sessionId, setSession, setMorphometry } = usePlanning();
  useEffect(() => { if (!sessionId) { setSession("s1"); setMorphometry(morpho); } }, [sessionId, setSession, setMorphometry]);
  return sessionId ? <>{children}</> : null;
}

/** Los números de los clips colocados, abriendo su «Ajuste fino» (F1-200). */
function numeros() {
  for (const t of screen.queryAllByRole("button", { name: /Ajuste fino/ })) {
    if (t.getAttribute("aria-expanded") === "false") fireEvent.click(t);
  }
  return screen.getAllByRole("spinbutton");
}

/** Monta el panel, añade el clip recomendado y pulsa «Colocar 1 y verificar». */
async function colocar() {
  render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
  const addBtn = () => screen.getByRole("button", { name: /Añadir al plan y colocar/ });
  await waitFor(() => expect(addBtn()).not.toBeDisabled());
  fireEvent.click(addBtn());
  fireEvent.click(screen.getByRole("button", { name: /Colocar 1 y verificar/ }));
}

describe("DevicesPanel · campo del clip", () => {
  // shouldAdvanceTime: el waitFor de Testing Library usa los temporizadores del
  // navegador; congelados del todo, nunca vuelve a mirar.
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it("tras colocar pide el campo una vez y enseña la tarjeta", async () => {
    await colocar();
    await waitFor(() => expect(api.clipField).toHaveBeenCalledTimes(1));
    expect(api.planClips).toHaveBeenCalledTimes(1);
    const [sid, req] = vi.mocked(api.clipField).mock.calls[0];
    expect(sid).toBe("s1");
    expect(req.placements[0]).toMatchObject({ clip_id: "navarro:t1:0:10.0", position: { x: 1, y: 2, z: 3 }, rotation_deg: 0 });
    expect(await screen.findByText(/Estimación geométrica/)).toBeInTheDocument();
    // Colocar no debe disparar además el debounce: sigue siendo una sola llamada.
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.clipField).toHaveBeenCalledTimes(1);
  });

  it("mientras la lista no es la del plan la tarjeta dice DESFASADO, y deja de decirlo al recolocar", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    expect(screen.queryByText("DESFASADO")).toBeNull();
    fireEvent.change(numeros()[0], { target: { value: "2" } });
    expect(screen.getByText("DESFASADO")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(screen.queryByText("DESFASADO")).toBeNull());
  });

  it("DESFASADO dura hasta que llega el CAMPO nuevo, no solo el plan", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    const campo = await vi.mocked(api.clipField).mock.results[0].value;
    let releaseField: () => void = () => {};
    vi.mocked(api.clipField).mockImplementationOnce(() => new Promise((r) => { releaseField = () => r(campo); }));
    fireEvent.change(numeros()[0], { target: { value: "2" } });
    expect(screen.getByText("DESFASADO")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(260); });
    // El plan nuevo ya llegó y se pidió el campo, que sigue en vuelo…
    await waitFor(() => expect(api.clipField).toHaveBeenCalledTimes(2));
    expect(api.planClips).toHaveBeenCalledTimes(2);
    // …y la tarjeta sigue enseñando el veredicto de la pose anterior: DESFASADO.
    expect(screen.getByText("DESFASADO")).toBeInTheDocument();
    await act(async () => { releaseField(); });
    await waitFor(() => expect(screen.queryByText("DESFASADO")).toBeNull());
  });

  it("DESFASADO sigue mientras el 3D no enseña la malla del campo nuevo", async () => {
    let store: ReturnType<typeof usePlanning> | null = null;
    function Probe() { store = usePlanning(); return null; }
    render(<PlanningProvider><Seed><Probe /><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
    const addBtn = () => screen.getByRole("button", { name: /Añadir al plan y colocar/ });
    await waitFor(() => expect(addBtn()).not.toBeDisabled());
    fireEvent.click(addBtn());
    fireEvent.click(screen.getByRole("button", { name: /Colocar 1 y verificar/ }));
    await screen.findByText(/Estimación geométrica/);
    expect(screen.queryByText("DESFASADO")).toBeNull();
    // El 3D enseña el campo, pero con otro fichero (el de la pose anterior).
    act(() => { store!.setFieldMeshShown(true); store!.setFieldMeshUrl("/m/otro_campo.vtp?v=0"); });
    expect(screen.getByText("DESFASADO")).toBeInTheDocument();
    // Ya tiene puesto el del campo vigente.
    act(() => store!.setFieldMeshUrl(store!.clipField!.field_mesh_url));
    expect(screen.queryByText("DESFASADO")).toBeNull();
    // Sin el campo en el 3D (CALOR ○, otra vista) solo manda la respuesta.
    act(() => { store!.setFieldMeshUrl(null); store!.setFieldMeshShown(false); });
    expect(screen.queryByText("DESFASADO")).toBeNull();
  });

  it("la pestaña de clips se anuncia montada y, al volver con el clip movido desde fuera, recoloca", async () => {
    let store: ReturnType<typeof usePlanning> | null = null;
    function Probe() { store = usePlanning(); return null; }
    render(<PlanningProvider><Seed><Probe /><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
    const addBtn = () => screen.getByRole("button", { name: /Añadir al plan y colocar/ });
    await waitFor(() => expect(addBtn()).not.toBeDisabled());
    fireEvent.click(addBtn());
    fireEvent.click(screen.getByRole("button", { name: /Colocar 1 y verificar/ }));
    await screen.findByText(/Estimación geométrica/);
    expect(store!.clipsTabActive).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Coils" }));
    expect(store!.clipsTabActive).toBe(false);
    // Sin pestaña de clips nadie recoloca (y el 3D esconde las asas). Si aun
    // así la lista cambia, volver a Clips tiene que recolocar la pose pendiente.
    act(() => store!.setPlacedClips((p) => p.map((c) => ({ ...c, position: [4, 2, 3] }))));
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clips" }));
    expect(store!.clipsTabActive).toBe(true);
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.planClips).mock.calls[1][0].placements[0].position.x).toBe(4);
  });

  it("volver a la pestaña de clips sin nada movido no recoloca", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    fireEvent.click(screen.getByRole("button", { name: "Coils" }));
    fireEvent.click(screen.getByRole("button", { name: "Clips" }));
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
  });

  it("la fila elegida es el clip de las asas: por defecto el último, y un clic elige otro", async () => {
    render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
    const addBtn = () => screen.getByRole("button", { name: /Añadir al plan y colocar/ });
    await waitFor(() => expect(addBtn()).not.toBeDisabled());
    fireEvent.click(addBtn());
    fireEvent.click(screen.getByRole("button", { name: "Añadir otro clip (montaje de varios)" }));   // la segunda pantalla añade otro igual
    const rows = () => screen.getAllByRole("button", { name: /^#\d · / });
    expect(rows().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    fireEvent.click(rows()[0]);
    expect(rows().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("mover el clip vuelve a pedir el campo tras 250 ms, no en cada tecla", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    expect(api.clipField).toHaveBeenCalledTimes(1);
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "1.5" } });
    fireEvent.change(x, { target: { value: "2" } });
    expect(api.clipField).toHaveBeenCalledTimes(1);
    expect(api.planClips).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(260); });
    // Se recoloca y se recalcula: malla, campo y tarjeta hablan de la misma pose.
    await waitFor(() => expect(api.clipField).toHaveBeenCalledTimes(2));
    expect(api.planClips).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.planClips).mock.calls[1][0].placements[0].position.x).toBe(2);
    expect(vi.mocked(api.clipField).mock.calls[1][1].placements[0].position.x).toBe(2);
  });

  it("un cambio con una colocación en vuelo se recoloca una vez al terminar, sin apilar", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    let release: () => void = () => {};
    vi.mocked(api.planClips).mockImplementationOnce(() => new Promise((r) => {
      release = () => r({ clips_mesh_url: "/m/clips.vtp", trajectory_mesh_url: null, neck_coverage_pct: 90, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null });
    }));
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    // Dos cambios más con la segunda colocación aún en vuelo: no se apilan.
    fireEvent.change(x, { target: { value: "6" } });
    act(() => { vi.advanceTimersByTime(260); });
    fireEvent.change(x, { target: { value: "7" } });
    act(() => { vi.advanceTimersByTime(260); });
    expect(api.planClips).toHaveBeenCalledTimes(2);
    await act(async () => { release(); });
    // Al terminar, una sola recolocación con la última pose.
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.planClips).mock.calls[2][0].placements[0].position.x).toBe(7);
    await waitFor(() => expect(api.clipField).toHaveBeenCalledTimes(3));
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(3);
  });

  it("limpiar con un cambio pendiente no vuelve a colocar el clip", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    let releaseClear: () => void = () => {};
    vi.mocked(api.clearDevices).mockImplementationOnce(() => new Promise((r) => {
      releaseClear = () => r({ status: "ok" } as never);
    }));
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "5" } });
    // Limpiar antes de que venzan los 250 ms, con el borrado aún sin responder.
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole("button", { name: /Limpiar clips colocados/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar los clips" }));
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
    await act(async () => { releaseClear(); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
    expect(api.clipField).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(/Mapa de calor del clip/)).toBeNull());
  });

  it("«Limpiar todos» con un cambio pendiente tampoco vuelve a colocar el clip", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    let releaseClear: () => void = () => {};
    vi.mocked(api.clearDevices).mockImplementationOnce(() => new Promise((r) => {
      releaseClear = () => r({ status: "ok" } as never);
    }));
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar todos" }));
    act(() => { vi.advanceTimersByTime(400); });
    // Un cambio hecho mientras el borrado no responde tampoco recoloca.
    fireEvent.change(x, { target: { value: "6" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
    await act(async () => { releaseClear(); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
    expect(api.clipField).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(/Mapa de calor del clip/)).toBeNull());
  });

  it("«Limpiar todos» con una colocación en vuelo espera al plan antes del DELETE y no pinta nada", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    let release: () => void = () => {};
    vi.mocked(api.planClips).mockImplementationOnce(() => new Promise((r) => {
      release = () => r({ clips_mesh_url: "/m/clips_tarde.vtp", trajectory_mesh_url: null, neck_coverage_pct: 90, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null });
    }));
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    // Con la segunda colocación en vuelo, «Limpiar todos» sigue disponible…
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar todos" }));
    // …pero el DELETE no sale mientras el plan no haya respondido: el servidor
    // atendería los dos a la vez y podría volver a apuntar el clip tras borrarlo.
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(api.clearDevices).not.toHaveBeenCalled();
    await act(async () => { release(); });
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("En el plan (0)")).toBeInTheDocument());
    act(() => { vi.advanceTimersByTime(400); });
    // Nada vuelve: ni la tarjeta del plan, ni la barra (malla de clips), ni el
    // campo, ni otra petición.
    expect(screen.queryByText("Extensión de las hojas sobre el cuello")).toBeNull();
    // La barra se queda (lleva el selector de estrategia), pero vacía.
    expect(screen.getByText("En el plan (0)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Limpiar todos los dispositivos/ })).toBeNull();
    expect(screen.queryByText(/Mapa de calor del clip/)).toBeNull();
    expect(api.clipField).toHaveBeenCalledTimes(1);
    expect(api.planClips).toHaveBeenCalledTimes(2);
    const order = (fn: unknown) => (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder.at(-1) ?? 0;
    expect(order(api.clearDevices)).toBeGreaterThan(order(api.planClips));
    expect(order(api.clearDevices)).toBeGreaterThan(order(api.clipField));
  });

  it("«Limpiar todos» sigue limpiando aunque el plan en vuelo falle", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    let fail: () => void = () => {};
    vi.mocked(api.planClips).mockImplementationOnce(() => new Promise((_, rej) => { fail = () => rej(new Error("caído")); }));
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar todos" }));
    expect(api.clearDevices).not.toHaveBeenCalled();
    await act(async () => { fail(); });
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("En el plan (0)")).toBeInTheDocument());
    expect(screen.queryByText(/caído/)).toBeNull();
  });

  it("volver a la pose anterior mientras otra está en vuelo la recoloca al terminar", async () => {
    await colocar(); // pose A: x = 1
    await screen.findByText(/Estimación geométrica/);
    let release: () => void = () => {};
    vi.mocked(api.planClips).mockImplementationOnce(() => new Promise((r) => {
      release = () => r({ clips_mesh_url: "/m/clips.vtp", trajectory_mesh_url: null, neck_coverage_pct: 90, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null });
    }));
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "5" } }); // pose B
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    fireEvent.change(x, { target: { value: "1" } }); // de vuelta a A, con B en vuelo
    act(() => { vi.advanceTimersByTime(260); });
    expect(api.planClips).toHaveBeenCalledTimes(2);
    await act(async () => { release(); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.planClips).mock.calls[2][0].placements[0].position.x).toBe(1);
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(3);
  });

  it("volver a la pose ya colocada no pide nada", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    const [x] = numeros();
    fireEvent.change(x, { target: { value: "1.5" } });
    fireEvent.change(x, { target: { value: "1" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).toHaveBeenCalledTimes(1);
  });

  it("un fallo del plan no pide el campo", async () => {
    vi.mocked(api.planClips).mockRejectedValueOnce(new Error("Sin malla"));
    await colocar();
    expect(await screen.findByText(/Sin malla/)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.clipField).not.toHaveBeenCalled();
  });

  it("un fallo del campo que no es 409 se enseña como error y el plan se queda", async () => {
    vi.mocked(api.clipField).mockRejectedValueOnce(new ApiError(500, "Fallo del servidor"));
    await colocar();
    expect(await screen.findByText(/Fallo del servidor/)).toBeInTheDocument();
    expect(screen.getByText("Extensión de las hojas sobre el cuello")).toBeInTheDocument();
    expect(screen.queryByText(/Mapa de calor del clip/)).toBeNull();
  });

  it("un fallo del campo no deshace la colocación y un 409 se lee como nota", async () => {
    vi.mocked(api.clipField).mockRejectedValueOnce(new ApiError(409, "No hay saco aislado: separa el saco antes de pedir el campo."));
    await colocar();
    expect(await screen.findByText(/No hay saco aislado/)).toBeInTheDocument();
    // El plan sigue ahí: la tarjeta de cobertura del plan se pintó.
    expect(screen.getByText("Extensión de las hojas sobre el cuello")).toBeInTheDocument();
    expect(screen.queryByText(/Mapa de calor del clip/)).toBeNull();
  });

  // F1-28: reanudar devolvía el clip como malla. La fila editable y su
  // verificación se guardan al colocar y vuelven con la sesión.
  it("al colocar guarda la lista editable y la verificación con la sesión", async () => {
    await colocar();
    await waitFor(() => expect(api.putPlacedClips).toHaveBeenCalledTimes(1));
    const [sid, state] = vi.mocked(api.putPlacedClips).mock.calls[0];
    expect(sid).toBe("s1");
    expect(state.clips).toEqual([{ key: 1, clip_id: "navarro:t1:0:10.0", name: "NAVARRO T1 10 mm",
      position: [1, 2, 3], rotation_deg: 0, azimuthDeg: 0, elevationDeg: 0 }]);
    expect(state.plan?.neck_coverage_pct).toBe(90);
  });

  it("una lista que volvió al reanudar enseña su verificación sin volver a colocar", async () => {
    const clip = { key: 5, clip_id: "navarro:t1:0:10.0", name: "NAVARRO T1 10 mm", position: [1, 2, 3] as [number, number, number], rotation_deg: 0, azimuthDeg: 0, elevationDeg: 0 };
    function Reanudada({ children }: { children: ReactNode }) {
      const p = usePlanning();
      useEffect(() => {
        if (p.sessionId) return;
        p.setSession("s1"); p.setMorphometry(morpho);
        p.setPlacedClips([clip]); p.setPlannedClips([clip]);
        p.setClipPlan({ clips_mesh_url: "/m/clips.vtp", trajectory_mesh_url: null, neck_coverage_pct: 77, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null });
        p.restoreDeviceMesh("clips", "/m/clips.vtp");
      }, [p]);
      return p.sessionId ? <>{children}</> : null;
    }
    vi.mocked(api.placedDevices).mockResolvedValueOnce({ cleared: [], remaining: ["clips"], meshes_removed: 0, mesh_urls: { clips: "/m/clips.vtp?v=9" } });
    render(<PlanningProvider><Reanudada><DevicesPanel onNext={() => {}} /></Reanudada></PlanningProvider>);
    fireEvent.click(await screen.findByText("Colocar"));
    expect(await screen.findByText(/77\.0/)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.planClips).not.toHaveBeenCalled();
  });
});

/* Como F1-22: «Limpiar todos los dispositivos» quitaba los clips colocados a
   mano sin preguntar, al lado de «Limpiar clips colocados», que sí preguntaba. */
describe("«Limpiar todos los dispositivos»", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it("abre la confirmación y no borra hasta confirmar", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Limpiar todos los dispositivos?" });
    expect(dialogo).toHaveTextContent("todo lo colocado: los clips, con su verificación");
    expect(dialogo).toHaveTextContent("La estrategia del equipo se queda.");
    expect(api.clearDevices).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.clearDevices).not.toHaveBeenCalled();
    expect(screen.getByText(/Estimación geométrica/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar todos" }));
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledWith("s1"));
  });
});

/* F1-22: «Limpiar clips colocados» se llevaba la pose, la verificación, la
   oclusión y el mapa de calor al primer clic. */
describe("«Limpiar clips colocados»", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it("abre la confirmación y no borra hasta confirmar", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    fireEvent.click(screen.getByRole("button", { name: /Limpiar clips colocados/ }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Limpiar los clips colocados?" });
    expect(dialogo).toHaveTextContent("la pose, la verificación, la oclusión y el mapa de calor");
    expect(api.clearDevices).not.toHaveBeenCalled();
    expect(screen.getByText(/Estimación geométrica/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar los clips" }));
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledWith("s1", "clips"));
  });
});

/* Filas sueltas del paso Dispositivos: F1-184, F1-196 (decisión nº 23),
   F1-199 y F1-200. */
describe("DevicesPanel · rótulos y una sola lista de clips", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const montar = () => render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);

  it("entradilla nueva (F1-184)", async () => {
    montar();
    expect(await screen.findByText("Traza el abordaje y prueba clip, coils, stent o WEB sobre el saco medido")).toBeInTheDocument();
    expect(screen.queryByText(/Elige clip, coils o stent del catálogo/)).toBeNull();
  });

  it("el primer elemento del menú es la primera tarjeta (F1-196, nº 23)", async () => {
    montar();
    const menu = await screen.findByLabelText(/Recomendados \+ personalizados \(2\)/) as HTMLSelectElement;
    const tarjetas = SELECCION.recommended.map((c) => c.clip_name);
    expect(Array.from(menu.options).map((o) => o.text)).toEqual(tarjetas);
    // Y viene elegido: la primera tarjeta es lo que se coloca si no se toca nada.
    expect(menu.value).toBe(SELECCION.recommended[0].clip_id);
    // El recomendador viejo, en otro orden, ya no hace la lista.
    expect(api.clipRecommendations).not.toHaveBeenCalled();
  });

  it("«Otros del catálogo» va detrás de las tarjetas y no se puede elegir", async () => {
    vi.mocked(api).listClips = vi.fn(async () => [
      { id: "aesculap-recto-7", name: "Aesculap Recto 7 mm" },
      { id: "sugita-curvo-9", name: "Sugita Curvo 9 mm" },
    ]) as never;
    montar();
    await screen.findByLabelText(/Recomendados \+ personalizados \(2\)/);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ver todo el catálogo/ }));
    const menu = await screen.findByLabelText(/Todo el catálogo \(3\)/) as HTMLSelectElement;
    const textos = Array.from(menu.options).map((o) => o.text);
    expect(textos).toEqual(["NAVARRO T1 10 mm", "Aesculap Recto 7 mm", "── Otros del catálogo ──", "Sugita Curvo 9 mm"]);
    expect(menu.options[2].disabled).toBe(true);
  });

  it("«Añadir» dice que suma otro clip al montaje (F1-199)", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    expect(screen.getByRole("button", { name: "Añadir otro clip (montaje de varios)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeInTheDocument();
  });

  it("los campos numéricos empiezan plegados (F1-200)", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    const fino = screen.getByRole("button", { name: /Ajuste fino/ });
    expect(fino).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(fino);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(6);
  });
});
