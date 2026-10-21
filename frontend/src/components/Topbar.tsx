/* Topbar — cabecera translúcida del espacio de trabajo (/app/sesion).

   Desde F2 las pantallas de gestión usan el shell (components/shell/AppShell)
   y esta barra queda solo para el visor, que en F2 no lleva barra lateral. Por
   eso su menú de usuario ya no enumera las secciones: «Pacientes» es la vuelta
   a la gestión, y desde allí la barra lateral llega a todo lo demás.
   Izquierda: logotipo (→ pacientes) + PROSPECTIVE + chip WEB + miga.
   Derecha: hueco para acciones, conmutador de tema y menú de usuario. */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import logo from "../assets/logo.png";
import { ThemeToggle } from "./ThemeToggle";
import { Icon } from "./Icon";
import { useAuth } from "../store/auth";
import { ChangePasswordSheet } from "./ChangePasswordSheet";
import { useNav } from "../store/nav";
import { api } from "../api/client";
import { ROLE_LABEL, ROLE_PERMITE } from "../lib/roles";
import type { Crumb } from "./shell/TopBar";

/** La miga vive en el shell; se reexporta para quien aún importa de aquí. */
export type { Crumb } from "./shell/TopBar";

/** Circular avatar: the user's uploaded photo (auth'd blob) or their initials. */
function Avatar({ url, initials, size, fontSize }: { url: string | null; initials: string; size: number; fontSize: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "var(--brand-subtle)", color: "var(--brand-subtle-foreground)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
    </span>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load the logged-in user's own profile photo (auth'd blob → object URL).
  useEffect(() => {
    if (!user?.has_photo) { setPhotoUrl(null); return; }
    let created: string | null = null;
    let alive = true;
    api.myPhotoObjectUrl()
      .then((u) => { if (alive) { created = u; setPhotoUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => {});
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [user?.has_photo]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Menú de usuario"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 40,
          padding: "0 8px 0 6px",
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--border)",
          background: open ? "var(--accent)" : "transparent",
          color: "var(--foreground)",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          transition: "background var(--dur-fast) var(--ease-out)",
        }}
      >
        <Avatar url={photoUrl} initials={user.avatar_initials} size={30} fontSize={12} />
        <span style={{ fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.username}
        </span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast)" }}>▾</span>
      </button>

      {open && (
        <div
          className="fade-rise"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 250,
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            padding: 8,
            zIndex: 300,
          }}
        >
          {/* Profile header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 12px" }}>
            <Avatar url={photoUrl} initials={user.avatar_initials} size={38} fontSize={14} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name || user.username}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                @{user.username} · {ROLE_LABEL[user.role] ?? user.role}
              </div>
              {/* F1-106/251: la institución y lo que permite el rol, para que la
                  persona sepa con qué cuenta está y qué puede hacer con ella. */}
              {user.institution && (
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{user.institution}</div>
              )}
              {ROLE_PERMITE[user.role] && (
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.35, marginTop: 2 }}>{ROLE_PERMITE[user.role]}</div>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

          <MenuItem icon="PATIENTS" label="Pacientes" onClick={() => { setOpen(false); nav.go("patients"); }} />

          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

          <MenuItem icon="PASSWORD" label="Cambiar contraseña" onClick={() => { setOpen(false); setPwOpen(true); }} />
          <MenuItem icon="LOGOUT" label="Cerrar sesión" danger onClick={doLogout} />
        </div>
      )}

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 10px",
        border: "none",
        borderRadius: "var(--radius-md)",
        background: hover ? "var(--accent)" : "transparent",
        color: danger ? "var(--destructive)" : "var(--foreground)",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: 500,
        textAlign: "left",
      }}
    >
      <Icon name={icon} size={15} color={danger ? "var(--destructive)" : "var(--muted-foreground)"} />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

export function Topbar({
  crumb,
  crumbs,
  children,
}: {
  /** Plain-text breadcrumb (legacy call sites). */
  crumb?: string;
  /** Segmented breadcrumb — segments with an `onClick` navigate. */
  crumbs?: Crumb[];
  children?: ReactNode;
}) {
  const nav = useNav();
  return (
    <div
      style={{
        height: 66,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 24px",
        background: "color-mix(in srgb, var(--background) 92%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Clickable brand → home (patients) */}
      <button
        onClick={() => nav.go("patients")}
        title="Ir a pacientes"
        style={{ display: "flex", alignItems: "center", gap: 12, background: "transparent", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, whiteSpace: "nowrap" }}
      >
        <img className="logo-mark" src={logo} alt="SkullApp" style={{ height: 46 }} />
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "var(--tracking-title)", color: "var(--foreground)" }}>
          PROSPECTIVE
        </span>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", background: "var(--muted)", padding: "3px 8px", borderRadius: 6, fontWeight: 700, letterSpacing: "0.04em" }}>
          WEB
        </span>
      </button>
      {/* Migas de pan. Eran una sola cadena de texto plano, así que volver al
          paciente exigía el botón de la derecha, que lleva a la lista completa y
          pierde el contexto del caso. Los segmentos con destino ahora navegan. */}
      {(crumbs?.length || crumb) && (
        <>
          <span style={{ color: "var(--border)", fontSize: 18, flexShrink: 0 }}>/</span>
          {/* Truncate: the topbar has a fixed height, so a long patient name that
              wraps would overflow it vertically on narrow screens. */}
          <span
            className="truncate"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted-foreground)", whiteSpace: "nowrap", minWidth: 0, maxWidth: "42vw" }}
          >
            {crumbs?.length
              ? crumbs.map((c, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {i > 0 && <span style={{ color: "var(--border)", flexShrink: 0 }}>/</span>}
                    {c.onClick ? (
                      <button
                        onClick={c.onClick}
                        title={c.label}
                        className="truncate"
                        style={{
                          background: "transparent", border: "none", padding: 0, minWidth: 0,
                          cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13,
                          color: "var(--brand-deep)", fontWeight: 600, textAlign: "left",
                        }}
                      >
                        {c.label}
                      </button>
                    ) : (
                      <span className="truncate" title={c.label} style={{ minWidth: 0 }}>{c.label}</span>
                    )}
                  </span>
                ))
              : <span className="truncate" title={crumb}>{crumb}</span>}
          </span>
        </>
      )}
      <div style={{ flex: 1 }} />
      {children}
      <ThemeToggle size="sm" />
      <UserMenu />
    </div>
  );
}
