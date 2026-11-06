/* VentanaDeteccion — el fotograma final del hero: la ventana de cristal
   «Detección · 5 candidatos» con la salida real del detector para Case 3
   (`DETECCION_CASE3`), y la baliza de la lesión sobre su render 3D.

   Solo la lesión lleva baliza: `hero-3d.webp` (proporción 1400 × 1000, render
   cinemático de `render_cinematico_case3.py`) se encuadra con el saco en el
   50 % / 50 %. De los candidatos 2–5 no hay posición en pantalla, así que
   aparecen en la lista y no se inventa dónde caen. */

import { glass } from "../../styles/glass";
import { DETECCION_CASE3 } from "./heroFrames";
import type { CanalDeteccion } from "./heroFrames";
import { cifra } from "../../lib/numero";

/* Centro del saco rojo en el render, en % de su anchura y altura. */
const LESION_EN_RENDER = { x: 50, y: 50 };

const mm = (n: number): string => `≈${cifra(n, 1)} mm`;

/** Baliza de la lesión sobre el render: el padre debe tener la proporción del render. */
export function BalizasDeteccion() {
  const lesion = DETECCION_CASE3.find((c) => c.lesion);
  if (!lesion) return null;
  return (
    <div className="hero-balizas" aria-hidden="true">
      <span
        data-baliza={lesion.puesto}
        className="hero-baliza hero-baliza--lesion"
        style={{ left: `${LESION_EN_RENDER.x}%`, top: `${LESION_EN_RENDER.y}%` }}
      >
        {lesion.puesto}
      </span>
    </div>
  );
}

const canalesTexto = (canales: readonly CanalDeteccion[]) =>
  canales.filter((c) => c !== "saco").join(" · ");

export function VentanaDeteccion() {
  return (
    <>
      <div data-glass className="hero-ventana" style={{ ...glass("dense"), borderRadius: "var(--radius-xl)" }}>
        <div className="hero-ventana__cabecera">Detección · {DETECCION_CASE3.length} candidatos</div>
        <ol className="hero-ventana__filas">
          {DETECCION_CASE3.map((c) => (
            <li key={c.puesto} className="hero-ventana__fila">
              <span className={c.lesion ? "hero-ventana__num hero-ventana__num--lesion" : "hero-ventana__num"}>{c.puesto}</span>
              <span className="hero-ventana__canal">{canalesTexto(c.canales)}</span>
              {c.canales.includes("saco") && <span className="hero-ventana__insignia">saco pequeño</span>}
              {/* La cifra es el diámetro que mide el detector para el candidato, no el tamaño de la
                  lesión: el candidato 1 coincide con la lesión confirmada. */}
              <span className={c.lesion ? "hero-ventana__nota hero-ventana__nota--lesion" : "hero-ventana__nota"}>
                {c.lesion
                  ? `candidato ${c.puesto} · ${mm(c.diametroMm)} · coincide con la lesión confirmada (tronco basilar)`
                  : mm(c.diametroMm)}
              </span>
            </li>
          ))}
        </ol>
        <div className="hero-ventana__pie">
          <div className="hero-ventana__credito">Case 3 · 3DRA · detector de Prospective</div>
          <p className="hero-ventana__matiz">
            Ø: lo que mide el detector en cada candidato, no el tamaño del aneurisma. Un caso real; el puesto
            de la lesión varía de un caso a otro.
          </p>
        </div>
      </div>
    </>
  );
}
