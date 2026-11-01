/* Simulador de pantalla para los tests: matchMedia e innerWidth/innerHeight
   coherentes con un tamaño dado. Quien lo use llama a vi.unstubAllGlobals()
   en afterEach. */
import { vi } from "vitest";
import { zonaLibre } from "../pipeline/zonaLibre";

export const MATRIZ_ANCHOS = [360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560] as const;
export const MATRIZ_ALTOS = [600, 768, 900, 1080] as const;

/** Evalúa una consulta de medios de ancho/alto (max/min, encadenadas con
    `and`). Cualquier otro trozo (prefers-*, hover…) no se cumple. */
export function cumpleConsulta(q: string, ancho: number, alto: number): boolean {
  return q.split(/\s+and\s+/i).every((trozo) => {
    const m = /^\s*\(\s*(max|min)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*\)\s*$/i.exec(trozo);
    if (!m) return false;
    const valor = Number(m[3]);
    const medida = m[2].toLowerCase() === "width" ? ancho : alto;
    return m[1].toLowerCase() === "max" ? medida <= valor : medida >= valor;
  });
}

export function simularPantalla(ancho: number, alto = 900): void {
  vi.stubGlobal("innerWidth", ancho);
  vi.stubGlobal("innerHeight", alto);
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => ({
    matches: cumpleConsulta(query, ancho, alto),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Ancho de la banda del visor: la pantalla menos lo que ocupa el inspector. */
export function anchoBanda(ancho: number, o: { ancho520?: boolean; plegado?: boolean } = {}): number {
  return ancho - zonaLibre({ estrecho: ancho <= 1280, plegado: !!o.plegado, ancho: !!o.ancho520 }).right;
}
