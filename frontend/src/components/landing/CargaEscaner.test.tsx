/* «El escáner»: la pantalla de carga de la landing. Secuencia por fases con
   temporizadores falsos, el contador atado a la precarga real (pero mandado por
   el tiempo), los tres modos de saltar y la versión breve. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tieneDeclaracion } from "../../test/cssReglas";
import { simularPantalla } from "../../test/pantalla";
import {
  BARRIDO_MS, BREVE_MS, CORTES_ESCANEO, CargaEscaner, FASES_MS, MIN_CONTADOR_MS, SALTO_MS,
  LADO_ANILLO, LESION_EN_IMAGEN, corteMostrado, escalaDe, progresoMostrado, puntoEnCover, puntoFinal, radioApertura,
  rotuloCandidato,
} from "./CargaEscaner";
import { MANIFIESTO, reiniciarPrecargaHero, rutaFotograma } from "./heroFrames";

const css = readFileSync(join(__dirname, "../../styles/landing.css"), "utf8").replace(/\r\n/g, "\n");

/* `Image` de mentira para la precarga: guarda la ruta y deja cargar a mano. */
class ImagenFalsa {
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
function espiarImagenes() {
  const creadas: ImagenFalsa[] = [];
  vi.stubGlobal("Image", class extends ImagenFalsa {
    constructor() { super(); creadas.push(this); }
  });
  /* Carga en orden hasta tener `n` fotogramas listos (la cola abre más al cargar). */
  const cargar = (n: number) => {
    let hechos = 0;
    for (let k = 0; k < creadas.length && hechos < n; k++) {
      const img = creadas[k];
      if (!img.onload) continue;
      act(() => img.onload!());
      hechos++;
    }
  };
  return { creadas, cargar };
}

const capa = () => document.querySelector(".carga-escaner") as HTMLElement;
const avanzar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function montar() {
  const onFin = vi.fn();
  const onAbrir = vi.fn();
  const r = render(<CargaEscaner onAbrir={onAbrir} onFin={onFin} />);
  return { ...r, onFin, onAbrir };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reiniciarPrecargaHero();
});

describe("aritmética", () => {
  it("la lesión en pantalla sale de la geometría de object-fit: cover", () => {
    // Imagen cuadrada en 1920 × 1080: se escala al ancho y recorta arriba y abajo.
    expect(puntoEnCover(1920, 1080, 1024, 1024, 0.49, 0.5)).toEqual({ x: 940.8, y: 540 });
    // En un móvil vertical se escala al alto y recorta los lados.
    const p = puntoEnCover(360, 800, 1024, 1024, 0.49, 0.5);
    expect(p.x).toBeCloseTo(172);
    expect(p.y).toBeCloseTo(400);
  });

  it("el destino del punto deshace la escala de la marca desde su centro", () => {
    const marca = { left: 0, top: 0, width: 1000, height: 600 };
    // Sin escala, el centro del punto tal cual.
    expect(puntoFinal({ left: 290, top: 190, width: 20, height: 20 }, marca, 1)).toEqual({ x: 300, y: 200, d: 20 });
    // A 0,5, el punto medido está a mitad de camino del centro (500, 300).
    expect(puntoFinal({ left: 390, top: 245, width: 10, height: 10 }, marca, 0.5)).toEqual({ x: 290, y: 200, d: 20 });
    expect(escalaDe("matrix(0.96, 0, 0, 0.96, 0, 0)")).toBeCloseTo(0.96);
    expect(escalaDe("none")).toBe(1);
    expect(escalaDe("")).toBe(1);
  });

  it("la apertura llega a la esquina más lejana", () => {
    expect(radioApertura(100, 100, 50, 50)).toBe(Math.ceil(Math.hypot(50, 50)));
    expect(radioApertura(200, 100, 20, 10)).toBe(Math.ceil(Math.hypot(180, 90)));
  });

  it("el porcentaje sigue la precarga, sin bajar del suelo del tiempo ni correr más que 1,2 s", () => {
    expect(progresoMostrado(0, 0)).toBe(0);
    // Precarga instantánea: no llega al 100 % antes de MIN_CONTADOR_MS.
    expect(progresoMostrado(MIN_CONTADOR_MS / 2, 1)).toBeCloseTo(0.5);
    expect(progresoMostrado(MIN_CONTADOR_MS, 1)).toBe(1);
    // Red parada: el tiempo lo lleva al 100 % al acabar el escaneo.
    expect(progresoMostrado(FASES_MS.lesion / 2, 0)).toBeCloseTo(0.25);
    expect(progresoMostrado(FASES_MS.lesion, 0)).toBe(1);
    // Nunca baja con el tiempo.
    let previo = 0;
    for (let ms = 0; ms <= FASES_MS.lesion; ms += 50) {
      const p = progresoMostrado(ms, 0.3);
      expect(p).toBeGreaterThanOrEqual(previo);
      previo = p;
    }
  });

  it("el corte va de 95 a 184 y el rótulo lleva coma decimal", () => {
    expect(corteMostrado(0)).toBe(MANIFIESTO.sliceOf[0]);
    expect(corteMostrado(FASES_MS.lesion)).toBe(184);
    expect(rotuloCandidato()).toBe("CANDIDATO 1 · ≈3,7 MM");
  });

  it("cinco pasadas, la última en el corte de la lesión, y todo en 3 s", () => {
    expect(CORTES_ESCANEO).toEqual([0, 15, 30, 45, 59]);
    expect(CORTES_ESCANEO.at(-1)).toBe(MANIFIESTO.lesionFrame);
    expect(BARRIDO_MS * CORTES_ESCANEO.length).toBe(FASES_MS.lesion);
    expect(FASES_MS.fin).toBeLessThanOrEqual(3000);
    expect(SALTO_MS).toBeLessThanOrEqual(250);
    expect(BREVE_MS.fin).toBeLessThanOrEqual(700);
  });
});

