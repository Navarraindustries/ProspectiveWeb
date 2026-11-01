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

export type CanalDeteccion = "calibre" | "cociente" | "curvatura" | "saco";

export interface CandidatoDetectado {
  puesto: number;
  canales: readonly CanalDeteccion[];
  /** Diámetro del candidato redondeado a un decimal. */
  diametroMm: number;
  /** El candidato coincide con la lesión anotada del caso. */
  lesion: boolean;
}

/* Lo que devolvió el detector de Prospective para el caso Zenodo 036, el de
   los cortes y el render del hero. Fuente: `backend/data/zenodo_eval_saco/036.json`
   del checkout principal (fuera de git), lista `candidates`. Diámetros en bruto:
   11,64 · 8,83 · 4,80 · 4,72 · 6,85 mm. El 1.º está a 0,3 mm de la lesión anotada
   (`an_036.stl`, Ø 13,3 mm, puesto 1 en los tres canales). */
export const DETECCION_036: readonly CandidatoDetectado[] = [
  { puesto: 1, canales: ["calibre", "cociente", "curvatura"], diametroMm: 11.6, lesion: true },
  { puesto: 2, canales: ["curvatura"], diametroMm: 8.8, lesion: false },
  { puesto: 3, canales: ["cociente"], diametroMm: 4.8, lesion: false },
  { puesto: 4, canales: ["curvatura"], diametroMm: 4.7, lesion: false },
  { puesto: 5, canales: ["curvatura", "saco"], diametroMm: 6.9, lesion: false },
];

export const rutaFotograma =(i: number): string =>
  `/media/landing/hero/${String(i).padStart(3, "0")}.webp`;

/* Pantallas donde el escenario fijado de 100 vh no cabe (un iPhone con las
   barras visibles, un móvil apaisado, un portátil bajo): el hero pasa a la
   disposición quieta, la misma que con movimiento reducido. Debe coincidir con
   el @media de `.hero-cortes` en landing.css. */
export const CONSULTA_HERO_QUIETO = "(max-width: 760px), (max-height: 700px)";

/* Peticiones simultáneas tras el fotograma 0. */
const EN_PARALELO = 4;

/** Precarga los fotogramas en orden: primero el 0, solo; después el resto por
    índice, con `enParalelo` peticiones abiertas a la vez. `alListo(i)` avisa
    cuando el fotograma ya se puede pintar (descargado y decodificado). No se
    guarda ninguna `Image` al terminar: el fichero queda en la caché HTTP y el
    `<img>` del hero lo vuelve a pedir de ahí, así que no se retienen los 60
    mapas de bits decodificados (1024 × 1024 cada uno). Devuelve la función que
    cancela lo pendiente. */
export function precargarEnOrden(
  count: number,
  ruta: (i: number) => string,
  alListo: (i: number) => void,
  { enParalelo = EN_PARALELO, crear = () => new Image() }: { enParalelo?: number; crear?: () => HTMLImageElement } = {},
): () => void {
  let vivo = true;
  let siguiente = 1;
  const enCurso = new Set<HTMLImageElement>();

  const pedir = (i: number) => {
    const img = crear();
    enCurso.add(img);
    const fin = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      enCurso.delete(img);
      if (!vivo) return;
      if (ok) alListo(i);
      // Al acabar el 0 se abren `enParalelo` peticiones; luego, una por cada una que acaba.
      const huecos = i === 0 ? enParalelo : 1;
      for (let k = 0; k < huecos && siguiente < count; k++) pedir(siguiente++);
    };
    img.onload = () => {
      if (typeof img.decode === "function") img.decode().then(() => fin(true), () => fin(true));
      else fin(true);
    };
    img.onerror = () => fin(false);
    img.src = ruta(i);
  };

  if (count > 0) pedir(0);
  return () => {
    vivo = false;
    for (const img of enCurso) {
      img.onload = null;
      img.onerror = null;
    }
    enCurso.clear();
  };
}

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
