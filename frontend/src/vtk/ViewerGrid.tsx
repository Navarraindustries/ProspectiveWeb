/* La rejilla del visor. Las cinco vistas se montan UNA vez (clave = id) y al
   cambiar la distribución solo cambia su `gridArea`: así el lienzo WebGL de
   cada una sobrevive al intercambio sin parpadear ni perder cámara. El modelo
   (layout.ts), la geometría (layoutGrid.ts) y el arrastre (paneDrag.ts) son
   puros; aquí solo se traducen eventos a esas llamadas. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ALL_PANES, defaultFraction, promote, setMainFraction, swapPanes, type PaneId, type ViewerLayout } from "./layout";
import { fractionFromPointer, gridFor, isCompact } from "./layoutGrid";
import { beginDrag, cancelDrag, endDrag, moveDrag, type DragState } from "./paneDrag";

export interface PaneContext { compact: boolean; isMain: boolean }
export interface ViewerGridProps {
  layout: ViewerLayout;
  onLayoutChange: (l: ViewerLayout) => void;
  /** Dibuja una vista. Se llama en cada render pero la celda (el nodo DOM) es
   *  siempre la misma por `id`: la clave de React es el id de la vista. */
  renderPane: (id: PaneId, ctx: PaneContext) => ReactNode;
  /** El nodo de cada celda, para componer la captura del visor. */
  registerCell?: (id: PaneId, el: HTMLDivElement | null) => void;
  /** Contenido que va encima de la principal (pista, conmutadores de cabecera). */
  mainOverlay?: ReactNode;
}

/** Tras soltar un arrastre de verdad el navegador puede rematar con un `click`
 *  o, si hubo un clic justo antes, con un `dblclick` que subiría la vista a
 *  principal. Durante este margen se tragan. */
const SUPPRESS_CLICK_MS = 400;

const paneUnder = (x: number, y: number): PaneId | null => {
  const el = document.elementFromPoint(x, y)?.closest("[data-pane]");
  const id = el?.getAttribute("data-pane") as PaneId | null | undefined;
  return id && ALL_PANES.includes(id) ? id : null;
};
// jsdom no implementa la captura de puntero, y un navegador lanza si el puntero
// ya no existe. En ningún caso merece romper el gesto.
const capture = (el: Element, id: number) => { try { (el as HTMLElement).setPointerCapture?.(id); } catch { /* sin captura */ } };
const release = (el: Element, id: number) => { try { (el as HTMLElement).releasePointerCapture?.(id); } catch { /* sin captura */ } };

