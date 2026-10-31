/* Tabs — barra de pestañas con subrayado que se desliza. */
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
  // Un layoutId único por instancia: dos barras en pantalla no se roban el subrayado.
  const underlineId = useId();
  return (
    // Con `wrap`: seis pestañas no caben en el panel estrecho, y sin partirse
    // ensanchaban todo el panel y le sacaban una barra horizontal.
    <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 2, borderBottom: "1px solid var(--border)" }}>
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
              padding: sm ? "6px 11px" : "8px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: sm ? 12 : 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              marginBottom: -1,
              transition: "color var(--dur-1) var(--ease-out)",
            }}
          >
            {t}
            {active && (
              // El subrayado es un único elemento: al cambiar de pestaña viaja
              // de un botón al otro en lugar de apagarse y encenderse.
              <motion.span
                layoutId={underlineId}
                data-tab-underline
                transition={{ duration: DUR.estado, ease: EASE }}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: sm ? 1.5 : 2,
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
