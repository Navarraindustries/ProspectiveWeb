/* Usuarios — admin-only management of all accounts: list, edit role / name /
   status (active), and delete. Mirrors the desktop user-admin panel.
   Backed by GET/PUT/DELETE /api/auth/users. Al borrar una cuenta sus pacientes
   pasan a la cuenta que se elige (por defecto, quien borra). */

import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { UserAdminInfo, UserBrief } from "../api/types";
import { Badge } from "../components/Badge";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button } from "../components/Button";
import { FileField } from "../components/FileField";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { AppShell } from "../components/shell/AppShell";
import { Collapsible, ErrorNote } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { AdminOnlyCard } from "../components/AdminOnly";
import { fechaHora } from "../lib/fecha";
import { ROLE_LABEL, ROLE_OPTS, ROLE_PERMITE } from "../lib/roles";

/** Qué permite el rol elegido (F1-86): el nombre solo no dice si el Observador puede editar. */
function RolePermite({ role }: { role: string }) {
  return <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{ROLE_PERMITE[role] ?? ""}</div>;
}

const SPECIALTIES = [
  "Neurocirugía", "Neurorradiología intervencionista", "Neurología",
  "Radiología", "Anestesiología", "Medicina interna", "Otra",
];
const POSITIONS = [
  "Neurocirujano/a", "Neurorradiólogo/a", "Residente de Neurocirugía",
  "Residente de Radiología", "Fellow", "Médico adjunto",
  "Estudiante de medicina", "Investigador/a", "Otro",
];

/* Lista de un desplegable opcional: la primera opción es «sin indicar» y no hay
   nada preseleccionado (F2-47: «Neurocirugía» quedaba puesta sin que nadie la
   eligiera). Si la cuenta trae un valor que no está en la lista (alta antigua,
   registro propio), se añade para no perderlo al guardar. */
function opcionales(lista: readonly string[], actual: string) {
  const valores = actual && !lista.includes(actual) ? [...lista, actual] : lista;
  return [{ value: "", label: "Sin indicar" }, ...valores.map((v) => ({ value: v, label: v }))];
}

/* Los insignias de rol no usan el color de error (F2-44): el administrador en
   rojo se leía como alarma. Solo el administrador se distingue, en el acento. */
const roleVariant = (r: string): "brand" | "muted" => (r === "admin" ? "brand" : "muted");

/* F1-82: la columna dice lo que el servidor sabe, no solo activo o no. Una
   desactivación a mano deja `status = rejected` igual que un rechazo; solo el
   rechazo de una solicitud trae `rejected_at`, así que ese es el desempate. */
function estadoCuenta(u: Pick<UserAdminInfo, "status" | "is_active" | "rejected_at">): string {
  if (u.status === "pending") return "Pendiente";
  if (u.status === "rejected" && u.rejected_at) return "Rechazada";
  return u.is_active ? "Activo" : "Desactivada";
}

function EstadoCuenta({ u }: { u: UserAdminInfo }) {
  const t = estadoCuenta(u);
  return <Badge variant={t === "Activo" ? "success" : t === "Pendiente" ? "warning" : "muted"}>{t}</Badge>;
}

type CampoAlta = "full_name" | "username" | "password" | "confirm";

/* Un error por campo, calculado a la vez, igual que «Crear cuenta» (F2-48). */
function validarAlta(f: { full_name: string; username: string; password: string; confirm: string }): Partial<Record<CampoAlta, string>> {
  const e: Partial<Record<CampoAlta, string>> = {};
  if (!f.full_name.trim()) e.full_name = "El nombre completo es obligatorio.";
  if (f.username.trim().length < 3) e.username = "El usuario debe tener al menos 3 caracteres.";
  if (f.password.length < 8) e.password = "La contraseña debe tener al menos 8 caracteres.";
  if (f.password !== f.confirm) e.confirm = "Las contraseñas no coinciden.";
  return e;
}

