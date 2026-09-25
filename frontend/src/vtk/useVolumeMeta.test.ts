/* La meta es la que decide qué volumen pinta el visor: si no se vuelve a pedir
   tras cambiar de serie o preprocesar, las celdas siguen con el volumen viejo. */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { VolumeMeta } from "../api/types";
import { useVolumeMeta } from "./useVolumeMeta";

const metaWith = (cache_key: string) => ({ cache_key, shape: [4, 4, 4] }) as unknown as VolumeMeta;

afterEach(() => vi.restoreAllMocks());

describe("useVolumeMeta", () => {
  it("refetches the meta when the volume version changes within the session", async () => {
    const spy = vi.spyOn(api, "volumeMeta")
      .mockResolvedValueOnce(metaWith("serie-a"))
      .mockResolvedValueOnce(metaWith("serie-b"));
    const { result, rerender } = renderHook(({ v }) => useVolumeMeta("s1", v), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.meta?.cache_key).toBe("serie-a"));
    expect(result.current.forSession).toBe("s1");

    rerender({ v: 1 });
    await waitFor(() => expect(result.current.meta?.cache_key).toBe("serie-b"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.forSession).toBe("s1");
  });

  it("does not refetch when nothing changed", async () => {
    const spy = vi.spyOn(api, "volumeMeta").mockResolvedValue(metaWith("x"));
    const { result, rerender } = renderHook(({ v }) => useVolumeMeta("s1", v), { initialProps: { v: 3 } });
    await waitFor(() => expect(result.current.meta).not.toBeNull());
    rerender({ v: 3 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
