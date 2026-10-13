/* «Compartir con…» — con qué cuentas se comparte un paciente (spec §6.1).

   La lista se guarda ENTERA (PUT /api/patients/{id}/shares sustituye a la
   anterior), así que la hoja parte de las cuentas que ya lo tienen marcadas y
   lo que se desmarca deja de verlo. Solo quien creó al paciente o un
   administrador llega a abrirla; si aun así el servidor dice que no (403), se
   muestra su texto tal cual. */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { PatientShareOut, UserBrief } from "../api/types";
import { ROLE_LABEL } from "../lib/roles";
import { useAuth } from "../store/auth";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Input } from "./Input";
import { LoadState, loadErrorText } from "./LoadState";
import { ErrorNote } from "./PanelHead";
import { Sheet } from "./Sheet";

/** «Pérez» encuentra «Pérez» y «perez»: los nombres se escriben con y sin tilde. */
const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ShareSheet({
  open,
  patientId,
  patientName,
  current,
  onClose,
  onSaved,
}: {
  open: boolean;
  patientId: number;
  patientName?: string;
  /** Las cuentas con las que ya está compartido. */
  current: number[];
  onClose: () => void;
  /** Con la lista nueva que devuelve el servidor. */
  onSaved: (shares: PatientShareOut[]) => void;
}) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir se parte de lo guardado, no de lo que quedó marcado la vez
  // anterior sin guardar. `current` va por su contenido: el padre lo rehace en
  // cada render y, como dependencia, borraba lo marcado al teclear.
  const currentKey = current.join(",");
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(current));
    setQ("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentKey]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    api.usersBrief()
      .then((u) => { if (alive) setUsers(u); })
      .catch((e) => { if (alive) setLoadError(loadErrorText(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, attempt]);

  // Ni la propia cuenta (ya lo ve) ni la administración (ve a todos): marcarlas
  // no cambiaría nada y haría creer que sin ello no lo verían.
  const candidates = useMemo(
    () => users.filter((u) => u.id !== user?.id && u.role !== "admin"),
    [users, user?.id],
  );
  const shown = useMemo(() => {
    const t = plano(q.trim());
    if (!t) return candidates;
    return candidates.filter((u) => plano(u.full_name).includes(t) || plano(u.username).includes(t));
  }, [candidates, q]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.setPatientShares(patientId, [...selected].sort((a, b) => a - b)));
      onClose();
    } catch (e) {
      // El 403 trae su motivo («solo quien lo creó…»): se dice tal cual.
      setError(e instanceof Error ? e.message : "No se pudo guardar con quién se comparte");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Compartir con…" eyebrow={patientName} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Las cuentas marcadas ven a este paciente, con sus casos y sus sesiones guardadas, y pueden
          trabajar con él. No pueden compartirlo con otras cuentas. La administración ya ve a todos los pacientes.
        </div>
        <Input
          icon={<Icon name="SEARCH" />}
          aria-label="Buscar cuenta"
          placeholder="Buscar por nombre o usuario…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading ? (
          <LoadState state="cargando" />
        ) : loadError ? (
          <LoadState state="error" mensaje={loadError} onRetry={() => setAttempt((n) => n + 1)} />
        ) : candidates.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No hay otras cuentas con las que compartirlo.</div>
        ) : shown.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Ninguna cuenta coincide con la búsqueda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {shown.map((u, i) => (
              <label
                key={u.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "var(--card)",
                }}
              >
                <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{u.full_name || u.username}</span>
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{`${ROLE_LABEL[u.role] ?? u.role} · ${u.username}`}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <div role={error ? "alert" : undefined}><ErrorNote>{error}</ErrorNote></div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button style={{ flex: 1 }} onClick={save} disabled={busy || loading || !!loadError}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Sheet>
  );
}
