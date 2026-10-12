/* ConfirmDialog — modal de confirmación con teclado.

   Las confirmaciones de borrado y la de salida estaban escritas tres veces, y
   ninguna escuchaba Escape ni movía el foco: el teclado se quedaba en la página
   de debajo y la única salida era el ratón. */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Paints the confirm action as a destructive one (borrados, salir sin guardar). */
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape siempre cancela. Se escucha en `window` en fase de captura y se
      // corta ahí: escuchando en `document`, la ficha de debajo (Sheet) y los
      // atajos del visor también recibían el mismo Escape, y cancelar «¿Descartar
      // los cambios?» cerraba la ficha que se quería conservar.
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onCancel(); return; }
      if (e.key !== "Enter") return;
      e.stopPropagation();
      e.preventDefault();
      // F1-58: Intro no confirma un borrado. Un Intro de más, pensado para el
      // campo de debajo, borraba un paciente con sus sesiones; lo destructivo
      // se confirma solo con el botón. Lo demás sigue aceptando Intro.
      if (!destructive && !busy) onConfirm();
    };
    window.addEventListener("keydown", onKey, true);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [open, busy, destructive, onCancel, onConfirm]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ outline: "none", width: 420, maxWidth: "90%", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: "22px 24px" }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.55 }}>
          {children}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
