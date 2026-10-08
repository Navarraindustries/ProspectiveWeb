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
