/* Dock de pasos del flujo de planificación: pastilla de cristal flotando sobre el visor,
   un botón redondo por paso, con ampliación suave bajo el puntero (estilo dock).

   En pantalla táctil (`tactil` y `mini`) no hay puntero que enseñe un `title`:
   un toque en un paso bloqueado dice por qué en una burbuja junto al dock, y un
   toque en un paso con aviso (Morfometría sin medir) enseña el aviso y no
   navega hasta un segundo toque. Con ratón (`completo`, `compacto`) el motivo y
   el aviso siguen en el tooltip y en el nombre accesible. */

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../Icon";
import { AnimatePresence, fundido, fundidoTransition, motion, useReducedMotion } from "../../motion";
import { openCommandPalette } from "../../lib/commands";
import { atajoPaleta, rotuloPaleta, teclasPaleta } from "../../lib/plataforma";
import { glass } from "../../styles/glass";
import { OBJETIVO_TACTIL_PX } from "../../pipeline/puntosCorte";
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
/** Lo que dura la burbuja a la vista si nadie toca nada. */
export const BURBUJA_MS = 3000;

/** La burbuja del modo táctil: el motivo de un bloqueo o el aviso de un paso. */
interface Burbuja {
  texto: string;
  /** Paso al que se refiere; un aviso deja pasar el segundo toque a ese paso. */
  paso: number;
  tipo: "motivo" | "aviso";
}

