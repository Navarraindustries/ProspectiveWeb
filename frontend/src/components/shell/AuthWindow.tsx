/* Ventana de cristal de las pantallas públicas (Entrar, Crear cuenta, cambio de
   contraseña): fluida (ancho 100 %, máximo 440 px); el margen de 16 px lo pone la
   zona que la contiene, no la ventana. Cristal normal (A15), título de ventana y entrada
   «glide» (solo opacidad con movimiento reducido). */

import { useId, type ReactNode } from "react";
import { glass } from "../../styles/glass";
import { useMovil } from "../../hooks/useEstrecho";
import { glide, glideTransition, motion, useReducedMotion } from "../../motion";

const SOLO_OPACIDAD = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export interface AuthWindowProps {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}

export function AuthWindow({ titulo, subtitulo, children }: AuthWindowProps) {
  const reduced = useReducedMotion();
  const tituloId = useId();
  const movil = useMovil();
  return (
    <motion.section
      aria-labelledby={tituloId}
      data-glass
      variants={reduced ? SOLO_OPACIDAD : glide}
      initial="initial"
      animate="animate"
      transition={reduced ? { duration: 0.15 } : glideTransition}
      style={{
        ...glass("normal"),
        width: "100%",
        maxWidth: 440,
        boxSizing: "border-box",
        borderRadius: "var(--radius-xl)",
        padding: movil ? 24 : 40,
        color: "var(--foreground)",
      }}
    >
      <h1 id={tituloId} style={{ margin: 0, fontSize: "var(--text-window)", fontWeight: 600, letterSpacing: "var(--tracking-title)", lineHeight: 1.2 }}>
        {titulo}
      </h1>
      {subtitulo && (
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted-foreground)" }}>{subtitulo}</p>
      )}
      <div style={{ marginTop: 28 }}>{children}</div>
    </motion.section>
  );
}
