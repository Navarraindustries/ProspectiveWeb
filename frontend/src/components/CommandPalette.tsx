/* Paleta de mandos (⌘K / Ctrl+K). Un atajo: todo lo que hace tiene otro camino
   visible. Se abre con el evento de `lib/commands`, con Ctrl+K o con Meta+K
   (también con el foco en un campo) y devuelve el foco a quien lo tenía. */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { useTableta } from "../hooks/useEstrecho";
import { atajoPaleta } from "../lib/plataforma";
import type { PatientSummary } from "../api/types";
import { getCommands, OPEN_PALETTE_EVENT, subscribeCommands } from "../lib/commands";
import { fundido, fundidoTransition, glide, glideTransition, motion, useReducedMotion } from "../motion";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { glass } from "../styles/glass";
import { isConfirmDialogOpen } from "./ConfirmDialog";
import { isSheetOpen } from "./Sheet";
import { ADMIN_GROUP_LABEL, SECTIONS } from "./shell/sections";

interface Props {
  onOpenPatient: (id: number) => void;
  onResume: (sessionId: string, p: PatientSummary) => void;
  /** Si viene, «Recientes» se ve deshabilitado con este texto como pista: con
      el análisis sin guardar, reanudar otra sesión lo tiraría sin preguntar. */
  reanudarBloqueado?: string;
}

interface Row {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  disabled?: boolean;
  run: () => void;
}

const GROUPS = ["Ir a", "Pasos", "Acciones", "Pacientes", "Recientes"] as const;
const ICONO_GRUPO: Record<(typeof GROUPS)[number], IconName> = { "Ir a": "OPEN", Pasos: "TARGET", Acciones: "SPARKLE", Pacientes: "USER", Recientes: "RESUME" };
const MAX_PATIENTS = 8;
const MAX_RECENT = 5;

