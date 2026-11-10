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
   taller borrado desaparece de la lista de todos. (Que los pedidos ya cursados
   conserven su copia se dice una sola vez, en «Cómo se usa»: F2-64.) */

import { useCallback, useEffect, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { SCREEN_PATH } from "../store/nav";
import { api } from "../api/client";
import type { Workshop, WorkshopIn } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiscardChanges } from "../components/DiscardChanges";
import { Input } from "../components/Input";
import { Card, ErrorNote, SectionLabel } from "../components/PanelHead";
import { Sheet } from "../components/Sheet";
import { EstadoVacio } from "../components/EstadoVacio";
import { Icon } from "../components/Icon";
import { ESTILO_FECHA, fechaEpoch } from "../lib/fecha";
import { glass } from "../styles/glass";
import { AppShell } from "../components/shell/AppShell";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { PageBody } from "../components/shell/PageBody";

const BLANK: WorkshopIn = {
  name: "", contact_name: "", email: "", phone: "", address: "", tax_id: "", notes: "",
};


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
  // F2-63: el campo no nace en rojo. Solo se marca tras intentar guardar sin
  // nombre, o al salir de él habiendo escrito algo y vaciándolo.
  const [flagName, setFlagName] = useState(false);
  const [typedName, setTypedName] = useState(false);
  // Lo que había al abrir: «Cancelar», el ✕, Escape y el clic fuera tiraban lo
  // escrito sin preguntar. Contra esto se mide si hay cambios.
  const [initial, setInitial] = useState<WorkshopIn>(BLANK);
  const [askDiscard, setAskDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFlagName(false);
    setTypedName(false);
    const cargado: WorkshopIn = workshop
      ? {
          name: workshop.name, contact_name: workshop.contact_name,
          email: workshop.email, phone: workshop.phone, address: workshop.address,
          tax_id: workshop.tax_id, notes: workshop.notes,
        }
      : BLANK;
    setForm(cargado);
    setInitial(cargado);
    setAskDiscard(false);
    setError("");
  }, [open, workshop]);

  const dirty = (Object.keys(BLANK) as (keyof WorkshopIn)[]).some((k) => form[k] !== initial[k]);
  const requestClose = () => {
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  const set = (k: keyof WorkshopIn) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const nameMissing = !form.name.trim();

  const save = () => {
    if (nameMissing) { setFlagName(true); return; }
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
    <>
    <Sheet
      open={open}
      onClose={requestClose}
      title={workshop ? "Editar taller" : "Nuevo taller"}
      width={460}
      footer={
        <>
          {error && (
            <div style={{ flexBasis: "100%" }}>
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <Button onClick={save} disabled={busy || nameMissing}>
            {busy ? "Guardando…" : workshop ? "Guardar cambios" : "Registrar taller"}
          </Button>
          <Button variant="outline" onClick={requestClose} disabled={busy}>Cancelar</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Nombre" obligatorio value={form.name}
               onChange={(e) => { setTypedName(true); set("name")(e); }}
               onBlur={() => { if (typedName && nameMissing) setFlagName(true); }}
               invalid={flagName && nameMissing}
               hint={flagName && nameMissing
                 ? "Escribe el nombre del taller."
                 : "Como aparecerá en el desplegable al pedir una pieza."} />
        <div className="hoja-dos-columnas">
          <Input label="Persona de contacto" value={form.contact_name} onChange={set("contact_name")} />
          <Input label="NIF / identificación fiscal" value={form.tax_id} onChange={set("tax_id")} />
          <Input label="Correo" type="email" value={form.email} onChange={set("email")} />
          <Input label="Teléfono" value={form.phone} onChange={set("phone")} />
        </div>
        <Input label="Dirección" value={form.address} onChange={set("address")} />
        <Input label="Notas" multiline value={form.notes} onChange={set("notes")}
               hint="Plazos habituales, capacidades, lo que convenga recordar." />
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

/* ── La pantalla ─────────────────────────────────────────────────────────── */

export function WorkshopsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const enRouter = useInRouterContext();

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  // El fallo de borrar va en su nota; el de leer sustituye al directorio.
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [toDelete, setToDelete] = useState<Workshop | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    api.listWorkshops()
      .then((w) => { setWorkshops(w); setError(""); })
      // F1-104: el error salía encima de «Todavía no hay talleres…», que
      // invitaba a dar de alta otra vez talleres que ya estaban registrados.
      .catch((e) => setLoadError(`No se pudo leer el directorio: ${loadErrorText(e)}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const remove = () => {
    // Un segundo clic mientras el primero viaja mandaba otro DELETE (y un 404).
    if (!toDelete || deleting) return;
    setDeleting(true);
    api.deleteWorkshop(toDelete.id)
      .then(() => { setToDelete(null); load(); })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "No se pudo borrar el taller");
        setToDelete(null);
      })
      .finally(() => setDeleting(false));
  };

  const abrirAlta = () => { setEditing(null); setSheetOpen(true); };

  return (
    <AppShell
      crumbs={[{ label: "Talleres" }]}
      subtitle="Quién fabrica las piezas. Se escriben una vez y se eligen en cada pedido."
      acciones={[{ id: "nuevo-taller", label: "Nuevo taller", icon: "PLUS", principal: true, abreDialogo: true, onClick: abrirAlta }]}
    >
      <PageBody className="fade-rise">
        <ErrorNote>{error}</ErrorNote>

        {loadError && (
          <Card>
            <LoadState state="error" mensaje={loadError} onRetry={load} />
          </Card>
        )}

        {!loadError && loading && workshops.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Leyendo el directorio…</div>
        )}

        {!loadError && !loading && workshops.length === 0 && (
          <EstadoVacio
            icono="WORKSHOP"
            titulo="Todavía no hay talleres"
            accion={<Button leadingIcon={<Icon name="PLUS" />} onClick={abrirAlta}>Nuevo taller</Button>}
          >
            Registra aquí los del convenio y aparecerán en el desplegable al pedir una pieza,
            en el paso <b>Fabricación</b> de un caso.
          </EstadoVacio>
        )}

        {!loadError && workshops.length > 0 && (
          <div className="tl-rejilla">
            {workshops.map((w) => (
              <article key={w.id} data-glass className="tl-tarjeta" style={glass("normal")}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{w.name}</div>
                  {w.order_count > 0 && (() => {
                    const insignia = (
                      <Badge variant="subtle">
                        {w.order_count === 1 ? "1 pedido" : `${w.order_count} pedidos`}
                      </Badge>
                    );
                    // La insignia lleva a los pedidos de este taller (Pedidos busca por taller).
                    return enRouter
                      ? <Link to={`${SCREEN_PATH.orders}?q=${encodeURIComponent(w.name)}`} title={`Ver los pedidos de ${w.name}`}>{insignia}</Link>
                      : insignia;
                  })()}
                </div>
                <div style={{ fontSize: 13 }}>
                  {[w.contact_name, w.email, w.phone].filter(Boolean).join(" · ") || "Sin contacto registrado"}
                </div>
                {w.address && (
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{w.address}</div>
                )}
                {w.notes && (
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{w.notes}</div>
                )}
                {/* Sans 13 px; mono solo en el código (NIF) y fechas con cifras tabulares. */}
                <div data-testid="tl-alta" style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                  {w.tax_id && <>NIF <span data-mono style={{ fontFamily: "var(--font-mono)" }}>{w.tax_id}</span> · </>}
                  alta <span style={ESTILO_FECHA}>{fechaEpoch(w.created_at)}</span>
                  {w.last_used_at
                    ? <> · último pedido <span style={ESTILO_FECHA}>{fechaEpoch(w.last_used_at)}</span></>
                    : " · sin usar"}
                </div>
                <div className="tl-pie">
                  <Button size="sm" variant="outline" leadingIcon={<Icon name="EDIT" />}
                          aria-label={`Editar el taller ${w.name}`}
                          onClick={() => { setEditing(w); setSheetOpen(true); }}>
                    Editar
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="destructive-ghost" leadingIcon={<Icon name="DELETE" />}
                            aria-label={`Borrar el taller ${w.name}`}
                            onClick={() => setToDelete(w)}>
                      Borrar
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {workshops.length > 0 && !isAdmin && (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 12 }}>
            Borrar un taller es cosa del administrador: desaparece de la lista de todos.
          </div>
        )}

        {/* Con la lista vacía lo explica el estado vacío; con error, no hay lista que explicar. */}
        {!loadError && workshops.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionLabel>Cómo se usa</SectionLabel>
          <p className="pista" role="note">
            <Icon name="INFO" />
            <span>
              Un taller registrado aquí aparece en el desplegable <b>Destinatario</b> del
              paso <b>Fabricación</b> de cualquier caso. Cuando se firma un pedido, sus
              datos se copian dentro: si más tarde cambian de dirección, el pedido antiguo
              sigue diciendo a dónde se mandó de verdad.
            </span>
          </p>
        </div>
        )}
      </PageBody>

      <WorkshopSheet
        open={sheetOpen}
        workshop={editing}
        onClose={() => setSheetOpen(false)}
        onSaved={load}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Borrar taller"
        confirmLabel={deleting ? "Borrando…" : "Borrar"}
        destructive
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      >
        ¿Borrar «{toDelete?.name ?? ""}» del directorio? Deja de poder elegirse en
        pedidos nuevos.
      </ConfirmDialog>
    </AppShell>
  );
}
