/* Registro de pedidos — todos los clips encargados y en qué estado están.

   Fuera del pipeline a propósito. El pipeline recorre UN caso; esta pantalla
   cruza todos y contesta una pregunta de gestión: «¿qué tengo pedido y qué se
   me está pudriendo?». Filtrada por paciente contesta también la del caso, así
   que una sola vista sirve para las dos.

   Dos cosas la separan de una tabla cualquiera:

   1. **Ordena por lo que se pudre, no por fecha de creación.** Un pedido
      enviado hace cuarenta días sin noticias es más urgente que uno firmado
      ayer. El orden por defecto es el tiempo que lleva parado en su estado.
   2. **Saca a la superficie las piezas fuera de especificación.** Una pieza
      recibida cuya fuerza cayó fuera de la banda es justo lo que no puede
      quedar enterrado en una lista. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { ClipOrder, OrderStatus, PatientSummary } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Card, ErrorNote, PanelHead, SectionLabel } from "../components/PanelHead";
import { Topbar } from "../components/Topbar";

type Variant = "default" | "secondary" | "outline" | "subtle" | "success" | "warning" | "destructive";

const STATUS_VARIANT: Record<OrderStatus, Variant> = {
  borrador: "outline",
  firmado: "subtle",
  enviado: "secondary",
  en_fabricacion: "warning",
  recibida: "warning",
  verificada: "success",
  rechazada: "destructive",
};

/** Estados a los que se avanza con un botón «siguiente», y cómo se llaman.
    `verificada` y `rechazada` NO están: son un juicio sobre la pieza recibida y
    tienen sus propios botones. Recorrer `next_states` sin filtrar pintaba dos
    botones idénticos —ambos caían en el `else` de la etiqueta— junto a los de
    aceptar y rechazar, que hacen lo mismo. */
const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  firmado: "Firmar",
  enviado: "Marcar enviado",
  en_fabricacion: "En fabricación",
  recibida: "Registrar recepción",
};

/** Días a partir de los cuales un pedido parado empieza a pintarse en ámbar.
    No es una promesa del taller: es cuándo conviene preguntar. */
const STALE_DAYS: Partial<Record<OrderStatus, number>> = {
  firmado: 3,          // firmado y sin enviar
  enviado: 21,         // enviado y sin noticias
  en_fabricacion: 45,
  recibida: 7,         // recibida y sin aceptar ni rechazar
};

const daysSince = (ts: number) => Math.floor((Date.now() / 1000 - ts) / 86400);

function isStale(o: ClipOrder): boolean {
  const limit = STALE_DAYS[o.status];
  return limit != null && daysSince(o.updated_at) >= limit;
}

function isOutOfSpec(o: ClipOrder): boolean {
  return o.status === "recibida"
    && (o.reception.jaw_within_tolerance === false || o.reception.force_within_band === false);
}

/** Qué merece la atención de quien abre esta pantalla, y por qué. */
function attention(o: ClipOrder): { label: string; variant: Variant } | null {
  if (isOutOfSpec(o)) return { label: "fuera de especificación", variant: "destructive" };
  if (isStale(o)) return { label: `${daysSince(o.updated_at)} días parado`, variant: "warning" };
  return null;
}

const cellHead: React.CSSProperties = {
  fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)",
  letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
  color: "var(--muted-foreground)", textAlign: "left", padding: "0 10px 8px 0",
  whiteSpace: "nowrap",
};

const cell: React.CSSProperties = {
  fontSize: 12, padding: "10px 10px 10px 0", verticalAlign: "top",
  borderTop: "1px solid var(--border)",
};

