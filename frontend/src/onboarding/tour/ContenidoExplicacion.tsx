/* Cuerpo de una explicación: título y tres líneas (Cómo / Cuándo / Por qué).
   Lo comparten la burbuja del recorrido (modal) y la pista por paso (no modal). */

import type { Explicacion } from "../copy";

export function ContenidoExplicacion({ explicacion: x }: { explicacion: Explicacion }) {
  const linea = (etiqueta: string, texto: string) => (
    <p className="tour-linea"><span className="tour-etiqueta">{etiqueta}</span>{texto}</p>
  );
  return (
    <>
      <h2 className="tour-titulo">{x.titulo}</h2>
      {linea("Cómo", x.como)}
      {linea("Cuándo", x.cuando)}
      {linea("Por qué", x.porque)}
    </>
  );
}
