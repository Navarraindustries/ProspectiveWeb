// frontend/src/vtk/ViewerHeader.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, promote, setPreset, type ViewerLayout } from "./layout";
import { ViewerHeader, type ViewerHeaderProps } from "./ViewerHeader";

function setup(over: Partial<ViewerHeaderProps> = {}) {
  const props: ViewerHeaderProps = {
    layout: DEFAULT_LAYOUT,
    onLayoutChange: vi.fn(),
    onKeyDown: vi.fn(),
    planesHidden: false, onPlanesHiddenChange: vi.fn(),
    decorHidden: false, onDecorHiddenChange: vi.fn(),
    syncViews: true, onSyncViewsChange: vi.fn(),
    hasClipField: false, showClipField: false, clipRehearsal: false, onShowClipFieldChange: vi.fn(),
    ...over,
  };
  return { ...render(<ViewerHeader {...props} />), props };
}

/** Simula el ancho de la banda: jsdom no maqueta, así que se fija clientWidth
 *  y se sustituye ResizeObserver por uno que se puede disparar a mano. */
function stubBandWidth(width: number) {
  const observers: (() => void)[] = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(cb: () => void) { observers.push(cb); }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  return observers;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ViewerHeader — selector PRINCIPAL", () => {
  it("marca como activa la vista que es principal en la distribución", () => {
    const layout: ViewerLayout = promote(DEFAULT_LAYOUT, "coronal");
    setup({ layout });
    expect(screen.getByRole("button", { name: /^\[ COR \]$/ })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["3D", "AX", "SAG", "VOL"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`) })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("al pulsar AX sube el axial a principal con promote", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^AX$/ }));
    expect(props.onLayoutChange).toHaveBeenCalledWith(promote(DEFAULT_LAYOUT, "axial"));
  });

  it("los presets cambian la distribución con setPreset", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: /SOLA/ }));
    expect(props.onLayoutChange).toHaveBeenCalledWith(setPreset(DEFAULT_LAYOUT, "sola"));
  });
});

describe("ViewerHeader — ancho de la banda", () => {
  it("con sitio rotula PRINCIPAL y los presets enteros", () => {
    stubBandWidth(1200);
    setup();
    expect(screen.getByTitle("Vista principal").textContent).toBe("PRINCIPAL");
    expect(screen.getByRole("button", { name: /DERECHA/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ABAJO/ })).toBeInTheDocument();
  });

  it("estrecha (< 800 px) muestra «▸» y DER · ABA · SOLA", () => {
    stubBandWidth(700);
    setup();
    expect(screen.getByTitle("Vista principal").textContent).toBe("▸");
    for (const label of ["DER", "ABA", "SOLA"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^(\\[ )?${label}( \\])?$`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /DERECHA/ })).toBeNull();
  });
});

describe("ViewerHeader — conmutadores y teclas", () => {
  it("PLANOS, REGLAS y SINCRO avisan con el valor contrario", () => {
    const { props } = setup({ planesHidden: true, decorHidden: false, syncViews: true });
    fireEvent.click(screen.getByRole("button", { name: /PLANOS ○/ }));
    fireEvent.click(screen.getByRole("button", { name: /REGLAS ●/ }));
    fireEvent.click(screen.getByRole("button", { name: /SINCRO ●/ }));
    expect(props.onPlanesHiddenChange).toHaveBeenCalledWith(false);
    expect(props.onDecorHiddenChange).toHaveBeenCalledWith(true);
    expect(props.onSyncViewsChange).toHaveBeenCalledWith(false);
  });

  it("CALOR solo aparece con campo del clip y se apaga durante el ensayo", () => {
    const { rerender, props } = setup();
    expect(screen.queryByRole("button", { name: /CALOR/ })).toBeNull();
    rerender(<ViewerHeader {...props} hasClipField showClipField clipRehearsal />);
    expect(screen.getByRole("button", { name: /CALOR ○/ })).toHaveAttribute("aria-pressed", "false");
    rerender(<ViewerHeader {...props} hasClipField showClipField clipRehearsal={false} />);
    fireEvent.click(screen.getByRole("button", { name: /CALOR ●/ }));
    expect(props.onShowClipFieldChange).toHaveBeenCalledWith(false);
  });

  it("las teclas de la banda llegan al manejador de Alt+1/2/3", () => {
    const { props } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: /^AX$/ }), { code: "Digit1", altKey: true });
    expect(props.onKeyDown).toHaveBeenCalledTimes(1);
  });
});
