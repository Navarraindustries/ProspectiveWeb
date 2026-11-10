import { useNavigate } from "react-router-dom";
import { UserAvatar } from "../../avatar/UserAvatar";
import { Button } from "../../components/Button";
import { SCREEN_PATH } from "../../store/nav";
import { useAuth } from "../../store/auth";
import { LISTO, PRIMEROS_PASOS } from "../copy";
import { usePrimerosPasos, type AccionPrimerosPasos } from "../primerosPasos";
import { useOnboarding } from "../OnboardingProvider";
import type { PropsMomento } from "./tipos";

export function Listo({ nombre }: PropsMomento) {
  const { user } = useAuth();
  const { terminar, empezar } = useOnboarding();
  const navigate = useNavigate();

  const ejecutar = usePrimerosPasos();
  const hacer = (accion: AccionPrimerosPasos) => {
    void terminar("completado");
    ejecutar(accion);
  };

  return (
    <div className="ob-listo">
      <div className="ob-listo__cabecera">
        {user && <UserAvatar user={user} self size={120} />}
        <h1 className="ob-titulo ob-titulo--grande">{LISTO.saludo(nombre)}</h1>
      </div>
      <section className="ob-tarjeta ob-listo__pasos" aria-label={LISTO.primerosPasos}>
        <h2 className="ob-listo__rotulo">{LISTO.primerosPasos}</h2>
        <ul>
          {PRIMEROS_PASOS.map((p) => (
            <li key={p.accion} className="ob-listo__paso">
              <div>
                <div>{p.texto}</div>
                <div className="ob-listo__lugar">{p.lugar}</div>
              </div>
              <Button variant="outline" onClick={() => hacer(p.accion)}>{p.cta}</Button>
            </li>
          ))}
        </ul>
      </section>
      <div className="ob-listo__acciones">
        <Button onClick={() => { void terminar("completado"); navigate(SCREEN_PATH.patients); }}>{LISTO.irPacientes}</Button>
        <Button variant="ghost" onClick={empezar}>{LISTO.repetir}</Button>
      </div>
    </div>
  );
}
