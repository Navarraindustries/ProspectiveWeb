// frontend/src/vtk/ViewerGrid.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, setPreset, type PaneId, type ViewerLayout } from "./layout";
import { ViewerGrid } from "./ViewerGrid";

const renderPane = (id: PaneId) => <span data-testid={`pane-${id}`}>{id}</span>;

function setup(layout: ViewerLayout = DEFAULT_LAYOUT) {
  const onLayoutChange = vi.fn();
  const utils = render(<ViewerGrid layout={layout} onLayoutChange={onLayoutChange} renderPane={renderPane} />);
  const cell = (id: PaneId) => utils.container.querySelector<HTMLDivElement>(`[data-pane="${id}"]`)!;
  return { ...utils, onLayoutChange, cell };
}

describe("ViewerGrid", () => {
  it("coloca cada vista en su hueco y la principal en «main»", () => {
    const { cell } = setup();
    expect(cell("scene").style.gridArea).toBe("main");
    expect(cell("axial").style.gridArea).toBe("s0");
    expect(cell("mip").style.gridArea).toBe("s3");
  });

  it("al cambiar la distribución las celdas son los mismos nodos", () => {
    const { cell, rerender } = setup();
    const before = { scene: cell("scene"), mip: cell("mip") };
    rerender(<ViewerGrid layout={{ ...DEFAULT_LAYOUT, main: "mip", side: ["axial", "coronal", "sagital", "scene"] }}
                         onLayoutChange={vi.fn()} renderPane={renderPane} />);
    expect(cell("scene")).toBe(before.scene);
    expect(cell("mip")).toBe(before.mip);
    expect(cell("mip").style.gridArea).toBe("main");
    expect(cell("scene").style.gridArea).toBe("s3");
  });

  it("en «sola» las secundarias siguen montadas pero ocultas", () => {
    const { cell } = setup(setPreset(DEFAULT_LAYOUT, "sola"));
    expect(screen.getByTestId("pane-axial")).toBeInTheDocument();
    expect(cell("axial").className).toContain("viewer-cell--hidden");
    expect(cell("scene").className).not.toContain("viewer-cell--hidden");
    expect(screen.queryByTestId("splitter")).toBeNull();
  });

  it("doble clic en una secundaria la sube a principal", () => {
    const { cell, onLayoutChange } = setup();
    fireEvent.doubleClick(cell("coronal"));
    expect(onLayoutChange).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, main: "coronal", side: ["axial", "scene", "sagital", "mip"] });
  });

  it("cada celda secundaria tiene el botón de maximizar y la principal no", () => {
    const { cell, onLayoutChange } = setup();
    expect(cell("scene").querySelector(".viewer-maximize")).toBeNull();
    const btn = cell("coronal").querySelector<HTMLButtonElement>(".viewer-maximize")!;
    expect(btn.getAttribute("aria-label")).toBe("Hacer principal: COR");
    fireEvent.click(btn);
    expect(onLayoutChange).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, main: "coronal", side: ["axial", "scene", "sagital", "mip"] });
  });

  it("tras «⤢» el foco queda en la celda subida (su envoltorio) o en la rejilla", async () => {
    // Una celda con envoltorio enfocable, como las de corte; la escena 3D no lo tiene.
    const withWrapper = (id: PaneId) => (id === "scene" ? <span>3d</span> : <div tabIndex={0} data-testid={`wrap-${id}`}>{id}</div>);
    const onLayoutChange = vi.fn();
    const { container } = render(<ViewerGrid layout={{ ...DEFAULT_LAYOUT, main: "axial", side: ["scene", "coronal", "sagital", "mip"] }}
                                             onLayoutChange={onLayoutChange} renderPane={withWrapper} />);
    const btn = (id: PaneId) => container.querySelector<HTMLButtonElement>(`[data-pane="${id}"] .viewer-maximize`)!;
    btn("coronal").focus();
    fireEvent.click(btn("coronal"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(screen.getByTestId("wrap-coronal"));
    // Sin envoltorio (3D): la rejilla, para que Alt+N siga llegando al visor.
    fireEvent.click(btn("scene"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(container.firstChild);
  });

  it("las celdas ocultas son inertes: Tab no entra en ellas", () => {
    const { cell } = setup(setPreset(DEFAULT_LAYOUT, "sola"));
    // jsdom no implementa la propiedad `inert`: se mira el atributo que pone React.
    expect(cell("axial").hasAttribute("inert")).toBe(true);
    expect(cell("scene").hasAttribute("inert")).toBe(false);
  });

  it("el botón de maximizar no inicia un arrastre ni cuenta como doble clic del asa", () => {
    const { cell, onLayoutChange } = setup();
    const btn = cell("mip").querySelector<HTMLButtonElement>(".viewer-maximize")!;
    fireEvent.pointerDown(btn, { button: 0, clientX: 5, clientY: 5, pointerId: 9 });
    fireEvent.pointerMove(btn, { clientX: 60, clientY: 5, pointerId: 9 });
    fireEvent.pointerUp(btn, { clientX: 60, clientY: 5, pointerId: 9 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });

  it("arrastrar el asa de una vista sobre otra las intercambia; un arrastre corto no", () => {
    const { container, cell, onLayoutChange } = setup();
    const handle = cell("axial").querySelector<HTMLDivElement>(".viewer-handle")!;
    // elementFromPoint no existe en jsdom: se simula el destino.
    const target = cell("mip");
    let hit: Element = target;
    vi.spyOn(document, "elementFromPoint").mockImplementation(() => hit);
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 13, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 13, clientY: 10, pointerId: 1 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    // Activo pero aún sobre sí misma: ninguna celda se resalta.
    hit = cell("axial");
    fireEvent.pointerMove(handle, { clientX: 40, clientY: 10, pointerId: 1 });
    expect(container.querySelector(".viewer-cell--over")).toBeNull();
    hit = target;
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(target.className).toContain("viewer-cell--over");
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(onLayoutChange).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, side: ["mip", "coronal", "sagital", "axial"] });
    expect(container.querySelector(".viewer-cell--over")).toBeNull();
  });

  it("Escape cancela el arrastre sin intercambiar ni dejar resalte", () => {
    const { container, cell, onLayoutChange } = setup();
    const handle = cell("axial").querySelector<HTMLDivElement>(".viewer-handle")!;
    vi.spyOn(document, "elementFromPoint").mockImplementation(() => cell("mip"));
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.keyDown(container.firstChild as Element, { key: "Escape" });
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(container.querySelector(".viewer-cell--over")).toBeNull();
  });

  it("pointercancel cancela el arrastre en lugar de soltarlo", () => {
    const { container, cell, onLayoutChange } = setup();
    const handle = cell("axial").querySelector<HTMLDivElement>(".viewer-handle")!;
    vi.spyOn(document, "elementFromPoint").mockImplementation(() => cell("mip"));
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(container.querySelector(".viewer-cell--over")).toBeNull();
  });

  it("el doble clic que remata un intercambio no sube además la vista", () => {
    const { cell, onLayoutChange } = setup();
    const handle = cell("axial").querySelector<HTMLDivElement>(".viewer-handle")!;
    vi.spyOn(document, "elementFromPoint").mockImplementation(() => cell("mip"));
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.doubleClick(handle);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });

  it("el separador cambia la fracción acotada y el doble clic la devuelve al defecto", () => {
    const { container, onLayoutChange } = setup({ ...DEFAULT_LAYOUT, mainFraction: 0.6 });
    const grid = container.firstChild as HTMLDivElement;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
    const splitter = screen.getByTestId("splitter");
    fireEvent.pointerDown(splitter, { button: 0, clientX: 600, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(splitter, { clientX: 800, clientY: 0, pointerId: 2 });
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...DEFAULT_LAYOUT, mainFraction: 0.8 });
    fireEvent.pointerMove(splitter, { clientX: 990, clientY: 0, pointerId: 2 });
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...DEFAULT_LAYOUT, mainFraction: 0.85 });
    fireEvent.pointerUp(splitter, { pointerId: 2 });
    fireEvent.doubleClick(splitter);
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...DEFAULT_LAYOUT, mainFraction: 0.72 });
  });
});
