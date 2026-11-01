/* Halo que late sobre la lesión: un punto fijo y un anillo que se expande y se
   apaga. `x`, `y` son porcentajes de la caja padre (que debe ser `position:
   relative`). Con movimiento reducido el anillo queda quieto. */

import { motion, useReducedMotion } from "../../motion";

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
          animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="halo-lesion__punto" />
    </span>
  );
}
