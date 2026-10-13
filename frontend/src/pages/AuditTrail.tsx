/* SkullChain audit trail (Feature 5) — admin view of the tamper-evident log
   with an integrity check. */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { AuditBlock, AuditVerifyResult } from "../api/types";
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

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.auditBlocks()
      .then(setBlocks)
      .catch((e) => setLoadError(`No se pudo leer la cadena: ${loadErrorText(e)}`))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

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
      return `${b.id} ${b.username} ${b.action} ${b.iso_ts} ${b.block_hash}`
        .toLowerCase()
        .includes(needle);
    });
  }, [blocks, q, action]);

  // Newest first: an audit trail is read from the most recent event backwards.
  const ordered = useMemo(() => [...rows].reverse(), [rows]);
  const page = ordered.slice(0, shown);

  useEffect(() => setShown(PAGE), [q, action]);

  return (
    <AppShell crumbs={AUDIT_CRUMBS}>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: 1100, width: "100%", margin: "0 auto" }}>
        <PanelHead
          title="Registro de auditoría — SkullChain"
          desc="Cadena de bloques con hash SHA-256; alterar un bloque invalida todos los siguientes."
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
            <a href="/api/audit/export" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Exportar TXT →</a>
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
          <div style={{ flex: "0 1 220px" }}>
            <Select
              label="Acción"
              options={[{ value: "", label: `Todas (${blocks.length})` },
                        ...actions.map((a) => ({ value: a, label: a }))]}
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
                <th style={{ padding: "6px 8px" }}>#</th>
                <th style={{ padding: "6px 8px" }}>Fecha/Hora (local)</th>
                <th style={{ padding: "6px 8px" }}>Usuario</th>
                <th style={{ padding: "6px 8px" }}>Acción</th>
                <th style={{ padding: "6px 8px" }}>Hash bloque</th>
              </tr>
            </thead>
            <tbody>
              {!loadError && page.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>{b.id}</td>
                  {/* Hora local para leer; la UTC original, que es la que firma la cadena, queda en el tooltip. */}
                  <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }} title={`UTC: ${b.iso_ts}`}>{fechaHora(b.iso_ts)}</td>
                  <td style={{ padding: "6px 8px" }}>{b.username || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <Badge variant={b.action === "GENESIS" ? "outline" : b.action === "INTEGRITY_CHECK" ? "subtle" : "secondary"}>{b.action}</Badge>
                  </td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{b.block_hash.slice(0, 16)}…</td>
                </tr>
              ))}
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
