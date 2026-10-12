/* El glosario de casos, sesiones, pedidos y cuentas pendientes, vigilado en todo
   el código de pantallas.

   Cada familia (V, W, X) se arregló pantalla a pantalla, y a la siguiente que
   alguien toque le vuelve a salir «estudio» donde el glosario dice «caso», o
   «solicitud» donde dice «pedido». Esta prueba recorre las pantallas y falla,
   con archivo y línea, si reaparece una palabra retirada. Los comentarios no
   cuentan: no se ven. */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const SRC = __dirname;

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsx(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

/* Quita comentarios conservando los saltos de línea para que el número de línea
   siga siendo el del archivo. Cuidado con «//» dentro de cadenas (URLs): solo se
   quita cuando va precedido de espacio o de inicio de línea. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const archivos = [
  ...tsx(join(SRC, "pages")),
  join(SRC, "components", "planning", "ClipOrderForm.tsx"),
];

/* Palabras retiradas en cualquier pantalla. */
const PROHIBIDAS: [RegExp, string][] = [
  [/Solicitudes de registro/, "«Cuentas pendientes»"],
  [/[>"`]Solicitudes[<"`]/, "«Cuentas pendientes»"],
  [/Casos \/ estudios|caso \/ estudio|casos\/estudios/i, "«Casos» / «Caso»"],
  [/Nuevo estudio|Crear estudio|Editar estudio|Eliminar estudio/, "«Nuevo caso», «Crear caso», «Editar caso», «Eliminar caso»"],
  [/Sesiones de estudio/, "«Sesiones guardadas»"],
];

/* «solicitud» solo está vetada donde se habla de pedidos de clips. En
   PendingRequests y Signup es la palabra correcta (una cuenta pide acceso). */
const SOLO_PEDIDOS = /solicitud|encargad/i;
const ARCHIVOS_DE_PEDIDOS = ["ClipOrderForm.tsx", "ClipOrders.tsx", "ManufacturePanel.tsx"];

/* «Estudios» sigue siendo la galería de DICOM archivados (Studies.tsx) y
   «Guardar estudio» / «estudio archivado» nombran esa adquisición: el glosario
   los conserva, así que ninguna regla de arriba los toca. La lista queda aquí
   por si una regla futura los alcanzara. */
const PERMITIDAS = ["estudio archivado", "Guardar estudio"];

function hallazgos(): string[] {
  const out: string[] = [];
  for (const f of archivos) {
    const lineas = sinComentarios(readFileSync(f, "utf-8")).split("\n");
    const nombre = basename(f);
    lineas.forEach((l0, i) => {
      let l = l0;
      for (const ok of PERMITIDAS) l = l.split(ok).join("");
      const donde = `${relative(SRC, f).replace(/\\/g, "/")}:${i + 1}`;
      for (const [re, uso] of PROHIBIDAS) {
        if (re.test(l)) out.push(`${donde} «${l.trim().slice(0, 100)}» → usa ${uso}`);
      }
      if (ARCHIVOS_DE_PEDIDOS.includes(nombre) && SOLO_PEDIDOS.test(l)) {
        out.push(`${donde} «${l.trim().slice(0, 100)}» → usa «pedido»`);
      }
    });
  }
  return out;
}

describe("el glosario en las pantallas", () => {
  it("recorre las pantallas y el formulario de pedido", () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it("no queda ninguna palabra retirada", () => {
    expect(hallazgos(), "Palabras fuera del glosario:\n" + hallazgos().join("\n")).toEqual([]);
  });
});