describe("CargaEscaner: secuencia completa", () => {
  it("capa oscura en un portal a <body>, con estado accesible y decorado oculto", () => {
    const { container } = montar();
    expect(container.querySelector(".carga-escaner")).toBeNull();
    expect(capa().parentElement).toBe(document.body);
    expect(capa()).toHaveAttribute("data-theme", "dark");
    expect(capa()).toHaveAttribute("data-escenario", "oscuro");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando Prospective");
    const decorado = capa().querySelector(".carga-escaner__decorado")!;
    expect(decorado).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("PROSPECTIVE · CASE 3 · 3DRA").closest("[aria-hidden]")).toBe(decorado);
  });

  it("descubre los fotogramas reales del hero, el último el de la lesión", () => {
    montar();
    const cortes = [...capa().querySelectorAll("img.carga-escaner__corte")];
    expect(cortes.map((i) => i.getAttribute("src"))).toEqual(CORTES_ESCANEO.map(rutaFotograma));
    expect(capa().querySelector(".carga-escaner__barrido")).not.toBeNull();
  });

  it("pasa por escaneo, lesión, logo y apertura, y termina a los 3000 ms", () => {
    const { onFin, onAbrir } = montar();
    expect(capa()).toHaveAttribute("data-fase", "escaneo");
    avanzar(FASES_MS.lesion);
    expect(capa()).toHaveAttribute("data-fase", "lesion");
    expect(screen.getByText("CANDIDATO 1 · ≈3,7 MM")).toBeInTheDocument();
    avanzar(FASES_MS.logo - FASES_MS.lesion);
    expect(capa()).toHaveAttribute("data-fase", "logo");
    expect(capa().querySelector(".carga-escaner__logo")).toHaveTextContent("Prospective");
    expect(capa().querySelector(".carga-escaner__logo")).toHaveTextContent("por SkullApp");
    expect(onAbrir).not.toHaveBeenCalled();
    avanzar(FASES_MS.apertura - FASES_MS.logo);
    expect(capa()).toHaveAttribute("data-fase", "apertura");
    expect(onAbrir).toHaveBeenCalledTimes(1);
    avanzar(FASES_MS.fin - FASES_MS.apertura - 1);
    expect(onFin).not.toHaveBeenCalled();
    avanzar(1);
    expect(onFin).toHaveBeenCalledTimes(1);
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it("aunque la precarga no acabe, el contador llega a 184 y al 100 % y la capa termina", () => {
    espiarImagenes(); // ninguna llega a cargar
    const { onFin } = montar();
    expect(screen.getByText(/^CORTE 95 \/ 384$/)).toBeInTheDocument();
    expect(screen.getByText(/^0\s%$/)).toBeInTheDocument();
    avanzar(FASES_MS.lesion);
    expect(screen.getByText(/^CORTE 184 \/ 384$/)).toBeInTheDocument();
    expect(screen.getByText(/^100\s%$/)).toBeInTheDocument();
    avanzar(FASES_MS.fin - FASES_MS.lesion);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("el porcentaje sigue la precarga real del hero (60 fotogramas)", () => {
    const { creadas, cargar } = espiarImagenes();
    montar();
    expect(creadas.map((c) => c.src)).toEqual([rutaFotograma(0)]);
    cargar(1);
    cargar(29);
    avanzar(1000);
    // 30 de 60: la mitad, por encima del suelo del tiempo ((1000/1600)² ≈ 39 %).
    expect(screen.getByText(/^50\s%$/)).toBeInTheDocument();
  });

  it("con la precarga ya hecha no corre más que un llenado en 1,2 s", () => {
    const { cargar } = espiarImagenes();
    montar();
    for (let k = 0; k < 20; k++) cargar(MANIFIESTO.count);
    avanzar(MIN_CONTADOR_MS / 2);
    expect(screen.getByText(/^50\s%$/)).toBeInTheDocument();
  });

  it("coloca la lesión (la mancha medida en el fotograma 59) con la geometría de cover", () => {
    expect(LESION_EN_IMAGEN).toEqual({ x: 0.485, y: 0.48 });
    simularPantalla(1920, 1080);
    montar();
    // 0,485 × 1920 = 931,2; −420 + 0,48 × 1920 = 501,6.
    expect(capa().style.getPropertyValue("--carga-x")).toBe("931px");
    expect(capa().style.getPropertyValue("--carga-y")).toBe("502px");
    // Sin maqueta (jsdom) no hay punto del icono que medir: ni viaje, y abre desde la lesión.
    expect(capa().style.getPropertyValue("--carga-dx")).toBe("0px");
    expect(capa().style.getPropertyValue("--carga-dy")).toBe("0px");
    expect(capa().style.getPropertyValue("--carga-punto")).toBe("0.18");
    expect(capa().style.getPropertyValue("--carga-ax")).toBe("931px");
    expect(capa().style.getPropertyValue("--carga-iris-fin")).toBe(`${radioApertura(1920, 1080, 931, 502)}px`);
  });

  it("el punto viaja de la lesión al punto del icono D y la apertura sale de allí", () => {
    simularPantalla(1920, 1080);
    const original = Element.prototype.getBoundingClientRect;
    // La marca entra escalada (0,96); el punto del icono se mide así y se deshace la escala.
    const caja = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains("carga-escaner__logo")) return caja(38.4, 21.6, 1843.2, 1036.8);
      if (this.matches("svg g > circle:last-of-type")) return caja(700, 480, 10.56, 10.56);
      return caja(0, 0, 0, 0);
    };
    const computado = window.getComputedStyle.bind(window);
    const estilo = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) =>
      el.classList.contains("carga-escaner__logo")
        ? ({ transform: "matrix(0.96, 0, 0, 0.96, 0, 0)" } as CSSStyleDeclaration)
        : computado(el, pseudo));
    try {
      montar();
      const fin = puntoFinal(caja(700, 480, 10.56, 10.56), caja(38.4, 21.6, 1843.2, 1036.8), 0.96);
      const ax = Math.round(fin.x);
      const ay = Math.round(fin.y);
      expect(capa().style.getPropertyValue("--carga-dx")).toBe(`${ax - 931}px`);
      expect(capa().style.getPropertyValue("--carga-dy")).toBe(`${ay - 502}px`);
      expect(capa().style.getPropertyValue("--carga-ax")).toBe(`${ax}px`);
      expect(capa().style.getPropertyValue("--carga-ay")).toBe(`${ay}px`);
      // El viajero llega con el tamaño del punto del icono (11 px de 64).
      expect(capa().style.getPropertyValue("--carga-punto")).toBe(String(Math.round((11 / LADO_ANILLO) * 1000) / 1000));
      expect(capa().style.getPropertyValue("--carga-iris-fin")).toBe(`${radioApertura(1920, 1080, ax, ay)}px`);
    } finally {
      Element.prototype.getBoundingClientRect = original;
      estilo.mockRestore();
    }
  });

  it("no roba el foco", () => {
    const antes = document.activeElement;
    montar();
    expect(document.activeElement).toBe(antes);
  });
});

