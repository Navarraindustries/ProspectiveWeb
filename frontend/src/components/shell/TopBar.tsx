/* Barra superior del shell (F2): 48 px en vidrio con la miga de pan a la
   izquierda y, a la derecha, las acciones que declara la pantalla y, siempre,
   «Cerrar sesión» (el menú del avatar no se encontraba).

   La miga solo lleva destinos reales («Pacientes / segura, Juan», «Usuarios»):
   «Administración» no es una pantalla y no aparece; ese rótulo vive en el grupo
   de la barra lateral. Los segmentos con `onClick` navegan; el último es la
   pantalla actual. */

import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { LogoutButton } from "./LogoutButton";

/** Un segmento de la miga: rótulo y, si lleva destino, adónde va. */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function TopBar({ crumbs, actions }: { crumbs?: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="shell-top">
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
      <div className="shell-actions">
        {actions}
        <LogoutButton />
      </div>
    </header>
  );
}
