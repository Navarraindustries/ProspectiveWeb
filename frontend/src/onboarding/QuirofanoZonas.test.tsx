/* Momento 5: la ilustración del quirófano en cinco zonas. Las zonas se pueden
   tocar en cualquier orden; la 2 añade los cinco tramos; «Siguiente» en la 5
   termina el momento y «Saltar» (o Esc) salta el onboarding entero, una vez. */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVISO_PISTAS, ZONAS_QUIROFANO } from "./copy";

let movil = false;
vi.mock("../hooks/useEstrecho", async (orig) => ({
  ...(await orig<typeof import("../hooks/useEstrecho")>()),
  useMovil: () => movil,
}));

const terminar = vi.fn().mockResolvedValue(undefined);
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ activo: true, momento: "quirofano", ir: vi.fn(), terminar }),
}));

import { QuirofanoZonas, desplazamientoParaVer } from "./QuirofanoZonas";

const onFin = vi.fn();
const zona = (n: number) => screen.getByRole("button", { name: new RegExp(`^Zona ${n}: `) });
const dialogo = (titulo: string) => screen.getByRole("dialog", { name: titulo });

beforeEach(() => { vi.clearAllMocks(); movil = false; });
afterEach(() => { vi.restoreAllMocks(); });

describe("QuirofanoZonas", () => {
  it("empieza en el visor y pulsar el 4 muestra «Dónde estás»", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    expect(dialogo("El visor")).toBeTruthy();
    fireEvent.click(zona(4));
    expect(dialogo("Dónde estás")).toBeTruthy();
    expect(zona(4).getAttribute("aria-pressed")).toBe("true");
    expect(zona(1).getAttribute("aria-pressed")).toBe("false");
  });

  it("hay un botón por zona, con el título de cada una", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    ZONAS_QUIROFANO.forEach((z, i) => expect(zona(i + 1).getAttribute("aria-label")).toBe(`Zona ${i + 1}: ${z.titulo}`));
  });

  it("en la zona 2 se ven los cinco tramos con sus pasos y el aviso de las pistas", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(zona(2));
    const lista = within(dialogo("Los pasos")).getByRole("list", { name: "Los cinco tramos" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toMatch(/Preparar.*1.*2/);
    expect(items[4].textContent).toMatch(/Informe.*8/);
    expect(within(dialogo("Los pasos")).getByText(AVISO_PISTAS)).toBeTruthy();
  });

  it("fuera de la zona 2 no salen los tramos", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    expect(screen.queryByRole("list", { name: "Los cinco tramos" })).toBeNull();
  });

  it("«Siguiente» recorre las zonas y en la 5 llama a onFin una sola vez", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(zona(5));
    expect(onFin).not.toHaveBeenCalled();
    const siguiente = screen.getByRole("button", { name: "Siguiente" });
    fireEvent.click(siguiente);
    fireEvent.click(siguiente);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("«Anterior» vuelve una zona y «Siguiente» avanza una", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(dialogo("Los pasos")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(dialogo("El visor")).toBeTruthy();
  });

  it("los marcadores numerados sobre la ilustración también cambian de zona", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcador de la zona 3" }));
    expect(dialogo("El panel del paso")).toBeTruthy();
  });

  it("«Saltar recorrido» salta todo el onboarding", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(screen.getByRole("button", { name: "Saltar recorrido" }));
    expect(terminar).toHaveBeenCalledTimes(1);
    expect(terminar).toHaveBeenCalledWith("saltado");
    expect(onFin).not.toHaveBeenCalled();
  });

  it("Esc salta todo el onboarding, una vez", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.keyDown(dialogo("El visor"), { key: "Escape" });
    expect(terminar).toHaveBeenCalledTimes(1);
    expect(terminar).toHaveBeenCalledWith("saltado");
  });

  it("la maqueta muestra el panel «PASO 3 · DETECCIÓN» y el dock con ocho pasos", () => {
    const { container } = render(<QuirofanoZonas onFin={onFin} />);
    expect(container.textContent).toContain("PASO 3 · DETECCIÓN");
    expect(container.querySelectorAll("[data-paso]")).toHaveLength(8);
    expect(container.querySelector('[data-paso="1"]')?.getAttribute("data-estado")).toBe("hecho");
    expect(container.querySelector('[data-paso="3"]')?.getAttribute("data-estado")).toBe("activo");
  });

  it("tras usar un marcador el foco vuelve a la burbuja: Esc salta una vez y → avanza", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    const pin = screen.getByRole("button", { name: "Marcador de la zona 3" });
    // El ratón no debe llevarse el foco (mousedown cancelado)…
    expect(fireEvent.mouseDown(pin)).toBe(false);
    // …y si el navegador lo llevara igualmente, el clic lo devuelve.
    act(() => pin.focus());
    fireEvent.click(pin);
    expect(document.activeElement).toBe(dialogo("El panel del paso"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(dialogo("Dónde estás")).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(terminar).toHaveBeenCalledTimes(1);
    expect(terminar).toHaveBeenCalledWith("saltado");
  });

  it("«Anterior» en la zona 1 vuelve al momento previo (onAtras); sin onAtras sigue desactivado", () => {
    const onAtras = vi.fn();
    const { unmount } = render(<QuirofanoZonas onFin={onFin} onAtras={onAtras} />);
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onAtras).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialogo("El visor"), { key: "ArrowLeft" });
    expect(onAtras).toHaveBeenCalledTimes(2);
    unmount();
    render(<QuirofanoZonas onFin={onFin} />);
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("la maqueta se marca como «Ejemplo»", () => {
    const { container } = render(<QuirofanoZonas onFin={onFin} />);
    expect(container.querySelector(".qz__ejemplo")?.textContent).toBe("Ejemplo");
  });

  describe("en el móvil (hoja inferior)", () => {
    const caja = (top: number, bottom: number) =>
      ({ x: 0, y: top, left: 0, top, right: 390, bottom, width: 390, height: bottom - top, toJSON() {} }) as DOMRect;

    it("desplazamientoParaVer deja la zona entre el borde de arriba y la hoja", () => {
      expect(desplazamientoParaVer({ top: 100, bottom: 200 }, 500)).toBe(0);
      expect(desplazamientoParaVer({ top: 600, bottom: 800 }, 500)).toBe(800 - 488);
      expect(desplazamientoParaVer({ top: -300, bottom: -100 }, 500)).toBe(-312);
      // Más alta que el hueco libre: se alinea por arriba.
      expect(desplazamientoParaVer({ top: 50, bottom: 1000 }, 500)).toBe(38);
    });

    it("cada zona activa sube por encima de la hoja; la maqueta deja abajo el alto de la hoja", () => {
      movil = true;
      const H = window.innerHeight, HOJA = 300;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("tour-burbuja")) return caja(H - HOJA, H);
        if (this.classList.contains("qz-panel")) return caja(H - 100, H + 200); // bajo la hoja
        if (this.classList.contains("qz-pastilla--donde")) return caja(-80, -40); // por encima de la pantalla
        return caja(100, 200);
      });
      const scrollBy = vi.fn();
      const { container } = render(<div style={{ overflowY: "auto" }}><QuirofanoZonas onFin={onFin} /></div>);
      const scroller = container.firstElementChild as HTMLElement;
      scroller.scrollBy = scrollBy as unknown as HTMLElement["scrollBy"];
      fireEvent.click(zona(3));
      const tope = H - HOJA - 12;
      expect(scrollBy).toHaveBeenLastCalledWith({ top: H + 200 - tope, behavior: "smooth" });
      fireEvent.click(zona(4));
      expect(scrollBy).toHaveBeenLastCalledWith({ top: -80 - 12, behavior: "smooth" });
      scrollBy.mockClear();
      fireEvent.click(zona(1)); // ya a la vista: no se mueve
      expect(scrollBy).not.toHaveBeenCalled();
      expect((container.querySelector(".qz") as HTMLElement).style.getPropertyValue("--qz-hoja")).toBe(`${HOJA}px`);
    });

    it("al girar el teléfono (resize / orientationchange) vuelve a medir la hoja y recoloca la zona", () => {
      movil = true;
      const H = window.innerHeight;
      let hoja = 300;
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((f) => { f(0); return 1; });
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("tour-burbuja")) return caja(H - hoja, H);
        if (this.classList.contains("qz-panel")) return caja(H - 500, H - 320); // justo encima de la hoja de 300
        return caja(100, 200);
      });
      const scrollBy = vi.fn();
      const { container } = render(<div style={{ overflowY: "auto" }}><QuirofanoZonas onFin={onFin} /></div>);
      (container.firstElementChild as HTMLElement).scrollBy = scrollBy as unknown as HTMLElement["scrollBy"];
      fireEvent.click(zona(3));
      expect(scrollBy).not.toHaveBeenCalled(); // cabe sobre la hoja de 300
      const qz = container.querySelector(".qz") as HTMLElement;
      expect(qz.style.getPropertyValue("--qz-hoja")).toBe("300px");
      // En apaisado la hoja ocupa más: el panel queda tapado y hay que subirlo.
      const antes = H - 300 - 20;
      hoja = 420;
      act(() => { window.dispatchEvent(new Event("orientationchange")); });
      expect(qz.style.getPropertyValue("--qz-hoja")).toBe("420px");
      expect(scrollBy).toHaveBeenLastCalledWith({ top: antes - (H - 420 - 12), behavior: "auto" });
      hoja = 360;
      act(() => { window.dispatchEvent(new Event("resize")); });
      expect(qz.style.getPropertyValue("--qz-hoja")).toBe("360px");
    });
  });
});
