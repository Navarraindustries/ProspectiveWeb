import { describe, expect, it } from "vitest";
import { presetForKey } from "./layoutShortcuts";

describe("presetForKey", () => {
  it("Alt+1/2/3 eligen sola/derecha/abajo", () => {
    expect(presetForKey("1", document.body, true)).toBe("sola");
    expect(presetForKey("2", document.body, true)).toBe("derecha");
    expect(presetForKey("3", document.body, true)).toBe("abajo");
    expect(presetForKey("4", document.body, true)).toBeNull();
  });
  it("sin Alt el dígito es del salto de paso, no de la distribución", () => {
    expect(presetForKey("2", document.body, false)).toBeNull();
  });
  it("no roba la tecla a un campo de texto", () => {
    expect(presetForKey("2", document.createElement("input"), true)).toBeNull();
    expect(presetForKey("2", document.createElement("textarea"), true)).toBeNull();
    expect(presetForKey("2", document.createElement("select"), true)).toBeNull();
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "true");
    expect(presetForKey("2", ce, true)).toBeNull();
  });
});
