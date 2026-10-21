/* Captura del 3D para el informe, sea cual sea la distribución del visor.

   Si la escena ocupa un hueco lateral pequeño, capturarla allí mete en el PDF
   una miniatura. Así que, si la escena no es la principal, se sube al hueco
   principal, se espera a que el lienzo tome el tamaño nuevo (el visor dice
   cuántos fotogramas), se captura y se vuelve a la distribución de antes. La
   rejilla ya no remonta las vistas al repartirlas, así que la captura
   registrada sigue siendo válida: no hay que esperar a que se registre otra.

   Sin vtk.js ni React: el visor pone las piezas y esto solo las ordena, para
   poder probar la secuencia con funciones falsas. */

export type CaptureFn = () => Promise<string | null>;

export interface CaptureLayoutDeps {
  /** ¿Está la escena en el hueco principal? */
  sceneIsMain: () => boolean;
  /** La captura de la escena; siempre registrada porque ya no se remonta
   *  (null solo si la escena aún no tiene nada en pantalla). */
  current: () => CaptureFn | null;
  /** Sube la escena al principal. */
  promote: () => void;
  /** Deja la distribución como estaba antes de promover. */
  restore: () => void;
  /** Resuelve cuando el lienzo ya tiene el tamaño del principal. */
  nextFrame: () => Promise<void>;
}

export async function captureWithLayout(d: CaptureLayoutDeps): Promise<string | null> {
  const cap = d.current();
  if (!cap) return null;
  if (d.sceneIsMain()) return cap();
  // La escena ya no se remonta al subir: basta con que el lienzo tome el
  // tamaño del hueco principal antes de leerlo.
  d.promote();
  try {
    await d.nextFrame();
    return await cap();
  } finally {
    // Pase lo que pase (captura fallida), el usuario recupera la distribución
    // que tenía.
    d.restore();
  }
}
