/* Banda de cabecera del visor: selector de la vista PRINCIPAL, presets de
   distribución, el nivel de textos, los conmutadores PLANOS · VINCULAR · CALOR y «?».

   Separada de Viewer para poder probarla sola (spec §6: el selector refleja
   `layout.main` y cambia la distribución). Es presentacional: el estado vive
   en Viewer y aquí solo se pinta y se avisa. Lo único propio es el ancho de
   la banda, que solo ella usa para elegir su nivel (bandTier) y abreviar sus
   rótulos, y si el aviso de nivel está desplegado.

   No se pisa a ningún ancho (A63): la raíz envuelve, el grupo izquierdo no
   encoge y el derecho es elástico y también envuelve. Si los rótulos de un
   nivel no caben, lo que sobra baja a otra línea en vez de tapar al vecino. */

import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { useMediaQuery } from "../hooks/useEstrecho";
import { MQ_TACTIL } from "../pipeline/puntosCorte";
import { promote, setPreset, type PaneId, type ViewerLayout } from "./layout";
import { HudToggleGroup } from "./hud/HudToggleGroup";
import { bandTier, headerLabels, mainOptions, presetOptions } from "./mainOptions";
import { HUD_LEVELS, type HudLevel } from "./viewerPrefs";

const LEVEL_TITLES: Record<HudLevel, string> = {
  completo: "Todo: botones de las vistas, lecturas, orientación y escala",
  esencial: "Oculta los botones de las vistas; deja orientación, corte y ventana",
  limpio: "Solo la imagen, con lateralidad y escala",
};

export interface ViewerHeaderProps {
  layout: ViewerLayout;
  onLayoutChange: (layout: ViewerLayout) => void;
  /** Alt+1/2/3: las mismas teclas que la rejilla, para que el foco en un
   *  conmutador de la banda no las pierda. */
  onKeyDown?: (e: ReactKeyboardEvent) => void;
  planesHidden: boolean;
  onPlanesHiddenChange: (hidden: boolean) => void;
  /** Cuánto HUD se ve en la rejilla (la tecla H lo recorre). PLANOS va aparte:
   *  son geometría de la escena, no HUD, y se pueden querer en cualquier nivel. */
  hudLevel: HudLevel;
  onHudLevelChange: (level: HudLevel) => void;
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
  /** Aviso de nivel del volumen («Vista previa en baja resolución…»): una sola vez,
   *  aquí, en vez de repetido en cada celda. En el nivel ancho va en texto
   *  entero; por debajo, un ⚠ que despliega el texto en una línea debajo. */
  levelNote?: string | null;
}

