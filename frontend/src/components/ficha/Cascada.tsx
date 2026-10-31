/* Cascada de columnas de cristal de la ficha (L3). Cada columna es un section
   de cristal; la cascada solo reparte el espacio, mueve el foco entre columnas
   con ← / → y, en pantalla estrecha, deja las dos últimas con migas encima. */

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { glass } from "../../styles/glass";
import { useEstrecho } from "../patients/useEstrecho";
import "./ficha.css";

export interface ColumnaCascada {
  key: string;
  titulo: string;
  ancho?: number;
  contenido: ReactNode;
}

const ANCHO_PRIMERA = 320;
const ANCHO_INTERMEDIA = 300;
const FOCABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Cascada({ columnas, onVolver }: { columnas: ColumnaCascada[]; onVolver: (hastaIndice: number) => void }) {
  const estrecho = useEstrecho();
  const raiz = useRef<HTMLDivElement>(null);
  const desde = estrecho ? Math.max(0, columnas.length - 2) : 0;
  const visibles = columnas.slice(desde);
  const total = columnas.length;

  // Al añadirse una columna, se desplaza hasta mostrarla.
  useEffect(() => {
    const ultima = raiz.current?.querySelector<HTMLElement>(":scope > section:last-of-type");
    ultima?.scrollIntoView?.({ behavior: "smooth", inline: "end", block: "nearest" });
  }, [total]);

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); return; }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select") || t.isContentEditable) return;
    const secciones = Array.from(raiz.current?.querySelectorAll<HTMLElement>(":scope > section") ?? []);
    const actual = secciones.findIndex((s) => s.contains(t));
    const destino = secciones[actual + (e.key === "ArrowRight" ? 1 : -1)];
    if (actual < 0 || !destino) return;
    e.preventDefault();
    destino.querySelector<HTMLElement>(FOCABLE)?.focus();
  };

  return (
    <div className="fc-wrap">
      {estrecho && desde > 0 && (
        <nav className="fc-migas" aria-label="Volver a una columna anterior">
          {columnas.slice(0, desde).map((c, i) => (
            <button key={c.key} type="button" className="fc-miga" onClick={() => onVolver(i)}>{c.titulo}</button>
          ))}
        </nav>
      )}
      <div ref={raiz} className="fc-cascada" onKeyDown={alTeclear}>
        {visibles.map((c, i) => {
          const ultima = i === visibles.length - 1;
          const ancho = c.ancho ?? (desde + i === 0 ? ANCHO_PRIMERA : ANCHO_INTERMEDIA);
          const dimension = ultima && c.ancho === undefined
            ? { flex: "1 1 0", minWidth: ANCHO_INTERMEDIA }
            : { flex: `0 0 ${ancho}px`, width: ancho };
          return (
            <section key={c.key} aria-label={c.titulo} data-glass className="fc-columna" style={{ ...glass("normal"), ...dimension }}>
              <header className="fc-cabecera">{c.titulo}</header>
              <div className="fc-cuerpo">{c.contenido}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
