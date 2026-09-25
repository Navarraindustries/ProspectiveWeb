import { describe, expect, it } from "vitest";
import { ladderTicks } from "./ladder";

describe("ladderTicks", () => {
  it("puts the current index at the vertical centre", () => {
    const t = ladderTicks(384, 100, 200, 8);
    const cur = t.find((x) => x.index === 100)!;
    expect(cur.y).toBe(100);
  });
  it("marks every tenth slice as major and spaces ticks by pxPerTick", () => {
    const t = ladderTicks(384, 100, 200, 8);
    const i100 = t.find((x) => x.index === 100)!, i101 = t.find((x) => x.index === 101)!;
    expect(i101.y - i100.y).toBe(-8);        // índices mayores, más arriba
    expect(t.find((x) => x.index === 110)!.major).toBe(true);
    expect(i101.major).toBe(false);
  });
  it("never emits indices outside [0, count)", () => {
    const t = ladderTicks(20, 2, 400, 8);
    expect(Math.min(...t.map((x) => x.index))).toBe(0);
    expect(Math.max(...t.map((x) => x.index))).toBe(19);
  });
});
