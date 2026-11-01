/* Switch — interruptor de cristal que sustituye a los checkbox nativos. */
import { useId, type ReactNode } from "react";
import { useTableta } from "../hooks/useEstrecho";
import { DUR, EASE, motion, useReducedMotion } from "../motion";

export function Switch({
  checked,
  onChange,
  label,
  descripcion,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto visible y nombre accesible. */
  label: ReactNode;
  /** Línea atenuada bajo el rótulo (aria-describedby). */
  descripcion?: ReactNode;
  disabled?: boolean;
}) {
  const tableta = useTableta();
  const reducido = useReducedMotion();
  const idRotulo = useId();
  const idDescripcion = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={idRotulo}
      aria-describedby={descripcion ? idDescripcion : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        minHeight: tableta ? 44 : 36,
        padding: 0,
        border: "none",
        background: "transparent",
        textAlign: "left",
        fontFamily: "var(--font-sans)",
        color: "var(--foreground)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          flex: "none",
          width: 36,
          height: 20,
          borderRadius: "var(--radius-full)",
          background: checked ? "var(--primary)" : "var(--glass)",
          border: checked ? "1px solid var(--primary)" : "1px solid var(--glass-border)",
          boxSizing: "border-box",
          transition: "background var(--dur-2) var(--ease-out)",
        }}
      >
        <motion.span
          initial={false}
          animate={{ x: checked ? 16 : 0 }}
          transition={{ duration: reducido ? 0 : DUR.estado, ease: EASE }}
          style={{
            position: "absolute",
            top: 1,
            left: 1,
            width: 16,
            height: 16,
            borderRadius: "var(--radius-full)",
            background: checked ? "var(--primary-foreground)" : "var(--foreground)",
          }}
        />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span id={idRotulo} style={{ fontSize: 14 }}>{label}</span>
        {descripcion && (
          <span id={idDescripcion} style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{descripcion}</span>
        )}
      </span>
    </button>
  );
}
