/* Pastillas superiores del pipeline (F4): dos píldoras de cristal flotando
   sobre el visor, sin barra que ocupe ancho. A la izquierda, volver, las migas
   y el riesgo; a la derecha, estado, acciones, ⌘K, tema y usuario. Miden 48 px
   a 16 px del borde: caben en la banda superior (72) y no invaden la zona libre. */

import type { CSSProperties, ReactNode } from "react";
import { Badge, riskVariant } from "../Badge";
import { Icon } from "../Icon";
import { ThemeToggle } from "../ThemeToggle";
import { UserMenu } from "../shell/UserMenu";
import type { Crumb } from "../shell/TopBar";
import { glass } from "../../styles/glass";
import { openCommandPalette } from "../../lib/commands";
import "../shell/shell.css";

const PASTILLA: CSSProperties = {
  position: "absolute",
  top: 16,
  height: 48,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 12px",
  borderRadius: "var(--radius-full)",
  boxShadow: "var(--glass-highlight)",
  maxWidth: "calc(100% - 48px)",
};

export function QuirofanoBar({ crumbs, onBack, riskLabel, status, actions }: {
  crumbs: Crumb[];
  onBack: () => void;
  riskLabel?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <div style={{ ...glass("normal"), ...PASTILLA, left: 24, minWidth: 0 }} data-glass>
        <button
          type="button"
          aria-label="Volver a Pacientes"
          title="Volver a Pacientes"
          onClick={onBack}
          className="shell-cmdk"
          style={{ width: "var(--control-sm)", padding: 0, flexShrink: 0 }}
        >
          <Icon name="BACK" size={14} />
        </button>
        {crumbs.length > 0 && (
          <nav aria-label="Miga de pan" className="shell-crumbs">
            <ol>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={i}>
                    {i > 0 && (
                      <span className="shell-crumb-sep" aria-hidden>
                        <Icon name="CHEVRON_RIGHT" size={12} />
                      </span>
                    )}
                    {c.onClick ? (
                      <button type="button" className="shell-crumb shell-crumb-link" title={c.label} onClick={c.onClick}>
                        {c.label}
                      </button>
                    ) : (
                      <span className="shell-crumb" title={c.label} aria-current={last ? "page" : undefined}>
                        {c.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {riskLabel && <Badge variant={riskVariant(riskLabel)}>{riskLabel}</Badge>}
      </div>
      <div style={{ ...glass("normal"), ...PASTILLA, right: 24 }} data-glass>
        {status}
        {actions}
        <button type="button" className="shell-cmdk" aria-label="Abrir la paleta de mandos (Ctrl+K)" title="Paleta de mandos (Ctrl+K)" onClick={openCommandPalette}>
          ⌘K
        </button>
        <ThemeToggle size="sm" />
        <UserMenu />
      </div>
    </>
  );
}
