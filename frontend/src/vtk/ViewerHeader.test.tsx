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
    hudLevel: "completo", onHudLevelChange: vi.fn(),
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
    for (const label of ["3D", "AX", "SAG", "VOLUMEN"]) {
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
  it("PLANOS y VINCULAR avisan con el valor contrario", () => {
    const { props } = setup({ planesHidden: true, syncViews: true });
    fireEvent.click(screen.getByRole("button", { name: /PLANOS ○/ }));
    fireEvent.click(screen.getByRole("button", { name: /VINCULAR ●/ }));
    expect(props.onPlanesHiddenChange).toHaveBeenCalledWith(false);
    expect(props.onSyncViewsChange).toHaveBeenCalledWith(false);
  });

  it("el grupo TEXTOS ▸ tiene los tres niveles, marca el actual y avisa del elegido", () => {
    stubBandWidth(1200);
    const { props } = setup({ hudLevel: "esencial" });
    expect(screen.getByTitle("Nivel de textos (H)")).toHaveTextContent(/^TEXTOS ▸/);
    expect(screen.getByRole("button", { name: /^\[ ESENCIAL \]$/ })).toHaveAttribute("aria-pressed", "true");
    // F1-117: cada nivel dice qué deja a la vista, no «HUD esencial».
    const titles = {
      COMPLETO: "Todo: botones de las vistas, lecturas, orientación y escala",
      ESENCIAL: "Oculta los botones de las vistas; deja orientación, corte y ventana",
      LIMPIO: "Solo la imagen, con lateralidad y escala",
    };
    for (const [label, title] of Object.entries(titles)) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toHaveAttribute("title", title);
    }
    fireEvent.click(screen.getByRole("button", { name: /^LIMPIO$/ }));
    expect(props.onHudLevelChange).toHaveBeenCalledWith("limpio");
  });

  it("estrecha (< 800 px) abrevia el grupo a TEXTOS ▸ C · E · L", () => {
    stubBandWidth(700);
    setup({ hudLevel: "completo" });
    expect(screen.getByRole("button", { name: /^\[ C \]$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^E$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^L$/ })).toBeInTheDocument();
  });

  it("PLANOS emite con cualquier nivel del HUD", () => {
    for (const hudLevel of ["completo", "esencial", "limpio"] as const) {
      const { props, unmount } = setup({ hudLevel, planesHidden: false });
      fireEvent.click(screen.getByRole("button", { name: /PLANOS ●/ }));
      expect(props.onPlanesHiddenChange).toHaveBeenCalledWith(true);
      unmount();
    }
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

  it("el botón «?» del final de la banda abre la hoja de atajos", () => {
    const onHelp = vi.fn();
    setup({ onHelp });
    fireEvent.click(screen.getByTitle("Atajos (?)"));
    expect(onHelp).toHaveBeenCalledTimes(1);
  });
});

describe("ViewerHeader — aviso de nivel", () => {
  it("enseña el aviso ámbar con su texto completo cuando se le pasa", () => {
    stubBandWidth(1200);
    setup({ levelNote: "Vista previa en baja resolución; las medidas no cambian", levelNoteShort: "BAJA RESOLUCIÓN" });
    const note = screen.getByTitle("Vista previa en baja resolución; las medidas no cambian");
    expect(note.textContent).toBe("Vista previa en baja resolución; las medidas no cambian");
    expect(note.style.color).toBe("var(--hud-amber)");
  });

  it("estrecha (< 800 px) usa la forma abreviada", () => {
    stubBandWidth(700);
    setup({ levelNote: "Vista previa en baja resolución; las medidas no cambian", levelNoteShort: "BAJA RESOLUCIÓN" });
    expect(screen.getByTitle("Vista previa en baja resolución; las medidas no cambian").textContent).toBe("BAJA RESOLUCIÓN");
  });

  it("sin aviso no pinta nada", () => {
    setup({ levelNote: null });
    expect(screen.queryByTestId("header-level-note")).toBeNull();
    expect(screen.queryByText(/RESOLUCIÓN/)).toBeNull();
  });
});

describe("ViewerHeader — nombres sin jerga (F1-114, F1-115)", () => {
  it("no aparece «HUD» en el texto de la banda ni en sus títulos", () => {
    stubBandWidth(1200);
    const { container } = setup({ onHelp: () => {}, hasClipField: true });
    expect(container.textContent).not.toMatch(/HUD/);
    for (const el of container.querySelectorAll("[title]")) expect(el.getAttribute("title")).not.toMatch(/HUD/);
  });

  it("VINCULAR dice qué hace al encenderlo", () => {
    setup({ syncViews: false });
    const b = screen.getByRole("button", { name: /^VINCULAR ○$/ });
    expect(b).toHaveAttribute("title", "Encendido: un clic en una vista centra las demás en ese punto");
    expect(screen.queryByText(/SINCRO/)).toBeNull();
  });
});
