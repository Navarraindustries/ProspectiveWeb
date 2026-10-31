import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_PALETTE_EVENT, getCommands, openCommandPalette, registerCommands, subscribeCommands, useRegisterCommands, type Command } from "./commands";

const cmd = (id: string): Command => ({ id, group: "ir", label: id, run: () => {} });
const undo: Array<() => void> = [];
afterEach(() => { while (undo.length) undo.pop()!(); });

describe("registro de mandos", () => {
  it("sustituye los mandos del mismo dueño y desregistra", () => {
    undo.push(registerCommands("a", [cmd("a1"), cmd("a2")]));
    const offB = registerCommands("b", [cmd("b1")]);
    undo.push(offB);
    expect(getCommands()).toHaveLength(3);
    undo.push(registerCommands("a", [cmd("a3")]));
    expect(getCommands().map((c) => c.id).sort()).toEqual(["a3", "b1"]);
    offB();
    expect(getCommands().map((c) => c.id)).toEqual(["a3"]);
  });
  it("avisa una vez por cambio", () => {
    const fn = vi.fn();
    const off = subscribeCommands(fn);
    const un = registerCommands("c", [cmd("c1")]);
    expect(fn).toHaveBeenCalledTimes(1);
    un();
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    registerCommands("c", [])();
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("openCommandPalette despacha el evento en window", () => {
    const fn = vi.fn();
    window.addEventListener(OPEN_PALETTE_EVENT, fn);
    openCommandPalette();
    window.removeEventListener(OPEN_PALETTE_EVENT, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("getCommands", () => {
  it("devuelve la misma referencia mientras no cambie el registro", () => {
    undo.push(registerCommands("s", [cmd("s1")]));
    expect(getCommands()).toBe(getCommands());
  });
});

describe("useRegisterCommands", () => {
  it("no vuelve a registrar si solo cambia run, y run llama al cierre nuevo", () => {
    const first = vi.fn();
    const second = vi.fn();
    const mk = (run: () => void, disabled = false): Command[] => [{ id: "h1", group: "acciones", label: "H", run, disabled }];
    const { rerender, unmount } = renderHook(({ c }) => useRegisterCommands("h", c), { initialProps: { c: mk(first) } });
    const fn = vi.fn();
    const off = subscribeCommands(fn);
    undo.push(off);
    rerender({ c: mk(second) });
    expect(fn).not.toHaveBeenCalled();
    getCommands().find((c) => c.id === "h1")!.run();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    rerender({ c: mk(second, true) });
    expect(fn).toHaveBeenCalledTimes(2); // desregistro + registro del efecto
    expect(getCommands().find((c) => c.id === "h1")!.disabled).toBe(true);
    unmount();
    expect(getCommands().find((c) => c.id === "h1")).toBeUndefined();
  });
});
