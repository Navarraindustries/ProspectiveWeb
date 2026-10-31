/* Paleta de mandos (⌘K / Ctrl+K). Un atajo: todo lo que hace tiene otro camino
   visible. Se abre con el evento de `lib/commands`, con Ctrl+K o con Meta+K
   (también con el foco en un campo) y devuelve el foco a quien lo tenía. */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { PatientSummary } from "../api/types";
import { getCommands, OPEN_PALETTE_EVENT, subscribeCommands } from "../lib/commands";
import { glide, glideTransition, motion, useReducedMotion } from "../motion";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { glass } from "../styles/glass";
import { ADMIN_GROUP_LABEL, SECTIONS } from "./shell/sections";

interface Props {
  onOpenPatient: (id: number) => void;
  onResume: (sessionId: string, p: PatientSummary) => void;
}

interface Row {
  key: string;
  group: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

const GROUPS = ["Ir a", "Pasos", "Acciones", "Pacientes", "Recientes"] as const;
const MAX_PATIENTS = 8;
const MAX_RECENT = 5;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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

export function CommandPalette({ onOpenPatient, onResume }: Props) {
  const { user } = useAuth();
  const nav = useNav();
  const reduced = useReducedMotion();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [patients, setPatients] = useState<PatientsState>({ status: "idle" });
  const previous = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const commands = useSyncExternalStore(subscribeCommands, getCommands);
  const isAdmin = user?.role === "admin";

  const show = useCallback(() => {
    const el = document.activeElement;
    previous.current = el instanceof HTMLElement && el !== document.body ? el : null;
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const el = previous.current;
    previous.current = null;
    if (el && el.isConnected) el.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, [show]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // La lista se pide la primera vez que se abre y se guarda mientras viva el componente.
  useEffect(() => {
    if (!open || patients.status !== "idle") return;
    setPatients({ status: "loading" });
    api.listPatients().then(
      (list) => setPatients({ status: "ok", list }),
      () => setPatients({ status: "error" }),
    );
  }, [open, patients.status]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const s of SECTIONS) {
      if (s.group === "admin" && !isAdmin) continue;
      if (!matches(query, s.label, s.group === "admin" ? ADMIN_GROUP_LABEL : "")) continue;
      out.push({
        key: `ir:${s.key}`, group: "Ir a", label: s.label,
        hint: s.group === "admin" ? ADMIN_GROUP_LABEL : undefined, run: () => nav.go(s.key),
      });
    }
    const label = { ir: "Ir a", pasos: "Pasos", acciones: "Acciones" } as const;
    for (const c of commands) {
      if (!matches(query, c.label, c.hint, ...(c.keywords ?? []))) continue;
      out.push({ key: `cmd:${c.group}:${c.id}`, group: label[c.group], label: c.label, hint: c.hint, disabled: c.disabled, run: c.run });
    }
    if (patients.status === "ok") {
      if (query.trim()) {
        patients.list
          .filter((p) => matches(query, p.full_name, p.hospital_id))
          .slice(0, MAX_PATIENTS)
          .forEach((p) => out.push({
            key: `pac:${p.id}`, group: "Pacientes", label: p.full_name, hint: p.hospital_id, run: () => onOpenPatient(p.id),
          }));
      }
      patients.list
        .filter((p) => p.last_session_id && p.last_session_at)
        .sort((a, b) => Date.parse(b.last_session_at!) - Date.parse(a.last_session_at!))
        .slice(0, MAX_RECENT)
        .filter((p) => matches(query, "Reanudar", p.full_name, p.hospital_id))
        .forEach((p) => out.push({
          key: `rec:${p.id}`, group: "Recientes", label: `Reanudar · ${p.full_name}`, hint: p.hospital_id,
          run: () => onResume(p.last_session_id!, p),
        }));
    }
    // Orden de grupos fijo; dentro de cada uno, el de llegada.
    return GROUPS.flatMap((g) => out.filter((r) => r.group === g));
  }, [query, commands, patients, isAdmin, nav, onOpenPatient, onResume]);

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
    if (e.key === "Escape") {
      e.preventDefault();
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

  const variants = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : glide;
  let lastGroup = "";

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
        transition={reduced ? { duration: 0 } : glideTransition}
        onKeyDown={onKeyDown}
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
          {rows.map((r, i) => {
            const header = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <div key={r.key} role="presentation">
                {header && <div style={eyebrow}>{r.group}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  aria-disabled={r.disabled || undefined}
                  onMouseMove={() => { if (i !== current) setActive(i); }}
                  onClick={() => exec(r)}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
                    margin: "0 8px", padding: "9px 10px", borderRadius: "var(--radius-md)", fontSize: 14,
                    cursor: r.disabled ? "not-allowed" : "pointer", opacity: r.disabled ? 0.5 : 1,
                    background: i === current ? "var(--glass-hover)" : "transparent",
                  }}
                >
                  <span>{r.label}</span>
                  {r.hint && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{r.hint}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
