import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { simularPantalla } from "../../test/pantalla";
import { NavPildora } from "./NavPildora";

const { irA, activa } = vi.hoisted(() => ({ irA: vi.fn(), activa: { valor: null as string | null } }));

vi.mock("./desplazamiento", async (orig) => ({
  ...(await orig<typeof import("./desplazamiento")>()),
  useIrASeccion: () => irA,
}));
vi.mock("./useSeccionActiva", async (orig) => ({
  ...(await orig<typeof import("./useSeccionActiva")>()),
  useSeccionActiva: () => activa.valor,
}));

const ENLACES = ["Qué es", "Cómo funciona", "Índices", "Dispositivos"];

const montar = () => render(<NavPildora onEntrar={() => {}} onCrearCuenta={() => {}} />);

afterEach(() => {
  vi.unstubAllGlobals();
  irA.mockClear();
  activa.valor = null;
});

describe("NavPildora", () => {
  it("lleva los cuatro enlaces de ancla y los dos botones, sobre cristal", () => {
    simularPantalla(1280);
    const { container } = montar();
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav).toHaveAttribute("data-glass");
    expect(container.querySelector("[data-glass]")).not.toBeNull();
    const hrefs = ["#que-es", "#como-funciona", "#indices", "#dispositivos"];
    ENLACES.forEach((texto, i) => {
      expect(screen.getByRole("link", { name: texto })).toHaveAttribute("href", hrefs[i]);
    });
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menú" })).toBeNull();
  });

  it("los botones llaman a sus manejadores", () => {
    simularPantalla(1280);
    const onEntrar = vi.fn();
    const onCrearCuenta = vi.fn();
    render(<NavPildora onEntrar={onEntrar} onCrearCuenta={onCrearCuenta} />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(onEntrar).toHaveBeenCalledTimes(1);
    expect(onCrearCuenta).toHaveBeenCalledTimes(1);
  });

  it("a 1280: accesos pequeños, sin «Menú»", () => {
    simularPantalla(1280);
    montar();
    expect(screen.getByRole("button", { name: "Entrar" })).toHaveAttribute("data-size", "sm");
    expect(screen.queryByRole("button", { name: "Menú" })).toBeNull();
  });

  it.each([1024, 768])("a %i: plegada, marca completa y accesos de 44 px", (ancho) => {
    simularPantalla(ancho);
    montar();
    expect(screen.getByRole("img", { name: "SkullApp" })).toBeInTheDocument();
    for (const n of ["Entrar", "Crear cuenta", "Menú"])
      expect(screen.getByRole("button", { name: n })).toHaveAttribute("data-size", "md");
    expect(screen.queryByRole("link", { name: "Qué es" })).toBeNull();
  });

  it("a 390: marca compacta, «Entrar» y menú de icono; «Crear cuenta» dentro del panel", () => {
    simularPantalla(390);
    montar();
    expect(screen.queryByRole("img", { name: "SkullApp" })).toBeNull();
    expect(screen.getByRole("img", { name: "Prospective" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear cuenta" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toHaveAttribute("data-size", "md");
  });

  it("al cruzar 1024 en vivo se pliega", () => {
    const p = simularPantalla(1280);
    montar();
    act(() => p.cambiar({ ancho: 1024 }));
    expect(screen.getByRole("button", { name: "Menú" })).toBeInTheDocument();
  });

  describe("conmutador de tema", () => {
    const tema = () => screen.getByRole("button", { name: /Cambiar a tema/ });

    it("a 1280 es de 36 px y está junto a «Entrar»", () => {
      simularPantalla(1280);
      montar();
      expect(tema().style.width).toBe("36px");
      expect(screen.getByRole("button", { name: "Crear cuenta" }).nextElementSibling).toBe(tema());
    });

    it.each([1024, 768])("a %i es de 44 px", (ancho) => {
      simularPantalla(ancho);
      montar();
      expect(tema().style.width).toBe("44px");
      expect(tema().style.height).toBe("44px");
    });

    it("a 390 solo está dentro del panel, de 44 px", () => {
      simularPantalla(390);
      montar();
      expect(screen.queryByRole("button", { name: /Cambiar a tema/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Menú" }));
      expect(tema().style.width).toBe("44px");
      expect(document.getElementById(screen.getByRole("button", { name: "Menú" }).getAttribute("aria-controls")!)).toContainElement(tema());
    });
  });

  it("un clic en un enlace desplaza con animación", () => {
    simularPantalla(1280);
    montar();
    fireEvent.click(screen.getByRole("link", { name: "Índices" }));
    expect(irA).toHaveBeenCalledWith(expect.anything(), "indices");
  });

  it("en el panel, el clic cierra el menú y desplaza", () => {
    simularPantalla(768);
    montar();
    const menu = screen.getByRole("button", { name: "Menú" });
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "Qué es" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(irA).toHaveBeenCalledWith(expect.anything(), "que-es");
  });

  it("la sección activa lleva aria-current y la píldora deslizante; las demás no", () => {
    activa.valor = "indices";
    simularPantalla(1280);
    const { container } = montar();
    const indices = screen.getByRole("link", { name: "Índices" });
    expect(indices).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Qué es" })).not.toHaveAttribute("aria-current");
    expect(container.querySelectorAll(".landing-nav__activa")).toHaveLength(1);
    expect(indices.querySelector(".landing-nav__activa")).not.toBeNull();
  });

  it("sin sección activa (hero, funcionalidades…) no hay píldora", () => {
    simularPantalla(1280);
    const { container } = montar();
    expect(container.querySelectorAll(".landing-nav__activa")).toHaveLength(0);
    expect(container.querySelector("[aria-current]")).toBeNull();
  });

  it("en el panel plegado el enlace activo lleva aria-current y clase, sin píldora", () => {
    activa.valor = "indices";
    simularPantalla(768);
    const { container } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    const indices = screen.getByRole("link", { name: "Índices" });
    expect(indices).toHaveAttribute("aria-current", "location");
    expect(indices).toHaveClass("landing-nav__enlace--activo");
    expect(container.querySelectorAll(".landing-nav__activa")).toHaveLength(0);
  });

  it("a 768 los enlaces se pliegan tras un botón «Menú»", () => {
    simularPantalla(768);
    montar();
    const menu = screen.getByRole("button", { name: "Menú" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Qué es" })).toBeNull();
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    for (const texto of ENLACES) {
      expect(screen.getByRole("link", { name: texto })).toBeInTheDocument();
    }
  });

  it("el botón «Menú» controla el panel, y Escape lo cierra devolviendo el foco al botón", () => {
    simularPantalla(768);
    montar();
    const menu = screen.getByRole("button", { name: "Menú" });
    const idPanel = menu.getAttribute("aria-controls");
    expect(idPanel).toBeTruthy();
    const panel = document.getElementById(idPanel!);
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();

    fireEvent.click(menu);
    expect(panel).toBeVisible();
    screen.getByRole("link", { name: "Qué es" }).focus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeVisible();
    expect(menu).toHaveFocus();
  });

  it("los enlaces llevan su color en una clase (sin color en línea que anule el hover)", () => {
    simularPantalla(1280);
    montar();
    for (const texto of ENLACES) {
      const enlace = screen.getByRole("link", { name: texto });
      expect(enlace).toHaveClass("landing-nav__enlace");
      expect(enlace.style.color).toBe("");
    }
  });

  it("el menú abierto se cierra al tocar fuera, no al tocar dentro, y al hacer scroll", () => {
    simularPantalla(768);
    montar();
    const menu = screen.getByRole("button", { name: "Menú" });
    fireEvent.click(menu);
    fireEvent.pointerDown(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.scroll(window);
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});
