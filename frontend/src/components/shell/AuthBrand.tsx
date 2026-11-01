/* Panel de marca de las pantallas públicas «Entrar» y «Crear cuenta».

   Antes cada pantalla llevaba su copia del panel, con nombres de librerías en
   el pie (F2-10). Ahora es uno solo: el logotipo y el lema único de la portada
   sobre el vídeo quirúrgico de la casa (`intro.mp4`, en bucle y silenciado
   para que el navegador permita el autoplay), bajo un viñeteado suave: al 40 %
   con viñeteado denso el dueño no lo veía.

   El vídeo es siempre oscuro, así que el texto del panel va fijo en blanco en
   los dos temas: el tema solo cambia el formulario de al lado. El dueño pidió
   el vídeo de vuelta tras F2, que lo había cambiado por un degradado.

   Las frases de aprobación de «Entrar» y de «Crear cuenta» difieren a propósito:
   quien entra ya pidió su cuenta y solo necesita saber que no habrá aviso;
   quien se registra necesita saber que quedará pendiente hasta que alguien la
   active. Por eso no se unifican en este panel. */

import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

const LEMA = "Planificación neurovascular con datos";
const FRASE = "Del DICOM al clip, en un solo espacio de trabajo.";
export const VIDEO_MARCA = "/media/intro.mp4";

export function AuthBrand({ flex }: { flex: string }) {
  const navigate = useNavigate();
  return (
    <div
      // `login-media` solo marca el panel (lo buscan los tests): su parte del ancho la
      // fija la página con `flex` según el tramo, y en tableta y móvil ni se pinta.
      className="login-media"
      style={{
        flex,
        // Fijo a la altura de la pantalla: si el formulario es más alto que ella
        // (Crear cuenta, pantallas bajas) la página desplaza y el panel no se estira.
        position: "sticky",
        top: 0,
        height: "100dvh",
        alignSelf: "flex-start",
        overflow: "hidden",
        background: "var(--media-bg)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        padding: "48px 56px",
        color: "var(--on-media)",
      } as CSSProperties}
    >
      <video
        src={VIDEO_MARCA}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.75 }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--media-vignette)",
        }}
      />
      <button
        type="button"
        onClick={() => navigate("/")}
        title="Ir a la página principal"
        style={{ position: "relative", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 12, background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--on-media)" }}
      >
        <Logo variante="linea" size={38} tono="media" />
      </button>
      <div style={{ position: "relative", margin: "auto 0", maxWidth: 460 }}>
        <div style={{ color: "var(--on-media)", fontSize: 38, fontWeight: 700, letterSpacing: "var(--tracking-title)", lineHeight: 1.1, textShadow: "var(--on-media-shadow)" }}>
          {LEMA}
        </div>
        <p style={{ margin: "16px 0 0", color: "var(--on-media-muted)", fontSize: 16, lineHeight: 1.45, textShadow: "var(--on-media-shadow)" }}>
          {FRASE}
        </p>
      </div>
    </div>
  );
}
