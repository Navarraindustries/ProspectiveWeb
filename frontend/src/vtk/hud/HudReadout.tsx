export function HudReadout({ at, lines, tone }: { at: "tl" | "tr" | "bl" | "br"; lines: string[]; tone?: "warn" | "err" }) {
  return (
    <div className={`hud-readout ${at}${tone ? ` hud-${tone}` : ""}`}>{lines.join("\n")}</div>
  );
}
