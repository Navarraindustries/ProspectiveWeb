/* Tabs — underline tab bar. */

export function Tabs({
  tabs,
  value,
  onChange,
  size = "md",
}: {
  tabs: readonly string[];
  value: string;
  onChange: (tab: string) => void;
  /** `sm` for a second level of tabs nested under another bar: two bars at the
      same weight read as two choices of equal rank, and they are not. */
  size?: "md" | "sm";
}) {
  const sm = size === "sm";
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
      {tabs.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: sm ? "6px 11px" : "8px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: sm ? 12 : 13,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              borderBottom: `${sm ? 1.5 : 2}px solid ${active ? "var(--brand-deep)" : "transparent"}`,
              marginBottom: -1,
              transition: "color var(--dur-fast) var(--ease-out)",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
