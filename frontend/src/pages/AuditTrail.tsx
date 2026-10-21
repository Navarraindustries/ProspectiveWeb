/* Registro de auditoría (Feature 5) — vista de administración de la cadena de
   bloques a prueba de manipulación, con comprobación de integridad. */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { AuditBlock, AuditVerifyResult, PatientSummary } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { AppShell } from "../components/shell/AppShell";
import { PanelHead, SectionLabel, Card, ErrorNote } from "../components/PanelHead";
import { AdminOnlyCard } from "../components/AdminOnly";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { fechaHora } from "../lib/fecha";
import { detalleDelBloque, etiquetaAccion } from "../lib/auditoria";

/** Rows added per «Mostrar más». The chain is append-only and unbounded. */
const PAGE = 50;

export function AuditTrail({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  // La guarda va antes de montar la página: sus llamadas y sus botones no
  // tienen sentido para quien no es administrador.
  // La tarjeta va dentro del shell: la barra lateral es la salida (F1b-3).
  if (user?.role !== "admin") return <AppShell crumbs={AUDIT_CRUMBS}><AdminOnlyCard onBack={onBack} /></AppShell>;
  return <AuditTrailPage />;
}

/* Solo lo que existe: «Administración» no es un destino (vive en el grupo de
   la barra lateral). */
const AUDIT_CRUMBS = [{ label: "Auditoría" }];

function AuditTrailPage() {
  const [blocks, setBlocks] = useState<AuditBlock[]>([]);
  const [verify, setVerify] = useState<AuditVerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F1-103: sin estado de carga ni de error, la tabla decía «La cadena está
  // vacía.» mientras cargaba y cuando el servidor fallaba; una cadena de
  // auditoría vacía es una alarma, no un estado normal.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The chain only grows, so rendering every block put thousands of rows in one
  // table with no way to find anything in them.
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [shown, setShown] = useState(PAGE);
  // F2-59: la cadena solo guarda la huella del paciente; filtrar por paciente
  // lo resuelve el servidor, que es quien puede calcularla.
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  // Una respuesta lenta de un filtro anterior no debe pisar la del actual.
  const ticket = useRef(0);

  const load = () => {
    const mine = ++ticket.current;
    setLoading(true);
    setLoadError(null);
    api.auditBlocks(patientId ? { patientId: Number(patientId) } : undefined)
      .then((b) => { if (mine === ticket.current) setBlocks(b); })
      .catch((e) => {
        if (mine !== ticket.current) return;
        setBlocks([]);
        setLoadError(`No se pudo leer la cadena: ${loadErrorText(e)}`);
      })
      .finally(() => { if (mine === ticket.current) setLoading(false); });
  };
  useEffect(load, [patientId]);
  useEffect(() => {
    // Sin la lista el filtro solo ofrece «Todos»: la página sigue sirviendo.
    api.listPatients().then(setPatients).catch(() => {});
  }, []);
  const paciente = patients.find((p) => String(p.id) === patientId);
  const toggle = (id: number) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const runVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      setVerify(await api.auditVerify());
      load(); // verify appends an INTEGRITY_CHECK block
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error verificando la cadena");
    } finally {
      setBusy(false);
    }
  };

  // Distinct actions actually present, so the filter never offers a dead option.
  const actions = useMemo(
    () => Array.from(new Set(blocks.map((b) => b.action))).sort(),
    [blocks],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return blocks.filter((b) => {
      if (action && b.action !== action) return false;
      if (!needle) return true;
      return `${b.id} ${b.username} ${b.action} ${etiquetaAccion(b.action)} ${b.iso_ts} ${b.block_hash}`
        .toLowerCase()
        .includes(needle);
    });
  }, [blocks, q, action]);

  // Newest first: an audit trail is read from the most recent event backwards.
  const ordered = useMemo(() => [...rows].reverse(), [rows]);
  const page = ordered.slice(0, shown);

  useEffect(() => setShown(PAGE), [q, action]);

  return (
    <AppShell crumbs={AUDIT_CRUMBS} actions={
      // F2-58: exportar no depende de haber verificado antes.
      <a href="/api/audit/export" target="_blank" rel="noreferrer"
         style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Icon name="EXPORT" size={16} />Exportar
      </a>
    }>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: 1100, width: "100%", margin: "0 auto" }}>
        <PanelHead
          title="Registro de auditoría"
          desc="Cadena de bloques con firma; alterar un bloque invalida todos los siguientes."
          right={
            <Button onClick={() => void runVerify()} disabled={busy} leadingIcon={<Icon name="SHIELD" />}>
              {busy ? "Verificando…" : "Verificar integridad"}
            </Button>
          }
        />

        {verify && (
          <Card style={{ padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, borderColor: verify.ok ? "var(--success)" : "var(--destructive)" }}>
            <Icon name={verify.ok ? "STATUS_OK" : "STATUS_WARN"} size={22} color={verify.ok ? "var(--success)" : "var(--destructive)"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: verify.ok ? "var(--success)" : "var(--destructive)" }}>
                {verify.ok ? "Integridad verificada" : `¡${verify.broken.length} bloque(s) corrupto(s)!`}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{verify.total_blocks} bloques en la cadena</div>
            </div>
          </Card>
        )}

        {verify && !verify.ok && verify.broken.map((b) => (
          <div key={b.id} style={{ fontSize: 12, color: "var(--destructive)", marginBottom: 4 }}>
            Bloque #{b.id} ({b.action}): {b.reason}
          </div>
        ))}

        <ErrorNote>{error}</ErrorNote>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <Input
              label="Buscar"
              placeholder="Usuario, acción, hash o fecha…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div style={{ flex: "0 1 240px" }}>
            <Select
              label="Paciente"
              options={[{ value: "", label: "Todos los pacientes" },
                        ...patients.map((p) => ({ value: String(p.id), label: `${p.full_name} · ${p.hospital_id}` }))]}
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
          </div>
          <div style={{ flex: "0 1 220px" }}>
            <Select
              label="Acción"
              options={[{ value: "", label: `Todas (${blocks.length})` },
                        ...actions.map((a) => ({ value: a, label: etiquetaAccion(a) === a ? a : `${etiquetaAccion(a)} · ${a}` }))]}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
        </div>

        <SectionLabel style={{ marginTop: 14 }}>
          Bloques ({rows.length}{rows.length !== blocks.length ? ` de ${blocks.length}` : ""})
        </SectionLabel>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
                <th style={{ padding: "6px 8px" }}>Fecha y hora</th>
                <th style={{ padding: "6px 8px" }}>Usuario</th>
                <th style={{ padding: "6px 8px" }}>Acción</th>
                <th style={{ padding: "6px 8px" }}>Paciente</th>
              </tr>
            </thead>
            <tbody>
              {!loadError && page.map((b) => {
                const abierto = open.has(b.id);
                const etiqueta = etiquetaAccion(b.action);
                const detalle = detalleDelBloque(b.payload_json);
                return (
                  <Fragment key={b.id}>
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      {/* Hora local para leer; la UTC original, que es la que firma la cadena, queda en el tooltip. */}
                      <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }} title={`UTC: ${b.iso_ts}`}>{fechaHora(b.iso_ts)}</td>
                      <td style={{ padding: "6px 8px" }}>{b.username || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {/* La acción es el control que abre la fila: un botón real, no un clic en la celda. */}
                        <button
                          type="button"
                          aria-expanded={abierto}
                          onClick={() => toggle(b.id)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left" }}
                        >
                          <Icon name={abierto ? "CHEVRON_DOWN" : "CHEVRON_RIGHT"} size={14} />
                          <Badge variant={b.action === "GENESIS" ? "outline" : b.action === "INTEGRITY_CHECK" ? "subtle" : "secondary"}>{etiqueta}</Badge>
                        </button>
                        {etiqueta !== b.action && (
                          <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{b.action}</span>
                        )}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {!b.patient_hash ? "—" : paciente ? paciente.full_name : (
                          <span style={{ color: "var(--muted-foreground)" }} title="Huella del paciente; filtra por paciente para verlo">paciente</span>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={4} style={{ padding: "6px 8px 12px 28px", background: "var(--muted)" }}>
                          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", margin: 0 }}>
                            {detalle.map(([k, v]) => (
                              <Fragment key={k}>
                                <dt style={{ color: "var(--muted-foreground)" }}>{k}</dt>
                                <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd>
                              </Fragment>
                            ))}
                            <dt style={{ color: "var(--muted-foreground)" }}>Hash</dt>
                            <dd style={{ margin: 0, fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>{b.block_hash}</dd>
                            <dt style={{ color: "var(--muted-foreground)" }}>Hash anterior</dt>
                            <dd style={{ margin: 0, fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>{b.prev_hash || "—"}</dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {loadError ? (
          <LoadState state="error" mensaje={loadError} onRetry={load} />
        ) : loading && blocks.length === 0 ? (
          <LoadState state="cargando" />
        ) : rows.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "18px 0", textAlign: "center" }}>
            {blocks.length === 0 ? "La cadena está vacía." : "Ningún bloque coincide con el filtro."}
          </div>
        )}

        {!loadError && page.length < ordered.length && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Mostrar {Math.min(PAGE, ordered.length - page.length)} más
              <span style={{ marginLeft: 6, color: "var(--muted-foreground)" }}>
                ({page.length} de {ordered.length})
              </span>
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
