/* El visor en el cliente necesita WebGL2 (texturas 3D). Sin él se vuelve al
   modo antiguo de PNG del servidor, con un aviso. Se comprueba una vez. */
let cached: boolean | null = null;
export function hasWebGL2(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement("canvas");
    cached = !!c.getContext("webgl2");
  } catch {
    cached = false;
  }
  return cached;
}
