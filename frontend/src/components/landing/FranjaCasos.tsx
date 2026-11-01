/* FranjaCasos — franja a todo el ancho con las mallas reales de aneurismas
   (sacos en rojo sobre sus vasos). Un velo en degradado desde la izquierda
   sostiene el texto; la imagen se desplaza como mucho 24 px con el scroll
   (±12 px), y nada con movimiento reducido. En estrecho, otra imagen cuadrada. */

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "../../motion";

const ALT = "Modelos 3D de aneurismas intracraneales: sacos en rojo sobre sus vasos";
/* Recorrido total del paralaje en px (de -12 a +12). */
const PARALAJE = 24;

export function FranjaCasos() {
  const reducido = useReducedMotion() ?? false;
  const franja = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: franja, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-PARALAJE / 2, PARALAJE / 2]);

  return (
    <section ref={franja} aria-label="Casos reales" className="franja-casos">
      <motion.div className="franja-casos__lienzo" style={reducido ? undefined : { y }}>
        <picture>
          <source media="(max-width: 760px)" srcSet="/media/landing/aneurismas-movil.webp" />
          <img src="/media/landing/aneurismas.webp" alt={ALT} loading="lazy" width={2400} height={1080} />
        </picture>
      </motion.div>
      <div className="franja-casos__velo" />
      <div className="franja-casos__texto">
        <div className="franja-casos__rotulo">CASOS REALES</div>
        <p className="franja-casos__frase">
          Cada pieza es un aneurisma real: el saco en rojo, el vaso que lo lleva en gris.
        </p>
      </div>
      <div className="franja-casos__credito">Figura: [fuente de la figura]</div>
    </section>
  );
}
