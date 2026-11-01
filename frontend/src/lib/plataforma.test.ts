import { describe, expect, it } from "vitest";
import { atajoPaleta, esMac, rotuloPaleta, teclasPaleta } from "./plataforma";

describe("plataforma", () => {
  it.each([
    [{ userAgentData: { platform: "macOS" } }, true],
    [{ platform: "MacIntel" }, true],
    [{ platform: "iPhone" }, true],
    [{ platform: "Win32" }, false],
    [{ platform: "", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }, false],
    [{ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" }, true],
  ])("esMac(%o) = %s", (nav, mac) => expect(esMac(nav)).toBe(mac));

  it("rótulos", () => {
    expect(atajoPaleta({ platform: "Win32" })).toBe("Ctrl K");
    expect(atajoPaleta({ platform: "MacIntel" })).toBe("⌘K");
    expect(rotuloPaleta({ platform: "Win32" })).toBe("Abrir la paleta de mandos (Ctrl+K)");
    expect(rotuloPaleta({ platform: "MacIntel" })).toBe("Abrir la paleta de mandos (⌘K)");
    expect(teclasPaleta({ platform: "MacIntel" })).toBe("Meta+K");
    expect(teclasPaleta({ platform: "Win32" })).toBe("Control+K");
  });

  it("sin argumento usa el navegador actual (jsdom: no Mac)", () => {
    expect(atajoPaleta()).toBe("Ctrl K");
  });
});
