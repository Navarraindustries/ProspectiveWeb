import { COLORES_PELO, FONDOS, PIELES, PIJAMAS } from "./config";
import type { AvatarConfig } from "./config";

interface Props {
  config: AvatarConfig;
  size: number;
  title?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const esHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
/** El color si es #rrggbb; si no (config incompleta o estropeada), el primero de su lista. */
const color = (v: unknown, lista: readonly string[]) => (esHex(v) ? v : lista[0]);

/** Oscurece (f<0) o aclara (f>0) un color #RRGGBB; cualquier otra cosa se devuelve tal cual. */
export function tono(hex: string, f: number): string {
  if (!esHex(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => {
    const v = (n >> s) & 255;
    return Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  };
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, "0")).join("")}`;
}

/** Avatar indie vectorial: formas planas sin contorno. viewBox 0 0 200 200. */
export function AvatarSvg({ config, size, title }: Props) {
  // Una config a medias (servidor viejo, dato estropeado) no debe tumbar la página: cada color cae a su lista.
  const piel = color(PIELES[config.piel], PIELES);
  const pelo = color(config.pelo, COLORES_PELO);
  const pijama = color(config.pijama, PIJAMAS);
  const fondo = color(config.fondo, FONDOS);
  const { peinado, cabeza, ojos, mascarilla } = config;
  const sombra = tono(piel, -0.14);
  const canoso = pelo.toUpperCase() === "#C9CCD2";
  const ceja = canoso ? "#8E939C" : pelo;
  const gorro = cabeza === "gorro" || cabeza === "gorro_amplio";
  const aria = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg" {...aria}>
      <circle data-pieza="fondo" cx="100" cy="100" r="100" fill={fondo} />
      {/* Pelo que queda por detrás de la cabeza y del cuerpo */}
      {peinado === "largo" && (
        <path data-pieza="pelo-trasero" d="M62 84 C58 130 60 150 70 158 L130 158 C140 150 142 130 138 84 Z" fill={pelo} />
      )}
      {peinado === "coleta" && (
        <path data-pieza="pelo-trasero" d="M132 76 C158 80 164 118 150 142 C146 126 142 106 130 98 Z" fill={pelo} />
      )}
      <g data-pieza="cuerpo">
        <path d="M30 200 C30 164 60 150 100 150 C140 150 170 164 170 200 Z" fill={pijama} />
      </g>
      <path data-pieza="cuello" d="M86 116 L86 154 C92 166 108 166 114 154 L114 116 Z" fill={sombra} />
      <path data-pieza="escote" d="M78 152 L100 182 L122 152 C112 148 88 148 78 152 Z" fill={tono(pijama, -0.28)} />
      <g data-pieza="orejas">
        <ellipse cx="65" cy="92" rx="6" ry="9" fill={sombra} />
        <ellipse cx="135" cy="92" rx="6" ry="9" fill={sombra} />
      </g>
      <ellipse data-pieza="cabeza" cx="100" cy="88" rx="35" ry="40" fill={piel} />

      <g data-pieza="cejas">
        <rect x="76" y="76" width="16" height="3.4" rx="1.7" fill={ceja} />
        <rect x="108" y="76" width="16" height="3.4" rx="1.7" fill={ceja} />
      </g>
      <g data-pieza="ojos">
        <ellipse cx="84" cy="90" rx="3.6" ry="4.4" fill="#1A1A22" />
        <ellipse cx="116" cy="90" rx="3.6" ry="4.4" fill="#1A1A22" />
      </g>
      {!mascarilla && (
        <path
          data-pieza="boca"
          d="M90 108 Q100 116 110 108"
          fill="none"
          stroke={tono(piel, -0.5)}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}

      {/* Pelo superior: lo tapa el gorro */}
      {!gorro && peinado !== "rapado" && (
        <g data-pieza="pelo-superior">
          {peinado === "rizado" ? (
            <path
              d="M62 86 C56 70 62 58 72 56 C72 46 86 42 94 48 C102 40 118 44 120 52 C132 50 142 62 138 74 C142 80 140 84 138 86 C134 70 120 64 100 64 C80 64 66 72 62 86 Z"
              fill={pelo}
            />
          ) : (
            <path d="M63 88 C58 56 78 44 100 44 C124 44 142 58 137 88 C130 70 118 64 100 64 C82 64 70 70 63 88 Z" fill={pelo} />
          )}
          {peinado === "mono" && <circle cx="100" cy="36" r="13" fill={pelo} />}
        </g>
      )}
      {!gorro && peinado === "rapado" && (
        <path
          data-pieza="pelo-superior"
          d="M65 80 C66 58 84 50 100 50 C116 50 134 58 135 80 C128 64 114 58 100 58 C86 58 72 64 65 80 Z"
          fill={pelo}
          opacity="0.35"
        />
      )}

      {gorro && (
        <g data-pieza="gorro">
          {cabeza === "gorro_amplio" ? (
            <path d="M54 82 C46 50 70 30 100 30 C130 30 154 50 146 82 C140 70 124 66 100 66 C76 66 60 70 54 82 Z" fill={pijama} />
          ) : (
            <path d="M62 80 C58 54 78 42 100 42 C122 42 142 54 138 80 C130 68 118 64 100 64 C82 64 70 68 62 80 Z" fill={pijama} />
          )}
          <path
            d="M64 76 C74 68 88 66 100 66 C112 66 126 68 136 76 L136 71 C126 64 112 61 100 61 C88 61 74 64 64 71 Z"
            fill={tono(pijama, -0.28)}
          />
        </g>
      )}

      {ojos === "gafas" && (
        <g data-pieza="gafas" fill="none" stroke="#2A2D36" strokeWidth="2.6">
          <circle cx="84" cy="90" r="10" />
          <circle cx="116" cy="90" r="10" />
          <path d="M94 90 L106 90" />
        </g>
      )}
      {ojos === "lupas" && (
        <g data-pieza="lupas" stroke="#2A2D36" strokeWidth="2.6">
          <rect x="70" y="80" width="28" height="20" rx="4" fill="#7FB8FF" fillOpacity="0.55" />
          <rect x="102" y="80" width="28" height="20" rx="4" fill="#7FB8FF" fillOpacity="0.55" />
          <path d="M98 88 L102 88" />
        </g>
      )}

      {mascarilla && (
        <g data-pieza="mascarilla">
          <path d="M70 98 C84 96 116 96 130 98 C130 116 118 130 100 130 C82 130 70 116 70 98 Z" fill="#BFE3F5" />
          <path d="M80 108 L120 108 M80 115 L120 115" stroke="#9CCBE3" strokeWidth="1.8" />
        </g>
      )}
    </svg>
  );
}
