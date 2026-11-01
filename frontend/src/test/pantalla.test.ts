import { afterEach, describe, expect, it, vi } from "vitest";
import { MQ_MOVIL, MQ_TACTIL } from "../pipeline/puntosCorte";
import { anchoBanda, cumpleConsulta, simularPantalla } from "./pantalla";

afterEach(() => vi.unstubAllGlobals());

describe("pantalla", () => {
  it("evalúa max/min de ancho y alto, también encadenadas con and", () => {
    expect(cumpleConsulta("(max-width: 640px)", 640, 900)).toBe(true);
    expect(cumpleConsulta("(max-width: 640px)", 641, 900)).toBe(false);
    expect(cumpleConsulta("(min-width: 1024px) and (max-height: 700px)", 1366, 600)).toBe(true);
    expect(cumpleConsulta("(min-width: 1024px) and (max-height: 700px)", 1366, 768)).toBe(false);
  });
  it("las preferencias del usuario no se cumplen", () => {
    expect(cumpleConsulta("(prefers-reduced-motion: reduce)", 390, 900)).toBe(false);
  });
  it("simularPantalla responde a matchMedia", () => {
    simularPantalla(390, 600);
    expect(window.matchMedia(MQ_MOVIL).matches).toBe(true);
    expect(window.matchMedia(MQ_TACTIL).matches).toBe(true);
    expect(window.matchMedia("(max-width: 1280px)").matches).toBe(true);
  });
  it("ancho de la banda del visor por pantalla", () => {
    expect(anchoBanda(1280)).toBe(1280);
    expect(anchoBanda(1366)).toBe(938);
    expect(anchoBanda(1707)).toBe(1279);
    expect(anchoBanda(1366, { ancho520: true })).toBe(798);
  });
});
