/* La barra del recorrido por dentro del vaso: dónde va la cámara sobre la
   línea central, el calibre del vaso en ese punto y los mandos (pausa/seguir,
   salir). El avance llega fotograma a fotograma por `progreso`, fuera de
   React: así solo se repinta esta barra, no el visor entero. */
import { useEffect, useSyncExternalStore, type SyntheticEvent } from "react";
import { cifra } from "../../lib/numero";

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

export interface HudRecorridoProps {
  progreso: ProgresoRecorrido;
  totalMm: number;
  /** Ø del vaso (mm) a `mm` del origen. */
  diametroEn(mm: number): number;
  estado: "andando" | "pausa" | "fin";
  onPausa(): void;
  onSeguir(): void;
  onSalir(): void;
  /** Sin SALIR propio (en el modo presentación sale la presentación entera). */
  sinSalir?: boolean;
}

// Como la barra del cine: pulsarla no puede empezar a girar la escena.
const stop = (e: SyntheticEvent) => e.stopPropagation();

export function HudRecorrido({ progreso, totalMm, diametroEn, estado, onPausa, onSeguir, onSalir, sinSalir = false }: HudRecorridoProps) {
  const mm = useSyncExternalStore(progreso.suscribir, progreso.leer);
  // Esc sale del vaso, esté donde esté el foco (salvo escribiendo en un campo).
  useEffect(() => {
    if (sinSalir) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.stopPropagation();
      onSalir();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [onSalir, sinSalir]);
  const k = totalMm > 0 ? Math.min(1, Math.max(0, mm / totalMm)) : 0;
  const principal = estado === "andando"
    ? { label: "⏸", title: "Pausa (o toca el visor para mirar alrededor)", on: onPausa }
    : estado === "pausa"
      ? { label: "▶", title: "Seguir por el vaso", on: onSeguir }
      : { label: "↺", title: "Repetir el recorrido desde el origen", on: onSeguir };
  return (
    <div className="hud-recorrido" role="group" aria-label="Recorrido por dentro del vaso" onPointerDown={stop} onDoubleClick={stop}>
      <span className="hud-recorrido-titulo">DENTRO DEL VASO</span>
      <button type="button" className="hud-recorrido-play" title={principal.title} aria-label={principal.title} onClick={principal.on}>{principal.label}</button>
      <div className="hud-recorrido-pista" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(totalMm)} aria-valuenow={Math.round(mm)} aria-label="Recorrido">
        <div className="hud-recorrido-avance" style={{ transform: `scaleX(${k})` }} />
      </div>
      <span className="hud-recorrido-cifras">{`${cifra(mm, 1)} / ${cifra(totalMm, 1)} mm · Ø ${cifra(diametroEn(mm), 1)} mm`}</span>
      {!sinSalir && <button type="button" title="Salir del vaso (Esc)" onClick={onSalir}>SALIR ✕</button>}
    </div>
  );
}
