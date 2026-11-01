/* Diagrama del saco aneurismático: arteria madre abajo, saco apoyado en ella por
   un cuello estrecho. Cada cota es un grupo con su línea y su rótulo; las que
   usa el índice activo se encienden (opacidad, trazo `--data`, grosor y rótulo
   en negrita: el resaltado no vive solo en el color). Todo con tokens, así que
   sigue al tema. */

import { DUR, EASE, motion, useReducedMotion } from "../../motion";
import { NOMBRE_COTA, type Cota } from "./indices";

const SACO = "M140 200 C110 190 88 160 88 120 C88 70 120 40 160 40 C200 40 232 70 232 120 C232 160 210 190 180 200 Z";
const CONTORNO = "M140 204 L84 150 L84 96 L120 34 L200 34 L236 96 L236 150 L180 204 Z";

/* Líneas y rótulos de cada cota. */
function Trazos({ cota }: { cota: Cota }) {
  switch (cota) {
    case "cuello":
      return (<>
        <line x1="140" y1="200" x2="180" y2="200" />
        <text x="160" y="226" textAnchor="middle">cuello</text>
      </>);
    case "altura":
      return (<>
        <line x1="160" y1="196" x2="160" y2="40" />
        <text x="168" y="150">altura</text>
      </>);
    case "anchura":
      return (<>
        <line x1="88" y1="120" x2="232" y2="120" />
        <text x="238" y="125">Ø domo</text>
      </>);
    case "dmax":
      return (<>
        <line x1="100" y1="165" x2="214" y2="66" />
        <text x="222" y="56">Ø máx</text>
      </>);
    case "madre":
      return (<>
        <line x1="24" y1="200" x2="24" y2="240" />
        <text x="8" y="256">Ø arteria madre</text>
      </>);
    case "contorno":
      return (<>
        <path d={CONTORNO} fill="none" strokeDasharray="6 4" />
        <text x="4" y="30">contorno</text>
      </>);
    case "elipse":
      return (<>
        <ellipse cx="160" cy="120" rx="82" ry="88" fill="none" strokeDasharray="6 4" />
        <text x="4" y="78">elipse</text>
      </>);
    case "esfera":
      return (<>
        <circle cx="160" cy="120" r="76" fill="none" strokeDasharray="6 4" />
        <text x="4" y="168">esfera</text>
      </>);
  }
}

/* Opacidad de las cotas que el índice activo no usa. Con 0,28 el rótulo se quedaba
   en 1,5:1 en el tema claro; con 0,7 el rótulo (--foreground) pasa de 4,5:1 y la
   línea (--muted-foreground) de 3:1 en los dos temas (styles/landing.tema.test.ts).
   La activa se distingue además por el trazo --data, el grosor y la negrita. */
export const OPACIDAD_COTA_INACTIVA = 0.7;

const COTAS: readonly Cota[] =["contorno", "elipse", "esfera", "anchura", "dmax", "altura", "cuello", "madre"];

export function DiagramaSaco({ activas }: { activas: readonly Cota[] }) {
  const reducido = useReducedMotion() ?? false;
  return (
    <svg
      className="diagrama-saco"
      viewBox="0 0 320 260"
      role="img"
      aria-label={`Diagrama del saco: resalta ${activas.map((c) => NOMBRE_COTA[c]).join(" y ")}`}
    >
      <rect className="diagrama-saco__madre" x="0" y="200" width="320" height="40" />
      <path className="diagrama-saco__saco" d={SACO} />
      {COTAS.map((c) => {
        const activa = activas.includes(c);
        return (
          <motion.g
            key={c}
            data-cota={c}
            data-activa={activa ? "true" : "false"}
            initial={false}
            animate={{ opacity: activa ? 1 : OPACIDAD_COTA_INACTIVA }}
            transition={{ duration: reducido ? 0 : DUR.estado, ease: EASE }}
          >
            <Trazos cota={c} />
          </motion.g>
        );
      })}
    </svg>
  );
}
