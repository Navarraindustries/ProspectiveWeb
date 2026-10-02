import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { HudLadder } from "./HudLadder";

describe("HudLadder interactiva", () => {
  beforeEach(() => {
    // jsdom no hace layout: se fija la altura de la escalera en 400 px.
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, height: 400, left: 0, right: 44, bottom: 400, width: 44, x: 0, y: 0, toJSON() {} } as DOMRect);
    (HTMLElement.prototype as any).setPointerCapture = vi.fn();
    (HTMLElement.prototype as any).releasePointerCapture = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("clic en la escalera salta al índice y arrastrar lo recorre", () => {
    const onIndexChange = vi.fn();
    const { container } = render(<HudLadder count={100} index={50} onIndexChange={onIndexChange} />);
    const el = container.firstChild as HTMLElement;
    fireEvent.pointerDown(el, { clientY: 200 + 80, button: 0, pointerId: 1 });
    expect(onIndexChange).toHaveBeenLastCalledWith(40);
    fireEvent.pointerMove(el, { clientY: 200 - 80, pointerId: 1 });
    expect(onIndexChange).toHaveBeenLastCalledWith(60);
    fireEvent.pointerUp(el, { pointerId: 1 });
    onIndexChange.mockClear();
    fireEvent.pointerMove(el, { clientY: 100, pointerId: 1 });
    expect(onIndexChange).not.toHaveBeenCalled();   // soltado: ya no sigue
  });
});
