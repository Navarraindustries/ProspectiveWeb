/* Banda del visor en el nivel «iconos»: pantallas táctiles (≤ 1024) y bandas
   de menos de 800 px. A 44 px por objetivo los grupos de rótulos no caben: las
   vistas y sus mandos envuelven y los conmutadores son botones de icono o de
   texto corto.

   En táctil no hay ratón encima: nada vive solo en `title`. Cada control lleva
   `aria-label` con su nombre entero; el título se queda para quien sí tenga
   ratón. De izquierda a derecha caben ≈ 350 px a 44 px por objetivo; si no
   (aviso + CALOR a 360), el grupo derecho baja a otra fila y el izquierdo, que
   aquí puede encoger y envolver, tampoco se sale de la banda (A63).

   Es presentacional como ViewerHeader, que conserva la raíz (y su medida), el
   estado del aviso y la línea `status` que el ⚠ despliega (`noteId`). */

import type { CSSProperties } from "react";
import { Icon } from "../components/Icon";
import type { ViewerHeaderProps } from "./ViewerHeader";
import { ViewerLayoutControls } from "./ViewerLayoutControls";
import { REFERENCIAS_TITLE } from "./mainOptions";
import { nextHudLevel } from "./viewerPrefs";

export interface ViewerHeaderIconosProps extends ViewerHeaderProps {
  /** ≤ 640: sin «?» (los atajos son de teclado y en un móvil no lo hay). */
  movil: boolean;
  noteOpen: boolean;
  onToggleNote: () => void;
  /** id de la línea del aviso que pinta ViewerHeader (aria-controls del ⚠). */
  noteId: string;
}

// Centra el icono o el texto en el objetivo de 44 px que da hud.css.
const OBJETIVO: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center" };

export function ViewerHeaderIconos({
  layout, onLayoutChange,
  planesHidden, onPlanesHiddenChange,
  hudLevel, onHudLevelChange,
  syncViews, onSyncViewsChange,
  hasClipField, showClipField, clipRehearsal, onShowClipFieldChange, onHelp,
  levelNote, movil, noteOpen, onToggleNote, noteId,
}: ViewerHeaderIconosProps) {
  // Durante el ensayo manda el saco que se deforma y el campo no se pinta.
  const calorOn = showClipField && !clipRehearsal;
  const iconSize = 16;

  return (
    <>
      {/* El grupo puede encoger y envolver: a 360 no desborda. */}
      <div data-banda="izq" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", flex: "0 1 auto", minWidth: 0 }}>
        <ViewerLayoutControls layout={layout} onLayoutChange={onLayoutChange} corto />
      </div>
      {/* `hud-toggle` da a los botones el estilo de los conmutadores del HUD
          (atenuado, subrayado si están pulsados, foco discontinuo). */}
      <div data-banda="der" className="hud-toggle"
           style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", columnGap: 6, rowGap: 0, alignItems: "center", flex: "1 1 auto", minWidth: 0 }}>
        <button type="button" aria-label="Líneas de referencia en el 3D" title={REFERENCIAS_TITLE}
                aria-pressed={!planesHidden} onClick={() => onPlanesHiddenChange(!planesHidden)} style={OBJETIVO}>
          <Icon name="MPR_VIEW" size={iconSize} />
        </button>
        {/* Un solo botón que recorre los niveles como la tecla H; «TXT C/E/L»
            dice qué es y en cuál está, y el nombre accesible lo dice entero. */}
        <button type="button" aria-label={`Nivel de textos: ${hudLevel}. Cambiar (H)`} title="Nivel de textos (H)"
                onClick={() => onHudLevelChange(nextHudLevel(hudLevel))} style={OBJETIVO}>
          {`TXT ${hudLevel[0].toUpperCase()}`}
        </button>
        <button type="button" aria-label="Vincular las vistas" title="Encendido: un clic en una vista centra las demás en ese punto"
                aria-pressed={syncViews} onClick={() => onSyncViewsChange(!syncViews)} style={OBJETIVO}>
          <Icon name="LINK" size={iconSize} />
        </button>
        {hasClipField && (
          <button type="button" aria-label="Mapa de calor del clip" aria-pressed={calorOn} style={OBJETIVO}
                  title={clipRehearsal
                    ? "Durante el ensayo de cierre se ve el saco que se deforma; el mapa de calor vuelve al terminar"
                    : showClipField ? "Ver el saco sin el mapa de calor del clip" : "Pintar el saco según el clip colocado"}
                  onClick={() => onShowClipFieldChange(!showClipField)}>
            {calorOn ? "CAL ●" : "CAL ○"}
          </button>
        )}
        {/* Sin tamaño en línea: el objetivo de 44 px lo pone hud.css. */}
        {levelNote && (
          <button type="button" className="hud-note-toggle" data-testid="header-level-note" aria-label={levelNote} title={levelNote}
                  aria-expanded={noteOpen} aria-controls={noteId} onClick={onToggleNote}
                  style={{ ...OBJETIVO, padding: 0, margin: 0, border: "none", background: "none", color: "var(--hud-amber)", cursor: "pointer" }}>
            <Icon name="STATUS_WARN" size={iconSize} color="var(--hud-amber)" />
          </button>
        )}
        {onHelp && !movil && (
          <button type="button" aria-label="Atajos de teclado" title="Atajos (?)" onClick={onHelp} style={OBJETIVO}>?</button>
        )}
      </div>
    </>
  );
}
