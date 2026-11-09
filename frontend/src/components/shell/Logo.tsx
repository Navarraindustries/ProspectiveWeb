/* Logotipo: el icono de SkullApp (trazo de pincel, una sola pieza) y
   «Prospective™» en Sora 600, firmado «por SkullApp» con el logotipo de
   SkullApp en su propia letra. Por indicación de la dirección (08-11) ya no se
   usa el icono D de Prospective.

   El icono es monocromo, como la marca de SkullApp: blanco en el tema oscuro y
   grafito en el claro (currentColor; `--logo-app-*` en la versión «app»). El
   azul de la interfaz solo aparece en el movimiento: el halo del latido y el
   reflejo del destello.

   Movimiento (opcional, y nada con movimiento reducido):
   - pincelada: el trazo se pinta del gancho a la punta de la cola (TRAMOS de
     marcaSkullApp.ts), con una curva seno; una sola vez.
   - latido: doble pulso con halo azul, en bucle, para las esperas.
   - destello: un reflejo azul cruza el icono al pasar el ratón o con el foco.
   La coreografía es CSS (styles/marca.css); aquí solo se calculan los tiempos.

   `data-logo` marca la raíz para que las auditorías de tamaño de texto apliquen
   la excepción de la marca. El modo compacto (solo icono) es para la barra
   lateral plegada y se anuncia «Prospective». El completo se lee «Prospective
   por SkullApp» (el ™ es mudo). */

import { useId, type CSSProperties } from "react";
import { useReducedMotion } from "../../motion";
import { FIRMA_D, FIRMA_PROPORCION, FIRMA_VIEWBOX, MARCA_D, MARCA_VIEWBOX, TRAMOS } from "./marcaSkullApp";

export type LogoVariante = "app" | "linea";

export interface Pincelada {
  /** Cuándo empieza, en ms desde que se monta. */
  retrasoMs?: number;
  /** Cuánto tarda en pintarse entero. */
  duracionMs?: number;
}

export const PINCELADA_MS = 1200;

/** Tiempo (0–1) en que la pincelada llega a la fracción `p` del trazo, con la
 *  curva seno de entrada y salida: arranca y acaba suave. */
export function tiempoPincelada(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return Math.acos(1 - 2 * q) / Math.PI;
}

/** Retraso y duración, en ms, de cada tramo de la pincelada. */
export function tiemposTramos({ retrasoMs = 0, duracionMs = PINCELADA_MS }: Pincelada = {}): { retraso: number; duracion: number }[] {
  return TRAMOS.map((t) => {
    const a = tiempoPincelada(t.desde) * duracionMs;
    const b = tiempoPincelada(t.hasta) * duracionMs;
    return { retraso: Math.round(retrasoMs + a), duracion: Math.max(1, Math.round(b - a)) };
  });
}

export interface MovimientoLogo {
  /** El trazo se pinta al montar (true = valores por defecto). */
  pincelada?: boolean | Pincelada;
  /** Doble pulso en bucle; `retrasoMs` lo deja empezar tras la pincelada. */
  latido?: boolean | { retrasoMs?: number };
  /** Reflejo al pasar el ratón por el logo o al darle el foco. */
  destello?: boolean;
}

