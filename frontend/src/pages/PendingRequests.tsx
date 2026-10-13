/* Cuentas pendientes — admin-only review of pending account requests.
   Lists self-registrations with their professional profile and approve/reject;
   «Aprobadas» y «Rechazadas» guardan el historial que antes desaparecía (F2-51). */

import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { PendingUser, UserAdminInfo } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Tabs } from "../components/Tabs";
import { AppShell } from "../components/shell/AppShell";
import { PENDING_CHANGED_EVENT } from "../components/shell/pendingEvents";
import { ErrorNote, Card } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { fechaHora } from "../lib/fecha";
import { ROLE_LABEL } from "../lib/roles";

const TABS = ["Pendientes", "Aprobadas", "Rechazadas"] as const;
type Pestana = (typeof TABS)[number];

/** Rol con el que entra una cuenta aprobada: el servidor no lo cambia al aprobar. */
const ROL_AL_APROBAR = "medico";

/** Aviso de la pestaña «Rechazadas». También con la lista vacía: justo ahí es
 *  donde alguien se pregunta por qué no sale una solicitud antigua. */
function RechazadasNota() {
  return (
    <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
      Solo salen las solicitudes rechazadas desde esta versión; las anteriores no tenían fecha y no se listan.
    </div>
  );
}

/** Historial: cuentas aprobadas o rechazadas, de las que el listado de
 *  pendientes ya no sabe nada. */
function History({ tab }: { tab: "Aprobadas" | "Rechazadas" }) {
  const [rows, setRows] = useState<UserAdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Cambiar de pestaña deprisa dejaba la respuesta de la anterior pisando a la
  // actual: cada carga solo cuenta mientras su pestaña siga abierta.
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, [tab]);
  const load = () => {
    setLoading(true);
    setLoadError(null);
    api
      .listUsers(tab === "Aprobadas" ? "approved" : "rejected")
      // Los administradores no pasaron por una solicitud: fuera de «Aprobadas».
      .then((l) => { if (vivo.current) setRows(tab === "Aprobadas" ? l.filter((u) => u.role !== "admin") : l); })
      .catch((e) => { if (vivo.current) setLoadError(loadErrorText(e)); })
      .finally(() => { if (vivo.current) setLoading(false); });
  };
  useEffect(load, [tab]);

  if (loadError) return <Card style={{ padding: "8px 20px" }}><LoadState state="error" mensaje={loadError} onRetry={load} /></Card>;
  if (loading) return <LoadState state="cargando" mensaje="" onRetry={load} />;
  if (rows.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "Rechazadas" && <RechazadasNota />}
        <Card style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
          {tab === "Aprobadas" ? "Ninguna cuenta aprobada todavía." : "Ninguna cuenta rechazada."}
        </Card>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {tab === "Rechazadas" && <RechazadasNota />}
      {tab === "Aprobadas" && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Cuentas activas que no son de administrador, con su fecha de alta. El servidor no distingue las
          aprobadas desde una solicitud de las que creó un administrador.
        </div>
      )}
      {rows.map((u) => (
        <Card key={u.id} style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{u.full_name || u.username}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>@{u.username}</span>
            {u.specialty && <Badge variant="subtle">{u.specialty}</Badge>}
            {tab === "Aprobadas" && <Badge variant="muted">{ROLE_LABEL[u.role] || u.role}</Badge>}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
            {tab === "Rechazadas" && u.rejected_at
              ? `Rechazada: ${fechaHora(u.rejected_at)} · Solicitada: ${fechaHora(u.created_at)}`
              : `${tab === "Aprobadas" ? "Alta" : "Solicitada"}: ${fechaHora(u.created_at)}`}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Avatar that loads the pending user's uploaded photo (auth'd blob) or falls
 *  back to initials. */
function PendingAvatar({ user }: { user: PendingUser }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user.has_photo) return;
    let created: string | null = null;
    let alive = true;
    api.pendingPhotoObjectUrl(user.id)
      .then((u) => { if (alive) { created = u; setUrl(u); } else URL.revokeObjectURL(u); })
      // Sin foto quedan las iniciales: la solicitud se puede revisar igual.
      .catch(() => {});
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [user.id, user.has_photo]);
  const initials = (user.full_name || user.username).slice(0, 2).toUpperCase();
  return (
    <span style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "var(--brand-subtle)", color: "var(--brand-subtle-foreground)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
    </span>
  );
}

/* Solo lo que existe: «Administración» no es un destino (vive en el grupo de
   la barra lateral). */
const PENDING_CRUMBS = [{ label: "Cuentas pendientes" }];

