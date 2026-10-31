import { expect, it, vi } from "vitest";
import { conTransicion } from "./viewTransition";

it("sin startViewTransition llama directamente", () => { let n = 0; conTransicion(() => { n++; }); expect(n).toBe(1); });
it("con startViewTransition lo usa", () => {
  const start = vi.fn((cb: () => void) => { cb(); return {} as ViewTransition; });
  (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
  let n = 0; conTransicion(() => { n++; });
  expect(start).toHaveBeenCalledTimes(1); expect(n).toBe(1);
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});
