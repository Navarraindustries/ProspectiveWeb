import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../store/theme";
import { Button } from "./Button";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

describe("Button", () => {
  it.each(VARIANTS)("renders the %s variant and exposes it", (variant) => {
    render(<ThemeProvider><Button variant={variant}>Acción</Button></ThemeProvider>);
    const b = screen.getByRole("button", { name: "Acción" });
    expect(b).toHaveAttribute("data-variant", variant);
    expect(b).toHaveAttribute("data-size", "md");
  });

  it("the default variant is filled with --primary", () => {
    render(<ThemeProvider><Button>Guardar</Button></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Guardar" }).style.background).toContain("--primary");
  });

  it("exposes the size", () => {
    render(<ThemeProvider><Button size="sm" variant="ghost">x</Button></ThemeProvider>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "sm");
  });
});