function EditUserSheet({
  open, user, onClose, onSaved,
}: { open: boolean; user: UserAdminInfo | null; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("viewer");
  const [active, setActive] = useState(true);
  const [specialty, setSpecialty] = useState("");
  const [hospital, setHospital] = useState("");
  const [university, setUniversity] = useState("");
  const [position, setPosition] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.full_name || "");
    setRole(user.role || "viewer");
    setActive(user.is_active);
    setSpecialty(user.specialty || "");
    setHospital(user.hospital || "");
    setUniversity(user.university || "");
    setPosition(user.position || "");
    setPhoto(null);
    setError(null);
  }, [open, user]);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateUser(user.id, {
        full_name: fullName.trim(), role, specialty, hospital: hospital.trim(),
        university: university.trim(), position,
        // F1-84: solo si la casilla cambió; si no, guardar otro dato reactivaba
        // (o desactivaba) una cuenta que otro administrador acababa de tocar.
        ...(active !== user.is_active ? { is_active: active } : {}),
      });
      if (photo) await api.setUserPhoto(user.id, photo);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el usuario");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Editar usuario" width={440}>
      {user && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Cuenta <b style={{ color: "var(--foreground)", fontFamily: "var(--font-mono)" }}>@{user.username}</b>
          </div>
          <Input label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellidos" />
          <Select label="Rol" options={ROLE_OPTS} value={role} onChange={(e) => setRole(e.target.value)} />
          <RolePermite role={role} />
          <Select label="Especialidad" options={opcionales(SPECIALTIES, user.specialty)} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
          <Input label="Hospital / Centro" value={hospital} onChange={(e) => setHospital(e.target.value)} />
          <Input label="Universidad" value={university} onChange={(e) => setUniversity(e.target.value)} />
          <Select label="Cargo" options={opcionales(POSITIONS, user.position)} value={position} onChange={(e) => setPosition(e.target.value)} />
          <FileField label="Foto de perfil" accept="image/*" file={photo} onPick={setPhoto} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Cuenta activa (puede iniciar sesión)
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Button style={{ flex: 1 }} disabled={busy} onClick={submit}>{busy ? "Guardando…" : "Guardar cambios"}</Button>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* Alta de una cuenta por el administrador: nombre, usuario, rol y contraseña
   bastan para dar de alta a un colega (F2-47); el resto del perfil va plegado.
   La cuenta se crea ACTIVA (sin aprobación). */
function NewUserSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const BLANK = {
    full_name: "", national_id: "", professional_id: "",
    specialty: "", university: "", hospital: "",
    position: "", orcid: "", role: "medico",
    username: "", password: "", confirm: "",
  };
  const [form, setForm] = useState({ ...BLANK });
  const [photo, setPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (open) { setForm({ ...BLANK }); setPhoto(null); setCv(null); setError(null); setIntentado(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Cada error junto a su campo, como en «Crear cuenta»: nombre y usuario al
  // pulsar «Crear usuario» (un campo vacío no nace en rojo); contraseña y
  // repetición avisan en cuanto se escribe en ellas.
  const errores = validarAlta(form);
  const visible = (c: CampoAlta): string | undefined => {
    if (!errores[c]) return undefined;
    if (intentado) return errores[c];
    if (c === "password") return form.password ? errores[c] : undefined;
    if (c === "confirm") return form.confirm ? errores[c] : undefined;
    return undefined;
  };
  const props = (c: CampoAlta) => ({ invalid: !!visible(c), hint: visible(c) });

  const submit = async () => {
    setError(null);
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    setBusy(true);
    try {
      await api.createUser({
        username: form.username.trim(), password: form.password, full_name: form.full_name.trim(),
        role: form.role, national_id: form.national_id.trim(), professional_id: form.professional_id.trim(),
        specialty: form.specialty, university: form.university.trim(), hospital: form.hospital.trim(),
        position: form.position, orcid: form.orcid.trim(),
      }, photo, cv);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el usuario");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo usuario" width={480}>
      <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
        La cuenta se crea <b style={{ color: "var(--foreground)" }}>activa</b> (sin aprobación) y podrá iniciar sesión de inmediato.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Nombre completo *" value={form.full_name} onChange={set("full_name")} placeholder="Dr. …" {...props("full_name")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Usuario *" value={form.username} onChange={set("username")} autoComplete="off" {...props("username")} />
          <Select label="Rol" options={ROLE_OPTS} value={form.role} onChange={set("role")} />
        </div>
        <RolePermite role={form.role} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Contraseña * (mín. 8)" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" {...props("password")} />
          <Input label="Confirmar *" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" {...props("confirm")} />
        </div>

        <Collapsible title="Más datos (opcional)" storageKey="prospective.usuarios.alta.mas-datos">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select label="Especialidad" options={opcionales(SPECIALTIES, "")} value={form.specialty} onChange={set("specialty")} />
              <Select label="Cargo" options={opcionales(POSITIONS, "")} value={form.position} onChange={set("position")} />
              <Input label="Universidad" value={form.university} onChange={set("university")} />
              <Input label="Hospital / Centro" value={form.hospital} onChange={set("hospital")} />
              <Input label="Cédula o ID" value={form.national_id} onChange={set("national_id")} />
              <Input label="ID profesional" value={form.professional_id} onChange={set("professional_id")} />
              <Input label="ORCID" value={form.orcid} onChange={set("orcid")} placeholder="0000-0002-1825-0097" />
            </div>
            <FileField label="Foto de perfil" accept="image/*" file={photo} onPick={setPhoto} />
            <FileField label="Currículum (CV)" accept=".pdf,.doc,.docx" file={cv} onPick={setCv} />
          </div>
        </Collapsible>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Button style={{ flex: 1 }} disabled={busy} onClick={submit}>{busy ? "Creando…" : "Crear usuario"}</Button>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  );
}

export function UsersAdmin({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  // La guarda va antes de montar la página: sus llamadas y sus botones no
  // tienen sentido para quien no es administrador.
  // La tarjeta va dentro del shell: la barra lateral es la salida (F1b-3).
  if (user?.role !== "admin") return <AppShell crumbs={USERS_CRUMBS}><AdminOnlyCard onBack={onBack} /></AppShell>;
  return <UsersAdminPage />;
}

/* Solo lo que existe: «Administración» no es un destino (vive en el grupo de
   la barra lateral). */
const USERS_CRUMBS = [{ label: "Usuarios" }];

function UsersAdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserAdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // El fallo de borrar va en su nota; el de cargar sustituye a la tabla.
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editUser, setEditUser] = useState<UserAdminInfo | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [toDelete, setToDelete] = useState<UserAdminInfo | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  // Cuentas activas que pueden heredar los pacientes de la que se borra (F2-46).
  // «» = quien borra, que es lo que hace el servidor sin `reassign_to`.
  const [heirs, setHeirs] = useState<UserBrief[]>([]);
  const [heir, setHeir] = useState("");
  // Admin reset for the clinician who forgot theirs — parity with the desktop
  // user manager. No current password is needed, so the event is audited.
  const [toReset, setToReset] = useState<UserAdminInfo | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);

  const confirmReset = async () => {
    if (!toReset || resetPw.length < 8) return;
    setResetBusy(true);
    setResetErr(null);
    try {
      await api.resetPassword(toReset.id, resetPw);
      setResetDone(toReset.username);
      setToReset(null);
      setResetPw("");
      setTimeout(() => setResetDone(null), 3000);
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "No se pudo restablecer");
    } finally {
      setResetBusy(false);
    }
  };

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api
      .listUsers()
      .then(setUsers)
      // F1-88: el error salía junto a «No hay usuarios que coincidan con la
      // búsqueda» y «0 usuarios», como si la búsqueda no encontrara a nadie.
      .catch((e) => setLoadError(loadErrorText(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const rows = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(q.toLowerCase()) ||
      u.username.toLowerCase().includes(q.toLowerCase())
  );

  // Al abrir el diálogo se piden las cuentas activas: no hace falta antes, y
  // así la lista no envejece mientras la página está abierta.
  useEffect(() => {
    setHeir("");
    if (!toDelete) return;
    let alive = true;
    api.usersBrief().then((l) => { if (alive) setHeirs(l); }).catch(() => { if (alive) setHeirs([]); });
    return () => { alive = false; };
  }, [toDelete]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDelBusy(true);
    try {
      await api.deleteUser(toDelete.id, heir ? Number(heir) : undefined);
      setToDelete(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar el usuario");
      setToDelete(null);
    } finally {
      setDelBusy(false);
    }
  };

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer",
  };

  return (
    <AppShell
      crumbs={USERS_CRUMBS}
      actions={
        <div style={{ width: 220 }}>
          <Input icon={<Icon name="SEARCH" />} placeholder="Buscar usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      }
    >

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 48px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }} className="fade-rise">
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--foreground)" }}>
                Gestión de usuarios
              </div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
                {loading ? "Cargando…" : loadError ? "No se pudo cargar la lista" : `${rows.length} usuario${rows.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <Button variant="outline" leadingIcon={<Icon name="REFRESH" />} onClick={load} style={{ marginRight: 10 }}>Actualizar</Button>
            <Button leadingIcon={<Icon name="USERS" />} onClick={() => setNewOpen(true)}>Nuevo usuario</Button>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Usuario", "Rol", "Especialidad / Hospital", "Estado", "Creado", "Acciones"].map((h, i) => (
                    <th
                      key={i}
                      style={{ textAlign: i === 5 ? "right" : "left", padding: "11px 16px", background: "var(--muted)", color: "var(--muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid var(--border)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(loadError || (loading && users.length === 0) || (!loading && rows.length === 0)) && (
                  <tr>
                    <td colSpan={6}>
                      <LoadState
                        state={loadError ? "error" : loading ? "cargando" : "vacio"}
                        mensaje={loadError ?? "No hay usuarios que coincidan con la búsqueda."}
                        onRetry={load}
                      />
                    </td>
                  </tr>
                )}
                {!loadError && rows.map((u, i) => {
                  const isMe = me?.id === u.id;
                  return (
                    <tr key={u.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--foreground)" }}>
                          {u.full_name || u.username}
                          {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--muted-foreground)" }}>(tú)</span>}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>@{u.username}</div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge variant={roleVariant(u.role)}>{ROLE_LABEL[u.role] || u.role}</Badge>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--muted-foreground)" }}>
                        {[u.specialty, u.hospital].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <EstadoCuenta u={u} />
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--muted-foreground)" }}>
                        {fechaHora(u.created_at)}
                      </td>
                      <td style={{ padding: "8px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            title="Editar" style={iconBtn}
                            onClick={() => { setEditUser(u); setEditOpen(true); }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand-deep)")}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                          >
                            <Icon name="EDIT" size={14} color="var(--muted-foreground)" />
                          </button>
                          <button
                            title="Restablecer contraseña" style={iconBtn}
                            onClick={() => { setToReset(u); setResetPw(""); setResetErr(null); }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand-deep)")}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                          >
                            <Icon name="LOCK" size={14} color="var(--muted-foreground)" />
                          </button>
                          <button
                            title={isMe ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
                            style={{ ...iconBtn, opacity: isMe ? 0.4 : 1, cursor: isMe ? "not-allowed" : "pointer" }}
                            disabled={isMe}
                            onClick={() => !isMe && setToDelete(u)}
                          >
                            <Icon name="DELETE" size={14} color="var(--destructive)" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <EditUserSheet open={editOpen} user={editUser} onClose={() => { setEditOpen(false); setEditUser(null); }} onSaved={load} />
      <NewUserSheet open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar usuario"
        confirmLabel={delBusy ? "Eliminando…" : "Eliminar"}
        destructive
        busy={delBusy}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        ¿Seguro que quieres eliminar la cuenta de <b style={{ color: "var(--foreground)" }}>{toDelete?.full_name || toDelete?.username}</b>?
        Sus pacientes pasarán a la cuenta elegida. Esta acción no se puede deshacer.
        <div style={{ marginTop: 14 }}>
          <Select
            label="Reasignar sus pacientes a…"
            value={heir}
            onChange={(e) => setHeir(e.target.value)}
            options={[
              { value: "", label: "A mí (admin)" },
              ...heirs
                .filter((h) => h.id !== toDelete?.id && h.id !== me?.id)
                .map((h) => ({ value: String(h.id), label: `${h.full_name || h.username} (@${h.username})` })),
            ]}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={toReset !== null}
        title="Restablecer contraseña"
        confirmLabel={resetBusy ? "Guardando…" : "Restablecer"}
        // Con menos de 8 caracteres confirmReset no hace nada y el campo lo dice.
        busy={resetBusy}
        onCancel={() => setToReset(null)}
        onConfirm={() => void confirmReset()}
      >
        Asigna una contraseña nueva a <b style={{ color: "var(--foreground)" }}>{toReset?.full_name || toReset?.username}</b>.
        Queda registrado en la auditoría; comunícasela por un canal seguro y pídele que la cambie al entrar.
        <div style={{ marginTop: 14 }}>
          <Input
            label="Nueva contraseña (mín. 8)"
            type="password"
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            autoComplete="new-password"
            invalid={resetPw.length > 0 && resetPw.length < 8}
            hint={resetPw.length > 0 && resetPw.length < 8 ? "Mínimo 8 caracteres." : undefined}
          />
        </div>
        <ErrorNote>{resetErr}</ErrorNote>
      </ConfirmDialog>

      {resetDone && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 330, background: "var(--foreground)", color: "var(--background)", padding: "10px 18px", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", fontSize: 13, fontWeight: 600 }}>
          Contraseña de @{resetDone} restablecida
        </div>
      )}
    </AppShell>
  );
}
