// Comprueba que colocar pide el campo justo después del plan y que mover el clip lo
// vuelve a pedir con debounce. No había test previo de DevicesPanel: el wrapper es
// el mínimo — PlanningProvider con una sesión fija y una morfometría con cuello —
// y se simulan las llamadas que el panel hace al montarse para que ninguna salga a
// la red de verdad.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", async (orig) => {
  const mod = await orig<typeof import("../../api/client")>();
  return { ...mod, api: { ...mod.api,
    clipRecommendations: vi.fn(async () => [{ clip_id: "navarro:t1:0:10.0", clip_name: "NAVARRO T1 10 mm" }]),
    listCustomClips: vi.fn(async () => []),
    clipSelection: vi.fn(() => new Promise(() => { /* nunca resuelve: no es lo que se prueba */ })),
    placedDevices: vi.fn(async () => ({ remaining: [], mesh_urls: {} })),
    clearDevices: vi.fn(async () => ({ status: "ok" })),
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
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "2" } });
    expect(screen.getByText("DESFASADO")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(screen.queryByText("DESFASADO")).toBeNull());
  });

  it("la fila elegida es el clip de las asas: por defecto el último, y un clic elige otro", async () => {
    render(<PlanningProvider><Seed><DevicesPanel onNext={() => {}} /></Seed></PlanningProvider>);
    const addBtn = () => screen.getByRole("button", { name: /Añadir al plan y colocar/ });
    await waitFor(() => expect(addBtn()).not.toBeDisabled());
    fireEvent.click(addBtn());
    fireEvent.click(screen.getByRole("button", { name: /^Añadir$/ }));   // la segunda pantalla añade otro igual
    const rows = () => screen.getAllByRole("button", { name: /^#\d · / });
    expect(rows().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    fireEvent.click(rows()[0]);
    expect(rows().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("mover el clip vuelve a pedir el campo tras 250 ms, no en cada tecla", async () => {
    await colocar();
    await screen.findByText(/Estimación geométrica/);
    expect(api.clipField).toHaveBeenCalledTimes(1);
    const [x] = screen.getAllByRole("spinbutton");
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
    const [x] = screen.getAllByRole("spinbutton");
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
    const [x] = screen.getAllByRole("spinbutton");
    fireEvent.change(x, { target: { value: "5" } });
    // Limpiar antes de que venzan los 250 ms, con el borrado aún sin responder.
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole("button", { name: /Limpiar clips colocados/ }));
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
    const [x] = screen.getAllByRole("spinbutton");
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
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
    const [x] = screen.getAllByRole("spinbutton");
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    // Con la segunda colocación en vuelo, «Limpiar todos» sigue disponible…
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    // …pero el DELETE no sale mientras el plan no haya respondido: el servidor
    // atendería los dos a la vez y podría volver a apuntar el clip tras borrarlo.
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(api.clearDevices).not.toHaveBeenCalled();
    await act(async () => { release(); });
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/En el plan/)).toBeNull());
    act(() => { vi.advanceTimersByTime(400); });
    // Nada vuelve: ni la tarjeta del plan, ni la barra (malla de clips), ni el
    // campo, ni otra petición.
    expect(screen.queryByText("Extensión de las hojas sobre el cuello")).toBeNull();
    expect(screen.queryByText(/En el plan/)).toBeNull();
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
    const [x] = screen.getAllByRole("spinbutton");
    fireEvent.change(x, { target: { value: "5" } });
    act(() => { vi.advanceTimersByTime(260); });
    await waitFor(() => expect(api.planClips).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: /Limpiar todos los dispositivos/ }));
    expect(api.clearDevices).not.toHaveBeenCalled();
    await act(async () => { fail(); });
    await waitFor(() => expect(api.clearDevices).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/En el plan/)).toBeNull());
    expect(screen.queryByText(/caído/)).toBeNull();
  });

  it("volver a la pose anterior mientras otra está en vuelo la recoloca al terminar", async () => {
    await colocar(); // pose A: x = 1
    await screen.findByText(/Estimación geométrica/);
    let release: () => void = () => {};
    vi.mocked(api.planClips).mockImplementationOnce(() => new Promise((r) => {
      release = () => r({ clips_mesh_url: "/m/clips.vtp", trajectory_mesh_url: null, neck_coverage_pct: 90, collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null });
    }));
    const [x] = screen.getAllByRole("spinbutton");
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
    const [x] = screen.getAllByRole("spinbutton");
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
});
