/* Avisos del pipeline como pastillas de cristal apiladas: columna centrada en
   la zona libre del visor (recibe `right` de `zonaLibre`). Los errores se
   quedan hasta pulsarlos; los «ok» e «info» se cierran solos a los
   `AUTOCIERRE_MS` (auditoría F3: se quedaban tapando el visor hasta que se
   pulsaban). Los textos y roles (`alert`/`status`) los pone quien avisa. */

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { glide, glideTransition, motion, useReducedMotion } from "../motion";
import { glass } from "../styles/glass";

export interface ToastItem {
  id: string;
  tono: "error" | "ok" | "info";
  texto: ReactNode;
  role: "alert" | "status";
  onClose?: () => void;
}

const ICONO = { error: "STATUS_WARN", ok: "STATUS_OK", info: "INFO" } as const;
const COLOR = {
  error: "var(--destructive)",
  ok: "var(--success)",
  info: "var(--muted-foreground)",
} as const;

export const AUTOCIERRE_MS = 6000;

/** Cierra solo un aviso que no es error; el temporizador es por aviso (id) y
 *  no se reinicia porque cambie el texto o la función de cerrar.
 *
 *  UX-17: con el puntero o el foco encima no se cierra (se cerraba a los 6 s
 *  aunque se estuviera leyendo); al salir vuelve a contar el plazo entero. */
function useAutocierre(items: ToastItem[]) {
  const cerrar = useRef(new Map<string, () => void>());
  const pausados = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());
  for (const t of items) if (t.onClose) cerrar.current.set(t.id, t.onClose);
  const claves = items.filter((t) => t.tono !== "error" && t.onClose).map((t) => t.id).join("|");

  const programar = (id: string) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.set(id, window.setTimeout(() => {
      if (pausados.current.has(id)) return;          // se reprograma al salir
      cerrar.current.get(id)?.();
    }, AUTOCIERRE_MS));
  };

  useEffect(() => {
    if (!claves) return;
    const ids = claves.split("|");
    const mapa = timers.current;   // el mismo Map toda la vida del componente
    ids.forEach(programar);
    return () => ids.forEach((id) => window.clearTimeout(mapa.get(id)));
  }, [claves]);    

  return {
    pausar: (id: string) => { pausados.current.add(id); },
    seguir: (id: string) => {
      if (!pausados.current.delete(id)) return;
      if (claves.split("|").includes(id)) programar(id);
    },
  };
}

export function ToastStack({ items, top, right }: { items: ToastItem[]; top: number; right: number }) {
  const reducido = useReducedMotion();
  const { pausar, seguir } = useAutocierre(items);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute", zIndex: "var(--capa-aviso)", top, left: 0, right,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        pointerEvents: "none",
      }}
    >
      {items.map((t) => (
        <motion.div
          key={t.id}
          role={t.role}
          data-glass
          variants={glide}
          initial="initial"
          animate="animate"
          transition={reducido ? { duration: 0 } : glideTransition}
          onClick={t.onClose}
          onMouseEnter={() => pausar(t.id)}
          onMouseLeave={() => seguir(t.id)}
          onFocus={() => pausar(t.id)}
          onBlur={() => seguir(t.id)}
          style={{
            ...glass("dense"),
            pointerEvents: "auto",
            display: "flex", alignItems: "center", gap: 10,
            maxWidth: "min(560px, calc(100% - 48px))",
            padding: "10px 18px",
            borderRadius: "var(--radius-full)",
            fontSize: 12.5, fontWeight: 600,
            color: t.tono === "error" ? "var(--destructive)" : "var(--foreground)",
            cursor: t.onClose ? "pointer" : "default",
          }}
        >
          <Icon name={ICONO[t.tono]} size={14} color={COLOR[t.tono]} />
          <span style={{ flex: 1, minWidth: 0 }}>{t.texto}</span>
          {t.onClose && (
            <button
              type="button"
              aria-label="Cerrar aviso"
              style={{ background: "transparent", color: "inherit", border: "none", font: "inherit", opacity: 0.7, cursor: "pointer" }}
            >
              ✕
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}
