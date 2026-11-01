/* La vista previa de una sesión guardada, última columna de la cascada: la
   miniatura del estudio, el paso, el diámetro y el riesgo, y «Reanudar».
   Viene de la ficha antigua (PatientSheet.test › sesiones guardadas: el
   «Reanudar» de cada fila, F1-69). */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const studyThumbnailObjectUrl = vi.fn();

vi.mock("../../api/client", () => ({
  api: { studyThumbnailObjectUrl: (id: number) => studyThumbnailObjectUrl(id) },
}));

import { VistaPrevia } from "./VistaPrevia";
import type { PatientSessionInfo, StudyCard } from "../../api/types";

const guardada = (o: Partial<PatientSessionInfo> = {}): PatientSessionInfo => ({
  session_id: "s-1", label: "Antes de medir", current_step: 2, max_diameter_mm: null, rupture_risk_label: null,
  created_at: "2026-10-11T05:00:00", updated_at: "2026-10-11T05:05:09", size_bytes: 1024, case_id: 9, imaging_study_id: 7, ...o,
});
const estudio = (o: Partial<StudyCard> = {}): StudyCard => ({
  id: 7, case_id: 9, patient_id: 2, owner_id: 1, patient_name: "Segura, Juan", hospital_id: "HC-2", description: "Angio 3D",
  modality: "XA", acquired_at: "2026-10-01", dx_principal: "Aneurisma ACM", created_at: "2026-10-01T00:00:00",
  archived: true, has_thumbnail: true, n_files: 120, n_slices: 120, size_mb: 50, session_count: 1, last_step: null,
  max_diameter_mm: null, rupture_risk_label: null, resumable_session_id: null, ...o,
});

const onResume = vi.fn();

beforeEach(() => {
  onResume.mockReset();
  studyThumbnailObjectUrl.mockReset().mockResolvedValue("blob:miniatura");
});

describe("VistaPrevia", () => {
  it("«Reanudar» es la acción principal, dice que tarda y reanuda esa sesión", () => {
    render(<VistaPrevia sesion={guardada()} estudio={estudio({ has_thumbnail: false })} nombrePaciente="Segura, Juan" onResume={onResume} />);
    const reanudar = screen.getByRole("button", { name: "Reanudar" });
    expect(reanudar.getAttribute("title")).toMatch(/Tarda unos segundos/);
    expect(reanudar.getAttribute("title")).toContain("«Detección»");
    expect(reanudar.getAttribute("data-variant")).toBe("default");
    fireEvent.click(reanudar);
    expect(onResume).toHaveBeenCalledWith("s-1");
  });

  it("enseña la miniatura del estudio, el nombre de la sesión y el paso", async () => {
    render(<VistaPrevia sesion={guardada()} estudio={estudio()} nombrePaciente="Segura, Juan" onResume={onResume} />);
    expect(((await screen.findByAltText("Vista previa de Angio 3D")) as HTMLImageElement).src).toBe("blob:miniatura");
    expect(screen.getByRole("heading", { name: "Antes de medir" })).toBeTruthy();
    expect(screen.getByText("Paso 3 · Detección")).toBeTruthy();
  });

  it("sin estudio archivado dice «Sin vista previa»", () => {
    render(<VistaPrevia sesion={guardada({ imaging_study_id: null })} estudio={null} nombrePaciente="Segura, Juan" onResume={onResume} />);
    expect(screen.getByText("Sin vista previa")).toBeTruthy();
    expect(studyThumbnailObjectUrl).not.toHaveBeenCalled();
  });

  it("con medidas, el Ø máximo y el riesgo; sin ellas, nada", () => {
    const { unmount } = render(
      <VistaPrevia sesion={guardada({ max_diameter_mm: 7.42, rupture_risk_label: "Alto" })} estudio={null} nombrePaciente="Segura, Juan" onResume={onResume} />,
    );
    expect(screen.getByText("Ø máximo 7,4 mm")).toBeTruthy();
    expect(screen.getByText("Riesgo morfométrico alto")).toBeTruthy();
    unmount();
    render(<VistaPrevia sesion={guardada()} estudio={null} nombrePaciente="Segura, Juan" onResume={onResume} />);
    expect(screen.queryByText(/Ø máximo/)).toBeNull();
  });

  it("sin a quién llevar la sesión (sin la fila de la lista) no hay «Reanudar»", () => {
    render(<VistaPrevia sesion={guardada()} estudio={null} nombrePaciente="Segura, Juan" />);
    expect(screen.queryByRole("button", { name: "Reanudar" })).toBeNull();
  });
});
