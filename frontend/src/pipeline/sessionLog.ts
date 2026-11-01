/* Registro de la sesión: qué ha ido pasando y cuándo. Vive solo en memoria y se
   vacía al cambiar de sesión. No mide duraciones: el store no expone ningún
   indicador de «segmentando»/«detectando», así que `duracionMs` queda libre para
   cuando exista y hoy no se inventa. */

import { useEffect, useRef, useState } from "react";
import { usePlanning } from "../store/planning";

export interface LogEntry {
  at: Date;
  paso: string;
  texto: string;
  duracionMs?: number;
}

export type CampoLog = "serie" | "segmentacion" | "candidatos" | "candidato" | "morfometria" | "guardado";

const coma = (n: number, dec = 1) => n.toFixed(dec).replace(".", ",");

const vacio = (v: unknown) => v == null || (Array.isArray(v) && v.length === 0);

/** La entrada que merece el paso de `anterior` a `actual`, o null si no hay nada que contar.
 *  Serie, segmentación, candidatos y medida cuentan al pasar de vacío a valor; el
 *  candidato elegido (su id) y el guardado (su hora) cuentan cada vez que cambian. */
export function entradaPara(
  campo: CampoLog, anterior: unknown, actual: unknown, paso: string, ahora: Date,
): LogEntry | null {
  if (vacio(actual)) return null;
  const repetible = campo === "candidato" || campo === "guardado";
  if (repetible ? anterior === actual || (anterior instanceof Date && actual instanceof Date && +anterior === +actual)
    : !vacio(anterior)) return null;
  const a = actual as Record<string, number> & unknown[];
  let texto: string;
  switch (campo) {
    case "serie": texto = `DICOM cargado · ${a.slices} cortes`; break;
    case "segmentacion": texto = `Segmentación · ${a.vertices} vértices`; break;
    case "candidatos": texto = `Detección · ${a.length} candidatos`; break;
    case "candidato": texto = `Elegido ${String(actual)}`; break;
    case "morfometria": texto = `Medida · Ø máx. ${coma(a.max_diameter_mm)} mm`; break;
    case "guardado": texto = "Progreso guardado"; break;
  }
  return { at: ahora, paso, texto };
}

/** Observa el store y va apuntando. `paso` es el rótulo del paso en curso y
 *  `savedAt` la hora del último guardado (que vive en el espacio de trabajo). */
export function useSessionLog(paso: string, savedAt?: Date | null): LogEntry[] {
  const p = usePlanning();
  const { sessionId, series, segmentation, candidates, morphometry } = p;
  const elegido = candidates?.[p.selectedCandidate ?? 0]?.id ?? null;
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const previos = useRef<Record<CampoLog, unknown>>({
    serie: null, segmentacion: null, candidatos: null, candidato: null, morfometria: null, guardado: null,
  });
  const sesion = useRef(sessionId);
  const pasoRef = useRef(paso);
  pasoRef.current = paso;

  useEffect(() => {
    const actuales: Record<CampoLog, unknown> = {
      serie: series, segmentacion: segmentation, candidatos: candidates,
      candidato: elegido, morfometria: morphometry, guardado: savedAt ?? null,
    };
    if (sesion.current !== sessionId) {
      // Sesión nueva: el registro empieza de cero y lo que ya hay no cuenta como novedad.
      sesion.current = sessionId;
      previos.current = actuales;
      setEntries([]);
      return;
    }
    const ahora = new Date();
    const nuevas: LogEntry[] = [];
    for (const campo of Object.keys(actuales) as CampoLog[]) {
      const e = entradaPara(campo, previos.current[campo], actuales[campo], pasoRef.current, ahora);
      if (e) nuevas.push(e);
    }
    previos.current = actuales;
    if (nuevas.length) setEntries((prev) => [...prev, ...nuevas]);
  }, [sessionId, series, segmentation, candidates, elegido, morphometry, savedAt]);

  return entries;
}
