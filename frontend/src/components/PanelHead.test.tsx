import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "./PanelHead";

describe("SectionLabel", () => {
  it("va en minúscula, 13 px y peso 500", () => {
    render(<SectionLabel>Antecedentes</SectionLabel>);
    const el = screen.getByText("Antecedentes");
    expect(el.style.textTransform).toBe("");
    expect(el.style.fontSize).toContain("--text-label");
    expect(el.style.fontWeight).toContain("--weight-label");
  });
});
