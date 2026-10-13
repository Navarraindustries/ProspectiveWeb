import { describe, expect, it } from "vitest";
import { etiquetaAccion, detalleDelBloque } from "./auditoria";

describe("etiquetaAccion", () => {
  it("traduce los códigos conocidos", () => {
    expect(etiquetaAccion("LOGIN")).toBe("Inicio de sesión");
    expect(etiquetaAccion("password_change")).toBe("Cambio de contraseña");
    expect(etiquetaAccion("TREATMENT_DECISION")).toBe("Decisión de tratamiento");
    expect(etiquetaAccion("INTEGRITY_CHECK")).toBe("Verificación de integridad");
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
      ["status", "ok"], ["n", "3"], ["ids", "1, 2"], ["nested", '{"a":1}'], ["vacio", "—"],
    ]);
  });
  it("tolera un payload vacío o que no es JSON", () => {
    expect(detalleDelBloque("")).toEqual([]);
    expect(detalleDelBloque("{}")).toEqual([]);
    expect(detalleDelBloque("texto suelto")).toEqual([["detalle", "texto suelto"]]);
  });
});