export function ViewerGrid({ layout, onLayoutChange, renderPane, registerCell, mainOverlay }: ViewerGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Sin medida todavía (o con el ResizeObserver de las pruebas, que no dispara):
  // apaisado y nada compacto, que es lo que ve un escritorio.
  const [portrait, setPortrait] = useState(false);
  const [sizes, setSizes] = useState<Partial<Record<PaneId, { w: number; h: number }>>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDragBoth = useCallback((s: DragState | null) => { dragRef.current = s; setDrag(s); }, []);
  const suppressClickUntil = useRef(0);

  // ¿Vertical? Decide si «derecha» se pinta como «abajo».
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setPortrait(e.contentRect.height > e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spec = gridFor(layout, portrait);

  // ── Medida de cada celda ─────────────────────────────────────────────── #
  // Cada celda mide su ancho y su alto: el HUD compacto depende del tamaño
  // real, no del hueco. Un observador por vista, guardado aparte, y referencias estables por
  // id: una función nueva en cada render haría que React soltara y volviera a
  // enganchar la celda (y su observador) en cada pintado.
  const observers = useRef(new Map<PaneId, ResizeObserver>());
  const cellEls = useRef(new Map<PaneId, HTMLDivElement>());
  const registerRef = useRef(registerCell);
  registerRef.current = registerCell;
  const cellRefs = useRef<Partial<Record<PaneId, (el: HTMLDivElement | null) => void>>>({});
  const cellRef = (id: PaneId) => (cellRefs.current[id] ??= (el: HTMLDivElement | null) => {
    registerRef.current?.(id, el);
    if (cellEls.current.get(id) === el) return;
    observers.current.get(id)?.disconnect();
    observers.current.delete(id);
    if (!el) { cellEls.current.delete(id); return; }
    cellEls.current.set(id, el);
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const { width: w, height: h } = e.contentRect;
      setSizes((prev) => (prev[id]?.w === w && prev[id]?.h === h ? prev : { ...prev, [id]: { w, h } }));
    });
    ro.observe(el);
    observers.current.set(id, ro);
  });
  useEffect(() => {
    const all = observers.current;
    return () => { all.forEach((ro) => ro.disconnect()); all.clear(); };
  }, []);

  // ── Arrastre para intercambiar ────────────────────────────────────────── #
  const onHandleDown = (id: PaneId) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    capture(e.currentTarget, e.pointerId);
    setDragBoth(beginDrag(id, e.clientX, e.clientY));
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const s = dragRef.current; if (!s) return;
    const next = moveDrag(s, e.clientX, e.clientY, paneUnder(e.clientX, e.clientY));
    // Sin cambio visible no se repinta: pointermove llega a 60+ Hz.
    if (next.active !== s.active || next.over !== s.over) setDragBoth(next);
    else dragRef.current = next;
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const s = dragRef.current; if (!s) return;
    release(e.currentTarget, e.pointerId);
    if (s.active) suppressClickUntil.current = performance.now() + SUPPRESS_CLICK_MS;
    const pair = endDrag(s);
    setDragBoth(cancelDrag());
    if (pair) onLayoutChange(swapPanes(layout, pair[0], pair[1]));
  };
  // pointercancel (el sistema se quedó el gesto) no es soltar: no se intercambia.
  const onHandleCancel = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    release(e.currentTarget, e.pointerId);
    setDragBoth(cancelDrag());
  };
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Escape" && dragRef.current) setDragBoth(cancelDrag()); };

  // Mientras se arrastra, Escape debe valer aunque el foco esté fuera de la
  // rejilla (el asa no es enfocable), y perder la ventana (alt-tab) cancela:
  // el pointerup se perdería y el resalte quedaría pegado.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && dragRef.current) setDragBoth(cancelDrag()); };
    const onBlur = () => setDragBoth(cancelDrag());
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", onBlur); };
  }, [dragging, setDragBoth]);

  // Un intercambio no debe además subir a principal ni pasar un clic a la vista.
  const swallowAfterDrag = (e: React.MouseEvent) => {
    if (performance.now() < suppressClickUntil.current) { e.preventDefault(); e.stopPropagation(); }
  };

  // ── Separador ─────────────────────────────────────────────────────────── #
  const splitting = useRef(false);
  const onSplitDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); capture(e.currentTarget, e.pointerId); splitting.current = true;
  };
  const onSplitMove = (e: React.PointerEvent) => {
    if (!splitting.current || !spec.splitter || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    // Rejilla sin tamaño (oculta o aún sin maquetar): la división daría NaN.
    if (rect.width <= 0 || rect.height <= 0) return;
    const next = setMainFraction(layout, fractionFromPointer(rect, e.clientX, e.clientY, spec.splitter));
    if (next !== layout) onLayoutChange(next);
  };
  const onSplitUp = (e: React.PointerEvent) => { splitting.current = false; release(e.currentTarget, e.pointerId); };

  return (
    <div ref={rootRef} className="viewer-grid" tabIndex={-1} onKeyDown={onKeyDown}
         onClickCapture={swallowAfterDrag} onDoubleClickCapture={swallowAfterDrag}
         style={{ display: "grid", gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows, gridTemplateAreas: spec.areas, width: "100%", height: "100%", position: "relative", background: "var(--hud-dim)" }}>
      {ALL_PANES.map((id) => {
        const slot = spec.slotOf[id];
        const hidden = !spec.visible[id];
        const isMain = slot === "main";
        // Sin medida aún, no compacta: Infinity nunca es «estrecho».
        const size = sizes[id];
        const compact = isCompact(size?.w ?? Number.POSITIVE_INFINITY, size?.h ?? Number.POSITIVE_INFINITY);
        return (
          // Oculta: sin gridArea y fuera del flujo (1×1 px), para que el lienzo
          // WebGL siga vivo sin ocupar un hueco que en «sola» no existe.
          <div key={id} ref={cellRef(id)} data-pane={id} data-slot={slot}
               className={`viewer-cell${hidden ? " viewer-cell--hidden" : ""}${drag?.over === id ? " viewer-cell--over" : ""}`}
               style={{ gridArea: hidden ? undefined : slot, position: hidden ? "absolute" : "relative", minWidth: 0, minHeight: 0, overflow: "hidden", background: "#000" }}
               onDoubleClick={() => { if (!isMain) onLayoutChange(promote(layout, id)); }}>
            {renderPane(id, { compact, isMain })}
            {isMain && mainOverlay}
            {!hidden && (
              <div className="viewer-handle" title="Arrastrar para intercambiar · Doble clic para maximizar"
                   onPointerDown={onHandleDown(id)} onPointerMove={onHandleMove}
                   onPointerUp={onHandleUp} onPointerCancel={onHandleCancel} />
            )}
          </div>
        );
      })}
      {spec.splitter && (
        <div className="viewer-splitter" data-testid="splitter" data-axis={spec.splitter}
             style={{ gridArea: "gap", cursor: spec.splitter === "x" ? "col-resize" : "row-resize", touchAction: "none" }}
             onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onPointerCancel={onSplitUp}
             onDoubleClick={() => onLayoutChange(setMainFraction(layout, defaultFraction(layout.preset)))}
             title="Arrastrar: repartir · Doble clic: reparto por defecto" />
      )}
    </div>
  );
}
