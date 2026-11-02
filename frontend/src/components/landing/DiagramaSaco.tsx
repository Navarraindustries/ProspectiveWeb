/* Diagrama del saco aneurismático: la arteria madre es un vaso horizontal y el
   saco nace de su pared por un cuello. Las cotas de medida (cuello, altura,
   Ø domo, Ø máx, Ø arteria madre) se ven siempre, atenuadas, y se encienden las
   del índice activo (trazo `--data`, grosor y rótulo en negrita: el resaltado no
   vive solo en el color). Las tres siluetas de forma (envolvente, elipse, esfera)
   solo aparecen con su índice: las tres a la vez se montaban unas sobre otras.
   El saco lleva una lobulación arriba a la derecha para que la envolvente
   convexa (índice de ondulación) se distinga del contorno. Todo con tokens. */

import { DUR, EASE, motion, useReducedMotion } from "../../motion";
import { NOMBRE_COTA, type Cota } from "./indices";

/* Lienzo recortado al dibujo (rótulo de Ø máx arriba, rótulos bajo la arteria
   abajo): así el dibujo, y no una caja con franjas vacías, queda centrado en
   vertical respecto a la lista de índices. */
export const VIEWBOX = "0 44 440 342";

const ARTERIA_Y = 300;   // pared superior del vaso
const ARTERIA_FONDO = 350; // pared inferior

const SACO =
  "M190 300 C150 290 118 245 118 190 C118 120 162 70 220 70 C245 70 262 76 276 86 " +
  "C282 72 302 68 308 84 C313 98 306 110 301 117 C315 137 322 161 322 190 " +
  "C322 245 290 290 250 300 Z";
const ENVOLVENTE = "M190 300 L138 262 L118 190 L138 112 L186 74 L250 70 L300 66 L314 94 L322 190 L302 262 L250 300 Z";

/* Segmento de cota con remates perpendiculares en los extremos. */
function Cota2({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * 6;
  const ny = ((x2 - x1) / len) * 6;
  return (
    <path
      d={`M${x1} ${y1} L${x2} ${y2} M${x1 - nx} ${y1 - ny} L${x1 + nx} ${y1 + ny} M${x2 - nx} ${y2 - ny} L${x2 + nx} ${y2 + ny}`}
    />
  );
}

/** Siluetas de forma: solo se pintan con su índice activo. */
export const COTAS_FORMA: readonly Cota[] = ["contorno", "elipse", "esfera"];

function Trazos({ cota }: { cota: Cota }) {
  switch (cota) {
    case "cuello":
      return (<>
        <Cota2 x1={190} y1={ARTERIA_Y} x2={250} y2={ARTERIA_Y} />
        <text x="220" y="331" textAnchor="middle">cuello</text>
      </>);
    case "altura":
      return (<>
        <Cota2 x1={220} y1={ARTERIA_Y - 4} x2={220} y2={70} />
        <text x="228" y="250">altura</text>
      </>);
    case "anchura":
      return (<>
        <Cota2 x1={118} y1={185} x2={322} y2={185} />
        <text x="330" y="190">Ø domo</text>
      </>);
    case "dmax":
      return (<>
        <Cota2 x1={146} y1={268} x2={302} y2={84} />
        <text x="314" y="62">Ø máx</text>
      </>);
    case "madre":
      return (<>
        <Cota2 x1={40} y1={ARTERIA_Y} x2={40} y2={ARTERIA_FONDO} />
        <text x="20" y="376">Ø arteria madre</text>
      </>);
    case "contorno":
      return (<>
        <path d={ENVOLVENTE} fill="none" strokeDasharray="6 5" />
        <text x="430" y="376" textAnchor="end">envolvente convexa</text>
      </>);
    case "elipse":
      return (<>
        <ellipse cx="220" cy="184" rx="104" ry="116" fill="none" strokeDasharray="6 5" />
        <text x="430" y="376" textAnchor="end">elipse ajustada</text>
      </>);
    case "esfera":
      return (<>
        <circle cx="220" cy="186" r="106" fill="none" strokeDasharray="6 5" />
        <text x="430" y="376" textAnchor="end">esfera de igual volumen</text>
      </>);
  }
}

/* Opacidad de las cotas de medida que el índice activo no usa. Con 0,7 el rótulo
   (--foreground) pasa de 4,5:1 y la línea (--muted-foreground) de 3:1 en los dos
   temas (styles/landing.tema.test.ts). La activa se distingue además por el trazo
   --data, el grosor y la negrita. Las siluetas de forma inactivas no se pintan. */
export const OPACIDAD_COTA_INACTIVA = 0.7;

const COTAS: readonly Cota[] = ["contorno", "elipse", "esfera", "anchura", "dmax", "altura", "cuello", "madre"];

export function DiagramaSaco({ activas }: { activas: readonly Cota[] }) {
  const reducido = useReducedMotion() ?? false;
  return (
    <svg
      className="diagrama-saco"
      viewBox={VIEWBOX}
      role="img"
      aria-label={`Diagrama del saco: resalta ${activas.map((c) => NOMBRE_COTA[c]).join(" y ")}`}
    >
      {/* Arteria madre: un vaso (dos paredes y su luz), no una barra. */}
      <rect className="diagrama-saco__madre" x="0" y={ARTERIA_Y} width="440" height={ARTERIA_FONDO - ARTERIA_Y} />
      <line className="diagrama-saco__pared" x1="0" y1={ARTERIA_Y} x2="190" y2={ARTERIA_Y} />
      <line className="diagrama-saco__pared" x1="250" y1={ARTERIA_Y} x2="440" y2={ARTERIA_Y} />
      <line className="diagrama-saco__pared" x1="0" y1={ARTERIA_FONDO} x2="440" y2={ARTERIA_FONDO} />
      <text className="diagrama-saco__vaso" x="430" y="331" textAnchor="end">arteria madre</text>
      <path className="diagrama-saco__saco" d={SACO} />
      {COTAS.map((c) => {
        const activa = activas.includes(c);
        const forma = COTAS_FORMA.includes(c);
        const opacidad = activa ? 1 : forma ? 0 : OPACIDAD_COTA_INACTIVA;
        return (
          <motion.g
            key={c}
            data-cota={c}
            data-activa={activa ? "true" : "false"}
            aria-hidden={!activa && forma ? true : undefined}
            initial={false}
            animate={{ opacity: opacidad }}
            transition={{ duration: reducido ? 0 : DUR.estado, ease: EASE }}
          >
            <Trazos cota={c} />
          </motion.g>
        );
      })}
    </svg>
  );
}
