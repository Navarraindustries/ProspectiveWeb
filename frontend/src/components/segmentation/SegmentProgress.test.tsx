import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SegmentProgress } from "./SegmentProgress";
import type { ProgressState } from "../../api/types";

const running = (phase: string, pct: number): ProgressState => ({ phase, pct, running: true, ok: null, message: "" });

describe("SegmentProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sin estado, la fase por defecto es «preparando» y el porcentaje es 0 %", () => {
    render(<SegmentProgress state={null} />);
    expect(screen.getByText("preparando")).toBeVisible();
    expect(screen.getByText("0 %")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("con estado, muestra la fase, el porcentaje redondeado y la barra determinada", () => {
    render(<SegmentProgress state={running("tubularidad 2/6", 19.6)} />);
    expect(screen.getByText("tubularidad 2/6")).toBeInTheDocument();
    expect(screen.getByText("tubularidad 2/6").closest("ol")).not.toBeNull();
    expect(screen.getByText("20 %")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "19.6");
  });

  it("bajo el 5 % tras 10 s, avisa que el servidor tarda; al pasar del 5 % deja de avisar", () => {
    const { rerender } = render(<SegmentProgress state={running("carga", 2)} />);
    expect(screen.queryByText(/El servidor tarda/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText(/El servidor tarda/)).toBeInTheDocument();
    // En «carga» (o con el umbral clásico) no hay tubularidad que culpar.
    expect(screen.queryByText(/tubularidad/)).not.toBeInTheDocument();
    expect(screen.getByText(/El servidor tarda/)).toBeVisible();
    rerender(<SegmentProgress state={running("núcleo", 10)} />);
    expect(screen.queryByText(/El servidor tarda/)).not.toBeInTheDocument();
  });

  it("no avisa antes de los 10 s", () => {
    render(<SegmentProgress state={running("núcleo", 1)} />);
    act(() => { vi.advanceTimersByTime(9_000); });
    expect(screen.queryByText(/El servidor tarda/)).not.toBeInTheDocument();
  });

  it("desmontar antes de los 10 s no deja temporizadores pendientes", () => {
    const { unmount } = render(<SegmentProgress state={running("núcleo", 1)} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/* F1-136: el rótulo era el nombre interno de la fase («TUBULARIDAD 3/6»),
   que no dice nada a quien espera; las fases van en una lista. */
describe("rótulo principal", () => {
  it("el rótulo principal no es la fase", () => {
    render(<SegmentProgress state={running("tubularidad 3/6", 25)} />);
    const rotulo = screen.getByText("Segmentando… suele tardar menos de un minuto");
    expect(rotulo).toBeVisible();
    expect(rotulo.closest("[aria-live]")).not.toBeNull();
    expect(screen.getByText("25 %")).toBeVisible();
    // El porcentaje no es región viva: cada punto se anunciaría.
    expect(screen.getByText("25 %").closest("[aria-live]")).toBeNull();
    expect(screen.getByText("tubularidad 3/6")).toBeVisible();
    expect(screen.getByText("tubularidad 3/6").closest("[aria-live]")).toBeNull();
    expect(screen.queryByText("Fases")).toBeNull();
  });
});

describe("rótulo de otro paso", () => {
  it("usa el rótulo que se le pasa en lugar del de la segmentación", () => {
    render(<SegmentProgress state={running("regiones", 50)} headline="Detectando… suele tardar alrededor de un minuto" />);
    expect(screen.getByText("Detectando… suele tardar alrededor de un minuto")).toBeVisible();
    expect(screen.queryByText(/Segmentando/)).toBeNull();
  });
});

describe("lista de fases y tiempo estimado", () => {
  it("acumula las fases vistas: la actual con punto y las anteriores con marca y su mensaje", () => {
    const { rerender } = render(<SegmentProgress state={{ phase: "umbral", pct: 10, running: true, ok: true, message: "umbral 150–500" }} />);
    rerender(<SegmentProgress state={{ phase: "tubularidad", pct: 40, running: true, ok: true, message: "" }} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining("umbral"), expect.stringContaining("tubularidad")]);
    expect(items[0].querySelector("svg")).not.toBeNull();
    expect(items[0]).toHaveTextContent("umbral 150–500");
  });
  it("estima el tiempo restante a partir del porcentaje y el tiempo transcurrido", () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const { rerender } = render(<SegmentProgress state={{ phase: "a", pct: 1, running: true, ok: true, message: "" }} />);
    vi.setSystemTime(10_000);
    rerender(<SegmentProgress state={{ phase: "a", pct: 25, running: true, ok: true, message: "" }} />);
    expect(screen.getByText(/≈ 30 s restantes/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
