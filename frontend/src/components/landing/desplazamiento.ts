/* Desplazamiento animado a las secciones de la landing (A1).
   0,6 s con la curva común; la rueda, un toque o una tecla lo cortan; con
   movimiento reducido salta directo. Al llegar enfoca la sección y deja el
   `#id` en la URL. */

import type { MouseEvent } from "react";
import { DUR_DESPLAZAMIENTO, EASE, animate, useReducedMotion } from "../../motion";

/* Lo que tapa la píldora de la nav; el mismo número que `scroll-margin-top`
   en landing.css. */
export const DESFASE_NAV = 96;

export function destinoDe(el: Element, scrollY: number, desfase = DESFASE_NAV): number {
  return Math.max(0, el.getBoundingClientRect().top + scrollY - desfase);
}

const EVENTOS_CORTE = ["wheel", "touchstart", "keydown"] as const;

export function desplazarA(id: string, opciones: { reducido: boolean }): () => void {
  const el = document.getElementById(id);
  if (!el) return () => {};
  const destino = destinoDe(el, window.scrollY);
  history.pushState(null, "", "#" + id);
  const enfocar = () => el.focus({ preventScroll: true });

  if (opciones.reducido) {
    window.scrollTo({ top: destino, behavior: "instant" });
    enfocar();
    return () => {};
  }

  let quitar = () => {};
  const animacion = animate(window.scrollY, destino, {
    duration: DUR_DESPLAZAMIENTO,
    ease: EASE,
    onUpdate: (y: number) => window.scrollTo(0, y),
    onComplete: () => {
      quitar();
      enfocar();
    },
  });
  const cortar = () => {
    quitar();
    animacion.stop();
  };
  quitar = () => {
    for (const tipo of EVENTOS_CORTE) window.removeEventListener(tipo, cortar);
    quitar = () => {};
  };
  for (const tipo of EVENTOS_CORTE) window.addEventListener(tipo, cortar, { passive: true });
  return cortar;
}

export function useIrASeccion(): (e: MouseEvent<HTMLAnchorElement>, id: string) => void {
  const reducido = useReducedMotion() ?? false;
  return (e, id) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    desplazarA(id, { reducido });
  };
}
