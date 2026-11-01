import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { simularPantalla } from "../test/pantalla";
import { useEstrecho, useTableta, useTramo } from "./useEstrecho";

afterEach(() => { /* cada test restaura su pantalla */ });

describe("tramos de pantalla", () => {
  it.each([[360, "movil"], [640, "movil"], [768, "tableta"], [1024, "tableta"], [1280, "estrecho"], [1707, "ancho"], [1920, "grande"], [2560, "grande"]])(
    "a %i px el tramo es %s", (ancho, tramo) => {
      const s = simularPantalla({ ancho });
      expect(renderHook(() => useTramo()).result.current).toBe(tramo);
      s.restaurar();
    });
  it("el tramo sigue al cambio de tamaño sin remontar", () => {
    const s = simularPantalla({ ancho: 1707 });
    const { result } = renderHook(() => useTramo());
    act(() => s.cambiar({ ancho: 390 }));
    expect(result.current).toBe("movil");
    s.restaurar();
  });
  it("useTableta incluye el móvil y useEstrecho sigue en 1280", () => {
    const s = simularPantalla({ ancho: 390 });
    expect(renderHook(() => useTableta()).result.current).toBe(true);
    expect(renderHook(() => useEstrecho()).result.current).toBe(true);
    s.restaurar();
  });
});
