/* Tabs — pastilla segmentada con un resalte activo que se desliza. */
import { useId } from "react";
import { DUR, EASE, motion } from "../motion";

export function Tabs({
  tabs,
  value,
  onChange,
  size = "md",
}: {
  tabs: readonly string[];
  value: string;
  onChange: (tab: string) => void;
  /** `sm` for a second level of tabs nested under another bar: two bars at the
      same weight read as two choices of equal rank, and they are not. */
  size?: "md" | "sm";
}) {
  const sm = size === "sm";
  // Un layoutId único por instancia: dos barras en pantalla no se roban el resalte.
  const indicatorId = useId();
  return (
    // Con `wrap`: seis pestañas no caben en el panel estrecho, y sin partirse
    // ensanchaban todo el panel y le sacaban una barra horizontal.
    <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: 3, width: "fit-content", maxWidth: "100%", borderRadius: "var(--radius-full)", background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}>
      {tabs.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t)}
            style={{
              position: "relative",
              padding: sm ? "5px 11px" : "7px 14px",
              borderRadius: "var(--radius-full)",
              isolation: "isolate",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: sm ? 12 : 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--primary-foreground)" : "var(--muted-foreground)",
              transition: "color var(--dur-2) var(--ease-out)",
            }}
          >
            {t}
            {active && (
              // El resalte es un único elemento: al cambiar de pestaña viaja
              // de un botón al otro en lugar de apagarse y encenderse.
              <motion.span
                layoutId={indicatorId}
                data-tab-indicator
                transition={{ duration: DUR.estado, ease: EASE }}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: -1,
                  borderRadius: "var(--radius-full)",
                  background: "var(--primary)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
