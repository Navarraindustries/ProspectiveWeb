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

/** Lo que el panel enseña del store: la lista y cuál está elegido. */
function Lista() {
  const p = usePlanning();
  return (
    <div data-testid="lista">
      {p.allCandidates.map((c, i) => `${c.id}:${(c.channels ?? []).join("+")}${i === p.selectedCandidate ? "*" : ""}`).join(" ")}
    </div>
  );
}

function montar(opts: {
  study?: number | null; selected?: number; mark?: [number, number, number];
  rejected?: AneurysmCandidate[];
} = {}) {
  function Seed({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => {
      if (!p.sessionId) {
        p.setSession("s1");
        if (opts.study != null) p.setImagingStudyId(opts.study);
        p.setCandidates([cand(1), cand(2), cand(3)]);
        if (opts.rejected) p.setRejectedCandidates(opts.rejected);
        p.setSelectedCandidate(opts.selected ?? 0);
        if (opts.mark) p.setLesionMark(opts.mark);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.sessionId]);
    return p.sessionId ? <>{children}</> : null;
  }
  return render(<PlanningProvider><Seed><LesionConfirm /><Lista /></Seed></PlanningProvider>);
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
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar cand-002 como la lesión" }));
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
    // F1-147: antes de registrarlo, se pregunta.
    expect(screen.getByRole("alertdialog", { name: "¿No hay aneurisma en este estudio?" })).toBeInTheDocument();
    expect(api.confirmLesion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Registrar sin aneurisma" }));
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

  /* F1-148: «no se podrá volver a pasar el detector» no decía qué se pierde. */
  it("avisa cuando el estudio no está archivado", async () => {
    montar();
    expect(await screen.findByText(
      "Sin archivar, esta confirmación no queda ligada al paciente ni sirve para evaluar versiones futuras del detector",
    )).toBeInTheDocument();
    expect(screen.queryByText(/no se podrá volver a pasar el detector/)).not.toBeInTheDocument();
  });

  /* F1-146: el panel dice cómo se mide una lesión que el detector no encontró. */
  it("dice que una lesión no detectada se mide en Morfometría marcando cuello y ápice", async () => {
    montar();
    expect(await screen.findByText(
      "Una lesión que el detector no encontró se mide en Morfometría marcando el cuello y el ápice; el punto confirmado queda como candidato «marcado a mano».",
    )).toBeInTheDocument();
  });

  it("no promete nada sin confirmaciones y cuenta cuando las hay", () => {
    expect(summaryText(vacio)).toBeNull();
    expect(summaryText({ ...vacio, confirmed: 5, first: 2, top3: 4, missed: 1 }))
      .toBe("Con 5 lesiones confirmadas, el detector la puso 1.ª en 2, entre las 3 primeras en 4 y no la encontró en 1.");
  });
});

/* F1-147: «No hay aneurisma» quedaba registrado a tu nombre al primer clic. */
describe("«No hay aneurisma»", () => {
  it("abre la confirmación y «Cancelar» no registra nada", async () => {
    montar({ study: 3 });
    fireEvent.click(await screen.findByText("No hay aneurisma"));
    expect(screen.getByRole("alertdialog", { name: "¿No hay aneurisma en este estudio?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.confirmLesion).not.toHaveBeenCalled();
  });
});

/* F1-145: «Es el #1» numeraba por la posición en la lista y no ofrecía nada
   con un descartado elegido; tras confirmar seguía ofreciendo lo mismo. */
describe("«Confirmar cand-00N como la lesión»", () => {
  const descartado = {
    ...cand(4), id: "cand-004", veto: { reason: "borde", label: "Recorte de la malla", detail: "" },
  } as unknown as AneurysmCandidate;

  it("con un descartado elegido se ofrece confirmar", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(
      confirmacion({ candidate_rank: null, candidate_id: "cand-004" }));
    montar({ study: 3, selected: 3, rejected: [descartado] });
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar cand-004 como la lesión" }));
    await waitFor(() => expect(api.confirmLesion).toHaveBeenCalledWith({
      session_id: "s1", imaging_study_id: 3, source: "candidate", candidate_id: "cand-004",
    }));
  });

  it("tras confirmar, el elegido queda como hecho y no se vuelve a ofrecer", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(confirmacion({ candidate_rank: 2, candidate_id: "cand-002" }));
    montar({ study: 3, selected: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar cand-002 como la lesión" }));
    const hecho = await screen.findByRole("button", { name: "Confirmada" });
    expect(hecho).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Confirmar cand-002/ })).not.toBeInTheDocument();
  });
});

/* F1-146: un punto que no coincide con ningún candidato pasa a la lista. */
describe("confirmar el punto marcado", () => {
  it("añade un candidato «marcado a mano» elegible y lo elige", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(confirmacion({
      source: "marked", candidate_rank: null, candidate_id: "cand-005", position: { x: 40, y: 2, z: 3 },
    }));
    const descartado = { ...cand(4), id: "cand-004" } as unknown as AneurysmCandidate;
    montar({ mark: [40, 2, 3], rejected: [descartado] });
    fireEvent.click(await screen.findByText("Confirmar el punto marcado"));
    // Va con los aceptados, delante de los descartados, y queda elegido.
    await waitFor(() => expect(screen.getByTestId("lista")).toHaveTextContent(
      "cand-001:curvatura cand-002:curvatura cand-003:curvatura cand-005:manual* cand-004:curvatura"));
    // Y es elegible para confirmarlo como candidato.
    expect(screen.getByRole("button", { name: "Confirmada" })).toBeDisabled();
  });

  it("si el punto cae sobre un candidato que ya está, no añade nada", async () => {
    vi.mocked(api.confirmLesion).mockResolvedValue(confirmacion({
      source: "marked", candidate_rank: 2, candidate_id: "cand-002", position: { x: 2, y: 0, z: 0 },
    }));
    montar({ mark: [2, 0, 0] });
    fireEvent.click(await screen.findByText("Confirmar el punto marcado"));
    await screen.findByText(/coincide con el candidato #2/);
    expect(screen.getByTestId("lista")).toHaveTextContent("cand-001:curvatura* cand-002:curvatura cand-003:curvatura");
  });
});
