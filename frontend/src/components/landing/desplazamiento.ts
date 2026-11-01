/* Desplazamiento animado a las secciones de la landing (A1).
   0,6 s con la curva común; la rueda, un toque, un clic o una tecla lo cortan;
   con movimiento reducido salta directo. Al llegar enfoca la sección y deja el
   `#id` en la URL. Solo hay un desplazamiento a la vez: empezar otro corta el
   que estuviera en curso, que ya no enfoca su sección. */

import type { MouseEvent } from "react";
import { DUR_DESPLAZAMIENTO, EASE, animate, useReducedMotion } from "../../motion";

/* Lo que tapa la píldora de la nav; el mismo número que `scroll-margin-top`
   en landing.css. */
export const DESFASE_NAV = 96;

export function destinoDe(el: Element, scrollY: number, desfase = DESFASE_NAV): number {
  return Math.max(0, el.getBoundingClientRect().top + scrollY - desfase);
}

const EVENTOS_CORTE = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/* El corte del desplazamiento en curso, compartido por todos los enlaces de la
   página (la nav, el hero): el siguiente lo llama antes de empezar. */
let cortarEnCurso: () => void = () => {};

export function desplazarA(id: string, opciones: { reducido: boolean }): () => void {
  const el = document.getElementById(id);
  if (!el) return () => {};
  cortarEnCurso();
  const destino = destinoDe(el, window.scrollY);
  history.pushState(null, "", "#" + id);
  const enfocar = () => el.focus({ preventScroll: true });

  if (opciones.reducido) {
    window.scrollTo({ top: destino, behavior: "instant" });
    enfocar();
    return () => {};
  }

  let vivo = true;
  const quitar = () => {
    for (const tipo of EVENTOS_CORTE) window.removeEventListener(tipo, cortar);
    if (cortarEnCurso === cortar) cortarEnCurso = () => {};
  };
  const animacion = animate(window.scrollY, destino, {
    duration: DUR_DESPLAZAMIENTO,
    ease: EASE,
    onUpdate: (y: number) => window.scrollTo(0, y),
    onComplete: () => {
      if (!vivo) return;
      vivo = false;
      quitar();
      enfocar();
    },
  });
  // Si la animación ya acabó al crearla (destino = posición actual), no hay nada que cortar.
  if (!vivo) return () => {};
  function cortar() {
    if (!vivo) return;
    vivo = false;
    quitar();
    animacion.stop();
  }
  for (const tipo of EVENTOS_CORTE) window.addEventListener(tipo, cortar, { passive: true });
  cortarEnCurso = cortar;
  return cortar;
}

export function useIrASeccion(): (e: MouseEvent<HTMLAnchorElement>, id: string) => void {
  const reducido = useReducedMotion() ?? false;
  return (e, id) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // El corte queda guardado en el módulo: el próximo desplazamiento lo usa.
    desplazarA(id, { reducido });
  };
}
