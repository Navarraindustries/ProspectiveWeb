/* Hoja inferior del modo estrecho (≤ 1280 px): aloja el panel del paso con tres
   alturas. El contenido nunca se desmonta al cambiar de altura. */

import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "../motion";
import { glass } from "../styles/glass";
import { BANDA_SUPERIOR, HOJA_ASOMAR } from "../pipeline/zonaLibre";

export type AlturaHoja = "asomar" | "media" | "completa";

const ORDEN: AlturaHoja[] = ["asomar", "media", "completa"];
const CSS_ALTO: Record<AlturaHoja, string> = {
  asomar: `${HOJA_ASOMAR}px`,
  media: "50%",
  completa: `calc(100% - ${BANDA_SUPERIOR}px)`,
};
const UMBRAL_ARRASTRE = 4; // px: menos que esto es un clic, no un arrastre

const esCampo = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function BottomSheet({ altura, onAltura, titulo, children }: {
  altura: AlturaHoja; onAltura: (a: AlturaHoja) => void; titulo: string; children: ReactNode;
}) {
  const reducido = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const arrastre = useRef<{ y0: number; alto0: number; movido: boolean } | null>(null);
  const acabaDeArrastrar = useRef(false); // el clic que sigue a un arrastre no cuenta
  const [vivo, setVivo] = useState<number | null>(null); // alto en px mientras se arrastra

  const mover = (delta: 1 | -1) => {
    const i = ORDEN.indexOf(altura) + delta;
    onAltura(ORDEN[Math.min(ORDEN.length - 1, Math.max(0, i))]);
  };

  const alturasPx = (): number[] => {
    const total = ref.current?.parentElement?.clientHeight ?? 0;
    return [HOJA_ASOMAR, total / 2, Math.max(HOJA_ASOMAR, total - BANDA_SUPERIOR)];
  };

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    acabaDeArrastrar.current = false;
    arrastre.current = { y0: e.clientY, alto0: ref.current?.offsetHeight ?? HOJA_ASOMAR, movido: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dy = a.y0 - e.clientY;
    if (!a.movido && Math.abs(dy) < UMBRAL_ARRASTRE) return;
    a.movido = true;
    const [min, , max] = alturasPx();
    setVivo(Math.min(max, Math.max(min, a.alto0 + dy)));
  };
  const onUp = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a?.movido || vivo === null) { setVivo(null); return; }
    acabaDeArrastrar.current = true;
    const cercana = alturasPx().reduce((m, h, i, v) => (Math.abs(h - vivo) < Math.abs(v[m] - vivo) ? i : m), 0);
    setVivo(null);
    onAltura(ORDEN[cercana]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (esCampo(e.target)) return;
    if (e.key === "ArrowUp") { e.preventDefault(); mover(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); mover(-1); }
    else if (e.key === "Escape") { e.preventDefault(); onAltura("asomar"); }
  };

  return (
    <section
      ref={ref}
      aria-label={titulo}
      data-glass
      data-hoja={altura}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        ...glass("viewer"),
        position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4,
        height: vivo !== null ? `${vivo}px` : CSS_ALTO[altura],
        borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
        display: "flex", flexDirection: "column", overflow: "hidden", outline: "none",
        transition: reducido || vivo !== null ? "none" : "height var(--dur-3) var(--ease-out)",
      }}
    >
      <button
        type="button"
        aria-label="Cambiar la altura del panel"
        onClick={() => {
          if (acabaDeArrastrar.current) { acabaDeArrastrar.current = false; return; }
          onAltura(ORDEN[(ORDEN.indexOf(altura) + 1) % ORDEN.length]);
        }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{
          flex: "none", height: 24, border: "none", background: "transparent", cursor: "grab",
          display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none",
        }}
      >
        <span aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: "var(--muted-foreground)", opacity: 0.6 }} />
      </button>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </section>
  );
}
