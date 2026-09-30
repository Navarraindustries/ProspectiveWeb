/* Elegir capturas para el informe.

   Lo que importa aquí es el ORDEN: son el relato del caso que hace el
   profesional, y si el informe las reordena por fecha deja de ser suyo. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listCaptures = vi.fn();
const captureObjectUrl = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    listCaptures: (...a: unknown[]) => listCaptures(...a),
    captureObjectUrl: (...a: unknown[]) => captureObjectUrl(...a),
  },
}));

import { CapturePicker } from "./CapturePicker";

const fila = (id: number, label: string) => ({
  id, imaging_study_id: 2, case_id: 3, patient_id: 4, session_id: "s",
  step: "morpho", label, width: 800, height: 600, size_bytes: 1000,
  created_at: "2026-09-27T22:31:00", created_by: "u",
  image_url: `/api/captures/${id}/image`, state: {},
});

beforeEach(() => {
  listCaptures.mockReset().mockResolvedValue([fila(1, "cuello"), fila(2, "clip puesto"), fila(3, "corredor")]);
  captureObjectUrl.mockReset().mockResolvedValue("blob:x");
});

function Harness({ onChange = vi.fn() }: { onChange?: (ids: number[]) => void }) {
  return <CapturePicker caseId={3} value={[]} onChange={onChange} />;
}

describe("el selector", () => {
  it("ofrece las capturas del caso, no las de una sola adquisición", async () => {
    // Un informe cubre el caso: puede querer una imagen del TAC inicial junto
    // a otra de la angiografía de control.
    render(<Harness />);
    await screen.findByText("cuello");
    expect(listCaptures).toHaveBeenCalledWith({ caseId: 3 });
  });

  it("marcar una la añade al final, conservando el orden de elección", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<CapturePicker caseId={3} value={[3]} onChange={onChange} />);
    await screen.findByText("cuello");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);   // «cuello», id 1
    expect(onChange).toHaveBeenCalledWith([3, 1]);
    rerender(<CapturePicker caseId={3} value={[3, 1]} onChange={onChange} />);
    // Y se ve en qué puesto va cada una.
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("desmarcar la quita sin tocar el orden de las demás", async () => {
    const onChange = vi.fn();
    render(<CapturePicker caseId={3} value={[3, 1, 2]} onChange={onChange} />);
    await screen.findByText("cuello");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);   // quita id 1
    expect(onChange).toHaveBeenCalledWith([3, 2]);
  });

  it("cuenta cuántas van de cuántas hay", async () => {
    render(<CapturePicker caseId={3} value={[1, 2]} onChange={vi.fn()} />);
    expect(await screen.findByText(/2 de 3/)).toBeInTheDocument();
  });

  it("sin capturas dice de dónde salen, en vez de dejar un hueco", async () => {
    listCaptures.mockResolvedValue([]);
    render(<Harness />);
    expect(await screen.findByText(/botón «Captura» del visor/)).toBeInTheDocument();
  });

  it("si no se pueden listar, el informe sigue pudiéndose generar", async () => {
    listCaptures.mockRejectedValue(new Error("sin conexión"));
    render(<Harness />);
    expect(await screen.findByText(/No hay capturas guardadas/)).toBeInTheDocument();
  });
});

describe("grabaciones", () => {
  it("no ofrece vídeos para el PDF, que no los puede llevar", async () => {
    listCaptures.mockResolvedValue([
      fila(1, "cuello"),
      { ...fila(9, "giro del domo"), media_type: "video/mp4", duration_s: 12, video_url: "/api/captures/9/video", image_url: "" },
    ]);
    render(<Harness />);
    await screen.findByText("cuello");
    expect(screen.queryByText("giro del domo")).toBeNull();
    await waitFor(() => expect(captureObjectUrl).toHaveBeenCalledTimes(1));
    expect(captureObjectUrl).not.toHaveBeenCalledWith(9);
  });
});
