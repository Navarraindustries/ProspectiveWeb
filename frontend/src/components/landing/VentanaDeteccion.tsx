/* VentanaDeteccion — el fotograma final del hero: la ventana de cristal
   «Detección · 5 candidatos» y las balizas 1–5 sobre el render 3D del 036.

   Las dos piezas comparten la lista de candidatos para que el número de cada
   fila sea el de su baliza. Las posiciones son porcentajes del render
   (`hero-3d.webp`, 1400 × 1000): la 1 cae sobre el saco rojo; las otras cuatro
   son puntos del árbol para ilustrar el resto de la lista. */

import { glass } from "../../styles/glass";

interface Candidato {
  n: number;
  canal: "calibre" | "cociente" | "curvatura";
  nota?: string;
  x: number;
  y: number;
}

const CANDIDATOS: readonly Candidato[] = [
  { n: 1, canal: "calibre", nota: "lesión · ≈9,8 mm", x: 50, y: 50 },
  { n: 2, canal: "cociente", x: 61, y: 52 },
  { n: 3, canal: "curvatura", x: 45, y: 64 },
  { n: 4, canal: "calibre", x: 60, y: 69 },
  { n: 5, canal: "curvatura", x: 56, y: 30 },
];

/** Balizas sobre el render: el padre debe tener la proporción del render. */
export function BalizasDeteccion() {
  return (
    <div className="hero-balizas" aria-hidden="true">
      {CANDIDATOS.map((c) => (
        <span
          key={c.n}
          data-baliza={c.n}
          className={c.n === 1 ? "hero-baliza hero-baliza--lesion" : "hero-baliza"}
          style={{ left: `${c.x}%`, top: `${c.y}%` }}
        >
          {c.n}
        </span>
      ))}
    </div>
  );
}

export function VentanaDeteccion() {
  return (
    <div data-glass className="hero-ventana" style={{ ...glass("dense"), borderRadius: "var(--radius-xl)" }}>
      <div className="hero-ventana__cabecera">Detección · 5 candidatos</div>
      <ol className="hero-ventana__filas">
        {CANDIDATOS.map((c) => (
          <li key={c.n} className="hero-ventana__fila">
            <span className={c.n === 1 ? "hero-ventana__num hero-ventana__num--lesion" : "hero-ventana__num"}>{c.n}</span>
            <span className="hero-ventana__canal">{c.canal}</span>
            {c.nota && <span className="hero-ventana__nota">{c.nota}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
