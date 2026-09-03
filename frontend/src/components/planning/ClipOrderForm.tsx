/* Solicitud de un clip NAVARRO™ — el formulario y el registro de pedidos.

   La versión peligrosa de esta pantalla es un formulario en blanco donde el
   cirujano vuelve a teclear la mordaza: en cuanto el número escrito y el STL
   pueden discrepar, al taller le llega una cota que nadie dedujo. Así que el
   sistema rellena la geometría —serie, ángulo, mordaza, tolerancias, fuerza— y
   el usuario rellena solo lo que el sistema no puede saber: quién responde de
   la pieza, cuántas, para cuándo y a dónde va.

   Cambiar una medida calculada exige un motivo, y ese motivo se imprime en
   nuestra copia del dossier. Nunca en silencio. */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type {
  ClipOrder,
  ClipOrderIn,
  ClipOrderPrefill,
  OrderStatus,
  WorkshopIn,
} from "../../api/types";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Input } from "../Input";
import { Card, ErrorNote, SectionLabel } from "../PanelHead";
import { Select } from "../Select";
import { Slider } from "../Slider";

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "subtle" | "success" | "warning" | "destructive"> = {
  borrador: "outline",
  firmado: "subtle",
  enviado: "secondary",
  en_fabricacion: "warning",
  recibida: "warning",
  verificada: "success",
  rechazada: "destructive",
};

/** Los estados a los que se avanza con un botón «siguiente».
    `verificada` y `rechazada` quedan fuera a propósito: son el juicio sobre la
    pieza recibida y tienen botones propios. Sin este filtro aparecían dos veces,
    una con el nombre crudo del estado. */
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  firmado: "Firmar",
  enviado: "Marcar enviado",
  en_fabricacion: "En fabricación",
  recibida: "Registrar recepción",
};

const NECK_SOURCE: Record<string, string> = {
  rim: "borde marcado a mano",
  manual: "punto marcado",
  auto: "estimado automáticamente",
};

/** El backend devuelve una lista de problemas en `detail`; el cliente la
    serializa a texto. Aquí se recupera para poder enseñarlos uno a uno. */
function problemsFrom(err: unknown): string[] {
  const msg = err instanceof ApiError ? err.message : String(err);
  try {
    const parsed: unknown = JSON.parse(msg);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    /* no era JSON: es un mensaje suelto */
  }
  return [msg];
}

const DRAWN_ANGLES = [0, 15, 30, 45, 60, 75, 90] as const;

const row: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const cell: React.CSSProperties = { flex: "1 1 130px", minWidth: 0 };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 0 }}>
      {/* Misma etiqueta que la de Input y Select: un dato de solo lectura no
          tiene por qué rotularse distinto de uno editable. */}
      <div style={{
        fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
        color: "var(--muted-foreground)",
      }}>
        {label}
      </div>
      {/* Mono: es una medida, y en toda la aplicación las medidas se leen en
          JetBrains Mono para que las cifras se alineen y se comparen. */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "var(--text-desc)",
        color: "var(--foreground)",
      }}>
        {value}
      </div>
    </div>
  );
}

function Check({
  checked, onChange, children,
}: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{
      display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12,
      lineHeight: 1.45, color: "var(--foreground)", cursor: "pointer",
    }}>
      {/* alignItems arriba, no centrado: estas etiquetas ocupan dos líneas y
          la casilla debe quedar a la altura de la primera. */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, cursor: "pointer" }}
      />
      <span>{children}</span>
    </label>
  );
}

/* ── El formulario ──────────────────────────────────────────────────────── */

