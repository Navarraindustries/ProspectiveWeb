/* Dock de pasos del flujo de planificación: pastilla de cristal flotando sobre el visor,
   un botón redondo por paso, con ampliación suave bajo el puntero (estilo dock). */

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../Icon";
import { motion, useReducedMotion } from "../../motion";
import { openCommandPalette } from "../../lib/commands";
import { glass } from "../../styles/glass";
import type { PipelineStep } from "../../pipeline/steps";

export type ModoDock = "completo" | "compacto" | "tactil" | "mini";

interface Props {
  steps: PipelineStep[];
  activeIndex: number;
  /** Motivo por el que un paso está bloqueado, o null si se puede abrir. */
  missingFor: (i: number) => string | null;
  /** Si el paso tiene resultado (aunque vaya después del actual). */
  doneFor?: (i: number) => boolean;
  /** Aviso de lo que hará abrir el paso (tooltip y nombre accesible). */
  avisoFor?: (i: number) => string | null;
  onGo: (i: number) => void;
  /** Disposición por pantalla: completo (44 px con ampliación), compacto (36 px, L5),
      tactil (44 px sin ampliación) o mini (anterior · píldora · siguiente, móvil). */
  modo?: ModoDock;
  /** Distancia al borde inferior (por defecto 20); en modo estrecho va sobre la hoja. */
  abajo?: number | string;
  /** Capa del dock; en modo estrecho va sobre la hoja inferior. */
  zIndex?: number;
}

const ALCANCE = 120; // px de distancia horizontal a partir de la cual no hay ampliación
const AMPLIACION_MAX = 0.25;

export function StepDock({ steps, activeIndex, missingFor, doneFor, avisoFor, onGo, modo = "completo", abajo = 20, zIndex = 3 }: Props) {
  const reducido = useReducedMotion();
  const compacto = modo === "compacto";
  const ampliar = !reducido && modo === "completo";
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
  const left = modo === "mini" ? 12 : 24;
  const posicion = { position: "absolute", left, bottom: abajo, zIndex } as const;

  if (modo === "mini") {
    const act = steps[activeIndex];
    const sig = activeIndex + 1 < steps.length ? activeIndex + 1 : null;
    const ant = activeIndex > 0 ? activeIndex - 1 : null;
    const rotulo = (i: number) => `${steps[i].label}${steps[i].optional ? " (opcional)" : ""}`;
    const motivoSig = sig === null ? null : missingFor(sig);
    const avisoSig = sig === null || motivoSig ? null : (avisoFor?.(sig) ?? null);
    const nombreSig = sig === null
      ? "Último paso"
      : motivoSig ? `Paso siguiente: ${rotulo(sig)} — ${motivoSig}`
      : `Paso siguiente: ${rotulo(sig)}${avisoSig ? `. ${avisoSig}` : ""}`;
    const sigBloqueado = sig === null || !!motivoSig;
    const botonLado = {
      width: 44, height: 44, borderRadius: "50%", flexShrink: 0, padding: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--glass-border)", background: "var(--glass-hover)", color: "var(--foreground)",
    } as const;
    return (
      <nav
        aria-label="Flujo de planificación"
        data-glass
        data-modo="mini"
        style={{
          ...glass("viewer"), ...posicion,
          display: "flex", alignItems: "center", gap: 8,
          padding: 8, borderRadius: "var(--radius-xl)",
        }}
      >
        <button
          type="button"
          disabled={ant === null}
          aria-label={ant === null ? "Primer paso" : `Paso anterior: ${rotulo(ant)}`}
          title={ant === null ? "Primer paso" : `Paso anterior: ${rotulo(ant)}`}
          onClick={() => ant !== null && onGo(ant)}
          style={{ ...botonLado, cursor: ant === null ? "not-allowed" : "pointer", opacity: ant === null ? 0.4 : 1 }}
        >
          <Icon name="BACK" size={18} />
        </button>
        <button
          type="button"
          aria-label={`Paso ${activeIndex + 1} de ${steps.length}, ${rotulo(activeIndex)}. Ver todos los pasos`}
          onClick={() => openCommandPalette()}
          style={{
            height: 44, padding: "0 14px", borderRadius: "var(--radius-full)", border: "1px solid transparent",
            background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer",
            fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center",
          }}
        >
          <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeIndex + 1}/{steps.length} · {act.label}
          </span>
        </button>
        <button
          type="button"
          aria-disabled={sigBloqueado ? "true" : undefined}
          aria-label={nombreSig}
          title={sig === null ? "Último paso" : (motivoSig ?? (avisoSig ? `${rotulo(sig)} — ${avisoSig}` : rotulo(sig)))}
          onClick={() => !sigBloqueado && onGo(sig)}
          style={{ ...botonLado, cursor: sigBloqueado ? "not-allowed" : "pointer", opacity: sigBloqueado ? 0.4 : 1 }}
        >
          <Icon name="ARROW_RIGHT" size={18} />
        </button>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Flujo de planificación"
      data-glass
      data-modo={modo}
      onPointerMove={onMove}
      onPointerLeave={() => setEscalas([])}
      title={`Atajos: 1–${steps.length} para cambiar de paso · Esc cancela el marcado`}
      style={{
        ...glass("viewer"),
        ...posicion,
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
        const done = !active && !locked && (doneFor?.(i) === true || i < consecutivos);
        const aviso = locked ? null : (avisoFor?.(i) ?? null);
        const nombre = `${s.label}${s.optional ? " (opcional)" : ""}`;
        const estado = active ? "activo" : locked ? "bloqueado" : done ? "hecho" : "pendiente";
        const escala = ampliar ? Math.round((escalas[i] ?? 1) * 1000) / 1000 : 1;
        const lado = active && modo === "completo" ? 60 : base;
        return (
          <div key={s.key} style={{ position: "relative", display: "flex" }}>
            {active && modo === "completo" && (
              <span
                aria-hidden
                data-glass
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
              aria-label={locked ? `Paso ${i + 1}, ${nombre} — ${missing}` : `Paso ${i + 1}, ${nombre}${aviso ? `. ${aviso}` : ""}`}
              title={locked ? (missing ?? s.label) : aviso ? `${nombre} — ${aviso}` : nombre}
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
