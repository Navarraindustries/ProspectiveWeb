/* ¿La pantalla es estrecha (hasta 1280 px)? Spec §4.1: en esa disposición el
   panel lateral de Pacientes pasa debajo de las tarjetas y se compacta, y el
   inspector del pipeline baja a una hoja inferior. El umbral debe coincidir
   con el @media de patients.css. */

import { useEffect, useState } from "react";

const CONSULTA = "(max-width: 1280px)";

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
  return useMediaQuery(CONSULTA);
}
