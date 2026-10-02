/* El botón «Grabar» del topbar.

   Lo que se defiende: que al parar el vídeo SIEMPRE se descarga, que además
   se guarda en el caso cuando hay estudio archivado, que sin estudio lo dice
   en vez de callarse, y que sin visor no se puede empezar. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveRecording = vi.fn();
vi.mock("../api/client", () => ({ api: { saveRecording: (...a: unknown[]) => saveRecording(...a) } }));

let planning: Record<string, unknown> = {};
vi.mock("../store/planning", () => ({ usePlanning: () => planning }));

const stop = vi.fn();
const startRecording = vi.fn();
vi.mock("../vtk/viewerRecorder", async (orig) => ({
  ...(await orig<typeof import("../vtk/viewerRecorder")>()),
  startRecording: (...a: unknown[]) => startRecording(...a),
}));

import { RecordButton, formatElapsed } from "./RecordButton";

const resultado = (over = {}) => ({
  blob: new Blob(["v"], { type: "video/mp4" }), mimeType: "video/mp4",
  durationS: 12.3, width: 1280, height: 720, hitLimit: false, ...over,
});

beforeEach(() => {
  saveRecording.mockReset().mockResolvedValue({ id: 1 });
  stop.mockReset().mockResolvedValue(resultado());
  startRecording.mockReset().mockReturnValue({ stop, elapsedMs: () => 12_300, mimeType: "video/mp4" });
  planning = {
    viewerRecording: { read: () => null, state: () => ({ candidate_id: "cand-001" }) },
    imagingStudyId: 5, sessionId: "s1",
  };
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

describe("el botón de grabar", () => {
  it("sin visor no deja empezar", () => {
    planning.viewerRecording = null;
    render(<RecordButton step="morpho" onMessage={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Grabar/ })).toBeDisabled();
  });

  it("al parar descarga y guarda en el caso, con el estado del visor", async () => {
    const onMessage = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<RecordButton step="morpho" onMessage={onMessage} />);
    fireEvent.click(screen.getByRole("button", { name: /Grabar/ }));
    expect(startRecording).toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Detener/ }));
    await waitFor(() => expect(saveRecording).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();                        // descargado
    const [blob, meta] = saveRecording.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(meta).toMatchObject({ imaging_study_id: 5, step: "morpho", duration_s: 12.3, state: { candidate_id: "cand-001" } });
    await waitFor(() => expect(onMessage).toHaveBeenLastCalledWith(expect.objectContaining({ tone: "ok" })));
  });

  it("sin estudio archivado descarga igual y dice que no quedó en el caso", async () => {
    planning.imagingStudyId = null;
    const onMessage = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<RecordButton step="morpho" onMessage={onMessage} />);
    fireEvent.click(screen.getByRole("button", { name: /Grabar/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Detener/ }));
    await waitFor(() => expect(onMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ tone: "err", text: expect.stringMatching(/descargado.*Adjuntar a un caso/) })));
    expect(saveRecording).not.toHaveBeenCalled();
  });

  it("si el navegador no sabe grabar, lo dice", () => {
    startRecording.mockImplementation(() => { throw new Error("Este navegador no puede grabar vídeo."); });
    const onMessage = vi.fn();
    render(<RecordButton step="morpho" onMessage={onMessage} />);
    fireEvent.click(screen.getByRole("button", { name: /Grabar/ }));
    expect(onMessage).toHaveBeenLastCalledWith({ tone: "err", text: "Este navegador no puede grabar vídeo." });
  });

  it("al desmontar grabando, cierra y entrega el vídeo", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { unmount } = render(<RecordButton step="morpho" onMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Grabar/ }));
    await screen.findByRole("button", { name: /Detener/ });
    await act(async () => { unmount(); });
    expect(stop).toHaveBeenCalled();
  });

  it("el contador en minutos y segundos", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_400)).toBe("01:05");
  });
});
