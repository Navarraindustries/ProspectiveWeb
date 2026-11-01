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

describe("pantalla: forma objeto, listas y preferencias", () => {
  it("max-width incluye el borde", () => {
    expect(cumpleConsulta("(max-width: 640px)", { ancho: 640 })).toBe(true);
    expect(cumpleConsulta("(max-width: 640px)", { ancho: 641 })).toBe(false);
  });
  it("min-width, alto, O y Y", () => {
    expect(cumpleConsulta("(min-width: 1920px)", { ancho: 1920 })).toBe(true);
    expect(cumpleConsulta("(min-width: 1920px)", { ancho: 1919 })).toBe(false);
    expect(cumpleConsulta("(max-width: 760px), (max-height: 600px)", { ancho: 1707, alto: 600 })).toBe(true);
    expect(cumpleConsulta("(min-width: 641px) and (max-width: 1024px)", { ancho: 800 })).toBe(true);
  });
  it("preferencias y características desconocidas", () => {
    expect(cumpleConsulta("(prefers-reduced-transparency: reduce)", { ancho: 1000, transparenciaReducida: true })).toBe(true);
    expect(cumpleConsulta("(prefers-reduced-motion: reduce)", { ancho: 1000 })).toBe(false);
    expect(cumpleConsulta("(prefers-reduced-motion: reduce)", { ancho: 1000, movimientoReducido: true })).toBe(true);
    expect(cumpleConsulta("(hover: hover)", { ancho: 1000 })).toBe(false);
  });
  it("simularPantalla avisa a los oyentes al cambiar y restaura", () => {
    const s = simularPantalla({ ancho: 1707 });
    const mq = window.matchMedia("(max-width: 640px)");
    const oyente = vi.fn();
    mq.addEventListener("change", oyente);
    expect(window.innerWidth).toBe(1707);
    s.cambiar({ ancho: 390 });
    expect(mq.matches).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1);
    s.cambiar({ ancho: 400 });
    expect(oyente).toHaveBeenCalledTimes(1);
    s.restaurar();
    expect(window.matchMedia("(max-width: 640px)").matches).toBe(false);
  });
});
