/* heroFrames — la aritmética del hero de cortes, sin React.

   El manifiesto vive en `public/media/landing/hero.json` (lo escribe
   `backend/scripts/landing_case3/hero_slices_case3.py`). Vite no deja importar
   desde `public/`, así que aquí va su copia y `heroFrames.test.ts` la compara
   con el fichero de disco: si se regeneran los assets, el test avisa. */

import { CONSULTA } from "../../styles/puntosCorte";

export const MANIFIESTO = {
  count: 60,
  total: 384,
  lesionFrame: 59,
  window: { w: 3000, l: 1800 },
  /* Número de corte (de `total`) que enseña cada fotograma: axial contado desde
     el extremo superior del volumen 3DRA. */
  sliceOf: [
    95, 97, 98, 100, 101, 103, 104, 106, 107, 109, 110, 112, 113, 115, 116,
    118, 119, 121, 122, 124, 125, 127, 128, 130, 131, 133, 134, 136, 137, 139,
    140, 142, 143, 145, 146, 148, 149, 151, 152, 154, 155, 157, 158, 160, 161,
    163, 164, 166, 167, 169, 170, 172, 173, 175, 176, 178, 179, 181, 182, 184,
  ],
} as const;

/* Cada fotograma es una losa MIP de 13 cortes (±6, unos 4,2 mm), no un corte de
   0,32 mm: en una 3DRA un corte único solo deja puntos sueltos. */
export const GROSOR_LOSA_MM = 4.2;

export type CanalDeteccion = "calibre" | "cociente" | "curvatura" | "saco";

export interface CandidatoDetectado {
  puesto: number;
  canales: readonly CanalDeteccion[];
  /** Diámetro del candidato redondeado a un decimal. */
  diametroMm: number;
  /** El candidato coincide con la lesión confirmada del caso. */
  lesion: boolean;
}

/* Lo que devolvió el detector de Prospective para Case 3 (3DRA XA 384³, Philips),
   por el mismo camino que la app: `segment_tubular` (umbral automático 1 471,
   estrategia xa_band_pass, sin techo, suavizado nivel 3, resolución nativa) +
   «solo el árbol» (`keep_main_tree`, 107 186 → 103 996 vértices), después
   `_detect_hits(top=30)` + vetos + tope de 5, como `_run_detection_sync`.
   Diámetros en bruto: 3,745 · 5,367 · 5,777 · 5,122 · 2,653 mm. El 1.º está a
   4,8 mm de la lesión confirmada del tronco basilar (GT (62, 64, 63) mm de malla,
   `test_detector_case3.GT_BASILAR`, tolerancia 10 mm). Lo encuentra solo la
   curvatura. Dos sitios más quedaron vetados por bifurcación (a 36 y 29 mm). */
export const DETECCION_CASE3: readonly CandidatoDetectado[] = [
  { puesto: 1, canales: ["curvatura"], diametroMm: 3.7, lesion: true },
  { puesto: 2, canales: ["calibre", "cociente"], diametroMm: 5.4, lesion: false },
  { puesto: 3, canales: ["calibre", "cociente", "curvatura"], diametroMm: 5.8, lesion: false },
  { puesto: 4, canales: ["calibre"], diametroMm: 5.1, lesion: false },
  { puesto: 5, canales: ["cociente"], diametroMm: 2.7, lesion: false },
];

export const rutaFotograma =(i: number): string =>
  `/media/landing/hero/${String(i).padStart(3, "0")}.webp`;

/* Pantallas donde el escenario fijado de 100 vh no cabe (un iPhone con las
   barras visibles, un móvil apaisado): el hero pasa a la
   disposición quieta, la misma que con movimiento reducido (la clase
   `.hero-cortes--quieto` cubre el escenario y el contenido). El ancho es el del
   tramo móvil. 600 px de alto deja entrar al portátil de 1366 × 768
   (≈ 650 px útiles): el contenido del hero mide ≈ 600. */
export const CONSULTA_HERO_QUIETO = `${CONSULTA.movil}, (max-height: 600px)`;

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
