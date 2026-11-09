/* Fondo de marca de las pantallas públicas «Entrar» y «Crear cuenta».

   UNI-133: el vídeo quirúrgico de la casa (`intro.mp4`, en bucle y silenciado
   para que el navegador permita el autoplay) ya no es un panel a la izquierda:
   cubre toda la pantalla, fijo, y la ventana del formulario flota centrada
   encima. Entre los dos va una capa de atenuación (`ATENUACION`) para que el
   texto de la ventana, en cristal, cumpla el contraste aunque el fotograma sea
   claro. Con movimiento reducido el vídeo no corre: se queda en su primer
   fotograma.

   El logotipo, el lema único de la portada, su frase y los pasos van en la
   columna de marca (`ColumnaMarca`), a la izquierda y centrada en vertical con
   la ventana: el lema suelto abajo a la izquierda no se relacionaba con nada.
   La columna la coloca cada página junto a su ventana; esta capa solo es el
   vídeo, su atenuación y un degradado que oscurece el lado de la columna.
   El vídeo es siempre oscuro, así que lo que va encima de él lleva los tokens
   del tema oscuro (`data-theme="dark"`, `BARRA_SOBRE_VIDEO`) en los dos temas;
   el tema solo cambia la ventana.

   Por debajo de 1024 px no se pinta (las páginas no lo montan): sin vídeo,
   sobre el Ambiente, como antes.

   Las frases de aprobación de «Entrar» y de «Crear cuenta» difieren a propósito:
   quien entra ya pidió su cuenta y solo necesita saber que no habrá aviso;
   quien se registra necesita saber que quedará pendiente hasta que alguien la
   active. Por eso no se unifican aquí. */

import type { CSSProperties } from "react";
import { useReducedMotion } from "../../motion";
import { STEP_LABELS } from "../../pipeline/steps";
import { Logo } from "./Logo";

const LEMA = "Planificación neurovascular con datos";
const FRASE = "Del DICOM al clip, en un solo espacio de trabajo.";
/** Los pasos reales del espacio de trabajo, en la línea mono de la columna. */
export const PASOS_MARCA = STEP_LABELS.map((p) => p.toUpperCase()).join(" · ");
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
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `${ATENUACION}, var(--media-columna), var(--media-vignette)` }} />
    </div>
  );
}

/** Columna de marca de «Entrar» y «Crear cuenta» sobre el vídeo: logotipo,
 *  lema, frase y pasos. Va a la izquierda de la ventana y centrada con ella;
 *  `pegada` la deja fija arriba mientras desplaza un formulario largo.
 *  `alLogo` hace del logotipo un botón (a la página principal). */
export function ColumnaMarca({ alLogo, pegada = false }: { alLogo?: () => void; pegada?: boolean }) {
  const logo = <Logo variante="linea" size={52} tono="media" />;
  return (
    <section
      aria-label="Prospective"
      className="columna-marca"
      {...BARRA_SOBRE_VIDEO}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 520,
        color: "var(--on-media)",
        ...(pegada ? { position: "sticky", top: 120, alignSelf: "start" } : {}),
      }}
    >
      {alLogo ? (
        <button
          type="button"
          onClick={alLogo}
          title="Ir a la página principal"
          style={{ alignSelf: "flex-start", display: "inline-flex", background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--on-media)" }}
        >
          {logo}
        </button>
      ) : (
        <span style={{ alignSelf: "flex-start", display: "inline-flex", color: "var(--on-media)" }}>{logo}</span>
      )}
      <div aria-hidden style={{ width: 48, height: 2, background: "var(--primary)" }} />
      <p style={{ margin: 0, color: "var(--on-media)", fontSize: "clamp(32px, 3.3vw, 48px)", fontWeight: 700, letterSpacing: "var(--tracking-title)", lineHeight: 1.06, textWrap: "balance", textShadow: "var(--on-media-shadow)" }}>
        {LEMA}
      </p>
      <p style={{ margin: 0, color: "var(--on-media-muted)", fontSize: 18, lineHeight: 1.5, textShadow: "var(--on-media-shadow)" }}>
        {FRASE}
      </p>
      <p style={{ margin: "4px 0 0", color: "var(--on-media-muted)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.06em", lineHeight: 1.8, textShadow: "var(--on-media-shadow)" }}>
        {PASOS_MARCA}
      </p>
    </section>
  );
}

/** Rejilla de escritorio: la columna de marca a la izquierda y la ventana a la
 *  derecha, juntas y centradas en un ancho máximo para que no se separen en
 *  pantallas grandes. */
export const REJILLA_MARCA: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 440px)",
  columnGap: "clamp(40px, 6vw, 96px)",
  width: "100%",
  maxWidth: 1200,
  margin: "0 auto",
  padding: "0 clamp(8px, 4vw, 88px)",
  boxSizing: "border-box",
};
