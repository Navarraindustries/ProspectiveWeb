/* F1-9: volver a cargar en una sesión con trabajo.

   Soltar otra carpeta sobre el paso 1 vaciaba la segmentación, los candidatos,
   la medida y las anotaciones antes de que el estudio nuevo terminara de
   subir, sin preguntar. Con trabajo hecho, ahora se pregunta. */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const setActiveSeries = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    upload: (...a: unknown[]) => upload(...a),
    setActiveSeries: (...a: unknown[]) => setActiveSeries(...a),
    patientStudies: vi.fn().mockResolvedValue([]),
  },
}));

import { UploadPanel } from "./UploadPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { SegmentResult, SeriesInfo } from "../../api/types";

const malla = { mesh_url: "/m/vessel_tree.vtp", vertices: 10, faces: 20 } as unknown as SegmentResult;

let visto: ReturnType<typeof usePlanning> | null = null;
function montar(conMalla: boolean) {
  function Semilla({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => { p.setSession("s1"); if (conMalla) p.setSegmentation(malla); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { visto = p; });
    return p.sessionId ? <>{children}</> : null;
  }
  return render(<PlanningProvider><Semilla><UploadPanel onNext={() => {}} /></Semilla></PlanningProvider>);
}

const soltar = async () => {
  const zona = (await screen.findByText("Arrastra la carpeta DICOM aquí")).parentElement as HTMLElement;
  const file = new File(["x"], "IM0001.dcm");
  fireEvent.drop(zona, { dataTransfer: { items: [], files: [file] } });
};

beforeEach(() => {
  visto = null;
  upload.mockReset().mockResolvedValue({ session_id: "s2", series: [] });
});

describe("volver a cargar con trabajo hecho", () => {
  it("con malla, soltar un archivo pide confirmación y no toca nada", async () => {
    montar(true);
    await soltar();
    const dialogo = await screen.findByRole("alertdialog", { name: "¿Cargar otro estudio?" });
    expect(dialogo).toHaveTextContent("Esto descarta la segmentación, la detección y la medida. ¿Cargar otro estudio?");
    expect(upload).not.toHaveBeenCalled();
    expect(visto?.segmentation).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cargar otro estudio" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it("«Cancelar» conserva la malla y no sube nada", async () => {
    montar(true);
    await soltar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(upload).not.toHaveBeenCalled();
    expect(visto?.segmentation).not.toBeNull();
  });

  it("sin trabajo hecho sube directamente", async () => {
    montar(false);
    await soltar();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

/* F1-130: «Continuar a segmentación» se encendía en cuanto había serie, antes
   de que el volumen estuviera en el visor, y apagado no decía por qué. */
describe("«Continuar a segmentación»", () => {
  const boton = () => screen.getByRole("button", { name: /Continuar a segmentación/ });
  const serie: SeriesInfo = {
    session_id: "s1", series_id: "1.2", description: "CTA", modality: "CT", slices: 200,
    spacing: { x: 0.5, y: 0.5, z: 0.6 }, window_center: 300, window_width: 900,
    is_projection: false, projection_warning: null, size_mb: 80,
    acquisition_date: "2026-07-14", acquisition_time: "09:35", session_ttl_hours: 24,
  };

  it("sin serie está apagado y lo dice", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    expect(boton()).toBeDisabled();
    expect(screen.getByText("Carga una serie para continuar")).toBeInTheDocument();
  });

  it("con serie pero sin el volumen en el visor, sigue apagado y dice que carga", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    await act(async () => { visto!.setSeries(serie); });
    expect(boton()).toBeDisabled();
    expect(screen.getByText("Cargando el volumen…")).toBeInTheDocument();
  });

  it("con el volumen en el visor se enciende y no dice nada", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    await act(async () => { visto!.setSeries(serie); visto!.setVolumeReady(true); });
    expect(boton()).not.toBeDisabled();
    expect(screen.queryByText("Cargando el volumen…")).toBeNull();
    expect(screen.queryByText("Carga una serie para continuar")).toBeNull();
  });
});

const serieBase: SeriesInfo = {
  session_id: "s1", series_id: "1.2.276.0.7230010.3.1.3.99", description: "CTA", modality: "CT", slices: 200,
  spacing: { x: 0.5, y: 0.5, z: 0.6 }, window_center: 300, window_width: 900,
  is_projection: false, projection_warning: null, size_mb: 80,
  acquisition_date: "2026-07-14", acquisition_time: "09:35", session_ttl_hours: 24,
};

/* Cambiar de serie borra lo mismo que cargar otro estudio y no preguntaba. */
describe("cambiar de serie con trabajo hecho", () => {
  const otra: SeriesInfo = { ...serieBase, series_id: "9.9", description: "3DRA" };
  const elegirOtra = async (conMalla: boolean) => {
    setActiveSeries.mockReset().mockResolvedValue(otra);
    montar(conMalla);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    await act(async () => { visto!.setSeries(serieBase); visto!.setSeriesList([serieBase, otra]); });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9.9" } });
  };

  it("con malla pide confirmación, dice qué se pierde y no cambia hasta confirmar", async () => {
    await elegirOtra(true);
    const dialogo = screen.getByRole("alertdialog", { name: "¿Cambiar de serie?" });
    expect(dialogo).toHaveTextContent("se pierden la segmentación, la detección, las medidas, los dispositivos y las anotaciones");
    expect(setActiveSeries).not.toHaveBeenCalled();
    expect(visto?.segmentation).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar de serie" }));
    await waitFor(() => expect(setActiveSeries).toHaveBeenCalledWith("s1", "9.9"));
    await waitFor(() => expect(visto?.segmentation).toBeNull());
  });

  it("«Cancelar» deja la serie y la malla como estaban", async () => {
    await elegirOtra(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(setActiveSeries).not.toHaveBeenCalled();
    expect(visto?.series?.series_id).toBe(serieBase.series_id);
    expect(visto?.segmentation).not.toBeNull();
  });

  it("sin trabajo hecho cambia directamente", async () => {
    await elegirOtra(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(setActiveSeries).toHaveBeenCalledWith("s1", "9.9"));
  });
});

/* F1-125: el selector no vuelve a disparar `change` con los mismos archivos;
   sin vaciarlo, elegir otra vez la misma carpeta no hacía nada. */
describe("elegir los mismos archivos dos veces", () => {
  it.each([0, 1])("el selector %i sube dos veces", async (i) => {
    const { container } = montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[i];
    const file = new File(["x"], "IM0001.dcm");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });
});

/* F1-126: «Cargado» salía en cuanto llegaba la serie, con el visor aún vacío. */
describe("insignia de carga", () => {
  it("sin volumen en el visor la insignia no dice «Cargado»", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    await act(async () => { visto!.setSeries(serieBase); });
    expect(screen.getByText("Subido")).toBeInTheDocument();
    expect(screen.queryByText("Cargado")).toBeNull();
    await act(async () => { visto!.setVolumeReady(true); });
    expect(screen.getByText("Cargado")).toBeInTheDocument();
    expect(screen.queryByText("Subido")).toBeNull();
  });
});

/* F1-127: sin descripción salía «Serie 1.2.276.», el principio del UID. */
describe("serie sin descripción", () => {
  it("no muestra el UID y sí la fecha y hora de adquisición", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    const sin = { ...serieBase, description: "Sin descripción" };
    const otra = { ...serieBase, series_id: "1.2.276.0.7230010.3.1.3.100", acquisition_time: "10:02" };
    await act(async () => { visto!.setSeriesList([sin, otra]); visto!.setSeries(sin); });
    expect(screen.getByText("Sin descripción · 14/07/2026 09:35")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /1\. Sin descripción · 14\/07\/2026 09:35/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("1.2.276");
  });
});

/* F1-128: «se borrará automáticamente» sin decir cuándo. */
describe("plazo de borrado", () => {
  it("el texto incluye el plazo real", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    await act(async () => { visto!.setSeries(serieBase); });
    expect(screen.getByText(/Si no lo guardas, la sesión se borra a las 24 horas de crearla\./)).toBeInTheDocument();
    await act(async () => { visto!.setSeries({ ...serieBase, session_ttl_hours: 1.5 }); });
    expect(screen.getByText(/la sesión se borra a las 1,5 horas de crearla\./)).toBeInTheDocument();
  });
});

/* F1-129: mandaba a «Pacientes → Nuevo caso», fuera del flujo de carga. */
describe("paciente sin casos", () => {
  it("dice cómo crear el caso desde aquí", async () => {
    montar(false);
    await screen.findByText("Arrastra la carpeta DICOM aquí");
    await act(async () => {
      visto!.setPatient({ id: 7, full_name: "P", hospital_id: "H", dob: "", sex: "", institution: "", study_count: 0, created_at: "" } as never);
      visto!.setSeries(serieBase);
    });
    expect(await screen.findByText(
      "Este paciente no tiene casos. Usa «Adjuntar a un caso» arriba para crear uno y archivar este DICOM",
    )).toBeInTheDocument();
  });
});

/* Auditoría F3: con estudios grandes la subida duraba minutos sin decir cuánto faltaba. */
describe("textoSubida", () => {
  it("sin aviso del navegador, el texto de siempre", async () => {
    const { textoSubida } = await import("./UploadPanel");
    expect(textoSubida(1, null)).toBe("Subiendo 1 archivo y detectando series…");
  });
  it("durante la subida, MB enviados de los totales y el porcentaje", async () => {
    const { textoSubida } = await import("./UploadPanel");
    const MB = 1024 * 1024;
    expect(textoSubida(113, { enviados: 45 * MB, total: 113 * MB })).toBe("Subiendo 113 archivos: 45 / 113 MB (39 %)");
    expect(textoSubida(2, { enviados: 1.5 * MB, total: 3 * MB })).toBe("Subiendo 2 archivos: 1,5 / 3 MB (50 %)");
  });
  it("con todo enviado, dice que el servidor está detectando las series", async () => {
    const { textoSubida } = await import("./UploadPanel");
    expect(textoSubida(3, { enviados: 10, total: 10 })).toBe("3 archivos subidos · detectando series…");
  });
});
