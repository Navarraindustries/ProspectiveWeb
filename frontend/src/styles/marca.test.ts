import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { it, expect } from "vitest";
import { MARCA_D } from "../components/shell/marcaSkullApp";

const raiz = join(__dirname, "../..");
const png = (f: string) => { const b = readFileSync(join(raiz, "public", f)); return { firma: b.subarray(1, 4).toString(), ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) }; };
it("index.html enlaza el favicon SVG, el PNG de 32 y el apple-touch de 180", () => {
  const html = readFileSync(join(raiz, "index.html"), "utf8");
  expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  expect(html).toContain('sizes="32x32" href="/favicon-32.png"');
  expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
  expect(html).not.toContain('href="/icon.png"');
  expect(html).toMatch(/<title>Prospective<\/title>/);
});
it("los PNG existen con su tamaño", () => {
  expect(png("favicon-32.png")).toEqual({ firma: "PNG", ancho: 32, alto: 32 });
  expect(png("apple-touch-icon.png")).toEqual({ firma: "PNG", ancho: 180, alto: 180 });
});
it("el SVG es el icono de SkullApp en blanco sobre el cuadrado oscuro y se retiraron los PNG viejos", () => {
  const svg = readFileSync(join(raiz, "public/favicon.svg"), "utf8");
  expect(svg).toContain(MARCA_D);
  expect(svg).toContain('fill="#16181E"');
  expect(svg).not.toContain("<circle");
  expect(existsSync(join(raiz, "src/assets/logo.png"))).toBe(false);
  expect(existsSync(join(raiz, "public/icon.png"))).toBe(false);
});
