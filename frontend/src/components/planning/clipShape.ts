/* Cómo se nombra una pieza de la familia, en un solo sitio.

   La regla estaba escrita cuatro veces en el frontend y dos en el backend, y
   las copias se separaron justo donde importa. Tres de las del frontend —la
   tabla del registro de pedidos, su panel de detalle y la línea de cada pedido
   en el formulario— deducían el nombre SOLO del acodado:

       {order.angle_deg > 0 ? `${order.angle_deg}°` : "recto"}

   Un acodado de cero es lo único que un recto, un curvo y un fenestrado tienen
   en común, así que en pantalla los tres salían como «recto» mientras el albarán
   que recibía el taller decía «Curvo» o «Fenestrado ventana 5 mm». La pantalla y
   el papel se contradecían sobre qué pieza es.

   El campo `shape` ya viajaba en el pedido; solo había que mirarlo. Esto es el
   espejo de `navarro.shape_label`, y las dos series de pruebas comparan la misma
   pieza. */
import type { NavarroShape } from "../../api/types";

/** La serie que dibuja cada forma. Una serie, una forma: no se cruzan. */
export const SERIES_FOR_SHAPE: Record<NavarroShape, string> = {
  straight: "T1",
  curved: "T2",
  angled: "T3",
  fenestrated: "T4",
};

/** Cómo se llama la pieza, a partir de las tres cosas que la nombran. */
export function shapeLabel(
  shape: NavarroShape,
  angleDeg = 0,
  windowMm = 0,
): string {
  if (shape === "curved") return "Curvo";
  if (shape === "fenestrated") return `Fenestrado ventana ${Math.round(windowMm)} mm`;
  if (angleDeg > 0) return `Angulado ${Math.round(angleDeg)}°`;
  return "Recto";
}

/* El nombre de la FORMA lleva su ángulo canónico dentro («Angulado 90°») y la
   pieza concreta puede tener otro: la T3 de 60° se rotulaba «Angulado 90° 60°»,
   dos ángulos en la misma línea y ninguno de los dos claramente el suyo. Este
   es el espejo en pantalla de `ManufactureSpec.label` del backend. */
export function shapeWithBend(shape: string, bendDeg: number): string {
  if (bendDeg <= 0) return shape;
  const canonico = shape.match(/(\d+(?:[.,]\d+)?)\s*°/);
  if (!canonico) return `${shape} ${Math.round(bendDeg)}°`;
  return Math.abs(Number(canonico[1].replace(",", ".")) - bendDeg) < 0.5
    ? shape
    : shape.replace(/\d+(?:[.,]\d+)?\s*°/, `${Math.round(bendDeg)}°`);
}

/** Serie y forma juntas, que es como se lee un pedido de un vistazo. */
export const seriesAndShape = (
  shape: NavarroShape,
  angleDeg = 0,
  windowMm = 0,
): string => `${SERIES_FOR_SHAPE[shape]} ${shapeLabel(shape, angleDeg, windowMm)}`;
