/* El panel del paso se pliega con P sin desmontarse: lo escrito sigue ahí. */
import { useEffect } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RightPanelColumn, PREF_PANEL_COLLAPSED } from "../components/RightPanelColumn";
import { useStoredFlag } from "../vtk/viewerPrefs";
import { matchShortcut } from "../vtk/shortcuts";

/* El mismo cableado que Workspace: la tabla de atajos decide, el manejador alterna. */
function Harness() {
  const [collapsed, setCollapsed] = useStoredFlag(PREF_PANEL_COLLAPSED);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchShortcut(e, e.target) === "panel-toggle") { e.preventDefault(); setCollapsed(!collapsed); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);
  return (
    <RightPanelColumn collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)}
                      stepLabel="Detección" badge={<span>3</span>}>
      <input aria-label="nota" defaultValue="" />
    </RightPanelColumn>
  );
}

const pressP = (target: Window | Element = window) =>
  fireEvent.keyDown(target, { key: "p", code: "KeyP" });

describe("panel del paso plegable", () => {
  beforeEach(() => window.localStorage.clear());

  it("P pliega y despliega; el contenido sigue montado", () => {
    render(<Harness />);
    const input = screen.getByLabelText("nota");
    expect(screen.queryByRole("button", { name: /PANEL ▸ Detección/ })).toBeNull();
    pressP();
    const strip = screen.getByRole("button", { name: /PANEL ▸ Detección/ });
    expect(strip.getAttribute("aria-expanded")).toBe("false");
    expect(strip.closest("aside")?.className).toContain("ws-panel-strip");
    expect(screen.getByText("3")).toBeTruthy();
    // El mismo nodo, oculto, no uno nuevo.
    expect(screen.getByLabelText("nota")).toBe(input);
    expect((input.closest("[data-panel-column]") as HTMLElement).style.display).toBe("none");
    expect(window.localStorage.getItem(PREF_PANEL_COLLAPSED)).toBe("1");
    pressP();
    expect(screen.queryByRole("button", { name: /PANEL ▸/ })).toBeNull();
    expect((input.closest("[data-panel-column]") as HTMLElement).style.display).not.toBe("none");
    expect(window.localStorage.getItem(PREF_PANEL_COLLAPSED)).toBe("0");
  });

  it("lo escrito sobrevive a plegar y desplegar", () => {
    render(<Harness />);
    const input = screen.getByLabelText("nota") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    pressP();
    pressP();
    expect((screen.getByLabelText("nota") as HTMLInputElement).value).toBe("abc");
  });

  it("clic en la tira despliega", () => {
    window.localStorage.setItem(PREF_PANEL_COLLAPSED, "1");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /PANEL ▸ Detección/ }));
    expect(screen.queryByRole("button", { name: /PANEL ▸/ })).toBeNull();
    expect(window.localStorage.getItem(PREF_PANEL_COLLAPSED)).toBe("0");
  });

  it("P con el foco en un campo de texto no hace nada", () => {
    render(<Harness />);
    const input = screen.getByLabelText("nota");
    input.focus();
    pressP(input);
    expect(screen.queryByRole("button", { name: /PANEL ▸/ })).toBeNull();
    expect(window.localStorage.getItem(PREF_PANEL_COLLAPSED)).toBeNull();
  });
});
