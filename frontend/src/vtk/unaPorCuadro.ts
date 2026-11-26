/* FE-18: aplica como mucho un valor por cuadro (requestAnimationFrame).

   El puntero manda más movimientos que cuadros se pintan; cada uno escribía en
   el store y repintaba el quirófano. `programar` guarda el último y lo aplica
   en el siguiente cuadro; `soltar` lo aplica YA (al terminar el gesto, para no
   perder la última pose); `descartar` lo tira (al cancelar). */
export interface UnaPorCuadro<T> {
  programar(v: T): void;
  soltar(): void;
  descartar(): void;
}

export function unaPorCuadro<T>(aplicar: (v: T) => void,
                                raf: (f: () => void) => number = (f) => requestAnimationFrame(f),
                                cancelar: (id: number) => void = (id) => cancelAnimationFrame(id)): UnaPorCuadro<T> {
  let pendiente: { v: T } | null = null;
  let cuadro: number | null = null;
  const cancelarCuadro = () => { if (cuadro !== null) { cancelar(cuadro); cuadro = null; } };
  const soltar = () => {
    cancelarCuadro();
    const p = pendiente;
    pendiente = null;
    if (p) aplicar(p.v);
  };
  return {
    programar(v) {
      pendiente = { v };
      if (cuadro === null) cuadro = raf(() => { cuadro = null; soltar(); });
    },
    soltar,
    descartar() { cancelarCuadro(); pendiente = null; },
  };
}
