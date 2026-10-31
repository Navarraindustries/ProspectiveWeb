/* Barra superior del shell (F2): 56 px en vidrio con la miga de pan y el
   subtítulo a la izquierda y, a la derecha, el estado, las acciones que declara
   la pantalla, el tema y el avatar-menú. «Cerrar sesión» vive en la barra lateral.

   La miga solo lleva destinos reales («Pacientes / segura, Juan», «Usuarios»):
   «Administración» no es una pantalla y no aparece; ese rótulo vive en el grupo
   de la barra lateral. Los segmentos con `onClick` navegan; el último es la
   pantalla actual. */

import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { Logo } from "./Logo";
import { ThemeToggle } from "../ThemeToggle";
import { UserMenu } from "./UserMenu";

/** Un segmento de la miga: rótulo y, si lleva destino, adónde va. */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function TopBar({ brand = false, crumbs, subtitle, status, actions }: {
  /** Marca a la izquierda de la miga, para pantallas sin barra lateral (el pipeline). */
  brand?: boolean;
  crumbs?: Crumb[];
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="shell-top">
      {brand && (
        <span className="shell-brand">
          <Logo compact size={24} />
          <span className="shell-brand-name">PROSPECTIVE</span>
        </span>
      )}
      {crumbs && crumbs.length > 0 && (
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
      {subtitle && <span className="shell-subtitle" title={typeof subtitle === "string" ? subtitle : undefined}>{subtitle}</span>}
      <div className="shell-actions">
        {status}
        {actions}
        <ThemeToggle size="sm" />
        <UserMenu />
      </div>
    </header>
  );
}
