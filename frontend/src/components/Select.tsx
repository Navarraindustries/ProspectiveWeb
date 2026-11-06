/* Select — combobox nativo con la misma etiqueta que Input (minúscula, 13 px, 500). */

import { useId, useState } from "react";
import type { FocusEvent, SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Marca el campo en error (borde y anillo destructivos, aria-invalid). */
  invalid?: boolean;
  /** `disabled`: un separador dentro de la lista («Otros del catálogo»). */
  options: readonly string[] | { value: string; label: string; disabled?: boolean }[];
}

export function Select({ label, options, invalid, style, ...rest }: SelectProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const { onFocus, onBlur, ...selectRest } = rest;
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o, disabled: false } : o
  );
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
      <div style={{ position: "relative", display: "flex", minWidth: 0 }}>
        <select
          id={id}
          className="campo-select"
          {...selectRest}
          {...(invalid ? { "aria-invalid": true as const } : {})}
          onFocus={(e: FocusEvent<HTMLSelectElement>) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e: FocusEvent<HTMLSelectElement>) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            width: "100%",
            height: "var(--field-h)",
            padding: "0 40px 0 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--field-bg)",
            border: `1px solid ${invalid ? "var(--destructive)" : focused ? "var(--primary)" : "var(--input)"}`,
            boxShadow: invalid
              ? `0 0 0 3px color-mix(in srgb, var(--destructive) ${focused ? 45 : 22}%, transparent)`
              : focused
                ? "0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent)"
                : "none",
            // Como en Input: el anillo propio sustituye al :focus-visible global.
            outline: "none",
            color: "var(--foreground)",
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            cursor: "pointer",
            opacity: rest.disabled ? 0.4 : 1,
            ...style,
          }}
        >
          {opts.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--muted-foreground)" }}
        >
          <path d="M4 6.5l4 4 4-4" />
        </svg>
      </div>
    </div>
  );
}
