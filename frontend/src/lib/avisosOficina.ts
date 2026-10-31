/* Los tres avisos clínicos de la oficina (Pacientes): casos parados antes del
   informe, pedidos de clip parados y sesiones de hoy. Solo lo que pide una
   acción o confirma el día; con cero, el aviso no existe. */

import type { ClipOrder, PatientSummary } from "../api/types";
import { stepIndex } from "../pipeline/steps";
import { desdeServidor } from "./fecha";
import { isStale } from "./pedidosParados";

/** Índice del paso «Informe»: una sesión que llegó ahí ya no está parada. */
export const INFORME_STEP = stepIndex("report");

const DIA_MS = 86_400_000;

/** Pacientes cuya última sesión quedó antes del informe hace más de `dias`. */
export function casosParados(patients: PatientSummary[], ahora: Date, dias = 7): PatientSummary[] {
  const limite = ahora.getTime() - dias * DIA_MS;
  return patients.filter((p) => {
    if (!p.last_session_at || p.last_session_step === null) return false;
    if (p.last_session_step >= INFORME_STEP) return false;
    const t = desdeServidor(p.last_session_at).getTime();
    return !Number.isNaN(t) && t < limite;
  });
}

export function pedidosParados(orders: ClipOrder[]): ClipOrder[] {
  return orders.filter(isStale);
}

/** Pacientes con sesión guardada hoy (día local; el servidor da UTC). */
export function sesionesDeHoy(patients: PatientSummary[], ahora: Date): PatientSummary[] {
  return patients.filter((p) => {
    if (!p.last_session_at) return false;
    const d = desdeServidor(p.last_session_at);
    return d.getFullYear() === ahora.getFullYear()
      && d.getMonth() === ahora.getMonth()
      && d.getDate() === ahora.getDate();
  });
}

export type Aviso = {
  tono: "warning" | "destructive" | "success";
  titulo: string;
  detalle: string;
  destino: "orders" | "studies" | null;
};

const tres = (xs: string[]) => xs.slice(0, 3).join(" · ");

export function avisosOficina(
  { patients, orders, ahora }: { patients: PatientSummary[]; orders: ClipOrder[] | null; ahora: Date },
): Aviso[] {
  const avisos: Aviso[] = [];

  const parados = casosParados(patients, ahora);
  if (parados.length > 0) {
    avisos.push({
      tono: "warning",
      titulo: `${parados.length} ${parados.length === 1 ? "caso parado" : "casos parados"} antes del informe más de 7 días`,
      detalle: tres(parados.map((p) => p.full_name)),
      destino: null,
    });
  }

  // Sin acceso a los pedidos (null) no hay aviso de pedidos.
  const pedidos = orders ? pedidosParados(orders) : [];
  if (pedidos.length > 0) {
    avisos.push({
      tono: "warning",
      titulo: `${pedidos.length} ${pedidos.length === 1 ? "pedido de clip parado" : "pedidos de clip parados"}`,
      detalle: tres(pedidos.map((o) => o.part_no)),
      destino: "orders",
    });
  }

  const hoy = sesionesDeHoy(patients, ahora);
  if (hoy.length > 0) {
    avisos.push({
      tono: "success",
      titulo: `${hoy.length} ${hoy.length === 1 ? "sesión" : "sesiones"} de hoy`,
      detalle: tres(hoy.map((p) => p.full_name)),
      destino: null,
    });
  }

  return avisos;
}
