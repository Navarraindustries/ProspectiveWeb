/* Los iconos son SVG propios (F2): un glifo de texto cambiaba con la fuente y
   «engranaje» ilustraba «Pedidos de clips». Todo nombre usado en el código existe. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "./Icon";

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !f.includes(".test.")) out.push(p);
  }
  return out;
}

describe("Icon", () => {
  it("dibuja un SVG con currentColor, no un carácter", () => {
    const { container } = render(<Icon name="ORDER" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("stroke")).toBe("currentColor");
    expect(container.textContent).toBe("");
  });
  it("todo name=\"…\" e icon=\"…\" del código existe", () => {
    const used = new Set<string>();
    for (const f of walk(join(__dirname, ".."))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:name|icon)=\{?"([A-Z_0-9]+)"\}?/g)) used.add(m[1]);
    }
    expect([...used].filter((n) => !ICON_NAMES.includes(n as never))).toEqual([]);
  });
  it("incluye los nombres nuevos de la gestión", () => {
    for (const n of ["PATIENTS", "STUDIES", "ORDER", "WORKSHOP", "PENDING", "SHARE", "RESUME", "OPEN", "DELETE", "RENAME", "UPLOAD", "LOGOUT", "PASSWORD", "MENU", "FILTER", "EXPORT", "PLUS", "CLOSE", "BACK", "CHEVRON_RIGHT", "CHEVRON_DOWN", "PIN"])
      expect(ICON_NAMES).toContain(n);
  });
  it("respeta size, color y style", () => {
    const { container } = render(<Icon name="HOME" size={24} color="red" style={{ opacity: 0.5 }} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
    expect(svg.style.color).toBe("red");
    expect(svg.style.opacity).toBe("0.5");
  });
});
