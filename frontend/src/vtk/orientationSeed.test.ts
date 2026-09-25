import { describe, expect, it } from "vitest";
import { manualFromMeta, shouldSeed } from "./orientationSeed";

describe("shouldSeed", () => {
  it("seeds once the meta of the current session has arrived", () => {
    expect(shouldSeed(null, "b", "b")).toBe(true);
  });
  it("never seeds with the previous session's meta still in memory", () => {
    // El render en que cambia la sesión: la meta aún es la de «a».
    expect(shouldSeed("a", "b", "a")).toBe(false);
  });
  it("seeds only once per session, so a value the user just set is kept", () => {
    expect(shouldSeed("b", "b", "b")).toBe(false);
  });
  it("does nothing without a session or before its meta", () => {
    expect(shouldSeed(null, null, null)).toBe(false);
    expect(shouldSeed(null, "b", null)).toBe(false);
  });
});

describe("manualFromMeta", () => {
  it("maps the API body to the store shape, and null to null", () => {
    expect(manualFromMeta({ anterior_edge: "left", first_slice_superior: true }))
      .toEqual({ anteriorEdge: "left", firstSliceSuperior: true });
    expect(manualFromMeta(null)).toBeNull();
  });
});
