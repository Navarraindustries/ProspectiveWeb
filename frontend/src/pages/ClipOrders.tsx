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
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { EstadoVacio } from "../components/EstadoVacio";
import { Input } from "../components/Input";
import { Pastillas } from "../components/Pastillas";
import { Switch } from "../components/Switch";
import { TablaTarjetas, type ColumnaTabla } from "../components/TablaTarjetas";
import { Card, ErrorNote } from "../components/PanelHead";
import { glass } from "../styles/glass";
import { AppShell } from "../components/shell/AppShell";
import { LoadState, loadErrorText } from "../components/LoadState";
import { daysSince, isStale } from "../lib/pedidosParados";
import { shapeLabel } from "../components/planning/clipShape";
import { useAuth } from "../store/auth";
import "../styles/office.css";
import { cifra } from "../lib/numero";
import { fechaDia } from "../lib/fecha";
import { useEstrecho } from "../hooks/useEstrecho";
import { PageBody } from "../components/shell/PageBody";

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
/** Quién puede firmar: lo mismo que exige el servidor (SIGNING_ROLES en
    backend/services/clip_orders.py). Un residente o un observador veía «Firmar»
    y solo al pulsarlo recibía el 403. */
const SIGNING_ROLES = ["medico", "admin"];
const SIGN_DENIED = "Solo un médico responsable puede firmar un pedido.";

const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  firmado: "Firmar",
  enviado: "Marcar enviado",
  en_fabricacion: "En fabricación",
  recibida: "Registrar recepción",
};

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

/** «T1 recto», «T3 angulado 60°», «T4 fenestrado ventana 5 mm»: la serie y la
    forma en minúscula. `shapeLabel` queda como está porque lo usa el quirófano. */
export function nombrePieza(o: Pick<ClipOrder, "series" | "shape" | "angle_deg" | "window_mm">): string {
  const forma = shapeLabel(o.shape, o.angle_deg, o.window_mm);
  return `${o.series} ${forma.charAt(0).toLowerCase()}${forma.slice(1)}`;
}

/** Más de 1280 px: el detalle del pedido va al lado de la lista; en menos, debajo (tarea 12: hoja). */
export function useDetalleLateral(): boolean {
  return !useEstrecho();
}

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 13 };
const ATENUADO: React.CSSProperties = { fontSize: 13, color: "var(--muted-foreground)" };
const ELIPSIS: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 };

