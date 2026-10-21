/* Ocultar la decoración: preferencias que se recuerdan, y una
   decoración que se puede quitar sin llevarse la orientación ni los avisos. */
import { act, render, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREF_DECOR_HIDDEN, PREF_HUD_LEVEL, hudLevelFromStorage, nextHudLevel, readHudLevel, useStoredChoice, useStoredFlag,
} from "./viewerPrefs";
import { HudHeadingTape } from "./hud/HudHeadingTape";
import { HudLadder } from "./hud/HudLadder";
import { HudReticle } from "./hud/HudReticle";
import { HudFrame } from "./hud/HudFrame";
import { HudReadout } from "./hud/HudReadout";

beforeEach(() => window.localStorage.clear());

describe("preferencias de vista", () => {
  it("se recuerdan entre sesiones", () => {
    const a = renderHook(() => useStoredFlag(PREF_DECOR_HIDDEN));
    expect(a.result.current[0]).toBe(false);
    act(() => a.result.current[1](true));
    expect(a.result.current[0]).toBe(true);
    a.unmount();
    const b = renderHook(() => useStoredFlag(PREF_DECOR_HIDDEN));
    expect(b.result.current[0]).toBe(true);
  });

  it("si el navegador no deja guardar, la vista sigue funcionando", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("privado"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("privado"); });
    const h = renderHook(() => useStoredFlag(PREF_DECOR_HIDDEN));
    expect(h.result.current[0]).toBe(false);
    act(() => h.result.current[1](true));
    expect(h.result.current[0]).toBe(true);
    get.mockRestore(); set.mockRestore();
  });
});

describe("qué es decoración", () => {
  // Los niveles esencial y limpio ocultan `.hud-decor` y `.hud-corner`
  // (hud.css, probado en hudLevel.test); aquí, quién lleva la marca y quién no.
  it("reglas, retícula, cinta de rumbo y esquinas llevan la marca", () => {
    const { container } = render(
      <div>
        <HudHeadingTape azimuthDeg={0} elevationDeg={0} known />
        <HudLadder count={100} index={50} />
        <HudReticle cx={50} cy={50} mmPerPx={0.5} />
        <HudFrame active label="AXIAL" />
      </div>,
    );
    expect(container.querySelectorAll(".hud-decor").length).toBe(3);
    expect(container.querySelectorAll(".hud-corner").length).toBe(4);
  });

  it("los avisos y las lecturas no la llevan", () => {
    const { container } = render(
      <HudFrame label="ESCENA">
        <HudReadout at="br" lines={["ORIENTACIÓN ASUMIDA"]} tone="warn" />
        <HudReadout at="bl" lines={["Ø CUELLO 3.4 mm"]} />
      </HudFrame>,
    );
    for (const el of Array.from(container.querySelectorAll(".hud-readout"))) {
      expect(el.closest(".hud-decor")).toBeNull();
      expect(el.classList.contains("hud-corner")).toBe(false);
    }
    expect(container.querySelector(".hud-label")?.closest(".hud-decor")).toBeNull();
  });
});

describe("nivel del HUD", () => {
  it("sin nada guardado es completo; inválido también", () => {
    expect(hudLevelFromStorage(null, null)).toBe("completo");
    expect(hudLevelFromStorage("medio", null)).toBe("completo");
  });

  it("migra REGLAS ○ a esencial y borra la clave vieja", () => {
    window.localStorage.setItem(PREF_DECOR_HIDDEN, "1");
    expect(readHudLevel()).toBe("esencial");
    expect(window.localStorage.getItem(PREF_DECOR_HIDDEN)).toBeNull();
    expect(window.localStorage.getItem(PREF_HUD_LEVEL)).toBe("esencial");
  });

  it("el ciclo de H", () => {
    expect(nextHudLevel("completo")).toBe("esencial");
    expect(nextHudLevel("esencial")).toBe("limpio");
    expect(nextHudLevel("limpio")).toBe("completo");
  });

  it("useStoredChoice recuerda la elección y descarta valores inválidos", () => {
    window.localStorage.setItem("k", "raro");
    const a = renderHook(() => useStoredChoice("k", ["a", "b"] as const, "a"));
    expect(a.result.current[0]).toBe("a");
    act(() => a.result.current[1]("b"));
    expect(window.localStorage.getItem("k")).toBe("b");
    a.unmount();
    const b = renderHook(() => useStoredChoice("k", ["a", "b"] as const, "a"));
    expect(b.result.current[0]).toBe("b");
  });
});
