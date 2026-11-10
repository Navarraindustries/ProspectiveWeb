/* Menú de usuario del shell (F2): el avatar, arriba en la barra superior, abre
   un menú bajo él con la cuenta y lo que permite (F1-106, F1-251):
   nombre completo, @usuario · rol, institución si la hay, la línea del rol,
   «Cambiar contraseña» y «Cerrar sesión».

   Las secciones ya no están aquí: viven en la barra lateral, un solo sitio
   (fusiones 7 y 25).

   Teclado (UNI-85, patrón «menu button» de ARIA): al abrir, el foco va al primer
   elemento; ↑/↓ recorren en círculo, Inicio/Fin van al primero y al último; Esc
   y Tab cierran y devuelven el foco al botón. */

import { useEffect, useRef, useState, type KeyboardEvent as KeyboardEventReact } from "react";
import { glass } from "../../styles/glass";
import { Icon } from "../Icon";
import type { IconName } from "../Icon";
import { ChangePasswordSheet } from "../ChangePasswordSheet";
import { UserAvatar } from "../../avatar/UserAvatar";
import { AvatarSheet } from "../../avatar/AvatarSheet";
import { useAuth } from "../../store/auth";
import { useNav } from "../../store/nav";
import { ROLE_LABEL, ROLE_PERMITE } from "../../lib/roles";
import { useTableta } from "../../hooks/useEstrecho";
import { useOnboarding } from "../../onboarding/OnboardingProvider";

function MenuItem({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="shell-menu-item" data-danger={danger ? "true" : undefined} onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

/* Cuelga de una barra de cristal: un backdrop-filter dentro de otro no ve la página y
   el texto de detrás se leería a través. Por eso va sobre el fondo opaco del cristal. */
function MenuSwitch({ icon, label, checked, onClick }: { icon: IconName; label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} className="shell-menu-item" onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

const MENU = { ...glass("flat"), background: "var(--glass-solid)", boxShadow: "var(--glass-highlight), var(--shadow-md)" };

export function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNav();
  const { estado, empezar, setPistasActivas, reiniciarPistas } = useOnboarding();
  const pistasOn = estado.pistas_activas !== false;
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // En tableta el botón mide 44: el avatar sube a 34 y la inicial a 13 px (R31).
  const tableta = useTableta();

  // Al abrir, el foco va al primer elemento del menú.
  useEffect(() => {
    if (open) elementos()[0]?.focus();
  }, [open]);

  // Se cierra con un clic fuera o con Escape; Escape devuelve el foco al botón.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarAlBoton(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function elementos(): HTMLElement[] {
    return [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]') ?? [])];
  }

  function cerrarAlBoton() {
    setOpen(false);
    botonRef.current?.focus();
  }

  const onMenuKey = (e: KeyboardEventReact<HTMLDivElement>) => {
    const items = elementos();
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const ir = (j: number) => { e.preventDefault(); items[(j + items.length) % items.length].focus(); };
    if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(items.length - 1);
    else if (e.key === "Tab") { e.preventDefault(); cerrarAlBoton(); }
  };

  if (!user) return null;

  const doLogout = () => {
    setOpen(false);
    logout();
    nav.go("login");
  };

  return (
    <div ref={ref} className="shell-user">
      <button
        ref={botonRef}
        type="button"
        className="shell-user-btn"
        aria-label="Menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.full_name || user.username}
        onClick={() => setOpen((o) => !o)}
      >
        <UserAvatar user={user} self size={tableta ? 34 : 28} />
      </button>

      {open && (
        <div ref={menuRef} role="menu" aria-label="Cuenta" className="shell-user-menu fade-rise" style={MENU} onKeyDown={onMenuKey}>
          <div className="shell-user-head">
            <UserAvatar user={user} self size={38} />
            <div className="shell-user-text">
              <div className="shell-user-name">{user.full_name || user.username}</div>
              <div className="shell-user-sub">{`@${user.username} · ${ROLE_LABEL[user.role] ?? user.role}`}</div>
              {user.institution && <div className="shell-user-sub">{user.institution}</div>}
              {ROLE_PERMITE[user.role] && <div className="shell-user-role">{ROLE_PERMITE[user.role]}</div>}
            </div>
          </div>
          <div className="shell-menu-sep" role="separator" />
          <MenuItem icon="USER" label="Tu avatar" onClick={() => { setOpen(false); setAvatarOpen(true); }} />
          <MenuItem icon="INFO" label="Ver el recorrido de bienvenida" onClick={() => { setOpen(false); empezar(); }} />
          <MenuSwitch icon="INFO" label={`Pistas: ${pistasOn ? "activadas" : "desactivadas"}`} checked={pistasOn}
                      onClick={() => void setPistasActivas(!pistasOn)} />
          <MenuItem icon="INFO" label="Volver a ver todas las pistas" onClick={() => { setOpen(false); void reiniciarPistas(); }} />
          <MenuItem icon="PASSWORD" label="Cambiar contraseña" onClick={() => { setOpen(false); setPwOpen(true); }} />
          <MenuItem icon="LOGOUT" label="Cerrar sesión" danger onClick={doLogout} />
        </div>
      )}

      <AvatarSheet open={avatarOpen} onClose={() => setAvatarOpen(false)} />
      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
