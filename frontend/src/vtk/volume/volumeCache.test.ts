/* Los volúmenes del paciente en la Cache API: se borran al salir y no se
   acumulan más de tres. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_NAME, chunkCacheKey, clearVolumeCache, touchVolume } from "./volumeCache";

/** Cache API mínima en memoria: open/keys/delete sobre un Map por nombre. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = vi.fn(async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      keys: async () => [...m.keys()].map((url) => new Request(url)),
      delete: async (req: Request | string) => m.delete(typeof req === "string" ? req : req.url),
      put: async (url: string, res: Response) => { m.set(url, res); },
    };
  });
  const del = vi.fn(async (name: string) => stores.delete(name));
  return { stores, api: { open, delete: del } };
}

function seed(stores: Map<string, Map<string, Response>>, id: string) {
  if (!stores.has(CACHE_NAME)) stores.set(CACHE_NAME, new Map());
  const m = stores.get(CACHE_NAME)!;
  m.set(chunkCacheKey(`${id}.i16`, "coarse", 0, 0), new Response("c"));
  m.set(chunkCacheKey(id, "full", 0, 32), new Response("f0"));
  m.set(chunkCacheKey(id, "full", 32, 64), new Response("f1"));
}

describe("volume cache", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("clearVolumeCache deletes the cache and the LRU list", async () => {
    const { api } = fakeCaches();
    vi.stubGlobal("caches", api);
    await touchVolume("a");
    expect(localStorage.getItem("prospective-volume-lru")).not.toBeNull();
    await clearVolumeCache();
    expect(api.delete).toHaveBeenCalledWith(CACHE_NAME);
    expect(localStorage.getItem("prospective-volume-lru")).toBeNull();
  });

  it("clearVolumeCache tolerates a browser without the Cache API", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearVolumeCache()).resolves.toBeUndefined();
  });

  it("evicts the oldest volume's entries when a fourth one starts", async () => {
    const { stores, api } = fakeCaches();
    vi.stubGlobal("caches", api);
    for (const id of ["a", "b", "c"]) { seed(stores, id); await touchVolume(id); }
    expect(stores.get(CACHE_NAME)!.size).toBe(9);          // nada desalojado aún

    // Un id que empieza igual que otro («a» / «ab») no debe arrastrarlo.
    seed(stores, "ab");
    await touchVolume("ab");
    const left = [...stores.get(CACHE_NAME)!.keys()];
    expect(left.some((u) => u.includes("/volume/a/") || u.includes("/volume/a.i16/"))).toBe(false);
    for (const id of ["b", "c", "ab"]) {
      expect(left.filter((u) => u.includes(`/volume/${id}/`) || u.includes(`/volume/${id}.i16/`))).toHaveLength(3);
    }
    expect(JSON.parse(localStorage.getItem("prospective-volume-lru")!)).toEqual(["ab", "c", "b"]);
  });

  it("reusing a volume makes it the most recent", async () => {
    const { stores, api } = fakeCaches();
    vi.stubGlobal("caches", api);
    for (const id of ["a", "b", "c"]) { seed(stores, id); await touchVolume(id); }
    await touchVolume("a");                                   // se vuelve a abrir «a»
    seed(stores, "d");
    await touchVolume("d");                                   // sale «b», no «a»
    const left = [...stores.get(CACHE_NAME)!.keys()];
    expect(left.some((u) => u.includes("/volume/b/"))).toBe(false);
    expect(left.some((u) => u.includes("/volume/a/"))).toBe(true);
  });
});
