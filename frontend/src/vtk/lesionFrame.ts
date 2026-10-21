/** Medio lado del cubo que encuadra «Centrar en la lesión».
 *
 *  Eran 30 mm fijos, o sea un cubo de 60: en una 3D-RA eso es el árbol entero,
 *  y un aneurisma de 4 mm quedaba en un punto de seis píxeles sobre el que
 *  había que marcar cuello y ápice. Ahora es la lesión y lo que la rodea: dos
 *  veces y media su diámetro, entre 6 y 15 mm. */
export function lesionFrameRadiusMm(diameterMm: number): number {
  if (!(diameterMm > 0)) return 10;
  return Math.min(15, Math.max(6, 2.5 * diameterMm));
}
