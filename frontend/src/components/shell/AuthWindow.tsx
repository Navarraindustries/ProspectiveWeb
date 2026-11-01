/* Ventana de cristal de las pantallas públicas (Entrar, Crear cuenta, cambio de
   contraseña): 440 px de ancho con 16 px de margen en pantallas estrechas, cristal
   denso, título de ventana y entrada «glide» (solo opacidad con movimiento reducido). */

import { useId, type ReactNode } from "react";
import { glass } from "../../styles/glass";
import { glide, glideTransition, motion, useReducedMotion } from "../../motion";

const SOLO_OPACIDAD = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export interface AuthWindowProps {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  pie?: ReactNode;
}

export function AuthWindow({ titulo, subtitulo, children, pie }: AuthWindowProps) {
  const reduced = useReducedMotion();
  const tituloId = useId();
  return (
    <motion.section
      aria-labelledby={tituloId}
      data-glass
      variants={reduced ? SOLO_OPACIDAD : glide}
      initial="initial"
      animate="animate"
      transition={reduced ? { duration: 0.15 } : glideTransition}
      style={{
        ...glass("dense"),
        width: 440,
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        borderRadius: "var(--radius-xl)",
        padding: 40,
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
      {pie && <div style={{ marginTop: 24, fontSize: 13, color: "var(--muted-foreground)" }}>{pie}</div>}
    </motion.section>
  );
}
