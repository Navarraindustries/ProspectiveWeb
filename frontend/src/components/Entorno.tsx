/* Entorno — imagen de fondo (corte de TC) bajo un velo; solo en oscuro. */

import type { ReactNode } from "react";
import { useMediaQuery } from "../hooks/useEstrecho";
import { useThemeContext } from "../store/theme";

export const ENTORNO_SRC = "/media/entorno/corte-036.webp";


export function Entorno({ dense = false, children }: { dense?: boolean; children?: ReactNode }) {
  const { theme } = useThemeContext();
  const sinTransparencia = useMediaQuery("(prefers-reduced-transparency: reduce)");
  const showImage = theme === "dark" && !sinTransparencia;

  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      {showImage && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
          data-entorno
        >
          <img
            src={ENTORNO_SRC}
            alt=""
            aria-hidden="true"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 40%" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: dense ? "var(--veil-dense)" : "var(--veil)",
            }}
          />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
