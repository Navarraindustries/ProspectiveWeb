import type { ReactNode } from "react";

/** Cuerpo de una página de la oficina: desplaza y limita el ancho a --content-max.
 *  "lista": la página desplaza entera. "pantalla": ocupa el alto y no desplaza
 *  (la ficha L3, cuyas columnas desplazan solas). */
export function PageBody({ children, modo = "lista", className }: {
  children: ReactNode;
  modo?: "lista" | "pantalla";
  className?: string;
}) {
  return (
    <div className="page-body" data-modo={modo}>
      <div className={"page-body__ancho" + (className ? " " + className : "")}>{children}</div>
    </div>
  );
}
