/* La copia suavizada de la malla, solo para verla (backend services/mesh_smooth.py).

   Las mallas de marching cubes tienen aristas y aletas que en el recorrido
   por dentro del vaso, a un milímetro de la pared, parecen picos (case 3,
   17-11). El servidor guarda al lado una copia con el filtro de seno
   enventanado y normales por vértice; aquí solo se pide su URL. La capa
   sigue llamándose por la URL original: medidas, selección y recorrido la
   siguen reconociendo. Si algo falla se ve la original. */
import { api } from "../api/client";

const MALLA_DE_SESION = /^\/data\/sessions\/([0-9a-fA-F-]{36})\/meshes\/([A-Za-z0-9_.-]+\.vtp)(?:\?.*)?$/;

const copias = new Map<string, Promise<string>>();

/** La URL de la copia suave de `url` (una por versión: la `?v=` cuenta), o
 *  `url` si no es una malla de sesión o el servidor no la da. */
export function urlSuave(url: string, pedir: (sesion: string, nombre: string) => Promise<{ url: string }> = api.smoothMesh): Promise<string> {
  const m = MALLA_DE_SESION.exec(url);
  if (!m || m[2].endsWith(".suave.vtp")) return Promise.resolve(url);
  let p = copias.get(url);
  if (!p) {
    p = pedir(m[1], m[2]).then((r) => r.url).catch(() => { copias.delete(url); return url; });
    copias.set(url, p);
  }
  return p;
}

/** Solo para las pruebas. */
export function olvidarCopiasSuaves(): void { copias.clear(); }