// Quita los diacríticos combinantes (U+0300–U+036F) tras normalizar a NFD:
// «Zenodo, Caso» y «zenodó» se comparan sin acentos ni mayúsculas.
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function matches(query: string, ...parts: (string | undefined)[]): boolean {
  const hay = fold(parts.filter(Boolean).join(" "));
  return fold(query).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

type PatientsState = { status: "idle" | "loading" | "error" } | { status: "ok"; list: PatientSummary[] };

const veil = { position: "fixed", inset: 0, zIndex: 300, background: "var(--scrim-dense)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "14vh" } as const;
const eyebrow = {
  fontFamily: "var(--font-mono)", fontSize: "var(--text-eyebrow)", textTransform: "uppercase",
  letterSpacing: "var(--tracking-eyebrow)", color: "var(--muted-foreground)", padding: "10px 16px 4px",
} as const;

export function CommandPalette({ onOpenPatient, onResume, reanudarBloqueado }: Props) {
  const { user } = useAuth();
  const nav = useNav();
  const reduced = useReducedMotion();
  const tableta = useTableta();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [patients, setPatients] = useState<PatientsState>({ status: "idle" });
  const previous = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const commands = useSyncExternalStore(subscribeCommands, getCommands);
  const isAdmin = user?.role === "admin";

  // Síncrono, para que dos eventos seguidos no abran dos veces.
  const openRef = useRef(false);

  const show = useCallback(() => {
    if (openRef.current) return;
    // Con una hoja o una confirmación delante, la paleta quedaría debajo de su
    // velo o encima de sus cambios sin guardar: no se abre (ni por atajo, ni
    // por el evento del botón).
    if (isSheetOpen() || isConfirmDialogOpen()) return;
    openRef.current = true;
    const el = document.activeElement;
    previous.current = el instanceof HTMLElement && el !== document.body ? el : null;
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    const el = previous.current;
    previous.current = null;
    if (el && el.isConnected) el.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) close();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, [show, close]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // La lista se pide en cada apertura (un paciente creado o una sesión guardada
  // desde la última vez tienen que salir); mientras llega se enseña la anterior.
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    setPatients((s) => (s.status === "ok" ? s : { status: "loading" }));
    api.listPatients().then(
      (list) => { if (vigente) setPatients({ status: "ok", list }); },
      () => { if (vigente) setPatients({ status: "error" }); },
    );
    return () => { vigente = false; };
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const s of SECTIONS) {
      if (s.group === "admin" && !isAdmin) continue;
      if (!matches(query, s.label, s.group === "admin" ? ADMIN_GROUP_LABEL : "")) continue;
      out.push({
        key: `ir:${s.key}`, group: "Ir a", icon: ICONO_GRUPO["Ir a"], label: s.label,
        hint: s.group === "admin" ? ADMIN_GROUP_LABEL : undefined, run: () => nav.go(s.key),
      });
    }
    const label = { ir: "Ir a", pasos: "Pasos", acciones: "Acciones" } as const;
    for (const c of commands) {
      if (!matches(query, c.label, c.hint, ...(c.keywords ?? []))) continue;
      out.push({ key: `cmd:${c.group}:${c.id}`, group: label[c.group], icon: ICONO_GRUPO[label[c.group]], label: c.label, hint: c.hint, disabled: c.disabled, run: c.run });
    }
    if (patients.status === "ok") {
      if (query.trim()) {
        patients.list
          .filter((p) => matches(query, p.full_name, p.hospital_id))
          .slice(0, MAX_PATIENTS)
          .forEach((p) => out.push({
            key: `pac:${p.id}`, group: "Pacientes", icon: ICONO_GRUPO.Pacientes, label: p.full_name, hint: p.hospital_id, run: () => onOpenPatient(p.id),
          }));
      }
      patients.list
        .filter((p) => p.last_session_id && p.last_session_at)
        .sort((a, b) => Date.parse(b.last_session_at!) - Date.parse(a.last_session_at!))
        .slice(0, MAX_RECENT)
        .filter((p) => matches(query, "Reanudar", p.full_name, p.hospital_id))
        .forEach((p) => out.push({
          key: `rec:${p.id}`, group: "Recientes", icon: ICONO_GRUPO.Recientes, label: `Reanudar · ${p.full_name}`,
          hint: reanudarBloqueado ?? p.hospital_id, disabled: !!reanudarBloqueado,
          run: () => onResume(p.last_session_id!, p),
        }));
    }
    // Orden de grupos fijo; dentro de cada uno, el de llegada.
    return GROUPS.flatMap((g) => out.filter((r) => r.group === g));
  }, [query, commands, patients, isAdmin, nav, onOpenPatient, onResume, reanudarBloqueado]);

  const current = Math.min(active, Math.max(rows.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, current, listId]);

  const exec = (r: Row | undefined) => {
    if (!r || r.disabled) return;
    close();
    r.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      // Dentro del diálogo solo hay un campo: el foco no sale de él.
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.key === "Escape") {
      // Solo la paleta: los oyentes de Escape en `document` (hojas, menús) no lo reciben.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(rows.length ? (current + 1) % rows.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(rows.length ? (current - 1 + rows.length) % rows.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      exec(rows[current]);
    }
  };

  if (!open) return null;

  const variants = reduced ? fundido : glide;
  // Cada grupo es un role=group nombrado por su rótulo; el índice de cada fila
  // sigue siendo el global (el de ↑/↓ y aria-activedescendant).
  const groups = GROUPS
    .map((g) => ({ g, items: rows.flatMap((r, i) => (r.group === g ? [{ r, i }] : [])) }))
    .filter((x) => x.items.length > 0);

  return (
    <div style={veil} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de mandos"
        data-glass
        variants={variants}
        initial="initial"
        animate="animate"
        transition={reduced ? fundidoTransition : glideTransition}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => {
          if (e.target !== searchRef.current) {
            e.preventDefault();
            searchRef.current?.focus();
          }
        }}
        style={{
          ...glass("dense"), width: 640, maxWidth: "calc(100vw - 32px)", maxHeight: "min(560px, 72vh)",
          display: "flex", flexDirection: "column", borderRadius: "var(--radius-xl)", overflow: "hidden",
          color: "var(--foreground)",
        }}
      >
        <input
          ref={searchRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${current}` : undefined}
          aria-label="Buscar en la paleta"
          placeholder="Buscar una sección, un paciente o una acción…"
          title={`Paleta de mandos (${atajoPaleta()})`}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          style={{
            height: "var(--field-h)", padding: "0 18px", background: "transparent", border: "none",
            borderBottom: "1px solid var(--glass-border)", outline: "none", color: "inherit", font: "inherit", fontSize: 15,
          }}
        />
        <div id={listId} role="listbox" aria-label="Resultados" style={{ overflowY: "auto", paddingBottom: 8 }}>
          {patients.status === "error" && (
            <div style={{ ...eyebrow, textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: 12, padding: "10px 16px" }}>
              No se pudo cargar la lista de pacientes
            </div>
          )}
          {rows.length === 0 && (
            <div style={{ padding: "18px 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
              Nada coincide con «{query}»
            </div>
          )}
          {groups.map(({ g, items }, gi) => (
            <div key={g} role="group" aria-labelledby={`${listId}-g${gi}`}>
              <div id={`${listId}-g${gi}`} style={eyebrow}>{g}</div>
              {items.map(({ r, i }) => (
                <div
                  key={r.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  aria-disabled={r.disabled || undefined}
                  onMouseMove={() => { if (i !== current) setActive(i); }}
                  onClick={() => exec(r)}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center",
                    margin: "0 8px", padding: "9px 10px", minHeight: tableta ? 44 : undefined, borderRadius: "var(--radius-md)", fontSize: 14,
                    cursor: r.disabled ? "not-allowed" : "pointer", opacity: r.disabled ? 0.5 : 1,
                    background: i === current ? "var(--glass-hover)" : "transparent",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Icon name={r.icon} size={14} color="var(--muted-foreground)" />
                    <span>{r.label}</span>
                  </span>
                  {r.hint && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{r.hint}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
