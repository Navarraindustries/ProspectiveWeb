/* «¿Cuál es la lesión?»: lo que manda y lo que enseña. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AneurysmCandidate, LesionConfirmation, LesionSummary } from "../../api/types";

vi.mock("../../api/client", () => ({
  api: {
    currentLesion: vi.fn(),
    lesionSummary: vi.fn(),
    confirmLesion: vi.fn(),
    retractLesion: vi.fn(),
  },
}));

import { api } from "../../api/client";
import { LesionConfirm, summaryText } from "./LesionConfirm";
import { PlanningProvider, usePlanning } from "../../store/planning";

const cand = (i: number) => ({
  id: `cand-00${i}`, center_mm: { x: i, y: 0, z: 0 }, max_diameter_mm: 5, confidence: 0.6,
  dome_mesh_url: "", selected: i === 1, channels: ["curvatura"], patch_kind: "region",
}) as unknown as AneurysmCandidate;

const vacio: LesionSummary = { confirmed: 0, no_lesion: 0, first: 0, top3: 0, top5: 0, missed: 0, by_modality: {}, reproducible: 0 };

const confirmacion = (over: Partial<LesionConfirmation>): LesionConfirmation => ({
  id: 7, session_id: "s1", imaging_study_id: 3, source: "candidate", position: null,
  candidate_rank: 2, n_candidates: 3, channels: "curvatura", modality: "XA",
  reproducible: true, created_at: "2026-10-02T10:00:00", created_by: "admin", ...over,
});

function montar(opts: { study?: number | null; selected?: number; mark?: [number, number, number] } = {}) {
  function Seed({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => {
      if (!p.sessionId) {
        p.setSession("s1");
        if (opts.study != null) p.setImagingStudyId(opts.study);
        p.setCandidates([cand(1), cand(2), cand(3)]);
        p.setSelectedCandidate(opts.selected ?? 0);
        if (opts.mark) p.setLesionMark(opts.mark);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.sessionId]);
    return p.sessionId ? <>{children}</> : null;
  }
  return render(<PlanningProvider><Seed><LesionConfirm /></Seed></PlanningProvider>);
}

beforeEach(() => {
  vi.mocked(api.currentLesion).mockResolvedValue(null);
  vi.mocked(api.lesionSummary).mockResolvedValue(vacio);
  vi.mocked(api.confirmLesion).mockReset();
});

describe("confirmar", () => {
  it("confirma el candidato seleccionado con su id y el estudio", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(confirmacion({}));
    montar({ study: 3, selected: 1 });
    fireEvent.click(await screen.findByText("Es el #2"));
    await waitFor(() => expect(api.confirmLesion).toHaveBeenCalledWith({
      session_id: "s1", imaging_study_id: 3, source: "candidate", candidate_id: "cand-002",
    }));
    expect(await screen.findByText(/La lesión es el candidato #2/)).toBeInTheDocument();
  });

  it("manda el punto marcado a mano en mm", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(
      confirmacion({ source: "marked", candidate_rank: null, position: { x: 1, y: 2, z: 3 } }));
    montar({ mark: [1, 2, 3] });
    fireEvent.click(await screen.findByText("Confirmar el punto marcado"));
    await waitFor(() => expect(api.confirmLesion).toHaveBeenCalledWith(expect.objectContaining({
      source: "marked", position: { x: 1, y: 2, z: 3 }, imaging_study_id: null,
    })));
    expect(await screen.findByText(/no estaba entre los 3 candidatos/)).toBeInTheDocument();
  });

  it("también se puede decir que no hay aneurisma", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(confirmacion({ source: "no_lesion", candidate_rank: null }));
    montar();
    fireEvent.click(await screen.findByText("No hay aneurisma"));
    expect(await screen.findByText(/Sin aneurisma en este estudio/)).toBeInTheDocument();
  });
});

describe("lo que enseña", () => {
  it("la confirmación vigente del estudio al abrir el paso", async () => {
    vi.mocked(api.currentLesion).mockResolvedValue(confirmacion({ candidate_rank: 1, source: "candidate" }));
    montar({ study: 3 });
    expect(await screen.findByText(/La lesión es el candidato #1/)).toBeInTheDocument();
    expect(api.currentLesion).toHaveBeenCalledWith("s1", 3);
  });

  it("avisa cuando el estudio no está archivado", async () => {
    montar();
    expect(await screen.findByText(/no se podrá volver a pasar el detector/)).toBeInTheDocument();
  });

  it("no promete nada sin confirmaciones y cuenta cuando las hay", () => {
    expect(summaryText(vacio)).toBeNull();
    expect(summaryText({ ...vacio, confirmed: 5, first: 2, top3: 4, missed: 1 }))
      .toBe("Con 5 lesiones confirmadas, el detector la puso 1.ª en 2, entre las 3 primeras en 4 y no la encontró en 1.");
  });
});
