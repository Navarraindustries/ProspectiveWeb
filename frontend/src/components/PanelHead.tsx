/* PanelHead — step panel title + endpoint description + right slot. */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { glass } from "../styles/glass";
import { DUR, EASE, motion, useReducedMotion } from "../motion";
import { Icon } from "./Icon";

export function PanelHead({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--foreground)" }}>
          {title}
        </div>
        {desc && <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 3 }}>{desc}</div>}
      </div>
      {right}
    </div>
  );
}

/* SectionLabel — rótulo de sección en mayúsculas mono (CANDIDATOS, SERIE DETECTADA…) */
export function SectionLabel({ children, style, className }: { children: ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-eyebrow)",
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-eyebrow)",
        color: "var(--muted-foreground)",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* Collapsible — sección plegable con estado recordado por sesión.

   El paso de Morfometría renderiza cuatro paneles seguidos en una columna de
   300–384 px: pasaba de mil píxeles de scroll y las herramientas de línea
   central —de donde sale el stent guiado— quedaban enterradas al fondo. */
export function Collapsible({
  title,
  subtitle,
  storageKey,
  defaultOpen = false,
  badge,
  forceOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Clave de sessionStorage; recuerda si la sección quedó abierta. */
  storageKey: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  /** Al pasar a true abre la sección (p. ej. para enfocar un campo de dentro).
   *  No la cierra al volver a false ni toca lo recordado. */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const reducido = useReducedMotion();
  const [open, setOpen] = useState(() => {
    // sessionStorage puede lanzar (ventana privada, cookies bloqueadas); en ese
    // caso simplemente se usa el valor por defecto.
    try {
      const v = sessionStorage.getItem(storageKey);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { sessionStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* sin persistencia */ }
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "transparent", overflow: "hidden" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "11px 14px", border: "none", background: "transparent",
          cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{title}</span>
          {subtitle && (
            <span className="truncate" style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
              {subtitle}
            </span>
          )}
        </span>
        {badge}
        <motion.span
          data-chevron
          data-abierto={open}
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={reducido ? { duration: 0 } : { duration: DUR.estado, ease: EASE }}
          style={{ color: "var(--muted-foreground)", flexShrink: 0, display: "inline-flex" }}
        >
          <Icon name="CHEVRON_RIGHT" size={14} />
        </motion.span>
      </button>
      {open && <div style={{ padding: "0 14px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ paddingTop: 14 }}>{children}</div>
      </div>}
    </div>
  );
}

/* ErrorNote — inline error box for failed API calls. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        background: "var(--destructive-bg)",
        border: "1px solid var(--destructive-text)",
        color: "var(--destructive-text)",
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

/* Card — superficie de cristal (radio lg); el style del llamador manda. */
export function Card({ children, style, className, onClick }: {
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /** Makes the card selectable (a clip candidate, a row that opens something). */
  onClick?: () => void;
}) {
  return (
    <div
      className={className}
      onClick={onClick}
      data-glass
      style={{
        ...glass("flat"),
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
