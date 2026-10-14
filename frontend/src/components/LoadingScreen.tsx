/* LoadingScreen — transición de marca tras entrar con éxito: el vídeo
   quirúrgico de carga (`loading.mp4`, en bucle y silenciado) atenuado bajo un
   viñeteado, el logotipo, una barra indeterminada y «Preparando el espacio de
   trabajo…»; se funde a los 2,2 s.

   F2-12 la había quitado porque no espera a nada (la lista de pacientes ya
   está debajo). El dueño la pidió de vuelta con la misma duración de antes:
   es la firma de la aplicación de escritorio, no un indicador de progreso. */

import { useEffect, useState } from "react";
import { Logo } from "./shell/Logo";

export const SHOW_MS = 2200;
export const FADE_MS = 450;
const VIDEO_SRC = "/media/loading.mp4";

export function LoadingScreen({ onDone, label = "Preparando el espacio de trabajo…" }: { onDone: () => void; label?: string }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setFading(true), SHOW_MS);
    const t2 = window.setTimeout(onDone, SHOW_MS + FADE_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
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
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }}
      />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--media-vignette-centro)" }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo compact size={34} />
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 26, letterSpacing: "0.04em", textShadow: "var(--on-media-shadow)" }}>
            PROSPECTIVE
          </span>
        </div>

        {/* Barra indeterminada: barre con el azul de identidad. */}
        <div style={{ position: "relative", width: 220, height: 4, borderRadius: 2, background: "var(--media-track)", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "35%",
              borderRadius: 2,
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