function Row({ order, onOpen, selected }: {
  order: ClipOrder; onOpen: () => void; selected: boolean;
}) {
  const flag = attention(order);
  return (
    <tr
      onClick={onOpen}
      style={{ cursor: "pointer", background: selected ? "var(--brand-subtle)" : "transparent" }}
    >
      <td style={{ ...cell, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
        {order.part_no}
      </td>
      <td style={cell}>
        <Badge variant={STATUS_VARIANT[order.status]}>{order.status_label}</Badge>
        {flag && (
          <div style={{ marginTop: 4 }}>
            <Badge variant={flag.variant}>{flag.label}</Badge>
          </div>
        )}
      </td>
      <td style={cell}>
        <div className="truncate" style={{ maxWidth: 190 }}>{order.patient || "—"}</div>
        <div className="truncate" style={{ maxWidth: 190, fontSize: 11, color: "var(--muted-foreground)" }}>
          {order.case_label}
        </div>
      </td>
      <td style={{ ...cell, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
        {order.series} {order.angle_deg > 0 ? `${order.angle_deg}°` : "recto"}
        <div style={{ color: "var(--muted-foreground)" }}>
          {order.jaw_mm.toFixed(1)} mm · {order.total_pieces} pza
        </div>
      </td>
      <td style={cell}>
        <div className="truncate" style={{ maxWidth: 150 }}>{order.workshop_name || "—"}</div>
        {order.needed_by && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
            para {order.needed_by}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ── Detalle ─────────────────────────────────────────────────────────────── */

function Detail({ order, onChanged, onClose }: {
  order: ClipOrder; onChanged: () => void; onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [jaw, setJaw] = useState(order.jaw_mm);
  const [force, setForce] = useState(0);
  const [deviation, setDeviation] = useState("");
  const [receiving, setReceiving] = useState(false);
  const r = order.reception;
  const outOfSpec = isOutOfSpec(order);

  const act = (p: Promise<unknown>) => {
    setBusy(true);
    setError("");
    p.then(() => onChanged())
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo completar la acción"))
      .finally(() => setBusy(false));
  };

  return (
    <Card style={{ position: "sticky", top: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <b style={{ fontFamily: "var(--font-mono)", fontSize: 13, flex: 1 }}>{order.part_no}</b>
        <Badge variant={STATUS_VARIANT[order.status]}>{order.status_label}</Badge>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12 }}>
        {([
          ["Paciente", order.patient || "—"],
          ["Caso", order.case_label || "—"],
          ["Pieza", `${order.series} ${order.angle_deg > 0 ? `${order.angle_deg}°` : "recto"} · mordaza ${order.jaw_mm.toFixed(1)} mm`],
          ["Piezas", String(order.total_pieces)],
          ["Cirujano", order.surgeon || "sin firmar"],
          ["Taller", order.workshop_name || "por asignar"],
          ["Fecha necesaria", order.needed_by || "sin comprometer"],
          ["Uso previsto", order.intended_use],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <div style={{ color: "var(--muted-foreground)" }}>{k}</div>
            <div style={{ fontFamily: "var(--font-mono)" }}>{v}</div>
          </div>
        ))}
      </div>

      {order.override_reason && (
        <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 10, lineHeight: 1.5 }}>
          Se aparta de lo recomendado ({order.advised_label}): {order.override_reason}
        </div>
      )}

      {order.status === "recibida" && (
        <div style={{
          fontSize: 11, marginTop: 10, fontFamily: "var(--font-mono)", lineHeight: 1.5,
          color: outOfSpec ? "var(--destructive)" : "var(--success)",
        }}>
          Medido: mordaza {r.measured_jaw_mm?.toFixed(2)} mm · fuerza {r.measured_force_g?.toFixed(0)} g
          {outOfSpec ? " — fuera de especificación" : " — dentro de especificación"}
        </div>
      )}

      {(order.files.packet || order.files.dossier_internal || order.files.stl) && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {order.files.packet && (
            <Button size="sm" variant="ghost"
                    onClick={() => void api.downloadClipOrderFile(order.part_no, "packet")}>
              Paquete taller (ZIP)
            </Button>
          )}
          {order.files.dossier_internal && (
            <Button size="sm" variant="ghost"
                    onClick={() => void api.downloadClipOrderFile(order.part_no, "dossier_internal")}>
              Copia interna (PDF)
            </Button>
          )}
          {order.files.stl && (
            <Button size="sm" variant="ghost"
                    onClick={() => void api.downloadClipOrderFile(order.part_no, "stl")}>
              STL
            </Button>
          )}
        </div>
      )}

      {receiving && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8, lineHeight: 1.45 }}>
            Aquí la fuerza deja de ser un objetivo: hay que medirla en la pieza que llegó.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Input label="Mordaza medida (mm)" type="number" step="0.05" value={jaw}
                   onChange={(e) => setJaw(Number(e.target.value))} />
            <Input label="Fuerza medida (g)" type="number" step="1" value={force || ""}
                   onChange={(e) => setForce(Number(e.target.value))} />
          </div>
          <Button size="sm" style={{ marginTop: 10 }} disabled={busy || force <= 0}
                  onClick={() => act(api.receiveClipOrder(order.part_no, jaw, force).then(() => setReceiving(false)))}>
            Registrar recepción
          </Button>
        </div>
      )}

      {outOfSpec && (
        <div style={{ marginTop: 12 }}>
          <Input label="Justificación para aceptar la desviación"
                 placeholder="Sin esto solo se puede rechazar"
                 value={deviation} onChange={(e) => setDeviation(e.target.value)} />
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {order.next_states.filter((s) => ADVANCE_LABEL[s]).map((s) => (
          s === "recibida" ? (
            <Button key={s} size="sm" variant="outline" disabled={busy}
                    onClick={() => setReceiving(true)}>
              {ADVANCE_LABEL[s]}
            </Button>
          ) : (
            <Button key={s} size="sm" variant="outline" disabled={busy}
                    onClick={() => act(api.advanceClipOrder(order.part_no, s))}>
              {ADVANCE_LABEL[s]}
            </Button>
          )
        ))}
        {order.status === "recibida" && (
          <>
            <Button size="sm" disabled={busy}
                    onClick={() => act(api.verifyClipOrder(order.part_no, deviation))}>
              Aceptar la pieza
            </Button>
            <Button size="sm" variant="destructive" disabled={busy}
                    onClick={() => act(api.rejectClipOrder(order.part_no, deviation || "Pieza no conforme"))}>
              Rechazar
            </Button>
          </>
        )}
      </div>

      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

/* ── La pantalla ─────────────────────────────────────────────────────────── */

const ALL = "todos";

export function ClipOrdersPage({ patientFilter, onClearPatient }: {
  /** Cuando llega desde la ficha de un paciente, la vista abre ya filtrada. */
  patientFilter?: PatientSummary | null;
  onClearPatient?: () => void;
}) {
  const [orders, setOrders] = useState<ClipOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.listClipOrders({
        status: status === ALL ? undefined : status,
        q: q.trim() || undefined,
        openOnly,
        patientId: patientFilter?.id,
      }),
      api.clipOrdersSummary(),
    ])
      .then(([rows, sum]) => {
        setOrders(rows);
        setCounts(sum.counts);
        setLabels(sum.labels);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer el registro"))
      .finally(() => setLoading(false));
  }, [status, q, openOnly, patientFilter?.id]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);   // la búsqueda no dispara en cada tecla
    return () => clearTimeout(t);
  }, [load, q]);

  // Lo que se pudre primero. Dentro de cada grupo, lo más parado arriba.
  const sorted = useMemo(() => {
    const weight = (o: ClipOrder) => (isOutOfSpec(o) ? 2 : isStale(o) ? 1 : 0);
    return [...orders].sort((a, b) =>
      weight(b) - weight(a) || a.updated_at - b.updated_at);
  }, [orders]);

  const selected = sorted.find((o) => o.part_no === sel) ?? null;
  const needAttention = sorted.filter((o) => attention(o) !== null).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)" }}>
      <Topbar />
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "18px var(--page-padding-x) 40px" }}>
        <PanelHead
          title="Pedidos de clips"
          desc="Todo lo encargado a fabricación, con su estado y lo que falta por hacer."
        />

        {patientFilter && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
            fontSize: 12, padding: "8px 10px", borderRadius: "var(--radius-md)",
            background: "var(--brand-subtle)", color: "var(--brand-subtle-foreground)",
          }}>
            <span>Filtrado por <b>{patientFilter.full_name}</b></span>
            {onClearPatient && (
              <Button size="sm" variant="ghost" onClick={onClearPatient}>Ver todos</Button>
            )}
          </div>
        )}

        {/* Los contadores no son decoración: dicen dónde está parado el trabajo. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => setStatus(ALL)}
            style={chip(status === ALL)}
          >
            Todos
          </button>
          {Object.entries(labels).map(([key, label]) => (
            <button key={key} onClick={() => setStatus(key)} style={chip(status === key)}>
              {label} <span style={{ fontFamily: "var(--font-mono)", opacity: .7 }}>{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <Input
              label="Buscar"
              placeholder="Nº de pieza, paciente, caso, cirujano o taller"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              icon={<Icon name="SEARCH" size={13} />}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--foreground)", cursor: "pointer", paddingBottom: 10 }}>
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            Solo los abiertos
          </label>
        </div>

        {needAttention > 0 && (
          <div style={{ fontSize: 12, color: "var(--warning)", marginBottom: 10 }}>
            {needAttention} pedido(s) piden atención: arriba del todo.
          </div>
        )}

        <ErrorNote>{error}</ErrorNote>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
            {loading && orders.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Leyendo el registro…</div>
            )}
            {!loading && sorted.length === 0 && (
              <Card>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  No hay pedidos que encajen con este filtro. Los pedidos se crean en el
                  paso <b>Fabricación</b> de un caso.
                </div>
              </Card>
            )}
            {sorted.length > 0 && (
              <Card style={{ padding: "14px 16px 4px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={cellHead}>Nº de pieza</th>
                      <th style={cellHead}>Estado</th>
                      <th style={cellHead}>Paciente y caso</th>
                      <th style={cellHead}>Pieza</th>
                      <th style={cellHead}>Taller</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((o) => (
                      <Row
                        key={o.part_no}
                        order={o}
                        selected={o.part_no === sel}
                        onOpen={() => setSel(o.part_no === sel ? null : o.part_no)}
                      />
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          {selected && (
            <div style={{ width: 340, flexShrink: 0 }}>
              <SectionLabel>Detalle</SectionLabel>
              <Detail order={selected} onChanged={load} onClose={() => setSel(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "5px 11px", borderRadius: "var(--radius-full)", cursor: "pointer",
    border: "1px solid " + (active ? "transparent" : "var(--border)"),
    background: active ? "var(--brand-deep)" : "var(--card)",
    color: active ? "#fff" : "var(--foreground)",
    fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: active ? 700 : 500,
    whiteSpace: "nowrap",
  };
}
