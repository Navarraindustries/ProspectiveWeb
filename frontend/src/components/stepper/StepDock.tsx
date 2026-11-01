/* Dock de pasos del flujo de planificación: pastilla de cristal flotando sobre el visor,
   un botón redondo por paso, con ampliación suave bajo el puntero (estilo dock). */

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../Icon";
import { motion, useReducedMotion } from "../../motion";
import { openCommandPalette } from "../../lib/commands";
import { glass } from "../../styles/glass";
import type { PipelineStep } from "../../pipeline/steps";

interface Props {
  steps: PipelineStep[];
  activeIndex: number;
  /** Motivo por el que un paso está bloqueado, o null si se puede abrir. */
  missingFor: (i: number) => string | null;
  onGo: (i: number) => void;
  /** Modo estrecho: botones de 36 px solo con número y sin ampliación. */
  compacto?: boolean;
  /** Distancia al borde inferior (por defecto 20); en modo estrecho va sobre la hoja. */
  abajo?: number | string;
  /** Capa del dock; en modo estrecho va sobre la hoja inferior. */
  zIndex?: number;
}

const ALCANCE = 120; // px de distancia horizontal a partir de la cual no hay ampliación
const AMPLIACION_MAX = 0.25;

export function StepDock({ steps, activeIndex, missingFor, onGo, compacto = false, abajo = 20, zIndex = 3 }: Props) {
  const reducido = useReducedMotion();
  const ampliar = !reducido && !compacto;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [escalas, setEscalas] = useState<number[]>([]);

  // Completados consecutivos desde el paso 0; se corta en el primero que no lo está.
  let consecutivos = 0;
  while (consecutivos < steps.length && consecutivos < activeIndex && missingFor(consecutivos) === null) {
    consecutivos++;
  }

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!ampliar) return;
    setEscalas(steps.map((_, i) => {
      const r = refs.current[i]?.getBoundingClientRect();
      if (!r) return 1;
      const dx = Math.abs(e.clientX - (r.left + r.width / 2));
      return 1 + AMPLIACION_MAX * Math.max(0, 1 - dx / ALCANCE);
    }));
  };

  const base = compacto ? 36 : 44;

  return (
    <nav
      aria-label="Flujo de planificación"
      data-glass
      onPointerMove={onMove}
      onPointerLeave={() => setEscalas([])}
      title={`Atajos: 1–${steps.length} para cambiar de paso · Esc cancela el marcado`}
      style={{
        ...glass("viewer"),
        position: "absolute", left: 24, bottom: abajo, zIndex,
        display: "flex", alignItems: "center", gap: 8,
        padding: 8, borderRadius: "var(--radius-xl)",
      }}
    >
      {steps.map((s, i) => {
        const active = i === activeIndex;
        const missing = missingFor(i);
        // Nunca se bloquea el paso donde está el usuario: una sesión reanudada
        // con la reproducción vacía quedaría atrapada.
        const locked = !active && !!missing;
        const done = !missing && i < consecutivos;
        const estado = active ? "activo" : locked ? "bloqueado" : done ? "hecho" : "pendiente";
        const escala = ampliar ? Math.round((escalas[i] ?? 1) * 1000) / 1000 : 1;
        const lado = active && !compacto ? 60 : base;
        return (
          <div key={s.key} style={{ position: "relative", display: "flex" }}>
            {active && !compacto && (
              <span
                aria-hidden
                style={{
                  position: "absolute", bottom: "calc(100% + 14px)", left: "50%", transform: "translateX(-50%)",
                  whiteSpace: "nowrap", padding: "4px 10px", borderRadius: "var(--radius-full)",
                  ...glass("viewer"), fontSize: 12, fontWeight: 600, color: "var(--foreground)", pointerEvents: "none",
                }}
              >
                {i + 1} · {s.label}
              </span>
            )}
            <motion.button
              ref={(el: HTMLButtonElement | null) => { refs.current[i] = el; }}
              type="button"
              data-estado={estado}
              data-escala={escala}
              aria-current={active ? "step" : undefined}
              aria-disabled={locked ? "true" : undefined}
              aria-label={locked ? `Paso ${i + 1}, ${s.label}${s.optional ? " (opcional)" : ""} — ${missing}` : `Paso ${i + 1}, ${s.label}${s.optional ? " (opcional)" : ""}`}
              title={locked ? (missing ?? s.label) : `${s.label}${s.optional ? " (opcional)" : ""}`}
              onClick={() => !locked && onGo(i)}
              animate={{ scale: escala }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              style={{
                width: lado, height: lado, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid " + (active ? "transparent" : "var(--glass-border)"),
                fontFamily: "var(--font-mono)", fontSize: active ? 18 : 14, fontWeight: 700,
                cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.4 : 1,
                background: active ? "var(--primary)" : done ? "var(--success-bg)" : "var(--glass-hover)",
                color: active ? "var(--primary-foreground)" : done ? "var(--success)" : "var(--foreground)",
              }}
            >
              {done ? <Icon name="STATUS_OK" size={compacto ? 14 : 18} /> : i + 1}
            </motion.button>
          </div>
        );
      })}
      <span aria-hidden style={{ width: 1, alignSelf: "stretch", margin: "6px 2px", background: "var(--glass-border)" }} />
      <button
        type="button"
        aria-label="Abrir la paleta de mandos (Ctrl+K)"
        title="Paleta de mandos (Ctrl+K)"
        onClick={() => openCommandPalette()}
        style={{
          height: base, padding: "0 12px", borderRadius: "var(--radius-full)", border: "1px solid var(--glass-border)",
          background: "transparent", color: "var(--muted-foreground)", cursor: "pointer",
          fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
        }}
      >
        ⌘K
      </button>
    </nav>
  );
}
