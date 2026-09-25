import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkCacheKey, chunkOrder, fetchChunk, loadCoarse, loadFull } from "./volumeLoader";
import type { VolumeMeta } from "../../api/types";
import { setUnauthorizedHandler } from "../../api/client";

const meta = {
  shape: [70, 4, 3], spacing: [1, 1, 1], wc: 0, ww: 1, modality: "XA",
  direction: null, orientation_known: false, orientation_manual: null, origin_mm: [0, 0, 0],
  intensity_range: [0, 1], cache_key: "k1", full_stride: 1,
} as VolumeMeta;

describe("chunkOrder", () => {
  it("covers the volume exactly once, nearest chunk first", () => {
    const order = chunkOrder(70, 32, 40);
    expect(order[0]).toEqual([32, 64]);            // contiene el corte 40
    expect(order).toHaveLength(3);
    const covered = order.flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i));
    expect(covered.sort((a, b) => a - b)).toEqual(Array.from({ length: 70 }, (_, i) => i));
  });
  it("orders by distance to the current slice on both sides", () => {
    expect(chunkOrder(96, 32, 5)).toEqual([[0, 32], [32, 64], [64, 96]]);
    expect(chunkOrder(96, 32, 90)).toEqual([[64, 96], [32, 64], [0, 32]]);
  });
});

function chunkResponse(z0: number, z1: number, value: number, dims = [z1 - z0, 4, 3]) {
  const n = dims[0] * dims[1] * dims[2];
  const body = new Int16Array(n).fill(value);
  return new Response(body.buffer, {
    status: 200,
    headers: {
      "X-Dims": dims.join(","), "X-Spacing": "1,1,1", "X-Dtype": "int16", "X-Level-Stride": "1",
    },
  });
}

describe("loadCoarse", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the strided int16 volume with the stride from the headers", async () => {
    vi.stubGlobal("caches", undefined);
    const body = new Int16Array(3 * 4 * 3).map((_, i) => i * 100 - 500);
    const fetchMock = vi.fn(async (_url: string) => new Response(body.buffer, {
      status: 200,
      headers: { "X-Dims": "3,4,3", "X-Spacing": "2,2,2", "X-Dtype": "int16", "X-Level-Stride": "2" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    // 6×8×6 con stride 2 → 3×4×3: el grueso tiene que cuadrar con la meta.
    const vol = await loadCoarse("sid", { ...meta, shape: [6, 8, 6] }, new AbortController().signal);
    expect(vol.level).toBe("coarse");
    expect(vol.dims).toEqual([3, 4, 3]);
    expect(vol.spacing).toEqual([2, 2, 2]);                       // spacing nativo (1) × stride 2
    expect(vol.stride).toBe(2);
    expect(vol.data).toBeInstanceOf(Int16Array);
    expect(Array.from(vol.data.slice(0, 3))).toEqual([-500, -400, -300]);   // crudo, con signo
    expect(String(fetchMock.mock.calls[0][0])).toContain("chunk/coarse/0-0?v=k1.i16");
  });
});

describe("loadCoarse dims check", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a coarse block that does not belong to this volume", async () => {
    // Una clave antigua que sirviera otro volumen de otras dimensiones.
    vi.stubGlobal("caches", undefined);
    const body = new Int16Array(3 * 4 * 3);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body.buffer, {
      status: 200,
      headers: { "X-Dims": "3,4,3", "X-Spacing": "2,2,2", "X-Dtype": "int16", "X-Level-Stride": "2" },
    })));
    await expect(loadCoarse("sid", { ...meta, shape: [70, 4, 3] }, new AbortController().signal))
      .rejects.toThrow(/no corresponde al volumen/);
  });
});

describe("fetchChunk 401", () => {
  afterEach(() => { vi.unstubAllGlobals(); setUnauthorizedHandler(null); });

  it("drops the token and notifies the app like request() does", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    localStorage.setItem("prospective.token", "caducado");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await expect(fetchChunk("/api/volume/s/chunk/full/0-32", chunkCacheKey("k", "full", 0, 32), new AbortController().signal))
      .rejects.toThrow(/401/);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("prospective.token")).toBeNull();
  });
});

