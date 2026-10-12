// frontend/src/vtk/shortcuts.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ShortcutsSheet } from "./hud/ShortcutsSheet";
import { matchShortcut, RESERVED_KEYS, SHORTCUTS, shortcutsByScope } from "./shortcuts";
const ev = (p: Partial<{ key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) => ({ key: "", code: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...p });
describe("tabla de atajos", () => {
  it("no hay teclas duplicadas en el mismo ámbito y las reservadas no se asignan", () => {
    for (const scope of ["visor", "celda", "flujo", "raton"] as const) {
      const keys = SHORTCUTS.filter((s) => s.scope === scope).map((s) => s.keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const s of SHORTCUTS) for (const r of RESERVED_KEYS) expect(s.keys.split("+").map((k) => k.trim())).not.toContain(r);
  });
  it("resuelve S, C, espacio, Alt+4 y ?", () => {
    expect(matchShortcut(ev({ key: "s", code: "KeyS" }), null)).toBe("sync");
    expect(matchShortcut(ev({ key: "c", code: "KeyC" }), null)).toBe("center");
    expect(matchShortcut(ev({ key: "l", code: "KeyL" }), null)).toBe("center-lesion");
    expect(matchShortcut(ev({ key: " ", code: "Space" }), null)).toBe("cine-toggle");
    expect(matchShortcut(ev({ key: "4", code: "Digit4", altKey: true }), null)).toBe("preset-cuatro");
    expect(matchShortcut(ev({ key: "?", code: "Slash", shiftKey: true }), null)).toBe("help");
    expect(matchShortcut(ev({ key: "3", code: "Digit3" }), null)).toBe("step-3");
  });
  it("no actúa con el foco en un campo de texto", () => {
    const input = document.createElement("input");
    expect(matchShortcut(ev({ key: "s", code: "KeyS" }), input)).toBeNull();
    expect(matchShortcut(ev({ key: " ", code: "Space" }), input)).toBeNull();
  });
  it("shortcutsByScope agrupa todo", () => {
    const g = shortcutsByScope(); expect(g.visor.length + g.celda.length + g.flujo.length + g.raton.length).toBe(SHORTCUTS.length);
  });
});

describe("matchShortcut — bordes", () => {
  it("el espacio sobre un botón o un enlace es suyo (pulsarlo), no del cine", () => {
    expect(matchShortcut(ev({ key: " ", code: "Space" }), document.createElement("button"))).toBeNull();
    expect(matchShortcut(ev({ key: " ", code: "Space" }), document.createElement("a"))).toBeNull();
    // S sobre un botón sigue siendo VINCULAR: el botón no usa la S.
    expect(matchShortcut(ev({ key: "s", code: "KeyS" }), document.createElement("button"))).toBe("sync");
  });
  it("dentro de un contenteditable no actúa", () => {
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    host.appendChild(inner);
    expect(matchShortcut(ev({ key: "c", code: "KeyC" }), inner)).toBeNull();
  });
  it("Ctrl/Cmd no son atajos (copiar, guardar…)", () => {
    expect(matchShortcut(ev({ key: "c", code: "KeyC", ctrlKey: true }), null)).toBeNull();
    expect(matchShortcut(ev({ key: "s", code: "KeyS", metaKey: true }), null)).toBeNull();
  });
  it("+ y − cambian la cadencia; Esc; los dígitos solo 1–8 y sin Alt", () => {
    expect(matchShortcut(ev({ key: "+", code: "BracketRight" }), null)).toBe("cine-faster");
    expect(matchShortcut(ev({ key: "-", code: "Slash" }), null)).toBe("cine-slower");
    expect(matchShortcut(ev({ key: "+", code: "NumpadAdd" }), null)).toBe("cine-faster");
    expect(matchShortcut(ev({ key: "Escape", code: "Escape" }), null)).toBe("escape");
    expect(matchShortcut(ev({ key: "9", code: "Digit9" }), null)).toBeNull();
    expect(matchShortcut(ev({ key: "1", code: "Digit1", altKey: true }), null)).toBe("preset-sola");
    expect(matchShortcut(ev({ key: "5", code: "Digit5", altKey: true }), null)).toBeNull();
  });
  it("teclado numérico: dígito con Bloq Num, tecla de corte sin él", () => {
    expect(matchShortcut(ev({ key: "8", code: "Numpad8" }), null)).toBe("step-8");
    expect(matchShortcut(ev({ key: "ArrowUp", code: "Numpad8" }), null)).toBe("slice-up");
    expect(matchShortcut(ev({ key: "End", code: "Numpad1" }), null)).toBe("end");
  });
  it("H y P están asignadas", () => {
    expect(matchShortcut(ev({ key: "h", code: "KeyH" }), null)).toBe("hud-cycle");
    expect(SHORTCUTS.find((s) => s.id === "hud-cycle")?.keys).toBe("H");
    expect(matchShortcut(ev({ key: "p", code: "KeyP" }), null)).toBe("panel-toggle");
    expect(SHORTCUTS.find((s) => s.id === "panel-toggle")).toMatchObject({ keys: "P", scope: "flujo" });
    expect(RESERVED_KEYS).toEqual([]);
  });
  it("los atajos actúan en limpio: matchShortcut resuelve igual con el foco dentro de data-hud=limpio", () => {
    // El destino es lo único del DOM que mira el emparejador: un nodo dentro
    // de la rejilla en limpio tiene que dar el mismo id que uno fuera.
    const host = document.createElement("div");
    host.setAttribute("data-hud", "limpio");
    const inside = document.createElement("div");
    inside.tabIndex = 0;
    host.appendChild(inside);
    const outside = document.createElement("div");
    outside.tabIndex = 0;
    document.body.append(host, outside);
    const keys = [
      { key: "s", code: "KeyS", id: "sync" }, { key: "c", code: "KeyC", id: "center" },
      { key: " ", code: "Space", id: "cine-toggle" }, { key: "r", code: "KeyR", id: "anot-regla" },
      { key: "h", code: "KeyH", id: "hud-cycle" },
    ];
    for (const k of keys) {
      const e = ev({ key: k.key, code: k.code });
      expect(matchShortcut(e, inside), k.code).toBe(k.id);
      expect(matchShortcut(e, inside), k.code).toBe(matchShortcut(e, outside));
    }
    host.remove(); outside.remove();
  });
  it("Viewer.onShortcut no consulta el nivel del HUD salvo para H", () => {
    // El otro extremo del atajo: el visor no puede callarse en limpio. Fuera
    // del caso hud-cycle, el cuerpo de onShortcut no nombra hudLevel.
    const src = readFileSync(resolve(__dirname, "Viewer.tsx"), "utf8");
    const a = src.indexOf("const onShortcut = (id: string) => {");
    const b = src.indexOf("const onShortcutRef", a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const body = src.slice(a, b);
    const cycle = body.match(/case "hud-cycle": \{[\s\S]*?\r?\n {6}\}/);
    expect(cycle?.[0]).toMatch(/hudLevel/);
    expect(body.replace(cycle![0], "")).not.toMatch(/hudLevel|HudLevel/);
  });
});
it("resuelve R, A, G, T, Supr y Retroceso", () => {
  expect(matchShortcut(ev({ key: "r", code: "KeyR" }), null)).toBe("anot-regla");
  expect(matchShortcut(ev({ key: "a", code: "KeyA" }), null)).toBe("anot-angulo");
  expect(matchShortcut(ev({ key: "g", code: "KeyG" }), null)).toBe("anot-region");
  expect(matchShortcut(ev({ key: "t", code: "KeyT" }), null)).toBe("anot-marcador");
  expect(matchShortcut(ev({ key: "Delete", code: "Delete" }), null)).toBe("anot-borrar");
  expect(matchShortcut(ev({ key: "Backspace", code: "Backspace" }), null)).toBe("anot-deshacer-punto");
  const input = document.createElement("input");
  expect(matchShortcut(ev({ key: "r", code: "KeyR" }), input)).toBeNull();
  expect(matchShortcut(ev({ key: "Backspace", code: "Backspace" }), input)).toBeNull();
});

/* Con un diálogo de confirmación delante, ningún atajo llega al flujo ni al
   visor: un segundo Supr apilaba otra pregunta, y P, el espacio o los dígitos
   cambiaban la pantalla tapada. */
it("con un ConfirmDialog abierto no resuelve Supr, P, espacio ni dígitos", () => {
  const supr = ev({ key: "Delete", code: "Delete" });
  const p = ev({ key: "p", code: "KeyP" });
  const espacio = ev({ key: " ", code: "Space" });
  const dos = ev({ key: "2", code: "Digit2" });
  expect(matchShortcut(supr, null)).toBe("anot-borrar");
  const { unmount } = render(createElement(ConfirmDialog, {
    open: true, title: "¿Borrar la anotación?", confirmLabel: "Borrar anotación", destructive: true,
    onCancel: () => {}, onConfirm: () => {}, children: "cuerpo",
  }));
  for (const e of [supr, p, espacio, dos, ev({ key: "r", code: "KeyR" })]) expect(matchShortcut(e, document.body)).toBeNull();
  unmount();
  expect(matchShortcut(p, null)).toBe("panel-toggle");
});

/* F1-120: la hoja solo hablaba del teclado; la rueda, el arrastre de celdas y
   del divisor y los dobles clics no estaban escritos en ningún sitio. */
describe("F1-120: gestos del ratón", () => {
  it("la hoja lista rueda, Ctrl+rueda, arrastre y doble clic", () => {
    const { getByRole, unmount } = render(createElement(ShortcutsSheet, { open: true, onClose: () => {} }));
    const dlg = getByRole("dialog", { name: "Atajos" });
    expect(getByRole("heading", { name: "Ratón" })).toBeTruthy();
    for (const k of ["Rueda", "Ctrl+rueda", "Arrastrar", "Arrastrar la celda", "Arrastrar el divisor", "Doble clic"]) {
      expect(dlg.textContent, k).toContain(k);
    }
    // «Ratón» va la última: el teclado sigue siendo lo primero que se busca.
    const headings = [...dlg.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings[headings.length - 1]).toBe("Ratón");
    unmount();
  });
  it("ningún gesto del ratón se atiende como tecla", () => {
    const ids = new Set(SHORTCUTS.filter((s) => s.scope === "raton").map((s) => s.id));
    expect(ids.size).toBeGreaterThanOrEqual(6);
    for (const s of SHORTCUTS.filter((x) => x.scope === "raton")) {
      expect(matchShortcut(ev({ key: s.keys, code: s.keys }), null), s.id).toBeNull();
    }
  });
  it("el README lista los mismos gestos", () => {
    const readme = readFileSync(resolve(__dirname, "../../../README.md"), "utf8");
    for (const s of SHORTCUTS.filter((x) => x.scope === "raton")) expect(readme, s.keys).toContain(`| ${s.keys} | ${s.action} |`);
  });
  it("VINCULAR y TEXTOS se llaman así también en la hoja", () => {
    expect(SHORTCUTS.find((s) => s.id === "sync")?.action).toBe("Encender o apagar VINCULAR");
    expect(SHORTCUTS.find((s) => s.id === "hud-cycle")?.action).toBe("Nivel de textos: completo · esencial · limpio");
  });
});
