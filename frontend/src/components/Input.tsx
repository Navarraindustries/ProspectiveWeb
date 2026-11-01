/* Input — labelled text field with optional leading icon, hint and invalid state. */

import { useId, useState } from "react";
import { Icon } from "./Icon";
import type { FocusEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

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
  // El anillo de foco se dibuja en el contorno (no en el campo) mientras el campo tiene el foco.
  const [focused, setFocused] = useState(false);
  const { onFocus, onBlur, ...fieldRest } = rest;
  const common = {
    id,
    onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(true);
      onFocus?.(e as FocusEvent<HTMLInputElement>);
    },
    onBlur: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(false);
      onBlur?.(e as FocusEvent<HTMLInputElement>);
    },
    ...(invalid ? { "aria-invalid": true as const } : {}),
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      background: "transparent",
      color: "var(--foreground)",
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      // Chromium aplica :focus-visible a los campos de texto también con ratón y con focus():
      // sin esto salía un doble anillo (el global de --ring sobre el campo + el del contorno).
      outline: "none",
      ...(multiline ? { resize: "vertical" as const, minHeight: "calc(var(--field-h) * 2)", lineHeight: 1.45 } : {}),
      ...style,
    },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {label && (
        <label
          htmlFor={id}
          style={{ fontSize: "var(--text-label)", fontWeight: "var(--weight-label)", color: "var(--muted-foreground)" }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          ...(multiline ? { minHeight: "calc(var(--field-h) * 2)", padding: "8px 12px", alignItems: "flex-start" } : { height: "var(--field-h)", padding: "0 14px", alignItems: "center" }),
          borderRadius: "var(--radius-md)",
          opacity: rest.disabled ? 0.4 : 1,
          background: "var(--field-bg)",
          border: `1px solid ${invalid ? "var(--destructive)" : focused ? "var(--primary)" : "var(--input)"}`,
          boxShadow: invalid
            ? `0 0 0 3px color-mix(in srgb, var(--destructive) ${focused ? 45 : 22}%, transparent)`
            : focused
              ? "0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent)"
              : "none",
        }}
      >
        {icon && <span style={{ color: "var(--muted-foreground)", display: "flex" }}>{icon}</span>}
        {multiline ? (
          <textarea
            rows={3}
            {...(fieldRest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            {...common}
          />
        ) : (
          <input
            {...fieldRest}
            {...common}
          />
        )}
      </div>
      {hint && invalid && (
        <span
          role="alert"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--destructive-text)" }}
        >
          <Icon name="STATUS_WARN" size={14} />
          {hint}
        </span>
      )}
      {hint && !invalid && <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{hint}</span>}
    </div>
  );
}
