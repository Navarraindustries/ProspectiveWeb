import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldShowHint } from "./hint";

function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("shouldShowHint", () => {
  it("true la primera vez de un tipo y false después", () => {
    const s = memoria();
    expect(shouldShowHint("mip", s)).toBe(true);
    expect(shouldShowHint("mip", s)).toBe(false);
    expect(s.m.get("ws.hintShown.mip")).toBe("1");
  });
  it("cada tipo cuenta aparte", () => {
    const s = memoria();
    shouldShowHint("mip", s);
    expect(shouldShowHint("rotate", s)).toBe(true);
  });
  it("si el almacenamiento falla, la pista se enseña", () => {
    const roto = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(shouldShowHint("slice", roto)).toBe(true);
  });
});

describe("hud.css", () => {
  it("la pista no recibe clics", () => {
    const css = readFileSync(resolve(__dirname, "hud/hud.css"), "utf8");
    const regla = css.split("\n").find((l) => l.startsWith(".hud-hint {"));
    expect(regla).toContain("pointer-events: none");
  });
});
