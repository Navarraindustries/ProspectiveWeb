/* La barra mínima del cine de una celda: reproducir/parar, un corte atrás o
   adelante y la cadencia. Es un control, no decoración: sigue a la vista en
   el HUD esencial (no lleva `hud-decor`) y, en limpio, mientras reproduce
   (clase `playing`), porque sin ella no habría cómo parar con el ratón.
   En la celda compacta solo caben el botón y la posición. */
import type { CSSProperties, SyntheticEvent } from "react";
import { CINE_FPS_MAX, CINE_FPS_MIN, clampFps } from "../cine";

export interface HudCineBarProps {
  index: number;
  count: number;
  playing: boolean;
  fps: number;
  compact: boolean;
  onPlay(): void;
  onStep(d: 1 | -1): void;
  onFps(f: number): void;
  style?: CSSProperties;
}

// WHY: la barra vive dentro de la celda; sin cortar aquí, pulsarla empezaría el
// arrastre de ventana del oblicuo y un doble clic en «+» maximizaría la celda.
const stop = (e: SyntheticEvent) => e.stopPropagation();

export function HudCineBar({ index, count, playing, fps, compact, onPlay, onStep, onFps, style }: HudCineBarProps) {
  return (
    <div className={playing ? "hud-cine playing" : "hud-cine"} role="group" aria-label="Cine" style={style} onPointerDown={stop} onDoubleClick={stop}>
      {!compact && <button type="button" title="Corte anterior (↓)" onClick={() => onStep(-1)}>◀</button>}
      <button type="button" className="hud-cine-play" aria-pressed={playing}
              title={playing ? "Parar (espacio)" : "Reproducir (espacio)"} onClick={onPlay}>{playing ? "⏸" : "▶"}</button>
      {!compact && <button type="button" title="Corte siguiente (↑)" onClick={() => onStep(1)}>▶</button>}
      <span className="hud-cine-pos">{`${index + 1}/${count}`}</span>
      {!compact && (
        <>
          <span aria-hidden="true">·</span>
          <button type="button" title="Más lento (−)" disabled={fps <= CINE_FPS_MIN} onClick={() => onFps(clampFps(fps - 1))}>−</button>
          <span>{`${fps} fps`}</span>
          <button type="button" title="Más rápido (+)" disabled={fps >= CINE_FPS_MAX} onClick={() => onFps(clampFps(fps + 1))}>+</button>
        </>
      )}
    </div>
  );
}
