/* Gestos de la vista Oblicuo sobre el plano libre compartido. Puros: el
   componente solo traduce eventos a estas funciones, así que la regla de cada
   gesto se prueba sin WebGL. */
import { clampPlane, type FreePlane } from "./freePlane";

/** Medio grado por píxel: cruzar un panel típico (~360 px) da media vuelta de
 *  azimut, suficiente para orientar sin que un pulso pequeño lo dispare. */
export const DEG_PER_PX = 0.5;

/** Arrastre con el botón derecho desde el plano que había al empezar: a la
 *  derecha gira el azimut, hacia arriba sube la elevación (dy de pantalla crece
 *  hacia abajo, de ahí el signo). Acotado a los rangos del plano libre. */
export function dragAngles(start: FreePlane, dxPx: number, dyPx: number): FreePlane {
  return clampPlane({ ...start, azimuthDeg: start.azimuthDeg + dxPx * DEG_PER_PX, elevationDeg: start.elevationDeg - dyPx * DEG_PER_PX });
}

/** Un paso por evento de rueda, sea cual sea su deltaY: los ratones y los
 *  trackpads dan magnitudes muy distintas y el paso tiene que ser un corte. */
export function wheelOffset(p: FreePlane, deltaY: number, stepMm: number): FreePlane {
  return { ...p, offsetMm: p.offsetMm + Math.sign(deltaY) * stepMm };
}

/** Lectura del HUD: ángulos enteros, desplazamiento con signo y coma decimal.
 *  El signo se decide sobre el valor ya redondeado, para no leer «−0°» ni
 *  «−0,0 mm» con un arrastre de medio grado o una décima de milímetro. */
export function obliqueReadout(p: FreePlane): string {
  const deg = (d: number) => { const r = Math.round(d); return `${r < 0 ? "−" : ""}${Math.abs(r)}°`; };
  const mm = Math.round(p.offsetMm * 10) / 10;
  return `AZ ${deg(p.azimuthDeg)} · EL ${deg(p.elevationDeg)} · ${mm < 0 ? "−" : "+"}${Math.abs(mm).toFixed(1).replace(".", ",")} mm`;
}

/** Lectura del Oblicuo recorriendo el vaso: sección 1-based y calibre local. */
export function vesselReadout(index: number, count: number, diameterMm: number): string {
  return `VASO ${index + 1}/${count} · Ø ${diameterMm.toFixed(1).replace(".", ",")} mm`;
}
