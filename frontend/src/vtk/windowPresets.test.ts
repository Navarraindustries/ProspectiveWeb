import { describe, expect, it } from "vitest";
import { windowPresets } from "./windowPresets";
import type { VolumeMeta } from "../api/types";

const base = { shape: [1, 1, 1], spacing: [1, 1, 1], wc: 100, ww: 400, direction: null, orientation_known: false,
  origin_mm: [0, 0, 0], intensity_range: [-500, 5000], cache_key: "k", full_stride: 1 } as Omit<VolumeMeta, "modality">;

describe("windowPresets", () => {
  it("keeps the HU presets for CT, with Auto first and Restablecer last", () => {
    const p = windowPresets({ ...base, modality: "CT" } as VolumeMeta, null);
    expect(p.map((x) => x.name)).toContain("Cerebro");
    expect(p.find((x) => x.name === "CTA")).toEqual({ name: "CTA", wc: 170, ww: 600 });
    expect(p[0]).toEqual({ name: "Auto", wc: 100, ww: 400 });
    expect(p[p.length - 1].name).toBe("Restablecer");
    expect(p[p.length - 1].reset).toBe(true);
  });
  it("treats CTA and CTPA as HU too", () => {
    for (const modality of ["CTA", "ctpa"]) {
      expect(windowPresets({ ...base, modality } as VolumeMeta, null).map((x) => x.name)).toContain("Hueso");
    }
  });
  it("derives data-driven presets for XA", () => {
    const p = windowPresets({ ...base, modality: "XA" } as VolumeMeta, [1470, 4717]);
    expect(p.map((x) => x.name)).toEqual(["Auto", "Vasos", "Todo", "Restablecer"]);
    expect(p[1]).toEqual({ name: "Vasos", wc: 3093.5, ww: 3247 });
    expect(p[2]).toEqual({ name: "Todo", wc: 2250, ww: 5500 });
    expect(p[3].reset).toBe(true);
  });
  it("omits Vasos without a band", () => {
    expect(windowPresets({ ...base, modality: "XA" } as VolumeMeta, null).map((x) => x.name)).toEqual(["Auto", "Todo", "Restablecer"]);
  });
});
