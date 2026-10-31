import { describe, expect, it } from "vitest";
import type { PatientSummary } from "../api/types";
import { INFORME_STEP, avisosOficina, casosParados, sesionesDeHoy } from "./avisosOficina";

const p = (o: Partial<PatientSummary>): PatientSummary => ({ id: 1, full_name: "Segura, Prueba", hospital_id: "1", dob: "1999-01-01", sex: "", institution: "", study_count: 1, created_at: "2026-10-01T10:00:00", owner_id: 1, shared_with_count: 0, is_shared_with_me: false, last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null, ...o });
const ahora = new Date(2026, 9, 31, 12, 0); // 31-10-2026 12:00 local

describe("avisos de la oficina", () => {
  it("casosParados: sesión de hace 8 días antes del informe sí; de hace 2 no; en el informe no", () => {
    const viejo = p({ id: 1, last_session_at: "2026-10-20T10:00:00", last_session_step: 2 });
    const reciente = p({ id: 2, last_session_at: "2026-10-29T10:00:00", last_session_step: 2 });
    const informe = p({ id: 3, last_session_at: "2026-10-20T10:00:00", last_session_step: INFORME_STEP });
    expect(casosParados([viejo, reciente, informe], ahora).map((x) => x.id)).toEqual([1]);
  });
  it("sesionesDeHoy usa la hora local: 23:30 UTC de ayer puede ser hoy", () => {
    const tz = new Date().getTimezoneOffset(); // en Madrid (UTC+1/+2) es negativo
    const s = p({ id: 1, last_session_at: "2026-10-30T23:30:00" });
    const esperado = tz < 0 ? [1] : [];
    expect(sesionesDeHoy([s], ahora).map((x) => x.id)).toEqual(esperado);
  });
  it("avisosOficina sin pedidos (null) no incluye el aviso de pedidos y omite los que dan 0", () => {
    const a = avisosOficina({ patients: [], orders: null, ahora });
    expect(a).toEqual([]);
  });
  it("avisosOficina nombra hasta tres y cuenta todos", () => {
    const ps = [1, 2, 3, 4].map((i) => p({ id: i, full_name: `P${i}, X`, last_session_at: "2026-10-10T10:00:00", last_session_step: 2 }));
    const [a] = avisosOficina({ patients: ps, orders: [], ahora });
    expect(a.titulo).toBe("4 casos parados antes del informe más de 7 días");
    expect(a.detalle).toBe("P1, X · P2, X · P3, X");
  });
});
