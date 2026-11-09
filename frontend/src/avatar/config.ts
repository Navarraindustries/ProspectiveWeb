import type { AvatarConfig } from "../api/types";
import listas from "./listas.json";

export type { AvatarConfig };

/** Listas cerradas: deben coincidir con backend/services/avatar_config.py (test de paridad). */
export const PIELES: readonly string[] = listas.pieles;
export const PEINADOS: readonly string[] = listas.peinados;
export const COLORES_PELO: readonly string[] = listas.coloresPelo;
export const CABEZAS: readonly string[] = listas.cabezas;
export const OJOS: readonly string[] = listas.ojos;
export const PIJAMAS: readonly string[] = listas.pijamas;
export const FONDOS: readonly string[] = listas.fondos;

/** Etiquetas en español. La piel va por índice (ETIQUETAS_PIEL); el resto, por valor. */
export const ETIQUETAS_PIEL: readonly string[] = ["Muy clara", "Clara", "Media", "Morena", "Oscura", "Muy oscura"];
export const ETIQUETAS: Record<string, string> = {
  corto: "Corto",
  largo: "Largo",
  mono: "Moño",
  rapado: "Rapado",
  rizado: "Rizado",
  coleta: "Coleta",
  nada: "Nada",
  gorro: "Gorro quirúrgico",
  gorro_amplio: "Gorro amplio",
  gafas: "Gafas",
  lupas: "Lupas quirúrgicas",
  "#2B1D16": "Castaño oscuro",
  "#121212": "Negro",
  "#6B4226": "Castaño",
  "#D8B26E": "Rubio",
  "#A4492A": "Pelirrojo",
  "#C9CCD2": "Canoso",
  "#3FC4AB": "Verde quirófano",
  "#5AA9FF": "Azul",
  "#A98BF0": "Violeta",
  "#B5485A": "Granate",
  "#E0A84A": "Ámbar",
  "#4A5263": "Gris pizarra",
  "#12141A": "Obsidiana",
  "#10233D": "Azul noche",
  "#241A3D": "Ciruela",
  "#0F2E28": "Verde bosque",
  "#DCE3EC": "Gris claro",
};

/** «nada» significa «sin gafas» en la lista de ojos. */
export const ETIQUETA_OJOS_NADA = "Sin gafas";

function hash(n: number): number {
  let x = (Math.trunc(n) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function configPorDefecto(userId: number): AvatarConfig {
  let h = hash(userId);
  const next = (n: number): number => {
    const i = h % n;
    h = hash(h + 1);
    return i;
  };
  return {
    v: 1,
    piel: next(PIELES.length),
    peinado: PEINADOS[next(PEINADOS.length)],
    pelo: COLORES_PELO[next(COLORES_PELO.length)],
    cabeza: CABEZAS[next(CABEZAS.length)],
    ojos: OJOS[next(OJOS.length)],
    mascarilla: false,
    pijama: PIJAMAS[next(PIJAMAS.length)],
    fondo: FONDOS[next(FONDOS.length)],
  };
}

export function configAleatoria(rand: () => number = Math.random): AvatarConfig {
  const idx = (n: number) => Math.min(n - 1, Math.floor(rand() * n));
  return {
    v: 1,
    piel: idx(PIELES.length),
    peinado: PEINADOS[idx(PEINADOS.length)],
    pelo: COLORES_PELO[idx(COLORES_PELO.length)],
    cabeza: CABEZAS[idx(CABEZAS.length)],
    ojos: OJOS[idx(OJOS.length)],
    mascarilla: rand() < 0.2,
    pijama: PIJAMAS[idx(PIJAMAS.length)],
    fondo: FONDOS[idx(FONDOS.length)],
  };
}
