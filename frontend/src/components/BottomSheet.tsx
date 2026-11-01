/* Hoja inferior del modo estrecho (≤ 1280 px): comportamiento de las tres
   alturas, sin elemento propio. RightPanelColumn lo aplica a su único
   contenedor, de modo que el cuerpo del panel no se desmonta ni se mueve al
   cruzar 1280 px (conserva foco, scroll y lo escrito). */

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useReducedMotion } from "../motion";
import { glass } from "../styles/glass";
import { BANDA_SUPERIOR, HOJA_ASOMAR } from "../pipeline/zonaLibre";

export type AlturaHoja = "asomar" | "media" | "completa";

export const ORDEN_HOJA: AlturaHoja[] = ["asomar", "media", "completa"];
/** Capa de la hoja; el dock y la banda de avisos van por encima para seguir al alcance. */
export const Z_HOJA = 4;
export const Z_SOBRE_HOJA = 6;

const CSS_ALTO: Record<AlturaHoja, string> = {
  asomar: `${HOJA_ASOMAR}px`,
  media: "50%",
  completa: `calc(100% - ${BANDA_SUPERIOR}px)`,
};
const UMBRAL_ARRASTRE = 4; // px: menos que esto es un clic, no un arrastre
// Controles que usan las flechas o Esc por su cuenta: la hoja no se las quita.
const PROPIOS = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[role=slider],[role=listbox],[role=menu],[role=combobox]';

export function useHojaInferior({ activa, altura, onAltura }: {
  activa: boolean; altura: AlturaHoja; onAltura: (a: AlturaHoja) => void;
}) {
  const reducido = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const arrastre = useRef<{ y0: number; alto0: number; movido: boolean; vivo: number } | null>(null);
  const tragaClic = useRef(false); // el clic que sigue a un arrastre no cuenta
  const transicion = reducido ? "none" : "height var(--dur-3) var(--ease-out)";

  // Teclado nativo en el contenedor: llega desde cualquier control del cuerpo.
  useEffect(() => {
    const el = ref.current;
    if (!activa || !el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest(PROPIOS)) return;
      const i = ORDEN_HOJA.indexOf(altura);
      if (e.key === "ArrowUp" && i < ORDEN_HOJA.length - 1) { e.preventDefault(); onAltura(ORDEN_HOJA[i + 1]); }
      else if (e.key === "ArrowDown" && i > 0) { e.preventDefault(); onAltura(ORDEN_HOJA[i - 1]); }
      // Asomada, Esc no es de la hoja: sigue su camino (cancelar el marcado, el cine).
      else if (e.key === "Escape" && altura !== "asomar") { e.preventDefault(); onAltura("asomar"); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [activa, altura, onAltura]);

  const alturasPx = (): number[] => {
    const total = ref.current?.parentElement?.clientHeight ?? 0;
    return [HOJA_ASOMAR, total / 2, Math.max(HOJA_ASOMAR, total - BANDA_SUPERIOR)];
  };
  const soltar = (el: HTMLElement, a: AlturaHoja) => {
    el.style.transition = transicion;
    el.style.height = CSS_ALTO[a];
  };

  const tirador = {
    onClick: () => {
      if (tragaClic.current) { tragaClic.current = false; return; }
      onAltura(ORDEN_HOJA[(ORDEN_HOJA.indexOf(altura) + 1) % ORDEN_HOJA.length]);
    },
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      tragaClic.current = false;
      const alto0 = ref.current?.offsetHeight ?? HOJA_ASOMAR;
      arrastre.current = { y0: e.clientY, alto0, movido: false, vivo: alto0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const a = arrastre.current, el = ref.current;
      if (!a || !el) return;
      const dy = a.y0 - e.clientY;
      if (!a.movido && Math.abs(dy) < UMBRAL_ARRASTRE) return;
      if (!a.movido) el.style.transition = "none";
      a.movido = true;
      const [min, , max] = alturasPx();
      a.vivo = Math.min(max, Math.max(min, a.alto0 + dy));
      el.style.height = `${a.vivo}px`; // el alto en vivo no pasa por el estado
    },
    onPointerUp: () => {
      const a = arrastre.current, el = ref.current;
      arrastre.current = null;
      if (!a?.movido || !el) return;
      tragaClic.current = true;
      const px = alturasPx();
      const i = px.reduce((m, h, k) => (Math.abs(h - a.vivo) < Math.abs(px[m] - a.vivo) ? k : m), 0);
      soltar(el, ORDEN_HOJA[i]);
      onAltura(ORDEN_HOJA[i]);
    },
    onPointerCancel: () => {
      const a = arrastre.current, el = ref.current;
      arrastre.current = null;
      if (a?.movido && el) soltar(el, altura); // vuelve a donde estaba; no hay clic que tragar
    },
  };

  const style: CSSProperties = {
    ...glass("viewer"),
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: Z_HOJA,
    height: CSS_ALTO[altura],
    borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
    display: "flex", flexDirection: "column", overflow: "hidden", outline: "none",
    transition: transicion,
  };
  return { ref, style, tirador };
}

/** El tirador de la hoja: una barra sobre el contenido. */
export function Tirador({ props }: { props: ReturnType<typeof useHojaInferior>["tirador"] }) {
  return (
    <button
      type="button"
      aria-label="Cambiar la altura del panel"
      {...props}
      style={{
        flex: "none", height: 24, border: "none", background: "transparent", cursor: "grab",
        display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none",
      }}
    >
      <span aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: "var(--muted-foreground)", opacity: 0.6 }} />
    </button>
  );
}
