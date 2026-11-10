/* Capa de bienvenida a pantalla completa: seis momentos, «Saltar todo» siempre
   a la vista (y Esc), y nunca bloquea el trabajo.
   En «pacientes» la capa se aparta: el recorrido va sobre la app real, así que
   queda solo una pastilla (progreso + «Saltar todo») que no tapa la página, y
   el foco y las teclas (Tab, Esc) son de la burbuja del recorrido. ⌘K sigue
   bloqueado: la paleta se abriría debajo del foco.
   «quirofano» sigue a pantalla completa (la ilustración vive en la capa), pero
   su burbuja también manda en Tab y Esc: la capa no los toca.
   Con la capa a pantalla completa, ninguna tecla llega al trabajo de debajo
   (si se lanzó desde el quirófano, los dígitos cambiarían de paso, P plegaría
   el panel…): lo que nace fuera de la capa se para en la captura de window;
   lo que nace dentro, en la propia capa, después de sus manejadores. Escribir
   en un campo de la capa no se toca. «pacientes» no se aísla: va sobre la app. */
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "../components/Button";
import { Logo } from "../components/shell/Logo";
import { useAuth } from "../store/auth";
import { glass } from "../styles/glass";
import { HOLA } from "./copy";
import { QuirofanoZonas } from "./QuirofanoZonas";
import { RecorridoPacientes } from "./RecorridoPacientes";
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

/** Momento «pacientes»: el recorrido con focos; al terminar, al siguiente momento con pantalla. */
function MomentoPacientes() {
  const { ir, terminar } = useOnboarding();
  const fin = useCallback(() => {
    const proximo = vecino("pacientes", 1);
    if (proximo) ir(proximo);
    else void terminar("completado");
  }, [ir, terminar]);
  return <RecorridoPacientes onFin={fin} />;
}

/** Momento «quirofano»: la ilustración en cinco zonas; la burbuja manda en el teclado. */
function MomentoQuirofano() {
  const { ir, terminar } = useOnboarding();
  const fin = useCallback(() => {
    const proximo = vecino("quirofano", 1);
    if (proximo) ir(proximo);
    else void terminar("completado");
  }, [ir, terminar]);
  const atras = useCallback(() => { const previo = vecino("quirofano", -1); if (previo) ir(previo); }, [ir]);
  return <QuirofanoZonas onFin={fin} onAtras={atras} />;
}

const PANTALLAS: Partial<Record<Momento, ComponentType<PropsMomento>>> = {
  hola: Hola, avatar: TuAvatar, intro: EnVeinteSegundos, pacientes: MomentoPacientes,
  quirofano: MomentoQuirofano, listo: Listo,
};

/** Momentos que se viven sobre la app real: la capa no la cubre ni le roba el teclado. */
const SOBRE_LA_APP: ReadonlySet<Momento> = new Set<Momento>(["pacientes"]);
/** Momentos con burbuja de recorrido: ella lleva el foco, Tab y Esc (dos trampas a la vez se pelean).
    «quirofano» sigue a pantalla completa, pero la capa no toca el teclado. */
const BURBUJA_MANDA: ReadonlySet<Momento> = new Set<Momento>(["pacientes", "quirofano"]);

const esEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

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

  const vivo = useRef(true); // false cuando el flujo se cierra (Esc, «Saltar todo») o se desmonta
  useEffect(() => { vivo.current = !!activo; }, [activo]);
  useEffect(() => () => { vivo.current = false; }, []);
  const saltar = useCallback(() => { vivo.current = false; void terminar("saltado"); }, [terminar]);
  // En «Listo» ya se vio todo: cerrarlo con Esc es terminarlo, no saltarlo.
  const cerrarConEsc = useCallback(() => {
    if (momento === "listo") { vivo.current = false; void terminar("completado"); }
    else saltar();
  }, [momento, saltar, terminar]);
  const sobreLaApp = !!momento && SOBRE_LA_APP.has(momento);
  const burbujaManda = !!momento && BURBUJA_MANDA.has(momento);

  useEffect(() => {
    if (!activo) return;
    // Dentro de la capa cuenta también la burbuja del quirófano, que va por portal a <body>.
    const enLaCapa = (t: EventTarget | null) =>
      t instanceof Element && (!!capa.current?.contains(t) || !!t.closest(".tour-burbuja"));
    const atender = (e: KeyboardEvent) => {
      // ⌘K nunca: ni con la capa (es modal) ni durante el recorrido (abriría la paleta bajo el foco).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); return; }
      // Sobre la app, Esc y Tab son de la burbuja del recorrido: dos trampas a la vez se pelean.
      // Solo un Esc desde la propia pastilla (la burbuja no lo atiende) lo salta todo.
      if (burbujaManda) {
        if (sobreLaApp && e.key === "Escape" && e.target instanceof Node && capa.current?.contains(e.target)) saltar();
        return;
      }
      if (e.key === "Escape") {
        // Un panel de la capa con Esc propio («Desde mi foto») lo atiende él: se cierra ese panel, no el recorrido.
        if (capa.current?.querySelector("[data-escape-propio]")) return;
        cerrarConEsc();
        return;
      }
      // La capa es modal: tampoco Tab llega a la app de debajo.
      if (e.key === "Tab" && capa.current) {
        const foco = Array.from(capa.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )).filter((el) => !(el as HTMLButtonElement).disabled);
        if (foco.length === 0) return;
        const primero = foco[0], ultimo = foco[foco.length - 1];
        const actual = document.activeElement;
        if (!capa.current.contains(actual) || actual === capa.current) {
          e.preventDefault(); (e.shiftKey ? ultimo : primero).focus();
        } else if (e.shiftKey && actual === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && actual === ultimo) { e.preventDefault(); primero.focus(); }
      }
    };
    const alPulsar = (e: KeyboardEvent) => {
      atender(e);
      // A pantalla completa, lo que nace fuera de la capa (el cuerpo, un control oculto
      // del quirófano que conservara el foco) no sigue hacia la app de debajo.
      if (!sobreLaApp && !enLaCapa(e.target)) e.stopPropagation();
    };
    window.addEventListener("keydown", alPulsar, true);
    return () => window.removeEventListener("keydown", alPulsar, true);
  }, [activo, saltar, cerrarConEsc, sobreLaApp, burbujaManda]);

  // Con burbuja no: ya se llevó el foco (su efecto corre antes que este).
  useEffect(() => { if (activo && !burbujaManda) capa.current?.focus(); }, [activo, momento, burbujaManda]);

  if (!activo || !momento) return null;
  const Pantalla = PANTALLAS[momento];
  if (!Pantalla) return null;
  const nombre = (user?.full_name ?? "").trim().split(/\s+/)[0] || "doctor/a";
  const previo = vecino(momento, -1);
  const proximo = vecino(momento, 1);
  const indice = ORDEN.indexOf(momento);
  const progreso = (
    <ol className="ob-pasos" aria-label="Progreso del recorrido">
      {ORDEN.map((m, i) => (
        <li key={m} className="ob-paso" data-estado={i < indice ? "pasado" : i === indice ? "actual" : "futuro"}
          aria-current={i === indice ? "step" : undefined}>
          <span className="ob-paso__tira" aria-hidden="true" />
          <span className="ob-paso__texto">{ETIQUETAS[m]}</span>
        </li>
      ))}
    </ol>
  );

  if (sobreLaApp) {
    // Sin role="dialog": la burbuja ignora las teclas que vienen de otros diálogos.
    return (
      <>
        <div ref={capa} className="ob-mini" role="region" aria-label="Bienvenida a Prospective" data-glass style={glass("dense")}>
          <span className="ob-mini__rotulo">{ETIQUETAS[momento]}</span>
          {progreso}
          <Button variant="ghost" style={{ minHeight: 44 }} onClick={saltar}>{HOLA.saltar}</Button>
        </div>
        <Pantalla nombre={nombre} registrarAvance={registrarAvance} />
      </>
    );
  }

  const siguiente = async () => {
    if (!proximo) return;
    if (avance.current) {
      setOcupado(true);
      let ok = false;
      try { ok = await avance.current(); } finally { setOcupado(false); }
      if (!ok || !vivo.current) return;
    }
    ir(proximo);
  };

  return (
    <div ref={capa} className="ob-capa" role="dialog" aria-modal={momento === "quirofano" ? undefined : true} aria-label="Bienvenida a Prospective" tabIndex={-1}
      onKeyDown={(e) => { if (!esEditable(e.target)) e.stopPropagation(); }}>
      <header className="ob-barra">
        <Logo size={26} />
        {progreso}
        <Button variant="ghost" onClick={saltar}>{HOLA.saltar}</Button>
      </header>

      <main className={momento === "quirofano" ? "ob-cuerpo ob-cuerpo--ilustracion" : "ob-cuerpo"}>
        <Pantalla nombre={nombre} registrarAvance={registrarAvance} />
      </main>

      {momento !== "quirofano" && <footer className="ob-pie">
        {previo ? <Button variant="outline" onClick={() => ir(previo)}>Atrás</Button> : <span />}
        <span className="ob-pie__pista">
          {momento === "hola" ? "Puedes saltarlo cuando quieras." : momento === "listo" ? "Esc cierra el recorrido." : "Esc salta el recorrido."}
        </span>
        {momento === "hola" ? (
          <span className="ob-pie__acciones">
            <Button variant="ghost" onClick={saltar}>{HOLA.ahoraNo}</Button>
            <Button onClick={() => void siguiente()}>{HOLA.empezar}</Button>
          </span>
        ) : proximo ? (
          <Button disabled={ocupado} onClick={() => void siguiente()}>{ocupado ? "Guardando…" : "Siguiente"}</Button>
        ) : <span />}
      </footer>}
    </div>
  );
}
