/* La capa del modo presentación: el caso, las cifras de la lesión en grande y
   el paso de escena. Pensada para leerse proyectada desde el fondo de la sala.
   Las teclas (←/→, AvPág/RePág de los mandos de diapositivas, espacio, Esc) se
   cogen aquí, en captura, para que no lleguen a los atajos del visor. */
import { useEffect, type SyntheticEvent } from "react";
import type { CifraClave, Escena } from "../presentation";

export interface HudPresentacionProps {
  titulo: string;
  subtitulo: string | null;
  cifras: CifraClave[];
  escenas: Escena[];
  escena: number;
  /** null: la escena no gira (abordaje, por dentro). */
  girando: boolean | null;
  onEscena(i: number): void;
  onGiro(): void;
  onSalir(): void;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

export function HudPresentacion({ titulo, subtitulo, cifras, escenas, escena, girando, onEscena, onGiro, onSalir }: HudPresentacionProps) {
  const actual = escenas[escena];
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      let hecho = true;
      if (e.key === "ArrowRight" || e.key === "PageDown") onEscena(Math.min(escenas.length - 1, escena + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") onEscena(Math.max(0, escena - 1));
      else if (e.key === " ") onGiro();
      else if (e.key === "Escape") onSalir();
      else hecho = false;
      if (hecho) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [escena, escenas.length, onEscena, onGiro, onSalir]);

  return (
    <div className="hud-pres" onPointerDown={stop} onDoubleClick={stop}>
      <div className="hud-pres-caso">
        <span className="hud-pres-ceja">SESIÓN CLÍNICA</span>
        <h2 className="hud-pres-titulo">{titulo}</h2>
        {subtitulo && <span className="hud-pres-sub">{subtitulo}</span>}
      </div>
      <button type="button" className="hud-pres-salir" onClick={onSalir} title="Salir de la presentación (Esc)">SALIR ✕</button>

      {cifras.length > 0 && (
        <dl className="hud-pres-cifras" aria-label="Cifras de la lesión">
          {cifras.map((c) => (
            <div key={c.etiqueta} className="hud-pres-cifra">
              <dt>{c.etiqueta}{c.estimada ? " · estimado" : ""}</dt>
              <dd><span className="hud-pres-num">{c.valor}</span>{c.unidad && <span className="hud-pres-unidad">{c.unidad}</span>}</dd>
            </div>
          ))}
        </dl>
      )}

      <nav className="hud-pres-escenas" aria-label="Escenas">
        <button type="button" disabled={escena === 0} onClick={() => onEscena(escena - 1)} aria-label="Escena anterior (←)">◀</button>
        {/* `key`: cada escena estrena su rótulo, que entra con su animación. */}
        <div key={actual?.id} className="hud-pres-escena" aria-live="polite">
          <span className="hud-pres-escena-n">{`${escena + 1} / ${escenas.length}`}</span>
          <span className="hud-pres-escena-t">{actual?.titulo}</span>
          <span className="hud-pres-escena-d">{actual?.detalle}</span>
        </div>
        <button type="button" disabled={escena >= escenas.length - 1} onClick={() => onEscena(escena + 1)} aria-label="Escena siguiente (→)">▶</button>
        <div className="hud-pres-puntos" aria-hidden="true">
          {escenas.map((e, i) => <span key={e.id} className={i === escena ? "on" : undefined} />)}
        </div>
      </nav>

      {girando !== null && (
        <button type="button" className="hud-pres-giro" aria-pressed={girando} onClick={onGiro}
          title={girando ? "Parar el giro (espacio)" : "Reanudar el giro (espacio)"}>
          {girando ? "GIRO ●" : "GIRO ○"}
        </button>
      )}
    </div>
  );
}
