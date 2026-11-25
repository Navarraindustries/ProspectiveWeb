/* UX-24: los colores del mapa azul → gris → rojo (aposición del stent, cambio
   entre estudios), en un solo sitio. El mapa 3D (`divergingLut`) y las tres
   leyendas que lo explican los tenían escritos cada uno a mano: cambiar uno
   dejaba la leyenda contando otro color. */

export type Rgb = readonly [number, number, number];

export const MAPA_DIVERGENTE = {
  azul: [0.15, 0.35, 0.85] as Rgb,
  gris: [0.78, 0.8, 0.82] as Rgb,
  rojo: [0.88, 0.2, 0.15] as Rgb,
} as const;

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

/** El degradado de la leyenda, con la franja gris entre `desde`% y `hasta`%. */
export function degradadoLeyenda(desde: number, hasta: number): string {
  const { azul, gris, rojo } = MAPA_DIVERGENTE;
  return `linear-gradient(90deg, ${css(azul)}, ${css(gris)} ${desde}%, ${css(gris)} ${hasta}%, ${css(rojo)})`;
}
