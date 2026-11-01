/* La columna Estudios de imagen: las adquisiciones archivadas de un caso, con
   su miniatura, y al final las sesiones del caso que no tienen estudio
   archivado (spec §8.9: nunca se pierden). Viene de la galería que la ficha
   antigua pintaba dentro de cada caso (StudyGallery compacta). */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const listStudies = vi.fn();
const deleteImagingStudy = vi.fn();
const studyThumbnailObjectUrl = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    listStudies: (q: string, patientId?: number, caseId?: number) => listStudies(q, patientId, caseId),
    deleteImagingStudy: (id: number) => deleteImagingStudy(id),
    studyThumbnailObjectUrl: (id: number) => studyThumbnailObjectUrl(id),
  },
}));

import { ColumnaEstudios } from "./ColumnaEstudios";
import type { PatientSessionInfo, StudyCard, StudySummary } from "../../api/types";

const caso = (o: Partial<StudySummary> & { id: number }): StudySummary => ({
  patient_id: 2, dicom_path: "", modality: "", description: "", acquired_at: "", session_count: 0,
  sintomas_positivos: "", dx_principal: "Aneurisma ACM", dx_secundario: "", tipo_aneurisma: "", tratamiento_propuesto: "",
  region_anatomica: "", lateralidad: "", angiographer: "", mod_tac: false, mod_angio: false, mod_rm: false,
  mod_pangio: false, ...o,
});
const estudio = (o: Partial<StudyCard> & { id: number }): StudyCard => ({
  case_id: 9, patient_id: 2, owner_id: 1, patient_name: "Segura, Juan", hospital_id: "HC-2", description: "Angio 3D",
  modality: "XA", acquired_at: "2026-10-01", dx_principal: "Aneurisma ACM", created_at: "2026-10-01T00:00:00",
  archived: true, has_thumbnail: false, n_files: 120, n_slices: 120, size_mb: 50, session_count: 0, last_step: null,
  max_diameter_mm: null, rupture_risk_label: null, resumable_session_id: null, ...o,
});
const guardada = (o: Partial<PatientSessionInfo> & { session_id: string }): PatientSessionInfo => ({
  label: "", current_step: 2, max_diameter_mm: null, rupture_risk_label: null,
  created_at: "2026-10-11T05:00:00", updated_at: "2026-10-11T05:05:09", size_bytes: 1024, case_id: 9, imaging_study_id: null, ...o,
});

const onSeleccionar = vi.fn();
const onOpenStudy = vi.fn();
const onResume = vi.fn();
const menuDe = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Más acciones del estudio/ }));
};
const onEstudioBorrado = vi.fn();
const onReintentarSesiones = vi.fn();
const abrir = ({ sesiones = [] as PatientSessionInfo[], puedeBorrar = true, seleccionado = null as number | "sin-estudio" | null, sesionesError = null as string | null } = {}) =>
  render(
    <ColumnaEstudios caso={caso({ id: 9 })} sesiones={sesiones} sesionesError={sesionesError}
                     onReintentarSesiones={onReintentarSesiones} seleccionado={seleccionado}
                     onSeleccionar={onSeleccionar} onOpenStudy={onOpenStudy} onResume={onResume} puedeBorrar={puedeBorrar}
                     onEstudioBorrado={onEstudioBorrado} />,
  );

beforeEach(() => {
  for (const f of [listStudies, deleteImagingStudy, studyThumbnailObjectUrl, onSeleccionar, onOpenStudy, onResume, onEstudioBorrado, onReintentarSesiones]) f.mockReset();
  listStudies.mockResolvedValue([estudio({ id: 7 })]);
  studyThumbnailObjectUrl.mockResolvedValue("blob:miniatura");
});

