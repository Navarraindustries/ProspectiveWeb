/* Mapa de calibre (backend services/mapa_calibre.py): el diámetro local del
   vaso en cada vértice, pintado sobre el árbol. Se ve de un vistazo dónde se
   estrecha o se ensancha un vaso, y un saco destaca por su color.

   La escala es secuencial (viridis), no el azul → gris → rojo de la aposición
   y del seguimiento: aquí no hay «bien» ni «mal», solo más fino o más grueso,
   y con los mismos colores se leería como un cambio. Viridis se lee igual con
   las formas comunes de daltonismo y en gris. Escala fija de 0 a 6 mm para
   poder comparar casos; lo más grueso (un saco grande) satura arriba.

   La capa del árbol con el mapa lleva `#calibre` en la URL: la escena se
   rehace al encenderlo o apagarlo (la clave de escena mira la URL, ver
   sceneKeys.ts) y el fragmento no viaja al servidor. */
import { api } from "../api/client";
import type { CalibreMeshResult } from "../api/types";
import type { Rgb } from "./mapaDivergente";

export const CAMPO_CALIBRE = "calibre_mm";
export const RANGO_CALIBRE_MM: readonly [number, number] = [0, 6];
const FRAGMENTO = "#calibre";

/** Viridis en cinco paradas (de fino a grueso). */
export const MAPA_SECUENCIAL: readonly Rgb[] = [
  [0.267, 0.005, 0.329],
  [0.231, 0.322, 0.545],
  [0.129, 0.569, 0.549],
  [0.369, 0.788, 0.384],
  [0.992, 0.906, 0.145],
];

const MALLA_DE_SESION = /^\/data\/sessions\/([0-9a-fA-F-]{36})\/meshes\/([A-Za-z0-9_.-]+\.vtp)(?:\?.*)?$/;

const copias = new Map<string, Promise<CalibreMeshResult | null>>();

export function conCalibre(url: string): string {
  return url + FRAGMENTO;
}

export function esCapaCalibre(url: string): boolean {
  return url.endsWith(FRAGMENTO);
}

function sinFragmento(url: string): string {
  const i = url.indexOf("#");
  return i < 0 ? url : url.slice(0, i);
}

/** La copia con el mapa de `url` y su resumen (una petición por versión de la
 *  malla: la `?v=` cuenta), o null si no es una malla de sesión o el servidor
 *  no la da (entonces se ve el árbol con su color de siempre). */
export function pedirCalibre(
  url: string,
  pedir: (sesion: string, nombre: string) => Promise<CalibreMeshResult> = api.calibreMesh,
): Promise<CalibreMeshResult | null> {
  const base = sinFragmento(url);
  const m = MALLA_DE_SESION.exec(base);
  if (!m || m[2].endsWith(".suave.vtp") || m[2].endsWith(".calibre.vtp")) return Promise.resolve(null);
  let p = copias.get(base);
  if (!p) {
    p = pedir(m[1], m[2]).catch(() => { copias.delete(base); return null; });
    copias.set(base, p);
  }
  return p;
}

/** El degradado de la leyenda, de izquierda (fino) a derecha (grueso). */
export function degradadoSecuencial(): string {
  const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  return `linear-gradient(90deg, ${MAPA_SECUENCIAL.map(css).join(", ")})`;
}

/** Solo para las pruebas. */
export function olvidarCalibres(): void { copias.clear(); }
