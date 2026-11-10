/* «Estudios» con el API fallando (F1-75).

   El error salía encima del texto de vacío «Aún no hay estudios archivados»:
   con el servidor caído parecía que el archivo se había borrado. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
  AppShell: (p: { subtitle?: import("react").ReactNode; status?: import("react").ReactNode; actions?: import("react").ReactNode; children?: import("react").ReactNode }) =>
    <><header role="banner">{p.subtitle}{p.status}{p.actions}</header>{p.children}</>,
}));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { simularPantalla } from "../test/pantalla";
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

afterEach(() => { vi.unstubAllGlobals(); });
const abrirMenu = async () =>
  fireEvent.click(await screen.findByRole("button", { name: /Más acciones del estudio/ }));
beforeEach(() => {
  listStudies.mockReset(); deleteImagingStudy.mockReset();
  user = { id: 7, role: "medico" };
});

describe("«Estudios» con el API fallando", () => {
  it("muestra el error sin el texto de vacío y «Reintentar» vuelve a llamar", async () => {
    listStudies.mockRejectedValueOnce(new FakeApiError(500, "Error 500", false));
    render(<Studies {...props} />);

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
    render(<Studies {...props} />);
    expect(await screen.findByText(/Aún no hay estudios archivados/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("sin estudios, el vacío ofrece «Subir un estudio nuevo»; una búsqueda sin resultados, no", async () => {
    const onNew = vi.fn();
    listStudies.mockResolvedValue([]);
    render(<Studies {...props} onNew={onNew} />);
    fireEvent.click(await screen.findByRole("button", { name: "Subir un estudio nuevo" }));
    expect(onNew).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Buscar por paciente, HC o diagnóstico"), { target: { value: "zzz" } });
    expect(await screen.findByText("Sin coincidencias")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Subir un estudio nuevo" })).toBeNull();
  });
});


const props = { onOpen: noop, onResume: noop, onOpenPatient: noop, onNew: noop };
const study = (over: Record<string, unknown> = {}) => tarjeta(over);
const tarjeta = (over: Record<string, unknown> = {}) => ({
  id: 5, case_id: 2, patient_id: 9, owner_id: 7, patient_name: "Restrepo, María",
  hospital_id: "HC-1", description: "Angio-TC", modality: "CT", n_slices: 200,
  has_thumbnail: false, archived: true, last_step: 3, rupture_risk_label: null,
  resumable_session_id: "abc", acquired_at: null, n_files: 120, session_count: 1, ...over,
});

describe("«Estudios»: tarjeta y borrado (F2-33, F2-34, F2-35)", () => {
  it("el buscador dice HC, no cédula", async () => {
    listStudies.mockResolvedValue([]);
    render(<Studies {...props} />);
    expect(await screen.findByPlaceholderText("Buscar por paciente, HC o diagnóstico…")).toBeTruthy();
  });

  it("«Nueva sesión» sustituye a «De cero» y explica que la anterior se conserva", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    render(<Studies {...props} />);
    await abrirMenu();
    const b = screen.getByRole("menuitem", { name: "Nueva sesión" });
    expect(b.getAttribute("title")).toBe("La sesión anterior se conserva en la ficha");
    expect(screen.queryByRole("menuitem", { name: "De cero" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeTruthy();
    expect(screen.getByText(`Último paso: ${STEP_LABELS[3]}`)).toBeTruthy();
  });

  it("«Abrir ficha» lleva al paciente de la tarjeta", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    const onOpenPatient = vi.fn();
    render(<Studies {...props} onOpenPatient={onOpenPatient} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir ficha" }));
    expect(onOpenPatient).toHaveBeenCalledWith(9);
  });

  it("«Borrar estudio» solo lo ve quien creó al paciente o un administrador", async () => {
    listStudies.mockResolvedValue([tarjeta({ owner_id: 99 })]);
    const { unmount } = render(<Studies {...props} />);
    await screen.findByText("Restrepo, María");
    await abrirMenu();
    expect(screen.queryByRole("menuitem", { name: "Borrar estudio" })).toBeNull();
    unmount();

    user = { id: 1, role: "admin" };
    render(<Studies {...props} />);
    await abrirMenu();
    expect(screen.getByRole("menuitem", { name: "Borrar estudio" })).toBeTruthy();
  });

  it("confirmar borra por el API y la tarjeta desaparece; cancelar no llama", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    deleteImagingStudy.mockResolvedValue(undefined);
    render(<Studies {...props} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    // Un borrado irreversible elegido entre tarjetas parecidas: el diálogo dice cuál.
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.textContent).toContain("Restrepo, María · Angio-TC · sin fecha · 120 archivos");
    expect(dialogo.textContent).toContain("Las sesiones guardadas de este estudio conservan su copia y siguen abriéndose.");
    expect(dialogo.textContent).toContain("No se puede deshacer.");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(deleteImagingStudy).not.toHaveBeenCalled();

    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    const dlg = screen.getByRole("alertdialog");
    fireEvent.click(Array.from(dlg.querySelectorAll("button")).find((x) => x.textContent === "Borrar estudio")!);
    await waitFor(() => expect(deleteImagingStudy).toHaveBeenCalledWith(5));
    await waitFor(() => expect(screen.queryByText("Restrepo, María")).toBeNull());
  });

  it("sin sesión guardada que conserve copia, avisa de que el DICOM se pierde del todo", async () => {
    listStudies.mockResolvedValue([tarjeta({ resumable_session_id: null, session_count: 0, acquired_at: "2026-09-30" })]);
    render(<Studies {...props} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.textContent).toContain("Restrepo, María");
    expect(dialogo.textContent).toContain("Ninguna sesión guardada conserva copia: las imágenes se pierden del todo.");
  });

  it("si el servidor rechaza el borrado, dice por qué y la tarjeta se queda", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    deleteImagingStudy.mockRejectedValue(new FakeApiError(409, "Este estudio tiene capturas guardadas. Bórralas desde la ficha del paciente antes de borrar el estudio."));
    render(<Studies {...props} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    const dlg = screen.getByRole("alertdialog");
    fireEvent.click(Array.from(dlg.querySelectorAll("button")).find((x) => x.textContent === "Borrar estudio")!);
    expect(await screen.findByText(/tiene capturas guardadas/)).toBeTruthy();
    expect(screen.getByText("Restrepo, María")).toBeTruthy();
  });

  it("la tarjeta lleva el chip «TC · 621 cortes» sobre la miniatura y la clase de elevación", async () => {
    listStudies.mockResolvedValue([study({ modality: "TC", n_slices: 621 })]);
    render(<Studies {...props} />);
    expect(await screen.findByText("TC · 621 cortes")).toBeInTheDocument();
    expect(document.querySelector(".tarjeta-estudio")).not.toBeNull();
  });

  it("«Subir un estudio nuevo» cierra la rejilla y llama a onNew", async () => {
    const onNew = vi.fn();
    listStudies.mockResolvedValue([study({})]);
    render(<Studies {...props} onNew={onNew} />);
    fireEvent.click(await screen.findByRole("button", { name: "Subir un estudio nuevo" }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("el subtítulo de la barra cuenta los estudios cargados", async () => {
    listStudies.mockResolvedValue([study({}), study({ id: 6 })]);
    render(<Studies {...props} />);
    expect(await screen.findByText("2 estudios de imagen archivados · pulsa uno para reanudarlo o abrirlo")).toBeInTheDocument();
  });

  it("el subtítulo, con un solo estudio, va en singular", async () => {
    listStudies.mockResolvedValue([study({})]);
    render(<Studies {...props} />);
    expect(await screen.findByText("1 estudio de imagen archivado · pulsa uno para reanudarlo o abrirlo")).toBeInTheDocument();
  });

  it("los textos de F1-73 y F1-74", async () => {
    listStudies.mockResolvedValue([]);
    render(<Studies {...props} />);
    expect(await within(screen.getByRole("banner")).findByText("0 estudios de imagen archivados")).toBeTruthy();
    expect(await screen.findByText(/Abre un caso con «Planificar este caso», carga el DICOM y pulsa «Guardar estudio» en el Paso 1/)).toBeTruthy();
    expect(screen.queryByText(/pipeline/)).toBeNull();
  });
});

describe("«Estudios»: cristal (fase 2)", () => {
  it("cada tarjeta de estudio es una superficie de cristal", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    const { container } = render(<Studies {...props} />);
    await screen.findByText("Restrepo, María");
    const t = container.querySelector(".tarjeta-estudio");
    expect(t).not.toBeNull();
    expect(t!.hasAttribute("data-glass")).toBe(true);
  });
});

describe("«Estudios»: gestión (fase 9, A34–A36)", () => {
  it("insignias legibles: modalidad y riesgo sobre fondo sólido", async () => {
    listStudies.mockResolvedValue([tarjeta({ modality: "CT", n_slices: 621, rupture_risk_label: "Alto", has_thumbnail: true })]);
    render(<Studies {...props} />);
    const mod = await screen.findByText("CT · 621 cortes");
    expect(mod.closest("[data-insignia='modalidad']")).toHaveStyle({ background: "var(--glass-solid)", color: "var(--foreground)" });
    expect(screen.getByText("Alto").closest("[data-insignia='riesgo']")).toHaveStyle({ background: "var(--glass-solid)" });
  });

  it("Reanudar como principal; lo demás en «⋯», con Borrar en rojo y separado", async () => {
    listStudies.mockResolvedValue([tarjeta({ resumable_session_id: "s1" })]);
    render(<Studies {...props} />);
    await abrirMenu();
    expect(screen.getAllByRole("menuitem").map((m) => m.querySelector("[data-rotulo]")!.textContent)).toEqual(["Nueva sesión", "Abrir ficha", "Borrar estudio"]);
    expect(screen.getByRole("menuitem", { name: "Borrar estudio" })).toHaveAttribute("data-danger", "true");
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toHaveAttribute("data-variant", "default");
  });

  it("sin sesión que reanudar, la principal es «Abrir» y el menú no ofrece «Nueva sesión»", async () => {
    listStudies.mockResolvedValue([tarjeta({ resumable_session_id: null })]);
    render(<Studies {...props} />);
    expect(await screen.findByRole("button", { name: "Abrir" })).toHaveAttribute("data-variant", "default");
    await abrirMenu();
    expect(screen.queryByRole("menuitem", { name: "Nueva sesión" })).toBeNull();
  });

  it("la tarjeta «Subir un estudio nuevo» se estira como las demás", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    render(<Studies {...props} />);
    expect(await screen.findByRole("button", { name: "Subir un estudio nuevo" })).toHaveStyle({ alignSelf: "stretch", height: "100%" });
  });

  it("buscador con icono y sin rótulo; el borrado nombra la fecha en dd/mm/aa", async () => {
    listStudies.mockResolvedValue([tarjeta({ acquired_at: "2026-10-30" })]);
    render(<Studies {...props} />);
    expect(await screen.findByRole("textbox", { name: "Buscar por paciente, HC o diagnóstico" })).toBeInTheDocument();
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar estudio" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("30/10/26");
  });

  it("a ≤ 640 una columna y menú táctil; a 1280 el menú es compacto", async () => {
    listStudies.mockResolvedValue([tarjeta()]);
    simularPantalla(390);
    const { container, unmount } = render(<Studies {...props} />);
    expect(await screen.findByRole("button", { name: /Más acciones del estudio/ })).toHaveStyle({ width: "44px" });
    const rejilla = container.querySelector(".tarjeta-estudio")!.parentElement!;
    expect(rejilla.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(min(220px, 100%), 1fr))");
    unmount();
    simularPantalla(1280);
    render(<Studies {...props} />);
    expect(await screen.findByRole("button", { name: /Más acciones del estudio/ })).toHaveStyle({ width: "32px" });
  });
});

describe("Reanudar enseña «Abriendo…» (M5)", () => {
  it("mientras dura la promesa el botón dice «Abriendo…» y no admite otro clic; vuelve al acabar", async () => {
    let terminar: () => void = () => {};
    const onResume = vi.fn(() => new Promise<void>((r) => { terminar = r; }));
    listStudies.mockResolvedValue([tarjeta({ id: 5 }), tarjeta({ id: 6, patient_name: "Gil, Luis" })]);
    render(<Studies {...props} onResume={onResume} />);
    const [primero] = await screen.findAllByRole("button", { name: "Reanudar" });
    fireEvent.click(primero);
    const abriendo = await screen.findByRole("button", { name: "Abriendo…" });
    expect(abriendo).toBeDisabled();
    // Solo la tarjeta pulsada dice «Abriendo…»; la otra no lanza un segundo Reanudar.
    expect(screen.getAllByRole("button", { name: "Abriendo…" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
    expect(onResume).toHaveBeenCalledTimes(1);
    terminar();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Reanudar" })).toHaveLength(2));
  });

  it("si reanudar falla, el botón vuelve a «Reanudar»", async () => {
    const onResume = vi.fn(() => Promise.reject(new Error("no")));
    listStudies.mockResolvedValue([tarjeta()]);
    render(<Studies {...props} onResume={onResume} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reanudar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar" })).not.toBeDisabled());
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
