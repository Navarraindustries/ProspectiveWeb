/* Los mandos de la distribución en la banda del visor: una pastilla por vista para
   encenderla o minimizarla, y Rotar, el lado de la grande, Igualar y Todas. El espacio
   lo reparte la rejilla según lo que quede encendido: aquí no se elige ninguna plantilla. */
import { ALL_PANES, flipSide, rotate, showAll, toggleEqual, togglePane, visiblePanes, type ViewerLayout } from "./layout";
import { MAIN_LABELS, MAIN_NAMES } from "./mainOptions";

export function ViewerLayoutControls({ layout, onLayoutChange, corto = false }: {
  layout: ViewerLayout;
  onLayoutChange: (l: ViewerLayout) => void;
  /** Banda estrecha: los rótulos de texto se abrevian. */
  corto?: boolean;
}) {
  const shown = visiblePanes(layout);
  const unica = shown.length === 1;
  const lado = layout.preset === "derecha";
  return (
    <div className="viewer-vistas" role="group" aria-label="Vistas del visor">
      {ALL_PANES.map((id) => {
        const on = !layout.hidden.includes(id);
        const nombre = MAIN_NAMES[id];
        return (
          <button key={id} type="button" className="viewer-chip" aria-pressed={on}
                  data-grande={on && !layout.equal && !unica && layout.main === id ? "" : undefined}
                  aria-label={`Vista ${nombre}`}
                  title={on ? (unica ? `${nombre}: es la única que se ve` : `Minimizar ${nombre}`) : `Mostrar ${nombre}`}
                  onClick={() => onLayoutChange(togglePane(layout, id))}>
            {MAIN_LABELS[id]}
          </button>
        );
      })}
      <span className="viewer-vistas__corte" aria-hidden="true" />
      <button type="button" className="viewer-accion" aria-label="Rotar las vistas" title="La vista siguiente pasa al sitio grande (Alt+5)"
              onClick={() => onLayoutChange(rotate(layout))}>
        ROTAR
      </button>
      {!unica && (
        <button type="button" className="viewer-accion" aria-label={lado ? "Poner la vista grande arriba" : "Poner la vista grande a la izquierda"}
                title={lado ? "Poner la vista grande arriba (Alt+3)" : "Poner la vista grande a la izquierda (Alt+2)"}
                onClick={() => onLayoutChange(flipSide(layout))}>
          {/* El texto dice lo que hace el botón, como su nombre accesible: decía
              dónde está ahora la grande, al revés de la acción (auditoría F3). */}
          {corto ? (lado ? "ARR" : "IZQ") : (lado ? "GRANDE ARR" : "GRANDE IZQ")}
        </button>
      )}
      {!unica && (
        <button type="button" className="viewer-accion" aria-label="Igualar las vistas" aria-pressed={layout.equal} title="Todas las vistas del mismo tamaño (Alt+4)"
                onClick={() => onLayoutChange(toggleEqual(layout))}>
          {corto ? "IGUAL" : "IGUALAR"}
        </button>
      )}
      {layout.hidden.length > 0 && (
        <button type="button" className="viewer-accion" aria-label="Mostrar todas las vistas" title="Mostrar las cinco vistas"
                onClick={() => onLayoutChange(showAll(layout))}>
          TODAS
        </button>
      )}
    </div>
  );
}
