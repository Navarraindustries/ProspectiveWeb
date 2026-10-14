/* La transición de marca tras entrar dura lo mismo que antes de F2: 2,2 s a
   la vista y 0,45 s de fundido; luego avisa para que la raíz la desmonte. */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FADE_MS, LoadingScreen, SHOW_MS } from "./LoadingScreen";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("LoadingScreen", () => {
  it("muestra el vídeo de carga, el logotipo y el texto, y llama a onDone al acabar el fundido", () => {
    const onDone = vi.fn();
    const { container } = render(<LoadingScreen onDone={onDone} />);
    expect(container.querySelector('video[src="/media/loading.mp4"]')).not.toBeNull();
    expect(screen.getByText("PROSPECTIVE")).toBeInTheDocument();
    expect(screen.getByText("Preparando el espacio de trabajo…")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(SHOW_MS - 1); });
    expect(screen.getByRole("status")).toHaveStyle({ opacity: "1" });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("status")).toHaveStyle({ opacity: "0" });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(FADE_MS); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("dura lo mismo que antes de F2", () => {
    expect(SHOW_MS).toBe(2200);
    expect(FADE_MS).toBe(450);
  });

  it("al desmontarse antes de tiempo no llama a onDone", () => {
    const onDone = vi.fn();
    const { unmount } = render(<LoadingScreen onDone={onDone} />);
    unmount();
    act(() => { vi.advanceTimersByTime(SHOW_MS + FADE_MS + 100); });
    expect(onDone).not.toHaveBeenCalled();
  });
});
