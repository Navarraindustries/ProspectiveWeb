/* Burbuja explicativa del recorrido: título, tres líneas (Cómo / Cuándo /
   Por qué), puntos de progreso y acciones. Se coloca junto al rect, por el
   lado con más espacio; sin rect va centrada; en móvil es una hoja inferior.
   Teclado: → / Intro siguiente, ← anterior, Esc saltar; el foco queda
   atrapado mientras está montada y vuelve a donde estaba al desmontarla. */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { useMovil } from "../../hooks/useEstrecho";
import { glass } from "../../styles/glass";
import type { Explicacion } from "../copy";
import "./tour.css";

export interface BurbujaProps {
  explicacion: Explicacion;
  indice: number;
  total: number;
  onSiguiente: () => void;
  onAnterior: () => void;
  onSaltar: () => void;
  extra?: ReactNode;
  rect?: DOMRect | null;
  etiquetaSiguiente?: string;
}

const ANCHO = 360, ALTO = 300, HUECO = 14, BORDE = 12;
const entre = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
const FOCALIZABLES = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])";

function posicion(rect: DOMRect): CSSProperties {
  const W = window.innerWidth, H = window.innerHeight;
  const ancho = Math.min(ANCHO, W - 24);
  const espacio = { abajo: H - rect.bottom, arriba: rect.top, derecha: W - rect.right, izquierda: rect.left };
  const lado = (Object.keys(espacio) as (keyof typeof espacio)[]).reduce((a, b) => (espacio[b] > espacio[a] ? b : a));
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const izq = entre(cx - ancho / 2, BORDE, W - ancho - BORDE);
  const arr = entre(cy - ALTO / 2, BORDE, H - ALTO - BORDE);
  switch (lado) {
    case "abajo": return { left: izq, top: entre(rect.bottom + HUECO, BORDE, H - ALTO - BORDE) };
    case "arriba": return { left: izq, top: entre(rect.top - HUECO - ALTO, BORDE, H - ALTO - BORDE) };
    case "derecha": return { left: entre(rect.right + HUECO, BORDE, W - ancho - BORDE), top: arr };
    default: return { left: entre(rect.left - HUECO - ancho, BORDE, W - ancho - BORDE), top: arr };
  }
}

export function Burbuja(p: BurbujaProps) {
  const movil = useMovil();
  const raiz = useRef<HTMLDivElement>(null);
  const vivo = useRef(p);
  vivo.current = p;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    raiz.current?.focus();
    const alPulsar = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { onSiguiente, onAnterior, onSaltar, indice } = vivo.current;
      const sobreBoton = (e.target as HTMLElement | null)?.tagName === "BUTTON";
      const manejar = (f: () => void) => { e.preventDefault(); e.stopPropagation(); f(); };
      if (e.key === "Escape") return manejar(onSaltar);
      if (e.key === "ArrowRight") return manejar(onSiguiente);
      if (e.key === "Enter" && !sobreBoton) return manejar(onSiguiente);
      if (e.key === "ArrowLeft") return manejar(() => { if (indice > 0) onAnterior(); });
      if (e.key === "Tab" && raiz.current) {
        const f = Array.from(raiz.current.querySelectorAll<HTMLElement>(FOCALIZABLES));
        if (!f.length) return manejar(() => {});
        const act = document.activeElement;
        const dentro = raiz.current.contains(act) && act !== raiz.current;
        if (!dentro) return manejar(() => (e.shiftKey ? f[f.length - 1] : f[0]).focus());
        if (e.shiftKey && act === f[0]) return manejar(() => f[f.length - 1].focus());
        if (!e.shiftKey && act === f[f.length - 1]) return manejar(() => f[0].focus());
      }
    };
    window.addEventListener("keydown", alPulsar, true);
    return () => {
      window.removeEventListener("keydown", alPulsar, true);
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  const { explicacion: x, indice, total, rect } = p;
  const ultima = indice >= total - 1;
  const variante = movil ? "hoja" : rect ? "lado" : "centrada";
  const sitio: CSSProperties = movil ? {}
    : rect ? posicion(rect)
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", transition: "none" };
  const linea = (etiqueta: string, texto: string) => (
    <p className="tour-linea"><span className="tour-etiqueta">{etiqueta}</span>{texto}</p>
  );
  const alto: CSSProperties = { minHeight: 44 };

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-label={x.titulo}
      tabIndex={-1}
      data-glass=""
      data-variante={variante}
      className="tour-burbuja"
      style={{ ...glass("dense"), ...sitio }}
    >
      <span className="tour-solo-lectores" aria-live="polite">{`Parada ${indice + 1} de ${total}: ${x.titulo}`}</span>
      <h2 className="tour-titulo">{x.titulo}</h2>
      {linea("Cómo", x.como)}
      {linea("Cuándo", x.cuando)}
      {linea("Por qué", x.porque)}
      {p.extra}
      <div className="tour-puntos" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className="tour-punto" data-activo={i === indice} />)}
      </div>
      <div className="tour-acciones">
        <Button variant="outline" style={alto} disabled={indice === 0} onClick={p.onAnterior}>Anterior</Button>
        <Button style={alto} onClick={p.onSiguiente}>{p.etiquetaSiguiente ?? (ultima ? "Terminar" : "Siguiente")}</Button>
        <Button variant="ghost" style={alto} className="tour-saltar" onClick={p.onSaltar}>Saltar recorrido</Button>
      </div>
    </div>
  );
}
