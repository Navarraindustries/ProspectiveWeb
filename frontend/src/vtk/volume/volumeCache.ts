/* La Cache API donde el visor guarda los bloques del volumen.

   Sin dependencias a propósito: api/client.ts la vacía al perder la sesión
   y volumeLoader.ts la usa para leer y escribir; si importara el cliente
   habría un ciclo. Son imágenes identificables del paciente (~100 MB por
   volumen) en un puesto clínico quizá compartido: se borran al cerrar sesión
   o al caducar el token, y nunca se guardan más de MAX_VOLUMES volúmenes. */

export const CACHE_NAME = "prospective-volume-v2";
const LRU_KEY = "prospective-volume-lru";
export const MAX_VOLUMES = 3;
const KEY_ROOT = "https://prospective.cache/volume/";

/** Clave de la Cache API para un bloque: depende del volumen (cache_key),
    nunca de la sesión. Reanudar copia el volumen bajo un id de sesión nuevo,
    así que con la URL real como clave cada reanudación era un fallo de caché.
    Cualquier URL absoluta vale como clave; esta no se pide nunca a la red. */
export function chunkCacheKey(cacheKey: string, level: "coarse" | "full", z0: number, z1: number): string {
  return `${KEY_ROOT}${encodeURIComponent(cacheKey)}/${level}/${z0}-${z1}`;
}

function hasCaches(): boolean {
  try {
    return typeof caches !== "undefined" && !!caches;
  } catch {
    return false;
  }
}

function readLru(): string[] {
  try {
    const raw = localStorage.getItem(LRU_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLru(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(LRU_KEY, JSON.stringify(ids));
    else localStorage.removeItem(LRU_KEY);
  } catch { /* almacenamiento bloqueado: sin LRU; clearVolumeCache sigue valiendo */ }
}

/** Borra todos los volúmenes guardados. Tolera un navegador sin Cache API. */
export async function clearVolumeCache(): Promise<void> {
  writeLru([]);
  if (!hasCaches()) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch { /* contexto inseguro o almacenamiento bloqueado */ }
}

/** ¿Es `url` una entrada del volumen `id`? Cubre sus bloques completos
    (`<id>/full/…`) y el grueso int16 (`<id>.i16/coarse/…`). */
function belongsTo(url: string, id: string): boolean {
  const base = KEY_ROOT + encodeURIComponent(id);
  return url.startsWith(base + "/") || url.startsWith(base + ".i16/");
}

/** Anota que empieza la descarga del volumen `id` y, si con él pasan de
    MAX_VOLUMES, borra las entradas de los más antiguos. */
export async function touchVolume(id: string): Promise<void> {
  const ids = [id, ...readLru().filter((x) => x !== id)];
  const evicted = ids.slice(MAX_VOLUMES);
  writeLru(ids.slice(0, MAX_VOLUMES));
  if (!evicted.length || !hasCaches()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const req of await cache.keys()) {
      if (evicted.some((old) => belongsTo(req.url, old))) await cache.delete(req);
    }
  } catch { /* sin caché no hay nada que desalojar */ }
}
