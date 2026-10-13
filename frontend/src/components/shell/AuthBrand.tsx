/* Panel de marca de las pantallas públicas «Entrar» y «Crear cuenta».

   Antes cada pantalla llevaba su copia del panel, con un degradado de colores
   fijos y nombres de librerías en el pie (F2-10). Ahora es uno solo: el logotipo
   y el lema único de la portada. Sin vídeo: el degradado sale de los tokens, así
   que sigue legible en los dos temas, y un vídeo de fondo obligaría a fijar el
   color del texto en blanco.

   Las frases de aprobación de «Entrar» y de «Crear cuenta» difieren a propósito:
   quien entra ya pidió su cuenta y solo necesita saber que no habrá aviso;
   quien se registra necesita saber que quedará pendiente hasta que alguien la
   active. Por eso no se unifican en este panel. */

import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

const LEMA = "Planificación neurovascular con datos";

export function AuthBrand({ flex }: { flex: string }) {
  const navigate = useNavigate();
  return (
    <div
      // `login-media` es el gancho de responsive.css: cede espacio y se oculta en pantallas estrechas.
      className="login-media"
      style={{
        flex,
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(120% 100% at 25% 15%, color-mix(in srgb, var(--primary) 22%, var(--canvas)) 0%, var(--canvas) 70%)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        padding: "48px 56px",
      }}
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        title="Ir a la página principal"
        style={{ alignSelf: "flex-start", background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--foreground)" }}
      >
        <Logo size={32} />
      </button>
      <div style={{ margin: "auto 0", color: "var(--foreground)", fontSize: 38, fontWeight: 700, letterSpacing: "var(--tracking-title)", lineHeight: 1.1, maxWidth: 460 }}>
        {LEMA}
      </div>
    </div>
  );
}
