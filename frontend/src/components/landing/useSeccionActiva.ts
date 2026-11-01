/* Sección activa de la landing: la que cruza la línea al 40 % del alto de la
   ventana. Alimenta la píldora de la nav. */

import { useEffect, useState } from "react";

export interface CajaSeccion {
  id: string;
  top: number;
  bottom: number;
}

export const LINEA_ACTIVA = 0.4;

export function seccionEnLinea(cajas: readonly CajaSeccion[], linea: number): string | null {
  return cajas.find((c) => c.top <= linea && linea < c.bottom)?.id ?? null;
}

export function useSeccionActiva(ids: readonly string[]): string | null {
  const [activa, setActiva] = useState<string | null>(null);
  const clave = ids.join("|");

  useEffect(() => {
    const calcular = () => {
      const cajas: CajaSeccion[] = [];
      for (const id of clave ? clave.split("|") : []) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r) cajas.push({ id, top: r.top, bottom: r.bottom });
      }
      const nueva = seccionEnLinea(cajas, window.innerHeight * LINEA_ACTIVA);
      setActiva((previa) => (previa === nueva ? previa : nueva));
    };
    calcular();
    window.addEventListener("scroll", calcular, { passive: true });
    window.addEventListener("resize", calcular, { passive: true });
    return () => {
      window.removeEventListener("scroll", calcular);
      window.removeEventListener("resize", calcular);
    };
  }, [clave]);

  return activa;
}
