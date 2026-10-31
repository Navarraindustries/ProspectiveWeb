/* Sheet — hoja lateral derecha, sólida, que entra deslizando desde el borde.

   Panel opaco (`--card`) con sombra de hoja y un velo del color del lienzo
   detrás. Al abrir enfoca el primer campo del contenido (o el panel); el pie
   opcional queda fijo abajo y el cuerpo es lo que desplaza.

   Se pinta en un portal sobre <body>: `position: fixed` se resuelve contra el
   ancestro más cercano con transform, filter o backdrop-filter, no contra el
   viewport. La barra superior es de cristal (backdrop-filter), así que una hoja
   abierta desde el menú de usuario se encogía a los 66 px de la barra y
   recortaba su propio formulario. */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { AnimatePresence, motion, scrimFade, sheetSlide, sheetTransition, useReducedMotion } from "../motion";
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
  width = 460,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rótulo pequeño encima del título: qué es lo que se abre («Ficha de
   *  paciente») cuando el título es el nombre de lo abierto. */
  eyebrow?: string;
  width?: number;
  /** Pie fijo bajo el cuerpo desplazable (acciones de la hoja). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : sheetTransition;

  // Escape closed the user menu but not this, so the only ways out were the ✕
  // and the scrim — and keyboard focus stayed behind on the page underneath.
  // Por ref: el efecto corre solo al abrir y cerrar. Dependiendo de `onClose`
  // (una flecha nueva en cada render del padre) se volvía a apilar al teclear,
  // y la ficha de debajo pasaba a ser la de encima.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // El velo sigue en pantalla los 480 ms de la salida: un clic ahí no debe cerrar otra vez.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!open) return;
    const token = {};
    openSheets.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openSheets[openSheets.length - 1] === token) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]):not([aria-label="Cerrar"])',
    );
    (first ?? panelRef.current)?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheets.splice(openSheets.indexOf(token), 1);
      previous?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
          <motion.div
            variants={scrimFade}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
            onClick={() => { if (openRef.current) onClose(); }}
            style={{ position: "absolute", inset: 0, background: "color-mix(in srgb, var(--canvas) 55%, transparent)" }}
          />
          <motion.div
            ref={panelRef}
            variants={sheetSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
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
              background: "var(--card)",
              borderLeft: "1px solid var(--border)",
              borderRadius: 0,
              boxShadow: "var(--shadow-sheet)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                {eyebrow && (
                  <span style={{ fontSize: "var(--text-label)", fontWeight: "var(--weight-label)", color: "var(--muted-foreground)" }}>
                    {eyebrow}
                  </span>
                )}
                <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "var(--tracking-title)", color: "var(--foreground)" }}>
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
            {footer && (
              <div data-sheet-footer style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
