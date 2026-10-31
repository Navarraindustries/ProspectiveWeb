/* Rail de pasos del flujo de planificación, con una línea de progreso vertical
   que une los círculos hasta el último paso completado de forma consecutiva. */

import type { PatientSummary } from "../../api/types";
import { Badge, riskVariant } from "../Badge";
import { Icon } from "../Icon";
import { Card, SectionLabel } from "../PanelHead";
import type { PipelineStep } from "../../pipeline/steps";

interface Props {
  steps: PipelineStep[];
  activeIndex: number;
  /** Motivo por el que un paso está bloqueado, o null si se puede abrir. */
  missingFor: (i: number) => string | null;
  onGo: (i: number) => void;
  patient?: PatientSummary | null;
  riskLabel?: string | null;
}

// Mitad del círculo (13) + padding vertical del botón (9): centro del círculo
// medido desde el borde superior/inferior del primer/último botón.
const CIRCLE_CENTER = 22;

export function StepRail({ steps, activeIndex, missingFor, onGo, patient, riskLabel }: Props) {
  // Completados consecutivos desde el paso 0; se corta en el primero que no lo está.
  let consecutivos = 0;
  while (consecutivos < steps.length && consecutivos < activeIndex && missingFor(consecutivos) === null) {
    consecutivos++;
  }
  const pct = steps.length > 1 ? (100 * consecutivos) / (steps.length - 1) : 0;

  return (
    <nav
      aria-label="Flujo de planificación"
      className="ws-rail"
      style={{ width: "clamp(176px, 15vw, 232px)", flexShrink: 0, background: "var(--background)", borderRight: "1px solid var(--border)", padding: "18px 12px", overflowY: "auto" }}
    >
      <div title={`Atajos: 1–${steps.length} para cambiar de paso · Esc cancela el marcado`}>
        <SectionLabel className="ws-rail-label" style={{ margin: "0 6px 14px" }}>
          Flujo de planificación
        </SectionLabel>
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Línea de progreso: pista y relleno, centrada con los círculos. */}
        <div
          className="ws-rail-progress"
          aria-hidden
          style={{ position: "absolute", left: 22, top: CIRCLE_CENTER, bottom: CIRCLE_CENTER, width: 2, background: "var(--border)" }}
        >
          <span
            style={{ display: "block", width: "100%", background: "var(--primary)", height: `${pct}%`, transition: "height var(--dur-3) var(--ease-out)" }}
          />
        </div>
        {steps.map((s, i) => {
          const active = i === activeIndex;
          const missing = missingFor(i);
          const done = !missing && i < activeIndex;
          // Nunca se bloquea el paso donde está el usuario: una sesión reanudada
          // con la reproducción vacía quedaría atrapada.
          const locked = !active && !!missing;
          return (
            <button
              key={s.key}
              disabled={locked}
              title={missing ?? s.label}
              aria-current={active ? "step" : undefined}
              onClick={() => !locked && onGo(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "9px 10px",
                borderRadius: "var(--radius-md)",
                border: "none",
                textAlign: "left",
                fontFamily: "var(--font-sans)",
                cursor: locked ? "not-allowed" : "pointer",
                background: active ? "var(--brand-subtle)" : "transparent",
                color: active ? "var(--brand-subtle-foreground)" : locked ? "var(--muted-foreground)" : "var(--foreground)",
                opacity: locked ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  background: active ? "var(--primary)" : done ? "var(--success-bg)" : "var(--muted)",
                  color: active ? "var(--primary-foreground)" : done ? "var(--success)" : "var(--muted-foreground)",
                }}
              >
                {done ? <Icon name="STATUS_OK" size={13} /> : i + 1}
              </span>
              <div className="ws-rail-label" style={{ flex: 1, minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{s.label}</div>
                {s.optional && <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>opcional</div>}
              </div>
              <Icon name={s.icon} size={14} color={active ? "var(--brand-subtle-foreground)" : "var(--muted-foreground)"} />
            </button>
          );
        })}
      </div>

      {patient && (
        <Card className="ws-patient-card" style={{ marginTop: 22, padding: "12px 12px" }}>
          <SectionLabel style={{ marginBottom: 6 }}>Paciente</SectionLabel>
          <div className="truncate" style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{patient.full_name}</div>
          <div className="truncate" style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
            {patient.hospital_id || "—"} · {patient.sex || "—"}
          </div>
          {riskLabel && (
            <div style={{ marginTop: 8 }}>
              <Badge variant={riskVariant(riskLabel)}>{riskLabel}</Badge>
            </div>
          )}
        </Card>
      )}
    </nav>
  );
}
