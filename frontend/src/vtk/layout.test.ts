import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, swapPane } from "./layout";

describe("swapPane", () => {
  it("moves a strip pane to main and the old main into its slot", () => {
    const l = swapPane(DEFAULT_LAYOUT, "mip");
    expect(l.main).toBe("mip");
    expect(l.strip).toEqual(["axial", "coronal", "sagital", "scene"]);
  });
  it("maximizing the main pane is a no-op", () => {
    expect(swapPane(DEFAULT_LAYOUT, "scene")).toBe(DEFAULT_LAYOUT);
  });
  it("swapping twice restores the layout", () => {
    expect(swapPane(swapPane(DEFAULT_LAYOUT, "axial"), "scene")).toEqual(DEFAULT_LAYOUT);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips through localStorage", () => {
    saveLayout(swapPane(DEFAULT_LAYOUT, "coronal"));
    expect(loadLayout()).toEqual({ main: "coronal", strip: ["axial", "scene", "sagital", "mip"] });
  });
  it("falls back to the default on garbage or missing panes", () => {
    localStorage.setItem("ws.viewer.layout", JSON.stringify({ main: "axial", strip: ["axial", "mip"] }));
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    localStorage.setItem("ws.viewer.layout", "{not json");
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });
});
