import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SegmentProgress } from "./SegmentProgress";
import type { ProgressState } from "../../api/types";

const running = (phase: string, pct: number): ProgressState => ({ phase, pct, running: true, ok: null, message: "" });

describe("SegmentProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sin estado, muestra la fase por defecto en mayúsculas mono y 0 %", () => {
    render(<SegmentProgress state={null} />);
    // El estilo mono/mayúsculas va en el contenedor que envuelve fase y %, no
    // en el <span> de la fase por separado.
    expect(screen.getByText("preparando").parentElement).toHaveStyle({ textTransform: "uppercase", fontFamily: "var(--font-mono)" });
    expect(screen.getByText("0 %")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("con estado, muestra la fase, el porcentaje redondeado y la barra determinada", () => {
    render(<SegmentProgress state={running("tubularidad 2/6", 19.6)} />);
    expect(screen.getByText("tubularidad 2/6")).toBeInTheDocument();
    expect(screen.getByText("20 %")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "19.6");
  });

  it("bajo el 5 % tras 10 s, avisa que el servidor tarda; al pasar del 5 % deja de avisar", () => {
    const { rerender } = render(<SegmentProgress state={running("núcleo", 2)} />);
    expect(screen.queryByText(/Tarda varios minutos/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText(/Tarda varios minutos/)).toBeInTheDocument();
    rerender(<SegmentProgress state={running("núcleo", 10)} />);
    expect(screen.queryByText(/Tarda varios minutos/)).not.toBeInTheDocument();
  });

  it("no avisa antes de los 10 s", () => {
    render(<SegmentProgress state={running("núcleo", 1)} />);
    act(() => { vi.advanceTimersByTime(9_000); });
    expect(screen.queryByText(/Tarda varios minutos/)).not.toBeInTheDocument();
  });

  it("desmontar antes de los 10 s no deja temporizadores pendientes", () => {
    const { unmount } = render(<SegmentProgress state={running("núcleo", 1)} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
