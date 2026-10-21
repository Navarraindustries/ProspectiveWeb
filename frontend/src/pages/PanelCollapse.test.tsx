/* El panel del paso se pliega con P sin desmontarse: lo escrito sigue ahí. */
import { useEffect } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RightPanelColumn, PREF_PANEL_COLLAPSED, useUnfoldForNote } from "../components/RightPanelColumn";
import { AnnotationsPanel } from "../components/annotations/AnnotationsPanel";
import { PlanningProvider, usePlanning } from "../store/planning";
import type { Annotation } from "../vtk/annotations";
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

/* El cableado de Workspace para la nota de un marcador: el mismo hook, la
   columna real y el panel real de anotaciones. */
let planning: ReturnType<typeof usePlanning> | null = null;
function NoteHarness() {
  const p = usePlanning();
  useEffect(() => { planning = p; });
  useEffect(() => { p.setSession("s1"); p.setAnnotationsLoaded([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [collapsed, setCollapsed] = useStoredFlag(PREF_PANEL_COLLAPSED);
  const columnCollapsed = useUnfoldForNote(collapsed, setCollapsed, p.noteFocusRequest);
  return (
    <RightPanelColumn collapsed={columnCollapsed} onToggle={() => setCollapsed(false)} stepLabel="Detección">
      <AnnotationsPanel />
    </RightPanelColumn>
  );
}

describe("nota de un marcador con el panel plegado", () => {
  beforeEach(() => { window.localStorage.clear(); planning = null; });
  afterEach(() => vi.restoreAllMocks());

  it("la petición de nota despliega la columna y el campo recibe el foco", async () => {
    window.localStorage.setItem(PREF_PANEL_COLLAPSED, "1");
    // jsdom no modela display: aquí focus() falla, como en el navegador, si
    // algún antepasado está en display:none.
    const real = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement) {
      for (let n: HTMLElement | null = this; n; n = n.parentElement) if (n.style.display === "none") return;
      real.call(this);
    });
    render(<PlanningProvider><NoteHarness /></PlanningProvider>);
    expect(screen.getByRole("button", { name: /PANEL ▸ Detección/ })).toBeTruthy();
    const m: Annotation = {
      id: "m9", kind: "marcador", points: [[1, 2, 3]], plane: null,
      label: "M9", note: "", visible: true, created_at: "2026-10-08T10:00:00Z", created_by: "",
    };
    act(() => { planning?.setAnnotations((l) => [...l, m]); planning?.setNoteFocusRequest("m9"); });
    const nota = await screen.findByLabelText("Nota de M9");
    expect((nota.closest("[data-panel-column]") as HTMLElement).style.display).not.toBe("none");
    await waitFor(() => expect(nota).toHaveFocus());
    expect(planning?.noteFocusRequest).toBeNull();
    // Desplegado de verdad, no solo mientras la nota esperaba.
    expect(screen.queryByRole("button", { name: /PANEL ▸/ })).toBeNull();
    expect(window.localStorage.getItem(PREF_PANEL_COLLAPSED)).toBe("0");
  });
});
