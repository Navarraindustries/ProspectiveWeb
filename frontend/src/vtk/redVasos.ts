/* Red de líneas centrales de todo el árbol (backend services/red_vasos.py):
   el eje de cada vaso y una esfera en cada bifurcación, dibujados encima del
   árbol translúcido. El servidor la calcula la primera vez (unos segundos en
   un árbol real) y la guarda junto a la malla; aquí se pide una vez por
   versión de la malla. La capa trae su color en el campo `colores`. */
import { api } from "../api/client";
import type { VesselNetworkResult } from "../api/types";

export const CAMPO_COLOR_RED = "colores";

const MALLA_DE_SESION = /^\/data\/sessions\/([0-9a-fA-F-]{36})\/meshes\/([A-Za-z0-9_.-]+\.vtp)(?:\?[^#]*)?(?:#.*)?$/;
const COPIAS = /\.(suave|calibre|red)\.vtp$/;

const redes = new Map<string, Promise<VesselNetworkResult | null>>();

function sinFragmento(url: string): string {
  const i = url.indexOf("#");
  return i < 0 ? url : url.slice(0, i);
}

/** La red de la malla de `url` y su resumen, o null si no es una malla de
 *  sesión o el servidor no la da. */
export function pedirRed(
  url: string,
  pedir: (sesion: string, nombre: string) => Promise<VesselNetworkResult> = api.vesselNetwork,
): Promise<VesselNetworkResult | null> {
  const base = sinFragmento(url);
  const m = MALLA_DE_SESION.exec(base);
  if (!m || COPIAS.test(m[2])) return Promise.resolve(null);
  let p = redes.get(base);
  if (!p) {
    p = pedir(m[1], m[2]).catch(() => { redes.delete(base); return null; });
    redes.set(base, p);
  }
  return p;
}

/** Solo para las pruebas. */
export function olvidarRedes(): void { redes.clear(); }
