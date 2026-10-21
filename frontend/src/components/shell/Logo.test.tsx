import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("compacto dibuja solo la marca", () => {
    const { container } = render(<Logo compact />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });
  it("completo añade el nombre y la firma", () => {
    render(<Logo />);
    expect(screen.getByText("PROSPECTIVE")).toBeInTheDocument();
    expect(screen.getByText("por SkullApp")).toBeInTheDocument();
  });
});
