/* Sección de la landing con revelado al entrar en pantalla: el cuerpo se funde y
   sus elementos suben 16 px en cascada (60 ms entre hermanos). El contenido
   nunca queda invisible si el observador no dispara: sin IntersectionObserver
   `useVisible` es `true` desde el primer render y no hay nada que revelar; con
   movimiento reducido ni opacidad ni desplazamiento. */

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useVisible } from "../patients/useVisible";
import { ESCALONADO, motion, revelar, revelarTransition, useReducedMotion } from "../../motion";

export function Revelar({ children, className, escalonado = false }: {
  children: ReactNode;
  className?: string;
  escalonado?: boolean;
}) {
  const reducido = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref, "0px 0px -10% 0px");
  // Ya visible en el primer render (sin observador): nada que revelar.
  const visibleAlMontar = useRef(visible).current;
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={revelar}
      initial={reducido || visibleAlMontar ? false : "oculto"}
      animate={visible || reducido ? "visible" : "oculto"}
      transition={{ ...revelarTransition, staggerChildren: escalonado ? ESCALONADO : 0 }}
    >
      {children}
    </motion.div>
  );
}

type DatoData = { [dato: `data-${string}`]: string | boolean | undefined };

export function RevelarItem({ as = "div", className, style, children, ...datos }: {
  as?: "div" | "li" | "figure";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & DatoData) {
  const Etiqueta = motion[as];
  return (
    <Etiqueta className={className} style={style} variants={revelar} {...datos}>
      {children}
    </Etiqueta>
  );
}

export function Seccion({ id, rotulo, titulo, children, className }: {
  id?: string;
  rotulo: string;
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-label={rotulo} tabIndex={-1} className={className ? `sec ${className}` : "sec"}>
      <Revelar className="sec__cuerpo" escalonado>
        <RevelarItem className="sec__cabecera">
          <div className="sec__rotulo">{rotulo}</div>
          <h2 className="sec__titulo">{titulo}</h2>
        </RevelarItem>
        {children}
      </Revelar>
    </section>
  );
}
