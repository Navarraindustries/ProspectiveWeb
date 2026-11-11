/* Usuarios — admin-only management of all accounts: list, edit role / name /
   status (active), and delete. Mirrors the desktop user-admin panel.
   Backed by GET/PUT/DELETE /api/auth/users. Al borrar una cuenta sus pacientes
   pasan a la cuenta que se elige (por defecto, quien borra). */

import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { UserAdminInfo, UserBrief } from "../api/types";
import { Badge } from "../components/Badge";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiscardChanges } from "../components/DiscardChanges";
import { Button } from "../components/Button";
import { FileField } from "../components/FileField";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Switch } from "../components/Switch";
import { MenuMas, type ItemMenu } from "../components/MenuMas";
import { TablaTarjetas, type ColumnaTabla } from "../components/TablaTarjetas";
import { useMovil, useTableta } from "../hooks/useEstrecho";
import { Sheet } from "../components/Sheet";
import { glass } from "../styles/glass";
import { AppShell } from "../components/shell/AppShell";
import { Collapsible, ErrorNote } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { EstadoVacio } from "../components/EstadoVacio";
import { useAuth } from "../store/auth";
import { AdminOnlyCard } from "../components/AdminOnly";
import { ESTILO_FECHA, fechaHora } from "../lib/fecha";
import { ROLE_LABEL, ROLE_OPTS, ROLE_PERMITE } from "../lib/roles";
import "../styles/office.css";
import { PageBody } from "../components/shell/PageBody";
import { UserAvatar } from "../avatar/UserAvatar";

