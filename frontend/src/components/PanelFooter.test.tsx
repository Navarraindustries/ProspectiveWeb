import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelFooter } from "./PanelFooter";

describe("PanelFooter", () => {
  it("pinta la nota encima de los botones y lleva la clase del pie", () => {
    const { container } = render(<PanelFooter note="Guardado hace un momento"><button type="button">Siguiente</button></PanelFooter>);
    const note = screen.getByText("Guardado hace un momento");
    const btn = screen.getByRole("button", { name: "Siguiente" });
    expect(note.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".ws-panel-footer")).not.toBeNull();
  });
});
