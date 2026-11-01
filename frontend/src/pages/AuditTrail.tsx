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
import { TablaTarjetas, type ColumnaTabla } from "../components/TablaTarjetas";
import { EstadoVacio } from "../components/EstadoVacio";
import { AppShell } from "../components/shell/AppShell";
import { SectionLabel, Card, ErrorNote } from "../components/PanelHead";
import { AdminOnlyCard } from "../components/AdminOnly";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { fechaHora } from "../lib/fecha";
import { detalleDelBloque, etiquetaAccion } from "../lib/auditoria";
import "../styles/office.css";
import { PageBody } from "../components/shell/PageBody";

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

const SIN_PACIENTE = "Paciente borrado o editado";
const SIN_PACIENTE_TITULO = "La cadena solo guarda una huella del paciente; no coincide con ningún paciente actual (borrado, o se cambió su HC o su fecha de nacimiento).";

const plural = (n: number) => (n === 1 ? "1 bloque corrupto" : `${n} bloques corruptos`);

const ROTULO: React.CSSProperties = { color: "var(--muted-foreground)" };
const MONO: React.CSSProperties = { margin: 0, fontFamily: "var(--font-mono)", fontSize: 12, overflowWrap: "anywhere" };

/** El paciente de un bloque: su nombre, el aviso de que ya no existe, o «—». */
function PacienteDelBloque({ b }: { b: AuditBlock }) {
  if (!b.patient_hash) return <>—</>;
  if (b.patient_name) return <>{b.patient_name}</>;
  return <span style={ROTULO} title={SIN_PACIENTE_TITULO}>{SIN_PACIENTE}</span>;
}

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
  const toggle = (id: number) => setOpen((previo) => {
    const nuevo = new Set(previo);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
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
      return `${b.id} ${b.username} ${b.action} ${etiquetaAccion(b.action)} ${b.patient_name} ${b.iso_ts} ${b.block_hash}`
        .toLowerCase()
        .includes(needle);
    });
  }, [blocks, q, action]);

  // Newest first: an audit trail is read from the most recent event backwards.
  const ordered = useMemo(() => [...rows].reverse(), [rows]);
  const page = ordered.slice(0, shown);

  useEffect(() => setShown(PAGE), [q, action]);

  const columnas: ColumnaTabla<AuditBlock>[] = [
    {
      id: "fecha", titulo: "Fecha y hora", sinPartir: true,
      // Hora local para leer; la UTC original, que es la que firma la cadena, queda en el tooltip.
      celda: (b) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }} title={`UTC: ${b.iso_ts}`}>{fechaHora(b.iso_ts)}</span>,
    },
    { id: "usuario", titulo: "Usuario", celda: (b) => b.username || "—" },
    {
      id: "accion", titulo: "Acción", enTarjeta: "titulo",
      celda: (b) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name={open.has(b.id) ? "CHEVRON_DOWN" : "CHEVRON_RIGHT"} size={14} />
          <Badge title={b.action} variant={b.action === "GENESIS" ? "outline" : b.action === "INTEGRITY_CHECK" ? "subtle" : "secondary"}>{etiquetaAccion(b.action)}</Badge>
        </span>
      ),
    },
    { id: "paciente", titulo: "Paciente", celda: (b) => <PacienteDelBloque b={b} /> },
  ];

  return (
    <AppShell
      crumbs={AUDIT_CRUMBS}
      subtitle="Cadena de bloques con firma; alterar un bloque invalida todos los siguientes."
      acciones={[
        // F2-58: exportar no depende de haber verificado antes; es un enlace (descarga).
        { id: "exportar", label: "Exportar", icon: "EXPORT", href: "/api/audit/export" },
        { id: "verificar", label: busy ? "Verificando…" : "Verificar integridad", icon: "SHIELD", principal: true, disabled: busy, onClick: () => void runVerify() },
      ]}
    >
      <PageBody className="fade-rise">
        {verify && (
          <Card style={{ padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, borderColor: verify.ok ? "var(--success)" : "var(--destructive)" }}>
            <Icon name={verify.ok ? "STATUS_OK" : "STATUS_WARN"} size={22} color={verify.ok ? "var(--success)" : "var(--destructive)"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: verify.ok ? "var(--success)" : "var(--destructive)" }}>
                {verify.ok ? "Integridad verificada" : `¡${plural(verify.broken.length)}!`}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{verify.total_blocks} bloques en la cadena</div>
            </div>
          </Card>
        )}

        {verify && !verify.ok && verify.broken.map((b) => (
          <div key={b.id} style={{ fontSize: 13, color: "var(--destructive)", marginBottom: 4 }}>
            Bloque #{b.id} ({etiquetaAccion(b.action)}): {b.reason}
          </div>
        ))}

        <ErrorNote>{error}</ErrorNote>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <Input
              icon={<Icon name="SEARCH" />}
              aria-label="Buscar en la cadena"
              placeholder="Usuario, acción, paciente, hash o fecha…"
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
                        ...actions.map((a) => ({ value: a, label: etiquetaAccion(a) }))]}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
        </div>

        <SectionLabel style={{ marginTop: 14 }}>
          Bloques ({rows.length}{rows.length !== blocks.length ? ` de ${blocks.length}` : ""})
        </SectionLabel>
        <TablaTarjetas<AuditBlock>
          rotulo="Bloques de la cadena"
          filas={loadError ? [] : page}
          columnas={columnas}
          clave={(b) => b.id}
          onFila={(b) => toggle(b.id)}
          detalle={(b) => (open.has(b.id) ? <DetalleBloque b={b} /> : null)}
          vacio={loadError ? (
            <LoadState state="error" mensaje={loadError} onRetry={load} />
          ) : loading && blocks.length === 0 ? (
            <LoadState state="cargando" />
          ) : (
            <EstadoVacio icono={blocks.length === 0 ? "SHIELD" : "FILTER"} titulo={blocks.length === 0 ? "La cadena está vacía." : "Ningún bloque coincide con el filtro."} />
          )}
        />

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
      </PageBody>
    </AppShell>
  );
}

/** El desplegable de un bloque: el código de máquina (que a la vista va en
    castellano), el detalle traducido y las huellas de la cadena. */
function DetalleBloque({ b }: { b: AuditBlock }) {
  const detalle = detalleDelBloque(b.payload_json);
  const sinResolver = !!b.patient_hash && !b.patient_name;
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", margin: 0 }}>
      <dt style={ROTULO}>Código</dt>
      <dd style={MONO}>{b.action}</dd>
      {sinResolver && (
        <>
          <dt style={ROTULO}>Paciente</dt>
          <dd style={{ margin: 0 }}>{SIN_PACIENTE_TITULO}</dd>
        </>
      )}
      {detalle.map(([k, v]) => (
        <Fragment key={k}>
          <dt style={ROTULO}>{k}</dt>
          <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd>
        </Fragment>
      ))}
      <dt style={ROTULO}>Hash</dt>
      <dd style={MONO}>{b.block_hash}</dd>
      <dt style={ROTULO}>Hash anterior</dt>
      <dd style={MONO}>{b.prev_hash || "—"}</dd>
    </dl>
  );
}
