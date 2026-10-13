/* Input — labelled text field with optional leading icon, hint and invalid state. */

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

// Los manejadores se tipan como los de <input>: los consumidores existentes no cambian
// y, con multiline, el mismo manejador recibe el evento del <textarea> (mismo value).
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renderiza un <textarea> (mínimo 3 filas) con la misma etiqueta, pista y estado. */
  multiline?: boolean;
  label?: string;
  icon?: ReactNode;
  hint?: string;
  invalid?: boolean;
}

export function Input({ label, icon, hint, invalid, multiline, style, ...rest }: InputProps) {
  const id = useId();
  // aria-invalid solo cuando el llamador lo pide: un campo vacío no nace en rojo (F2-63).
  // El anillo de foco lo dibuja el propio campo con el :focus-visible global (base.css):
  // un solo mecanismo, y solo con teclado.
  const common = {
    id,
    ...(invalid ? { "aria-invalid": true as const } : {}),
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      background: "transparent",
      color: "var(--foreground)",
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      ...(multiline ? { resize: "vertical" as const, minHeight: 68, lineHeight: 1.45 } : {}),
      ...style,
    },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {label && (
        <label
          htmlFor={id}
          style={{ fontSize: "var(--text-label)", fontWeight: 600, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--muted-foreground)" }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          ...(multiline ? { minHeight: 84, padding: "8px 12px", alignItems: "flex-start" } : { height: "var(--control-md)", padding: "0 12px", alignItems: "center" }),
          borderRadius: "var(--radius-md)",
          background: "var(--background)",
          border: `1px solid ${invalid ? "var(--destructive)" : "var(--input)"}`,
          boxShadow: "var(--shadow-xs)",
        }}
      >
        {icon && <span style={{ color: "var(--muted-foreground)", display: "flex" }}>{icon}</span>}
        {multiline ? (
          <textarea
            rows={3}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            {...common}
          />
        ) : (
          <input
            {...rest}
            {...common}
          />
        )}
      </div>
      {hint && <span style={{ fontSize: 12, color: invalid ? "var(--destructive)" : "var(--muted-foreground)" }}>{hint}</span>}
    </div>
  );
}
