import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";
import type { Vec3 } from "./geometry";

// vtk.js no corre en jsdom (sin WebGL). La cámara y el mapper falsos dejan la
// imagen exactamente en un rectángulo de 200 × 200 px en la esquina de una
// celda de 200 × 200: parallelScale 100 → 1 mm/px, corte de 200 mm centrado
// en el foco.
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

const meta = {
  shape: [101, 201, 301], spacing: [1, 0.5, 0.25], wc: 40, ww: 400, modality: "CT",
  direction: null, orientation_known: true, origin_mm: [0, 0, 0], intensity_range: [0, 1000],
  cache_key: "k", full_stride: 1, orientation_manual: null,
} as unknown as VolumeMeta;
const image = { getDimensions: () => [301, 201, 101], getBounds: () => [0, 75, 0, 100, 0, 100] } as unknown as vtkImageData;

let restore: (() => void)[] = [];
beforeAll(() => {
  restore = [
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200),
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200),
  ].map((s) => () => s.mockRestore());
});
afterAll(() => restore.forEach((r) => r()));

function mount(extra: Record<string, unknown> = {}) {
  const props = {
    image, meta, plane: "axial" as const, index: 10, onIndexChange: vi.fn(),
    wc: 40, ww: 400, onWindowLevel: vi.fn(), crosshair: null, onPlaneClick: vi.fn(),
    orientation: { direction: null, manual: null },
    onPlaneClickMm: vi.fn(), onAnnotationKey: vi.fn(),
    ...extra,
  };
  const { container } = render(<SliceView {...props} />);
  return { props, el: container.firstElementChild as HTMLElement };
}
const click = (el: HTMLElement, x: number, y: number) => {
  fireEvent.mouseDown(el, { button: 0, clientX: x, clientY: y });
  fireEvent.mouseUp(el, { button: 0, clientX: x, clientY: y });
};

describe("SliceView en modo anotación", () => {
  it("en modo anotación el clic reporta mm subvóxel y no mueve el crosshair", () => {
    const { props, el } = mount({ annotationMode: true, annotationKind: "regla" });
    click(el, 50, 100);
    expect(props.onPlaneClick).not.toHaveBeenCalled();
    expect(props.onPlaneClickMm).toHaveBeenCalledTimes(1);
    const [p, px] = props.onPlaneClickMm.mock.calls[0];
    expect(p[0]).toBeCloseTo(0.25 * 300 * 0.25, 6);   // u = 0,25 → x = 75 vóxeles × 0,25 mm
    expect(p[1]).toBeCloseTo(0.5 * 200 * 0.5, 6);
    expect(p[2]).toBe(10);
    expect(px).toEqual({ x: 50, y: 100 });
  });

  it("sin modo anotación el clic centra como siempre", () => {
    const { props, el } = mount();
    click(el, 50, 100);
    expect(props.onPlaneClickMm).not.toHaveBeenCalled();
    expect(props.onPlaneClick).toHaveBeenCalledWith(0.25, 0.5);
  });

  it("Intro, Retroceso y Esc llegan a onAnnotationKey solo en modo anotación", () => {
    const armed = mount({ annotationMode: true, annotationKind: "region" });
    for (const key of ["Enter", "Backspace", "Escape"]) fireEvent.keyDown(armed.el, { key });
    expect(armed.props.onAnnotationKey.mock.calls.map((c) => c[0])).toEqual(["Enter", "Backspace", "Escape"]);
    // Las flechas siguen moviendo el corte.
    fireEvent.keyDown(armed.el, { key: "ArrowUp" });
    expect(armed.props.onIndexChange).toHaveBeenCalledWith(11);

    const idle = mount();
    for (const key of ["Enter", "Backspace", "Escape"]) fireEvent.keyDown(idle.el, { key });
    expect(idle.props.onAnnotationKey).not.toHaveBeenCalled();
  });

  it("la región se cierra con un clic junto a su primer punto, o con doble clic", () => {
    // Puntos en mm del corte axial 10 (x = u·75, y = v·100): en px, (20, 20), (100, 20), (100, 100).
    const px = (x: number, y: number): Vec3 => [(x / 200) * 75, (y / 200) * 100, 10];
    const draft = [px(20, 20), px(100, 20), px(100, 100)];
    const { props, el } = mount({ annotationMode: true, annotationKind: "region", annotationDraft: draft });
    click(el, 24, 25);
    expect(props.onAnnotationKey).toHaveBeenCalledWith("Enter");
    expect(props.onPlaneClickMm).not.toHaveBeenCalled();

    click(el, 150, 150);
    expect(props.onPlaneClickMm).toHaveBeenCalledTimes(1);
    // El segundo clic de un doble clic cae sobre el último punto: no añade un duplicado.
    click(el, 101, 102);
    expect(props.onPlaneClickMm).toHaveBeenCalledTimes(1);

    props.onAnnotationKey.mockClear();
    fireEvent.doubleClick(el, { clientX: 150, clientY: 150 });
    expect(props.onAnnotationKey).toHaveBeenCalledWith("Enter");
  });

  it("en modo anotación el doble clic no llega a la rejilla (que maximizaría la celda)", () => {
    const onGrid = vi.fn();
    const base = {
      image, meta, plane: "axial" as const, index: 10, onIndexChange: vi.fn(),
      wc: 40, ww: 400, onWindowLevel: vi.fn(), crosshair: null, onPlaneClick: vi.fn(),
      orientation: { direction: null, manual: null }, onPlaneClickMm: vi.fn(), onAnnotationKey: vi.fn(),
    };
    const { container, rerender } = render(
      <div onDoubleClick={onGrid}><SliceView {...base} annotationMode annotationKind="regla" /></div>,
    );
    const view = container.firstElementChild!.firstElementChild as HTMLElement;
    fireEvent.doubleClick(view, { clientX: 50, clientY: 50 });
    expect(onGrid).not.toHaveBeenCalled();
    expect(view.title).toContain("Clic: punto");

    // Sin modo anotación sigue llegando, como siempre.
    rerender(<div onDoubleClick={onGrid}><SliceView {...base} /></div>);
    fireEvent.doubleClick(view, { clientX: 50, clientY: 50 });
    expect(onGrid).toHaveBeenCalledTimes(1);
    expect(view.title).toContain("Clic: centrar");
  });

  it("una regla junto a su primer punto no se cierra como región", () => {
    const { props, el } = mount({ annotationMode: true, annotationKind: "regla", annotationDraft: [[7.5, 10, 10]] });
    click(el, 20, 20);
    expect(props.onPlaneClickMm).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(el, { clientX: 20, clientY: 20 });
    expect(props.onAnnotationKey).not.toHaveBeenCalled();
  });
});
