import type { ReactNode } from "react";

/** Cuerpo de una página de la oficina: desplaza y limita el ancho a --content-max.
 *  "lista": la página desplaza entera. "pantalla": ocupa el alto y no desplaza
 *  (la ficha L3, cuyas columnas desplazan solas). `lienzo` quita el tope de
 *  --content-max (la ficha a ≥ 1920, donde caben sus cinco columnas). */
export function PageBody({ children, modo = "lista", lienzo = false, className }: {
  children: ReactNode;
  modo?: "lista" | "pantalla";
  lienzo?: boolean;
  className?: string;
}) {
  return (
    <div className="page-body" data-modo={modo} data-lienzo={lienzo ? "true" : undefined}>
      <div className={"page-body__ancho" + (className ? " " + className : "")}>{children}</div>
    </div>
  );
}
