/* Una sola manera de escribir la fuerza de cierre de un clip.

   La misma pieza NAVARRO salía con tres cifras: «120 g Óptima» en el mapa de
   calor (el mínimo de la banda), «125 g» en Fabricación (el centro de la ventana
   del cuello) y «120–200 g» en el pedido (la banda). Quien lee las tres no sabe
   cuál es la fuerza de la pieza (F1-202, F1-213). Ahora hay una cifra —el
   objetivo— y su banda, y las tres pantallas la escriben con esta función, igual
   que el dossier la escribe con `navarro.force_statement` en el backend. */

/** «120 g · banda 120–200 g»; sin banda (fuerza caracterizada), solo «120 g». */
export function forceWithBand(targetG: number, bandG?: readonly number[] | null): string {
  const t = `${targetG.toFixed(0)} g`;
  if (!bandG || bandG.length < 2 || !(bandG[1] > bandG[0])) return t;
  return `${t} · banda ${bandG[0].toFixed(0)}–${bandG[1].toFixed(0)} g`;
}
