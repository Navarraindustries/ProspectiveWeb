import { describe, expect, it } from "vitest";
import { layoutActionForKey } from "./layoutShortcuts";

describe("layoutActionForKey", () => {
  it("Alt+1/2/3 eligen solo/derecha/abajo", () => {
    expect(layoutActionForKey("Digit1", document.body, true)).toBe("solo");
    expect(layoutActionForKey("Digit2", document.body, true)).toBe("derecha");
    expect(layoutActionForKey("Digit3", document.body, true)).toBe("abajo");
    expect(layoutActionForKey("Digit6", document.body, true)).toBeNull();
  });
  it("lee la tecla física: el carácter que escribe Option+dígito en macOS no cuenta", () => {
    // Option+1 en macOS da key «¡» pero code «Digit1».
    expect(layoutActionForKey("¡", document.body, true)).toBeNull();
    expect(layoutActionForKey("1", document.body, true)).toBeNull();
  });
  it("sin Alt el dígito es del salto de paso, no de la distribución", () => {
    expect(layoutActionForKey("Digit2", document.body, false)).toBeNull();
  });
  it("no roba la tecla a un campo de texto", () => {
    expect(layoutActionForKey("Digit2", document.createElement("input"), true)).toBeNull();
    expect(layoutActionForKey("Digit2", document.createElement("textarea"), true)).toBeNull();
    expect(layoutActionForKey("Digit2", document.createElement("select"), true)).toBeNull();
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "true");
    expect(layoutActionForKey("Digit2", ce, true)).toBeNull();
  });
});

describe("layoutActionForKey iguales y rotar", () => {
  it("Alt+4 iguala y Alt+5 rota", () => { expect(layoutActionForKey("Digit4", null, true)).toBe("iguales"); });
});