describe("CargaEscaner: saltar", () => {
  it("un clic o toque en cualquier sitio hace la apertura rápida", () => {
    const { onFin, onAbrir } = montar();
    avanzar(400);
    fireEvent.pointerDown(document.body);
    expect(capa()).toHaveAttribute("data-fase", "salto");
    expect(onAbrir).toHaveBeenCalledTimes(1);
    avanzar(SALTO_MS - 1);
    expect(onFin).not.toHaveBeenCalled();
    avanzar(1);
    expect(onFin).toHaveBeenCalledTimes(1);
    // Ya no queda nada programado de la secuencia larga.
    avanzar(FASES_MS.fin);
    expect(onFin).toHaveBeenCalledTimes(1);
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it("un clic sin pointerdown también salta", () => {
    const { onFin } = montar();
    fireEvent.click(document.body);
    avanzar(SALTO_MS);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("cualquier tecla salta", () => {
    const { onFin } = montar();
    avanzar(200);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(capa()).toHaveAttribute("data-fase", "salto");
    avanzar(SALTO_MS);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("el botón «Saltar» es visible, de 44 px, y salta", () => {
    const { onFin } = montar();
    const boton = screen.getByRole("button", { name: "Saltar" });
    expect(boton.style.height).toBe("var(--control-md)");
    expect(boton.closest("[aria-hidden]")).toBeNull();
    fireEvent.click(boton);
    avanzar(SALTO_MS);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("si ya se está abriendo, saltar desmonta sin más", () => {
    const { onFin } = montar();
    avanzar(FASES_MS.apertura + 100);
    fireEvent.pointerDown(document.body);
    expect(onFin).toHaveBeenCalledTimes(1);
  });
});

describe("CargaEscaner: movimiento reducido y pantallas", () => {
  it("con movimiento reducido: solo la marca sobre negro, sin escaneo, y fuera en 700 ms", () => {
    simularPantalla({ ancho: 1280, movimientoReducido: true });
    const { creadas } = espiarImagenes();
    const { onFin, onAbrir } = montar();
    expect(capa()).toHaveAttribute("data-modo", "breve");
    expect(capa().querySelector("img")).toBeNull();
    expect(capa().querySelector(".carga-escaner__barrido")).toBeNull();
    expect(capa().querySelector(".carga-escaner__anillo")).toBeNull();
    expect(screen.queryByText(/CORTE/)).toBeNull();
    expect(capa()).toHaveTextContent("Prospective");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando Prospective");
    expect(creadas).toHaveLength(0);
    avanzar(BREVE_MS.salida);
    expect(capa()).toHaveAttribute("data-fase", "salida");
    expect(onAbrir).toHaveBeenCalledTimes(1);
    avanzar(BREVE_MS.fin - BREVE_MS.salida - 1);
    expect(onFin).not.toHaveBeenCalled();
    avanzar(1);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("con movimiento reducido, saltar desmonta directamente", () => {
    simularPantalla({ ancho: 390, movimientoReducido: true });
    const { onFin } = montar();
    fireEvent.keyDown(window, { key: " " });
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("con ahorro de datos también va la versión breve y no se descarga nada", () => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
    try {
      const { creadas } = espiarImagenes();
      montar();
      expect(capa()).toHaveAttribute("data-modo", "breve");
      expect(capa().querySelector("img")).toBeNull();
      expect(creadas).toHaveLength(0);
    } finally {
      Reflect.deleteProperty(navigator, "connection");
    }
  });

  it.each([[360, "movil"], [768, "tableta"], [1280, "estrecho"], [1440, "ancho"], [2560, "grande"]])(
    "a %i px la capa lleva data-tramo=%s", (ancho, tramo) => {
      simularPantalla(ancho);
      montar();
      expect(capa()).toHaveAttribute("data-tramo", tramo);
    });

  it("con el hero quieto (móvil) no precarga los 60: cuenta sus cinco fotogramas", () => {
    simularPantalla(390, 844);
    const { creadas } = espiarImagenes();
    montar();
    expect(creadas).toHaveLength(0);
    for (const img of capa().querySelectorAll("img.carga-escaner__corte")) fireEvent.load(img);
    avanzar(300);
    // Los cinco listos: el porcentaje va al ritmo máximo, 300 / 1200 ms.
    expect(screen.getByText(/^25\s%$/)).toBeInTheDocument();
  });
});

describe("CargaEscaner: fuente y estilos", () => {
  it("el .tsx no escribe colores a mano", () => {
    const src = readFileSync(join(__dirname, "CargaEscaner.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(src).not.toMatch(/from "motion\/react"/);
  });

  it("por encima de la nav, sobre el negro del visor", () => {
    expect(tieneDeclaracion(css, ".carga-escaner", "position: fixed")).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner", "z-index: 1000")).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner", "background: var(--viewer-bg)")).toBe(true);
  });

  it("los tiempos del CSS son los de las constantes", () => {
    const apertura = `carga-iris ${FASES_MS.fin - FASES_MS.apertura}ms cubic-bezier(0.65, 0, 0.35, 1) ${FASES_MS.apertura}ms both`;
    expect(tieneDeclaracion(css, '.carga-escaner[data-modo="completo"]', `animation: ${apertura}`)).toBe(true);
    expect(tieneDeclaracion(css, '.carga-escaner[data-modo="completo"][data-fase="salto"]', `animation: carga-iris-salto ${SALTO_MS}ms`)).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__barrido", `carga-barrido ${BARRIDO_MS}ms linear 0ms ${CORTES_ESCANEO.length} both`)).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__barrido", `carga-apagar 120ms linear ${FASES_MS.lesion}ms forwards`)).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__corte", `carga-corte ${BARRIDO_MS}ms linear calc(var(--k) * ${BARRIDO_MS}ms) both`)).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__anillo", `carga-anillo-entra 150ms var(--ease-out) ${FASES_MS.lesion}ms both`)).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__anillo", `carga-anillo-punto 150ms var(--ease-out) ${FASES_MS.logo}ms forwards`)).toBe(true);
  });

  it("fase logo: cortes a casi negro y rótulos de esquina apagados entre 1900 y 2150 ms", () => {
    expect(tieneDeclaracion(css, ".carga-escaner__corte", "carga-velar 250ms linear 1900ms forwards")).toBe(true);
    const velar = /@keyframes carga-velar \{\s*to \{ opacity: ([\d.]+); \}/.exec(css);
    expect(velar).not.toBeNull();
    expect(Number(velar![1])).toBeLessThanOrEqual(0.12);
    expect(tieneDeclaracion(css, ".carga-escaner__hud", "animation: carga-apagar 250ms linear 1900ms forwards")).toBe(true);  });

  it("el punto viaja 300 ms hasta el del icono, que toma el relevo, y la apertura sale de allí", () => {
    expect(tieneDeclaracion(css, ".carga-escaner__anillo", "carga-anillo-viaja 300ms cubic-bezier(0.65, 0, 0.35, 1) 2150ms forwards")).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__anillo", "carga-apagar 40ms linear 2450ms forwards")).toBe(true);
    expect(css).toMatch(/@keyframes carga-anillo-viaja \{\s*from \{ transform: translate\(0, 0\) scale\(var\(--carga-punto\)\); \}\s*to \{ transform: translate\(var\(--carga-dx\), var\(--carga-dy\)\) scale\(var\(--carga-punto\)\); \}/);
    expect(tieneDeclaracion(css, ".carga-escaner__logo svg g > circle:last-of-type", "animation: carga-encender 1ms linear 2450ms both")).toBe(true);
    expect(tieneDeclaracion(css, '.carga-escaner[data-modo="completo"]', "mask-image: radial-gradient(circle at var(--carga-ax) var(--carga-ay)")).toBe(true);  });

  it("rótulos mono en mayúsculas y gris atenuado; en móvil el rótulo de la lesión va debajo", () => {
    expect(tieneDeclaracion(css, ".carga-escaner__hud", "font-family: var(--font-mono)")).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__hud", "text-transform: uppercase")).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__hud", "color: var(--muted-foreground)")).toBe(true);
    expect(tieneDeclaracion(css, '.carga-escaner[data-tramo="movil"] .carga-escaner__rotulo', "transform: translateX(-50%)")).toBe(true);
  });

  it("la marca grande baja con clamp para caber a 360", () => {
    expect(tieneDeclaracion(css, ".carga-escaner__marca svg", "width: clamp(60px, 17vw, 120px)")).toBe(true);
    expect(tieneDeclaracion(css, ".carga-escaner__producto", "font-size: clamp(28px, 8.5vw, 56px)")).toBe(true);
    // A 360: icono (17 vw) + hueco + «Prospective™» (≈ 6,9 em de 8,5 vw) caben en 360 − 2 × 16.
    const vw = 3.6;
    const ancho = 17 * vw + 14 + 6.9 * 8.5 * vw;
    expect(ancho).toBeLessThanOrEqual(360 - 32);
  });
});
