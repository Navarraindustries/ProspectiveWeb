/* Burbuja explicativa del recorrido: título, tres líneas (Cómo / Cuándo /
   Por qué), puntos de progreso y acciones. Se coloca junto al rect, por el
   lado con más espacio; sin rect va centrada; en móvil es una hoja inferior.
   Teclado: → / Intro siguiente, ← anterior, Esc saltar; el foco queda
   atrapado mientras está montada y vuelve a donde estaba al desmontarla. */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { useMovil } from "../../hooks/useEstrecho";
import { glass } from "../../styles/glass";
import type { Explicacion } from "../copy";
import { ContenidoExplicacion } from "./ContenidoExplicacion";
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
  /** Permite «Anterior» (y ←) también en la primera parada: quien lo usa decide adónde lleva. */
  anteriorEnPrimera?: boolean;
}

const ANCHO = 360, ALTO = 300, HUECO = 14, BORDE = 12;
const entre = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
const FOCALIZABLES = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])";

export function posicion(rect: DOMRect, alto: number, W = window.innerWidth, H = window.innerHeight): CSSProperties {
  const ancho = Math.min(ANCHO, W - 24);
  const espacio = { abajo: H - rect.bottom, arriba: rect.top, derecha: W - rect.right, izquierda: rect.left };
  const lado = (Object.keys(espacio) as (keyof typeof espacio)[]).reduce((a, b) => (espacio[b] > espacio[a] ? b : a));
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const izq = entre(cx - ancho / 2, BORDE, W - ancho - BORDE);
  const arr = entre(cy - alto / 2, BORDE, H - alto - BORDE);
  switch (lado) {
    case "abajo": return { left: izq, top: entre(rect.bottom + HUECO, BORDE, H - alto - BORDE) };
    case "arriba": return { left: izq, bottom: entre(H - rect.top + HUECO, BORDE, H - alto - BORDE) };
    case "derecha": return { left: entre(rect.right + HUECO, BORDE, W - ancho - BORDE), top: arr };
    default: return { left: entre(rect.left - HUECO - ancho, BORDE, W - ancho - BORDE), top: arr };
  }
}

export function Burbuja(p: BurbujaProps) {
  const movil = useMovil();
  const raiz = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(ALTO);
  const vivo = useRef(p);
  vivo.current = p;

  useLayoutEffect(() => {
    const h = raiz.current?.offsetHeight ?? 0;
    if (h > 0 && h !== alto) setAlto(h);
  });

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    raiz.current?.focus();
    const alPulsar = (e: KeyboardEvent) => {
      const r = raiz.current;
      if (e.metaKey || e.ctrlKey || e.altKey || !r) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const enBurbuja = !!t && r.contains(t);
      const enCuerpo = !t || t === document.body || t === document.documentElement;
      // Otro diálogo encima (paleta, confirmación…): no es asunto del recorrido.
      const otro = t?.closest('[role="dialog"], [aria-modal="true"]');
      if (otro && otro !== r) return;
      if (!enBurbuja && !enCuerpo) return;
      const { onSiguiente, onAnterior, onSaltar, indice } = vivo.current;
      const editable = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      const interactivo = !!t && (t.tagName === "BUTTON" || t.tagName === "A" || editable);
      const manejar = (f: () => void) => { e.preventDefault(); e.stopPropagation(); if (!e.repeat) f(); };
      if (e.key === "Tab") {
        const f = Array.from(r.querySelectorAll<HTMLElement>(FOCALIZABLES));
        if (!f.length) return manejar(() => {});
        const act = document.activeElement;
        const dentro = r.contains(act) && act !== r;
        if (!dentro) return manejar(() => (e.shiftKey ? f[f.length - 1] : f[0]).focus());
        if (e.shiftKey && act === f[0]) return manejar(() => f[f.length - 1].focus());
        if (!e.shiftKey && act === f[f.length - 1]) return manejar(() => f[0].focus());
        return;
      }
      if (e.key === "Escape") return manejar(onSaltar);
      if (editable) return;
      if (e.key === "ArrowRight") return manejar(onSiguiente);
      if (e.key === "Enter" && !interactivo) return manejar(onSiguiente);
      if (e.key === "ArrowLeft") return manejar(() => { if (indice > 0 || vivo.current.anteriorEnPrimera) onAnterior(); });
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
    : rect ? posicion(rect, alto)
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", transition: "none" };
  const boton: CSSProperties = { minHeight: 44 };

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-label={x.titulo}
      aria-modal="true"
      tabIndex={-1}
      data-glass=""
      data-variante={variante}
      className="tour-burbuja"
      style={{ ...glass("dense"), ...sitio }}
    >
      <span className="tour-solo-lectores" aria-live="polite">{`Parada ${indice + 1} de ${total}: ${x.titulo}`}</span>
      <ContenidoExplicacion explicacion={x} />
      {p.extra}
      <div className="tour-puntos" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className="tour-punto" data-activo={i === indice} />)}
      </div>
      <div className="tour-acciones">
        <Button variant="outline" style={boton} disabled={indice === 0 && !p.anteriorEnPrimera} onClick={p.onAnterior}>Anterior</Button>
        <Button style={boton} onClick={p.onSiguiente}>{p.etiquetaSiguiente ?? (ultima ? "Terminar" : "Siguiente")}</Button>
        <Button variant="ghost" style={boton} className="tour-saltar" onClick={p.onSaltar}>Saltar recorrido</Button>
      </div>
    </div>
  );
}
