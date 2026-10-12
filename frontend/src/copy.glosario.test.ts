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

function tsx(dir: string, ext = ".tsx"): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsx(p, ext);
    return p.endsWith(ext) && !p.endsWith(`.test${ext}`) ? [p] : [];
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

/* Pantallas y componentes con rótulos de navegación. La lista de componentes es
   explícita: el menú de usuario (Topbar) nombraba «Solicitudes de registro» y
   ninguna regla lo miraba. */
const archivos = [
  ...tsx(join(SRC, "pages")),
  join(SRC, "components", "planning", "ClipOrderForm.tsx"),
  join(SRC, "components", "Topbar.tsx"),
  /* Los textos compartidos de `lib/` también se pintan (la línea del rol del
     administrador, en Topbar y Usuarios, decía «solicitudes» y esta prueba no
     la miraba porque vivía en roles.ts). */
  ...tsx(join(SRC, "lib"), ".ts"),
];

/* Palabras retiradas en cualquier pantalla. «Estudios» (galería de DICOM
   archivados), «Guardar estudio» y «estudio archivado» siguen vigentes en el
   glosario y ninguna regla los alcanza, por eso no hay lista de permitidas. */
const PROHIBIDAS: [RegExp, string][] = [
  [/Solicitudes de registro/, "«Cuentas pendientes»"],
  /* La palabra sola: entre comillas, entre etiquetas o sola en su línea (un
     nodo de texto de JSX, como el botón de «Pacientes»). «No hay solicitudes
     pendientes.» no entra: lleva más texto. */
  [/[>"`]Solicitudes[<"`]|^\s*Solicitudes\s*$/, "«Cuentas pendientes»"],
  /* Como nombre de una sección dentro de una enumeración («usuarios,
     solicitudes, auditoría»): es la pantalla «Cuentas pendientes». */
  [/,\s*solicitudes\s*,/i, "«cuentas pendientes»"],
  [/Casos \/ estudios|caso \/ estudio|casos\/estudios/i, "«Casos» / «Caso»"],
  [/Nuevo estudio|Crear estudio|Editar estudio|Eliminar estudio/, "«Nuevo caso», «Crear caso», «Editar caso», «Eliminar caso»"],
  [/Sesiones de estudio/, "«Sesiones guardadas»"],
];

/* «solicitud» solo está vetada donde se habla de pedidos de clips. En
   PendingRequests y Signup es la palabra correcta (una cuenta pide acceso). */
const SOLO_PEDIDOS = /solicitud|encargad/i;
const ARCHIVOS_DE_PEDIDOS = ["ClipOrderForm.tsx", "ClipOrders.tsx", "ManufacturePanel.tsx"];

/* Pura, para probar la regla con fragmentos sin tocar el disco. */
function violations(source: string, file: string): string[] {
  const out: string[] = [];
  const nombre = basename(file);
  sinComentarios(source).split("\n").forEach((l, i) => {
    const donde = `${file}:${i + 1}`;
    for (const [re, uso] of PROHIBIDAS) {
      if (re.test(l)) out.push(`${donde} «${l.trim().slice(0, 100)}» → usa ${uso}`);
    }
    if (ARCHIVOS_DE_PEDIDOS.includes(nombre) && SOLO_PEDIDOS.test(l)) {
      out.push(`${donde} «${l.trim().slice(0, 100)}» → usa «pedido»`);
    }
  });
  return out;
}

function hallazgos(): string[] {
  return archivos.flatMap((f) =>
    violations(readFileSync(f, "utf-8"), relative(SRC, f).replace(/\\/g, "/")));
}

describe("la regla de «Solicitudes» suelto", () => {
  it("salta con la palabra sola en su línea, entre etiquetas o entre comillas", () => {
    expect(violations("<Button>\n                  Solicitudes\n</Button>", "P.tsx")).toHaveLength(1);
    expect(violations("<b>Solicitudes</b>", "P.tsx")).toHaveLength(1);
    expect(violations('const l = "Solicitudes";', "P.tsx")).toHaveLength(1);
    expect(violations('label="Solicitudes de registro"', "P.tsx")).toHaveLength(1);
  });

  it("salta con «solicitudes» como sección en una enumeración", () => {
    expect(violations('"Administrador: usuarios, solicitudes, auditoría"', "roles.ts")).toHaveLength(1);
  });

  it("no salta con «No hay solicitudes pendientes.» ni con un comentario", () => {
    expect(violations("<div>No hay solicitudes pendientes.</div>", "P.tsx")).toEqual([]);
    expect(violations("/* Solicitudes — revisión */\n// Solicitudes\n", "P.tsx")).toEqual([]);
  });
});

describe("el glosario en las pantallas", () => {
  it("recorre las pantallas, el formulario de pedido y el menú", () => {
    expect(archivos.length).toBeGreaterThan(10);
    expect(archivos.some((a) => a.endsWith("Topbar.tsx"))).toBe(true);
    expect(archivos.some((a) => a.endsWith("roles.ts") && a.includes("lib"))).toBe(true);
  });

  it("no queda ninguna palabra retirada", () => {
    const h = hallazgos();
    expect(h, "Palabras fuera del glosario:\n" + h.join("\n")).toEqual([]);
  });
});
