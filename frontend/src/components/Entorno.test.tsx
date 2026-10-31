import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../store/theme";
import { Entorno, ENTORNO_SRC } from "./Entorno";

function renderEntorno(theme: "light" | "dark", props: { dense?: boolean } = {}) {
  localStorage.setItem("prospective.theme", theme);
  return render(
    <ThemeProvider>
      <Entorno {...props}>
        <p>contenido</p>
      </Entorno>
    </ThemeProvider>,
  );
}

describe("Entorno", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("en oscuro pinta la imagen decorativa y los hijos", () => {
    const { container } = renderEntorno("dark");
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(ENTORNO_SRC);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("contenido")).toBeTruthy();
  });

  it("con dense el velo usa --veil-dense", () => {
    const { container } = renderEntorno("dark", { dense: true });
    expect(container.innerHTML).toContain("var(--veil-dense)");
  });

  it("sin dense el velo usa --veil", () => {
    const { container } = renderEntorno("dark");
    expect(container.innerHTML).not.toContain("--veil-dense");
    expect(container.innerHTML).toContain("var(--veil)");
  });

  it("en tema claro no hay imagen", () => {
    const { container } = renderEntorno("light");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("contenido")).toBeTruthy();
  });

  it("con prefers-reduced-transparency no hay imagen", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) => ({ matches: q.includes("reduced-transparency"), media: q }) as MediaQueryList,
    );
    const { container } = renderEntorno("dark");
    expect(container.querySelector("img")).toBeNull();
  });
});
