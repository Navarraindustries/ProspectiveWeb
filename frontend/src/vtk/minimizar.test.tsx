/* Minimizar la vista enfocada. La celda queda `inert`: el foco, el espacio del cine y
   la pista de gestos tienen que ir a una vista que se vea, nunca a la minimizada. */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, promote, togglePane, type PaneId } from "./layout";
import { gridFor, shortcutPane } from "./layoutGrid";
import { mainHintKind } from "./hint";
import { refocusAfterHide } from "./pointerFocus";
import { ViewerGrid } from "./ViewerGrid";

const volGrande = promote(DEFAULT_LAYOUT, "mip");
const sinVolumen = togglePane(volGrande, "mip");

describe("la grande se minimiza", () => {
  it("la siguiente encendida ocupa su sitio y se ve", () => {
    expect(sinVolumen.main).toBe("scene");
    const g = gridFor(sinVolumen, false);
    expect(g.slotOf.scene).toBe("main");
    expect(g.visible.mip).toBe(false);
  });

  it("espacio y las teclas de corte no van a una vista minimizada", () => {
    expect(shortcutPane(null, sinVolumen)).toBe("scene");
    expect(shortcutPane("axial", sinVolumen)).toBe("axial");
    expect(shortcutPane("mip", sinVolumen)).toBe("scene");
    expect(shortcutPane(null, volGrande)).toBe("mip");
  });

  it("la pista de gestos es la de la que queda grande", () => {
    const p = { hudLevel: "completo" as const, sceneHasMesh: true, sceneIsSlice: false };
    expect(mainHintKind({ ...p, main: sinVolumen.main })).toBe("rotate");
    expect(mainHintKind({ ...p, main: volGrande.main })).toBe("mip");
  });
});

describe("foco al minimizar VOLUMEN", () => {
  // VOLUMEN tiene envoltorio con teclado (como MipView); la 3D no (como MeshView).
  const renderPane = (id: PaneId) => (id === "mip" ? <div tabIndex={0} data-testid="mip-wrap" /> : <span>{id}</span>);

  it("el foco cae fuera de la celda minimizada y Alt+1 sigue llegando al visor", () => {
    const onKey = vi.fn();
    const { container, rerender, getByTestId } = render(
      <div data-testid="host" tabIndex={0} onKeyDown={onKey}>
        <ViewerGrid layout={volGrande} onLayoutChange={() => {}} renderPane={renderPane} />
      </div>,
    );
    const host = container.firstElementChild as HTMLElement;
    getByTestId("mip-wrap").focus();
    rerender(
      <div data-testid="host" tabIndex={0} onKeyDown={onKey}>
        <ViewerGrid layout={sinVolumen} onLayoutChange={() => {}} renderPane={renderPane} />
      </div>,
    );
    const cell = (id: PaneId) => container.querySelector<HTMLElement>(`[data-pane="${id}"]`)!;
    expect(cell("mip").hasAttribute("inert")).toBe(true);
    // La 3D no tiene envoltorio: el foco va al contenedor del visor.
    const destino = refocusAfterHide(document.activeElement, cell("mip"), cell(sinVolumen.main), host)!;
    expect(destino).toBe(host);
    expect(destino.closest("[inert]")).toBeNull();
    destino.focus();
    fireEvent.keyDown(document.activeElement!, { code: "Digit1", altKey: true });
    expect(onKey).toHaveBeenCalledTimes(1);
  });
});
