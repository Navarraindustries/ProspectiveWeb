import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook } from "@testing-library/react";

import { simularPantalla } from "../../test/pantalla";
import { seccionEnLinea, useSeccionActiva } from "./useSeccionActiva";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("seccionEnLinea", () => {
  const cajas = [{ id: "a", top: 0, bottom: 500 }, { id: "b", top: 500, bottom: 900 }];
  it("devuelve la caja que cruza la línea", () => {
    expect(seccionEnLinea(cajas, 400)).toBe("a");
    expect(seccionEnLinea(cajas, 500)).toBe("b");
    expect(seccionEnLinea(cajas, 950)).toBeNull();
  });
});

describe("useSeccionActiva", () => {
  it("sigue al scroll con la línea al 40 % del alto", () => {
    simularPantalla(1280, 1000);
    const cajas: Record<string, { top: number; bottom: number }> = {
      "que-es": { top: 500, bottom: 1300 },
      "como-funciona": { top: 1300, bottom: 2100 },
    };
    for (const id of Object.keys(cajas)) {
      const s = document.createElement("section");
      s.id = id;
      s.getBoundingClientRect = () => cajas[id] as DOMRect;
      document.body.appendChild(s);
    }
    const { result } = renderHook(() => useSeccionActiva(["que-es", "como-funciona"]));
    expect(result.current).toBeNull();
    cajas["que-es"] = { top: 100, bottom: 900 };
    act(() => { fireEvent.scroll(window); });
    expect(result.current).toBe("que-es");
    cajas["que-es"] = { top: -900, bottom: -100 };
    cajas["como-funciona"] = { top: -100, bottom: 300 };
    act(() => { fireEvent.scroll(window); });
    expect(result.current).toBeNull();
  });
});
