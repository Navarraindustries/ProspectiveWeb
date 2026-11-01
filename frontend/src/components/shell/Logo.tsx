/* Logotipo de PROSPECTIVE: icono D «corte axial» (elipse con tres puntos, el mayor es la lesión)
   y «Prospective™» en Sora 600. El icono se simplifica por debajo de 33 px (lienzo de marca,
   tarjeta D). `data-logo` marca la raíz para que las auditorías de tamaño de texto apliquen
   la excepción de la marca. El modo compacto (solo icono) es para la barra lateral plegada. */

export type LogoVariante = "app" | "linea";

/** Grosor y punto del icono según su lado (lienzo de marca, tarjeta D). */
export function trazoIcono(size: number): { trazo: number; punto: number; detalle: boolean } {
  if (size > 32) return { trazo: 3.5, punto: 4.4, detalle: true };
  if (size > 16) return { trazo: 4, punto: 5, detalle: false };
  return { trazo: 5, punto: 6, detalle: false };
}

export function LogoIcono({
  size,
  variante = "app",
  tono = "normal",
}: {
  size: number;
  variante?: LogoVariante;
  tono?: "normal" | "media";
}) {
  const { trazo, punto, detalle } = trazoIcono(size);
  const app = variante === "app";
  const color = app ? "var(--primary-foreground)" : "currentColor";
  const colorPunto = tono === "media" ? "var(--brand-mist)" : app ? "var(--logo-dot)" : "var(--data)";
  let transform: string | undefined;
  if (app) {
    if (detalle) transform = "translate(8 8) scale(0.666667)";
    else if (size > 16) transform = "translate(7.5 7.5) scale(0.6875)";
    else transform = "translate(4.5 4.5) scale(0.8125)";
  }
  return (
    <svg
      data-logo=""
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {app && <rect width="48" height="48" rx="12" fill="var(--primary)" />}
      <g
        transform={transform}
        fill="none"
        stroke={color}
        strokeWidth={trazo}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="24" cy="25" rx="15" ry="18" />
        {detalle && (
          <>
            <circle cx="18" cy="30" r="1.8" fill={color} stroke="none" />
            <circle cx="23.5" cy="35" r="1.8" fill={color} stroke="none" />
          </>
        )}
        <circle cx="28.5" cy="20" r={punto} fill={colorPunto} stroke="none" />
      </g>
    </svg>
  );
}

export interface LogoProps {
  compact?: boolean; // solo el icono (sin nombre)
  size?: number; // lado del icono en px; 28 por defecto
  variante?: LogoVariante; // "app" por defecto
  firma?: boolean; // «por SkullApp» bajo el nombre; true por defecto
  tono?: "normal" | "media"; // "media": sobre vídeo (siempre oscuro), en los dos temas
}

export function Logo({ compact = false, size = 28, variante = "app", firma = true, tono = "normal" }: LogoProps) {
  const icono = <LogoIcono size={size} variante={variante} tono={tono} />;
  if (compact) return icono;
  const media = tono === "media";
  const atenuado = media ? "var(--on-media-muted)" : "var(--muted-foreground)";
  const sombra = media ? "var(--on-media-shadow)" : undefined;
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
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: Math.max(11, Math.round(size * 0.32)),
              color: atenuado,
              textShadow: sombra,
            }}
          >
            por SkullApp
          </span>
        )}
      </span>
    </span>
  );
}