export function LogoIcono({
  size,
  variante = "app",
  tono = "normal",
  etiqueta,
  pincelada,
  latido,
  destello,
}: {
  size: number;
  variante?: LogoVariante;
  tono?: "normal" | "media";
  /** Nombre accesible del icono cuando va solo (role="img"); sin él es decorativo. */
  etiqueta?: string;
} & MovimientoLogo) {
  const reducido = useReducedMotion() ?? false;
  const id = useId().replace(/:/g, "");
  const app = variante === "app";
  const conPincelada = !!pincelada && !reducido;
  const conLatido = !!latido && !reducido;
  const conDestello = !!destello && !reducido;
  const relleno = app ? "var(--logo-app-marca)" : tono === "media" ? "var(--on-media)" : "currentColor";
  const tiempos = conPincelada ? tiemposTramos(pincelada === true ? {} : pincelada) : [];
  const estilo: CSSProperties = { flexShrink: 0 };
  if (conLatido) {
    Object.assign(estilo, {
      "--latido-retraso": `${latido === true ? 0 : latido?.retrasoMs ?? 0}ms`,
      "--latido-halo": `${Math.max(3, Math.round(size * 0.12))}px`,
    });
  }
  return (
    <svg
      data-logo=""
      className={[conLatido ? "logo-latido" : "", conDestello ? "logo-destello" : ""].filter(Boolean).join(" ") || undefined}
      width={size}
      height={size}
      viewBox={MARCA_VIEWBOX}
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : "true"}
      focusable="false"
      style={estilo}
    >
      {app && <rect x="1" y="1" width="98" height="98" rx="24" fill="var(--logo-app-fondo)" stroke="var(--logo-app-borde)" strokeWidth="2" />}
      <g transform={app ? "translate(14 14) scale(0.72)" : undefined}>
        {conPincelada && (
          <defs>
            <mask id={`pincel-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              {/* Blanco de máscara (luminancia 1 = se ve), no un color de la interfaz. */}
              <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
                {TRAMOS.map((t, i) => (
                  <path
                    key={i}
                    className="logo-tramo"
                    pathLength={1}
                    strokeWidth={t.ancho}
                    d={t.d}
                    style={{ animationDelay: `${tiempos[i].retraso}ms`, animationDuration: `${tiempos[i].duracion}ms` }}
                  />
                ))}
              </g>
            </mask>
          </defs>
        )}
        <path d={MARCA_D} fill={relleno} mask={conPincelada ? `url(#pincel-${id})` : undefined} />
        {conDestello && (
          <>
            <defs>
              <clipPath id={`marca-${id}`}><path d={MARCA_D} /></clipPath>
              <linearGradient id={`brillo-${id}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
                <stop offset="0.5" style={{ stopColor: "color-mix(in srgb, var(--primary) 60%, white)", stopOpacity: 0.95 }} />
                <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <g clipPath={`url(#marca-${id})`}>
              <g className="logo-brillo">
                <rect x="0" y="-20" width="28" height="140" fill={`url(#brillo-${id})`} transform="rotate(18 14 50)" />
              </g>
            </g>
          </>
        )}
      </g>
    </svg>
  );
}

/** «SkullApp» con su logotipo (negrita cursiva), a la altura de la letra que lo acompaña. */
export function FirmaSkullApp({ alto }: { alto: number }) {
  return (
    <svg
      data-firma=""
      role="img"
      aria-label="SkullApp"
      viewBox={FIRMA_VIEWBOX}
      width={Math.round(alto * FIRMA_PROPORCION)}
      height={alto}
      focusable="false"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path d={FIRMA_D} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export interface LogoProps extends MovimientoLogo {
  compact?: boolean; // solo el icono (sin nombre)
  size?: number; // lado del icono en px; 28 por defecto
  variante?: LogoVariante; // "app" por defecto
  firma?: boolean; // «por SkullApp» bajo el nombre; true por defecto
  tono?: "normal" | "media"; // "media": sobre vídeo (siempre oscuro), en los dos temas
}

export function Logo({ compact = false, size = 28, variante = "app", firma = true, tono = "normal", ...movimiento }: LogoProps) {
  if (compact) return <LogoIcono size={size} variante={variante} tono={tono} etiqueta="Prospective" {...movimiento} />;
  const icono = <LogoIcono size={size} variante={variante} tono={tono} {...movimiento} />;
  const media = tono === "media";
  const atenuado = media ? "var(--on-media-muted)" : "var(--muted-foreground)";
  const sombra = media ? "var(--on-media-shadow)" : undefined;
  const letraFirma = Math.max(11, Math.round(size * 0.32));
  return (
    <span data-logo="" style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.32) }}>
      {icono}
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, lineHeight: 1.1 }}>
        <span
          style={{
            fontFamily: "var(--font-brand)",
            fontWeight: 600,
            fontSize: Math.round(size * 0.63),
            letterSpacing: "-0.02em",
            color: media ? "var(--on-media)" : undefined,
            textShadow: sombra,
          }}
        >
          Prospective
          <sup
            aria-hidden="true"
            style={{
              fontWeight: 500,
              fontSize: Math.max(9, Math.round(size * 0.26)),
              color: atenuado,
              marginLeft: 1,
            }}
          >
            ™
          </sup>
        </span>
        {firma && (
          <span
            data-firma-linea=""
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35em",
              fontFamily: "var(--font-sans)",
              fontSize: letraFirma,
              color: atenuado,
              textShadow: sombra,
            }}
          >
            por <FirmaSkullApp alto={Math.round(letraFirma * 1.05)} />
          </span>
        )}
      </span>
    </span>
  );
}
