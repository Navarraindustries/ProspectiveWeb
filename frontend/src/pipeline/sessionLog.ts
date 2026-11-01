/* Registro de la sesión: qué ha ido pasando y cuándo. Vive solo en memoria y se
   vacía al cambiar de sesión. No mide duraciones: el store no expone ningún
   indicador de «segmentando»/«detectando», así que `duracionMs` queda libre para
   cuando exista y hoy no se inventa. */

import { useEffect, useRef, useState } from "react";
import { cifra } from "../lib/numero";
import { usePlanning } from "../store/planning";
import { candidateNameAt } from "../components/planning/detectCopy";

export interface LogEntry {
  at: Date;
  paso: string;
  texto: string;
  duracionMs?: number;
}

export type CampoLog = "serie" | "segmentacion" | "candidatos" | "candidato" | "morfometria" | "guardado";

const vacio = (v: unknown) => v == null || (Array.isArray(v) && v.length === 0);

const num = (o: unknown, k: string): number | null => {
  const v = (o as Record<string, unknown> | null)?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** La entrada que merece el paso de `anterior` a `actual`, o null si no hay nada que contar.
 *  Serie, segmentación, candidatos y medida cuentan al pasar de vacío a valor; el
 *  candidato elegido (su id) y el guardado (su hora) cuentan cada vez que cambian.
 *  Si a la serie, la segmentación o la medida les falta la cifra, no se inventa. */
export function entradaPara(
  campo: CampoLog, anterior: unknown, actual: unknown, paso: string, ahora: Date,
): LogEntry | null {
  if (vacio(actual)) return null;
  const repetible = campo === "candidato" || campo === "guardado";
  if (repetible ? anterior === actual || (anterior instanceof Date && actual instanceof Date && +anterior === +actual)
    : !vacio(anterior)) return null;
  let texto: string;
  switch (campo) {
    case "serie": {
      const n = num(actual, "slices");
      if (n === null) return null;
      texto = `DICOM cargado · ${n} cortes`; break;
    }
    case "segmentacion": {
      const n = num(actual, "vertices");
      if (n === null) return null;
      texto = `Segmentación · ${n} vértices`; break;
    }
    case "candidatos": texto = `Detección · ${(actual as unknown[]).length} candidatos`; break;
    case "candidato": texto = `Elegido ${String(actual)}`; break;
    case "morfometria": {
      const d = num(actual, "max_diameter_mm");
      if (d === null) return null;
      texto = `Medida · Ø máx. ${cifra(d)} mm`; break;
    }
    case "guardado": texto = "Progreso guardado"; break;
  }
  return { at: ahora, paso, texto };
}

const TODO_VACIO: Record<CampoLog, unknown> = {
  serie: null, segmentacion: null, candidatos: null, candidato: null, morfometria: null, guardado: null,
};

/** Observa el store y va apuntando. `paso` es el rótulo del paso en curso y
 *  `savedAt` la hora del último guardado (que vive en el espacio de trabajo). */
export function useSessionLog(paso: string, savedAt?: Date | null): LogEntry[] {
  const p = usePlanning();
  const { sessionId, series, segmentation, candidates, morphometry, selectedCandidate } = p;
  const lista = p.allCandidates?.length ? p.allCandidates : candidates;
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const previos = useRef<Record<CampoLog, unknown>>(TODO_VACIO);
  const sesion = useRef(sessionId);
  const listaPrev = useRef(lista);
  const indicePrev = useRef(selectedCandidate);
  const pasoRef = useRef(paso);
  pasoRef.current = paso;

  useEffect(() => {
    // «Elegido» es una decisión de quien usa la aplicación: solo cuenta si el
    // índice cambia sobre la misma lista, no cuando la detección devuelve una
    // lista nueva (que reinicia el índice a 0).
    const mismaLista = listaPrev.current === lista;
    const cambio = mismaLista && indicePrev.current !== selectedCandidate;
    const elegido = cambio ? candidateNameAt(candidates, lista.slice(candidates.length), selectedCandidate) : null;
    listaPrev.current = lista;
    indicePrev.current = selectedCandidate;

    const actuales: Record<CampoLog, unknown> = {
      serie: series, segmentacion: segmentation, candidatos: candidates,
      candidato: elegido, morfometria: morphometry, guardado: savedAt ?? null,
    };
    const nueva = sesion.current !== sessionId;
    if (nueva) {
      // Sesión nueva: el registro empieza de cero y lo que ya hay al llegar
      // (una subida trae sesión y serie a la vez; una reanudación, todo) se cuenta.
      sesion.current = sessionId;
      previos.current = TODO_VACIO;
    }
    const ahora = new Date();
    const nuevas: LogEntry[] = [];
    for (const campo of Object.keys(actuales) as CampoLog[]) {
      const e = entradaPara(campo, previos.current[campo], actuales[campo], pasoRef.current, ahora);
      if (e) nuevas.push(e);
    }
    previos.current = { ...actuales, candidato: null };
    if (nueva) setEntries(sessionId ? nuevas : []);
    else if (nuevas.length) setEntries((prev) => [...prev, ...nuevas]);
  }, [sessionId, series, segmentation, candidates, lista, selectedCandidate, morphometry, savedAt]);

  return entries;
}
