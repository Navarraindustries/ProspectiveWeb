import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leer = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

describe("lente de tarjeta", () => {
  const css = leer("components.css");

  it("crece lo mismo que las fichas de los clips", () => {
    const presets = leer("../motion/presets.ts");
    const ficha = presets.match(/lensCard = \{\s*whileHover: \{ scale: ([\d.]+) \}/)?.[1];
    expect(ficha).toBeDefined();
    expect(css).toContain(`.tarjeta-lente:hover { scale: ${ficha}; }`);
  });

  it("solo con ratón y sin movimiento reducido", () => {
    const i = css.indexOf(".tarjeta-lente:hover");
    const antes = css.slice(0, i);
    expect(antes.slice(antes.lastIndexOf("@media"))).toMatch(
      /\(hover: hover\) and \(pointer: fine\) and \(prefers-reduced-motion: no-preference\)/,
    );
  });

  it("las tarjetas que crecían por su cuenta usan la regla común", () => {
    for (const f of ["../components/patients/patients.css", "office.css"]) {
      expect(leer(f), f).not.toMatch(/transform: scale\(1\.02\)/);
    }
  });

  it("la tarjeta de los paneles la lleva siempre", () => {
    expect(leer("../components/PanelHead.tsx")).toContain("`tarjeta-lente ${className}`");
  });
});
