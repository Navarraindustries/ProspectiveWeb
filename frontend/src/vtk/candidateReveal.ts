/* Entrada de los candidatos al terminar la detección: aparecen uno a uno, en
   el orden de la lista (el puesto 1 primero), cada uno con un halo que se abre
   y se apaga una vez sobre su número. Cuenta lo que ha hecho el detector —
   «estos son los sitios, en este orden» — en vez de soltar todas las zonas a
   la vez sobre el árbol.

   Pasa una vez por cada lista nueva de candidatos (detectar, re-detectar,
   reanudar), así que se permite un compás más largo que el de un control.
   No bloquea nada: tocar el visor la termina de golpe (MeshView).

   Todo puro: qué entra en qué orden y cuánto lleva cada uno en cada instante. */
import type { AneurysmCandidate } from "../api/types";
import { cubicBezier, EASE } from "../motion";

/** Separación entre un candidato y el siguiente (13-11: de 180 a 320 ms; a
 *  180 la entrada pasaba demasiado deprisa para seguir el orden). */
export const ESCALON_MS = 320;
/** Lo que tarda cada zona (y su número) en llegar a su opacidad. */
export const APARECER_MS = 520;
/** Lo que tarda el halo en abrirse y apagarse. */
export const HALO_MS = 1100;

/** Un candidato que entra: su capa con nombre en MeshView (los marcados a
 *  mano no tienen malla) y su rótulo, por índice en la lista de rótulos. */
export interface PasoEntrada { capa?: string; rotulo: number }

/** Lo que MeshView necesita para reproducir la entrada una sola vez: `token`
 *  cambia con cada lista nueva de candidatos. */
export interface EntradaCandidatos { token: number; pasos: PasoEntrada[] }

/** Los pasos en el orden de los rótulos de `candidateOverlay` (aceptados por
 *  puesto y, si se ven, los descartados detrás). */
export function pasosEntrada(args: {
  candidates: AneurysmCandidate[];
  rejected: AneurysmCandidate[];
  selected: number;
  showRejected: boolean;
  step: string;
}): PasoEntrada[] {
  if (args.step !== "detect") return [];
  const out: PasoEntrada[] = [];
  const push = (c: AneurysmCandidate) => out.push({ capa: c.dome_mesh_url ? `cand:${c.id}` : undefined, rotulo: out.length });
  args.candidates.forEach(push);
  args.rejected.forEach((c, i) => {
    if (args.showRejected || args.candidates.length + i === args.selected) push(c);
  });
  return out;
}

const salida = cubicBezier(...EASE);

/** Cómo va el candidato `i` a los `t` ms de empezar: `aparicion` 0–1 (ya con
 *  la curva de salida) y `halo` 0–1 mientras se ve, `null` antes y después. */
export function progresoEntrada(t: number, i: number): { aparicion: number; halo: number | null } {
  const local = t - i * ESCALON_MS;
  if (local < 0) return { aparicion: 0, halo: null };
  const a = Math.min(1, local / APARECER_MS);
  const h = local / HALO_MS;
  return { aparicion: a >= 1 ? 1 : salida(a), halo: h < 1 ? h : null };
}

/** Hasta que se apaga el halo del último. */
export function duracionEntrada(n: number): number {
  return n > 0 ? (n - 1) * ESCALON_MS + HALO_MS : 0;
}
