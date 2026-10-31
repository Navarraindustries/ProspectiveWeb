/* ¿La pantalla es estrecha (bajo 1100 px)? Spec §4.1: en esa disposición el
   panel lateral pasa debajo de las tarjetas y se compacta. El umbral debe
   coincidir con el @media de patients.css. */

import { useEffect, useState } from "react";

const CONSULTA = "(max-width: 1099px)";

const consulta = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(CONSULTA) : null;

export function useEstrecho(): boolean {
  // Sin matchMedia (jsdom, entornos antiguos) se asume pantalla ancha: la
  // disposición completa es la que no esconde nada.
  const [estrecho, setEstrecho] = useState(() => consulta()?.matches ?? false);

  useEffect(() => {
    const mq = consulta();
    if (!mq) return;
    const alCambiar = () => setEstrecho(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  return estrecho;
}
