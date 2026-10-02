// frontend/src/vtk/layerMatrix.ts
/* Qué matriz de usuario lleva el actor de una capa con nombre mientras su
   geometría se cambia en sitio.

   POR QUÉ: la matriz delta del clip se calcula para la malla cocida en una pose
   concreta (la del plan). Cuando llega un plan nuevo, el panel cambia la lista
   planificada y la URL de la malla en el mismo tic; la matriz nueva (identidad,
   o el delta respecto a la pose nueva) solo tiene sentido sobre la malla NUEVA,
   que aún se está descargando. Aplicarla sobre la vieja devuelve el clip a su
   pose de antes de arrastrar hasta que llega el fichero. Así que:
     1. mientras el fichero cargado no es el de la capa, se deja la matriz que
        el actor ya tiene (la que casa con la malla que se ve);
     2. justo tras poner la geometría nueva, se aplica la matriz ACTUAL de la
        capa (la de ese instante, no la de cuando empezó la descarga). */
import { IDENTITY, type Mat4 } from "./clipPose";

/** La matriz de la capa se aplica solo si el actor muestra el fichero para el que se calculó. */
export function shouldApplyMatrix(loadedUrl: string | undefined, layerUrl: string): boolean {
  return loadedUrl === layerUrl;
}

/** Matriz que toca justo después de cambiar la geometría: la actual de la capa;
 *  la identidad si la capa tuvo matriz y ya no; `null` si nunca tuvo (no se
 *  toca: una pieza del ensayo lleva la pose que le puso la animación). */
export function matrixAfterSwap(userMatrix: Mat4 | undefined, hadMatrix: boolean): Mat4 | null {
  if (userMatrix) return userMatrix;
  return hadMatrix ? IDENTITY : null;
}

/** La matriz de una capa (por filas, como la construye clipPose) en el orden
 *  que espera `actor.setUserMatrix`: vtk.js la multiplica con gl-matrix, que
 *  lee POR COLUMNAS. Sin esto la traslación caía en la fila proyectiva y el
 *  clip desaparecía mientras se arrastraba. Devuelve una copia. */
export function toColumnMajor(m: Mat4): number[] {
  const r = new Array<number>(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) r[j * 4 + i] = m[i * 4 + j];
  return r;
}
