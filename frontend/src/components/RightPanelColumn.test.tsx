import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RightPanelColumn } from "./RightPanelColumn";

describe("RightPanelColumn", () => {
  it("mide 380 px y 520 px en los pasos anchos, sin clamp", () => {
    const { rerender } = render(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Detección" stepIndex={0} stepKey="detect" wide={false}><p>a</p></RightPanelColumn>);
    const col = document.querySelector("[data-panel-column]") as HTMLElement;
    expect(col.style.width).toBe("380px");
    rerender(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Decisión" stepIndex={0} stepKey="treatment" wide><p>b</p></RightPanelColumn>);
    expect(col.style.width).toBe("520px");
  });

  it("flota como cristal denso, con el rótulo del paso en mayúsculas", () => {
    render(<RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Detección" stepIndex={2} stepKey="detect" wide={false}><p>a</p></RightPanelColumn>);
    const col = document.querySelector("[data-panel-column]") as HTMLElement;
    expect(col.style.position).toBe("absolute");
    expect(col.style.top).toBe("72px");
    expect(col.style.right).toBe("24px");
    expect(col.style.bottom).toBe("24px");
    expect(col.querySelector("[data-glass]")).not.toBeNull();
    expect(screen.getByText("PASO 3 · DETECCIÓN")).toBeTruthy();
  });

  it("plegado deja una pastilla de cristal pegada al borde derecho", () => {
    render(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="Detección" stepIndex={2} stepKey="detect" wide={false}><p>a</p></RightPanelColumn>);
    const pastilla = screen.getByRole("button", { name: /PANEL ▸ Detección/ }).closest("aside") as HTMLElement;
    expect(pastilla.hasAttribute("data-glass")).toBe(true);
    expect(pastilla.style.top).toBe("72px");
    expect(pastilla.style.right).toBe("24px");
  });

  it("plegado conserva el contenido montado al cambiar de paso", async () => {
    const { rerender } = render(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="A" stepIndex={0} stepKey="a" wide={false}><input aria-label="nota" defaultValue="x" /></RightPanelColumn>);
    // El paso cambia de verdad: el contenido nuevo aparece aunque siga plegado.
    rerender(<RightPanelColumn collapsed onToggle={() => {}} stepLabel="B" stepIndex={0} stepKey="b" wide={false}><input aria-label="nota" defaultValue="x" /><p>contenido nuevo</p></RightPanelColumn>);
    // El cruce es «wait»: el contenido nuevo entra cuando acaba la salida del anterior.
    expect(await screen.findByText("contenido nuevo")).toBeTruthy();
    expect((screen.getByLabelText("nota") as HTMLInputElement).value).toBe("x");
    expect((document.querySelector("[data-panel-column]") as HTMLElement).style.display).toBe("none");
  });

  describe("al cruzar 1280 px", () => {
    const props = { collapsed: false, onToggle: () => {}, stepLabel: "Detección", stepIndex: 2, stepKey: "detect", wide: false } as const;
    const cuerpo = <input aria-label="nota" />;

    it("el campo es el mismo nodo, conserva lo escrito, el foco y el scroll", () => {
      const { rerender } = render(<RightPanelColumn {...props}>{cuerpo}</RightPanelColumn>);
      const campo = screen.getByLabelText("nota") as HTMLInputElement;
      fireEvent.change(campo, { target: { value: "a medias" } });
      campo.focus();
      const cuerpoPanel = document.querySelector(".ws-panel-body") as HTMLElement;
      cuerpoPanel.scrollTop = 123;
      expect(screen.queryByRole("region", { name: "Panel del paso" })).toBeNull();

      rerender(<RightPanelColumn {...props} estrecho altura="media" onAltura={() => {}}>{cuerpo}</RightPanelColumn>);
      expect(screen.getByRole("region", { name: "Panel del paso" }).contains(campo)).toBe(true);
      expect(screen.getByRole("button", { name: "Cambiar la altura del panel" })).toBeTruthy();
      expect(screen.getByLabelText("nota")).toBe(campo);
      expect(document.querySelectorAll('input[aria-label="nota"]').length).toBe(1);
      expect(campo.value).toBe("a medias");
      expect(document.activeElement).toBe(campo);
      expect(document.querySelector(".ws-panel-body")).toBe(cuerpoPanel);
      expect(cuerpoPanel.scrollTop).toBe(123);

      rerender(<RightPanelColumn {...props}>{cuerpo}</RightPanelColumn>);
      expect(screen.getByLabelText("nota")).toBe(campo);
      expect(campo.value).toBe("a medias");
      expect(document.activeElement).toBe(campo);
      expect(cuerpoPanel.scrollTop).toBe(123);
    });

    it("la pestaña de borde solo existe en ancho y el tirador solo en estrecho", () => {
      const { rerender } = render(<RightPanelColumn {...props}>{cuerpo}</RightPanelColumn>);
      expect(screen.queryByRole("button", { name: /Plegar el panel del paso/ })).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Cambiar la altura del panel" })).toBeNull();
      rerender(<RightPanelColumn {...props} estrecho>{cuerpo}</RightPanelColumn>);
      expect(screen.queryByRole("button", { name: /Plegar el panel del paso/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Cambiar la altura del panel" })).not.toBeNull();
    });
  });
});
