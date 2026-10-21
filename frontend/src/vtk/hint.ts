// La pista de gestos sale una vez por tipo de celda y sesión: repetirla cada
// vez que se cambia de principal acaba siendo ruido sobre la imagen.
export function shouldShowHint(kind: string, storage: Pick<Storage, "getItem" | "setItem">): boolean {
  const key = `ws.hintShown.${kind}`;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, "1");
  } catch {
    // Sin almacenamiento (modo privado): mejor enseñarla de más que nunca.
  }
  return true;
}

export type HintKind = "rotate" | "slice" | "mip";

/** Qué pista de gestos toca a la principal que se ve (`shownMain`). Con
 *  `layout.main` la celda 3D de CUATRO enseñaba la pista de VOLUMEN, que
 *  está oculta. En limpio no hay pista: es pantalla para la imagen. */
export function mainHintKind(p: {
  hudLevel: "completo" | "esencial" | "limpio"; main: "scene" | "axial" | "coronal" | "sagital" | "mip";
  sceneHasMesh: boolean; sceneIsSlice: boolean;
}): HintKind | null {
  if (p.hudLevel === "limpio") return null;
  if (p.main === "mip") return "mip";
  if (p.main === "scene" && p.sceneHasMesh) return "rotate";
  const slice = p.main === "axial" || p.main === "coronal" || p.main === "sagital" || (p.main === "scene" && p.sceneIsSlice);
  return slice ? "slice" : null;
}