export function StepDock({ steps, activeIndex, missingFor, doneFor, avisoFor, onGo, modo = "completo", abajo = 20, zIndex = 3 }: Props) {
  const reducido = useReducedMotion();
  const compacto = modo === "compacto";
  const tactil = modo === "tactil" || modo === "mini";
  const ampliar = !reducido && modo === "completo";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const navRef = useRef<HTMLElement | null>(null);
  const [escalas, setEscalas] = useState<number[]>([]);
  const [burbuja, setBurbuja] = useState<Burbuja | null>(null);

  // La burbuja se va sola a los BURBUJA_MS o al tocar fuera del dock (un toque
  // dentro lo resuelve el propio botón: sustituye la burbuja o navega).
  useEffect(() => {
    if (!burbuja) return;
    const t = window.setTimeout(() => setBurbuja(null), BURBUJA_MS);
    const fuera = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setBurbuja(null);
    };
    document.addEventListener("pointerdown", fuera);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", fuera); };
  }, [burbuja]);

  /** Toque en un paso. Con ratón: navega si no está bloqueado. En táctil: un
   *  bloqueado dice su motivo; uno con aviso lo enseña y navega al segundo toque. */
  const pulsar = (i: number, motivo: string | null, aviso: string | null, rotulo: string) => {
    if (!tactil) {
      if (!motivo) onGo(i);
      return;
    }
    if (motivo) {
      setBurbuja({ texto: `${rotulo} — ${motivo}`, paso: i, tipo: "motivo" });
      return;
    }
    if (aviso && !(burbuja?.tipo === "aviso" && burbuja.paso === i)) {
      setBurbuja({ texto: `${rotulo} — ${aviso}. Toca otra vez para abrirlo.`, paso: i, tipo: "aviso" });
      return;
    }
    setBurbuja(null);
    onGo(i);
  };

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

  const base = compacto ? 36 : OBJETIVO_TACTIL_PX;
  const left = modo === "mini" ? 12 : 24;
  const posicion = { position: "absolute", left, bottom: abajo, zIndex } as const;

  // La región `status` existe siempre (un lector anuncia lo que entra en ella);
  // la pastilla de cristal solo cuando hay algo que decir.
  const estiloBurbuja = {
    padding: "8px 12px", borderRadius: "var(--radius-lg)", maxWidth: 300,
    fontSize: 13, lineHeight: 1.4, color: "var(--foreground)",
  } as const;
  const contenidoBurbuja = burbuja && <span data-glass style={{ display: "block", ...glass("viewer"), ...estiloBurbuja }}>{burbuja.texto}</span>;
  const capaBurbuja = tactil && (
    <span
      role="status"
      data-burbuja-dock
      style={{ position: "absolute", left: 0, bottom: "calc(100% + 10px)", pointerEvents: "none", width: "max-content", maxWidth: 300 }}
    >
      {reducido ? contenidoBurbuja : (
        <AnimatePresence>
          {burbuja && (
            <motion.span
              key={`${burbuja.tipo}-${burbuja.paso}`}
              variants={fundido} initial="initial" animate="animate" exit="exit" transition={fundidoTransition}
              style={{ display: "block" }}
            >
              {contenidoBurbuja}
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </span>
  );

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
    // «‹» respeta el bloqueo igual que «›»: en una sesión reanudada el paso
    // anterior puede haberse quedado sin resultado.
    const motivoAnt = ant === null ? null : missingFor(ant);
    const avisoAnt = ant === null || motivoAnt ? null : (avisoFor?.(ant) ?? null);
    const nombreAnt = ant === null
      ? "Primer paso"
      : motivoAnt ? `Paso anterior: ${rotulo(ant)} — ${motivoAnt}`
      : `Paso anterior: ${rotulo(ant)}${avisoAnt ? `. ${avisoAnt}` : ""}`;
    const botonLado = {
      width: OBJETIVO_TACTIL_PX, height: OBJETIVO_TACTIL_PX, borderRadius: "50%", flexShrink: 0, padding: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--glass-border)", background: "var(--glass-hover)", color: "var(--foreground)",
    } as const;
    return (
      <nav
        ref={navRef}
        aria-label="Flujo de planificación"
        data-glass
        data-modo="mini"
        style={{
          ...glass("viewer"), ...posicion,
          display: "flex", alignItems: "center", gap: 8,
          padding: 8, borderRadius: "var(--radius-xl)",
        }}
      >
        {capaBurbuja}
        <button
          type="button"
          disabled={ant === null}
          aria-disabled={motivoAnt ? "true" : undefined}
          aria-label={nombreAnt}
          title={ant === null ? "Primer paso" : (motivoAnt ?? (avisoAnt ? `${rotulo(ant)} — ${avisoAnt}` : rotulo(ant)))}
          onClick={() => ant !== null && pulsar(ant, motivoAnt, avisoAnt, rotulo(ant))}
          style={{ ...botonLado, cursor: ant === null || motivoAnt ? "not-allowed" : "pointer", opacity: ant === null || motivoAnt ? 0.4 : 1 }}
        >
          <Icon name="BACK" size={18} />
        </button>
        <button
          type="button"
          aria-label={`Paso ${activeIndex + 1} de ${steps.length}, ${rotulo(activeIndex)}. Ver todos los pasos`}
          onClick={() => { setBurbuja(null); openCommandPalette(); }}
          style={{
            height: OBJETIVO_TACTIL_PX, padding: "0 14px", borderRadius: "var(--radius-full)", border: "1px solid transparent",
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
          onClick={() => sig !== null && pulsar(sig, motivoSig, avisoSig, rotulo(sig))}
          style={{ ...botonLado, cursor: sigBloqueado ? "not-allowed" : "pointer", opacity: sigBloqueado ? 0.4 : 1 }}
        >
          <Icon name="ARROW_RIGHT" size={18} />
        </button>
      </nav>
    );
  }

  return (
    <nav
      ref={navRef}
      aria-label="Flujo de planificación"
      data-glass
      data-modo={modo}
      onPointerMove={onMove}
      onPointerLeave={() => setEscalas([])}
      title={tactil ? undefined : `Atajos: 1–${steps.length} para cambiar de paso · Esc cancela el marcado`}
      style={{
        ...glass("viewer"),
        ...posicion,
        display: "flex", alignItems: "center", gap: 8,
        padding: 8, borderRadius: "var(--radius-xl)",
      }}
    >
      {capaBurbuja}
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
              onClick={() => pulsar(i, locked ? missing : null, aviso, `Paso ${i + 1}, ${nombre}`)}
              animate={{ scale: escala }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              style={{
                position: "relative",
                width: lado, height: lado, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid " + (active ? "transparent" : "var(--glass-border)"),
                fontFamily: "var(--font-mono)", fontSize: active ? 18 : 14, fontWeight: 700,
                cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.4 : 1,
                background: active ? "var(--primary)" : done ? "var(--success-bg)" : "var(--glass-hover)",
                color: active ? "var(--primary-foreground)" : done ? "var(--success)" : "var(--foreground)",
              }}
            >
              {/* En táctil el hecho conserva su número (sin tooltip, el ✓ solo
                  no dice qué paso es); el ✓ va pequeño en la esquina. */}
              {done && tactil ? (
                <>
                  {i + 1}
                  <span aria-hidden data-marca="hecho" style={{ position: "absolute", top: 1, right: 1, display: "flex" }}>
                    <Icon name="STATUS_OK" size={12} />
                  </span>
                </>
              ) : done ? <Icon name="STATUS_OK" size={compacto ? 14 : 18} /> : i + 1}
            </motion.button>
          </div>
        );
      })}
      {/* En táctil no hay teclado: sin «⌘K» (la paleta se abre con «Más acciones»). */}
      {!tactil && (
        <>
          <span aria-hidden style={{ width: 1, alignSelf: "stretch", margin: "6px 2px", background: "var(--glass-border)" }} />
          <button
            type="button"
            aria-label={rotuloPaleta()}
            aria-keyshortcuts={teclasPaleta()}
            title={`Paleta de mandos (${atajoPaleta()})`}
            onClick={() => openCommandPalette()}
            style={{
              height: base, padding: "0 12px", borderRadius: "var(--radius-full)", border: "1px solid var(--glass-border)",
              background: "transparent", color: "var(--muted-foreground)", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
            }}
          >
            {atajoPaleta()}
          </button>
        </>
      )}
    </nav>
  );
}
