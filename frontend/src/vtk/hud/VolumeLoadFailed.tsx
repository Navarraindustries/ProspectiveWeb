/* La celda del visor cuando la meta del volumen no llega (F1-8).

   Antes un 500 suelto dejaba «CARGANDO…» para siempre: el error se tragaba y
   el rótulo dependía de que hubiera serie, no de que llegara la meta. Tras los
   reintentos automáticos (useVolumeMeta), se dice y se deja repetir. */
export function VolumeLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        position: "absolute", inset: 0, zIndex: 2,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", color: "var(--hud-dim)" }}>
        No se pudo abrir el volumen
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".06em",
          background: "transparent", color: "var(--hud)",
          border: "1px solid currentColor", borderRadius: "var(--radius-sm)",
          padding: "4px 12px", cursor: "pointer", pointerEvents: "auto",
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
