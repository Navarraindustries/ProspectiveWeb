/* LoadingScreen — transición de marca tras entrar con éxito: el vídeo
   quirúrgico de carga (`loading.mp4`, en bucle y silenciado) atenuado bajo un
   viñeteado, el logotipo, una barra indeterminada y «Preparando el espacio de
   trabajo…»; se funde a los 2,2 s. El icono de SkullApp se pinta al entrar
   (pincelada) y después late hasta el fundido.

   F2-12 la había quitado porque no espera a nada (la lista de pacientes ya
   está debajo). El dueño la pidió de vuelta con la misma duración de antes:
   es la firma de la aplicación de escritorio, no un indicador de progreso. */

import { useEffect, useState } from "react";
import { Logo } from "./shell/Logo";
import { useMovil } from "../hooks/useEstrecho";
import { glass } from "../styles/glass";

export const SHOW_MS = 2200;
export const FADE_MS = 450;
/** La pincelada del icono: empieza enseguida y acaba antes de la mitad. */
export const PINCELADA_RETRASO_MS = 150;
export const PINCELADA_DURACION_MS = 1100;
const VIDEO_SRC = "/media/loading.mp4";

export function LoadingScreen({ onDone, onFading, label = "Preparando el espacio de trabajo…" }: {
  onDone: () => void;
  /** Se llama al empezar el fundido, para que lo que hay debajo entre a la vez. */
  onFading?: () => void;
  label?: string;
}) {
  const [fading, setFading] = useState(false);
  const movil = useMovil();

  useEffect(() => {
    const t1 = window.setTimeout(() => { setFading(true); onFading?.(); }, SHOW_MS);
    const t2 = window.setTimeout(onDone, SHOW_MS + FADE_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      // Oscura en los dos temas: el cristal de la pastilla va sobre un vídeo oscuro y
      // su texto es blanco (como la portada).
      data-theme="dark"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: "var(--media-bg)",
        color: "var(--on-media)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      <video
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
      />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--media-vignette-centro)" }} />

      <div
        data-glass
        style={{
          ...glass("dense"),
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          padding: movil ? "24px 28px" : "32px 44px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-xl)",
          color: "var(--on-media)",
        }}
      >
        {/* El icono se pinta al entrar y luego late mientras dura la transición. */}
        <Logo
          variante="linea" tono="media" firma={false} size={movil ? 28 : 34}
          pincelada={{ retrasoMs: PINCELADA_RETRASO_MS, duracionMs: PINCELADA_DURACION_MS }}
          latido={{ retrasoMs: PINCELADA_RETRASO_MS + PINCELADA_DURACION_MS + 100 }}
        />

        {/* Barra indeterminada: barre con el azul de identidad. */}
        <div style={{ position: "relative", width: 220, height: 4, borderRadius: "var(--radius-full)", background: "var(--media-track)", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "35%",
              borderRadius: "var(--radius-full)",
              background: "linear-gradient(90deg, transparent, var(--primary), transparent)",
              animation: "progress-sweep 1.1s ease-in-out infinite",
            }}
          />
        </div>

        <span style={{ color: "var(--on-media)", fontSize: 13, letterSpacing: "0.04em" }}>{label}</span>
      </div>
    </div>
  );
}
