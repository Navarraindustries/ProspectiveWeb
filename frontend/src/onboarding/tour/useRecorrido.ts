/* Estado de un recorrido guiado: parada actual, su objetivo en el DOM y el
   rectángulo que ocupa (se recalcula con resize, scroll y ResizeObserver).
   Las paradas `opcional` sin objetivo se saltan al avanzar y al retroceder. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Explicacion } from "../copy";
import { rectQueAbarca, resolverObjetivo, resolverObjetivos } from "./resolverObjetivo";

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
  const hecho = useRef(false);
  const terminarUnaVez = useCallback((como: "completado" | "saltado") => {
    if (hecho.current) return;
    hecho.current = true;
    terminar.current(como);
  }, []);
  const parada = paradas[Math.min(indice, paradas.length - 1)];
  const vivo = useRef(parada);
  vivo.current = parada;
  const clave = `${parada.id}|${parada.objetivos.join(",")}`;

  useEffect(() => {
    let observados: HTMLElement[] = [];
    let observado: HTMLElement | null = null;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => medir()) : null;
    function medir() {
      // Una alternativa «a+b» da varios elementos: el foco abarca todos.
      const els = resolverObjetivos(vivo.current.objetivos);
      if (els.length !== observados.length || els.some((el, i) => el !== observados[i])) {
        observados.forEach((el) => ro?.unobserve(el));
        observados = els;
        els.forEach((el) => ro?.observe(el));
      }
      const el = els[0] ?? null;
      observado = el;
      setObjetivo(el);
      const r = rectQueAbarca(els);
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
  }, [clave]);

  const siguiente = useCallback(() => {
    let i = indice + 1;
    while (i < paradas.length && omitida(paradas[i])) i++;
    if (i >= paradas.length) terminarUnaVez("completado");
    else setIndice(i);
  }, [indice, paradas, terminarUnaVez]);

  const anterior = useCallback(() => {
    let i = indice - 1;
    while (i >= 0 && omitida(paradas[i])) i--;
    if (i >= 0) setIndice(i);
  }, [indice, paradas, terminarUnaVez]);

  const saltar = useCallback(() => terminarUnaVez("saltado"), [terminarUnaVez]);

  return { indice, parada, total: paradas.length, objetivo, rect, siguiente, anterior, saltar };
}
