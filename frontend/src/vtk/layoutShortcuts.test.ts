import { describe, expect, it } from "vitest";
import { presetForKey } from "./layoutShortcuts";

describe("presetForKey", () => {
  it("1/2/3 eligen sola/derecha/abajo", () => {
    expect(presetForKey("1", document.body)).toBe("sola");
    expect(presetForKey("2", document.body)).toBe("derecha");
    expect(presetForKey("3", document.body)).toBe("abajo");
    expect(presetForKey("4", document.body)).toBeNull();
  });
  it("no roba la tecla a un campo de texto", () => {
    expect(presetForKey("2", document.createElement("input"))).toBeNull();
    expect(presetForKey("2", document.createElement("textarea"))).toBeNull();
    expect(presetForKey("2", document.createElement("select"))).toBeNull();
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "true");
    expect(presetForKey("2", ce)).toBeNull();
  });
});
