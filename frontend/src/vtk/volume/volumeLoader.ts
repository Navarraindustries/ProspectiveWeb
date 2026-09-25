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
const CACHE_NAME = "prospective-volume-v1";

export interface ClientVolume {
  dims: [number, number, number];
  spacing: [number, number, number];
  data: Int16Array | Uint8Array;
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

async function cacheStorage(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined" || !caches) return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;   // contexto inseguro o almacenamiento bloqueado
  }
}

export async function fetchChunk(url: string, signal: AbortSignal) {
  const cache = await cacheStorage();
  let res = cache ? await cache.match(url) : undefined;
  if (!res) {
    res = await fetch(url, { headers: authHeaders(), signal });
    if (!res.ok) throw new Error(`Bloque ${url}: HTTP ${res.status}`);
    if (cache) {
      try { await cache.put(url, res.clone()); } catch { /* cuota llena: seguir sin caché */ }
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
  const c = await fetchChunk(api.chunkUrl(sid, "coarse", 0, 0, meta.cache_key), signal);
  if (c.dims.length !== 3) throw new Error("El bloque grueso no trae dimensiones válidas");
  return {
    dims: [c.dims[0], c.dims[1], c.dims[2]],
    spacing: [c.spacing[0], c.spacing[1], c.spacing[2]],
    data: new Uint8Array(c.bytes),
    level: "coarse",
    stride: Math.round(c.spacing[2] / meta.spacing[2]) || 1,
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
    const c = await fetchChunk(api.chunkUrl(sid, "full", z0, z1, meta.cache_key), signal);
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
