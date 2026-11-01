/* Tarea 12: la landing sigue el tema de la aplicación. Este fichero vigila que
   landing.css no vuelva a suponer un fondo negro (ningún color escrito a mano
   fuera de los tokens), que la pantalla del hero exista en claro y que el texto
   de la portada aguante 4,5:1 en los dos temas sobre lo que de verdad tiene
   detrás. Los hex y los alfas salen de tokens/colors.css. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { OPACIDAD_COTA_INACTIVA } from "../components/landing/DiagramaSaco";
import { tieneDeclaracion } from "../test/cssReglas";
import { ratio } from "./contraste";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
const landing = read("landing.css");
const colores = read("tokens/colors.css");

describe("landing.css sin colores escritos a mano", () => {
  /* Lista de permitidos: «selector» → motivo. Hoy vacía; un color propio de la
     landing va como token en colors.css, con su variante clara. */
  const PERMITIDOS: Record<string, string> = {};

  it("ningún #hex, rgb(), rgba() ni hsl() fuera de los bloques de tokens", () => {
    const sinComentarios = landing.replace(/\/\*[\s\S]*?\*\//g, "");
    const fallos: string[] = [];
    for (const m of sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim();
      if (PERMITIDOS[selector]) continue;
      const malos = m[2].match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi);
      if (malos) fallos.push(`${selector}: ${malos.join(", ")}`);
    }
    expect(fallos).toEqual([]);
  });

  it("la cabecera ya no dice que la landing es dark-only", () => {
    expect(landing.slice(0, 800)).not.toMatch(/dark-only/i);
  });

  it("el rebote del scroll pinta el lienzo del tema, no un negro fijo", () => {
    expect(tieneDeclaracion(landing, ":root:has(.landing-stitch) body", "background: var(--canvas)")).toBe(true);
  });

  it("los escenarios oscuros pintan el negro del visor en los dos temas", () => {
    expect(tieneDeclaracion(landing, ".landing-stitch .hero-cortes__escenario", "background: var(--viewer-bg)")).toBe(true);
    expect(tieneDeclaracion(landing, ".landing-stitch .franja-casos", "background: var(--viewer-bg)")).toBe(true);
  });

  it("en claro y por encima de 1024 el escenario del hero es una pantalla con radio y margen", () => {
    const sel = ':root[data-theme="light"] .landing-stitch:is([data-tramo="estrecho"], [data-tramo="ancho"], [data-tramo="grande"]) .hero-cortes__escenario';
    expect(tieneDeclaracion(landing, sel, "border-radius: var(--radius-xl)")).toBe(true);
    expect(tieneDeclaracion(landing, sel, "margin: 16px 16px 0")).toBe(true);
    // El modo quieto (sin scroll consumido) también es pantalla, pero crece con su contenido.
    const quieto = ':root[data-theme="light"] .landing-stitch:is([data-tramo="estrecho"], [data-tramo="ancho"], [data-tramo="grande"]) .hero-cortes--quieto .hero-cortes__escenario';
    expect(tieneDeclaracion(landing, quieto, "height: auto")).toBe(true);
  });
});

/* ── Contraste ────────────────────────────────────────────────────────────── */
const bloque = (sel: string) => {
  const i = colores.indexOf(sel + " {");
  expect(i, sel).toBeGreaterThan(-1);
  return colores.slice(i, colores.indexOf("\n}", i));
};
const TEMAS = [
  ["oscuro", bloque(':root,\n[data-theme="dark"]')],
  ["claro", bloque('[data-theme="light"]')],
] as const;
const OSCURO = TEMAS[0][1];

const deHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const aHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mezclar = (arriba: number[], a: number, abajo: number[]) => abajo.map((u, i) => u * (1 - a) + arriba[i] * a);
const hexDe = (b: string, n: string) => {
  const m = b.match(new RegExp(`\\n\\s*${n}:\\s*(#[0-9A-Fa-f]{6})\\b`));
  expect(m, `${n} no es #RRGGBB`).not.toBeNull();
  return m![1];
};
/** Capas de un token de cristal, de abajo arriba (mismas formas que cristal.audit.test.ts). */
function capas(b: string, n: string): { rgb: number[]; a: number }[] {
  const m = b.match(new RegExp(`\\n\\s*${n}:\\s*([^;]+);`));
  expect(m, `${n} no está en el bloque`).not.toBeNull();
  const v = m![1].trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return [{ rgb: deHex(v), a: 1 }];
  const rgbas = [...v.matchAll(/rgba\((\d+), ?(\d+), ?(\d+), ?([0-9.]+)\)/g)].map((x) => ({ rgb: [+x[1], +x[2], +x[3]], a: +x[4] }));
  return v.startsWith("linear-gradient(") ? [rgbas[2], rgbas[0]] : rgbas;
}
const sobre = (b: string, cristal: string, fondo: string) =>
  aHex(capas(b, cristal).reduce((acc, c) => mezclar(c.rgb, c.a, acc), deHex(fondo)));

const TEXTOS = ["--foreground", "--muted-foreground", "--data"];

describe("contraste de la landing en los dos temas", () => {
  for (const [tema, b] of TEMAS) {
    const lienzo = hexDe(b, "--canvas");
    const fondos = [
      { donde: "el lienzo (--canvas)", fondo: lienzo },
      { donde: "el cristal de las tarjetas (--glass) sobre el lienzo", fondo: sobre(b, "--glass", lienzo) },
      { donde: "el cristal denso (--glass-dense) sobre el lienzo", fondo: sobre(b, "--glass-dense", lienzo) },
      // La pastilla de la nav flota sobre el escenario negro del hero en los dos temas.
      { donde: "la nav (--glass) sobre el escenario (--viewer-bg)", fondo: sobre(b, "--glass", hexDe(b, "--viewer-bg")) },
    ];

    it(`en ${tema}, el texto aguanta 4,5:1 sobre el lienzo y el cristal de la landing`, () => {
      const fallos: string[] = [];
      for (const { donde, fondo } of fondos) {
        for (const n of TEXTOS) {
          const r = ratio(hexDe(b, n), fondo);
          if (r < 4.5) fallos.push(`${n} sobre ${donde} (${fondo}): ${r.toFixed(2)}:1`);
        }
      }
      expect(fallos).toEqual([]);
    });

    /* Diagrama del saco (Índices): las cotas inactivas se apagan con opacidad sobre el
       lienzo. El rótulo es texto (4,5:1) y la línea es gráfico (3:1). */
    it(`en ${tema}, las cotas inactivas del diagrama siguen legibles`, () => {
      const rotulo = aHex(mezclar(deHex(hexDe(b, "--foreground")), OPACIDAD_COTA_INACTIVA, deHex(lienzo)));
      const linea = aHex(mezclar(deHex(hexDe(b, "--muted-foreground")), OPACIDAD_COTA_INACTIVA, deHex(lienzo)));
      expect(ratio(rotulo, lienzo)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(linea, lienzo)).toBeGreaterThanOrEqual(3);
    });
  }

  /* Dentro de los escenarios (data-theme="dark") mandan los tokens oscuros en los dos
     temas: el texto del hero y la ventana de detección van sobre el negro del visor. */
  it("en el escenario oscuro, el texto aguanta 4,5:1 sobre el visor y sobre la ventana", () => {
    const visor = hexDe(OSCURO, "--viewer-bg");
    const fallos: string[] = [];
    for (const { donde, fondo } of [
      { donde: "el visor", fondo: visor },
      { donde: "la ventana (--glass-dense) sobre el visor", fondo: sobre(OSCURO, "--glass-dense", visor) },
    ]) {
      for (const n of TEXTOS) {
        const r = ratio(hexDe(OSCURO, n), fondo);
        if (r < 4.5) fallos.push(`${n} sobre ${donde} (${fondo}): ${r.toFixed(2)}:1`);
      }
    }
    expect(fallos).toEqual([]);
  });
});
