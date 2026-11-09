/* Cascada de columnas de cristal de la ficha (L3). Cada columna es un section
   de cristal; la cascada solo reparte el espacio y mueve el foco entre columnas
   con ← / → y entre las filas de una columna con ↑ / ↓. No desplaza en horizontal (A37): enseña las últimas N columnas
   según el tramo de pantalla y las anteriores quedan como migas encima, que la
   devuelven a la vista. En móvil la única columna crece y desplaza la página. */

import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { glass } from "../../styles/glass";
import { useTramo } from "../../hooks/useEstrecho";
import type { Tramo } from "../../styles/puntosCorte";
import "./ficha.css";

export interface ColumnaCascada {
  key: string;
  titulo: string;
  ancho?: number;
  contenido: ReactNode;
}

/** Cuántas columnas caben a la vista en cada tramo; las demás son migas. */
export const COLUMNAS_VISIBLES: Record<Tramo, number> = { movil: 1, tableta: 2, estrecho: 2, ancho: 3, grande: 5 };

const ANCHO_PRIMERA = 320;
const ANCHO_INTERMEDIA = 300;
const FOCABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
/** Las filas de una columna: el botón de cada caso, estudio o sesión y las entradas. */
const FILA = ".fc-fila-boton, .fc-entrada";

export function Cascada({ columnas, onVolver }: { columnas: ColumnaCascada[]; onVolver: (hastaIndice: number) => void }) {
  const tramo = useTramo();
  const movil = tramo === "movil";
  const envoltura = useRef<HTMLDivElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  // La columna (o su miga) que tenía el foco: si al cambiar de ancho se
  // desmonta, el foco pasa a su sustituta en vez de perderse en el body.
  const columnaConFoco = useRef<string | null>(null);
  const desde = Math.max(0, columnas.length - COLUMNAS_VISIBLES[tramo]);
  const visibles = columnas.slice(desde);
  const total = columnas.length;

  // Al añadirse una columna, se lleva a la vista (en móvil, a su principio).
  // Solo depende del número de columnas: un cambio de ancho no desplaza.
  useEffect(() => {
    const ultima = raiz.current?.querySelector<HTMLElement>(":scope > section:last-of-type");
    ultima?.scrollIntoView?.({ behavior: "smooth", inline: "nearest", block: movil ? "start" : "nearest" });
  }, [total]);

  useLayoutEffect(() => {
    const key = columnaConFoco.current;
    const wrap = envoltura.current;
    if (!key || !wrap) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body && document.contains(activo)) return;
    const destino = Array.from(wrap.querySelectorAll<HTMLElement>("[data-columna]")).find((el) => el.dataset.columna === key);
    if (!destino) return;
    (destino.matches("button") ? destino : destino.querySelector<HTMLElement>(FOCABLE) ?? destino).focus();
  }, [desde]);

  const alEnfocar = (e: FocusEvent<HTMLDivElement>) => {
    const portador = (e.target as HTMLElement).closest<HTMLElement>("[data-columna]");
    if (portador && envoltura.current?.contains(portador)) columnaConFoco.current = portador.dataset.columna ?? null;
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && !vertical) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select") || t.isContentEditable) return;
    const secciones = Array.from(raiz.current?.querySelectorAll<HTMLElement>(":scope > section") ?? []);
    if (vertical) {
      // ↑/↓ entre las filas de la columna (UNI-85). Desde un botón de acción de
      // una fila se cuenta desde su fila; en los extremos no se da la vuelta.
      const columna = secciones.find((s) => s.contains(t));
      if (!columna) return;
      const filas = Array.from(columna.querySelectorAll<HTMLElement>(FILA));
      const propia = t.matches(FILA) ? t : t.closest(".fc-fila")?.querySelector<HTMLElement>(FILA) ?? null;
      const i = propia ? filas.indexOf(propia) : -1;
      const j = e.key === "ArrowDown" ? (i < 0 ? 0 : i + 1) : (i < 0 ? filas.length - 1 : i - 1);
      const destino = filas[j];
      if (!destino || destino === t) return;
      e.preventDefault();
      destino.focus();
      return;
    }
    const actual = secciones.findIndex((s) => s.contains(t));
    const destino = secciones[actual + (e.key === "ArrowRight" ? 1 : -1)];
    if (actual < 0 || !destino) return;
    e.preventDefault();
    destino.querySelector<HTMLElement>(FOCABLE)?.focus();
  };

  return (
    <div ref={envoltura} className="fc-wrap" data-tramo={tramo} onFocus={alEnfocar}>
      {desde > 0 && (
        <nav className="fc-migas" aria-label="Volver a una columna anterior">
          {columnas.slice(0, desde).map((c, i) => (
            <button key={c.key} type="button" className="fc-miga" data-columna={c.key} onClick={() => onVolver(i)}>{c.titulo}</button>
          ))}
        </nav>
      )}
      <div ref={raiz} className="fc-cascada" onKeyDown={alTeclear}>
        {visibles.map((c, i) => {
          const ultima = i === visibles.length - 1;
          const ancho = c.ancho ?? (desde + i === 0 ? ANCHO_PRIMERA : ANCHO_INTERMEDIA);
          const dimension = movil
            ? { flex: "1 1 auto", width: "100%" }
            : ultima
              ? { flex: "1 1 0", minWidth: "min(300px, 100%)" }
              : { flex: `0 1 ${ancho}px`, minWidth: 0 };
          return (
            <section key={c.key} aria-label={c.titulo} data-columna={c.key} data-glass className="fc-columna" style={{ ...glass("normal"), ...dimension }}>
              <header className="fc-cabecera">{c.titulo}</header>
              <div className="fc-cuerpo">{c.contenido}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
