/* Button — 6 variantes (default, outline, secondary, ghost, destructive, link),
   tamaños sm/md/lg/icon con alturas de los tokens de control.

   El primario lleva una sombra con desplazamiento (--shadow-primary), no un
   halo; el prensado (escala 0.98) viene del módulo de movimiento. Las
   propiedades de layout del llamador se aplican al propio botón. */

import { useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { motion, pressable } from "../motion";

type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type Size = "sm" | "md" | "lg" | "icon";

/* motion.button define sus propios tipos para arrastre y animación; se quitan
   de los atributos HTML para que el esparcido de `rest` no choque. */
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"
>;

export interface ButtonProps extends NativeButtonProps {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const HEIGHTS: Record<Size, string> = {
  sm: "var(--control-sm)",
  md: "var(--control-md)",
  lg: "var(--control-lg)",
  icon: "var(--control-md)",
};

function variantStyle(v: Variant, hover: boolean, disabled: boolean): CSSProperties {
  const base: CSSProperties = { border: "1px solid transparent" };
  const on = hover && !disabled;
  switch (v) {
    case "default":
      return {
        ...base,
        background: on ? "var(--primary-hover)" : "var(--primary)",
        color: "var(--primary-foreground)",
        boxShadow: disabled ? undefined : "var(--shadow-primary)",
      };
    case "outline":
      return {
        ...base,
        background: on ? "var(--accent)" : "transparent",
        color: on ? "var(--accent-foreground)" : "var(--foreground)",
        border: "1px solid var(--border)",
      };
    case "secondary":
      return {
        ...base,
        background: on ? "var(--accent)" : "var(--card)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
      };
    case "ghost":
      return {
        ...base,
        background: on ? "var(--accent)" : "transparent",
        color: on ? "var(--accent-foreground)" : "var(--foreground)",
      };
    case "destructive":
      return {
        ...base,
        background: on ? "var(--destructive)" : "transparent",
        color: on ? "var(--destructive-foreground)" : "var(--destructive)",
        border: "1px solid color-mix(in srgb, var(--destructive) 35%, transparent)",
      };
    case "link":
      return {
        ...base,
        background: "transparent",
        color: "var(--data)",
        textDecoration: on ? "underline" : "none",
        height: "auto",
        padding: 0,
        // El contorno de foco sigue el radio del elemento; sin él, el del enlace sería recto.
        borderRadius: "var(--radius-sm)",
      };
  }
}

export function Button({
  variant = "default",
  size = "md",
  leadingIcon,
  trailingIcon,
  children,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <motion.button
      {...(disabled ? {} : pressable)}
      {...rest}
      whileHover={variant === "default" && !disabled ? { y: -1 } : undefined}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onMouseEnter={(e) => { setHover(true); rest.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); rest.onMouseLeave?.(e); }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: HEIGHTS[size],
        padding: size === "icon" ? 0 : size === "sm" ? "0 12px" : size === "lg" ? "0 22px" : "0 16px",
        width: size === "icon" ? HEIGHTS[size] : undefined,
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-sans)",
        fontSize: size === "sm" ? 13 : 14,
        fontWeight: variant === "default" || variant === "destructive" ? 600 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition:
          "background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out)",
        ...variantStyle(variant, hover, !!disabled),
        ...style,
      }}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </motion.button>
  );
}
