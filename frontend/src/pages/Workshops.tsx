/* Talleres — el directorio de quien fabrica las piezas.

   Hasta ahora un taller solo podía darse de alta desde dentro del formulario de
   pedido, y ese formulario no se dibuja cuando la familia NAVARRO™ no puede
   construir la forma que el caso pide. Resultado: en un caso fenestrado no
   había ninguna puerta al taller, y dar de alta los talleres de un convenio por
   adelantado era imposible sin abrir un pedido y luego borrarlo.

   Registrar quién fabrica no tiene nada que ver con si ESTE caso es fabricable,
   así que vive aquí, separado.

   Quién puede qué: cualquiera puede dar de alta y corregir —un cirujano que
   pide una pieza necesita poder hacerlo—; borrar es solo de admin, porque un
   taller borrado desaparece de la lista de todos. Los pedidos ya cursados
   guardan su propia copia de los datos, así que ni corregir ni borrar reescribe
   a dónde se mandó nada. */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Workshop, WorkshopIn } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Card, ErrorNote, PanelHead, SectionLabel } from "../components/PanelHead";
import { Sheet } from "../components/Sheet";
import { Topbar } from "../components/Topbar";
import { useAuth } from "../store/auth";

const BLANK: WorkshopIn = {
  name: "", contact_name: "", email: "", phone: "", address: "", tax_id: "", notes: "",
};

const row: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const cell: React.CSSProperties = { flex: "1 1 180px", minWidth: 0 };

function fmtDate(ts: number): string {
  return ts ? new Date(ts * 1000).toLocaleDateString() : "—";
}

/* ── Alta y edición ──────────────────────────────────────────────────────── */

function WorkshopSheet({ open, workshop, onClose, onSaved }: {
  open: boolean;
  /** null → alta; con taller → edición. */
  workshop: Workshop | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<WorkshopIn>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(workshop
      ? {
          name: workshop.name, contact_name: workshop.contact_name,
          email: workshop.email, phone: workshop.phone, address: workshop.address,
          tax_id: workshop.tax_id, notes: workshop.notes,
        }
      : BLANK);
    setError("");
  }, [open, workshop]);

  const set = (k: keyof WorkshopIn) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const save = () => {
    setBusy(true);
    setError("");
    const done = workshop
      ? api.updateWorkshop(workshop.id, form)
      : api.addWorkshop(form);
    done
      .then(() => { onSaved(); onClose(); })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo guardar el taller"))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={workshop ? "Editar taller" : "Nuevo taller"}
      width={480}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Nombre" value={form.name} onChange={set("name")}
               invalid={!form.name.trim()}
               hint="Como aparecerá en el desplegable al pedir una pieza." />
        <div style={row}>
          <div style={cell}>
            <Input label="Persona de contacto" value={form.contact_name} onChange={set("contact_name")} />
          </div>
          <div style={cell}>
            <Input label="NIF / identificación fiscal" value={form.tax_id} onChange={set("tax_id")} />
          </div>
        </div>
        <div style={row}>
          <div style={cell}>
            <Input label="Correo" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div style={cell}>
            <Input label="Teléfono" value={form.phone} onChange={set("phone")} />
          </div>
        </div>
        <Input label="Dirección" value={form.address} onChange={set("address")} />
        <Input label="Notas" value={form.notes} onChange={set("notes")}
               hint="Plazos habituales, capacidades, lo que convenga recordar." />

        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Los pedidos ya cursados guardan su propia copia de estos datos: corregirlos
          aquí no cambia a dónde se mandó un pedido antiguo.
        </div>

        <ErrorNote>{error}</ErrorNote>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy || !form.name.trim()} style={{ flex: 1 }}>
            {busy ? "Guardando…" : workshop ? "Guardar cambios" : "Registrar taller"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/* ── La pantalla ─────────────────────────────────────────────────────────── */

export function WorkshopsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [toDelete, setToDelete] = useState<Workshop | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listWorkshops()
      .then((w) => { setWorkshops(w); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer el directorio"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const remove = () => {
    if (!toDelete) return;
    api.deleteWorkshop(toDelete.id)
      .then(() => { setToDelete(null); load(); })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "No se pudo borrar el taller");
        setToDelete(null);
      });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)" }}>
      <Topbar />
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "18px var(--page-padding-x) 40px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PanelHead
              title="Talleres"
              desc="Quién fabrica las piezas. Se escriben una vez y se eligen en cada pedido."
            />
          </div>
          <Button
            leadingIcon={<Icon name="STEP_PLAN" size={13} />}
            onClick={() => { setEditing(null); setSheetOpen(true); }}
          >
            Nuevo taller
          </Button>
        </div>

        <ErrorNote>{error}</ErrorNote>

        {loading && workshops.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Leyendo el directorio…</div>
        )}

        {!loading && workshops.length === 0 && (
          <Card>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              Todavía no hay talleres. Registra aquí los del convenio y aparecerán en el
              desplegable al pedir una pieza, en el paso <b>Fabricación</b> de un caso.
            </div>
          </Card>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {workshops.map((w) => (
            <Card key={w.id}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)" }}>
                      {w.name}
                    </div>
                    {w.order_count > 0 && (
                      <Badge variant="subtle">
                        {w.order_count} pedido{w.order_count === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                    {[w.contact_name, w.email, w.phone].filter(Boolean).join(" · ") || "Sin contacto registrado"}
                  </div>
                  {w.address && (
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {w.address}
                    </div>
                  )}
                  {w.notes && (
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                      {w.notes}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                    {w.tax_id && <>NIF {w.tax_id} · </>}
                    alta {fmtDate(w.created_at)}
                    {w.last_used_at ? ` · último pedido ${fmtDate(w.last_used_at)}` : " · sin usar"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Button size="sm" variant="ghost"
                          onClick={() => { setEditing(w); setSheetOpen(true); }}>
                    Editar
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="destructive" onClick={() => setToDelete(w)}>
                      Borrar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {workshops.length > 0 && !isAdmin && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 12 }}>
            Borrar un taller es cosa del administrador: desaparece de la lista de todos.
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <SectionLabel>Cómo se usa</SectionLabel>
          <Card style={{ background: "var(--muted)" }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              Un taller registrado aquí aparece en el desplegable <b>Destinatario</b> del
              paso <b>Fabricación</b> de cualquier caso. Cuando se firma un pedido, sus
              datos se copian dentro: si más tarde cambian de dirección, el pedido antiguo
              sigue diciendo a dónde se mandó de verdad.
            </div>
          </Card>
        </div>
      </div>

      <WorkshopSheet
        open={sheetOpen}
        workshop={editing}
        onClose={() => setSheetOpen(false)}
        onSaved={load}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Borrar taller"
        confirmLabel="Borrar"
        destructive
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      >
        ¿Borrar «{toDelete?.name ?? ""}» del directorio? Deja de poder elegirse en
        pedidos nuevos. Los pedidos ya cursados conservan su propia copia de los
        datos, así que no se pierde a dónde se mandó ninguno.
      </ConfirmDialog>
    </div>
  );
}
