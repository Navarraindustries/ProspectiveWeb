/* FE-16: el contrato (contract.check.ts) solo vale para los tipos que lista.
   Estaba en 121 de 160: un campo renombrado en el servidor compilaba y fallaba
   en pantalla. Este test exige que todo tipo que existe con el mismo nombre en
   el esquema generado y en types.ts esté en el contrato. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leer = (f: string) => readFileSync(resolve(__dirname, f), "utf-8");

describe("cobertura del contrato de la API", () => {
  it("todo tipo compartido por el esquema y types.ts se comprueba al compilar", () => {
    const gen = leer("schema.gen.ts");
    const esquemas = gen.slice(gen.indexOf("schemas: {"));
    const delServidor = new Set([...esquemas.matchAll(/^ {8}([A-Za-z0-9_]+): /gm)].map((m) => m[1]));
    const deLaInterfaz = [...leer("types.ts").matchAll(/^export (?:interface|type) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
    const contrato = new Set([...leer("contract.check.ts").matchAll(/S\["([A-Za-z0-9_]+)"\]/g)].map((m) => m[1]));
    const fuera = deLaInterfaz.filter((n) => delServidor.has(n) && !contrato.has(n));
    expect(fuera).toEqual([]);
  });
});
