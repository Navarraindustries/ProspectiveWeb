/* Captura del 3D para el informe, sea cual sea la distribución del visor.

   Con un corte maximizado la escena vive en una celda de la franja (~235 px)
   y capturarla allí mete en el PDF una miniatura. Así que, si la escena no es
   el principal, se sube al principal, se espera a que la MeshView que se
   monta ahí tenga la escena en pantalla y registre su captura, se deja pasar
   un fotograma, se captura y se vuelve a la distribución de antes.

   Sin vtk.js ni React: el visor pone las piezas y esto solo las ordena, para
   poder probar la secuencia con funciones falsas. */

export type CaptureFn = () => Promise<string | null>;

export interface CaptureLayoutDeps {
  /** ¿Está la escena en el panel principal? */
  sceneIsMain: () => boolean;
  /** La captura registrada ahora mismo (null si no hay escena montada). */
  current: () => CaptureFn | null;
  /** Sube la escena al principal. */
  promote: () => void;
  /** Deja la distribución como estaba antes de promover. */
  restore: () => void;
  /** Resuelve con la captura de la escena recién montada, o con null si no
   *  llega a tiempo. Se arma ANTES de promover para no perder el registro. */
  waitForCapture: () => Promise<CaptureFn | null>;
  /** Un fotograma de animación: el lienzo ya tiene el tamaño del principal. */
  nextFrame: () => Promise<void>;
}

export async function captureWithLayout(d: CaptureLayoutDeps): Promise<string | null> {
  if (d.sceneIsMain()) {
    const cap = d.current();
    return cap ? cap() : null;
  }
  const waiting = d.waitForCapture();
  d.promote();
  try {
    const cap = await waiting;
    if (!cap) return null;
    await d.nextFrame();
    return await cap();
  } finally {
    // Pase lo que pase (captura fallida, tiempo agotado), el usuario recupera
    // la distribución que tenía.
    d.restore();
  }
}