export function ViewerHeader({
  layout, onLayoutChange, onKeyDown,
  planesHidden, onPlanesHiddenChange,
  hudLevel, onHudLevelChange,
  syncViews, onSyncViewsChange,
  hasClipField, showClipField, clipRehearsal, onShowClipFieldChange, onHelp,
  levelNote,
}: ViewerHeaderProps) {
  // Ancho de la banda para elegir el nivel y abreviar sus rótulos.
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
  // En táctil la banda va siempre en iconos (a 44 px los rótulos no caben).
  const touch = useMediaQuery(MQ_TACTIL);
  const tier = bandTier(bandWidth, touch);
  // El nivel iconos (tarea 3) se pinta por ahora como estrecho: rótulos
  // abreviados aunque la banda de una pantalla táctil mida más.
  const labelWidth = tier === "iconos" ? 0 : bandWidth;
  const header = headerLabels(labelWidth);
  const compact = tier === "estrecho" || tier === "iconos";
  // Aviso de nivel: desplegado o no (solo cuenta por debajo del nivel ancho).
  const [noteOpen, setNoteOpen] = useState(false);
  const noteInline = tier === "ancho";
  // Durante el ensayo manda el saco que se deforma y el campo no se pinta:
  // «●» diría que se está viendo.
  const calorOn = showClipField && !clipRehearsal;

  return (
    <div ref={bandRef} className="viewer-band" data-banda="raiz" data-tier={tier}
         onKeyDown={onKeyDown}
         style={{ flex: "none", minHeight: 22, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", columnGap: 14, rowGap: 0, padding: "0 12px", lineHeight: 1.2, fontFamily: "var(--font-mono)", background: "var(--viewer-bg)", borderBottom: "1px solid var(--hud-text-dim)", whiteSpace: "nowrap" }}>
      <div data-banda="izq" style={{ display: "flex", gap: 10, alignItems: "center", flex: "0 0 auto", minHeight: 22 }}>
        {/* PRINCIPAL elige qué vista ocupa el hueco grande; DISTRIBUCIÓN,
            TEXTOS y VINCULAR dicen cómo se ve el visor, no qué hay en él. */}
        <span style={{ color: "var(--hud-text-dim)", fontSize: 11, letterSpacing: ".08em" }} title="Vista principal">{header.mainCaption}</span>
        <HudToggleGroup options={mainOptions()} value={layout.main}
          onChange={(k) => onLayoutChange(promote(layout, k as PaneId))} />
        <HudToggleGroup
          options={presetOptions(labelWidth)}
          value={layout.preset}
          onChange={(k) => onLayoutChange(setPreset(layout, k as ViewerLayout["preset"]))} />
      </div>
      <div data-banda="der" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", columnGap: 10, rowGap: 0, alignItems: "center", flex: "1 1 auto", minWidth: 0, minHeight: 22 }}>
        <HudToggleGroup
          options={[{ key: "planes", label: planesHidden ? "PLANOS ○" : "PLANOS ●", title: "Mostrar/ocultar los planos de corte en el 3D" }]}
          value={planesHidden ? "" : "planes"} onChange={() => onPlanesHiddenChange(!planesHidden)} />
        {/* La banda queda fuera de `data-hud`: en limpio estos botones siguen
            ahí para volver (además de la H). En banda estrecha, C · E · L. */}
        {/* «TEXTOS», no «HUD» (F1-114): HUD es jerga de quien lo programó; lo
            que cambia es cuánto texto se pinta sobre la imagen. Cada nivel
            dice qué deja a la vista (F1-117). `data-hud` y las clases siguen
            llamándose hud: son nombres de código, no se leen. */}
        <HudToggleGroup label="TEXTOS ▸" title="Nivel de textos (H)" style={{ gap: 6, alignItems: "center" }}
          options={HUD_LEVELS.map((l) => ({ key: l, label: compact ? l[0].toUpperCase() : l.toUpperCase(), title: LEVEL_TITLES[l] }))}
          value={hudLevel} onChange={(k) => onHudLevelChange(k as HudLevel)} />
        {/* «VINCULAR» (F1-115): «SINCRO» no decía qué se sincroniza ni cuándo. */}
        <HudToggleGroup options={[{ key: "sync", label: syncViews ? "VINCULAR ●" : "VINCULAR ○", title: "Encendido: un clic en una vista centra las demás en ese punto" }]}
          value={syncViews ? "sync" : ""} onChange={() => onSyncViewsChange(!syncViews)} />
        {hasClipField && (
          <HudToggleGroup options={[{ key: "calor", label: calorOn ? "CALOR ●" : "CALOR ○",
                                      title: clipRehearsal
                                        ? "Durante el ensayo de cierre se ve el saco que se deforma; el mapa de calor vuelve al terminar"
                                        : showClipField ? "Ver el saco sin el mapa de calor del clip" : "Pintar el saco según el clip colocado" }]}
            value={calorOn ? "calor" : ""} onChange={() => onShowClipFieldChange(!showClipField)} />
        )}
        {/* El aviso no tiene forma corta: o cabe entero (nivel ancho, con
            elipsis si aun así no cabe) o es un ⚠ que despliega el texto. */}
        {levelNote && noteInline && (
          <span data-testid="header-level-note" title={levelNote}
                style={{ color: "var(--hud-amber)", fontSize: 11, letterSpacing: ".08em", flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {levelNote}
          </span>
        )}
        {levelNote && !noteInline && (
          <button type="button" data-testid="header-level-note" aria-label={levelNote} title={levelNote}
                  aria-expanded={noteOpen} onClick={() => setNoteOpen((o) => !o)}
                  style={{ display: "inline-flex", alignItems: "center", padding: 0, margin: 0, border: "none", background: "none", color: "var(--hud-amber)", cursor: "pointer", font: "inherit" }}>
            <Icon name="STATUS_WARN" size={12} color="var(--hud-amber)" />
          </button>
        )}
        {/* Al final, donde se busca la ayuda: las teclas no se ven en ningún
            otro sitio de la pantalla. */}
        {onHelp && (
          <HudToggleGroup options={[{ key: "help", label: "?", title: "Atajos (?)" }]} value="" onChange={onHelp} />
        )}
      </div>
      {levelNote && !noteInline && noteOpen && (
        <div data-testid="header-level-note-text" role="status"
             style={{ flexBasis: "100%", color: "var(--hud-amber)", fontSize: 11, letterSpacing: ".08em", whiteSpace: "normal", padding: "2px 0 4px" }}>
          {levelNote}
        </div>
      )}
    </div>
  );
}