/** Qué permite el rol elegido (F1-86): el nombre solo no dice si el Observador puede editar. */
function RolePermite({ role }: { role: string }) {
  return <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{ROLE_PERMITE[role] ?? ""}</div>;
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

/* El estado va como punto de 7 px y texto, no como insignia. */
function EstadoCuenta({ u }: { u: UserAdminInfo }) {
  const t = estadoCuenta(u);
  const variant = t === "Activo" ? "success" : t === "Pendiente" ? "warning" : "muted";
  return <Badge variant={variant}>{t}</Badge>;
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
  // Identidad profesional del alta: también se corrige después (UNI-84).
  const [nationalId, setNationalId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [orcid, setOrcid] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  // «Cancelar», el ✕, Escape y el clic fuera tiraban lo cambiado sin preguntar.
  const dirty = !!user && (
    fullName !== (user.full_name || "") || role !== (user.role || "viewer") || active !== user.is_active
    || specialty !== (user.specialty || "") || hospital !== (user.hospital || "")
    || university !== (user.university || "") || position !== (user.position || "")
    || nationalId !== (user.national_id || "") || professionalId !== (user.professional_id || "")
    || orcid !== (user.orcid || "") || photo !== null || cv !== null
  );
  const requestClose = () => {
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  useEffect(() => {
    if (!open || !user) return;
    setAskDiscard(false);
    setFullName(user.full_name || "");
    setRole(user.role || "viewer");
    setActive(user.is_active);
    setSpecialty(user.specialty || "");
    setHospital(user.hospital || "");
    setUniversity(user.university || "");
    setPosition(user.position || "");
    setNationalId(user.national_id || "");
    setProfessionalId(user.professional_id || "");
    setOrcid(user.orcid || "");
    setPhoto(null);
    setCv(null);
    setError(null);
  }, [open, user]);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    // Los datos van primero; si luego falla un fichero, se dice cuál y lo
    // demás ya está guardado (la lista se refresca para que se vea).
    let datosGuardados = false;
    try {
      await api.updateUser(user.id, {
        full_name: fullName.trim(), role, specialty, hospital: hospital.trim(),
        university: university.trim(), position,
        national_id: nationalId.trim(), professional_id: professionalId.trim(), orcid: orcid.trim(),
        // F1-84: solo si la casilla cambió; si no, guardar otro dato reactivaba
        // (o desactivaba) una cuenta que otro administrador acababa de tocar.
        ...(active !== user.is_active ? { is_active: active } : {}),
      });
      datosGuardados = true;
      if (photo) {
        try { await api.setUserPhoto(user.id, photo); }
        catch (e) { throw new Error(`Los datos se guardaron, pero la foto no: ${e instanceof Error ? e.message : "error"}`); }
        setPhoto(null);
      }
      if (cv) {
        try { await api.setUserCv(user.id, cv); }
        catch (e) { throw new Error(`Los datos se guardaron, pero el CV no: ${e instanceof Error ? e.message : "error"}`); }
        setCv(null);
      }
      onSaved();
      onClose();
    } catch (e) {
      if (datosGuardados) onSaved();
      setError(e instanceof Error ? e.message : "Error al guardar el usuario");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Sheet open={open} onClose={requestClose} title="Editar usuario" width={460}
      footer={user ? (
        <>
          {error && (
            <div style={{ flexBasis: "100%" }}>
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <Button disabled={busy} onClick={submit}>{busy ? "Guardando…" : "Guardar cambios"}</Button>
          <Button variant="outline" onClick={requestClose}>Cancelar</Button>
        </>
      ) : undefined}>
      {user && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Cuenta <b style={{ color: "var(--foreground)", fontFamily: "var(--font-mono)" }}>@{user.username}</b>
          </div>
          <Input label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellidos" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Select label="Rol" options={ROLE_OPTS} value={role} onChange={(e) => setRole(e.target.value)} />
            <RolePermite role={role} />
          </div>
          <div className="hoja-dos-columnas">
            <Select label="Especialidad" options={opcionales(SPECIALTIES, user.specialty)} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
            <Select label="Cargo" options={opcionales(POSITIONS, user.position)} value={position} onChange={(e) => setPosition(e.target.value)} />
            <Input label="Universidad" value={university} onChange={(e) => setUniversity(e.target.value)} />
            <Input label="Hospital / Centro" value={hospital} onChange={(e) => setHospital(e.target.value)} />
            <Input label="Cédula o ID" value={nationalId} maxLength={64} onChange={(e) => setNationalId(e.target.value)} />
            <Input label="ID profesional" value={professionalId} maxLength={64} onChange={(e) => setProfessionalId(e.target.value)} />
            <Input label="ORCID" value={orcid} maxLength={64} onChange={(e) => setOrcid(e.target.value)} placeholder="0000-0002-1825-0097" />
          </div>
          <FileField label="Foto de perfil" accept="image/png,image/jpeg,image/webp" file={photo} onPick={setPhoto} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <FileField label={user.has_cv ? "Sustituir el currículum (CV)" : "Currículum (CV)"} accept=".pdf,.doc,.docx" file={cv} onPick={setCv} />
            {user.has_cv && (
              <div style={{ fontSize: 13, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8 }}>
                Ya tiene un CV adjunto.
                <Button variant="ghost" size="sm" type="button"
                  onClick={() => api.downloadPendingCv(user.id, user.username).catch(() => setError("No se pudo descargar el CV."))}>
                  Descargar el actual
                </Button>
              </div>
            )}
          </div>
          <Switch label="Cuenta activa (puede iniciar sesión)" checked={active} onChange={setActive} />
        </div>
      )}
    </Sheet>
    <DiscardChanges
      open={askDiscard}
      onKeep={() => setAskDiscard(false)}
      onDiscard={() => { setAskDiscard(false); onClose(); }}
    />
    </>
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
  const [askDiscard, setAskDiscard] = useState(false);

  // Un alta a medio escribir no se tira con un Escape o un clic fuera.
  const dirty = (Object.keys(BLANK) as (keyof typeof BLANK)[]).some((k) => form[k] !== BLANK[k])
    || photo !== null || cv !== null;
  const requestClose = () => {
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  useEffect(() => {
    if (open) { setForm({ ...BLANK }); setPhoto(null); setCv(null); setError(null); setIntentado(false); setAskDiscard(false); }
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
    <>
    <Sheet open={open} onClose={requestClose} title="Nuevo usuario" width={460}
      footer={
        <>
          {error && (
            <div style={{ flexBasis: "100%" }}>
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <Button disabled={busy} onClick={submit}>{busy ? "Creando…" : "Crear usuario"}</Button>
          <Button variant="outline" onClick={requestClose}>Cancelar</Button>
        </>
      }>
      <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
        La cuenta se crea <b style={{ color: "var(--foreground)" }}>activa</b> (sin aprobación) y podrá iniciar sesión de inmediato.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Nombre completo" obligatorio value={form.full_name} onChange={set("full_name")} placeholder="Dr. …" {...props("full_name")} />
        <div className="hoja-dos-columnas">
          <Input label="Usuario" obligatorio value={form.username} onChange={set("username")} autoComplete="off" {...props("username")} />
          <Select label="Rol" options={ROLE_OPTS} value={form.role} onChange={set("role")} />
        </div>
        <RolePermite role={form.role} />
        <div className="hoja-dos-columnas">
          <Input label="Contraseña (mín. 8)" obligatorio type="password" value={form.password} onChange={set("password")} autoComplete="new-password" {...props("password")} />
          <Input label="Confirmar" obligatorio type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" {...props("confirm")} />
        </div>

        <Collapsible title="Más datos (opcional)" storageKey="prospective.usuarios.alta.mas-datos">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="hoja-dos-columnas">
              <Select label="Especialidad" options={opcionales(SPECIALTIES, "")} value={form.specialty} onChange={set("specialty")} />
              <Select label="Cargo" options={opcionales(POSITIONS, "")} value={form.position} onChange={set("position")} />
              <Input label="Universidad" value={form.university} onChange={set("university")} />
              <Input label="Hospital / Centro" value={form.hospital} onChange={set("hospital")} />
              <Input label="Cédula o ID" value={form.national_id} onChange={set("national_id")} />
              <Input label="ID profesional" value={form.professional_id} onChange={set("professional_id")} />
              <Input label="ORCID" value={form.orcid} onChange={set("orcid")} placeholder="0000-0002-1825-0097" />
            </div>
            <FileField label="Foto de perfil" accept="image/png,image/jpeg,image/webp" file={photo} onPick={setPhoto} />
            <FileField label="Currículum (CV)" accept=".pdf,.doc,.docx" file={cv} onPick={setCv} />
          </div>
        </Collapsible>
      </div>
    </Sheet>
    <DiscardChanges
      open={askDiscard}
      onKeep={() => setAskDiscard(false)}
      onDiscard={() => { setAskDiscard(false); onClose(); }}
    />
    </>
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
  // «Restablecer» pulsado con menos de 8 caracteres: el campo lo dice en vez de no hacer nada.
  const [resetTried, setResetTried] = useState(false);

  const confirmReset = async () => {
    if (!toReset) return;
    if (resetPw.length < 8) { setResetTried(true); return; }
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

  // Ids ya vistos y fila recién creada (se ilumina 1,2 s en la tabla).
  const vistos = useRef<Set<number> | null>(null);
  const [nuevaId, setNuevaId] = useState<number | null>(null);

  const load = (marcarNueva = false) => {
    setLoading(true);
    setLoadError(null);
    api
      .listUsers()
      .then((l) => {
        const antes = vistos.current;
        if (marcarNueva && antes) {
          const nueva = l.find((x) => !antes.has(x.id));
          if (nueva) { setNuevaId(nueva.id); setTimeout(() => setNuevaId(null), 1200); }
        }
        vistos.current = new Set(l.map((x) => x.id));
        setUsers(l);
      })
      // F1-88: el error salía junto a «No hay usuarios que coincidan con la
      // búsqueda» y «0 usuarios», como si la búsqueda no encontrara a nadie.
      .catch((e) => setLoadError(loadErrorText(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

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

  const movil = useMovil();
  const tableta = useTableta();
  const abrirEditar = (u: UserAdminInfo) => { setEditUser(u); setEditOpen(true); };
  const abrirRestablecer = (u: UserAdminInfo) => { setToReset(u); setResetPw(""); setResetErr(null); setResetTried(false); };

  const acciones = (u: UserAdminInfo) => {
    const nombre = u.full_name || u.username;
    const esYo = me?.id === u.id;
    if (movil || tableta) {
      const items: ItemMenu[] = [
        { id: "editar", label: "Editar", icon: "EDIT", abreDialogo: true, onSelect: () => abrirEditar(u) },
        { id: "restablecer", label: "Restablecer contraseña", icon: "PASSWORD", abreDialogo: true, onSelect: () => abrirRestablecer(u) },
        {
          id: "eliminar", label: "Eliminar", icon: "DELETE", destructive: true, separadoAntes: true, abreDialogo: true,
          disabled: esYo, title: esYo ? "No puedes eliminar tu propia cuenta" : undefined,
          onSelect: () => setToDelete(u),
        },
      ];
      return <MenuMas label={`Acciones de ${nombre}`} tactil items={items} />;
    }
    return (
      <span className="fila-acciones" style={{ display: "inline-flex", gap: 4 }}>
        <Button size="icon" variant="ghost" aria-label={`Editar a ${nombre}`} title="Editar" onClick={() => abrirEditar(u)}>
          <Icon name="EDIT" size={16} />
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Restablecer la contraseña de ${nombre}`} title="Restablecer contraseña" onClick={() => abrirRestablecer(u)}>
          <Icon name="PASSWORD" size={16} />
        </Button>
        <Button
          size="icon" variant="destructive-ghost" aria-label={`Eliminar a ${nombre}`}
          title={esYo ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
          disabled={esYo}
          onClick={() => !esYo && setToDelete(u)}
        >
          <Icon name="DELETE" size={16} />
        </Button>
      </span>
    );
  };

  const columnas: ColumnaTabla<UserAdminInfo>[] = [
    {
      id: "usuario", titulo: "Usuario", enTarjeta: "titulo",
      celda: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <UserAvatar user={u} size={34} decorativo />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              {u.full_name || u.username}
              {me?.id === u.id && <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 400, color: "var(--muted-foreground)" }}>(tú)</span>}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted-foreground)" }}>@{u.username}</div>
          </div>
        </div>
      ),
    },
    { id: "rol", titulo: "Rol", celda: (u) => <Badge variant={roleVariant(u.role)}>{ROLE_LABEL[u.role] || u.role}</Badge> },
    ...((tableta && !movil) ? [] : [{
      id: "especialidad", titulo: "Especialidad / Hospital",
      celda: (u: UserAdminInfo) => {
        const t = [u.specialty, u.hospital].filter(Boolean).join(" · ") || "—";
        return <span title={t} style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{t}</span>;
      },
    }]),
    { id: "estado", titulo: "Estado", celda: (u) => <EstadoCuenta u={u} /> },
    {
      id: "creado", titulo: "Creado", sinPartir: true,
      celda: (u) => <span style={{ ...ESTILO_FECHA, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{fechaHora(u.created_at)}</span>,
    },
    { id: "acciones", titulo: "Acciones", alinear: "fin", ancho: "1%", sinPartir: true, enTarjeta: "pie", celda: acciones },
  ];

  const activos = rows.filter((u) => estadoCuenta(u) === "Activo").length;
  const subtitulo = loading && users.length === 0 ? "Cargando…" : loadError ? "No se pudo cargar la lista"
    : `${rows.length} usuario${rows.length === 1 ? "" : "s"} · ${activos} activo${activos === 1 ? "" : "s"}`;

  return (
    <AppShell
      crumbs={USERS_CRUMBS}
      subtitle={subtitulo}
      extra={<Input icon={<Icon name="SEARCH" />} placeholder="Buscar usuario…" aria-label="Buscar usuario" value={q} onChange={(e) => setQ(e.target.value)} />}
      acciones={[{ id: "nuevo-usuario", label: "Nuevo usuario", icon: "PLUS", principal: true, abreDialogo: true, onClick: () => setNewOpen(true) }]}
    >

      <PageBody className="fade-rise">
          <ErrorNote>{error}</ErrorNote>

          <TablaTarjetas<UserAdminInfo>
            rotulo="Usuarios"
            tarjetasHasta="tableta"
            filas={loadError ? [] : rows}
            columnas={columnas}
            clave={(u) => u.id}
            claseFila={(u) => (u.id === nuevaId ? "fila-nueva" : undefined)}
            vacio={loadError || (loading && users.length === 0) ? (
              <LoadState state={loadError ? "error" : "cargando"} mensaje={loadError ?? undefined} onRetry={() => load()} />
            ) : (
              <EstadoVacio icono="FILTER" titulo="No hay usuarios que coincidan con la búsqueda." />
            )}
          />
      </PageBody>

      <EditUserSheet open={editOpen} user={editUser} onClose={() => { setEditOpen(false); setEditUser(null); }} onSaved={() => load()} />
      <NewUserSheet open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => load(true)} />

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
            invalid={(resetTried || resetPw.length > 0) && resetPw.length < 8}
            hint={(resetTried || resetPw.length > 0) && resetPw.length < 8 ? "Mínimo 8 caracteres." : undefined}
          />
        </div>
        <ErrorNote>{resetErr}</ErrorNote>
      </ConfirmDialog>

      {resetDone && (
        <div
          role="status" data-glass
          style={{ ...glass("dense"), position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 330, color: "var(--foreground)", padding: "10px 18px", borderRadius: "var(--radius-full)", fontSize: 13, fontWeight: 600 }}
        >
          Contraseña de @{resetDone} restablecida
        </div>
      )}
    </AppShell>
  );
}