describe("estudios de imagen del caso", () => {
  it("pide los estudios del caso y cada fila dice modalidad, fecha, cortes y sesiones", async () => {
    abrir({ sesiones: [guardada({ session_id: "a", imaging_study_id: 7 }), guardada({ session_id: "b", imaging_study_id: 7 }), guardada({ session_id: "c", imaging_study_id: 8 })] });
    expect(await screen.findByText("Angio 3D")).toBeTruthy();
    expect(listStudies).toHaveBeenCalledWith("", undefined, 9);
    expect(screen.getByText("XA · 1/10/26 · 120 cortes")).toBeTruthy();
    expect(screen.getByText("2 sesiones guardadas")).toBeTruthy();
  });

  it("sin miniatura, un icono que se llama «Sin vista previa» (sin texto en la fila); con ella, la enseña", async () => {
    listStudies.mockResolvedValue([estudio({ id: 7 }), estudio({ id: 8, description: "TAC", has_thumbnail: true })]);
    abrir();
    const sin = await screen.findByRole("img", { name: "Sin vista previa" });
    expect(sin).toHaveAttribute("title", "Sin vista previa");
    expect(screen.queryByText("Sin vista previa")).toBeNull();
    expect(((await screen.findByAltText("Vista previa de TAC")) as HTMLImageElement).src).toBe("blob:miniatura");
    expect(studyThumbnailObjectUrl).toHaveBeenCalledWith(8);
    expect(studyThumbnailObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("elegir un estudio lo comunica (abre Sesiones) y queda marcado", async () => {
    abrir({ seleccionado: 7 });
    const fila = await screen.findByRole("button", { name: /^Angio 3D/ });
    expect(fila.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(fila);
    expect(onSeleccionar).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("«Abrir estudio» lo abre en el flujo", async () => {
    abrir();
    await menuDe();
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir estudio" }));
    expect(onOpenStudy).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("fecha dd/mm/aa, «1 sesión guardada ›» y Reanudar directo (A38, A39)", async () => {
    listStudies.mockResolvedValue([estudio({ id: 40, acquired_at: "20261030", resumable_session_id: "s1" })]);
    abrir({ sesiones: [guardada({ session_id: "s1", imaging_study_id: 40 })] });
    expect(await screen.findByText(/30\/10\/26/)).toBeInTheDocument();
    expect(screen.getByText(/1 sesión guardada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
    expect(onResume).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: /Más acciones del estudio/ }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Abrir estudio", "Borrar estudio"]);
  });

  it("sin sesión reanudable no hay Reanudar", async () => {
    abrir();
    await screen.findByText("Angio 3D");
    expect(screen.queryByRole("button", { name: "Reanudar" })).toBeNull();
  });

  it("sin estudios archivados lo dice", async () => {
    listStudies.mockResolvedValue([]);
    abrir();
    expect(await screen.findByText("Sin imágenes archivadas todavía.")).toBeTruthy();
  });

  it("si la lista falla, lo dice y «Reintentar» la vuelve a pedir", async () => {
    listStudies.mockRejectedValueOnce(new Error("caído"));
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Angio 3D")).toBeTruthy();
    expect(listStudies).toHaveBeenCalledTimes(2);
  });
});

describe("«Sesiones sin estudio archivado» (spec §8.9)", () => {
  it("aparece al final si el caso tiene sesiones sin estudio, y elegirla lo comunica", async () => {
    abrir({ sesiones: [guardada({ session_id: "a", imaging_study_id: null }), guardada({ session_id: "b", imaging_study_id: 7 })] });
    await screen.findByText("Angio 3D");
    fireEvent.click(screen.getByRole("button", { name: "Sesiones sin estudio archivado · 1" }));
    expect(onSeleccionar).toHaveBeenCalledWith("sin-estudio");
  });

  it("no aparece si todas las sesiones del caso tienen estudio, ni cuenta las de otro caso", async () => {
    abrir({ sesiones: [guardada({ session_id: "b", imaging_study_id: 7 }), guardada({ session_id: "x", case_id: 4, imaging_study_id: null })] });
    await screen.findByText("Angio 3D");
    expect(screen.queryByRole("button", { name: /Sesiones sin estudio archivado/ })).toBeNull();
  });

  it("si las sesiones no cargaron, lo dice con su «Reintentar»", async () => {
    listStudies.mockResolvedValue([]);
    abrir({ sesionesError: "No se pudieron leer las sesiones" });
    await screen.findByText("Sin imágenes archivadas todavía.");
    expect(screen.getByText("No se pudieron leer las sesiones")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentarSesiones).toHaveBeenCalled();
  });
});

describe("borrar un estudio archivado (derechos)", () => {
  it("quien lo creó lo borra tras confirmar y la fila se va", async () => {
    deleteImagingStudy.mockResolvedValue(undefined);
    abrir();
    await menuDe();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Borrar el estudio archivado?" });
    expect(dialogo.textContent).toContain("Se borra el DICOM archivado de este estudio.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar estudio" }));
    await waitFor(() => expect(deleteImagingStudy).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText("Angio 3D")).toBeNull());
    expect(onEstudioBorrado).toHaveBeenCalledWith(7);
  });

  it("si el servidor lo impide (capturas), el motivo se lee y la fila se queda", async () => {
    deleteImagingStudy.mockRejectedValue(new Error("Este estudio tiene capturas guardadas. Bórralas desde la ficha del paciente antes de borrar el estudio."));
    abrir();
    await menuDe();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Borrar estudio" }));
    expect(await screen.findByText(/Este estudio tiene capturas guardadas/)).toBeTruthy();
    expect(screen.getByText("Angio 3D")).toBeTruthy();
    expect(onEstudioBorrado).not.toHaveBeenCalled();
  });

  it("una cuenta compartida no ve «Borrar estudio»", async () => {
    abrir({ puedeBorrar: false });
    await screen.findByText("Angio 3D");
    await menuDe();
    expect(screen.queryByRole("menuitem", { name: /Borrar/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Abrir estudio" })).toBeTruthy();
  });
});
