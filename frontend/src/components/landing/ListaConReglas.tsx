/* ListaConReglas — la lista de la portada del tablero D: filas separadas por una
   regla de 1 px (`--border`), título 17/600, detalle atenuado debajo y, si la
   fila lleva cifra, esta va a la derecha en monoespaciada. Sin tarjetas. */

import type { ReactNode } from "react";

export interface FilaLista {
  titulo: ReactNode;
  detalle?: ReactNode;
  cifra?: ReactNode;
}

export function ListaConReglas({ items, columnas = 1 }: { items: FilaLista[]; columnas?: 1 | 2 }) {
  return (
    <ul className={columnas === 2 ? "lista-reglas lista-reglas--dos" : "lista-reglas"}>
      {items.map((it, i) => (
        <li key={i} className="lista-reglas__fila">
          <div className="lista-reglas__texto">
            <div className="lista-reglas__titulo">{it.titulo}</div>
            {it.detalle != null && <div className="lista-reglas__detalle">{it.detalle}</div>}
          </div>
          {it.cifra != null && <div className="lista-reglas__cifra">{it.cifra}</div>}
        </li>
      ))}
    </ul>
  );
}
