/* «Estudios» con el API fallando (F1-75).

   El error salía encima del texto de vacío «Aún no hay estudios archivados»:
   con el servidor caído parecía que el archivo se había borrado. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listStudies = vi.fn();
const deleteImagingStudy = vi.fn();
let user: { id: number; role: string } | null = { id: 7, role: "medico" };

vi.mock("../api/client", () => ({
  api: {
    listStudies: (...a: unknown[]) => listStudies(...a),
    deleteImagingStudy: (...a: unknown[]) => deleteImagingStudy(...a),
    studyThumbnailObjectUrl: () => Promise.reject(new Error("sin imagen")),
  },
}));
// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { actions?: import("react").ReactNode; children?: import("react").ReactNode }) => <>{p.actions}{p.children}</>,
}));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { STEP_LABELS } from "../pipeline/steps";
import { Studies } from "./Studies";

class FakeApiError extends Error {
  status: number;
  fromServer: boolean;
  constructor(status: number, detail: string, fromServer = status !== 0) {
    super(detail); this.status = status; this.fromServer = fromServer;
  }
}

const noop = () => {};

beforeEach(() => {
  listStudies.mockReset(); deleteImagingStudy.mockReset();
  user = { id: 7, role: "medico" };
});

describe("«Estudios» con el API fallando", () => {
  it("muestra el error sin el texto de vacío y «Reintentar» vuelve a llamar", async () => {
    listStudies.mockRejectedValueOnce(new FakeApiError(500, "Error 500", false));
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);

    expect(await screen.findByText("El servidor no responde")).toBeTruthy();
    expect(screen.queryByText(/Aún no hay estudios archivados/)).toBeNull();

    listStudies.mockResolvedValueOnce([{
      id: 1, patient_name: "Restrepo, María", hospital_id: "HC-1", description: "Angio-TC",
      modality: "CT", n_slices: 200, has_thumbnail: false, archived: true, last_step: null,
      rupture_risk_label: null, resumable_session_id: null, acquired_at: null,
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Restrepo, María")).toBeTruthy();
    expect(listStudies).toHaveBeenCalledTimes(2);
  });

  it("sin estudios y sin error sigue diciendo que no hay", async () => {
    listStudies.mockResolvedValueOnce([]);
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    expect(await screen.findByText(/Aún no hay estudios archivados/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });
});


const tarjeta = (over: Record<string, unknown> = {}) => ({
  id: 5, case_id: 2, patient_id: 9, owner_id: 7, patient_name: "Restrepo, María",
  hospital_id: "HC-1", description: "Angio-TC", modality: "CT", n_slices: 200,
  has_thumbnail: false, archived: true, last_step: 3, rupture_risk_label: null,
  resumable_session_id: "abc", acquired_at: null, n_files: 120, session_count: 1, ...over,
});

describe("«Estudios»: tarjeta y borrado (F2-33, F2-34, F2-35)", () => {
  it("el buscador dice HC, no cédula", async () => {
    listStudies.mockResolvedValue([]);
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    expect(await screen.findByPlaceholderText("Buscar por paciente, HC o diagnóstico…")).toBeTruthy();
  });

  it("«Nueva sesión» sustituye a «De cero» y explica que la anterior se conserva", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    const b = await screen.findByRole("button", { name: "Nueva sesión" });
    expect(b.getAttribute("title")).toBe("La sesión anterior se conserva en la ficha");
    expect(screen.queryByRole("button", { name: "De cero" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeTruthy();
    expect(screen.getByText(`Último paso: ${STEP_LABELS[3]}`)).toBeTruthy();
  });

  it("«Abrir ficha» lleva al paciente de la tarjeta", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    const onOpenPatient = vi.fn();
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={onOpenPatient} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir ficha" }));
    expect(onOpenPatient).toHaveBeenCalledWith(9);
  });

  it("«Borrar estudio» solo lo ve quien creó al paciente o un administrador", async () => {
    listStudies.mockResolvedValue([tarjeta({ owner_id: 99 })]);
    const { unmount } = render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    await screen.findByText("Restrepo, María");
    expect(screen.queryByRole("button", { name: "Borrar estudio" })).toBeNull();
    unmount();

    user = { id: 1, role: "admin" };
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    expect(await screen.findByRole("button", { name: "Borrar estudio" })).toBeTruthy();
  });

  it("confirmar borra por el API y la tarjeta desaparece; cancelar no llama", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    deleteImagingStudy.mockResolvedValue(undefined);
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Borrar estudio" }));
    // Un borrado irreversible elegido entre tarjetas parecidas: el diálogo dice cuál.
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.textContent).toContain("Restrepo, María · Angio-TC · sin fecha · 120 archivos");
    expect(dialogo.textContent).toContain("Las sesiones guardadas de este estudio conservan su copia y siguen abriéndose.");
    expect(dialogo.textContent).toContain("No se puede deshacer.");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(deleteImagingStudy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Borrar estudio" }));
    const dlg = screen.getByRole("alertdialog");
    fireEvent.click(Array.from(dlg.querySelectorAll("button")).find((x) => x.textContent === "Borrar estudio")!);
    await waitFor(() => expect(deleteImagingStudy).toHaveBeenCalledWith(5));
    await waitFor(() => expect(screen.queryByText("Restrepo, María")).toBeNull());
  });

  it("sin sesión guardada que conserve copia, avisa de que el DICOM se pierde del todo", async () => {
    listStudies.mockResolvedValue([tarjeta({ resumable_session_id: null, session_count: 0, acquired_at: "2026-09-30" })]);
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Borrar estudio" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.textContent).toContain("Restrepo, María");
    expect(dialogo.textContent).toContain("Ninguna sesión guardada conserva copia: las imágenes se pierden del todo.");
  });

  it("si el servidor rechaza el borrado, dice por qué y la tarjeta se queda", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    deleteImagingStudy.mockRejectedValue(new FakeApiError(409, "Este estudio tiene capturas guardadas. Bórralas desde la ficha del paciente antes de borrar el estudio."));
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Borrar estudio" }));
    const dlg = screen.getByRole("alertdialog");
    fireEvent.click(Array.from(dlg.querySelectorAll("button")).find((x) => x.textContent === "Borrar estudio")!);
    expect(await screen.findByText(/tiene capturas guardadas/)).toBeTruthy();
    expect(screen.getByText("Restrepo, María")).toBeTruthy();
  });

  it("los textos de F1-73 y F1-74", async () => {
    listStudies.mockResolvedValue([]);
    render(<Studies onOpen={noop} onResume={noop} onOpenPatient={noop} />);
    expect(await screen.findByText(/Estudios de imagen archivados · pulsa uno para reanudarlo o abrirlo/)).toBeTruthy();
    expect(await screen.findByText(/Abre un caso con «Planificar este caso», carga el DICOM y pulsa «Guardar estudio» en el Paso 1/)).toBeTruthy();
    expect(screen.queryByText(/pipeline/)).toBeNull();
  });
});
