/* Todos los candidatos a la vez en el 3D: los aceptados con su número, el
   elegido en acento y más grande, los descartados tenues con «D», y el clic
   sobre la malla que elige el candidato más cercano. */
import { describe, expect, it } from "vitest";
import type { AneurysmCandidate } from "../api/types";
import {
  CANDIDATE_HEX, CANDIDATE_REJECTED_HEX, CANDIDATE_SELECTED_HEX, CANDIDATE_SELECTED_SCALE, CANDIDATE_REJECTED_SCALE,
  candidateOverlay, nearestCandidate,
} from "./candidateMarkers";

function cand(id: string, x: number, diam = 6, extra: Partial<AneurysmCandidate> = {}): AneurysmCandidate {
  return {
    id, center_mm: { x, y: 0, z: 0 }, max_diameter_mm: diam, confidence: 0.8, dome_mesh_url: "", selected: false,
    channels: ["curvatura"], patch_kind: "region", rank: 0, veto: null, ...extra,
  };
}

const aceptados = [cand("a", 0, 6, { rank: 1 }), cand("b", 20, 4, { rank: 2 })];
const descartados = [cand("d1", 40, 3, { rank: 7, veto: { reason: "borde", label: "Borde", detail: "" } })];

describe("candidateOverlay", () => {
  it("fuera de Detección no dibuja nada", () => {
    const o = candidateOverlay({ candidates: aceptados, rejected: descartados, selected: 0, showRejected: true, step: "morpho" });
    expect(o.markers).toEqual([]);
    expect(o.labels).toEqual([]);
  });

  it("marca todos los aceptados con su número y resalta el elegido", () => {
    const o = candidateOverlay({ candidates: aceptados, rejected: [], selected: 1, showRejected: true, step: "detect" });
    expect(o.markers).toHaveLength(2);
    expect(o.markers[0]).toMatchObject({ pos: [0, 0, 0], scale: 1 });
    expect(o.markers[1]).toMatchObject({ pos: [20, 0, 0], scale: CANDIDATE_SELECTED_SCALE });
    expect(o.labels.map((l) => l.text)).toEqual(["1", "2"]);
    expect(o.labels[1].color).toBe(CANDIDATE_SELECTED_HEX);
    expect(o.labels[0].color).toBe(CANDIDATE_HEX);
  });

  it("los descartados van detrás, tenues, más pequeños y con «D» delante", () => {
    const o = candidateOverlay({ candidates: aceptados, rejected: descartados, selected: 0, showRejected: true, step: "detect" });
    expect(o.markers).toHaveLength(3);
    expect(o.markers[2]).toMatchObject({ pos: [40, 0, 0], scale: CANDIDATE_REJECTED_SCALE });
    expect(o.labels[2]).toMatchObject({ text: "D7", color: CANDIDATE_REJECTED_HEX });
  });

  it("un descartado elegido también se resalta", () => {
    const o = candidateOverlay({ candidates: aceptados, rejected: descartados, selected: 2, showRejected: true, step: "detect" });
    expect(o.markers[2].scale).toBe(CANDIDATE_SELECTED_SCALE);
    expect(o.labels[2].color).toBe(CANDIDATE_SELECTED_HEX);
  });

  it("con el interruptor apagado los descartados no se dibujan, salvo el elegido", () => {
    const off = candidateOverlay({ candidates: aceptados, rejected: descartados, selected: 0, showRejected: false, step: "detect" });
    expect(off.markers).toHaveLength(2);
    const elegido = candidateOverlay({ candidates: aceptados, rejected: descartados, selected: 2, showRejected: false, step: "detect" });
    expect(elegido.markers).toHaveLength(3);
    expect(elegido.labels[2].text).toBe("D7");
  });

  it("un punto marcado a mano (sin puesto) se etiqueta «M»", () => {
    const manual = cand("m", 5, 0, { patch_kind: "manual", channels: [], rank: 0 });
    const o = candidateOverlay({ candidates: [manual], rejected: [], selected: 0, showRejected: true, step: "detect" });
    expect(o.labels[0].text).toBe("M");
  });
});

describe("nearestCandidate", () => {
  const todos = [...aceptados, ...descartados];

  it("elige el candidato cuyo saco contiene el punto pulsado", () => {
    // Radio del saco de «b» = 2 mm; el punto está a 1,5 mm de su centro.
    expect(nearestCandidate([21.5, 0, 0], todos, true)).toBe(1);
  });

  it("acepta un margen alrededor del saco para esferas pequeñas", () => {
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
