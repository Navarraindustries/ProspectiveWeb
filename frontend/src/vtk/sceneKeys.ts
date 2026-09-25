/* Cuándo se reconstruye la escena de vtk.js y cuándo no.

   Está aquí fuera, y no dentro de `MeshView`, porque es la regla que se rompió
   en producción y una regla que se rompe necesita una prueba que no arrastre
   media biblioteca de render.

   El fallo: la clave de la escena llevaba la URL de TODAS las capas. Durante el
   ensayo de colocación, el saco constreñido cambia de fichero cuatro veces
   —una por fotograma del cierre—, así que la escena se reconstruía cuatro
   veces: se tiraba la ventana de render, se recargaba el árbol vascular entero
   (pantalla en negro) y la limpieza hacía `registerParts(null)`, con lo que el
   ensayo perdía las asas de sus piezas y el clip se quedaba clavado a medio
   camino, sin llegar nunca al cuello.

   La regla correcta: una capa CON NOMBRE (`id`) es la misma capa aunque cambie
   de fichero; su geometría se sustituye en el actor que ya está en escena. Solo
   entrar o salir una capa, o cambiar el orden, justifica reconstruir. */

/** Lo único que estas claves miran de una capa. */
export interface KeyedLayer {
  url: string;
  /** Nombre estable: la capa sobrevive a un cambio de fichero. */
  id?: string;
}

/** Reconstruir la escena entera: capas que entran, salen o cambian de orden. */
export function sceneKey(layers: KeyedLayer[], focusUrl?: string | null): string {
  return layers.map((l) => l.id ?? l.url).join(";") + `#${focusUrl ?? ""}`;
}

/** Cambiar la geometría en sitio: qué fichero tiene cada capa con nombre. */
export function geometryKey(layers: KeyedLayer[]): string {
  return layers.filter((l) => l.id).map((l) => `${l.id}=${l.url}`).join(";");
}
