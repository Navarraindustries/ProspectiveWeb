import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../api/types";

// vtk.js no corre en jsdom (sin WebGL): cualquier llamada devuelve otro falso.
vi.mock("@kitware/vtk.js/Rendering/Profiles/Volume", () => ({}));
const falso = vi.hoisted(() => {
  const crea = (): unknown => new Proxy(function () { /* falso */ }, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : crea()),
    apply: () => crea(),
  });
  return crea;
});
vi.mock("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow", () => ({ default: { newInstance: () => falso() } }));
vi.mock("@kitware/vtk.js/Rendering/Core/ImageResliceMapper", () => ({ default: { newInstance: () => falso() } }));
vi.mock("@kitware/vtk.js/Rendering/Core/ImageSlice", () => ({ default: { newInstance: () => falso() } }));
vi.mock("@kitware/vtk.js/Common/DataModel/Plane", () => ({ default: { newInstance: () => falso() } }));

// La vista solo lee el plano y el crosshair, y escribe el plano.
const setFreePlane = vi.hoisted(() => vi.fn());
vi.mock("../store/planning", () => ({
  usePlanning: () => ({
    mprVoxel: { x: 50, y: 50, z: 25 },
    freePlane: { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 },
    setFreePlane,
  }),
}));

const { ObliqueView } = await import("./ObliqueView");

const meta = {
  shape: [50, 100, 100], spacing: [1, 1, 1], wc: 300, ww: 600, modality: "CT", direction: null,
  orientation_known: false, origin_mm: [0, 0, 0], intensity_range: [0, 1000], cache_key: "k", full_stride: 1,
  orientation_manual: null,
} as unknown as VolumeMeta;

const vista = (compact?: boolean) => render(
  <ObliqueView image={falso() as vtkImageData} meta={meta} wc={300} ww={600} onWindowLevel={vi.fn()} compact={compact}
    walk={{ mode: "plano", index: 0, count: 10, diameterMm: 3 }} onWalkChange={vi.fn()} />,
);

afterEach(() => { cleanup(); setFreePlane.mockClear(); });

describe("Oblicuo en celda compacta (UNI-82)", () => {
  it("fuera de una celda compacta enseña la tira entera", () => {
    vista();
    expect(screen.getByRole("slider", { name: "Azimut" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Elevación" })).toBeTruthy();
    expect(screen.getByText("RECORRIDO ▸")).toBeTruthy();
    expect(screen.getByText("ENCUADRAR")).toBeTruthy();
  });

  it("en compacto la fila se queda en ENCUADRAR y AL PUNTO", () => {
    vista(true);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("RECORRIDO ▸")).toBeNull();
    expect(screen.getByText("ENCUADRAR")).toBeTruthy();
    expect(screen.getByText("AL PUNTO")).toBeTruthy();
  });

  it("en compacto el arrastre con el botón derecho sigue orientando el plano", () => {
    const { container } = vista(true);
    const lienzo = container.querySelector<HTMLElement>('[title^="Arrastrar"]')!;
    lienzo.setPointerCapture = vi.fn();
    lienzo.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(lienzo, { button: 2, buttons: 2, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { buttons: 2, clientX: 60, clientY: 10, pointerId: 1 });
    expect(setFreePlane).toHaveBeenCalled();
    expect(setFreePlane.mock.lastCall?.[0].azimuthDeg).not.toBe(0);
  });
});
