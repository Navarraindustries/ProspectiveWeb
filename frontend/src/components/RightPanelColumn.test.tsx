import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RightPanelColumn } from "./RightPanelColumn";

describe("RightPanelColumn", () => {
  it("mide 380 px y 520 px en los pasos anchos, sin clamp", () => {
    const { rerender } = render(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Detección" stepKey="detect" wide={false}><p>a</p></RightPanelColumn>);
    const col = document.querySelector("[data-panel-column]") as HTMLElement;
    expect(col.style.width).toBe("380px");
    rerender(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Decisión" stepKey="treatment" wide><p>b</p></RightPanelColumn>);
    expect(col.style.width).toBe("520px");
  });

  it("plegado conserva el contenido montado al cambiar de paso", async () => {
    const { rerender } = render(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="A" stepKey="a" wide={false}><input aria-label="nota" defaultValue="x" /></RightPanelColumn>);
    // El paso cambia de verdad: el contenido nuevo aparece aunque siga plegado.
    rerender(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="B" stepKey="b" wide={false}><input aria-label="nota" defaultValue="x" /><p>contenido nuevo</p></RightPanelColumn>);
    // El cruce es «wait»: el contenido nuevo entra cuando acaba la salida del anterior.
    expect(await screen.findByText("contenido nuevo")).toBeTruthy();
    expect((screen.getByLabelText("nota") as HTMLInputElement).value).toBe("x");
    expect((document.querySelector("[data-panel-column]") as HTMLElement).style.display).toBe("none");
  });
});
