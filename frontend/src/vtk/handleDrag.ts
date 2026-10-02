/* El ciclo de un arrastre de asa como máquina de estados pura: qué se emite y
   si la cámara debe responder. MeshView solo traduce eventos del puntero. */
export type DragEvent = { type: "down"; id: string | null; button: number } | { type: "move" } | { type: "up" } | { type: "cancel" } | { type: "lost" } | { type: "escape" };
export interface DragState { id: string | null }
export interface DragStep { state: DragState; emit: "start" | "move" | "end" | "cancel" | null; cameraEnabled: boolean }
export function nextDrag(state: DragState, ev: DragEvent): DragStep {
  if (ev.type === "down") {
    // Solo el botón izquierdo sobre un asa arrastra: el derecho y la rueda siguen
    // siendo de la cámara aunque caigan encima de un asa.
    if (ev.button === 0 && ev.id) return { state: { id: ev.id }, emit: "start", cameraEnabled: false };
    return { state, emit: null, cameraEnabled: state.id === null };
  }
  if (!state.id) return { state, emit: null, cameraEnabled: true };
  if (ev.type === "move") return { state, emit: "move", cameraEnabled: false };
  // Escape deshace (el consumidor restaura la pose de partida); soltar, cancelar el
  // puntero o perder la captura confirman lo arrastrado hasta ahí.
  if (ev.type === "escape") return { state: { id: null }, emit: "cancel", cameraEnabled: true };
  return { state: { id: null }, emit: "end", cameraEnabled: true };
}

/** Qué asa coge una pulsación que toca varias (llegan de la más cercana a la
 *  más lejana). Una esfera gana a todo lo demás: el anillo pasa por el centro
 *  de la esfera verde y, visto de canto, es una raya que la cruza; con la
 *  tolerancia del picker se quedaba la pulsación y el clip giraba en vez de
 *  moverse. Entre iguales, la más cercana. */
export function chooseHandle(hits: { id: string; kind: string }[]): string | null {
  return (hits.find((h) => h.kind === "sphere") ?? hits[0])?.id ?? null;
}
