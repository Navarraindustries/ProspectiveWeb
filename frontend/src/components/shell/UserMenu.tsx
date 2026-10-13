/* Menú de usuario del shell (F2): el avatar, abajo en la barra lateral, abre
   un menú en vidrio con la cuenta y lo que permite (F1-106, F1-251):
   nombre completo, @usuario · rol, institución si la hay, la línea del rol,
   «Cambiar contraseña» y «Cerrar sesión».

   Las secciones ya no están aquí: viven en la barra lateral, un solo sitio
   (fusiones 7 y 25). */

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { IconName } from "../Icon";
import { ChangePasswordSheet } from "../ChangePasswordSheet";
import { api } from "../../api/client";
import { useAuth } from "../../store/auth";
import { useNav } from "../../store/nav";
import { ROLE_LABEL, ROLE_PERMITE } from "../../lib/roles";

/** Avatar redondo: la foto subida (blob autenticado) o las iniciales. */
function Avatar({ url, initials, size }: { url: string | null; initials: string; size: number }) {
  return (
    <span className="shell-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {url ? <img src={url} alt="" /> : initials}
    </span>
  );
}

function MenuItem({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="shell-menu-item" data-danger={danger ? "true" : undefined} onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // La foto propia llega como blob autenticado → URL de objeto, que se libera
  // al desmontar o si la respuesta llega tarde.
  useEffect(() => {
    if (!user?.has_photo) { setPhotoUrl(null); return; }
    let created: string | null = null;
    let alive = true;
    api.myPhotoObjectUrl()
      .then((u) => { if (alive) { created = u; setPhotoUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => {});
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [user?.has_photo]);

  // Se cierra con un clic fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const doLogout = () => {
    setOpen(false);
    logout();
    nav.go("login");
  };

  return (
    <div ref={ref} className="shell-user">
      <button
        type="button"
        className="shell-user-btn"
        aria-label="Menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.full_name || user.username}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar url={photoUrl} initials={user.avatar_initials ?? ""} size={28} />
      </button>

      {open && (
        <div role="menu" aria-label="Cuenta" className="shell-user-menu fade-rise">
          <div className="shell-user-head">
            <Avatar url={photoUrl} initials={user.avatar_initials ?? ""} size={38} />
            <div className="shell-user-text">
              <div className="shell-user-name">{user.full_name || user.username}</div>
              <div className="shell-user-sub">{`@${user.username} · ${ROLE_LABEL[user.role] ?? user.role}`}</div>
              {user.institution && <div className="shell-user-sub">{user.institution}</div>}
              {ROLE_PERMITE[user.role] && <div className="shell-user-role">{ROLE_PERMITE[user.role]}</div>}
            </div>
          </div>
          <div className="shell-menu-sep" role="separator" />
          <MenuItem icon="PASSWORD" label="Cambiar contraseña" onClick={() => { setOpen(false); setPwOpen(true); }} />
          <MenuItem icon="LOGOUT" label="Cerrar sesión" danger onClick={doLogout} />
        </div>
      )}

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
