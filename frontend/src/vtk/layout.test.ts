import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT, FRACTION_MAX, FRACTION_MIN, LAYOUT_KEY_V1, LAYOUT_KEY_V2, STRIP_HIDDEN_KEY_V1,
  defaultFraction, isValidLayout, loadLayout, migrateV1, promote, saveLayout, setMainFraction, setPreset, swapPanes,
} from "./layout";

describe("intercambiar y subir", () => {
  it("swapPanes intercambia dos huecos y deja el resto igual", () => {
    const l = swapPanes(DEFAULT_LAYOUT, "axial", "mip");
    expect(l.side).toEqual(["mip", "coronal", "sagital", "axial"]);
    expect(l.main).toBe("scene");
  });
  it("swapPanes con la principal es lo mismo que promote", () => {
    expect(swapPanes(DEFAULT_LAYOUT, "scene", "coronal")).toEqual(promote(DEFAULT_LAYOUT, "coronal"));
  });
  it("promote sube el hueco y baja la principal a su sitio", () => {
    const l = promote(DEFAULT_LAYOUT, "mip");
    expect(l.main).toBe("mip");
    expect(l.side).toEqual(["axial", "coronal", "sagital", "scene"]);
  });
  it("promote de la principal y swap de una vista consigo misma no cambian nada", () => {
    expect(promote(DEFAULT_LAYOUT, "scene")).toBe(DEFAULT_LAYOUT);
    expect(swapPanes(DEFAULT_LAYOUT, "axial", "axial")).toBe(DEFAULT_LAYOUT);
  });
  it("dos promotes seguidos devuelven al inicio", () => {
    expect(promote(promote(DEFAULT_LAYOUT, "axial"), "scene")).toEqual(DEFAULT_LAYOUT);
  });
});

describe("preset y fracción", () => {
  it("setPreset cambia solo el preset y conserva la asignación", () => {
    const l = setPreset(DEFAULT_LAYOUT, "abajo");
    expect(l.preset).toBe("abajo");
    expect(l.main).toBe("scene"); expect(l.side).toEqual(DEFAULT_LAYOUT.side);
  });
  it("setMainFraction acota a los límites", () => {
    expect(setMainFraction(DEFAULT_LAYOUT, 0.1).mainFraction).toBe(FRACTION_MIN);
    expect(setMainFraction(DEFAULT_LAYOUT, 0.99).mainFraction).toBe(FRACTION_MAX);
    expect(setMainFraction(DEFAULT_LAYOUT, 0.6).mainFraction).toBe(0.6);
    expect(setMainFraction(DEFAULT_LAYOUT, Number.NaN).mainFraction).toBe(defaultFraction("derecha"));
  });
  it("los defectos por preset son los del diseño", () => {
    expect(defaultFraction("derecha")).toBe(0.72);
    expect(defaultFraction("abajo")).toBe(0.74);
  });
});

describe("validez", () => {
  it("acepta el defecto y rechaza vistas repetidas, ausentes, fracción fuera de rango o preset desconocido", () => {
    expect(isValidLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, side: ["axial", "axial", "sagital", "mip"] })).toBe(false);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, side: ["axial", "coronal", "sagital"] })).toBe(false);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, mainFraction: 0.2 })).toBe(false);
    expect(isValidLayout({ ...DEFAULT_LAYOUT, preset: "libre" })).toBe(false);
    expect(isValidLayout(null)).toBe(false);
  });
});

describe("migración desde v1", () => {
  it("convierte {main, strip} en preset abajo con la fracción de la franja de antes", () => {
    const l = migrateV1({ main: "coronal", strip: ["axial", "scene", "sagital", "mip"] }, false);
    expect(l).toEqual({ preset: "abajo", main: "coronal", side: ["axial", "scene", "sagital", "mip"], mainFraction: 0.74 });
  });
  it("la franja oculta de antes se convierte en preset sola", () => {
    expect(migrateV1({ main: "scene", strip: ["axial", "coronal", "sagital", "mip"] }, true)?.preset).toBe("sola");
  });
  it("devuelve null con basura", () => {
    expect(migrateV1({ main: "axial", strip: ["axial", "mip"] }, false)).toBeNull();
    expect(migrateV1("x", false)).toBeNull();
  });
});

describe("persistencia", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it("solo la bandera de franja oculta, sin v1, da el defecto en preset sola y se persiste", () => {
    localStorage.setItem(STRIP_HIDDEN_KEY_V1, "1");
    const l = loadLayout();
    expect(l).toEqual({ ...DEFAULT_LAYOUT, preset: "sola" });
    expect(localStorage.getItem(STRIP_HIDDEN_KEY_V1)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY_V2)!)).toEqual(l);
  });
  it("guarda y lee en la clave v2", () => {
    saveLayout(promote(DEFAULT_LAYOUT, "coronal"));
    expect(loadLayout()).toEqual(promote(DEFAULT_LAYOUT, "coronal"));
    expect(localStorage.getItem(LAYOUT_KEY_V2)).not.toBeNull();
  });
  it("sin v2, migra la v1 y la bandera de franja, y borra las claves viejas", () => {
    localStorage.setItem(LAYOUT_KEY_V1, JSON.stringify({ main: "mip", strip: ["axial", "coronal", "sagital", "scene"] }));
    localStorage.setItem(STRIP_HIDDEN_KEY_V1, "1");
    const l = loadLayout();
    expect(l).toEqual({ preset: "sola", main: "mip", side: ["axial", "coronal", "sagital", "scene"], mainFraction: 0.74 });
    expect(localStorage.getItem(LAYOUT_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STRIP_HIDDEN_KEY_V1)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY_V2)!)).toEqual(l);
  });
  it("con v2 inválida o sin nada vuelve al defecto", () => {
    localStorage.setItem(LAYOUT_KEY_V2, "{no json");
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    localStorage.clear();
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });
  it("con el almacenamiento bloqueado no lanza y devuelve el defecto", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(DEFAULT_LAYOUT)).not.toThrow();
    get.mockRestore(); set.mockRestore();
  });
});
