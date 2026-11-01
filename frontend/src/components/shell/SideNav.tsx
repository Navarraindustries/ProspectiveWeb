/* Barra lateral de iconos (shell C, F2): 64 px plegada, 240 px expandida.

   Un solo acceso a cada sección, también a las de administración: antes había
   menú de usuario, botón de casa, acceso a «Solicitudes» desde pacientes y otro
   desde el menú. Las migas de pan y los botones de casa de cada página los
   resolvió esa página al entrar en el shell, no esta barra. Los enlaces llevan la
   ruta real en `href` —se puede abrir en otra pestaña o copiar— pero el clic
   normal navega por el router, que es quien sabe de trabajo sin guardar. */

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, RefObject } from "react";
import { Badge } from "../Badge";
import { Icon } from "../Icon";
import { glass } from "../../styles/glass";
import { api } from "../../api/client";
import { ROLE_LABEL } from "../../lib/roles";
import { DUR, EASE, fundido, fundidoTransition, motion, useReducedMotion } from "../../motion";
import { useAuth } from "../../store/auth";
import { SCREEN_PATH, useNav } from "../../store/nav";
import type { Screen } from "../../store/nav";
import { Logo } from "./Logo";
import { PENDING_CHANGED_EVENT } from "./pendingEvents";
import { LogoutButton } from "./LogoutButton";
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
    // Aprobar o rechazar en «Cuentas pendientes» la pone al día sin esperar al minuto.
    window.addEventListener(PENDING_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener(PENDING_CHANGED_EVENT, refresh);
    };
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
        aria-label={badge ? `${section.label}, ${badge} pendientes` : section.label}
        title={expanded ? undefined : section.label}
        onClick={onClick}
      >
        {/* Una sola barra para toda la lista: al cambiar de sección se desliza
            de un enlace al otro en lugar de apagarse y encenderse. */}
        {active && (
          <motion.span
            data-nav-bar
            layoutId="shell-nav-bar"
            className="shell-nav-bar"
            transition={{ duration: DUR.estado, ease: EASE }}
          />
        )}
        <Icon name={section.icon} size={16} />
        <span className="shell-nav-label">{section.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="shell-nav-badge"><Badge variant="brand">{badge}</Badge></span>
        )}
      </a>
    </li>
  );
}

/** Foco atrapado, Escape y vuelta del foco al botón mientras el cajón está abierto. */
function useCajon(abierto: boolean, ref: RefObject<HTMLElement | null>, onCerrar?: () => void) {
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    if (!abierto) return;
    const enfocables = () => Array.from(
      ref.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
    );
    enfocables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cerrar.current?.(); return; }
      if (e.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) return;
      const primero = lista[0], ultimo = lista[lista.length - 1];
      const activo = document.activeElement;
      if (!ref.current?.contains(activo)) { e.preventDefault(); primero.focus(); }
      else if (e.shiftKey && activo === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.querySelector<HTMLElement>("[data-abrir-secciones]")?.focus();
    };
  }, [abierto, ref]);
}

export function SideNav({ state, modo = "carril", abierto = false, onCerrar }: {
  state: ShellState;
  modo?: "carril" | "cajon";
  abierto?: boolean;
  onCerrar?: () => void;
}) {
  const cajon = modo === "cajon";
  const { pinned, setPinned } = state;
  const expanded = cajon ? true : state.expanded;
  const hoverIn = cajon ? undefined : state.hoverIn;
  const hoverOut = cajon ? undefined : state.hoverOut;
  const navRef = useRef<HTMLElement>(null);
  const reducido = useReducedMotion();
  useCajon(cajon && abierto, navRef, onCerrar);
  const { user } = useAuth();
  const nav = useNav();
  const isAdmin = user?.role === "admin";
  const pending = usePendingCount(isAdmin);

  const clinica = SECTIONS.filter((s) => s.group === "clinica");
  const admin = SECTIONS.filter((s) => s.group === "admin");
  const ir = (key: Screen) => { nav.go(key); if (cajon) onCerrar?.(); };

  if (cajon && !abierto) return null;

  // El cajón solo anima la entrada: al cerrarse se desmonta de golpe y no
  // deja una capa que capture el puntero mientras sale.
  const Marco = cajon ? motion.nav : "nav";
  const entrada = cajon
    ? reducido
      ? { variants: fundido, initial: "initial", animate: "animate", transition: fundidoTransition }
      : { initial: { x: "-100%" }, animate: { x: 0 }, transition: { duration: DUR.panel, ease: EASE } }
    : {};
  const marco = (
    <Marco
      ref={navRef as never}
      id={cajon ? "shell-cajon" : undefined}
      {...entrada}
      className="shell-nav"
      data-modo={cajon ? "cajon" : "carril"}
      data-glass
      style={{ ...glass("normal"), border: "none", borderRight: "1px solid var(--glass-border)", borderRadius: 0 }}
      aria-label="Secciones"
      data-expanded={expanded ? "true" : "false"}
      onMouseEnter={hoverIn}
      onMouseLeave={hoverOut}
    >
      <div className="shell-nav-head">
        <Logo compact={!expanded} size={32} />
        {/* La chincheta solo se ve expandida (shell.css); plegada no hay sitio
            y el gesto para llegar a ella es expandir. */}
        {!cajon && <button
          type="button"
          className="shell-nav-pin"
          aria-pressed={pinned}
          aria-label={pinned ? "Soltar la barra lateral" : "Fijar la barra lateral"}
          title={pinned ? "Soltar la barra lateral" : "Fijar la barra lateral (Alt+B pliega y despliega)"}
          onClick={() => setPinned(!pinned)}
        >
          <Icon name="PIN" size={14} />
        </button>}
      </div>

      <ul className="shell-nav-list">
        {clinica.map((s) => (
          <SectionLink key={s.key} section={s} active={nav.screen === s.key} expanded={expanded} onGo={ir} />
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
                onGo={ir}
              />
            ))}
          </>
        )}
      </ul>

      <div className="shell-nav-foot">
        {user && (
          <div className="shell-nav-user">
            <span className="shell-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
              {user.avatar_initials ?? ""}
            </span>
            <span className="shell-nav-user-text">
              <span className="shell-nav-user-name">{user.full_name || user.username}</span>
              <span className="shell-nav-user-role">{ROLE_LABEL[user.role] ?? user.role}</span>
            </span>
            <LogoutButton compact={!expanded} />
          </div>
        )}
      </div>
    </Marco>
  );
  if (!cajon) return marco;
  return (
    <>
      <div className="shell-nav-velo" data-velo aria-hidden onClick={onCerrar} />
      {marco}
    </>
  );
}
