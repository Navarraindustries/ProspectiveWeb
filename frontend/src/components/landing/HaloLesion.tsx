/* Halo que late sobre la lesión: un punto fijo y un anillo que se expande y se
   apaga (preset `halo`). `x`, `y` son porcentajes de la caja padre (que debe
   ser `position: relative`). Solo late mientras está en pantalla
   (`whileInView`): fuera de ella el bucle se para. Con movimiento reducido el
   anillo queda quieto. */

import { halo, motion, useReducedMotion } from "../../motion";

export function HaloLesion({ x, y }: { x: number; y: number }) {
  const reducido = useReducedMotion() ?? false;
  return (
    <span
      className="halo-lesion"
      aria-hidden="true"
      data-pulso={reducido ? "false" : "true"}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {reducido ? (
        <span className="halo-lesion__anillo" />
      ) : (
        <motion.span
          className="halo-lesion__anillo"
          // Sin IntersectionObserver (navegadores viejos, jsdom) late siempre, como antes.
          {...(typeof IntersectionObserver === "undefined" ? { animate: halo.animate } : { whileInView: halo.animate })}
          transition={halo.transition}
        />
      )}
      <span className="halo-lesion__punto" />
    </span>
  );
}
