/* Que el pipeline no vuelva a llevar superficies opacas junto a las de cristal. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const PANELES = ["planning", "morphometry", "segmentation", "upload", "annotations", "vessels", "perforators"];
const leer = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const fuentes = PANELES.flatMap((d) => readdirSync(join(SRC, "components", d))
  .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
  .map((f) => `components/${d}/${f}`));

describe("cristal en el pipeline", () => {
  it("el recorrido ve los paneles", () => {
    expect(fuentes.length).toBeGreaterThan(20);
  });

  it("ningún panel usa el fondo opaco de tarjeta", () => {
    const opacos = fuentes.filter((f) => leer(f).includes('"var(--card)"'));
    expect(opacos).toEqual([]);
  });

  it("el dock y la cabecera del panel llevan el color del tramo", () => {
    expect(leer("components/stepper/StepDock.tsx")).toContain("tramoDePaso(i + 1)");
    expect(leer("components/RightPanelColumn.tsx")).toContain("tramoDePaso(stepIndex + 1)");
  });

  it("cada tramo tiene su tono en los dos temas", () => {
    const colores = leer("styles/tokens/colors.css");
    for (const t of ["preparar", "detectar", "medir", "dispositivo", "informe"]) {
      expect(colores.match(new RegExp(`--tramo-${t}:`, "g")), t).toHaveLength(2);
    }
  });

  it("los campos sin cristal propio toman el fondo de campo", () => {
    expect(leer("components/FileField.tsx")).toContain('"var(--field-bg)"');
  });
});
