export interface HudOption { key: string; label: string; title?: string }

/** Corchete invisible: ocupa su sitio sin verse ni leerse. */
const HUECO: React.CSSProperties = { visibility: "hidden" };

/** `PREFIJO ▸ [ ACTIVO ]  OTRO  OTRO` — el grupo de botones del HUD, sin píldoras. */
export function HudToggleGroup({ options, value, onChange, style, label, title, anchoFijo }: {
  options: HudOption[]; value: string; onChange: (key: string) => void; style?: React.CSSProperties;
  /** Prefijo `EJE ▸`: dentro del grupo para que el nivel del HUD lo oculte con los botones. */
  label?: string; title?: string;
  /** Para interruptores sueltos (LOCAL ●/○): apagado reserva el sitio de los
      corchetes, así el botón no cambia de ancho al pulsarlo y la fila no salta
      de línea bajo el ratón (UNI-89). */
  anchoFijo?: boolean;
}) {
  return (
    <div className="hud-toggle" role="group" style={style} title={title}>
      {label && <span className="hud-toggle-label" style={{ color: "var(--hud-text-dim)", fontSize: 11, letterSpacing: ".08em" }}>{label}</span>}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" aria-pressed={on} title={o.title} onClick={() => onChange(o.key)}>
            {on ? `[ ${o.label} ]`
              : anchoFijo ? <><span aria-hidden="true" style={HUECO}>{"[ "}</span>{o.label}<span aria-hidden="true" style={HUECO}>{" ]"}</span></>
              : o.label}
          </button>
        );
      })}
    </div>
  );
}
