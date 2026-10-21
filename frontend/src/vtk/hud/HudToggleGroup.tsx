export interface HudOption { key: string; label: string; title?: string }

/** `PREFIJO ▸ [ ACTIVO ]  OTRO  OTRO` — el grupo de botones del HUD, sin píldoras. */
export function HudToggleGroup({ options, value, onChange, style, label, title }: {
  options: HudOption[]; value: string; onChange: (key: string) => void; style?: React.CSSProperties;
  /** Prefijo `EJE ▸`: dentro del grupo para que el nivel del HUD lo oculte con los botones. */
  label?: string; title?: string;
}) {
  return (
    <div className="hud-toggle" role="group" style={style} title={title}>
      {label && <span className="hud-toggle-label" style={{ color: "var(--hud-dim)", fontSize: 11, letterSpacing: ".08em" }}>{label}</span>}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" aria-pressed={on} title={o.title} onClick={() => onChange(o.key)}>
            {on ? `[ ${o.label} ]` : o.label}
          </button>
        );
      })}
    </div>
  );
}
