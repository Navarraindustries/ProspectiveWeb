/* F1-9: volver a cargar en una sesión con trabajo.

   Soltar otra carpeta sobre el paso 1 vaciaba la segmentación, los candidatos,
   la medida y las anotaciones antes de que el estudio nuevo terminara de
   subir, sin preguntar. Con trabajo hecho, ahora se pregunta. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    upload: (...a: unknown[]) => upload(...a),
    patientStudies: vi.fn().mockResolvedValue([]),
  },
}));

import { UploadPanel } from "./UploadPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { SegmentResult } from "../../api/types";

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
