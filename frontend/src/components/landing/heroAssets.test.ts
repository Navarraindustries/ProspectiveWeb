import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(__dirname, "../../../public/media/landing");

interface HeroManifest {
  count: number;
  lesionFrame: number;
  window: { w: number; l: number };
  frames: string[];
}

const hero = JSON.parse(readFileSync(join(DIR, "hero.json"), "utf-8")) as HeroManifest;

function dirSize(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = join(dir, e.name);
    return sum + (e.isDirectory() ? dirSize(p) : statSync(p).size);
  }, 0);
}

describe("assets del hero de la landing", () => {
  it("el manifiesto declara 60 fotogramas", () => {
    expect(hero.count).toBe(60);
    expect(hero.frames).toHaveLength(60);
  });

  it("cada fotograma existe en disco", () => {
    for (const f of hero.frames) {
      expect(existsSync(join(DIR, "hero", f)), f).toBe(true);
    }
  });

  it("el fotograma de la lesión cae dentro de la secuencia", () => {
    expect(hero.lesionFrame).toBeGreaterThanOrEqual(0);
    expect(hero.lesionFrame).toBeLessThan(hero.count);
  });

  it("la ventana de detección es 600/60", () => {
    expect(hero.window).toEqual({ w: 600, l: 60 });
  });

  it("existen el render 3D y las dos imágenes de aneurismas", () => {
    for (const f of ["hero-3d.webp", "aneurismas.webp", "aneurismas-movil.webp"]) {
      expect(existsSync(join(DIR, f)), f).toBe(true);
    }
  });

  it("la carpeta pesa menos de 6 MB", () => {
    expect(dirSize(DIR)).toBeLessThan(6 * 1024 * 1024);
  });
});
