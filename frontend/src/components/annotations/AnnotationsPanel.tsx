/* Panel «Anotaciones»: herramientas para crear, lista editable y exportación.

   No recibe props: todo vive en el store, que es también lo que el visor dibuja
   y lo que el hook de guardado manda al servidor. «Ir» no mueve el visor desde
   aquí: la meta del volumen (mm → vóxel) solo la tiene el visor, así que se le
   pide por `viewer:focus-annotation`, como los atajos van por `viewer:shortcut`. */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AnnotationKind } from "../../api/types";
import { ANNOTATION_MODES, usePlanning } from "../../store/planning";
import { ANNOTATIONS_MAX, formatMeasure, LABEL_MAX, measure, NOTE_MAX, toCsv, type Annotation } from "../../vtk/annotations";
import { ANNOTATION_HEX } from "../../vtk/planeColors";
import { Button } from "../Button";
import { Icon } from "../Icon";

const TOOLS: { kind: AnnotationKind; label: string; key: string }[] = [
  { kind: "regla", label: "Regla", key: "R" },
  { kind: "angulo", label: "Ángulo", key: "A" },
  { kind: "region", label: "Región", key: "G" },
  { kind: "marcador", label: "Marcador", key: "T" },
];

const SLICE_TAG = { axial: "AX", coronal: "COR", sagital: "SAG" } as const;
// WHY +1: el HUD de cada corte numera desde 1 («152/384»); la fila tiene que
// decir el mismo número que el médico lee en el visor para ir a buscarla.
const origin = (a: Annotation) => (a.plane ? `${SLICE_TAG[a.plane.plane]} ${a.plane.index + 1}` : "3D");

export const EMPTY_TEXT = "Sin anotaciones. Elige una herramienta y pincha en un corte o en la malla";
export const FULL_TEXT = `Máximo ${ANNOTATIONS_MAX} anotaciones por sesión: borra alguna para añadir otra`;

const smallBtn = {
  height: 26, padding: "0 8px", fontSize: 12, fontWeight: 600,
} as const;

