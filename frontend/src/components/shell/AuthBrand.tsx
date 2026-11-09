/* Fondo de marca de las pantallas públicas «Entrar» y «Crear cuenta».

   UNI-133: el vídeo quirúrgico de la casa (`intro.mp4`, en bucle y silenciado
   para que el navegador permita el autoplay) ya no es un panel a la izquierda:
   cubre toda la pantalla, fijo, y la ventana del formulario flota centrada
   encima. Entre los dos va una capa de atenuación (`ATENUACION`) para que el
   texto de la ventana, en cristal, cumpla el contraste aunque el fotograma sea
   claro. Con movimiento reducido el vídeo no corre: se queda en su primer
   fotograma.

   Sobre el vídeo, abajo a la izquierda, el lema único de la portada y su frase.
   El vídeo es siempre oscuro, así que esta capa va con los tokens del tema
   oscuro (`data-theme="dark"`) en los dos temas; el tema solo cambia la
   ventana. El logotipo lo pone cada página en su barra superior, con el mismo
   tema forzado (`BARRA_SOBRE_VIDEO`).

   Por debajo de 1024 px no se pinta (las páginas no lo montan): sin vídeo,
   sobre el Ambiente, como antes.

   Las frases de aprobación de «Entrar» y de «Crear cuenta» difieren a propósito:
   quien entra ya pidió su cuenta y solo necesita saber que no habrá aviso;
   quien se registra necesita saber que quedará pendiente hasta que alguien la
   active. Por eso no se unifican aquí. */

import { useReducedMotion } from "../../motion";

const LEMA = "Planificación neurovascular con datos";
const FRASE = "Del DICOM al clip, en un solo espacio de trabajo.";
export const VIDEO_MARCA = "/media/intro.mp4";

/** Atenuación uniforme sobre el vídeo (`--media-atenuacion`), debajo del
 *  viñeteado: con ella, un fotograma blanco queda como mucho en un gris medio
 *  antes del cristal de la ventana (AuthBrand.test.tsx lo calcula). */
const ATENUACION = "linear-gradient(var(--media-atenuacion), var(--media-atenuacion))";

/** Barra y pie que van sobre el vídeo: tokens del tema oscuro en los dos temas. */
export const BARRA_SOBRE_VIDEO = { "data-theme": "dark" } as const;

export function AuthBrand() {
  const reducido = useReducedMotion();
  return (
    <div
      // `login-media` marca la capa (la buscan los tests de las páginas).
      className="login-media"
      {...BARRA_SOBRE_VIDEO}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        background: "var(--media-bg)",
        color: "var(--on-media)",
        pointerEvents: "none",
      }}
    >
      <video
        src={VIDEO_MARCA}
        autoPlay={!reducido}
        loop={!reducido}
        muted
        playsInline
        preload="auto"
        aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `${ATENUACION}, var(--media-vignette)` }} />
      <div
        style={{
          position: "absolute",
          left: 56,
          bottom: 48,
          // Nunca debajo de la ventana (440 px centrada) a 1024–1280 px.
          maxWidth: "min(460px, calc(50vw - 300px))",
        }}
      >
        <div style={{ color: "var(--on-media)", fontSize: "clamp(22px, 2.2vw, 32px)", fontWeight: 700, letterSpacing: "var(--tracking-title)", lineHeight: 1.1, textShadow: "var(--on-media-shadow)" }}>
          {LEMA}
        </div>
        <p style={{ margin: "14px 0 0", color: "var(--on-media-muted)", fontSize: 16, lineHeight: 1.45, textShadow: "var(--on-media-shadow)" }}>
          {FRASE}
        </p>
      </div>
    </div>
  );
}
