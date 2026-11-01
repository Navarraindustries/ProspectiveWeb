/* «Índices»: la lista de los ocho índices y, al lado, el diagrama del saco que
   enciende las cotas del índice activo. Pasar el ratón, enfocar o pulsar una
   fila lo activa (en táctil, tocar). */

import { useState } from "react";
import { DiagramaSaco } from "./DiagramaSaco";
import { INDICES } from "./indices";
import { RevelarItem, Seccion } from "./Seccion";

export function Indices() {
  const [activo, setActivo] = useState(0);
  return (
    <Seccion id="indices" rotulo="Índices morfométricos" titulo="Ocho números que describen el saco">
      <div className="indices">
        <ul className="indices__lista">
          {INDICES.map((ind, i) => (
            <RevelarItem as="li" key={ind.abbr} className="indices__item">
              <button
                type="button"
                className="indices__fila"
                aria-pressed={i === activo}
                onMouseEnter={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                onClick={() => setActivo(i)}
              >
                <span className="indices__texto">
                  <span className="indices__titulo">{ind.titulo}</span>
                  <span className="indices__detalle">{ind.detalle}</span>
                </span>
                <span className="indices__sigla">{ind.abbr}</span>
              </button>
            </RevelarItem>
          ))}
        </ul>
        <div className="indices__diagrama">
          <DiagramaSaco activas={INDICES[activo].cotas} />
        </div>
      </div>
      <p className="sec__nota">
        Cuello, altura máxima y forma del saco. El sistema traduce las siglas a un nivel de riesgo
        (bajo · moderado · alto). Referencias: Greving 2014 · Dhar 2008 · Raghavan 2005 · Wadell.
      </p>
    </Seccion>
  );
}
