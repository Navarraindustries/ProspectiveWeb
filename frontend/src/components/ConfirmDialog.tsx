/* ConfirmDialog — modal de confirmación con teclado.

   Las confirmaciones de borrado y la de salida estaban escritas tres veces, y
   ninguna escuchaba Escape ni movía el foco: el teclado se quedaba en la página
   de debajo y la única salida era el ratón. */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Button } from "./Button";

/* Cuántos diálogos de confirmación hay abiertos ahora mismo. Los atajos del
   visor y del flujo (vtk/shortcuts) escuchan en `window` y el diálogo solo se
   queda Escape e Intro: sin esto, un segundo Supr con la pregunta de borrar
   delante llegaba al visor y apilaba otra pregunta igual, y P, los dígitos o
   el espacio cambiaban la pantalla de detrás sin que se viera. */
let openDialogs = 0;

/** true mientras haya algún ConfirmDialog abierto: lo de detrás no atiende teclas. */
export function isConfirmDialogOpen(): boolean {
  return openDialogs > 0;
}

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
  extraLabel,
  onExtra,
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
  /** Tercera acción, entre cancelar y confirmar (p. ej. «Guardar y salir»).
   *  Nunca la dispara un Intro suelto: solo su clic, o Intro con el foco en ella. */
  extraLabel?: string;
  onExtra?: () => void;
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
      // Intro sobre un botón del diálogo es pulsar ese botón, sea cual sea: con
      // el foco en «Cancelar» (llegado con Tab), Intro confirmaba igual y
      // firmaba el pedido o daba «sin aneurisma». El clic se lanza aquí a mano
      // porque el preventDefault de arriba (que impide que el Intro llegue a lo
      // de debajo) también anula el clic nativo; un botón deshabilitado no
      // responde a click().
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLButtonElement && panelRef.current?.contains(target)) {
        target.click();
        return;
      }
      // F1-58: Intro no confirma un borrado. Un Intro de más, pensado para el
      // campo de debajo, borraba un paciente con sus sesiones; lo destructivo
      // se confirma solo con su botón (con el foco en él, Intro vale, ver arriba).
      // Lo demás sigue aceptando Intro.
      if (!destructive && !busy) onConfirm();
    };
    openDialogs += 1;
    window.addEventListener("keydown", onKey, true);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      openDialogs -= 1;
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
        style={{ outline: "none", width: 420, maxWidth: "90%", background: "var(--glass)", backdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: "22px 24px" }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.55 }}>
          {children}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          {extraLabel && onExtra && (
            <Button variant="default" onClick={onExtra} disabled={busy}>{extraLabel}</Button>
          )}
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
