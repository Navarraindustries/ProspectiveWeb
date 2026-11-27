/* P10: el flow diverter en tres clics (proximal, distal y saco). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stentTresClics = vi.fn();
vi.mock("../../api/client", () => ({ api: { stentTresClics: (...a: unknown[]) => stentTresClics(...a) } }));

let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));

import { StentTresClics } from "./StentTresClics";

const respuesta = (over: Record<string, unknown> = {}) => ({
  centerline: { centerline_mesh_url: "/m/centerline.vtp?v=2", arc_length_mm: 50.2 },
  sizing: {}, neck_source: "saco", lesion_mesh: "aneurysm_sac.vtp",
  device_id: "pipeline-shield-4.0", device_name: "Pipeline Shield", diameter_mm: 3.25,
  labelled_length_mm: 20, deploy_arc_mm: [14.8, 34.8],
  stent: { stent_mesh_url: "/m/cl_stent.vtp?v=3" },
  message: "Pipeline Shield Ø3,25 × 20 mm desplegado de 14,8 a 34,8 mm.", ...over,
});

beforeEach(() => {
  stentTresClics.mockReset().mockResolvedValue(respuesta());
  planning = {
    sessionId: "s", segmentation: { mesh_url: "/m.vtp" }, pickMode: null,
    clSource: null, clTarget: null, stentSac: null, morphometry: null, allCandidates: [], centerlineMesh: null,
    setPickMode: vi.fn(), setClSource: vi.fn(), setClTarget: vi.fn(), setStentSac: vi.fn(),
    setCenterlineMesh: vi.fn(), setCenterline: vi.fn(), setCenterlineArcMm: vi.fn(), setDeviceMesh: vi.fn(),
  };
});

const empezar = () => fireEvent.click(screen.getByRole("button", { name: /tres clics en el visor/ }));

describe("el stent en tres clics", () => {
  it("empezar borra los puntos de antes y arma el primer clic", () => {
    render(<StentTresClics onDone={vi.fn()} />);
    empezar();
    expect(planning.setClSource).toHaveBeenCalledWith(null);
    expect(planning.setStentSac).toHaveBeenCalledWith(null);
    expect(planning.setPickMode).toHaveBeenCalledWith("stent_prox");
  });

  it("el tercer clic lanza el cálculo y deja línea, stent y tramo puestos", async () => {
    const onDone = vi.fn();
    const { rerender } = render(<StentTresClics onDone={onDone} />);
    empezar();
    Object.assign(planning, { clSource: [0, 0, 5], clTarget: [0, 0, 55], stentSac: [7, 0, 30] });
    rerender(<StentTresClics onDone={onDone} />);
    await waitFor(() => expect(stentTresClics).toHaveBeenCalledTimes(1));
    expect(stentTresClics.mock.calls[0][1]).toEqual({
      source: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 55 }, sac: { x: 7, y: 0, z: 30 } });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(planning.setCenterlineMesh).toHaveBeenCalledWith("/m/centerline.vtp?v=2");
    expect(planning.setCenterline).toHaveBeenCalledWith(null);
    expect(planning.setCenterlineArcMm).toHaveBeenCalledWith(50.2);
    expect(planning.setDeviceMesh).toHaveBeenCalledWith("stent", "/m/cl_stent.vtp?v=3");
    expect(screen.getByRole("status").textContent).toMatch(/desplegado de 14,8 a 34,8 mm/);
    expect(screen.getByRole("status").textContent).toMatch(/donde la línea toca el saco/);
  });

  it.each([
    [true, /Cuello medido en Morfometría\./],
    [false, /Cuello estimado en Morfometría: márcalo allí/],
  ])("el cuello de Morfometría dice si se marcó (marcado: %s)", async (marcado, texto) => {
    stentTresClics.mockResolvedValue(respuesta({ neck_source: "morfometria", neck_marked: marcado }));
    const { rerender } = render(<StentTresClics onDone={vi.fn()} />);
    empezar();
    Object.assign(planning, { clSource: [0, 0, 5], clTarget: [0, 0, 55], stentSac: [7, 0, 30] });
    rerender(<StentTresClics onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(texto));
  });

  it("con el saco medido, el tercer clic se puede saltar", async () => {
    Object.assign(planning, { morphometry: { sac_mesh_url: "/sac.vtp" }, pickMode: "stent_saco",
                              clSource: [0, 0, 5], clTarget: [0, 0, 55] });
    render(<StentTresClics onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Usar el saco medido, sin tercer clic" }));
    await waitFor(() => expect(stentTresClics).toHaveBeenCalled());
    expect(stentTresClics.mock.calls[0][1].sac).toBeNull();
  });

  it("si nada encaja, quita el stent de antes y lo dice", async () => {
    stentTresClics.mockResolvedValue(respuesta({ stent: null, device_id: null, deploy_arc_mm: null,
      message: "Ninguna opción del catálogo encaja en este vaso: no se ha desplegado nada." }));
    const { rerender } = render(<StentTresClics onDone={vi.fn()} />);
    empezar();
    Object.assign(planning, { clSource: [0, 0, 5], clTarget: [0, 0, 55], stentSac: [7, 0, 30] });
    rerender(<StentTresClics onDone={vi.fn()} />);
    expect(await screen.findByText(/Ninguna opción del catálogo encaja/)).toBeInTheDocument();
    // El stent de antes colgaba de la línea vieja: se quita del visor.
    expect(planning.setDeviceMesh).toHaveBeenCalledWith("stent", null);
  });

  it("avisa de que sustituye la línea central que haya", () => {
    planning.centerlineMesh = "/m/centerline.vtp";
    render(<StentTresClics onDone={vi.fn()} />);
    expect(screen.getByText("Sustituye la línea central actual.")).toBeInTheDocument();
  });

  it("un error del servidor se enseña y deja repetir", async () => {
    stentTresClics.mockRejectedValue(new Error("La línea central no pasa por delante de ese saco"));
    const { rerender } = render(<StentTresClics onDone={vi.fn()} />);
    empezar();
    Object.assign(planning, { clSource: [0, 0, 5], clTarget: [0, 0, 55], stentSac: [7, 0, 30] });
    rerender(<StentTresClics onDone={vi.fn()} />);
    expect(await screen.findByText(/no pasa por delante de ese saco/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tres clics en el visor/ })).toBeEnabled();
  });

  // Ensayo del 27-11: Esc en el visor apagaba el marcado y el panel seguía con
  // «Cancelar», como si quedaran clics por dar.
  it("si el marcado se apaga desde el visor, el panel vuelve a ofrecer empezar", () => {
    const { rerender } = render(<StentTresClics onDone={vi.fn()} />);
    empezar();
    planning.pickMode = "stent_prox";
    rerender(<StentTresClics onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    planning.pickMode = null; // Esc
    rerender(<StentTresClics onDone={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.getByRole("button", { name: /tres clics en el visor/ })).toBeEnabled();
    expect(stentTresClics).not.toHaveBeenCalled();
  });
});
