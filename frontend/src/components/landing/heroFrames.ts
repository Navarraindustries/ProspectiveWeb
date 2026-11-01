/* heroFrames — la aritmética del hero de cortes, sin React.

   El manifiesto vive en `public/media/landing/hero.json` (lo escribe
   `backend/scripts/landing_hero_assets.py`). Vite no deja importar desde
   `public/`, así que aquí va su copia y `heroFrames.test.ts` la compara con el
   fichero de disco: si se regeneran los assets, el test avisa. */

export const MANIFIESTO = {
  count: 60,
  total: 594,
  lesionFrame: 59,
  window: { w: 600, l: 60 },
  /* Número de corte (de `total`) que enseña cada fotograma. */
  sliceOf: [
    60, 63, 65, 68, 71, 73, 76, 79, 82, 84, 87, 90, 92, 95, 98,
    100, 103, 106, 109, 111, 114, 117, 119, 122, 125, 127, 130, 133, 135, 138,
    141, 144, 146, 149, 152, 154, 157, 160, 162, 165, 168, 170, 173, 176, 179,
    181, 184, 187, 189, 192, 195, 197, 200, 203, 206, 208, 211, 214, 216, 219,
  ],
} as const;

export const rutaFotograma = (i: number): string =>
  `/media/landing/hero/${String(i).padStart(3, "0")}.webp`;

/** Fotograma para un progreso 0–1. Se deriva del progreso absoluto, no de
    deltas: un salto con la barra cae en el fotograma correcto. */
export function fotogramaPara(progreso: number, count: number): number {
  const p = Math.min(1, Math.max(0, progreso));
  return Math.round(p * (count - 1));
}

/** El fotograma que se puede pintar ya: el mayor cargado que no pasa del
    objetivo; si todos quedan por encima, el menor cargado; `null` si ninguno.
    Así, mientras el objetivo se descarga, se queda el último que había. */
export function ultimoCargado(objetivo: number, cargados: ReadonlySet<number>): number | null {
  let debajo: number | null = null;
  let menor: number | null = null;
  for (const i of cargados) {
    if (i <= objetivo && (debajo === null || i > debajo)) debajo = i;
    if (menor === null || i < menor) menor = i;
  }
  return debajo ?? menor;
}
