/* Capa de bienvenida a pantalla completa: seis momentos, «Saltar todo» siempre
   a la vista (y Esc), y nunca bloquea el trabajo. «pacientes» y «quirofano»
   (Tareas 12 y 13) se enchufan en PANTALLAS; mientras no estén, se saltan. */
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "../components/Button";
import { Logo } from "../components/shell/Logo";
import { useAuth } from "../store/auth";
import { HOLA } from "./copy";
import { Hola } from "./momentos/Hola";
import { Listo } from "./momentos/Listo";
import { EnVeinteSegundos } from "./momentos/EnVeinteSegundos";
import { TuAvatar } from "./momentos/TuAvatar";
import type { PropsMomento } from "./momentos/tipos";
import { useOnboarding, type Momento } from "./OnboardingProvider";
import "./onboarding.css";

const ORDEN: Momento[] = ["hola", "avatar", "intro", "pacientes", "quirofano", "listo"];
const ETIQUETAS: Record<Momento, string> = {
  hola: "Hola", avatar: "Tu avatar", intro: "En 20 segundos",
  pacientes: "Panel de pacientes", quirofano: "Quirófano", listo: "Listo",
};

/** Punto de enganche de las Tareas 12 y 13: añadir aquí «pacientes» y «quirofano». */
const PANTALLAS: Partial<Record<Momento, ComponentType<PropsMomento>>> = {
  hola: Hola, avatar: TuAvatar, intro: EnVeinteSegundos, listo: Listo,
};

function vecino(m: Momento, paso: 1 | -1): Momento | null {
  for (let i = ORDEN.indexOf(m) + paso; i >= 0 && i < ORDEN.length; i += paso) {
    if (PANTALLAS[ORDEN[i]]) return ORDEN[i];
  }
  return null;
}

export function FlujoOnboarding() {
  const { activo, momento, ir, terminar } = useOnboarding();
  const { user } = useAuth();
  const avance = useRef<(() => Promise<boolean>) | null>(null);
  const capa = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const registrarAvance = useCallback((fn: (() => Promise<boolean>) | null) => { avance.current = fn; }, []);

  useEffect(() => {
    if (!activo) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === "Escape") void terminar("saltado"); };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [activo, terminar]);

  useEffect(() => { if (activo) capa.current?.focus(); }, [activo, momento]);

  if (!activo || !momento) return null;
  const Pantalla = PANTALLAS[momento];
  if (!Pantalla) return null;
  const nombre = (user?.full_name ?? "").trim().split(/\s+/)[0] || "doctor/a";
  const previo = vecino(momento, -1);
  const proximo = vecino(momento, 1);
  const indice = ORDEN.indexOf(momento);

  const siguiente = async () => {
    if (!proximo) return;
    if (avance.current) {
      setOcupado(true);
      try { if (!(await avance.current())) return; } finally { setOcupado(false); }
    }
    ir(proximo);
  };

  return (
    <div ref={capa} className="ob-capa" role="dialog" aria-modal="true" aria-label="Bienvenida a Prospective" tabIndex={-1}>
      <header className="ob-barra">
        <Logo size={26} />
        <ol className="ob-pasos" aria-label="Progreso del recorrido">
          {ORDEN.map((m, i) => (
            <li key={m} className="ob-paso" data-estado={i < indice ? "pasado" : i === indice ? "actual" : "futuro"}
              aria-current={i === indice ? "step" : undefined}>
              <span className="ob-paso__tira" aria-hidden="true" />
              <span className="ob-paso__texto">{ETIQUETAS[m]}</span>
            </li>
          ))}
        </ol>
        <Button variant="ghost" size="sm" onClick={() => void terminar("saltado")}>{HOLA.saltar}</Button>
      </header>

      <main className="ob-cuerpo">
        <Pantalla nombre={nombre} registrarAvance={registrarAvance} />
      </main>

      <footer className="ob-pie">
        {previo ? <Button variant="outline" onClick={() => ir(previo)}>Atrás</Button> : <span />}
        <span className="ob-pie__pista">
          {momento === "hola" ? "Puedes saltarlo cuando quieras." : "Esc salta el recorrido."}
        </span>
        {momento === "hola" ? (
          <span className="ob-pie__acciones">
            <Button variant="ghost" onClick={() => void terminar("saltado")}>{HOLA.ahoraNo}</Button>
            <Button onClick={() => void siguiente()}>{HOLA.empezar}</Button>
          </span>
        ) : proximo ? (
          <Button disabled={ocupado} onClick={() => void siguiente()}>{ocupado ? "Guardando…" : "Siguiente"}</Button>
        ) : <span />}
      </footer>
    </div>
  );
}
