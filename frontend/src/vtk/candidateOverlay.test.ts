/* Todos los candidatos a la vez en el 3D: la zona detectada de cada uno
   coloreada, la del elegido en azul, las demás en gris, las descartadas más
   tenues, con su número; y el clic sobre la malla que elige el más cercano. */
import { describe, expect, it } from "vitest";
import type { AneurysmCandidate } from "../api/types";
import {
  CANDIDATE_HEX, CANDIDATE_OTHER_OPACITY, CANDIDATE_REJECTED_HEX, CANDIDATE_REJECTED_OPACITY, CANDIDATE_SELECTED_HEX,
  candidateOverlay, nearestCandidate,
} from "./candidateOverlay";
import { hexToRgb01 } from "./planeColors";

function cand(id: string, x: number, diam = 6, extra: Partial<AneurysmCandidate> = {}): AneurysmCandidate {
  return {
    id, center_mm: { x, y: 0, z: 0 }, max_diameter_mm: diam, confidence: 0.8, dome_mesh_url: `/m/${id}.vtp`, selected: false,
    channels: ["curvatura"], patch_kind: "region", rank: 0, veto: null, ...extra,
  };
}

const aceptados = [cand("a", 0, 6, { rank: 1 }), cand("b", 20, 4, { rank: 2 })];
const descartados = [cand("d1", 40, 3, { rank: 7, veto: { reason: "borde", label: "Borde", detail: "" } })];
const base = { candidates: aceptados, rejected: descartados, showRejected: true, step: "detect", resalte: 1 };

describe("candidateOverlay", () => {
  it("fuera de Detección no dibuja nada", () => {
    const o = candidateOverlay({ ...base, selected: 0, step: "morpho" });
    expect(o.layers).toEqual([]);
    expect(o.labels).toEqual([]);
  });

  it("pinta la zona de todos los aceptados, la del elegido en azul y las demás en gris", () => {
    const o = candidateOverlay({ ...base, rejected: [], selected: 1 });
    expect(o.layers).toHaveLength(2);
    expect(o.layers[0]).toMatchObject({ url: "/m/a.vtp", color: hexToRgb01(CANDIDATE_HEX), opacity: CANDIDATE_OTHER_OPACITY, id: "cand:a" });
    expect(o.layers[1]).toMatchObject({ url: "/m/b.vtp", color: hexToRgb01(CANDIDATE_SELECTED_HEX), opacity: 1 });
    expect(o.labels.map((l) => l.text)).toEqual(["1", "2"]);
    expect(o.labels[1].color).toBe(CANDIDATE_SELECTED_HEX);
    expect(o.labels[0].color).toBe(CANDIDATE_HEX);
    expect(o.labels[0].pos).toEqual([0, 0, 0]);
  });

  it("el resalte del visor escala todas las opacidades", () => {
    const o = candidateOverlay({ ...base, rejected: [], selected: 0, resalte: 0.5 });
    expect(o.layers[0].opacity).toBe(0.5);
    expect(o.layers[1].opacity).toBeCloseTo(0.5 * CANDIDATE_OTHER_OPACITY);
  });

  it("los descartados van detrás, más tenues y con «D» delante", () => {
    const o = candidateOverlay({ ...base, selected: 0 });
    expect(o.layers).toHaveLength(3);
    expect(o.layers[2]).toMatchObject({ url: "/m/d1.vtp", color: hexToRgb01(CANDIDATE_REJECTED_HEX), opacity: CANDIDATE_REJECTED_OPACITY });
    expect(o.labels[2]).toMatchObject({ text: "D7", color: CANDIDATE_REJECTED_HEX });
  });

  it("un descartado elegido se pinta en azul y opaco", () => {
    const o = candidateOverlay({ ...base, selected: 2 });
    expect(o.layers[2]).toMatchObject({ color: hexToRgb01(CANDIDATE_SELECTED_HEX), opacity: 1 });
    expect(o.labels[2].color).toBe(CANDIDATE_SELECTED_HEX);
  });

  it("con el interruptor apagado los descartados no se dibujan, salvo el elegido", () => {
    const off = candidateOverlay({ ...base, selected: 0, showRejected: false });
    expect(off.layers).toHaveLength(2);
    const elegido = candidateOverlay({ ...base, selected: 2, showRejected: false });
    expect(elegido.layers).toHaveLength(3);
    expect(elegido.labels[2].text).toBe("D7");
  });

  it("un punto marcado a mano (sin malla ni puesto) solo lleva su «M»", () => {
    const manual = cand("m", 5, 0, { patch_kind: "manual", channels: [], rank: 0, dome_mesh_url: "" });
    const o = candidateOverlay({ ...base, candidates: [manual], rejected: [], selected: 0 });
    expect(o.layers).toEqual([]);
    expect(o.labels[0].text).toBe("M");
  });
});

describe("nearestCandidate", () => {
  const todos = [...aceptados, ...descartados];

  it("elige el candidato cuyo saco contiene el punto pulsado", () => {
    // Radio del saco de «b» = 2 mm; el punto está a 1,5 mm de su centro.
    expect(nearestCandidate([21.5, 0, 0], todos, true)).toBe(1);
  });

  it("acepta un margen alrededor del saco", () => {
    // «d1» mide 3 mm (radio 1,5); un clic a 2,4 mm del centro aún lo elige.
    expect(nearestCandidate([42.4, 0, 0], todos, true)).toBe(2);
  });

  it("lejos de todos no elige nada", () => {
    expect(nearestCandidate([10, 0, 0], todos, true)).toBeNull();
  });

  it("con los descartados ocultos no se pueden elegir desde el 3D", () => {
    expect(nearestCandidate([40, 0, 0], todos, false, aceptados.length)).toBeNull();
    expect(nearestCandidate([0, 0, 0], todos, false, aceptados.length)).toBe(0);
  });
});
