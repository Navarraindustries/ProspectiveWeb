import { HOLA } from "../copy";
import type { PropsMomento } from "./tipos";

export function Hola({ nombre }: PropsMomento) {
  return (
    <div className="ob-hola">
      <div className="ob-hola__saludo">
        <h1 className="ob-titulo ob-titulo--grande">{HOLA.saludo(nombre)}</h1>
        <p className="ob-sub">{HOLA.subtitulo}</p>
      </div>
      <ol className="ob-tarjeta ob-agenda" aria-label="Qué vamos a ver">
        {HOLA.agenda.map((t, i) => (
          <li key={t} className="ob-agenda__item">
            <span className="ob-agenda__num" aria-hidden="true">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
