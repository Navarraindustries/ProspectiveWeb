import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { mainOptions, presetOptions } from "./mainOptions";

// Los botones de reencuadre se llaman igual en toda la app: ENCUADRAR (la vista
// entera) y AL PUNTO (el plano vuelve al punto compartido). CENTRAR y AJUSTAR
// dejaron de existir como etiqueta.
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") && !/\.test\./.test(n) ? [p] : [];
  });
}

const root = join(__dirname, "..");
const files = [...tsxFiles(join(root, "vtk")), ...tsxFiles(join(root, "components"))];
const OLD = /(?:label\s*[:=]\s*\{?\s*["'`]|>\s*)(CENTRAR|AJUSTAR|Ajustar)(?:["'`]|\s*<)/;
const NEW = /(?:label\s*[:=]\s*\{?\s*["'`]|>\s*|\[\s*"fit",\s*")ENCUADRAR(?:["'`]|\s*<)/; // Viewer la declara en CAMERA_BUTTONS

describe("nombres de los botones", () => {
  it("VOLUMEN construye sus preajustes por modalidad (sin lista fija)", () => {
    const src = readFileSync(join(root, "vtk", "MipView.tsx"), "utf8");
    expect(src).toMatch(/volumePresetsFor\(meta\.modality\)/);
    expect(src).not.toMatch(/VOLUME_PRESETS/);
  });
  it("ninguna etiqueta usa CENTRAR, AJUSTAR ni Ajustar", () => {
    const bad = files.filter((f) => OLD.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("la regex distingue etiquetas de comentarios", () => {
    expect(OLD.test('<X label="CENTRAR" />')).toBe(true);
    expect(OLD.test("{ key: 'a', label: 'AJUSTAR' }")).toBe(true);
    expect(OLD.test("<b>Ajustar</b>")).toBe(true);
    expect(OLD.test("// antes CENTRAR")).toBe(false);
  });
  it("ENCUADRAR está en MipView, Viewer y ObliqueView", () => {
    for (const n of ["MipView.tsx", "Viewer.tsx", "ObliqueView.tsx"]) {
      expect(readFileSync(join(root, "vtk", n), "utf8"), n).toMatch(NEW);
    }
  });
});

// Spec §4: «ninguna celda enseña dos grupos sin prefijo con las mismas
// opciones». AX · COR aparecen en EJE (VOLUMEN), VISTA (3D) y PRINCIPAL
// (cabecera): cada grupo que las lleve tiene que decir qué eje elige. El
// prefijo va en `label=` (dentro del grupo, para que el nivel del HUD lo
// oculte con los botones); la cabecera conserva «PRINCIPAL ▸» como rótulo
// propio delante del grupo (spec §4: «se conserva»), fuera de `data-hud`.
const OPTION_FNS: Record<string, () => { label: string }[]> = {
  mainOptions: () => mainOptions(),
  presetOptions: () => presetOptions(1200),
};
function unprefixedAxisGroups(src: string): string[] {
  const strings = (t: string) => [...t.matchAll(/"([^"\\]*)"/g)].map((m) => m[1]);
  const bad: string[] = [];
  for (const m of src.matchAll(/<HudToggleGroup\b[\s\S]*?\/>/g)) {
    const group = m[0];
    const labels = new Set(strings(group));
    // Constantes del mismo archivo (PLANE_OPTIONS, CAMERA_BUTTONS…).
    for (const [, name] of group.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
      const def = src.match(new RegExp(`const ${name}\\b[^=]*=\\s*([\\s\\S]*?);\\r?\\n`));
      if (def) strings(def[1]).forEach((s) => labels.add(s));
    }
    for (const [, fn] of group.matchAll(/\b(\w+)\(/g)) OPTION_FNS[fn]?.().forEach((o) => labels.add(o.label));
    if (!(labels.has("AX") && labels.has("COR"))) continue;
    if (/\blabel=/.test(group)) continue;
    if (/mainCaption\}<\/span>\s*$/.test(src.slice(Math.max(0, m.index! - 160), m.index))) continue;
    bad.push(group.slice(0, 80));
  }
  return bad;
}

describe("grupos con las mismas opciones (spec §4)", () => {
  it("todo grupo con AX y COR lleva prefijo en MipView, Viewer y ViewerHeader", () => {
    let seen = 0;
    for (const n of ["MipView.tsx", "Viewer.tsx", "ViewerHeader.tsx"]) {
      const src = readFileSync(join(root, "vtk", n), "utf8");
      seen += (src.match(/<HudToggleGroup\b/g) ?? []).length;
      expect(unprefixedAxisGroups(src), n).toEqual([]);
    }
    expect(seen).toBeGreaterThan(10);
  });
  it("el detector encuentra los grupos de ejes y ve un grupo sin prefijo", () => {
    const src = 'const OPTS = [{ key: "axial", label: "AX" }, { key: "coronal", label: "COR" }];\n'
      + "<HudToggleGroup options={OPTS} value={v} onChange={f} />\n"
      + '<HudToggleGroup label="EJE ▸" options={OPTS} value={v} onChange={f} />\n'
      + "<HudToggleGroup options={mainOptions()} value={v} onChange={f} />\n"
      + '<HudToggleGroup options={[{ key: "a", label: "MIP" }]} value={v} onChange={f} />\n';
    expect(unprefixedAxisGroups(src)).toHaveLength(2);
  });
});