export function AnnotationsPanel() {
  const {
    sessionId, annotations, setAnnotations, selectedAnnotation, setSelectedAnnotation, pickMode, setPickMode,
    noteFocusRequest, setNoteFocusRequest,
  } = usePlanning();
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  // WHY: al cancelar con Escape el input desaparece y algunos navegadores aún
  // le mandan el blur; sin esta marca el blur guardaría lo que se canceló.
  const cancelled = useRef(false);

  // Un marcador recién puesto lleva a su nota (spec §3): el panel ya se abrió
  // (forceOpen), aquí se enfoca el campo en cuanto existe.
  useEffect(() => {
    if (!noteFocusRequest) return;
    const el = document.querySelector<HTMLInputElement>(`[data-note-for="${noteFocusRequest}"]`);
    if (el) { el.focus(); setNoteFocusRequest(null); }
  }, [noteFocusRequest, annotations, setNoteFocusRequest]);

  const patch = (id: string, p: Partial<Annotation>) =>
    setAnnotations((list) => list.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const remove = (id: string) => {
    setAnnotations((list) => list.filter((a) => a.id !== id));
    if (selectedAnnotation === id) setSelectedAnnotation(null);
  };
  const setAllVisible = (visible: boolean) =>
    setAnnotations((list) => (list.every((a) => a.visible === visible) ? list : list.map((a) => ({ ...a, visible }))));

  const startEdit = (a: Annotation) => { cancelled.current = false; setEditing({ id: a.id, value: a.label }); };
  const commitEdit = () => {
    if (cancelled.current || !editing) return;
    // slice además de maxLength: pegar o un IME pueden saltarse el atributo.
    const label = editing.value.trim().slice(0, LABEL_MAX);
    // Un nombre vacío dejaría la fila (y la etiqueta del visor) sin nada que leer.
    if (label) patch(editing.id, { label });
    setEditing(null);
  };
  const cancelEdit = () => { cancelled.current = true; setEditing(null); };

  const goTo = (a: Annotation) => {
    setSelectedAnnotation(a.id);
    window.dispatchEvent(new CustomEvent("viewer:focus-annotation", { detail: a.id }));
  };

  const exportCsv = () => {
    // BOM: Excel en español abre el CSV como ANSI sin él, y «mm²» y «°» salen rotos.
    const blob = new Blob(["﻿" + toCsv(annotations)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anotaciones-${sessionId ?? "sesion"}.csv`;
    link.click();
    // WHY diferido: revocar en el mismo tick cancela la descarga en Safari.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // El visor también se niega a cerrar la 201 (atajos R/A/G/T); aquí se avisa
  // antes de que alguien pinche puntos que no van a quedar.
  const full = annotations.length >= ANNOTATIONS_MAX;

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, a: Annotation) => {
    // Supr dentro del nombre o de la nota borra texto, no la anotación.
    // Y sobre un botón de la fila (ojo, «Ir») tampoco: solo la fila enfocada.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Delete") { e.preventDefault(); remove(a.id); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="group" aria-label="Herramientas de anotación" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {TOOLS.map((t) => {
          const mode = ANNOTATION_MODES[t.kind];
          const active = pickMode === mode;
          return (
            <Button
              key={t.kind}
              variant={active ? "secondary" : "outline"}
              size="sm"
              beam={false}
              title={`${t.label} (${t.key})`}
              aria-pressed={active}
              disabled={full && !active}
              onClick={() => setPickMode(active ? null : mode)}
              style={{
                padding: "0 4px", fontSize: 12,
                boxShadow: active ? `inset 0 -2px 0 ${ANNOTATION_HEX[t.kind]}` : undefined,
              }}
            >
              {t.label}
            </Button>
          );
        })}
      </div>
      {full && <div style={{ fontSize: 12, color: "var(--destructive)", lineHeight: 1.5 }}>{FULL_TEXT}</div>}

      {annotations.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{EMPTY_TEXT}</div>
      ) : (
        <>
          <div role="list" aria-label="Anotaciones" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {annotations.map((a) => {
              const selected = a.id === selectedAnnotation;
              const value = formatMeasure(measure(a));
              const isEditing = editing?.id === a.id;
              return (
                <div
                  key={a.id}
                  role="listitem"
                  data-annotation={a.id}
                  tabIndex={0}
                  aria-current={selected || undefined}
                  onClick={() => setSelectedAnnotation(a.id)}
                  onKeyDown={(e) => onRowKey(e, a)}
                  style={{
                    padding: "8px 10px", borderRadius: "var(--radius-md)", cursor: "pointer",
                    border: `1px solid ${selected ? "var(--brand-deep)" : "var(--border)"}`,
                    background: selected ? "var(--brand-subtle)" : "var(--card)",
                    opacity: a.visible ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: ANNOTATION_HEX[a.kind] }} />
                    {isEditing ? (
                      <input
                        autoFocus
                        aria-label="Nombre de la anotación"
                        maxLength={LABEL_MAX}
                        value={editing.value}
                        onChange={(e) => setEditing({ id: a.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          else if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
                        }}
                        onBlur={commitEdit}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, padding: "2px 6px" }}
                      />
                    ) : (
                      <span
                        title="Clic para renombrar"
                        onClick={() => startEdit(a)}
                        className="truncate"
                        style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--foreground)", cursor: "text" }}
                      >
                        {a.label}
                      </span>
                    )}
                    {value && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--foreground)" }}>{value}</span>}
                  </div>
                  {a.kind === "marcador" && (
                    <input
                      key={a.note}
                      aria-label={`Nota de ${a.label}`}
                      data-note-for={a.id}
                      placeholder="Nota"
                      maxLength={NOTE_MAX}
                      defaultValue={a.note}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      onBlur={(e) => {
                        const note = e.target.value.trim().slice(0, NOTE_MAX);
                        if (note !== a.note) patch(a.id, { note });
                      }}
                      style={{ width: "100%", marginTop: 6, fontSize: 12, padding: "3px 6px", boxSizing: "border-box" }}
                    />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                    <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{origin(a)}</span>
                    {/* stopPropagation: los botones no deben cambiar la fila elegida dos veces. */}
                    <Button variant="ghost" size="sm" beam={false} title={a.visible ? "Ocultar" : "Mostrar"}
                            aria-label={a.visible ? "Ocultar" : "Mostrar"}
                            onClick={(e) => { e.stopPropagation(); patch(a.id, { visible: !a.visible }); }} style={smallBtn}>
                      <Icon name={a.visible ? "EYE" : "EYE_HIDDEN"} size={13} />
                    </Button>
                    <Button variant="ghost" size="sm" beam={false} title="Ir a la anotación en el visor"
                            onClick={(e) => { e.stopPropagation(); goTo(a); }} style={smallBtn}>
                      Ir
                    </Button>
                    <Button variant="ghost" size="sm" beam={false} title="Borrar (Supr)" aria-label="Borrar (Supr)"
                            onClick={(e) => { e.stopPropagation(); remove(a.id); }} style={{ ...smallBtn, color: "var(--destructive)" }}>
                      <Icon name="CLEAR" size={13} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Button variant="outline" size="sm" beam={false} onClick={() => setAllVisible(false)} style={smallBtn}>Ocultar todas</Button>
            <Button variant="outline" size="sm" beam={false} onClick={() => setAllVisible(true)} style={smallBtn}>Mostrar todas</Button>
            <Button variant="outline" size="sm" beam={false} onClick={exportCsv} style={{ ...smallBtn, marginLeft: "auto" }}>Exportar CSV</Button>
          </div>
        </>
      )}
    </div>
  );
}
