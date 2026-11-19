/* P6: rehacer el cuello con todo el detalle desde el panel de ramas.

   El botón solo aparece si la segmentación guardó su máscara; al pulsarlo la
   malla del visor cambia (mesh_url nuevo) y la lista de ramas se vuelve a pedir,
   porque el barrido de la zona se rehízo. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const perforators = vi.fn();
const meshNeckDetail = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    perforators: (...a: unknown[]) => perforators(...a),
    meshNeckDetail: (...a: unknown[]) => meshNeckDetail(...a),
  },
}));

import { PerforatorsPanel } from "./PerforatorsPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { NeckDetailResult, PerforatorsResult, SegmentResult } from "../../api/types";

const base: PerforatorsResult = {
  candidates: [], high_count: 0, medium_count: 0, low_count: 0,
  search_radius_mm: 8, zone_radii_mm: [3, 5, 8], calibre_floor_mm: 1.0, scanned_mesh_points: 48000,
  neck_detail_available: true, neck_detail_radius_mm: null,
};

const hecho: NeckDetailResult = {
  mesh_url: "/data/sessions/s1/meshes/vessel_tree.vtp?v=2", vertices: 107863, faces: 215962,
  added_vertices: 3885, center: { x: 61, y: 64, z: 65 }, radius_mm: 10, neck_source: "morfometria",
  branches_in_zone: 14, branches_in_zone_before: 9, undo_depth: 1,
};

function conSesion(visto: { url?: string }) {
  function Sonda({ children }: { children: ReactNode }) {
    const { sessionId, setSession, segmentation, setSegmentation } = usePlanning();
    useEffect(() => {
      if (!sessionId) setSession("s1");
      else if (!segmentation) {
        setSegmentation({ mesh_url: "/data/sessions/s1/meshes/vessel_tree.vtp?v=1", vertices: 103978, faces: 208188 } as SegmentResult);
      }
    }, [sessionId, setSession, segmentation, setSegmentation]);
    visto.url = segmentation?.mesh_url;
    return <>{children}</>;
  }
  return render(
    <PlanningProvider>
      <Sonda><PerforatorsPanel /></Sonda>
    </PlanningProvider>,
  );
}

beforeEach(() => {
  perforators.mockReset();
  meshNeckDetail.mockReset();
  perforators.mockResolvedValue(base);
});

describe("cuello con todo el detalle", () => {
  it("no ofrece el botón si la malla no guardó su máscara", async () => {
    perforators.mockResolvedValue({ ...base, neck_detail_available: false });
    conSesion({});
    await screen.findByText(/Ninguna rama visible/);
    expect(screen.queryByRole("button", { name: /cuello con todo el detalle/ })).not.toBeInTheDocument();
  });

  it("rehace el cuello, cambia la malla del visor y vuelve a pedir las ramas", async () => {
    meshNeckDetail.mockResolvedValue(hecho);
    const visto: { url?: string } = {};
    conSesion(visto);
    fireEvent.click(await screen.findByRole("button", { name: "Ver el cuello con todo el detalle" }));
    await waitFor(() => expect(meshNeckDetail).toHaveBeenCalledWith("s1", 10));
    expect(await screen.findByRole("status")).toHaveTextContent("9 → 14");
    expect(screen.getByRole("status")).toHaveTextContent("+3885 vértices");
    await waitFor(() => expect(visto.url).toBe(hecho.mesh_url));
    await waitFor(() => expect(perforators).toHaveBeenCalledTimes(2));
  });

  it("dice que ya está hecho y ofrece rehacerlo", async () => {
    perforators.mockResolvedValue({ ...base, neck_detail_radius_mm: 10 });
    conSesion({});
    expect(await screen.findByText(/ya tiene todo el detalle a 10 mm del cuello/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rehacer el cuello otra vez" })).toBeInTheDocument();
  });

  it("enseña el motivo si el servidor no puede", async () => {
    meshNeckDetail.mockRejectedValue(Object.assign(new Error("Aún no hay cuello: elige el aneurisma y mide la morfometría primero."), { status: 409, fromServer: true }));
    conSesion({});
    fireEvent.click(await screen.findByRole("button", { name: "Ver el cuello con todo el detalle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo rehacer el cuello: .*morfometría/);
  });
});
