import { describe, expect, it } from "vitest";
import { presetForKey } from "./layoutShortcuts";

describe("presetForKey", () => {
  it("Alt+1/2/3 eligen sola/derecha/abajo", () => {
    expect(presetForKey("Digit1", document.body, true)).toBe("sola");
    expect(presetForKey("Digit2", document.body, true)).toBe("derecha");
    expect(presetForKey("Digit3", document.body, true)).toBe("abajo");
    expect(presetForKey("Digit5", document.body, true)).toBeNull();
  });
  it("lee la tecla física: el carácter que escribe Option+dígito en macOS no cuenta", () => {
    // Option+1 en macOS da key «¡» pero code «Digit1».
    expect(presetForKey("¡", document.body, true)).toBeNull();
    expect(presetForKey("1", document.body, true)).toBeNull();
  });
  it("sin Alt el dígito es del salto de paso, no de la distribución", () => {
    expect(presetForKey("Digit2", document.body, false)).toBeNull();
  });
  it("no roba la tecla a un campo de texto", () => {
    expect(presetForKey("Digit2", document.createElement("input"), true)).toBeNull();
    expect(presetForKey("Digit2", document.createElement("textarea"), true)).toBeNull();
    expect(presetForKey("Digit2", document.createElement("select"), true)).toBeNull();
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "true");
    expect(presetForKey("Digit2", ce, true)).toBeNull();
  });
});

describe("presetForKey cuatro", () => {
  it("Alt+4 elige cuatro", () => { expect(presetForKey("Digit4", null, true)).toBe("cuatro"); });
});
