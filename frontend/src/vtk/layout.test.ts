import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PANES, DEFAULT_LAYOUT, FRACTION_MAX, FRACTION_MIN, LAYOUT_KEY, LAYOUT_KEY_V1, LAYOUT_KEY_V2, STRIP_HIDDEN_KEY_V1,
  defaultFraction, enlarge, flipSide, isValidLayout, loadLayout, migrateV1, migrateV2, promote, rotate, saveLayout, setMainFraction,
  setPreset, showAll, swapPanes, toggleEqual, togglePane, toggleSolo, visiblePanes,
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
  it("promote sube la vista y deja las pequeñas en el orden fijo 3D, AX, COR, SAG, VOLUMEN", () => {
    const l = promote(DEFAULT_LAYOUT, "mip");
    expect(l.main).toBe("mip");
    expect(l.side).toEqual(["scene", "axial", "coronal", "sagital"]);
  });
  it("F1-111: tras elegir VOL y luego AX, las pequeñas salen en orden fijo", () => {
    const l = promote(promote(DEFAULT_LAYOUT, "mip"), "axial");
    expect(l.main).toBe("axial");
    expect(l.side).toEqual(["scene", "coronal", "sagital", "mip"]);
    // Con la 3D de principal, AX, COR, SAG, VOLUMEN, venga de donde venga.
    expect(promote(promote(promote(DEFAULT_LAYOUT, "sagital"), "coronal"), "scene").side)
      .toEqual(["axial", "coronal", "sagital", "mip"]);
  });
  it("el arrastre de dos pequeñas cambia el orden hasta la próxima principal", () => {
    const l = swapPanes(DEFAULT_LAYOUT, "axial", "sagital");
    expect(l.side).toEqual(["sagital", "coronal", "axial", "mip"]);
    expect(promote(l, "coronal").side).toEqual(["scene", "axial", "sagital", "mip"]);
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
  it("setPreset cambia el preset, conserva la asignación y devuelve la fracción por defecto del preset", () => {
    const l = setPreset({ ...DEFAULT_LAYOUT, mainFraction: 0.6 }, "abajo");
    expect(l.preset).toBe("abajo");
    expect(l.mainFraction).toBe(defaultFraction("abajo"));
    expect(setPreset(DEFAULT_LAYOUT, "derecha")).toBe(DEFAULT_LAYOUT);
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
    expect(l).toEqual({ ...DEFAULT_LAYOUT, preset: "abajo", main: "coronal", side: ["axial", "scene", "sagital", "mip"], mainFraction: 0.74 });
  });
  it("la franja oculta de antes deja solo la principal", () => {
    const l = migrateV1({ main: "scene", strip: ["axial", "coronal", "sagital", "mip"] }, true)!;
    expect(visiblePanes(l)).toEqual(["scene"]);
  });
  it("devuelve null con basura", () => {
    expect(migrateV1({ main: "axial", strip: ["axial", "mip"] }, false)).toBeNull();
    expect(migrateV1("x", false)).toBeNull();
  });
});

describe("persistencia", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it("solo la bandera de franja oculta, sin v1, deja la principal sola y se persiste", () => {
    localStorage.setItem(STRIP_HIDDEN_KEY_V1, "1");
    const l = loadLayout();
    expect(l).toEqual({ ...DEFAULT_LAYOUT, hidden: DEFAULT_LAYOUT.side });
    expect(localStorage.getItem(STRIP_HIDDEN_KEY_V1)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY)!)).toEqual(l);
  });
  it("una v1 corrupta se descarta: se borran las claves viejas y se respeta la franja oculta", () => {
    localStorage.setItem(LAYOUT_KEY_V1, "{no json");
    localStorage.setItem(STRIP_HIDDEN_KEY_V1, "1");
    expect(loadLayout()).toEqual({ ...DEFAULT_LAYOUT, hidden: DEFAULT_LAYOUT.side });
    expect(localStorage.getItem(LAYOUT_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STRIP_HIDDEN_KEY_V1)).toBeNull();
  });
  it("guarda y lee en la clave v3", () => {
    saveLayout(promote(DEFAULT_LAYOUT, "coronal"));
    expect(loadLayout()).toEqual(promote(DEFAULT_LAYOUT, "coronal"));
    expect(localStorage.getItem(LAYOUT_KEY)).not.toBeNull();
  });
  it("sin v2 ni v3, migra la v1 y la bandera de franja, y borra las claves viejas", () => {
    localStorage.setItem(LAYOUT_KEY_V1, JSON.stringify({ main: "mip", strip: ["axial", "coronal", "sagital", "scene"] }));
    localStorage.setItem(STRIP_HIDDEN_KEY_V1, "1");
    const l = loadLayout();
    expect(visiblePanes(l)).toEqual(["mip"]);
    expect(localStorage.getItem(LAYOUT_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STRIP_HIDDEN_KEY_V1)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY)!)).toEqual(l);
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

