import { describe, expect, it } from "vitest";
import { etiquetaAccion, etiquetaClave, detalleDelBloque } from "./auditoria";

describe("etiquetaAccion", () => {
  it("traduce los códigos conocidos", () => {
    expect(etiquetaAccion("LOGIN")).toBe("Inicio de sesión");
    expect(etiquetaAccion("password_change")).toBe("Cambio de contraseña");
    expect(etiquetaAccion("TREATMENT_DECISION")).toBe("Decisión de tratamiento");
    expect(etiquetaAccion("INTEGRITY_CHECK")).toBe("Verificación de integridad");
    expect(etiquetaAccion("USER_ROLE_CHANGED")).toBe("Rol cambiado");
    expect(etiquetaAccion("USER_APPROVED")).toBe("Cuenta aprobada");
    expect(etiquetaAccion("SESSION_SAVED")).toBe("Sesión guardada");
  });
  it("deja tal cual un código desconocido", () => {
    expect(etiquetaAccion("ALGO_NUEVO")).toBe("ALGO_NUEVO");
  });
});

describe("detalleDelBloque", () => {
  it("convierte el payload en pares clave · valor", () => {
    const d = detalleDelBloque(JSON.stringify({
      status: "ok", n: 3, ids: [1, 2], nested: { a: 1 }, vacio: null,
    }));
    expect(d).toEqual([
      ["Estado", "ok"], ["N", "3"], ["Ids", "1, 2"], ["Nested", '{"a":1}'], ["Vacio", "—"],
    ]);
  });
  it("tolera un payload vacío o que no es JSON", () => {
    expect(detalleDelBloque("")).toEqual([]);
    expect(detalleDelBloque("{}")).toEqual([]);
    expect(detalleDelBloque("texto suelto")).toEqual([["Detalle", "texto suelto"]]);
  });
});

describe("claves y booleanos", () => {
  it("claves y booleanos en castellano", () => {
    expect(detalleDelBloque('{"capture": 3, "case": 7, "ok": true, "broken": false}')).toEqual([["Captura", "3"], ["Caso", "7"], ["Correcto", "Sí"], ["Bloques rotos", "No"]]);
    expect(etiquetaClave("algo_raro")).toBe("Algo raro");
    expect(etiquetaClave("part_no")).toBe("Nº de pieza");
    expect(etiquetaClave("patient_id")).toBe("Paciente");
  });
});
