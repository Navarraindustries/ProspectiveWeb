import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PatientSummary } from "../../api/types";
import { STEPS } from "../../pipeline/steps";

const captureObjectUrl = vi.fn();
const studyThumbnailObjectUrl = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    captureObjectUrl: (id: number) => captureObjectUrl(id),
    studyThumbnailObjectUrl: (id: number) => studyThumbnailObjectUrl(id),
  },
}));

import { PatientCard } from "./PatientCard";

function paciente(extra: Partial<PatientSummary> = {}): PatientSummary {
  return {
    id: 7, full_name: "Ana Pérez", hospital_id: "HC-100", dob: "1970-05-01", sex: "F",
    institution: "", study_count: 1, created_at: "2026-10-01T10:00:00", owner_id: 1,
    shared_with_count: 0, is_shared_with_me: false,
    last_session_at: "2026-10-30T10:00:00", last_session_step: 2, last_session_id: "s-1",
    last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null,
    ...extra,
  } as PatientSummary;
}

function montar(p: PatientSummary) {
  const onOpen = vi.fn(), onResume = vi.fn(), onPlan = vi.fn();
  const r = render(<PatientCard patient={p} onOpen={onOpen} onResume={onResume} onPlan={onPlan} />);
  return { onOpen, onResume, onPlan, ...r };
}

let revoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
  captureObjectUrl.mockReset().mockResolvedValue("blob:x");
  studyThumbnailObjectUrl.mockReset().mockResolvedValue("blob:x");
  revoke = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
});
afterEach(cleanup);

describe("PatientCard", () => {
  it("con sesión en Detección: píldora «Paso 3 · Detección», barra al 37 %, botón «Reanudar» que no abre la ficha", () => {
    const { onOpen, onResume } = montar(paciente());
    expect(screen.getByText("Paso 3 · Detección")).toBeTruthy();
    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("37");
    expect((barra.firstElementChild as HTMLElement).style.width).toBe(`${(3 / STEPS.length) * 100}%`);
    fireEvent.click(screen.getByRole("button", { name: /Reanudar/ }));
    expect(onResume).toHaveBeenCalledWith("s-1", expect.objectContaining({ id: 7 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("con la sesión en Informe: botón «Abrir informe» que reanuda esa sesión", () => {
    const { onResume } = montar(paciente({ last_session_step: STEPS.length - 1 }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir informe/ }));
    expect(onResume).toHaveBeenCalledWith("s-1", expect.objectContaining({ id: 7 }));
  });

  it("sin sesión: «Sin sesión», botón «Planificar» que llama a onPlan", () => {
    const { onPlan, onOpen } = montar(paciente({ last_session_id: null, last_session_step: null, last_session_at: null }));
    expect(screen.getByText("Sin sesión")).toBeTruthy();
    expect(screen.getByText(/^Alta /)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));
    expect(onPlan).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("la tarjeta abre la ficha con clic y con Intro; tiene role article y aria-label «{nombre}, HC {hc}»", () => {
    const { onOpen } = montar(paciente());
    const tarjeta = screen.getByRole("article", { name: "Ana Pérez, HC HC-100" });
    fireEvent.click(tarjeta);
    fireEvent.keyDown(tarjeta, { key: "Enter" });
    fireEvent.keyDown(tarjeta, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
    // Intro sobre el botón de acción no debe abrir la ficha.
    fireEvent.keyDown(screen.getByRole("button", { name: /Reanudar/ }), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("pie: «Última sesión …» con sesión y title con la fecha completa", () => {
    montar(paciente());
    const pie = screen.getByText(/^Última sesión /);
    expect(pie.getAttribute("title")).toBeTruthy();
  });

  it("captura: pide captureObjectUrl si hay last_capture_id", async () => {
    const { container } = montar(paciente({ last_capture_id: 5, last_imaging_study_id: 9 }));
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(captureObjectUrl).toHaveBeenCalledWith(5);
    expect(studyThumbnailObjectUrl).not.toHaveBeenCalled();
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("captura: sin captura pide la vista previa del estudio", async () => {
    const { container } = montar(paciente({ last_imaging_study_id: 9 }));
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(captureObjectUrl).not.toHaveBeenCalled();
    expect(studyThumbnailObjectUrl).toHaveBeenCalledWith(9);
  });

  it("captura: sin ninguna, no pide nada y pinta el icono del paso", () => {
    const { container } = montar(paciente());
    expect(captureObjectUrl).not.toHaveBeenCalled();
    expect(studyThumbnailObjectUrl).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".pt-card-media svg")).not.toBeNull();
  });

  it("si la captura falla cae a la vista previa, sin mostrar error", async () => {
    captureObjectUrl.mockRejectedValue(new Error("404"));
    const { container } = montar(paciente({ last_capture_id: 5, last_imaging_study_id: 9 }));
    await waitFor(() => expect(studyThumbnailObjectUrl).toHaveBeenCalledWith(9));
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it("insignias: riesgo con texto, «Compartido contigo» y «Compartido con N»", () => {
    montar(paciente({ last_risk_label: "Alto", is_shared_with_me: true, shared_with_count: 2 }));
    expect(screen.getByText("Alto")).toBeTruthy();
    expect(screen.getByText("Compartido contigo")).toBeTruthy();
    expect(screen.getByText("Compartido con 2")).toBeTruthy();
  });

  it("sin compartir ni riesgo no pinta insignias", () => {
    montar(paciente());
    expect(screen.queryByText(/Compartido/)).toBeNull();
  });

  it("la URL de objeto se libera al desmontar", async () => {
    const { container, unmount } = montar(paciente({ last_capture_id: 5 }));
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
});
