/* Banda de cabecera del visor: selector de la vista PRINCIPAL, presets de
   distribución, los conmutadores PLANOS · REGLAS · SINCRO · CALOR y «?».

   Separada de Viewer para poder probarla sola (spec §6: el selector refleja
   `layout.main` y cambia la distribución). Es presentacional: el estado vive
   en Viewer y aquí solo se pinta y se avisa. Lo único propio es el ancho de
   la banda, que solo ella usa para abreviar sus rótulos (headerLabels). */

import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { promote, setPreset, type PaneId, type ViewerLayout } from "./layout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { headerLabels, mainOptions, presetOptions } from "./mainOptions";

export interface ViewerHeaderProps {
  layout: ViewerLayout;
  onLayoutChange: (layout: ViewerLayout) => void;
  /** Alt+1/2/3: las mismas teclas que la rejilla, para que el foco en un
   *  conmutador de la banda no las pierda. */
  onKeyDown?: (e: ReactKeyboardEvent) => void;
  planesHidden: boolean;
  onPlanesHiddenChange: (hidden: boolean) => void;
  decorHidden: boolean;
  onDecorHiddenChange: (hidden: boolean) => void;
  syncViews: boolean;
  onSyncViewsChange: (on: boolean) => void;
  /** CALOR solo existe cuando hay un campo del clip calculado: sin él no
   *  habría nada que encender. */
  hasClipField: boolean;
  showClipField: boolean;
  clipRehearsal: boolean;
  onShowClipFieldChange: (on: boolean) => void;
  /** «?» al final de la banda: abre la hoja de atajos (la misma que la tecla). */
  onHelp?: () => void;
}

export function ViewerHeader({
  layout, onLayoutChange, onKeyDown,
  planesHidden, onPlanesHiddenChange,
  decorHidden, onDecorHiddenChange,
  syncViews, onSyncViewsChange,
  hasClipField, showClipField, clipRehearsal, onShowClipFieldChange, onHelp,
}: ViewerHeaderProps) {
  // Ancho de la banda para abreviar sus rótulos (headerLabels).
  const [bandWidth, setBandWidth] = useState(Number.POSITIVE_INFINITY);
  const bandObs = useRef<ResizeObserver | null>(null);
  const bandRef = useCallback((el: HTMLDivElement | null) => {
    bandObs.current?.disconnect();
    bandObs.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBandWidth(el.clientWidth));
    ro.observe(el);
    bandObs.current = ro;
    setBandWidth(el.clientWidth);
  }, []);
  const header = headerLabels(bandWidth);
  // Durante el ensayo manda el saco que se deforma y el campo no se pinta:
  // «●» diría que se está viendo.
  const calorOn = showClipField && !clipRehearsal;

  return (
    <div ref={bandRef} className="viewer-band"
         onKeyDown={onKeyDown}
         style={{ flex: "none", height: 22, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "0 12px", lineHeight: 1.2, fontFamily: "var(--font-mono)", background: "#000", borderBottom: "1px solid var(--hud-dim)", overflow: "hidden", whiteSpace: "nowrap" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        {/* PRINCIPAL elige qué vista ocupa el hueco grande; DISTRIBUCIÓN,
            REGLAS y SINCRO dicen cómo se ve el visor, no qué hay en él. */}
        <span style={{ color: "var(--hud-dim)" }} title="Vista principal">{header.mainCaption}</span>
        <HudToggleGroup options={mainOptions()} value={layout.main}
          onChange={(k) => onLayoutChange(promote(layout, k as PaneId))} />
        <HudToggleGroup
          options={presetOptions(bandWidth)}
          value={layout.preset}
          onChange={(k) => onLayoutChange(setPreset(layout, k as ViewerLayout["preset"]))} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <HudToggleGroup
          options={[{ key: "planes", label: planesHidden ? "PLANOS ○" : "PLANOS ●", title: "Mostrar/ocultar los planos de corte en el 3D" }]}
          value={planesHidden ? "" : "planes"} onChange={() => onPlanesHiddenChange(!planesHidden)} />
        <HudToggleGroup
          options={[{ key: "decor", label: decorHidden ? "REGLAS ○" : "REGLAS ●",
                      title: decorHidden ? "Mostrar reglas, retícula y marcos" : "Ocultar reglas, retícula y marcos (la orientación y las medidas se quedan)" }]}
          value={decorHidden ? "" : "decor"} onChange={() => onDecorHiddenChange(!decorHidden)} />
        <HudToggleGroup options={[{ key: "sync", label: syncViews ? "SINCRO ●" : "SINCRO ○", title: "Centrar todas las vistas en el punto" }]}
          value={syncViews ? "sync" : ""} onChange={() => onSyncViewsChange(!syncViews)} />
        {hasClipField && (
          <HudToggleGroup options={[{ key: "calor", label: calorOn ? "CALOR ●" : "CALOR ○",
                                      title: clipRehearsal
                                        ? "Durante el ensayo de cierre se ve el saco que se deforma; el mapa de calor vuelve al terminar"
                                        : showClipField ? "Ver el saco sin el mapa de calor del clip" : "Pintar el saco según el clip colocado" }]}
            value={calorOn ? "calor" : ""} onChange={() => onShowClipFieldChange(!showClipField)} />
        )}
        {/* Al final, donde se busca la ayuda: las teclas no se ven en ningún
            otro sitio de la pantalla. */}
        {onHelp && (
          <HudToggleGroup options={[{ key: "help", label: "?", title: "Atajos (?)" }]} value="" onChange={onHelp} />
        )}
      </div>
    </div>
  );
}
