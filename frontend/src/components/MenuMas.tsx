/* MenuMas — botón «⋯» que abre un menú de cristal (patrón «menu button» de WAI-ARIA).

   Genérico: la barra superior lo usa en móvil para las acciones secundarias y
   las filas de tabla lo reutilizarán. El menú vive en un portal sobre el body
   con `position: fixed` calculado desde el botón, alineado a su borde derecho;
   cerca del borde inferior se abre hacia arriba. No hay velo a pantalla
   completa: el cierre por clic fuera escucha el documento, así que no captura
   el puntero cuando el menú está cerrado ni lo bloquea mientras se abre. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { glass } from "../styles/glass";

export interface ItemMenu {
  id: string;
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  /** Se pinta como <a role="menuitem" target="_blank" rel="noreferrer">. */
  href?: string;
  /** data-danger, en --destructive. */
  destructive?: boolean;
  /** aria-disabled: se puede recorrer con el teclado pero no ejecuta. */
  disabled?: boolean;
  /** `onSelect` abre un diálogo o una hoja que toma el foco: no se devuelve al disparador. */
  abreDialogo?: boolean;
  /** Texto de ayuda al pasar el puntero. */
  title?: string;
  separadoAntes?: boolean;
}

const ANCHO_MENU = 224;

export function MenuMas({ items, label = "Más acciones", tactil = false }: {
  items: ItemMenu[];
  label?: string;
  tactil?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ derecha: number; top?: number; bottom?: number; lado: "arriba" | "abajo" } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (r) {
      const estimada = 44 * items.length + 16;
      const arriba = r.bottom + estimada > window.innerHeight;
      const derecha = Math.max(8, window.innerWidth - r.right);
      setPos(arriba
        ? { derecha, bottom: window.innerHeight - r.top + 4, lado: "arriba" }
        : { derecha, top: r.bottom + 4, lado: "abajo" });
    }
    setAbierto(true);
  };

  // Al abrirse, el foco pasa al primer ítem.
  useLayoutEffect(() => {
    if (abierto) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [abierto]);

  // Clic fuera (sin velo) y cambio de tamaño cierran el menú.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || boton.current?.contains(t)) return;
      cerrar(false);
    };
    const alRedimensionar = () => cerrar(false);
    // El menú es fixed: si algo se desplaza, quedaría desalineado con su botón.
    const alDesplazar = (e: Event) => { if (!menu.current?.contains(e.target as Node)) cerrar(false); };
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("resize", alRedimensionar);
    window.addEventListener("scroll", alDesplazar, true);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("scroll", alDesplazar, true);
    };
  }, [abierto, cerrar]);

  const enTeclado = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodos = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = nodos.indexOf(document.activeElement as HTMLElement);
    const ir = (k: number) => { e.preventDefault(); nodos[(k + nodos.length) % nodos.length]?.focus(); };
    switch (e.key) {
      case "ArrowDown": ir(i + 1); break;
      case "ArrowUp": ir(i < 0 ? nodos.length - 1 : i - 1); break;
      case "Home": ir(0); break;
      case "End": ir(nodos.length - 1); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); cerrar(true); break;
      // Sin preventDefault: el Tab sigue su curso desde el disparador.
      case "Tab": cerrar(true); break;
    }
  };

  const alto = tactil ? 44 : 36;
  const estiloItem: CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: `${alto}px`, padding: "0 12px",
    border: "none", borderRadius: "var(--radius-sm)", background: "transparent", color: "inherit",
    font: "inherit", fontSize: 14, textAlign: "left", textDecoration: "none", whiteSpace: "nowrap",
    cursor: "pointer", boxSizing: "border-box",
  };

  const elegir = (it: ItemMenu) => {
    if (it.disabled) return;
    it.onSelect?.();
    cerrar(!it.href && !it.abreDialogo);
  };

  const lado = tactil ? 44 : 32;
  return (
    <>
      <button
        ref={boton}
        type="button"
        className="menu-mas-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar(false) : abrir())}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          width: lado, height: lado, padding: 0, border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-full)", background: "transparent", color: "var(--foreground)", cursor: "pointer",
        }}
      >
        <Icon name="MORE" size={18} />
      </button>
      {abierto && pos && createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          data-glass
          data-lado={pos.lado}
          onKeyDown={enTeclado}
          style={{
            ...glass("dense"),
            position: "fixed", right: pos.derecha, top: pos.top, bottom: pos.bottom,
            width: ANCHO_MENU, maxWidth: "calc(100vw - 16px)", padding: 6, borderRadius: "var(--radius-md)",
            zIndex: 300, boxSizing: "border-box",
          }}
        >
          {items.map((it) => {
            const comunes = {
              role: "menuitem" as const,
              tabIndex: -1,
              "aria-disabled": it.disabled || undefined,
              title: it.title,
              "data-danger": it.destructive ? "true" : undefined,
              style: { ...estiloItem, color: it.destructive ? "var(--destructive)" : "inherit", opacity: it.disabled ? 0.45 : 1, cursor: it.disabled ? "not-allowed" : "pointer" },
            };
            const contenido = (<>{it.icon && <Icon name={it.icon} size={15} />}<span>{it.label}</span></>);
            return (
              <div key={it.id}>
                {it.separadoAntes && <div role="separator" style={{ height: 1, margin: "4px 6px", background: "var(--glass-border)" }} />}
                {it.href ? (
                  <a {...comunes} href={it.disabled ? undefined : it.href} target="_blank" rel="noreferrer" onClick={(e) => { if (it.disabled) e.preventDefault(); else elegir(it); }}>
                    {contenido}
                  </a>
                ) : (
                  <button type="button" {...comunes} onClick={() => elegir(it)}>{contenido}</button>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
