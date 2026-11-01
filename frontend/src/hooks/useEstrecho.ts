/* ¿La pantalla es estrecha (hasta 1280 px)? Spec §4.1: en esa disposición el
   panel lateral de Pacientes pasa debajo de las tarjetas y se compacta, y el
   inspector del pipeline baja a una hoja inferior. El umbral debe coincidir
   con el @media de patients.css. */

import { useEffect, useState } from "react";
import { CONSULTA, type Tramo } from "../styles/puntosCorte";

const lista = (q: string): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(q) : null;

/** ¿Se cumple esta consulta de medios? Sigue sus cambios. */
export function useMediaQuery(q: string): boolean {
  // Sin matchMedia (jsdom, entornos antiguos) se asume que no: con las
  // consultas de anchura máxima, la disposición completa es la que no esconde nada.
  const [cumple, setCumple] = useState(() => lista(q)?.matches ?? false);

  useEffect(() => {
    const mq = lista(q);
    if (!mq) return;
    const alCambiar = () => setCumple(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [q]);

  return cumple;
}

export function useEstrecho(): boolean {
  return useMediaQuery(CONSULTA.estrecho);
}

export function useMovil(): boolean {
  return useMediaQuery(CONSULTA.movil);
}

/** Hasta 1024 px: incluye el móvil. */
export function useTableta(): boolean {
  return useMediaQuery(CONSULTA.tableta);
}

export function useGrande(): boolean {
  return useMediaQuery(CONSULTA.grande);
}

export function useTramo(): Tramo {
  const movil = useMovil(), tableta = useTableta(), estrecho = useEstrecho(), grande = useGrande();
  if (movil) return "movil";
  if (tableta) return "tableta";
  if (estrecho) return "estrecho";
  return grande ? "grande" : "ancho";
}
