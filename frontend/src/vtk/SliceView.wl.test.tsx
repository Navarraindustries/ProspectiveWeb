import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import { windowPresets } from "./windowPresets";

// vtk.js no corre en jsdom (sin WebGL): los mismos falsos que
// SliceView.anotaciones.test.tsx, con la imagen llenando la celda de 200 × 200.
vi.mock("@kitware/vtk.js/Rendering/Profiles/Volume", () => ({}));
vi.mock("@kitware/vtk.js/Rendering/Core/ImageMapper/Constants", () => ({ SlicingMode: { I: 0, J: 1, K: 2 } }));
vi.mock("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow", () => {
  const cam = {
    setParallelProjection() {}, setFocalPoint() {}, setPosition() {}, setViewUp() {}, setParallelScale() {},
    getParallelScale: () => 100, getFocalPoint: () => [100, 100, 0], getPosition: () => [100, 100, -1000],
  };
  const renderer = { addActor() {}, getActiveCamera: () => cam, resetCameraClippingRange() {} };
  return {
    default: {
      newInstance: () => ({
        setContainer() {}, resize() {}, delete() {},
        getRenderer: () => renderer, getRenderWindow: () => ({ render() {} }),
        getInteractor: () => ({ unbindEvents() {} }),
      }),
    },
  };
});
vi.mock("@kitware/vtk.js/Rendering/Core/ImageMapper", () => ({
  default: {
    newInstance: () => ({
      setInputData() {}, setSlicingMode() {}, setSlice() {},
      getBoundsForSlice: () => [0, 200, 0, 200, 0, 0],
    }),
  },
}));
vi.mock("@kitware/vtk.js/Rendering/Core/ImageSlice", () => ({
  default: {
    newInstance: () => ({
      setMapper() {}, setVisibility() {},
      getProperty: () => ({ setInterpolationTypeToLinear() {}, setColorWindow() {}, setColorLevel() {} }),
    }),
  },
}));
vi.mock("@kitware/vtk.js/Rendering/Core/ColorTransferFunction", () => ({ default: { newInstance: () => ({}) } }));
vi.mock("@kitware/vtk.js/Common/DataModel/PiecewiseFunction", () => ({ default: { newInstance: () => ({}) } }));

const { SliceView } = await import("./SliceView");

const metaOf = (modality: string) => ({
  shape: [101, 201, 301], spacing: [1, 0.5, 0.25], wc: 40, ww: 400, modality,
  direction: null, orientation_known: true, origin_mm: [0, 0, 0], intensity_range: [0, 1000],
  cache_key: "k", full_stride: 1, orientation_manual: null,
}) as unknown as VolumeMeta;
const image = { getDimensions: () => [301, 201, 101], getBounds: () => [0, 75, 0, 100, 0, 100] } as unknown as vtkImageData;

let restore: (() => void)[] = [];
beforeAll(() => {
  restore = [
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200),
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200),
  ].map((s) => () => s.mockRestore());
});
afterAll(() => restore.forEach((r) => r()));

function mount(extra: Record<string, unknown> = {}, modality = "CT") {
  const onGrid = vi.fn();
  const props = {
    image, meta: metaOf(modality), plane: "axial" as const, index: 10, onIndexChange: vi.fn(),
    wc: 40, ww: 400, onWindowLevel: vi.fn(), crosshair: null, onPlaneClick: vi.fn(),
    orientation: { direction: null, manual: null }, onWindowLevelReset: vi.fn(),
    ...extra,
  };
  const { container } = render(<div onDoubleClick={onGrid}><SliceView {...props} /></div>);
  const readout = container.querySelector(".hud-readout.br") as HTMLElement;
  return { props, onGrid, container, readout };
}

describe("SliceView · ventana y nivel", () => {
  it("la lectura W/L dice HU en TC y nada en XA", () => {
    expect(mount({}, "CT").readout.textContent).toBe("W 400 HU  L 40 HU");
    expect(mount({}, "XA").readout.textContent).toBe("W 400  L 40");
  });

  it("es un botón que explica el gesto y restablece con doble clic sin tocar corte ni crosshair", () => {
    const { props, onGrid, readout } = mount();
    expect(readout.tagName).toBe("BUTTON");
    expect(readout.title).toBe("Ventana y nivel · arrastrar en la imagen los cambia · doble clic restablece");
    // Un doble clic real llega precedido de dos pulsaciones: ninguna puede
    // centrar el crosshair ni empezar un arrastre de W/L.
    for (let i = 0; i < 2; i++) {
      fireEvent.mouseDown(readout, { button: 0, clientX: 180, clientY: 180 });
      fireEvent.mouseUp(readout, { button: 0, clientX: 180, clientY: 180 });
    }
    fireEvent.doubleClick(readout, { clientX: 180, clientY: 180 });
    expect(props.onWindowLevelReset).toHaveBeenCalledTimes(1);
    expect(props.onPlaneClick).not.toHaveBeenCalled();
    expect(props.onIndexChange).not.toHaveBeenCalled();
    expect(props.onWindowLevel).not.toHaveBeenCalled();
    // Ni promueve la celda en la rejilla.
    expect(onGrid).not.toHaveBeenCalled();
  });

  it("un arrastre de W/L soltado sobre la lectura acaba ahí", () => {
    const { props, container, readout } = mount();
    const cell = container.querySelector("[tabindex='0']") as HTMLElement;
    fireEvent.mouseDown(cell, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(readout, { button: 0, clientX: 180, clientY: 180 });
    fireEvent.mouseMove(cell, { clientX: 140, clientY: 60 });
    expect(props.onWindowLevel).not.toHaveBeenCalled();
    expect(props.onPlaneClick).not.toHaveBeenCalled();
  });

  it("en la celda compacta la lectura sigue, en forma corta y sin selector", () => {
    const { readout, container } = mount({ compact: true, presets: windowPresets(metaOf("CT"), null), onPreset: vi.fn() });
    expect(readout.textContent).toBe("W 400 L 40");
    expect(container.querySelector("select.hud-wl-presets")).toBeNull();
  });

  it("el selector de preajustes está en la celda no compacta y emite el preajuste", () => {
    const presets = windowPresets(metaOf("XA"), [100, 500]);
    const onPreset = vi.fn();
    const { container, onGrid } = mount({ presets, onPreset }, "XA");
    const select = container.querySelector("select.hud-wl-presets") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(Array.from(select.options).map((o) => o.textContent)).toContain("Restablecer");
    fireEvent.change(select, { target: { value: "Vasos" } });
    expect(onPreset).toHaveBeenCalledWith(presets.find((p) => p.name === "Vasos"));
    fireEvent.change(select, { target: { value: "Restablecer" } });
    expect(onPreset).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Restablecer", reset: true }));
    fireEvent.doubleClick(select);
    expect(onGrid).not.toHaveBeenCalled();
  });
});