export function ClipOrderForm({
  sessionId, caseId, onPlaced,
}: {
  sessionId: string;
  caseId?: number | null;
  onPlaced: (order: ClipOrder) => void;
}) {
  const [pre, setPre] = useState<ClipOrderPrefill | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  // La pieza. Se rellena desde el prefill; cambiarla exige motivo.
  const [jaw, setJaw] = useState(0);
  const [angle, setAngle] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [extras, setExtras] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // El pedido.
  const [use, setUse] = useState<ClipOrderIn["intended_use"]>("implante");
  const [neededBy, setNeededBy] = useState("");
  const [urgency, setUrgency] = useState<ClipOrderIn["urgency"]>("programada");
  const [steriliser, setSteriliser] = useState<ClipOrderIn["steriliser"]>("hospital");
  const [marking, setMarking] = useState<ClipOrderIn["marking"]>("cuerpo");
  const [notes, setNotes] = useState("");
  const [authRef, setAuthRef] = useState("");
  const [surgeon, setSurgeon] = useState("");

  // El taller: uno guardado, o uno nuevo que queda guardado al usarlo.
  const [workshopId, setWorkshopId] = useState("");
  const [newWorkshop, setNewWorkshop] = useState<WorkshopIn>({
    name: "", contact_name: "", email: "", phone: "", address: "", tax_id: "", notes: "",
  });

  const [d1, setD1] = useState(false);
  const [d2, setD2] = useState(false);
  const [d3, setD3] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.clipOrderPrefill(sessionId, caseId)
      .then((p) => {
        setPre(p);
        setJaw(p.advised_jaw_mm);
        setAngle(p.advised_angle_deg);
        setExtras(p.suggest_extra_sizes);
        setSurgeon((s) => s || (p.can_sign ? p.requester_name : ""));
        setWorkshopId(p.workshops[0]?.id ?? "");
        setProblems([]);
      })
      .catch((e) => setProblems(problemsFrom(e)))
      .finally(() => setLoading(false));
  }, [sessionId, caseId]);

  useEffect(load, [load]);

  if (loading) {
    return <Card><div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Preparando la solicitud…</div></Card>;
  }
  if (!pre) return <ErrorNote>{problems[0] ?? "No se pudo preparar la solicitud."}</ErrorNote>;

  if (!pre.can_order) {
    return (
      <Card>
        <SectionLabel>Solicitar clip</SectionLabel>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted-foreground)" }}>
          {pre.reason || "Este caso no se puede resolver con la familia NAVARRO™."}
          {pre.commercial_name && (
            <> Mientras tanto, el catálogo ofrece <b>{pre.commercial_name}</b>.</>
          )}
        </div>
      </Card>
    );
  }

  const differs = Math.abs(jaw - pre.advised_jaw_mm) > 1e-6
    || Math.abs(angle - pre.advised_angle_deg) > 1e-6;
  const usingNew = workshopId === "__nuevo__";
  // Las tallas van de 3 en 3, así que una mordaza a mitad de camino (11.5 mm)
  // está EXACTAMENTE igual de cerca de dos. Nombrar solo una sería inventar un
  // desempate que el backend tampoco garantiza.
  const gap = Math.min(...pre.stock_sizes_mm.map((x) => Math.abs(x - jaw)));
  const nearestDrawn = pre.stock_sizes_mm
    .filter((x) => Math.abs(Math.abs(x - jaw) - gap) < 1e-9)
    .join(" o ");
  const outsideRange = jaw < Math.min(...pre.stock_sizes_mm) || jaw > Math.max(...pre.stock_sizes_mm);

  const submit = (sign: boolean) => {
    setBusy(true);
    setProblems([]);
    const req: ClipOrderIn = {
      case_id: caseId ?? null,
      series: pre.advised_series,
      angle_deg: angle,
      jaw_mm: jaw,
      quantity,
      extra_sizes_mm: extras ? pre.suggested_extra_sizes_mm : [],
      override_reason: overrideReason.trim(),
      intended_use: use,
      needed_by: neededBy,
      urgency,
      steriliser,
      marking,
      notes,
      authorization_ref: authRef,
      workshop_id: usingNew ? "" : workshopId,
      new_workshop: usingNew ? newWorkshop : null,
      surgeon,
      sign,
      accepts_measurements: d1,
      accepts_force_is_target: d2,
      accepts_not_approved_device: d3,
    };
    api.createClipOrder(sessionId, req)
      .then((o) => { onPlaced(o); load(); })
      .catch((e) => setProblems(problemsFrom(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Un rótulo por bloque y una tarjeta debajo, como en el resto del panel.
          Con los cuatro rótulos dentro de una sola tarjeta se confundían con las
          etiquetas de campo: mismo tamaño, mismas mayúsculas, mismo gris. */}
      <div>
        <SectionLabel>De dónde salen las medidas</SectionLabel>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Cuello" value={`${pre.neck_mm.toFixed(2)} mm`} />
            <Field label="Altura domo" value={`${pre.dome_height_mm.toFixed(2)} mm`} />
            <Field label="Ø máximo" value={`${pre.max_diameter_mm.toFixed(2)} mm`} />
            <Field
              label="Vaso padre"
              value={pre.parent_artery_mm > 0 ? `${pre.parent_artery_mm.toFixed(2)} mm` : "sin medir"}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.5 }}>
            El cuello está <b>{NECK_SOURCE[pre.neck_source] ?? pre.neck_source}</b>. Toda la
            pieza se deriva de esa medida: si no es correcta, corrígela en Morfometría
            antes de pedir nada.
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>La pieza</SectionLabel>
        <Card>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", flex: 1 }}>
              {pre.advised_label}
            </div>
            <Badge variant="subtle">{pre.is_drawn_size ? "talla dibujada" : "a medida"}</Badge>
          </div>

          {/* Un solo control para la mordaza. Antes había un desplegable de tallas
              Y un número al lado: dos mandos para el mismo dato. El Slider es
              además el que ya se usa para elegir mordaza en la ficha a medida, en
              umbralización y en suavizado. */}
          <div style={{ marginTop: 12 }}>
            <Slider
              label="Mordaza (longitud útil de agarre)"
              min={5} max={30} step={0.5} value={jaw} unit=" mm"
              onChange={setJaw}
            />
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
              Tallas dibujadas: {pre.stock_sizes_mm.join(" · ")} mm. Se mecaniza sobre
              la de {nearestDrawn} mm, estirando solo la mordaza.
            </div>
          </div>

          <div style={{ ...row, marginTop: 12 }}>
            <div style={cell}>
              <Select
                label="Acodado"
                value={String(angle)}
                onChange={(e) => setAngle(Number(e.target.value))}
                options={DRAWN_ANGLES.map((a) => ({
                  value: String(a), label: a === 0 ? "Recto (T1)" : `${a}° (T3)`,
                }))}
              />
            </div>
            <div style={cell}>
              <Input
                label="Cantidad" type="number" min="1" max="20"
                value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
          </div>

          {outsideRange && (
            <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 10, lineHeight: 1.5 }}>
              Una mordaza de {jaw.toFixed(1)} mm queda fuera del rango dibujado
              ({Math.min(...pre.stock_sizes_mm)}–{Math.max(...pre.stock_sizes_mm)} mm): el
              perfil se extiende más allá de cualquier talla diseñada, no se interpola
              entre dos.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <Check checked={extras} onChange={setExtras}>
              Pedir también las tallas contiguas
              ({pre.suggested_extra_sizes_mm.map((x) => `${x} mm`).join(", ")}).
              <span style={{ color: "var(--muted-foreground)" }}> {pre.extra_sizes_reason}</span>
            </Check>
          </div>

          {differs && (
            <div style={{ marginTop: 12 }}>
              <Input
                label="Por qué se aparta de lo recomendado"
                placeholder="El motivo queda impreso en nuestra copia del dossier"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                invalid={!overrideReason.trim()}
              />
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel>El pedido</SectionLabel>
        <Card>
          <div style={row}>
            <div style={cell}>
              <Select
                label="Uso previsto" value={use}
                onChange={(e) => setUse(e.target.value as ClipOrderIn["intended_use"])}
                options={[
                  { value: "implante", label: "Implante en paciente" },
                  { value: "prototipo", label: "Prototipo / ensayo no clínico" },
                  { value: "inventario", label: "Repuesto de inventario" },
                ]}
              />
            </div>
            <div style={cell}>
              <Input label="Fecha necesaria" type="date" value={neededBy}
                     onChange={(e) => setNeededBy(e.target.value)} />
            </div>
          </div>

          <div style={{ ...row, marginTop: 12 }}>
            <div style={cell}>
              <Select
                label="Prioridad" value={urgency}
                onChange={(e) => setUrgency(e.target.value as ClipOrderIn["urgency"])}
                options={[
                  { value: "programada", label: "Programada" },
                  { value: "preferente", label: "Preferente" },
                ]}
              />
            </div>
            <div style={cell}>
              <Select
                label="Esterilización" value={steriliser}
                onChange={(e) => setSteriliser(e.target.value as ClipOrderIn["steriliser"])}
                options={[
                  { value: "hospital", label: "La hace el hospital" },
                  { value: "taller", label: "La hace el taller" },
                ]}
              />
            </div>
            <div style={cell}>
              <Select
                label="Marcado" value={marking}
                onChange={(e) => setMarking(e.target.value as ClipOrderIn["marking"])}
                options={[
                  { value: "cuerpo", label: "Nº en el cuerpo" },
                  { value: "ninguno", label: "Sin marcado" },
                ]}
              />
            </div>
          </div>

          {use === "implante" && (
            <div style={{ marginTop: 12 }}>
              <Input label="Referencia de autorización"
                     placeholder="Comité, expediente o «pendiente»"
                     value={authRef} onChange={(e) => setAuthRef(e.target.value)} />
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.5 }}>
            Esterilización y marcado van como <b>supuestos declarados</b> en los dos
            dossiers: nadie ha confirmado todavía cómo se hace aquí, así que el taller
            puede contradecirlos antes de fabricar. El marcado nunca toca la mordaza ni
            el muelle.
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>El taller</SectionLabel>
        <Card>
          <Select
            label="Destinatario" value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            options={[
              ...pre.workshops.map((w) => ({ value: w.id, label: w.name })),
              { value: "__nuevo__", label: "＋ Registrar un taller nuevo" },
            ]}
          />
          {usingNew && (
            <>
              <div style={{ ...row, marginTop: 12 }}>
                <div style={cell}>
                  <Input label="Nombre" value={newWorkshop.name}
                         onChange={(e) => setNewWorkshop({ ...newWorkshop, name: e.target.value })}
                         invalid={!newWorkshop.name.trim()} />
                </div>
                <div style={cell}>
                  <Input label="Contacto" value={newWorkshop.contact_name}
                         onChange={(e) => setNewWorkshop({ ...newWorkshop, contact_name: e.target.value })} />
                </div>
              </div>
              <div style={{ ...row, marginTop: 12 }}>
                <div style={cell}>
                  <Input label="Correo" type="email" value={newWorkshop.email}
                         onChange={(e) => setNewWorkshop({ ...newWorkshop, email: e.target.value })} />
                </div>
                <div style={cell}>
                  <Input label="Teléfono" value={newWorkshop.phone}
                         onChange={(e) => setNewWorkshop({ ...newWorkshop, phone: e.target.value })} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Input label="Dirección" value={newWorkshop.address}
                       onChange={(e) => setNewWorkshop({ ...newWorkshop, address: e.target.value })} />
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8 }}>
                Queda guardado: el próximo pedido lo elige de la lista.
              </div>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <Input label="Observaciones para el taller" value={notes}
                   onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>Quién responde de la pieza</SectionLabel>
        <Card>
          <Input label="Cirujano responsable" value={surgeon}
                 onChange={(e) => setSurgeon(e.target.value)}
                 hint={pre.can_sign ? undefined
                   : "Tu perfil no puede firmar: guarda el borrador y pide la firma."} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <Check checked={d1} onChange={setD1}>
              He revisado las medidas del caso y las asumo.
            </Check>
            <Check checked={d2} onChange={setD2}>
              Sé que la fuerza de cierre ({pre.force_band_g[0]}–{pre.force_band_g[1]} g) es
              un <b>objetivo</b>, no una propiedad del modelo, y hay que medirla en la
              pieza terminada.
            </Check>
            <Check checked={d3} onChange={setD3}>
              Sé que el STL es geometría, no un dispositivo autorizado.
            </Check>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => submit(false)}>
              Guardar borrador
            </Button>
            <Button size="sm" disabled={busy || !pre.can_sign} onClick={() => submit(true)}>
              {busy ? "Generando…" : "Firmar y generar pedido"}
            </Button>
          </div>

          {problems.length > 0 && (
            <ErrorNote>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {problems.map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{x}</li>)}
              </ul>
            </ErrorNote>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── El registro ────────────────────────────────────────────────────────── */

function Reception({ order, onDone }: { order: ClipOrder; onDone: () => void }) {
  const [jaw, setJaw] = useState(order.jaw_mm);
  const [force, setForce] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card style={{ marginTop: 8, background: "var(--muted)" }}>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8, lineHeight: 1.45 }}>
        Aquí la fuerza deja de ser un objetivo: hay que medirla en la pieza que llegó.
      </div>
      <div style={row}>
        <div style={cell}>
          <Input label="Mordaza medida (mm)" type="number" step="0.05" value={jaw}
                 onChange={(e) => setJaw(Number(e.target.value))} />
        </div>
        <div style={cell}>
          <Input label="Fuerza medida (g)" type="number" step="1" value={force || ""}
                 onChange={(e) => setForce(Number(e.target.value))} />
        </div>
        <div style={cell}>
          <Input label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <Button size="sm" style={{ marginTop: 10 }} disabled={busy || force <= 0}
              onClick={() => {
                setBusy(true);
                api.receiveClipOrder(order.part_no, jaw, force, notes)
                  .then(onDone)
                  .catch((e) => setError(problemsFrom(e)[0]))
                  .finally(() => setBusy(false));
              }}>
        Registrar recepción
      </Button>
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

function OrderRow({ order, onChange }: { order: ClipOrder; onChange: () => void }) {
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState("");
  const [deviation, setDeviation] = useState("");
  const r = order.reception;
  const outOfSpec = order.status === "recibida"
    && (r.jaw_within_tolerance === false || r.force_within_band === false);
  const hasFiles = Boolean(order.files.packet || order.files.dossier_internal || order.files.stl);

  const act = (p: Promise<unknown>) => {
    setError("");
    p.then(onChange).catch((e) => setError(problemsFrom(e)[0]));
  };

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{order.part_no}</b>
        <Badge variant={STATUS_VARIANT[order.status]}>{order.status_label}</Badge>
        <span style={{
          fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)",
        }}>
          {order.series} {order.angle_deg > 0 ? `${order.angle_deg}°` : "recto"} ·
          mordaza {order.jaw_mm.toFixed(1)} mm · {order.total_pieces} pieza(s)
          {order.workshop_name ? ` · ${order.workshop_name}` : ""}
        </span>
      </div>

      {order.override_reason && (
        <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>
          Se aparta de lo recomendado ({order.advised_label}): {order.override_reason}
        </div>
      )}

      {order.status === "recibida" && (
        <div style={{
          fontSize: 11, marginTop: 4, fontFamily: "var(--font-mono)",
          color: outOfSpec ? "var(--destructive)" : "var(--success)",
        }}>
          Medido: mordaza {r.measured_jaw_mm?.toFixed(2)} mm · fuerza {r.measured_force_g?.toFixed(0)} g
          {outOfSpec ? " — fuera de especificación" : " — dentro de especificación"}
        </div>
      )}

      {/* Dos filas, no una. Descargar un PDF y rechazar una pieza no son
          acciones del mismo peso, y mezcladas dejaban el botón «STL» varado
          entre «Aceptar» y «Rechazar». */}
      {hasFiles && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
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

      {outOfSpec && (
        <div style={{ marginTop: 10 }}>
          <Input label="Justificación para aceptar la desviación"
                 placeholder="Sin esto solo se puede rechazar"
                 value={deviation} onChange={(e) => setDeviation(e.target.value)} />
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {order.next_states.filter((s) => NEXT_LABEL[s]).map((s) => (
          s === "recibida" ? (
            <Button key={s} size="sm" variant="outline" onClick={() => setReceiving(true)}>
              {NEXT_LABEL[s]}
            </Button>
          ) : (
            <Button key={s} size="sm" variant="outline"
                    onClick={() => act(api.advanceClipOrder(order.part_no, s))}>
              {NEXT_LABEL[s]}
            </Button>
          )
        ))}
        {order.status === "recibida" && (
          <>
            <Button size="sm" onClick={() => act(api.verifyClipOrder(order.part_no, deviation))}>
              Aceptar la pieza
            </Button>
            <Button size="sm" variant="destructive"
                    onClick={() => act(api.rejectClipOrder(order.part_no, deviation || "Pieza no conforme"))}>
              Rechazar
            </Button>
          </>
        )}
        {order.status === "borrador" && (
          <Button size="sm" variant="destructive"
                  onClick={() => act(api.deleteClipOrder(order.part_no))}>
            Borrar borrador
          </Button>
        )}
      </div>

      {receiving && <Reception order={order} onDone={() => { setReceiving(false); onChange(); }} />}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export function ClipOrderList({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const [orders, setOrders] = useState<ClipOrder[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.listClipOrders({ sessionId })
      .then(setOrders)
      .catch((e) => setError(problemsFrom(e)[0]));
  }, [sessionId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!orders.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <SectionLabel>Pedidos de este caso</SectionLabel>
      <Card>
        {orders.map((o) => <OrderRow key={o.part_no} order={o} onChange={load} />)}
        <ErrorNote>{error}</ErrorNote>
      </Card>
    </div>
  );
}
