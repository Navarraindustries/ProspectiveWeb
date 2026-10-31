/* Cálculos puros de la pantalla de pacientes: sin React ni red, para que el
   panel de tarjetas, los contadores y las pestañas digan lo mismo y se
   prueban sin montar la página. */

import type { PatientSummary } from "../api/types";
import { STEPS, STEP_LABELS, clampStep } from "../pipeline/steps";
import { desdeServidor, fechaHora } from "./fecha";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

export type PestanaPacientes = "todos" | "mios" | "compartidos";
export type AccionPrincipal = "reanudar" | "abrir-informe" | "planificar";

/** «Ningún paciente», «1 paciente», «7 pacientes»: decía «1 registros» (F2-19). */
export function recuentoPacientes(n: number): string {
  if (n === 0) return "Ningún paciente";
  return n === 1 ? "1 paciente" : `${n} pacientes`;
}

/** Última actividad: la última sesión guardada o, si no hay, el alta. Quien
 *  vuelve cada día espera arriba al paciente con el que trabajó por última
 *  vez, no al último dado de alta (F2-19). */
export function ultimaActividad(p: PatientSummary): number {
  const alta = desdeServidor(p.created_at).getTime();
  const sesion = p.last_session_at ? desdeServidor(p.last_session_at).getTime() : NaN;
  return Math.max(Number.isNaN(alta) ? 0 : alta, Number.isNaN(sesion) ? 0 : sesion);
}

/** «Segmentación · 11/10/26, 0:05»: dónde quedó y cuándo, en hora local. */
export function ultimaSesion(p: PatientSummary): string {
  if (!p.last_session_at || p.last_session_step === null) return "—";
  return `${STEP_LABELS[clampStep(p.last_session_step)]} · ${fechaHora(p.last_session_at)}`;
}

/** «hace 3 h», «ayer», «hace 2 semanas»… para la tarjeta. A partir de 30 días
 *  el texto relativo pierde sentido y se pone la fecha local. Una marca en el
 *  futuro (reloj del servidor adelantado) se trata como «ahora» y no como un
 *  tiempo negativo. */
export function tiempoRelativo(iso: string, ahora: Date = new Date()): string {
  const t = desdeServidor(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = ahora.getTime() - t;
  if (diff < MIN) return "hace un momento";

  const minutos = Math.floor(diff / MIN);
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} d`;
  if (dias < 30) {
    // 28 y 29 días caen en «4 semanas»: el tope de 4 evita un «hace 5 semanas» sin fecha.
    const semanas = Math.min(Math.floor(dias / 7), 4);
    return semanas === 1 ? "hace 1 semana" : `hace ${semanas} semanas`;
  }
  return desdeServidor(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** El paso de la tarjeta: número (1-based) y rótulo. Sin sesión, nada que mostrar. */
export function pasoDeTarjeta(step: number | null): { n: number; label: string } | null {
  if (step === null) return null;
  const i = clampStep(step);
  return { n: i + 1, label: STEPS[i].label };
}

/** Qué botón lleva la tarjeta. Sin sesión se planifica; en el último paso se
 *  abre el informe, porque reanudar allí no lleva a ningún sitio nuevo. */
export function accionPrincipal(p: PatientSummary): AccionPrincipal {
  if (!p.last_session_id) return "planificar";
  const paso = pasoDeTarjeta(p.last_session_step);
  if (paso && paso.n === STEPS.length) return "abrir-informe";
  return "reanudar";
}

/** Los cuatro contadores de «hoy». «Semana» cuenta la última sesión de los
 *  últimos 7 días; una marca futura cuenta también, igual que en tiempoRelativo. */
export function resumenHoy(ps: PatientSummary[], ahora: Date = new Date()) {
  const limite = ahora.getTime() - 7 * DIA;
  let enCurso = 0;
  let conInforme = 0;
  let semana = 0;
  let compartidos = 0;
  for (const p of ps) {
    const paso = p.last_session_id ? pasoDeTarjeta(p.last_session_step) : null;
    if (paso && paso.n < STEPS.length) enCurso += 1;
    if (paso && paso.n === STEPS.length) conInforme += 1;
    if (p.last_session_at && desdeServidor(p.last_session_at).getTime() >= limite) semana += 1;
    if (p.is_shared_with_me) compartidos += 1;
  }
  return { pacientes: ps.length, enCurso, conInforme, semana, compartidos };
}

/** La pestaña pide «mis pacientes» por dueño. Sin usuario conocido no hay
 *  «míos»: un null en owner_id no debe pasar por coincidencia. */
export function filtraPestana(ps: PatientSummary[], pestana: PestanaPacientes, userId: number | null): PatientSummary[] {
  if (pestana === "todos") return ps;
  if (pestana === "compartidos") return ps.filter((p) => p.is_shared_with_me);
  if (userId === null) return [];
  return ps.filter((p) => p.owner_id === userId);
}

/** Si la pestaña «compartidos» tiene algo que mostrar. */
export function hayCompartidos(ps: PatientSummary[]): boolean {
  return ps.some((p) => p.is_shared_with_me);
}