export function PendingRequests() {
  const [tab, setTab] = useState<Pestana>("Pendientes");
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  // El fallo de aprobar o rechazar va en su nota; el de cargar sustituye a la lista.
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // F1-91: «Rechazar», al lado de «Aprobar», echaba la solicitud al primer clic.
  const [toReject, setToReject] = useState<PendingUser | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api
      .listPending()
      .then(setPending)
      // F1-92: con el servidor caído salían la marca verde y «No hay
      // solicitudes pendientes»: el administrador creía no tener nada que
      // revisar y la persona que pidió cuenta seguía esperando.
      .catch((e) => setLoadError(loadErrorText(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (id: number, action: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") await api.approvePending(id);
      else await api.rejectPending(id);
      setPending((p) => p.filter((u) => u.id !== id));
      window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando la solicitud");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell crumbs={PENDING_CRUMBS}>
      <ConfirmDialog
        open={toReject !== null}
        title="¿Rechazar la solicitud?"
        confirmLabel="Rechazar solicitud"
        destructive
        onCancel={() => setToReject(null)}
        onConfirm={() => { const u = toReject; setToReject(null); if (u) void act(u.id, "reject"); }}
      >
        La solicitud de <b style={{ color: "var(--foreground)" }}>{toReject?.full_name || toReject?.username}</b> se
        rechaza y pasa a «Rechazadas»; no podrá entrar con esa cuenta.
      </ConfirmDialog>
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 48px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }} className="fade-rise">
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--foreground)" }}>
                Cuentas pendientes
              </div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
                {tab !== "Pendientes"
                  ? (tab === "Aprobadas" ? "Cuentas que ya pueden entrar" : "Solicitudes que no se aceptaron")
                  : loading ? "Cargando…" : loadError ? "No se pudo cargar la lista" : `${pending.length} pendiente${pending.length === 1 ? "" : "s"} de aprobación`}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            {tab === "Pendientes" && (
              <Button variant="outline" leadingIcon={<Icon name="REFRESH" />} onClick={load}>
                Actualizar
              </Button>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <Tabs tabs={TABS} value={tab} onChange={(t) => setTab(t as Pestana)} />
          </div>

          {tab !== "Pendientes" && <History key={tab} tab={tab} />}

          <ErrorNote>{error}</ErrorNote>

          {tab === "Pendientes" && loadError && (
            <Card style={{ padding: "8px 20px" }}>
              <LoadState state="error" mensaje={loadError} onRetry={load} />
            </Card>
          )}

          {tab === "Pendientes" && !loading && !loadError && pending.length === 0 && (
            <Card style={{ padding: "28px 20px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: "var(--muted-foreground)" }}>
                <Icon name="STATUS_OK" size={26} />
              </div>
              <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
                No hay cuentas pendientes.
              </div>
            </Card>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tab === "Pendientes" && !loadError && pending.map((u) => (
              <Card key={u.id} style={{ padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <PendingAvatar user={u} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>{u.full_name || u.username}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>@{u.username}</span>
                      {u.specialty && <Badge variant="subtle">{u.specialty}</Badge>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 20px", marginTop: 10 }}>
                      {[
                        ["Cargo", u.position],
                        ["Hospital", u.hospital],
                        ["Universidad", u.university],
                        ["ID profesional", u.professional_id],
                        ["Cédula / ID", u.national_id],
                        ["ORCID", u.orcid],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k} style={{ fontSize: 12 }}>
                            <span style={{ color: "var(--muted-foreground)" }}>{k}: </span>
                            <span style={{ color: "var(--foreground)" }}>{v}</span>
                          </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      {u.has_cv && (
                        <button
                          type="button"
                          onClick={() => api.downloadPendingCv(u.id, u.username).catch(() => setError("No se pudo descargar el CV."))}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "var(--brand-deep)", cursor: "pointer" }}
                        >
                          <Icon name="ATTACH" size={13} /> Descargar CV
                        </button>
                      )}
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
                        Solicitado: {fechaHora(u.created_at)}
                      </span>
                    </div>
                    {/* F1-90: quien aprueba no ve con qué rol entra la cuenta. */}
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>
                      Entrará como {ROLE_LABEL[ROL_AL_APROBAR]}; cambia el rol en Usuarios.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                    <Button
                      size="sm"
                      onClick={() => void act(u.id, "approve")}
                      disabled={busyId === u.id}
                      leadingIcon={<Icon name="STATUS_OK" size={13} />}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setToReject(u)}
                      disabled={busyId === u.id}
                      leadingIcon={<Icon name="STATUS_FAIL" size={13} />}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
