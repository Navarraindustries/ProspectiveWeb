import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(new URL(f, import.meta.url), "utf-8");

describe("ilustración del quirófano en pantallas bajas", () => {
  it("acota el ancho por la altura libre para que quepa entera (escritorio y tableta)", () => {
    const regla = css("./quirofano.css").split("\n").find((l) => l.includes("width: min(1180px, 100%, calc((100dvh"));
    expect(regla).toBeTruthy();
  });
  it("sin dvh queda la cota con vh, declarada justo antes", () => {
    const lineas = css("./quirofano.css").split("\n").map((l) => l.trim());
    const dvh = lineas.findIndex((l) => l.startsWith("width: min(1180px, 100%, calc((100dvh"));
    expect(dvh).toBeGreaterThan(0);
    const previa = lineas.slice(0, dvh).reverse().find((l) => l.startsWith("width:"));
    expect(previa).toBe("width: min(1180px, 100%, calc((100vh - 150px) * 16 / 9.5));");
  });
  it("el móvil apilado sigue creciendo con su contenido", () => {
    expect(css("./quirofano.css")).toMatch(/\.qz\[data-movil\] \{ width: min\(1180px, 100%\); aspect-ratio: auto;/);
  });
});

describe("velo del recorrido", () => {
  it("usa el token denso en el velo y en el hueco", () => {
    const t = css("./tour/tour.css");
    expect(t).toContain("background: var(--scrim-dense)");
    expect(t).toContain("0 0 0 100vmax var(--scrim-dense)");
    expect(t).not.toMatch(/var\(--scrim\)/);
  });
});
