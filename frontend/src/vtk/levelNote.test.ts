import { describe, expect, it } from "vitest";
import { levelNoteFor } from "./levelNote";

describe("levelNoteFor", () => {
  it("marks the coarse level with its download progress", () => {
    expect(levelNoteFor("coarse", 3, { done: 4, total: 12 }, null)).toBe("RESOLUCIÓN REDUCIDA · 4/12");
    expect(levelNoteFor("coarse", 3, null, null)).toBe("RESOLUCIÓN REDUCIDA");
    expect(levelNoteFor("coarse", 3, { done: 4, total: 12 }, null, true)).toBe("REDUCIDA 4/12");
  });

  it("marks a full level served with in-plane stride as reduced", () => {
    // Un 512×512×1030 llega a 256²: sin rótulo parecería nativo.
    expect(levelNoteFor("full", 2, null, null)).toBe("RESOLUCIÓN REDUCIDA · 1:2");
    expect(levelNoteFor("full", 2, null, null, true)).toBe("REDUCIDA 1:2");
  });

  it("says nothing for a native full level", () => {
    expect(levelNoteFor("full", 1, null, null)).toBeNull();
  });

  it("reports a failed full download while showing the coarse fallback", () => {
    expect(levelNoteFor("coarse", 3, null, "boom")).toBe("RESOLUCIÓN REDUCIDA");
    expect(levelNoteFor(null, 1, null, "boom")).toBe("SIN VOLUMEN COMPLETO");
    expect(levelNoteFor(null, 1, null, "boom", true)).toBe("SIN COMPLETO");
  });
});
