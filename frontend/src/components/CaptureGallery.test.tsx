/* La galería de capturas del caso.

   Lo que se defiende: que la imagen se pide con credenciales (nunca un `src`
   a pelo contra un endpoint autenticado), que el nombre del fichero que se
   descarga no lleva datos del paciente, y que las URL de objeto se sueltan
   al desmontar — son memoria del navegador y una lista abierta veinte veces
   las acumula. */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const listCaptures = vi.fn();
const captureObjectUrl = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    listCaptures: (...a: unknown[]) => listCaptures(...a),
    captureObjectUrl: (...a: unknown[]) => captureObjectUrl(...a),
    renameCapture: vi.fn(),
    deleteCapture: vi.fn(),
  },
}));

import { CaptureGallery, downloadName, humanSize } from "./CaptureGallery";

const fila = (over = {}) => ({
  id: 7, imaging_study_id: 2, case_id: 3, patient_id: 4, session_id: "s1",
  step: "morpho", label: "Morfometría · plano de cuello",
  width: 1600, height: 900, size_bytes: 512000,
  created_at: "2026-09-27T22:31:00", created_by: "juan.medico",
  image_url: "/api/captures/7/image", state: {}, ...over,
});

beforeEach(() => {
  listCaptures.mockReset().mockResolvedValue([fila()]);
  captureObjectUrl.mockReset().mockResolvedValue("blob:captura-7");
});

describe("la galería", () => {
  it("pide las capturas del paciente y las enseña", async () => {
    render(<CaptureGallery patientId={4} />);
    expect(await screen.findByText("Morfometría · plano de cuello")).toBeInTheDocument();
    expect(listCaptures).toHaveBeenCalledWith({ imagingStudyId: undefined, caseId: undefined, patientId: 4 });
  });

  it("la imagen va por blob, no por src contra el endpoint", async () => {
    // Un `src="/api/captures/7/image"` no lleva la cabecera Authorization: se
    // vería un hueco roto, o peor, obligaría a abrir el endpoint.
    render(<CaptureGallery patientId={4} />);
    await waitFor(() => expect(captureObjectUrl).toHaveBeenCalledWith(7));
    const img = await screen.findByAltText<HTMLImageElement>("Morfometría · plano de cuello");
    expect(img.src).toBe("blob:captura-7");
  });

  it("sin capturas explica cómo se hacen, en vez de quedarse en blanco", async () => {
    listCaptures.mockResolvedValue([]);
    render(<CaptureGallery patientId={4} />);
    expect(await screen.findByText(/botón «Captura»/)).toBeInTheDocument();
  });

  it("suelta las URL de objeto al desmontar", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { unmount } = render(<CaptureGallery patientId={4} />);
    await waitFor(() => expect(captureObjectUrl).toHaveBeenCalled());
    await screen.findByAltText("Morfometría · plano de cuello");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:captura-7");
    revoke.mockRestore();
  });

  it("un fallo al listar se dice, no se traga", async () => {
    listCaptures.mockRejectedValue(new Error("sin conexión"));
    render(<CaptureGallery patientId={4} />);
    expect(await screen.findByText(/sin conexión/)).toBeInTheDocument();
  });
});

describe("el nombre del fichero descargado", () => {
  it("lleva fecha y rótulo, y ni un dato del paciente", () => {
    // El PNG se reenvía sin pensarlo; el nombre del fichero viaja con él.
    const n = downloadName({ id: 7, label: "Morfometría · plano de cuello", created_at: "2026-09-27T22:31:00" });
    expect(n).toBe("prospective-20260927-2231-morfometria-plano-de-cuello.png");
    expect(n).not.toMatch(/hernandez|tannia|3245/i);
  });

  it("aguanta un rótulo raro o vacío", () => {
    expect(downloadName({ id: 9, label: "", created_at: "2026-09-27T22:31:00" })).toMatch(/-captura\.png$/);
    expect(downloadName({ id: 9, label: "///", created_at: "fecha mala" })).toBe("prospective-9-captura.png");
  });
});

describe("el peso", () => {
  it("se lee de un vistazo", () => {
    expect(humanSize(512000)).toBe("500 KB");
    expect(humanSize(2_400_000)).toBe("2.4 MB");
    expect(humanSize(0)).toBe("");
  });
});

describe("grabaciones en la galería", () => {
  const video = () => fila({ id: 9, label: "Giro del domo", media_type: "video/mp4", duration_s: 65,
                             video_url: "/api/captures/9/video", image_url: "", size_bytes: 12_000_000 });

  it("no descarga el vídeo al abrir la galería: pesa megas", async () => {
    listCaptures.mockResolvedValue([video()]);
    render(<CaptureGallery patientId={4} />);
    expect(await screen.findByText("Giro del domo")).toBeInTheDocument();
    expect(screen.getByTitle("Reproducir la grabación")).toHaveTextContent("1:05");
    expect(captureObjectUrl).not.toHaveBeenCalled();
  });

  it("al darle a reproducir lo pide con credenciales y lo enseña", async () => {
    const { api } = await import("../api/client");
    (api as unknown as { recordingObjectUrl: (id: number) => Promise<string> }).recordingObjectUrl = vi.fn().mockResolvedValue("blob:video-9");
    listCaptures.mockResolvedValue([video()]);
    const { container } = render(<CaptureGallery patientId={4} />);
    (await screen.findByTitle("Reproducir la grabación")).click();
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:video-9"));
  });

  it("el fichero sale con su extensión de vídeo", () => {
    expect(downloadName({ ...video(), media_type: "video/mp4" })).toMatch(/\.mp4$/);
    expect(downloadName({ ...video(), media_type: "video/webm" })).toMatch(/\.webm$/);
    expect(downloadName(fila())).toMatch(/\.png$/);
  });
});
