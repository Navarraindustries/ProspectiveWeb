/* Simulador de pantalla para los tests: matchMedia e innerWidth/innerHeight
   coherentes con un tamaño dado. Quien lo use llama a restaurar() (o a
   vi.unstubAllGlobals()) en afterEach. */
import { vi } from "vitest";
import { zonaLibre } from "../pipeline/zonaLibre";

export const MATRIZ_ANCHOS = [360, 390, 768, 1024, 1280, 1366, 1440, 1707, 1920, 2560] as const;
export const MATRIZ_ALTOS = [600, 768, 900, 1080] as const;

export interface Pantalla {
  ancho: number;
  alto?: number;
  transparenciaReducida?: boolean;
  movimientoReducido?: boolean;
}

function trozoCumple(trozo: string, p: Pantalla): boolean {
  const t = trozo.trim();
  const alto = p.alto ?? 900;
  const m = /^\(\s*(max|min)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(t);
  if (m) {
    const valor = Number(m[3]);
    const medida = m[2].toLowerCase() === "width" ? p.ancho : alto;
    return m[1].toLowerCase() === "max" ? medida <= valor : medida >= valor;
  }
  if (/^\(\s*prefers-reduced-transparency\s*:\s*reduce\s*\)$/i.test(t)) return !!p.transparenciaReducida;
  if (/^\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)$/i.test(t)) return !!p.movimientoReducido;
  return false;
}

/** Evalúa una consulta de medios: listas con comas (O), `and`, max/min de
    ancho y alto y las dos preferencias de reducción. Lo demás no se cumple.
    Forma `(q, ancho, alto)` o `(q, pantalla)`. */
export function cumpleConsulta(q: string, ancho: number, alto?: number): boolean;
export function cumpleConsulta(q: string, pantalla: Pantalla): boolean;
export function cumpleConsulta(q: string, a: number | Pantalla, alto?: number): boolean {
  const p: Pantalla = typeof a === "number" ? { ancho: a, alto } : a;
  return q.split(",").some((alt) => alt.split(/\s+and\s+/i).every((t) => trozoCumple(t, p)));
}

export interface ControlPantalla {
  cambiar(cambios: Partial<Pantalla>): void;
  restaurar(): void;
}

type Oyente = (e: MediaQueryListEvent) => void;

/** Fija matchMedia e innerWidth/innerHeight. Acepta `(ancho, alto = 900)` o un
    objeto `Pantalla`. `cambiar` avisa a los oyentes cuyo resultado cambió (el
    llamador lo envuelve en `act`); `restaurar` deshace los stubs. */
export function simularPantalla(ancho: number, alto?: number): ControlPantalla;
export function simularPantalla(p: Pantalla): ControlPantalla;
export function simularPantalla(a: number | Pantalla, altoArg = 900): ControlPantalla {
  const estado: Pantalla = typeof a === "number" ? { ancho: a, alto: altoArg } : { alto: 900, ...a };
  const listas: { q: string; previo: boolean; oyentes: Set<Oyente> }[] = [];
  const fijarTamano = () => {
    vi.stubGlobal("innerWidth", estado.ancho);
    vi.stubGlobal("innerHeight", estado.alto ?? 900);
  };
  fijarTamano();
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => {
    const rec = { q: query, previo: cumpleConsulta(query, estado), oyentes: new Set<Oyente>() };
    listas.push(rec);
    return {
      get matches() { return cumpleConsulta(query, estado); },
      media: query,
      onchange: null,
      addEventListener: (_t: string, f: EventListenerOrEventListenerObject) => { rec.oyentes.add(f as Oyente); },
      removeEventListener: (_t: string, f: EventListenerOrEventListenerObject) => { rec.oyentes.delete(f as Oyente); },
      addListener: (f: Oyente | null) => { if (f) rec.oyentes.add(f); },
      removeListener: (f: Oyente | null) => { if (f) rec.oyentes.delete(f); },
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  });
  return {
    cambiar(cambios) {
      Object.assign(estado, cambios);
      fijarTamano();
      for (const l of listas) {
        const ahora = cumpleConsulta(l.q, estado);
        if (ahora === l.previo) continue;
        l.previo = ahora;
        for (const f of [...l.oyentes]) f({ matches: ahora, media: l.q } as MediaQueryListEvent);
      }
    },
    restaurar() { vi.unstubAllGlobals(); },
  };
}

/** Ancho de la banda del visor: la pantalla menos lo que ocupa el inspector. */
export function anchoBanda(ancho: number, o: { ancho520?: boolean; plegado?: boolean } = {}): number {
  return ancho - zonaLibre({ estrecho: ancho <= 1280, plegado: !!o.plegado, ancho: !!o.ancho520 }).right;
}
