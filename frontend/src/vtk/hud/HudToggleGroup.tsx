export interface HudOption { key: string; label: string; title?: string }

/** `[ ACTIVO ]  OTRO  OTRO` — el grupo de botones del HUD, sin píldoras. */
export function HudToggleGroup({ options, value, onChange, style }: {
  options: HudOption[]; value: string; onChange: (key: string) => void; style?: React.CSSProperties;
}) {
  return (
    <div className="hud-toggle" role="group" style={style}>
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
