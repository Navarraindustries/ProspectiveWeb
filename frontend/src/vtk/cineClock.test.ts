import { describe, expect, it, vi } from "vitest";
import { startClock } from "./cineClock";

describe("startClock", () => {
  it("llama a tick a la cadencia y se para", () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const stop = startClock(10, tick);
    vi.advanceTimersByTime(350); expect(tick).toHaveBeenCalledTimes(3);
    stop(); vi.advanceTimersByTime(500); expect(tick).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