describe("migración desde v2", () => {
  const v2 = { main: "scene", side: ["axial", "coronal", "sagital", "mip"], mainFraction: 0.72 };
  beforeEach(() => localStorage.clear());
  it("SOLA es minimizar las demás", () => {
    expect(visiblePanes(migrateV2({ ...v2, preset: "sola" })!)).toEqual(["scene"]);
  });
  it("CUATRO son cuatro iguales sin VOLUMEN, y sin perder la grande si era VOLUMEN", () => {
    const l = migrateV2({ ...v2, preset: "cuatro" })!;
    expect(l.equal).toBe(true);
    expect(l.hidden).toEqual(["mip"]);
    const m = migrateV2({ ...v2, main: "mip", side: ["axial", "coronal", "sagital", "scene"], preset: "cuatro" })!;
    expect(m.main).toBe("scene");
    expect(isValidLayout(m)).toBe(true);
  });
  it("DERECHA y ABAJO conservan el lado y la fracción", () => {
    expect(migrateV2({ ...v2, preset: "abajo", mainFraction: 0.6 })).toEqual({ ...DEFAULT_LAYOUT, preset: "abajo", mainFraction: 0.6 });
  });
  it("loadLayout la migra una vez y borra la clave vieja", () => {
    localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify({ ...v2, preset: "sola" }));
    expect(visiblePanes(loadLayout())).toEqual(["scene"]);
    expect(localStorage.getItem(LAYOUT_KEY_V2)).toBeNull();
    expect(localStorage.getItem(LAYOUT_KEY)).not.toBeNull();
  });
});

describe("encender y minimizar", () => {
  it("minimizar una pequeña la saca de las visibles y encenderla la devuelve", () => {
    const l = togglePane(DEFAULT_LAYOUT, "coronal");
    expect(visiblePanes(l)).toEqual(["scene", "axial", "sagital", "mip"]);
    expect(togglePane(l, "coronal").hidden).toEqual([]);
  });
  it("minimizar la grande la cede a la siguiente, que nunca queda oculta", () => {
    const l = togglePane(DEFAULT_LAYOUT, "scene");
    expect(l.main).toBe("axial");
    expect(l.hidden).toEqual(["scene"]);
    expect(isValidLayout(l)).toBe(true);
  });
  it("la última vista no se minimiza", () => {
    const l = toggleSolo(DEFAULT_LAYOUT, "axial");
    expect(togglePane(l, "axial")).toBe(l);
  });
  it("Todas devuelve las cinco", () => {
    expect(visiblePanes(showAll(togglePane(DEFAULT_LAYOUT, "mip")))).toHaveLength(5);
  });
  it("subir a principal una vista minimizada la enciende", () => {
    const l = promote(togglePane(DEFAULT_LAYOUT, "mip"), "mip");
    expect(l.main).toBe("mip");
    expect(l.hidden).toEqual([]);
  });
});

describe("solo esta vista", () => {
  it("el doble clic deja una y el siguiente devuelve lo que había, también lo minimizado", () => {
    const antes = togglePane(DEFAULT_LAYOUT, "mip");
    const solo = toggleSolo(antes, "coronal");
    expect(visiblePanes(solo)).toEqual(["coronal"]);
    const despues = toggleSolo(solo, "coronal");
    expect(despues.hidden).toEqual(["mip"]);
    expect(despues.soloFrom).toBeNull();
    expect(isValidLayout(solo)).toBe(true);
  });
});

describe("rotar", () => {
  it("la siguiente vista encendida pasa al sitio grande y la vuelta completa regresa", () => {
    const l = togglePane(DEFAULT_LAYOUT, "coronal");
    const orden = [rotate(l)];
    while (orden.length < 3) orden.push(rotate(orden[orden.length - 1]));
    expect(orden.map((x) => x.main)).toEqual(["axial", "sagital", "mip"]);
    expect(rotate(orden[2]).main).toBe("scene");
  });
  it("con una sola vista pasa a la siguiente de las cinco, de una en una", () => {
    const solo = toggleSolo(DEFAULT_LAYOUT, "mip");
    const next = rotate(solo);
    expect(visiblePanes(next)).toEqual(["scene"]);
    expect(isValidLayout(next)).toBe(true);
  });
  it("rotar nunca oculta ni enciende vistas", () => {
    const l = togglePane(DEFAULT_LAYOUT, "sagital");
    expect(new Set(visiblePanes(rotate(l)))).toEqual(new Set(visiblePanes(l)));
  });
});

describe("lado y tamaños", () => {
  it("el lado cambia y la fracción vuelve a su defecto", () => {
    const l = flipSide({ ...DEFAULT_LAYOUT, mainFraction: 0.6 });
    expect(l.preset).toBe("abajo");
    expect(l.mainFraction).toBe(defaultFraction("abajo"));
  });
  it("agrandar deshace Igualar: si no, no se vería grande", () => {
    const l = enlarge(toggleEqual(DEFAULT_LAYOUT), "axial");
    expect(l.main).toBe("axial");
    expect(l.equal).toBe(false);
  });
  it("todo estado alcanzable es válido", () => {
    for (const id of ALL_PANES) {
      expect(isValidLayout(togglePane(DEFAULT_LAYOUT, id))).toBe(true);
      expect(isValidLayout(toggleSolo(DEFAULT_LAYOUT, id))).toBe(true);
      expect(isValidLayout(rotate(toggleSolo(DEFAULT_LAYOUT, id)))).toBe(true);
    }
  });
});
