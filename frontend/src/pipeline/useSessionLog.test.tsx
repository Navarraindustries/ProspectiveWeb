import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { estado } = vi.hoisted(() => ({ estado: {} as Record<string, unknown> }));
vi.mock("../store/planning", () => ({ usePlanning: () => ({ ...estado }) }));

import { useSessionLog } from "./sessionLog";

const base = () => ({
  sessionId: null, series: null, segmentation: null, candidates: [], allCandidates: [],
  selectedCandidate: 0, morphometry: null,
});
const set = (o: Record<string, unknown>) => { Object.assign(estado, o); };
const c = (id: string) => ({ id });

describe("useSessionLog", () => {
  beforeEach(() => { for (const k of Object.keys(estado)) delete estado[k]; Object.assign(estado, base()); });

  it("una subida (sesión y serie a la vez) apunta «DICOM cargado»", () => {
    const { result, rerender } = renderHook(() => useSessionLog("Carga"));
    set({ sessionId: "s1", series: { slices: 120 } });
    rerender();
    expect(result.current.map((e) => e.texto)).toEqual(["DICOM cargado · 120 cortes"]);
  });

  it("la detección no apunta «Elegido»; elegir un candidato sí", () => {
    set({ sessionId: "s1" });
    const { result, rerender } = renderHook(() => useSessionLog("Detección"));
    const lista = [c("a"), c("b"), c("c")];
    set({ candidates: lista, allCandidates: lista });
    rerender();
    expect(result.current.map((e) => e.texto)).toEqual(["Detección · 3 candidatos"]);
    set({ selectedCandidate: 2 });
    rerender();
    expect(result.current.map((e) => e.texto)).toEqual(["Detección · 3 candidatos", "Elegido c"]);
  });

  it("volver a pintar con lo mismo no añade nada", () => {
    set({ sessionId: "s1", series: { slices: 10 } });
    const { result, rerender } = renderHook(() => useSessionLog("Carga"));
    const n = result.current.length;
    rerender(); rerender();
    expect(result.current).toHaveLength(n);
  });

  it("una sesión nueva vacía lo anterior", () => {
    set({ sessionId: "s1", series: { slices: 10 }, segmentation: { vertices: 500 } });
    const { result, rerender } = renderHook(() => useSessionLog("Carga"));
    expect(result.current).toHaveLength(2);
    set({ sessionId: "s2", series: { slices: 30 }, segmentation: null });
    rerender();
    expect(result.current.map((e) => e.texto)).toEqual(["DICOM cargado · 30 cortes"]);
  });
});
