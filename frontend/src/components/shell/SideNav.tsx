/* Barra lateral de iconos (shell C, F2): 40 px plegada, 220 px expandida.

   Un solo acceso a cada sección, también a las de administración (fusiones 7,
   10, 11, 12, 14 y 25: antes había menú de usuario, botón de casa, acceso a
   «Solicitudes» desde pacientes y otro desde el menú). Los enlaces llevan la
   ruta real en `href` —se puede abrir en otra pestaña o copiar— pero el clic
   normal navega por el router, que es quien sabe de trabajo sin guardar. */

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Badge } from "../Badge";
import { Icon } from "../Icon";
import { ThemeToggle } from "../ThemeToggle";
import { api } from "../../api/client";
import { useAuth } from "../../store/auth";
import { SCREEN_PATH, useNav } from "../../store/nav";
import type { Screen } from "../../store/nav";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { ADMIN_GROUP_LABEL, SECTIONS } from "./sections";
import type { Section } from "./sections";
import type { ShellState } from "./useShellState";

/** Cada minuto: una cuenta nueva no es urgente, y así la insignia no pide al
    servidor en cada render ni en cada cambio de sección. */
const PENDING_POLL_MS = 60_000;

/* Solo el administrador puede pedir /api/auth/pending; a los demás ni se
   intenta. Un fallo (servidor caído, sesión caducada) deja la cifra anterior:
   la insignia no es el sitio para contar errores. */
function usePendingCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const refresh = () => {
      api.listPending()
        .then((p) => { if (alive) setCount(p.length); })
        .catch(() => {});
    };
    refresh();
    const id = window.setInterval(refresh, PENDING_POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [enabled]);
  return enabled ? count : 0;
}

function SectionLink({ section, active, expanded, badge, onGo }: {
  section: Section;
  active: boolean;
  expanded: boolean;
  badge?: number;
  onGo: (key: Screen) => void;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Con Ctrl/Cmd/Shift o botón central el navegador abre pestaña o ventana
    // nueva con el href real: eso sí se le deja.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    onGo(section.key);
  };
  return (
    <li>
      <a
        href={SCREEN_PATH[section.key]}
        className="shell-nav-link"
        aria-current={active ? "page" : undefined}
        title={expanded ? undefined : section.label}
        onClick={onClick}
      >
        <Icon name={section.icon} size={16} />
        <span className="shell-nav-label">{section.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="shell-nav-badge"><Badge variant="brand">{badge}</Badge></span>
        )}
      </a>
    </li>
  );
}

export function SideNav({ state }: { state: ShellState }) {
  const { expanded, pinned, setPinned, hoverIn, hoverOut } = state;
  const { user } = useAuth();
  const nav = useNav();
  const isAdmin = user?.role === "admin";
  const pending = usePendingCount(isAdmin);

  const clinica = SECTIONS.filter((s) => s.group === "clinica");
  const admin = SECTIONS.filter((s) => s.group === "admin");

  return (
    <nav
      className="shell-nav"
      aria-label="Secciones"
      data-expanded={expanded ? "true" : "false"}
      onMouseEnter={hoverIn}
      onMouseLeave={hoverOut}
    >
      <div className="shell-nav-head">
        <Logo compact={!expanded} size={24} />
        {/* La chincheta solo se ve expandida (shell.css); plegada no hay sitio
            y el gesto para llegar a ella es expandir. */}
        <button
          type="button"
          className="shell-nav-pin"
          aria-pressed={pinned}
          aria-label={pinned ? "Soltar la barra lateral" : "Fijar la barra lateral"}
          title={pinned ? "Soltar la barra lateral" : "Fijar la barra lateral (Alt+B pliega y despliega)"}
          onClick={() => setPinned(!pinned)}
        >
          <Icon name="PIN" size={14} />
        </button>
      </div>

      <ul className="shell-nav-list">
        {clinica.map((s) => (
          <SectionLink key={s.key} section={s} active={nav.screen === s.key} expanded={expanded} onGo={nav.go} />
        ))}
        {isAdmin && (
          <>
            {/* Plegada, el grupo es solo una raya; el rótulo aparece con el
                espacio. La miga nunca lo lleva: no es un destino. */}
            <li className="shell-nav-group" aria-hidden={!expanded}>
              {expanded ? ADMIN_GROUP_LABEL : null}
            </li>
            {admin.map((s) => (
              <SectionLink
                key={s.key}
                section={s}
                active={nav.screen === s.key}
                expanded={expanded}
                badge={s.key === "pending" ? pending : undefined}
                onGo={nav.go}
              />
            ))}
          </>
        )}
      </ul>

      <div className="shell-nav-foot">
        <ThemeToggle size="sm" />
        <UserMenu />
      </div>
    </nav>
  );
}