describe("loadFull", () => {
  beforeEach(() => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const m = /chunk\/full\/(\d+)-(\d+)/.exec(url)!;
      const z0 = Number(m[1]), z1 = Number(m[2]);
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return chunkResponse(z0, z1, z0);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("assembles the chunks into one int16 buffer in z order", async () => {
    const progress: number[] = [];
    const vol = await loadFull("sid", meta, 40, new AbortController().signal, (d) => progress.push(d));
    expect(vol.level).toBe("full");
    expect(vol.dims).toEqual([70, 4, 3]);
    const data = vol.data as Int16Array;
    expect(data[0]).toBe(0);                 // corte 0 viene del bloque [0,32) → valor 0
    expect(data[40 * 12]).toBe(32);          // corte 40 del bloque [32,64)
    expect(data[69 * 12]).toBe(64);
    expect(progress).toEqual([1, 2, 3]);
  });

  it("aborts previous download when session changes", async () => {
    const ctrl = new AbortController();
    const p = loadFull("sid-old", meta, 0, ctrl.signal, () => {});
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails loudly when a chunk has unexpected dims", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chunkResponse(0, 32, 1, [32, 9, 9])));
    await expect(loadFull("sid", meta, 0, new AbortController().signal, () => {}))
      .rejects.toThrow(/dimensiones/);
  });
});

describe("fetchChunk cache", () => {
  it("reads from the Cache API when present and stores a miss", async () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (url: string) => stored.get(url)?.clone()),
      put: vi.fn(async (url: string, res: Response) => { stored.set(url, res); }),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    const fetchMock = vi.fn(async () => chunkResponse(0, 32, 7));
    vi.stubGlobal("fetch", fetchMock);
    const key = chunkCacheKey("k1", "full", 0, 32);
    const a = await fetchChunk("/api/volume/s/chunk/full/0-32?v=k1", key, new AbortController().signal);
    const b = await fetchChunk("/api/volume/s/chunk/full/0-32?v=k1", key, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Int16Array(a.bytes)[0]).toBe(7);
    expect(new Int16Array(b.bytes)[0]).toBe(7);
    vi.unstubAllGlobals();
  });

  it("two session ids with the same cache_key hit the same entry", async () => {
    // Reanudar crea un id de sesión nuevo con el mismo volumen: la entrada de
    // caché tiene que ser la misma o se vuelven a bajar 100 MB.
    const stored = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (url: string) => stored.get(url)?.clone()),
      put: vi.fn(async (url: string, res: Response) => { stored.set(url, res); }),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    const fetchMock = vi.fn(async (url: string) => {
      const m = /chunk\/full\/(\d+)-(\d+)/.exec(url)!;
      return chunkResponse(Number(m[1]), Number(m[2]), 5);
    });
    vi.stubGlobal("fetch", fetchMock);
    await loadFull("sid-a", meta, 0, new AbortController().signal, () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const vol = await loadFull("sid-b", meta, 0, new AbortController().signal, () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);            // ninguna petición nueva
    expect(vol.data[0]).toBe(5);
    expect([...stored.keys()].every((k) => !k.includes("sid-"))).toBe(true);
    // Otro volumen (otra clave) no reutiliza las entradas.
    await loadFull("sid-b", { ...meta, cache_key: "k2" } as VolumeMeta, 0, new AbortController().signal, () => {});
    expect(fetchMock).toHaveBeenCalledTimes(6);
    vi.unstubAllGlobals();
  });

  it("keeps the coarse int16 key apart from the full chunks", () => {
    expect(chunkCacheKey("k1.i16", "coarse", 0, 0)).toBe("https://prospective.cache/volume/k1.i16/coarse/0-0");
    expect(chunkCacheKey("k1", "full", 32, 64)).toBe("https://prospective.cache/volume/k1/full/32-64");
  });
});
