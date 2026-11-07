// frontend/src/vtk/ViewerHeader.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anchoBanda, MATRIZ_ALTOS, MATRIZ_ANCHOS, simularPantalla } from "../test/pantalla";
import { DEFAULT_LAYOUT, flipSide, promote, rotate, showAll, toggleEqual, togglePane, toggleSolo } from "./layout";
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

describe("ViewerHeader — vistas", () => {
  it("cada vista es una pastilla: pulsada si se ve", () => {
    setup({ layout: togglePane(DEFAULT_LAYOUT, "mip") });
    expect(screen.getByRole("button", { name: "Vista AXIAL" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Vista VOLUMEN" })).toHaveAttribute("aria-pressed", "false");
  });

  it("la pastilla minimiza y enciende", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Vista AXIAL" }));
    expect(props.onLayoutChange).toHaveBeenCalledWith(togglePane(DEFAULT_LAYOUT, "axial"));
  });

  it("se marca la que va grande, salvo con Igualar", () => {
    const layout = promote(DEFAULT_LAYOUT, "coronal");
    const { unmount } = setup({ layout });
    expect(screen.getByRole("button", { name: "Vista CORONAL" })).toHaveAttribute("data-grande");
    unmount();
    setup({ layout: toggleEqual(layout) });
    expect(screen.getByRole("button", { name: "Vista CORONAL" })).not.toHaveAttribute("data-grande");
  });

  it("Rotar, el lado e Igualar cambian la distribución", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rotar las vistas" }));
    expect(props.onLayoutChange).toHaveBeenLastCalledWith(rotate(DEFAULT_LAYOUT));
    fireEvent.click(screen.getByRole("button", { name: "Poner la vista grande arriba" }));
    expect(props.onLayoutChange).toHaveBeenLastCalledWith(flipSide(DEFAULT_LAYOUT));
    fireEvent.click(screen.getByRole("button", { name: "Igualar las vistas" }));
    expect(props.onLayoutChange).toHaveBeenLastCalledWith(toggleEqual(DEFAULT_LAYOUT));
  });

  it("TODAS solo aparece con alguna minimizada", () => {
    const { unmount } = setup();
    expect(screen.queryByRole("button", { name: "Mostrar todas las vistas" })).toBeNull();
    unmount();
    const layout = togglePane(DEFAULT_LAYOUT, "mip");
    const { props } = setup({ layout });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar todas las vistas" }));
    expect(props.onLayoutChange).toHaveBeenCalledWith(showAll(layout));
  });

  it("con una sola vista no hay lado ni Igualar, pero sí Rotar", () => {
    setup({ layout: toggleSolo(DEFAULT_LAYOUT, "axial") });
    expect(screen.getByRole("button", { name: "Rotar las vistas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Igualar las vistas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Poner la vista grande arriba" })).toBeNull();
  });
});

describe("ViewerHeader — ancho de la banda", () => {
  it("con sitio los mandos van enteros", () => {
    stubBandWidth(1200);
    setup();
    expect(screen.getByRole("button", { name: "Poner la vista grande arriba" })).toHaveTextContent("GRANDE IZQ");
    expect(screen.getByRole("button", { name: "Igualar las vistas" })).toHaveTextContent("IGUALAR");
  });

  it("estrecha (900 px, nivel estrecho) los mandos se abrevian", () => {
    stubBandWidth(900);
    const { container } = setup();
    expect(container.querySelector('[data-banda="raiz"]')).toHaveAttribute("data-tier", "estrecho");
    expect(screen.getByRole("button", { name: "Poner la vista grande arriba" })).toHaveTextContent(/^IZQ$/);
    expect(screen.getByRole("button", { name: "Igualar las vistas" })).toHaveTextContent(/^IGUAL$/);
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

  it("sin maquetar (ancho 0: oculta o jsdom) la banda va en el nivel ancho, no en iconos", () => {
    stubBandWidth(0);
    const { container } = setup();
    expect(container.querySelector('[data-banda="raiz"]')).toHaveAttribute("data-tier", "ancho");
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

  it("las teclas de la banda llegan al manejador de Alt+1…5", () => {
    const { props } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: "Vista AXIAL" }), { code: "Digit1", altKey: true });
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
    expect(screen.getByTestId("header-level-note-text")).not.toBeVisible();
    fireEvent.click(b);
    expect(screen.getByTestId("header-level-note-text")).toBeVisible();
    expect(screen.getByTestId("header-level-note-text")).toHaveTextContent(note);
    expect(b).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(b);
    expect(screen.getByTestId("header-level-note-text")).not.toBeVisible();
    expect(b).toHaveAttribute("aria-expanded", "false");
  });

  it("la línea del aviso está siempre montada como status y el ⚠ la controla", () => {
    stubBandWidth(1200);
    const note = "Vista previa en baja resolución; las medidas no cambian";
    setup({ levelNote: note });
    const line = screen.getByTestId("header-level-note-text");
    expect(line).toHaveAttribute("role", "status");
    expect(line).toHaveAttribute("hidden");
    expect(line.id).not.toBe("");
    const b = screen.getByRole("button", { name: note });
    expect(b).toHaveAttribute("aria-controls", line.id);
    // Foco visible como los conmutadores del HUD (regla en hud.css).
    expect(b).toHaveClass("hud-note-toggle");
  });

  it("un aviso nuevo llega plegado aunque el anterior estuviera desplegado", () => {
    stubBandWidth(1200);
    const { rerender, props } = setup({ levelNote: "Vista previa 1:2; las medidas no cambian" });
    fireEvent.click(screen.getByRole("button", { name: "Vista previa 1:2; las medidas no cambian" }));
    expect(screen.getByTestId("header-level-note-text")).toBeVisible();
    rerender(<ViewerHeader {...props} levelNote="Vista previa 1:4; las medidas no cambian" />);
    expect(screen.getByRole("button", { name: "Vista previa 1:4; las medidas no cambian" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("header-level-note-text")).not.toBeVisible();
    expect(screen.getByTestId("header-level-note-text")).toHaveTextContent("1:4");
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

describe("ViewerHeader — modo iconos (táctil ≤ 1024, móvil ≤ 640)", () => {
  it.each([360, 390, 768])("a %i px (táctil) la banda va en iconos con objetivos marcados", (w) => {
    simularPantalla(w); stubBandWidth(anchoBanda(w));
    const { container } = setup({ onHelp: () => {} });
    const raiz = container.querySelector('[data-banda="raiz"]')!;
    expect(raiz).toHaveAttribute("data-tactil", "true");
    if (w <= 640) expect(raiz).toHaveAttribute("data-movil", "true");
    else expect(raiz).not.toHaveAttribute("data-movil");
    expect(screen.getByRole("button", { name: "Vista AXIAL" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Planos de corte en el 3D" })).toBeInTheDocument();
    if (w <= 640) expect(screen.queryByTitle("Atajos (?)")).toBeNull();
    else expect(screen.getByTitle("Atajos (?)")).toBeInTheDocument();
  });

  it("en iconos los mandos van abreviados y las pastillas siguen funcionando", () => {
    simularPantalla(390); stubBandWidth(anchoBanda(390));
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Vista AXIAL" }));
    expect(props.onLayoutChange).toHaveBeenLastCalledWith(togglePane(DEFAULT_LAYOUT, "axial"));
    expect(screen.getByRole("button", { name: "Poner la vista grande arriba" })).toHaveTextContent(/^IZQ$/);
  });

  it("en iconos, TEXTOS rota completo → esencial → limpio → completo", () => {
    simularPantalla(390); stubBandWidth(anchoBanda(390));
    const { props, rerender } = setup({ hudLevel: "completo" });
    const b = screen.getByRole("button", { name: /Nivel de textos: completo/ });
    expect(b).toHaveTextContent(/^TXT C$/);
    expect(b).toHaveAccessibleName("Nivel de textos: completo. Cambiar (H)");
    fireEvent.click(b);
    expect(props.onHudLevelChange).toHaveBeenLastCalledWith("esencial");
    rerender(<ViewerHeader {...props} hudLevel="esencial" />);
    fireEvent.click(screen.getByRole("button", { name: /Nivel de textos: esencial/ }));
    expect(props.onHudLevelChange).toHaveBeenLastCalledWith("limpio");
    rerender(<ViewerHeader {...props} hudLevel="limpio" />);
    expect(screen.getByRole("button", { name: /Nivel de textos: limpio/ })).toHaveTextContent(/^TXT L$/);
    fireEvent.click(screen.getByRole("button", { name: /Nivel de textos: limpio/ }));
    expect(props.onHudLevelChange).toHaveBeenLastCalledWith("completo");
  });

  it("en iconos, PLANOS, VINCULAR y CALOR dicen su estado con aria-pressed y avisan del contrario", () => {
    simularPantalla(390); stubBandWidth(anchoBanda(390));
    const { props } = setup({ planesHidden: true, syncViews: true, hasClipField: true, showClipField: true });
    const planos = screen.getByRole("button", { name: "Planos de corte en el 3D" });
    const vincular = screen.getByRole("button", { name: "Vincular las vistas" });
    const calor = screen.getByRole("button", { name: "Mapa de calor del clip" });
    expect(planos).toHaveAttribute("aria-pressed", "false");
    expect(vincular).toHaveAttribute("aria-pressed", "true");
    expect(calor).toHaveAttribute("aria-pressed", "true");
    expect(calor).toHaveTextContent("CAL ●");
    expect(calor).toHaveAttribute("title", "Ver el saco sin el mapa de calor del clip");
    fireEvent.click(planos); fireEvent.click(vincular); fireEvent.click(calor);
    expect(props.onPlanesHiddenChange).toHaveBeenCalledWith(false);
    expect(props.onSyncViewsChange).toHaveBeenCalledWith(false);
    expect(props.onShowClipFieldChange).toHaveBeenCalledWith(false);
  });

  it("en iconos CALOR se apaga durante el ensayo y solo existe con campo del clip", () => {
    simularPantalla(390); stubBandWidth(anchoBanda(390));
    const { props, rerender } = setup();
    expect(screen.queryByRole("button", { name: "Mapa de calor del clip" })).toBeNull();
    rerender(<ViewerHeader {...props} hasClipField showClipField clipRehearsal />);
    const calor = screen.getByRole("button", { name: "Mapa de calor del clip" });
    expect(calor).toHaveAttribute("aria-pressed", "false");
    expect(calor).toHaveTextContent("CAL ○");
  });

  // Revisión de la tarea 2 (b): en táctil no hay hover; nada vive solo en `title`.
  it("en iconos cada control tiene nombre accesible propio, no solo el título", () => {
    simularPantalla(768); stubBandWidth(anchoBanda(768));
    const { container } = setup({ onHelp: () => {}, hasClipField: true, levelNote: "Vista previa 1:2; las medidas no cambian" });
    const controles = container.querySelectorAll('[data-banda="raiz"] button, [data-banda="raiz"] select');
    expect(controles.length).toBeGreaterThanOrEqual(8);
    for (const el of controles) expect(el.getAttribute("aria-label"), el.outerHTML).toMatch(/\S{3,}/);
  });

  // Revisión de la tarea 2 (a): el grupo izquierdo no puede desbordar a 360.
  it("a 360 el grupo izquierdo de iconos lleva las vistas y puede encoger y envolver", () => {
    simularPantalla(360); stubBandWidth(anchoBanda(360));
    const { container } = setup({ onHelp: () => {}, hasClipField: true });
    const izq = container.querySelector('[data-banda="izq"]') as HTMLElement;
    expect(izq.querySelector(".viewer-vistas")).not.toBeNull();
    expect(izq.style.flexWrap).toBe("wrap");
    expect(izq.style.flexShrink).toBe("1");
    expect(izq.style.minWidth).toMatch(/^0(px)?$/);
    // jsdom no maqueta: aquí solo se comprueba que el grupo puede encoger y
    // envolver. La medida real a 360 se verifica en el navegador (tarea 12).
  });

  // Revisión de la tarea 2 (c): el ⚠ es un objetivo táctil como los demás.
  it("en iconos el ⚠ es un botón de la banda sin tamaño fijado en línea (lo da hud.css: 44 px)", () => {
    simularPantalla(390); stubBandWidth(anchoBanda(390));
    const note = "Vista previa en baja resolución; las medidas no cambian";
    setup({ levelNote: note });
    const b = screen.getByRole("button", { name: note });
    expect(b).toHaveClass("hud-note-toggle");
    expect(b.style.minHeight).toBe("");
    expect(b.style.height).toBe("");
    const line = screen.getByTestId("header-level-note-text");
    expect(b).toHaveAttribute("aria-controls", line.id);
    expect(line).not.toBeVisible();
    fireEvent.click(b);
    expect(line).toBeVisible();
  });

  it("en táctil la raíz no fija su alto en línea (el mínimo de 44 px de hud.css manda)", () => {
    simularPantalla(390); stubBandWidth(anchoBanda(390));
    const { container } = setup();
    expect((container.querySelector('[data-banda="raiz"]') as HTMLElement).style.minHeight).toBe("");
  });

  it("a 1025 o más no hay marca táctil", () => {
    simularPantalla(1025); stubBandWidth(1025);
    const { container } = setup();
    const raiz = container.querySelector('[data-banda="raiz"]')!;
    expect(raiz).not.toHaveAttribute("data-tactil");
    expect(raiz).not.toHaveAttribute("data-movil");
    expect(screen.queryByRole("combobox")).toBeNull();
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
