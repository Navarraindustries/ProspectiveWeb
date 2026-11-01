/* Cuántos pasos del riel están encendidos para un progreso de scroll dado:
   el primero en cuanto hay avance y uno más cada 1/(n-1) del recorrido. */
export function pasosEncendidos(progreso: number, n: number): number {
  return progreso <= 0 ? 0 : Math.min(n, Math.floor(progreso * (n - 1) + 1e-6) + 1);
}
