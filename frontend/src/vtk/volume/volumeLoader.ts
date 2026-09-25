/* Descarga del volumen para el visor en el cliente.

   Primero el grueso (≤192³ uint8, 7 MB), que se usa en cuanto llega; después
   el completo en bloques de 32 cortes int16, por orden de cercanía al corte
   que se está mirando. Los bloques se guardan en la Cache API del navegador,
   de modo que reanudar o recargar no vuelve a bajar 100 MB. Todo se cancela
   con el AbortSignal de la sesión: un bloque de la sesión anterior nunca
   entra en el buffer de la nueva. */

import { api, authHeaders } from "../../api/client";
import type { VolumeMeta } from "../../api/types";

export const CHUNK_SLICES = 32;
// v2: las claves pasaron de la URL con el id de sesión a una por volumen; las
// entradas v1 no se volverían a leer nunca, así que se borran al abrir.
const CACHE_NAME = "prospective-volume-v2";
const OLD_CACHES = ["prospective-volume-v1"];

export interface ClientVolume {
  dims: [number, number, number];
  spacing: [number, number, number];
  data: Int16Array;
  level: "coarse" | "full";
  stride: number;
}

export function chunkOrder(nz: number, chunkSize: number, currentZ: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let z0 = 0; z0 < nz; z0 += chunkSize) ranges.push([z0, Math.min(nz, z0 + chunkSize)]);
  const dist = ([a, b]: [number, number]) =>
    currentZ < a ? a - currentZ : currentZ >= b ? currentZ - (b - 1) : 0;
  return ranges.sort((r1, r2) => dist(r1) - dist(r2) || r1[0] - r2[0]);
}

let oldCachesDropped = false;

async function cacheStorage(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined" || !caches) return null;
    if (!oldCachesDropped) {
      oldCachesDropped = true;
      for (const name of OLD_CACHES) void caches.delete?.(name)?.catch?.(() => {});
    }
    return await caches.open(CACHE_NAME);
  } catch {
    return null;   // contexto inseguro o almacenamiento bloqueado
  }
}

/** Clave de la Cache API para un bloque: depende del volumen (cache_key),
    nunca de la sesión. Reanudar copia el volumen bajo un id de sesión nuevo,
    así que con la URL real como clave cada reanudación era un fallo de caché.
    Cualquier URL absoluta vale como clave; esta no se pide nunca a la red. */
export function chunkCacheKey(cacheKey: string, level: "coarse" | "full", z0: number, z1: number): string {
  return `https://prospective.cache/volume/${encodeURIComponent(cacheKey)}/${level}/${z0}-${z1}`;
}

export async function fetchChunk(url: string, cacheKeyUrl: string, signal: AbortSignal) {
  const cache = await cacheStorage();
  let res = cache ? await cache.match(cacheKeyUrl) : undefined;
  if (!res) {
    res = await fetch(url, { headers: authHeaders(), signal });
    if (!res.ok) throw new Error(`Bloque ${url}: HTTP ${res.status}`);
    if (cache) {
      try { await cache.put(cacheKeyUrl, res.clone()); } catch { /* cuota llena: seguir sin caché */ }
    }
  }
  const dims = (res.headers.get("X-Dims") ?? "").split(",").map(Number);
  const spacing = (res.headers.get("X-Spacing") ?? "1,1,1").split(",").map(Number);
  return {
    bytes: await res.arrayBuffer(),
    dims,
    spacing,
    dtype: res.headers.get("X-Dtype") ?? "int16",
    stride: Number(res.headers.get("X-Level-Stride") ?? "1"),
  };
}

export async function loadCoarse(sid: string, meta: VolumeMeta, signal: AbortSignal): Promise<ClientVolume> {
  // El «.i16» en la versión de la URL: hasta ahora el grueso era uint8 bajo la
  // misma URL, y la Cache API y la caché HTTP (24 h) lo seguirían sirviendo;
  // con la URL nueva el cuerpo antiguo nunca llega a leerse como int16.
  const key = `${meta.cache_key}.i16`;
  const c = await fetchChunk(api.chunkUrl(sid, "coarse", 0, 0, key), chunkCacheKey(key, "coarse", 0, 0), signal);
  if (c.dims.length !== 3) throw new Error("El bloque grueso no trae dimensiones válidas");
  // Intensidades crudas como el nivel completo: la ventana/nivel y la banda
  // de umbral valen igual en los dos niveles.
  if (c.dtype !== "int16") throw new Error(`El bloque grueso llega como ${c.dtype}; se esperaba int16`);
  return {
    dims: [c.dims[0], c.dims[1], c.dims[2]],
    spacing: [c.spacing[0], c.spacing[1], c.spacing[2]],
    data: new Int16Array(c.bytes),
    level: "coarse",
    stride: c.stride,
  };
}

export async function loadFull(
  sid: string,
  meta: VolumeMeta,
  currentZ: number,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<ClientVolume> {
  const [nz, nyFull, nxFull] = meta.shape;
  const stride = Math.max(1, meta.full_stride || 1);
  const ny = Math.ceil(nyFull / stride), nx = Math.ceil(nxFull / stride);
  const data = new Int16Array(nz * ny * nx);
  const order = chunkOrder(nz, CHUNK_SLICES, currentZ);
  let done = 0;
  for (const [z0, z1] of order) {
    if (signal.aborted) throw new DOMException("Descarga cancelada", "AbortError");
    const c = await fetchChunk(
      api.chunkUrl(sid, "full", z0, z1, meta.cache_key),
      chunkCacheKey(meta.cache_key, "full", z0, z1),
      signal,
    );
    if (c.dims[0] !== z1 - z0 || c.dims[1] !== ny || c.dims[2] !== nx) {
      throw new Error(`El bloque ${z0}-${z1} trae dimensiones ${c.dims.join("×")}, se esperaban ${z1 - z0}×${ny}×${nx}`);
    }
    data.set(new Int16Array(c.bytes), z0 * ny * nx);
    onProgress(++done, order.length);
  }
  return {
    dims: [nz, ny, nx],
    spacing: [meta.spacing[0], meta.spacing[1] * stride, meta.spacing[2] * stride],
    data,
    level: "full",
    stride,
  };
}
