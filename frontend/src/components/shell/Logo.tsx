/* Logotipo de PROSPECTIVE: marca «P» blanca sobre cuadrado redondeado del color
   primario. El modo compacto (solo marca) es para la barra lateral plegada. */

export interface LogoProps {
  compact?: boolean;
  size?: number;
}

export function Logo({ compact = false, size = 28 }: LogoProps) {
  const mark = (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false" style={{ flexShrink: 0 }}>
      <rect width="28" height="28" rx="7" fill="var(--primary)" />
      <path
        d="M9.5 21V7h5.2a4.2 4.2 0 010 8.4H9.5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  if (compact) return mark;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 15, letterSpacing: "0.04em" }}>
          PROSPECTIVE
        </span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>
          por SkullApp
        </span>
      </span>
    </span>
  );
}
