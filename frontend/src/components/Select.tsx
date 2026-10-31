/* Select — combobox nativo con la misma etiqueta que Input (minúscula, 13 px, 500). */

import { useId } from "react";
import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** `disabled`: un separador dentro de la lista («Otros del catálogo»). */
  options: readonly string[] | { value: string; label: string; disabled?: boolean }[];
}

export function Select({ label, options, style, ...rest }: SelectProps) {
  const id = useId();
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
        {...rest}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          width: "100%",
          height: "var(--field-h)",
          padding: "0 40px 0 14px",
          borderRadius: "var(--radius-md)",
          background: "var(--field-bg)",
          border: "1px solid var(--input)",
          color: "var(--foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          cursor: "pointer",
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
