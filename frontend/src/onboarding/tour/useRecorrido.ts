/* Estado de un recorrido guiado: parada actual, su objetivo en el DOM y el
   rectángulo que ocupa (se recalcula con resize, scroll y ResizeObserver).
   Las paradas `opcional` sin objetivo se saltan al avanzar y al retroceder. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Explicacion } from "../copy";
import { resolverObjetivo } from "./resolverObjetivo";

export interface Parada {
  id: string;
  objetivos: string[];
  explicacion: Explicacion;
  opcional?: boolean;
  extra?: ReactNode;
}

export interface Recorrido {
  indice: number;
  parada: Parada;
  total: number;
  objetivo: HTMLElement | null;
  rect: DOMRect | null;
  siguiente(): void;
  anterior(): void;
  saltar(): void;
}

const omitida = (p: Parada) => !!p.opcional && resolverObjetivo(p.objetivos) === null;

function igual(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

export function useRecorrido(
  paradas: Parada[],
  opts: { onTerminar: (como: "completado" | "saltado") => void },
): Recorrido {
  const [indice, setIndice] = useState(() => {
    const i = paradas.findIndex((p) => !omitida(p));
    return i < 0 ? 0 : i;
  });
  const [objetivo, setObjetivo] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const terminar = useRef(opts.onTerminar);
  terminar.current = opts.onTerminar;
  const parada = paradas[Math.min(indice, paradas.length - 1)];

  useEffect(() => {
    let observado: HTMLElement | null = null;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => medir()) : null;
    function medir() {
      const el = resolverObjetivo(parada.objetivos);
      if (el !== observado) {
        if (observado) ro?.unobserve(observado);
        observado = el;
        if (el) ro?.observe(el);
      }
      setObjetivo(el);
      const r = el ? el.getBoundingClientRect() : null;
      setRect((previo) => (igual(previo, r) ? previo : r));
    }
    medir();
    if (observado && typeof (observado as HTMLElement).scrollIntoView === "function") {
      (observado as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" });
      medir();
    }
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      ro?.disconnect();
    };
  }, [parada]);

  const siguiente = useCallback(() => {
    let i = indice + 1;
    while (i < paradas.length && omitida(paradas[i])) i++;
    if (i >= paradas.length) terminar.current("completado");
    else setIndice(i);
  }, [indice, paradas]);

  const anterior = useCallback(() => {
    let i = indice - 1;
    while (i >= 0 && omitida(paradas[i])) i--;
    if (i >= 0) setIndice(i);
  }, [indice, paradas]);

  const saltar = useCallback(() => terminar.current("saltado"), []);

  return { indice, parada, total: paradas.length, objetivo, rect, siguiente, anterior, saltar };
}
