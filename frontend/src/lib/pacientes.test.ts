import { describe, expect, it } from "vitest";
import type { PatientSummary } from "../api/types";
import { STEPS } from "../pipeline/steps";
import {
  accionPrincipal,
  filtraPestana,
  hayCompartidos,
  pasoDeTarjeta,
  recuentoPacientes,
  resumenHoy,
  tiempoRelativo,
  ultimaActividad,
  ultimaSesion,
} from "./pacientes";

const AHORA = new Date("2026-10-31T12:00:00Z");
const ULTIMO = STEPS.length - 1;

/** Un paciente con todos los campos; cada prueba cambia solo lo que mira. */
function paciente(extra: Partial<PatientSummary> = {}): PatientSummary {
  return {
    id: 1,
    full_name: "Ana Pérez",
    hospital_id: "HC-1",
    dob: "1960-01-01",
    sex: "F",
    institution: "Clínica",
    study_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    owner_id: 7,
    shared_with_count: 0,
    is_shared_with_me: false,
    last_session_at: null,
    last_session_step: null,
    last_session_id: null,
    last_case_label: "",
    last_risk_label: null,
    last_capture_id: null,
    last_imaging_study_id: null,
    ...extra,
  };
}

/** Un ISO de servidor (UTC) hace `ms` milisegundos respecto a AHORA. */
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe("recuentoPacientes y ultimaActividad (movidas de la página, sin cambios)", () => {
  it("recuentoPacientes: plural y singular", () => {
    expect(recuentoPacientes(0)).toBe("Ningún paciente");
    expect(recuentoPacientes(1)).toBe("1 paciente");
    expect(recuentoPacientes(7)).toBe("7 pacientes");
  });

  it("ultimaActividad toma la sesión si es más reciente que el alta", () => {
    const p = paciente({ created_at: "2026-01-01T00:00:00Z", last_session_at: "2026-10-01T00:00:00Z" });
    expect(ultimaActividad(p)).toBe(new Date("2026-10-01T00:00:00Z").getTime());
  });
});

describe("ultimaSesion", () => {
  it("«—» sin sesión y «paso · fecha» con sesión", () => {
    expect(ultimaSesion(paciente())).toBe("—");
    const p = paciente({ last_session_at: "2026-10-11T05:05:09", last_session_step: 1 });
    expect(ultimaSesion(p)).toMatch(/^Segmentación · /);
  });
});

describe("tiempoRelativo", () => {
  it("minutos, horas, ayer, días, semanas y fecha", () => {
    expect(tiempoRelativo(hace(30_000), AHORA)).toBe("hace un momento");
    expect(tiempoRelativo(hace(5 * MIN), AHORA)).toBe("hace 5 min");
    expect(tiempoRelativo(hace(3 * HORA), AHORA)).toBe("hace 3 h");
    expect(tiempoRelativo(hace(26 * HORA), AHORA)).toBe("ayer");
    expect(tiempoRelativo(hace(3 * DIA), AHORA)).toBe("hace 3 d");
    expect(tiempoRelativo(hace(9 * DIA), AHORA)).toBe("hace 1 semana");
    expect(tiempoRelativo(hace(14 * DIA), AHORA)).toBe("hace 2 semanas");
    expect(tiempoRelativo(hace(28 * DIA), AHORA)).toBe("hace 4 semanas");
    // 45 días antes de 31/10/26 es 16/09/26.
    expect(tiempoRelativo(hace(45 * DIA), AHORA)).toBe("16/09/26");
  });

  it("una marca en el futuro cuenta como «hace un momento»", () => {
    expect(tiempoRelativo(new Date(AHORA.getTime() + 10 * MIN).toISOString(), AHORA)).toBe("hace un momento");
  });
});

describe("pasoDeTarjeta", () => {
  it("null sin sesión", () => {
    expect(pasoDeTarjeta(null)).toBeNull();
  });

  it("índice 2 → paso 3, Detección", () => {
    expect(pasoDeTarjeta(2)).toEqual({ n: 3, label: "Detección" });
  });

  it("un índice fuera de rango se acota al último paso", () => {
    expect(pasoDeTarjeta(99)).toEqual({ n: STEPS.length, label: STEPS[ULTIMO].label });
  });
});

describe("accionPrincipal", () => {
  it("planificar sin sesión", () => {
    expect(accionPrincipal(paciente())).toBe("planificar");
  });

  it("abrir-informe en el último paso o más allá", () => {
    expect(accionPrincipal(paciente({ last_session_id: "s", last_session_step: ULTIMO }))).toBe("abrir-informe");
    expect(accionPrincipal(paciente({ last_session_id: "s", last_session_step: 99 }))).toBe("abrir-informe");
  });

  it("reanudar en medio del flujo", () => {
    expect(accionPrincipal(paciente({ last_session_id: "s", last_session_step: 2 }))).toBe("reanudar");
  });
});

describe("resumenHoy", () => {
  it("cuenta en curso, con informe, semana y compartidos", () => {
    const ps = [
      // En curso, con sesión de hace 2 días.
      paciente({ id: 1, last_session_id: "a", last_session_step: 2, last_session_at: hace(2 * DIA) }),
      // Con informe, de hace 10 días (fuera de la semana).
      paciente({ id: 2, last_session_id: "b", last_session_step: ULTIMO, last_session_at: hace(10 * DIA) }),
      // Sin sesión, compartido conmigo.
      paciente({ id: 3, is_shared_with_me: true }),
      // Con informe más allá del último paso, de hace 1 h.
      paciente({ id: 4, last_session_id: "c", last_session_step: 99, last_session_at: hace(HORA) }),
    ];
    expect(resumenHoy(ps, AHORA)).toEqual({ pacientes: 4, enCurso: 1, conInforme: 2, semana: 2, compartidos: 1 });
  });

  it("lista vacía da ceros", () => {
    expect(resumenHoy([], AHORA)).toEqual({ pacientes: 0, enCurso: 0, conInforme: 0, semana: 0, compartidos: 0 });
  });
});

describe("filtraPestana", () => {
  const ps = [
    paciente({ id: 1, owner_id: 7 }),
    paciente({ id: 2, owner_id: 9, is_shared_with_me: true }),
    paciente({ id: 3, owner_id: 7, is_shared_with_me: false }),
  ];

  it("mios: por owner_id", () => {
    expect(filtraPestana(ps, "mios", 7).map((p) => p.id)).toEqual([1, 3]);
  });

  it("compartidos: por is_shared_with_me", () => {
    expect(filtraPestana(ps, "compartidos", 7).map((p) => p.id)).toEqual([2]);
  });

  it("todos devuelve todo", () => {
    expect(filtraPestana(ps, "todos", 7)).toHaveLength(3);
  });

  it("sin usuario conocido, «mios» no muestra nada", () => {
    expect(filtraPestana(ps, "mios", null)).toEqual([]);
  });
});

describe("hayCompartidos", () => {
  it("true si alguno está compartido conmigo", () => {
    expect(hayCompartidos([paciente(), paciente({ is_shared_with_me: true })])).toBe(true);
  });

  it("false si ninguno", () => {
    expect(hayCompartidos([paciente()])).toBe(false);
    expect(hayCompartidos([])).toBe(false);
  });
});
