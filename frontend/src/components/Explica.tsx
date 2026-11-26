/* UX-16: una explicación clínica que se puede LEER sin ratón.

   Muchas explicaciones existían solo como texto emergente (`title`): en una
   tableta o con el teclado no había forma de verlas. Aquí el texto sigue
   saliendo al pasar el ratón, y además un botón «ⓘ» lo despliega debajo,
   visible, con el dedo, el ratón o el teclado (Intro o espacio). */
import { useId, useState, type ReactNode } from "react";

export function Explica({ texto, children, como = "span" }: {
  texto: string;
  children: ReactNode;
  /** «div» cuando lo que se explica es un bloque (una métrica, una tarjeta). */
  como?: "span" | "div";
}) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const Envoltorio = como;
  return (
    <Envoltorio className="explica" title={abierta ? undefined : texto}>
      {children}
      <button type="button" className="explica-boton" aria-expanded={abierta} aria-controls={id}
              aria-label={abierta ? "Ocultar la explicación" : "Ver la explicación"}
              onClick={(e) => { e.stopPropagation(); setAbierta((a) => !a); }}>
        ⓘ
      </button>
      {abierta && <span id={id} role="note" className="explica-texto">{texto}</span>}
    </Envoltorio>
  );
}
