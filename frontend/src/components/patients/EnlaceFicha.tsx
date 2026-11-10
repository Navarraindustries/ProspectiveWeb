/* El nombre de un paciente como enlace a su ficha (/app/pacientes/<id>).

   Pedidos y Auditoría nombraban al paciente sin dar camino hasta él: había que
   ir a Pacientes y buscarlo. Sin id (paciente borrado, pedido sin paciente)
   queda el texto. */

import type { ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { patientPath } from "../../store/nav";

export function EnlaceFicha({ patientId, children }: {
  patientId: number | null | undefined;
  children: ReactNode;
}) {
  // Sin Router alrededor no hay a dónde enlazar: queda el texto.
  const enRouter = useInRouterContext();
  if (patientId == null || !enRouter) return <>{children}</>;
  return (
    <Link
      to={patientPath(patientId)}
      title="Abrir la ficha del paciente"
      // Dentro de una fila pulsable el clic es del enlace, no de la fila.
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
