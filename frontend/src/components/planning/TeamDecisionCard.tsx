/* «Decisión del equipo» (F1-176).

   El paso 5 solo tenía «Evaluar CLIP vs ENDOVASCULAR» y «Re-evaluar»: lo que
   llegaba al informe era lo que recomendaba el algoritmo, nunca lo que el
   equipo decidía. Aquí se registra la decisión y quién la toma; se guarda en
   cuanto se elige (y los textos al salir del campo), vuelve al reanudar y el
   informe la imprime primero, bajo «Plan elegido».

   Se puede usar sin recomendación: el equipo puede decidir sin el motor. Por
   eso el estado es local y se lee del servidor si la recomendación no lo trae.
   «Quién decide» NO se rellena con el usuario conectado: la auditoría F1 lo
   rechazó en el campo del cirujano, porque quien teclea no es quien decide. */

import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { TeamDecision, TeamDecisionKey } from "../../api/types";
import { Input } from "../Input";
import { Card, ErrorNote } from "../PanelHead";
import { Select } from "../Select";
import { usePlanning } from "../../store/planning";

const EMPTY: TeamDecision = { team_decision: null, decided_by: "", other_text: "" };

const OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Sin registrar" },
  { value: "clipaje", label: "Clipaje" },
  { value: "endovascular", label: "Endovascular" },
  { value: "vigilar", label: "Vigilar" },
  { value: "otra", label: "Otra" },
];

export function TeamDecisionCard() {
  const planning = usePlanning();
  const { sessionId, treatment } = planning;
  const [team, setTeam] = useState<TeamDecision>(() => treatment?.team ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  // Si la persona ya ha tocado algo, la lectura que llega tarde no lo pisa.
  const touched = useRef(false);

  useEffect(() => {
    // Otra sesión (otro paciente): lo elegido en la anterior no es de esta. Sin
    // vaciarlo, la tarjeta mostraba la decisión del caso anterior hasta que la
    // lectura trajera una, y si esta sesión no tenía ninguna se quedaba.
    setTeam(treatment?.team ?? EMPTY);
    setError(null);
    touched.current = false;
    if (!sessionId || treatment?.team) return;
    let alive = true;
    api.getTeamDecision(sessionId)
      .then((t) => { if (alive && !touched.current && t.team_decision) setTeam(t); })
      .catch(() => { /* sin decisión guardada o sin servidor: se queda vacía */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const save = async (next: TeamDecision) => {
    if (!sessionId) return;
    setError(null);
    try {
      const res = await api.setTeamDecision(sessionId, next);
      // La recomendación del store la lleva también, para que Dispositivos e
      // Informe la vean sin volver a pedirla.
      if (treatment) planning.setTreatment({ ...treatment, team: res.team_decision ? res : null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la decisión del equipo");
    }
  };

  const choose = (value: string) => {
    touched.current = true;
    const next: TeamDecision = {
      ...team,
      team_decision: (value || null) as TeamDecisionKey | null,
      other_text: value === "otra" ? team.other_text : "",
    };
    setTeam(next);
    void save(next);
  };

  // Los textos se guardan al salir del campo; sin decisión elegida no hay
  // nada que registrar todavía (se guardan con ella).
  const commitText = () => {
    if (team.team_decision) void save(team);
  };
  const edit = (patch: Partial<TeamDecision>) => {
    touched.current = true;
    setTeam((t) => ({ ...t, ...patch }));
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
        <Select
          label="Decisión del equipo"
          options={OPTIONS}
          value={team.team_decision ?? ""}
          onChange={(e) => choose(e.target.value)}
        />
        <Input
          label="Quién decide"
          placeholder="Nombre o comité"
          maxLength={120}
          value={team.decided_by}
          onChange={(e) => edit({ decided_by: e.target.value })}
          onBlur={commitText}
        />
      </div>
      {team.team_decision === "otra" && (
        <div style={{ marginTop: 12 }}>
          <Input
            label="Cuál"
            placeholder="Bypass, tratamiento combinado…"
            maxLength={200}
            value={team.other_text}
            onChange={(e) => edit({ other_text: e.target.value })}
            onBlur={commitText}
          />
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
        Va primero en el informe, bajo «Plan elegido». La recomendación del
        algoritmo queda como referencia.
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
