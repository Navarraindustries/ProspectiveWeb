/** Reloj del cine, sin React: el visor lo arranca con un `tick` que lee el
 *  estado por referencias, así que cambiar de corte no lo reinicia. */
import { clampFps } from "./cine";

/** Llama a `tick` a `fps` fotogramas por segundo; devuelve la parada. */
export function startClock(fps: number, tick: () => void): () => void {
  const id = setInterval(tick, 1000 / clampFps(fps));
  return () => clearInterval(id);
}
