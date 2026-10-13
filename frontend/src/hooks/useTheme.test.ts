/* El tema por defecto es oscuro aunque el sistema operativo pida claro: la
   identidad A se diseñó oscura y solo una elección guardada por la persona
   puede cambiarlo. */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

function systemPrefers(scheme: "light" | "dark") {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes(scheme),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("sin nada guardado es oscuro aunque el sistema prefiera claro", () => {
    systemPrefers("light");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("una elección guardada manda sobre el defecto", () => {
    systemPrefers("dark");
    localStorage.setItem("prospective.theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("light");
  });
});
