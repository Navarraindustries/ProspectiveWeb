import { describe, expect, it } from "vitest";
import type { AneurysmCandidate } from "../api/types";
import { candidateOverlay } from "./candidateOverlay";
import { APARECER_MS, duracionEntrada, ESCALON_MS, HALO_MS, pasosEntrada, progresoEntrada } from "./candidateReveal";

const cand = (id: string, rank: number, url = `/m/${id}.vtp`): AneurysmCandidate =>
  ({ id, rank, center_mm: { x: rank, y: 0, z: 0 }, dome_mesh_url: url, max_diameter_mm: 4, confidence: 0.5, selected: false } as unknown as AneurysmCandidate);

describe("pasosEntrada", () => {
  const aceptados = [cand("a", 1), cand("b", 2), cand("c", 3, "")];
  const descartados = [cand("d", 1)];

  it("sigue el orden de los rótulos de candidateOverlay: puesto 1 primero", () => {
    const args = { candidates: aceptados, rejected: descartados, selected: 0, showRejected: true, step: "detect" };
    const pasos = pasosEntrada(args);
    const { labels } = candidateOverlay({ ...args, resalte: 1 });
    expect(pasos.map((p) => p.rotulo)).toEqual(labels.map((_, i) => i));
    expect(pasos.map((p) => p.capa)).toEqual(["cand:a", "cand:b", undefined, "cand:d"]);
  });

  it("con los descartados ocultos solo entran los aceptados", () => {
    const pasos = pasosEntrada({ candidates: aceptados, rejected: descartados, selected: 0, showRejected: false, step: "detect" });
    expect(pasos.map((p) => p.capa)).toEqual(["cand:a", "cand:b", undefined]);
  });

  it("fuera de Detección no hay entrada", () => {
    expect(pasosEntrada({ candidates: aceptados, rejected: [], selected: 0, showRejected: false, step: "morpho" })).toEqual([]);
  });
});

describe("progresoEntrada", () => {
  it("cada candidato espera su escalón y luego aparece", () => {
    expect(progresoEntrada(0, 1).aparicion).toBe(0);
    expect(progresoEntrada(ESCALON_MS - 1, 1).aparicion).toBe(0);
    expect(progresoEntrada(ESCALON_MS + APARECER_MS, 1).aparicion).toBe(1);
  });

  it("la aparición sale rápida (curva de salida), no lineal", () => {
    expect(progresoEntrada(APARECER_MS / 2, 0).aparicion).toBeGreaterThan(0.6);
  });

  it("el halo se abre y se apaga una vez; antes y después no está", () => {
    expect(progresoEntrada(ESCALON_MS - 1, 1).halo).toBeNull();
    const medio = progresoEntrada(ESCALON_MS + HALO_MS / 2, 1).halo!;
    expect(medio).toBeGreaterThan(0);
    expect(medio).toBeLessThan(1);
    expect(progresoEntrada(ESCALON_MS + HALO_MS, 1).halo).toBeNull();
  });

  it("la entrada dura hasta que se apaga el último halo", () => {
    expect(duracionEntrada(0)).toBe(0);
    expect(duracionEntrada(5)).toBe(4 * ESCALON_MS + HALO_MS);
  });
});
