import { useReducedMotion } from "../../motion";
import { INTRO, TRAMOS_INTRO } from "../copy";

export function EnVeinteSegundos() {
  const reducido = useReducedMotion();
  return (
    <div className="ob-intro">
      <h1 className="ob-titulo">{INTRO.titulo}</h1>
      <ol className="ob-intro__fila">
        {TRAMOS_INTRO.map((t, i) => (
          <li key={t.tramo} className="ob-tarjeta ob-intro__tarjeta" data-tarjeta-tramo={t.tramo}
            data-animada={reducido ? "false" : "true"}
            style={{ ["--ob-retardo" as string]: `${i * 90}ms` }}>
            <span className="ob-intro__num" aria-hidden="true">{i + 1}</span>
            <h2 className="ob-intro__verbo">{t.verbo}</h2>
            <p>{t.linea}</p>
          </li>
        ))}
      </ol>
      <p className="ob-sub">{INTRO.cierre}</p>
    </div>
  );
}
