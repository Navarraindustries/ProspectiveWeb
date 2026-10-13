/* «Estudios» con el API fallando (F1-75).

   El error salía encima del texto de vacío «Aún no hay estudios archivados»:
   con el servidor caído parecía que el archivo se había borrado. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const listStudies = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    listStudies: (...a: unknown[]) => listStudies(...a),
    studyThumbnailObjectUrl: () => Promise.reject(new Error("sin imagen")),
  },
}));
// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { actions?: import("react").ReactNode; children?: import("react").ReactNode }) => <>{p.actions}{p.children}</>,
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { Studies } from "./Studies";

class FakeApiError extends Error {
  status: number;
  fromServer: boolean;
  constructor(status: number, detail: string, fromServer = status !== 0) {
    super(detail); this.status = status; this.fromServer = fromServer;
  }
}

const noop = () => {};

beforeEach(() => { listStudies.mockReset(); });

describe("«Estudios» con el API fallando", () => {
  it("muestra el error sin el texto de vacío y «Reintentar» vuelve a llamar", async () => {
    listStudies.mockRejectedValueOnce(new FakeApiError(500, "Error 500", false));
    render(<Studies onOpen={noop} onResume={noop} />);

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
    render(<Studies onOpen={noop} onResume={noop} />);
    expect(await screen.findByText(/Aún no hay estudios archivados/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });
});
