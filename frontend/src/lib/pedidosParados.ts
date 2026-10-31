/* Cuándo un pedido de clip lleva demasiado parado: lo comparten el registro de
   pedidos (ClipOrders) y los avisos de la oficina (Pacientes). */

import type { ClipOrder, OrderStatus } from "../api/types";

/** Días a partir de los cuales un pedido parado empieza a pintarse en ámbar.
    No es una promesa del taller: es cuándo conviene preguntar. */
export const STALE_DAYS: Partial<Record<OrderStatus, number>> = {
  firmado: 3,          // firmado y sin enviar
  enviado: 21,         // enviado y sin noticias
  en_fabricacion: 45,
  recibida: 7,         // recibida y sin aceptar ni rechazar
};

export const daysSince = (ts: number) => Math.floor((Date.now() / 1000 - ts) / 86400);

export function isStale(o: ClipOrder): boolean {
  const limit = STALE_DAYS[o.status];
  return limit != null && daysSince(o.updated_at) >= limit;
}
