/* ProgressBar — thin bar, determinate (0–100) or indeterminate sweep.
   Con `marca`, el icono de SkullApp late a su izquierda: para las esperas
   largas (segmentar, detectar, extraer la línea central, cargar el DICOM). */

import { LogoIcono } from "./shell/Logo";

export function ProgressBar({ value, marca = false }: { value?: number; marca?: boolean }) {
  if (marca) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoIcono size={18} variante="linea" latido />
        <div style={{ flex: 1, minWidth: 0 }}><ProgressBar value={value} /></div>
      </div>
    );
  }
  const indeterminate = value === undefined;
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      style={{
        position: "relative",
        height: 5,
        borderRadius: 3,
        background: "var(--muted)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          borderRadius: 3,
          background: "var(--primary)",
          width: indeterminate ? "35%" : `${value}%`,
          left: indeterminate ? undefined : 0,
          animation: indeterminate ? "progress-sweep 1.2s var(--ease-in-out) infinite" : undefined,
          transition: indeterminate ? undefined : "width var(--dur-base) var(--ease-out)",
        }}
      />
    </div>
  );
}
