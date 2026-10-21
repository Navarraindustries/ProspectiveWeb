/* CUATRO con VOLUMEN de principal (revisión de la Tarea 16). VOLUMEN queda
   oculta e `inert`; el visor seguía mandando a `layout.main` el foco tras
   ocultar, el espacio del cine sin celda enfocada y la pista de gestos. Todo
   eso va ahora a `shownMain`: la 3D, que es la que hace de principal. */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, promote, setPreset, type PaneId } from "./layout";
import { gridFor, shortcutPane, shownMain } from "./layoutGrid";
import { mainHintKind } from "./hint";
import { refocusAfterHide } from "./pointerFocus";
import { ViewerGrid } from "./ViewerGrid";

const volPrincipal = promote(DEFAULT_LAYOUT, "mip");
const cuatroVol = setPreset(volPrincipal, "cuatro");

describe("shownMain", () => {
  it("es la principal salvo VOLUMEN en CUATRO, que cede a la 3D", () => {
    expect(shownMain(volPrincipal)).toBe("mip");
    expect(shownMain(cuatroVol)).toBe("scene");
    expect(shownMain(setPreset(promote(DEFAULT_LAYOUT, "coronal"), "cuatro"))).toBe("coronal");
    // La misma regla que la rejilla: la celda con el hueco «main» es la que se ve.
    for (const l of [cuatroVol, volPrincipal, setPreset(DEFAULT_LAYOUT, "cuatro")]) {
      const g = gridFor(l, false);
      expect(g.slotOf[shownMain(l)]).toBe("main");
      expect(g.visible[shownMain(l)]).toBe(true);
    }
  });

  it("espacio sin celda enfocada no arranca el cine en VOLUMEN oculta", () => {
    expect(shortcutPane(null, cuatroVol)).toBe("scene");
    expect(shortcutPane("axial", cuatroVol)).toBe("axial");
    expect(shortcutPane(null, volPrincipal)).toBe("mip");
  });

  it("la pista de gestos es la de la 3D, no la de VOLUMEN", () => {
    const p = { hudLevel: "completo" as const, sceneHasMesh: true, sceneIsSlice: false };
    expect(mainHintKind({ ...p, main: shownMain(cuatroVol) })).toBe("rotate");
    expect(mainHintKind({ ...p, main: shownMain(volPrincipal) })).toBe("mip");
    expect(mainHintKind({ ...p, main: "scene", sceneHasMesh: false, sceneIsSlice: true })).toBe("slice");
    expect(mainHintKind({ ...p, main: "axial", hudLevel: "limpio" })).toBeNull();
  });
});

describe("foco al entrar en CUATRO desde VOLUMEN", () => {
  // VOLUMEN tiene envoltorio con teclado (como MipView); la 3D no (como MeshView).
  const renderPane = (id: PaneId) => (id === "mip" ? <div tabIndex={0} data-testid="mip-wrap" /> : <span>{id}</span>);

  it("foco en VOLUMEN, Alt+4: el foco cae fuera de la celda oculta y Alt+1 sigue llegando al visor", () => {
    const onKey = vi.fn();
    const { container, rerender, getByTestId } = render(
      <div data-testid="host" tabIndex={0} onKeyDown={onKey}>
        <ViewerGrid layout={volPrincipal} onLayoutChange={() => {}} renderPane={renderPane} />
      </div>,
    );
    const host = container.firstElementChild as HTMLElement;
    getByTestId("mip-wrap").focus();
    rerender(
      <div data-testid="host" tabIndex={0} onKeyDown={onKey}>
        <ViewerGrid layout={cuatroVol} onLayoutChange={() => {}} renderPane={renderPane} />
      </div>,
    );
    const cell = (id: PaneId) => container.querySelector<HTMLElement>(`[data-pane="${id}"]`)!;
    expect(cell("mip").hasAttribute("inert")).toBe(true);
    // Lo que hacía antes: la «principal» era VOLUMEN y el destino quedaba dentro de la celda inerte.
    const antes = refocusAfterHide(document.activeElement, cell("mip"), cell(cuatroVol.main), host);
    expect(antes && cell("mip").contains(antes)).toBe(true);
    // Ahora: la 3D, que no tiene envoltorio, manda el foco al contenedor del visor.
    const destino = refocusAfterHide(document.activeElement, cell("mip"), cell(shownMain(cuatroVol)), host)!;
    expect(destino).toBe(host);
    expect(destino.closest("[inert]")).toBeNull();
    destino.focus();
    expect(document.activeElement).toBe(host);
    fireEvent.keyDown(document.activeElement!, { code: "Digit1", altKey: true });
    expect(onKey).toHaveBeenCalledTimes(1);
  });
});
