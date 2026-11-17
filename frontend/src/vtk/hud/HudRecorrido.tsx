/* La barra del recorrido por dentro del vaso: dónde va la cámara sobre la
   línea central, el calibre del vaso en ese punto y los mandos (pausa/seguir,
   grabar, salir). El avance llega fotograma a fotograma por `progreso`, fuera
   de React: así solo se repinta esta barra, no el visor entero.

   Teclas (17-11, a petición): ↑/W adelante, ↓/S atrás, Mayús más rápido,
   Espacio pausa o sigue, F mira al frente, Esc sale. Arrastrar en el visor
   gira la mirada y la rueda avanza o retrocede (eso lo lleva MeshView). */
import { useEffect, useRef, useSyncExternalStore, type SyntheticEvent } from "react";
import { cifra } from "../../lib/numero";
import { SIN_TECLAS, type Teclas } from "../vesselWalk";

export interface ProgresoRecorrido {
  leer(): number;
  poner(mm: number): void;
  suscribir(f: () => void): () => void;
}

export function crearProgreso(): ProgresoRecorrido {
  let mm = 0;
  const oyentes = new Set<() => void>();
  return {
    leer: () => mm,
    poner: (v) => { if (v === mm) return; mm = v; oyentes.forEach((f) => f()); },
    suscribir: (f) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
  };
}

/** La tecla que mueve la cámara, o null si no es de avance. */
export function teclaDeAvance(key: string): "adelante" | "atras" | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "ArrowUp" || k === "w") return "adelante";
  if (k === "ArrowDown" || k === "s") return "atras";
  return null;
}

export interface HudRecorridoProps {
  progreso: ProgresoRecorrido;
  totalMm: number;
  /** Ø del vaso (mm) a `mm` del origen. */
  diametroEn(mm: number): number;
  estado: "andando" | "pausa" | "fin";
  onPausa(): void;
  onSeguir(): void;
  onSalir(): void;
  /** Las teclas de avance pulsadas, cada vez que cambian. */
  onTeclas?(t: Teclas): void;
  onMirarAlFrente?(): void;
  /** Grabar el recorrido entero en vídeo (desde fuera, la zambullida, el
   *  avance y la vuelta final). Sin esto no hay botón. */
  onGrabar?(): void;
  onPararGrabacion?(): void;
  /** Milisegundos grabados; null si no se está grabando. */
  grabandoMs?: number | null;
  /** Sin SALIR propio (en el modo presentación sale la presentación entera). */
  sinSalir?: boolean;
}

// Como la barra del cine: pulsarla no puede empezar a girar la escena.
const stop = (e: SyntheticEvent) => e.stopPropagation();

const reloj = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function HudRecorrido({
  progreso, totalMm, diametroEn, estado, onPausa, onSeguir, onSalir, onTeclas, onMirarAlFrente,
  onGrabar, onPararGrabacion, grabandoMs = null, sinSalir = false,
}: HudRecorridoProps) {
  const mm = useSyncExternalStore(progreso.suscribir, progreso.leer);
  // Por ref: el efecto de las teclas no se rehace (ni suelta teclas) en cada render.
  const mandos = useRef({ onPausa, onSeguir, onSalir, onTeclas, onMirarAlFrente, estado, sinSalir });
  mandos.current = { onPausa, onSeguir, onSalir, onTeclas, onMirarAlFrente, estado, sinSalir };
  useEffect(() => {
    let teclas: Teclas = SIN_TECLAS;
    const poner = (t: Teclas) => {
      if (t.adelante === teclas.adelante && t.atras === teclas.atras && t.rapido === teclas.rapido) return;
      teclas = t;
      mandos.current.onTeclas?.(t);
    };
    const escribiendo = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const bajar = (e: KeyboardEvent) => {
      if (escribiendo(e)) return;
      const m = mandos.current;
      const avance = teclaDeAvance(e.key);
      let hecho = true;
      if (avance) poner({ ...teclas, [avance]: true, rapido: e.shiftKey });
      else if (e.key === "Shift") poner({ ...teclas, rapido: true });
      else if (e.key === "Escape" && !m.sinSalir) m.onSalir();
      // En la presentación el Espacio es del giro de la escena: no se toca.
      else if (e.key === " " && !m.sinSalir) (m.estado === "andando" ? m.onPausa : m.onSeguir)();
      else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) m.onMirarAlFrente?.();
      else hecho = false;
      if (hecho) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    const subir = (e: KeyboardEvent) => {
      const avance = teclaDeAvance(e.key);
      if (avance) poner({ ...teclas, [avance]: false, rapido: e.shiftKey });
      else if (e.key === "Shift") poner({ ...teclas, rapido: false });
    };
    // Al perder la ventana (alt-tab) el keyup no llega: la cámara seguiría sola.
    const soltar = () => poner(SIN_TECLAS);
    window.addEventListener("keydown", bajar, { capture: true });
    window.addEventListener("keyup", subir, { capture: true });
    window.addEventListener("blur", soltar);
    return () => {
      window.removeEventListener("keydown", bajar, { capture: true });
      window.removeEventListener("keyup", subir, { capture: true });
      window.removeEventListener("blur", soltar);
      soltar();
    };
  }, []);
  const k = totalMm > 0 ? Math.min(1, Math.max(0, mm / totalMm)) : 0;
  const principal = estado === "andando"
    ? { label: "⏸", title: "Pausa (Espacio)", on: onPausa }
    : estado === "pausa"
      ? { label: "▶", title: "Seguir por el vaso (Espacio)", on: onSeguir }
      : { label: "↺", title: "Volver por el vaso hasta el origen y repetir el recorrido (Espacio)", on: onSeguir };
  const grabando = grabandoMs !== null;
  return (
    <div className="hud-recorrido" role="group" aria-label="Recorrido por dentro del vaso" onPointerDown={stop} onDoubleClick={stop}>
      <span className="hud-recorrido-titulo">DENTRO DEL VASO</span>
      <button type="button" className="hud-recorrido-play" title={principal.title} aria-label={principal.title} onClick={principal.on}>{principal.label}</button>
      <div className="hud-recorrido-pista" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(totalMm)} aria-valuenow={Math.round(mm)} aria-label="Recorrido">
        <div className="hud-recorrido-avance" style={{ transform: `scaleX(${k})` }} />
      </div>
      <span className="hud-recorrido-cifras">{`${cifra(mm, 1)} / ${cifra(totalMm, 1)} mm · Ø ${cifra(diametroEn(mm), 1)} mm`}</span>
      <span className="hud-recorrido-ayuda" title="↑ / W adelante · ↓ / S atrás · Mayús más rápido · rueda paso a paso · arrastrar gira la mirada · F o doble clic mira al frente">
        ↑↓ avanzar · arrastra para mirar
      </span>
      {onGrabar && (grabando
        ? <button type="button" className="hud-recorrido-rec grabando" title="Parar la grabación y descargar el vídeo" aria-label={`Parar la grabación (${reloj(grabandoMs ?? 0)})`} onClick={onPararGrabacion}>■ {reloj(grabandoMs ?? 0)}</button>
        : <button type="button" className="hud-recorrido-rec" title="Grabar el recorrido entero en vídeo: desde fuera, la entrada, el avance y la vuelta final. Se para sola al acabar y se descarga." onClick={onGrabar}>● GRABAR</button>)}
      {!sinSalir && <button type="button" title="Salir del vaso (Esc)" onClick={onSalir}>SALIR ✕</button>}
    </div>
  );
}
