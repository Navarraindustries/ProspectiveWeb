/* Sheet — right-side drawer with translucent blur panel and 40% scrim.

   Rendered through a portal on <body>: `position: fixed` is resolved against
   the nearest ancestor with a transform, filter or backdrop-filter, not the
   viewport. The topbar is a glass bar (backdrop-filter), so a sheet opened from
   the user menu collapsed to the topbar's 66 px and clipped its own form. */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Las fichas abiertas, de abajo arriba. La ficha del paciente abre encima la
    del caso; con las dos escuchando Escape en `document`, una sola pulsación
    cerraba las dos — y con cambios sin guardar, preguntaba dos veces. Solo la
    de encima atiende la tecla. */
const openSheets: object[] = [];

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  width = 420,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rótulo pequeño encima del título: qué es lo que se abre («Ficha de
   *  paciente») cuando el título es el nombre de lo abierto. */
  eyebrow?: string;
  width?: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closed the user menu but not this, so the only ways out were the ✕
  // and the scrim — and keyboard focus stayed behind on the page underneath.
  // Por ref: el efecto corre solo al abrir y cerrar. Dependiendo de `onClose`
  // (una flecha nueva en cada render del padre) se volvía a apilar al teclear,
  // y la ficha de debajo pasaba a ser la de encima.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const token = {};
    openSheets.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openSheets[openSheets.length - 1] === token) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheets.splice(openSheets.indexOf(token), 1);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
      />
      <div
        className="fade-rise"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: "94vw",
          background: "var(--glass)",
          backdropFilter: "blur(var(--glass-blur))",
          borderLeft: "1px solid var(--border)",
          borderRadius: "var(--radius-xl) 0 0 var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            {eyebrow && (
              <span style={{ fontSize: "var(--text-label)", fontWeight: 600, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                {eyebrow}
              </span>
            )}
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "var(--tracking-title)", color: "var(--foreground)" }}>
              {title}
            </span>
          </span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", padding: 6 }}
          >
            <Icon name="STATUS_FAIL" size={15} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