function columnasPedido(conTaller: boolean): ColumnaTabla<ClipOrder>[] {
  const cols: ColumnaTabla<ClipOrder>[] = [
    {
      id: "pieza_no", titulo: "Nº de pieza", enTarjeta: "titulo", sinPartir: true,
      celda: (o) => <span style={{ ...MONO, fontWeight: 600 }}>{o.part_no}</span>,
    },
    {
      id: "estado", titulo: "Estado",
      celda: (o) => {
        const flag = attention(o);
        return (
          <>
            <Badge variant={STATUS_VARIANT[o.status]}>{o.status_label}</Badge>
            {flag && (
              <div style={{ marginTop: 4 }}>
                <Badge variant={flag.variant}>{flag.label}</Badge>
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "paciente", titulo: "Paciente y caso",
      celda: (o) => (
        <>
          <div title={o.patient || undefined} style={{ ...ELIPSIS, fontSize: 13 }}>{o.patient || "—"}</div>
          <div title={o.case_label || undefined} style={{ ...ELIPSIS, ...ATENUADO }}>{o.case_label}</div>
        </>
      ),
    },
    {
      id: "pieza", titulo: "Pieza",
      celda: (o) => (
        <>
          <div style={{ fontSize: 13 }}>{nombrePieza(o)}</div>
          <div style={ATENUADO}>
            mordaza <span style={MONO}>{cifra(o.jaw_mm, 1)}</span> mm · <span style={MONO}>{o.total_pieces}</span>{" "}
            {o.total_pieces === 1 ? "pieza" : "piezas"}
          </div>
        </>
      ),
    },
  ];
  if (conTaller) {
    cols.push({
      id: "taller", titulo: "Taller",
      celda: (o) => (
        <>
          <div title={o.workshop_name || undefined} style={{ ...ELIPSIS, fontSize: 13 }}>{o.workshop_name || "—"}</div>
          {o.needed_by && <div style={ATENUADO}>para <span style={MONO}>{fechaDia(o.needed_by)}</span></div>}
        </>
      ),
    });
  }
  return cols;
}

/* ── Detalle ─────────────────────────────────────────────────────────────── */

function Detail({ order, onChanged, onClose, onOpenSession }: {
  order: ClipOrder; onChanged: () => void; onClose: () => void;
  onOpenSession?: (sessionId: string, patientId: number | null) => Promise<void>;
}) {
  const [error, setError] = useState("");
  // El servidor dijo que la sesión ya no existe: no tiene sentido reintentar.
  const [sessionGone, setSessionGone] = useState(false);
  useEffect(() => { setSessionGone(false); }, [order.part_no]);
  const [busy, setBusy] = useState(false);
  const [jaw, setJaw] = useState(order.jaw_mm);
  const [force, setForce] = useState(0);
  const [deviation, setDeviation] = useState("");
  const [receiving, setReceiving] = useState(false);
  // F1-97, F1-98: firmar y rechazar la pieza ocurrían al primer clic. Firmar
  // genera la documentación y compromete al médico; rechazar cierra el pedido.
  const [asking, setAsking] = useState<"firmar" | "rechazar" | null>(null);
  const { user } = useAuth();
  // Sin usuario conocido no se apaga nada: decide el servidor.
  const cannotSign = !!user && !SIGNING_ROLES.includes(user.role);
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
    <Card>
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

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
        {([
          ["Paciente", order.patient || "—"],
          ["Caso", order.case_label || "—"],
          ["Pieza", `${order.series} ${shapeLabel(order.shape, order.angle_deg, order.window_mm)} · mordaza ${cifra(order.jaw_mm, 1)} mm`],
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
        <div style={{ fontSize: 13, color: "var(--warning)", marginTop: 10, lineHeight: 1.5 }}>
          Se aparta de lo recomendado ({order.advised_label}): {order.override_reason}
        </div>
      )}

      {order.status === "recibida" && (
        <div style={{
          fontSize: 13, marginTop: 10, fontFamily: "var(--font-mono)", lineHeight: 1.5,
          color: outOfSpec ? "var(--destructive)" : "var(--success)",
        }}>
          Medido: mordaza {cifra(r.measured_jaw_mm, 2)} mm · fuerza {r.measured_force_g?.toFixed(0)} g
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
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 8, lineHeight: 1.45 }}>
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

      {onOpenSession && (
        <div style={{ marginTop: 12 }}>
          <Button size="sm" variant="secondary" disabled={busy || sessionGone}
                  title={sessionGone ? "La sesión de este pedido ya no existe" : undefined}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    onOpenSession(order.session_id, order.patient_id)
                      .catch((e) => {
                        if ((e as { status?: number })?.status === 404) setSessionGone(true);
                        setError(e instanceof Error ? e.message : "No se pudo abrir el caso");
                      })
                      .finally(() => setBusy(false));
                  }}>
            Abrir el caso
          </Button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {order.next_states.filter((s) => ADVANCE_LABEL[s]).map((s) => (
          s === "recibida" ? (
            <Button key={s} size="sm" variant="outline" disabled={busy}
                    onClick={() => setReceiving(true)}>
              {ADVANCE_LABEL[s]}
            </Button>
          ) : s === "firmado" ? (
            <Button key={s} size="sm" variant="outline" disabled={busy || cannotSign}
                    title={cannotSign ? SIGN_DENIED : undefined}
                    onClick={() => setAsking("firmar")}>
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
                    onClick={() => setAsking("rechazar")}>
              Rechazar
            </Button>
          </>
        )}
      </div>
      {cannotSign && order.next_states.includes("firmado") && (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.45 }}>
          {SIGN_DENIED}
        </div>
      )}

      <ConfirmDialog
        open={asking === "firmar"}
        title={`¿Firmar el pedido ${order.part_no}?`}
        confirmLabel="Firmar el pedido"
        onCancel={() => setAsking(null)}
        onConfirm={() => { setAsking(null); act(api.advanceClipOrder(order.part_no, "firmado")); }}
      >
        Firmas como médico responsable: se genera la documentación para el taller y el
        pedido queda listo para enviar. Una vez firmado ya no es un borrador.
      </ConfirmDialog>
      <ConfirmDialog
        open={asking === "rechazar"}
        title={`¿Rechazar la pieza ${order.part_no}?`}
        confirmLabel="Rechazar la pieza"
        destructive
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          setAsking(null);
          act(api.rejectClipOrder(order.part_no, deviation || "Pieza no conforme"));
        }}
      >
        La pieza queda rechazada{deviation ? ` con el motivo «${deviation}»` : " como «Pieza no conforme»"} y
        el pedido se cierra. No se puede aceptar después.
      </ConfirmDialog>

      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

/* ── La pantalla ─────────────────────────────────────────────────────────── */

const ALL = "todos";
/** Los estados que «Solo los abiertos» oculta (lo mismo que `is_open` en el servidor). */
const CLOSED: string[] = ["verificada", "rechazada"];

export function ClipOrdersPage({
  patientFilter, onClearPatient, onBackToPatient, onCrumbPatients, onOpenSession,
}: {
  /** Cuando llega desde la ficha de un paciente, la vista abre ya filtrada. */
  patientFilter?: PatientSummary | null;
  onClearPatient?: () => void;
  /** Vuelve a la ficha de la que se vino. Sin él no hay botón: desde la barra
   *  lateral no se viene de ninguna ficha. */
  onBackToPatient?: () => void;
  /** Primer tramo de la miga cuando llega filtrado: la lista de pacientes. */
  onCrumbPatients?: () => void;
  /** Reabre la sesión que creó un pedido. Rechaza con el motivo si no puede
   *  (sesión borrada, sin paciente): «Abrir el caso» lo enseña junto al botón. */
  onOpenSession?: (sessionId: string, patientId: number | null) => Promise<void>;
}) {
  const [orders, setOrders] = useState<ClipOrder[]>([]);
  // Todo lo del paciente y la búsqueda actuales, sin estado ni «solo abiertos»:
  // de ahí salen los recuentos de las pastillas (F1-95) y el «no hay ninguno».
  const [base, setBase] = useState<ClipOrder[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      api.listClipOrders({
        status: status === ALL ? undefined : status,
        q: q.trim() || undefined,
        openOnly,
        patientId: patientFilter?.id,
      }),
      api.listClipOrders({ q: q.trim() || undefined, patientId: patientFilter?.id }),
      api.clipOrdersSummary(),
    ])
      .then(([rows, all, sum]) => {
        setOrders(rows);
        setBase(all);
        setLabels(sum.labels);
        setError("");
      })
      // F1-99: el error salía encima de «No hay pedidos que encajen con este
      // filtro», y quien lo leía buscaba el fallo en el filtro, no en el servidor.
      .catch((e) => setError(`No se pudo leer el registro: ${loadErrorText(e)}`))
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
  // «Ninguno todavía» se decide con el registro del paciente (o el global) sin
  // estado ni «solo abiertos»: por defecto esa casilla está marcada y una lista
  // vacía puede deberse a ella. Con una búsqueda activa, vacío = filtro.
  const noOrdersAtAll = base.length === 0 && !q.trim();
  // F1-95: los recuentos son los de lo que se está mirando, no los globales.
  const counts: Record<string, number> = {};
  for (const o of base) counts[o.status] = (counts[o.status] ?? 0) + 1;
  const todosCount = openOnly ? base.filter((o) => !CLOSED.includes(o.status)).length : base.length;
  const lateral = useDetalleLateral();
  const needAttention = sorted.filter((o) => attention(o) !== null).length;

  return (
    <AppShell crumbs={patientFilter
      ? [
          { label: "Pacientes", onClick: onCrumbPatients },
          { label: patientFilter.full_name, onClick: onBackToPatient },
          { label: "Pedidos" },
        ]
      : [{ label: "Pedidos de clips" }]}
      subtitle="Todos los pedidos de fabricación, con su estado y lo que falta por hacer.">
      <PageBody className="fade-rise">
        {/* F2-27: «Pedidos» cerraba la ficha y esta pantalla no tenía camino de
            vuelta al paciente; solo «Ver todos», que tampoco lleva a él. */}
        {onBackToPatient && (
          <div style={{ marginBottom: 8 }}>
            <Button size="sm" variant="ghost" leadingIcon={<Icon name="BACK" size={14} />} onClick={onBackToPatient}>
              Volver a la ficha
            </Button>
          </div>
        )}
        {patientFilter && (
          <div
            data-glass
            style={{
              ...glass("normal"),
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12,
              fontSize: 13, padding: "6px 8px 6px 14px", borderRadius: "var(--radius-full)",
              color: "var(--foreground)",
            }}
          >
            <span>Filtrado por <b>{patientFilter.full_name}</b></span>
            {onClearPatient && (
              <Button size="sm" variant="ghost" onClick={onClearPatient}>Ver todos</Button>
            )}
          </div>
        )}

        {/* Los contadores no son decoración: dicen dónde está parado el trabajo. */}
        <div style={{ marginBottom: 12 }}>
          <Pastillas
            rotulo="Filtrar por estado"
            valor={status}
            opciones={[
              { id: ALL, label: "Todos", cuenta: todosCount },
              ...Object.entries(labels).map(([key, label]) => ({ id: key, label, cuenta: counts[key] ?? 0 })),
            ]}
            onCambiar={(id) => {
              setStatus(id);
              // F1-96: con «solo los abiertos» puesto, estas dos darían siempre vacío.
              if (CLOSED.includes(id)) setOpenOnly(false);
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <Input
              aria-label="Buscar pedidos"
              placeholder="Nº de pieza, paciente, caso, cirujano o taller"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              icon={<Icon name="SEARCH" size={14} />}
            />
          </div>
          <Switch label="Solo los abiertos" checked={openOnly} onChange={setOpenOnly} />
        </div>

        {needAttention > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--warning)", marginBottom: 10 }}>
            <Icon name="STATUS_WARN" size={14} />
            {needAttention === 1
              ? "1 pedido pide atención: está arriba del todo"
              : `${needAttention} pedidos piden atención: están arriba del todo`}
          </div>
        )}

        <div style={lateral
          ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }
          : { display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <TablaTarjetas
              rotulo="Pedidos de clips"
              filas={error ? [] : sorted}
              columnas={columnasPedido(!(lateral && selected))}
              clave={(o) => o.part_no}
              onFila={(o) => setSel(o.part_no === sel ? null : o.part_no)}
              seleccionada={(o) => o.part_no === sel}
              vacio={error ? (
                <Card><LoadState state="error" mensaje={error} onRetry={load} /></Card>
              ) : loading ? (
                <div style={{ ...ATENUADO, padding: 16 }}>Leyendo el registro…</div>
              ) : noOrdersAtAll ? (
                <EstadoVacio icono="ORDER" titulo={patientFilter ? "Este paciente aún no tiene pedidos" : "No hay pedidos todavía"}>
                  Los pedidos se crean en el paso <b>Fabricación</b> de un caso.
                </EstadoVacio>
              ) : (
                <EstadoVacio icono="FILTER" titulo="Ningún pedido encaja con este filtro." />
              )}
            />
          </div>

          {selected && (
            <aside
              aria-label={`Detalle del pedido ${selected.part_no}`}
              style={lateral ? { position: "sticky", top: 16, minWidth: 0 } : { minWidth: 0 }}
            >
              <Detail order={selected} onChanged={load} onClose={() => setSel(null)}
                      onOpenSession={onOpenSession} />
            </aside>
          )}
        </div>
      </PageBody>
    </AppShell>
  );
}
