import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom ships no matchMedia, and the theme store reads it on mount.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// Nor a ResizeObserver, which the MPR overlays observe.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Ni un <video> que sepa reproducirse: en jsdom `play()` devuelve undefined, y
// el autoplay silencioso de la portada encadena un `.catch` sobre la promesa que
// un navegador real sí devuelve.
// Sin guarda, a diferencia de los de arriba: jsdom SÍ define `play`, solo que
// lanza «not implemented» y no devuelve nada.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
HTMLMediaElement.prototype.pause = vi.fn();

// Ni un <canvas> con WebGL: jsdom no implementa `getContext` y lanza un error
// aparatoso por cada intento. El hero de la portada monta dos escenas (el shader
// y el modelo vascular), así que sin esto la salida de las pruebas se llena de
// trazas «not implemented» que no señalan ningún fallo. Devolver null es lo que
// hace un navegador que no puede dar el contexto, y ambos componentes ya saben
// retirarse en ese caso.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
