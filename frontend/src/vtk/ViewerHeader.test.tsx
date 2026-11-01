// frontend/src/vtk/ViewerHeader.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anchoBanda, MATRIZ_ALTOS, MATRIZ_ANCHOS, simularPantalla } from "../test/pantalla";
import { DEFAULT_LAYOUT, promote, setPreset, type ViewerLayout } from "./layout";
import type { BandTier } from "./mainOptions";
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

  it("estrecha (900 px, nivel estrecho) muestra «▸» y DER · ABA · 4 · SOLA", () => {
    stubBandWidth(900);
    const { container } = setup();
    expect(container.querySelector('[data-banda="raiz"]')).toHaveAttribute("data-tier", "estrecho");
    expect(screen.getByTitle("Vista principal").textContent).toBe("▸");
    for (const label of ["DER", "ABA", "4", "SOLA"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^(\\[ )?${label}( \\])?$`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /DERECHA/ })).toBeNull();
  });

  // Nivel esperado por ancho de pantalla: la banda mide la pantalla menos el
  // inspector (anchoBanda). 1024 es táctil (MQ_TACTIL incluye 1024, ruling de
  // la tarea 1) y por eso va en iconos aunque su banda mida más de 800.
  const NIVEL: Record<number, BandTier> = {
    360: "iconos", 390: "iconos", 768: "iconos", 1024: "iconos", 1280: "medio",
    1366: "estrecho", 1440: "estrecho", 1707: "medio", 1920: "ancho", 2560: "ancho",
  };
  it.each(MATRIZ_ANCHOS)("a %i px de pantalla la banda toma su nivel, sea cual sea el alto", (w) => {
    for (const h of MATRIZ_ALTOS) {
      simularPantalla(w, h); stubBandWidth(anchoBanda(w));
      const { container, unmount } = setup();
      expect(container.querySelector('[data-banda="raiz"]')).toHaveAttribute("data-tier", NIVEL[w]);
      unmount();
    }
  });

  it("la estructura no deja solapar: la raíz y el grupo derecho envuelven, el izquierdo no encoge", () => {
    const { container } = setup();
    expect((container.querySelector('[data-banda="raiz"]') as HTMLElement).style.flexWrap).toBe("wrap");
    expect((container.querySelector('[data-banda="der"]') as HTMLElement).style.flexWrap).toBe("wrap");
    expect((container.querySelector('[data-banda="izq"]') as HTMLElement).style.flexShrink).toBe("0");
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

  it("estrecha (900 px, nivel estrecho) abrevia el grupo a TEXTOS ▸ C · E · L", () => {
    stubBandWidth(900);
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
  it("enseña el aviso ámbar con su texto completo cuando se le pasa (nivel ancho)", () => {
    stubBandWidth(1500);
    setup({ levelNote: "Vista previa en baja resolución; las medidas no cambian" });
    const note = screen.getByTitle("Vista previa en baja resolución; las medidas no cambian");
    expect(note.textContent).toBe("Vista previa en baja resolución; las medidas no cambian");
    expect(note.style.color).toBe("var(--hud-amber)");
  });

  it("a ≥ 1400 el aviso va en texto entero", () => {
    stubBandWidth(1500);
    setup({ levelNote: "Vista previa 1:2; las medidas no cambian" });
    expect(screen.getByTestId("header-level-note").textContent).toBe("Vista previa 1:2; las medidas no cambian");
  });

  it("a 1707 con CALOR y aviso largo, el aviso es ⚠ y un clic despliega el texto", () => {
    simularPantalla(1707, 743); stubBandWidth(anchoBanda(1707));
    const note = "Vista previa en baja resolución; las medidas no cambian";
    setup({ hasClipField: true, showClipField: true, levelNote: note });
    const b = screen.getByRole("button", { name: note });
    expect(screen.queryByTestId("header-level-note-text")).toBeNull();
    fireEvent.click(b);
    expect(screen.getByTestId("header-level-note-text")).toHaveTextContent(note);
    expect(b).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(b);
    expect(screen.queryByTestId("header-level-note-text")).toBeNull();
    expect(b).toHaveAttribute("aria-expanded", "false");
  });

  it("en nivel estrecho el aviso también es ⚠, sin forma corta", () => {
    stubBandWidth(900);
    const note = "Vista previa en baja resolución; las medidas no cambian";
    setup({ levelNote: note });
    expect(screen.getByRole("button", { name: note })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/BAJA RESOLUCIÓN/)).toBeNull();
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
