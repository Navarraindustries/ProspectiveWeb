/* La regla que se rompió: el saco constreñido tiraba la escena entera.

   Probando con el paciente real, el ensayo de colocación se ponía negro justo
   al llegar el clip al aneurisma y el clip no terminaba de sentarse. La causa
   no estaba en el ensayo sino aquí: la clave de reconstrucción llevaba la URL
   de todas las capas, y el saco cambia de fichero en cada fotograma del cierre.
   Cada cambio tiraba la ventana de render, recargaba el árbol vascular y
   dejaba al ensayo sin las asas de sus piezas. */
import { describe, expect, it } from "vitest";

import { geometryKey, sceneKey, type KeyedLayer } from "./sceneKeys";

const arbol: KeyedLayer = { url: "/data/vessel_tree.vtp" };
const saco = (n: number): KeyedLayer => ({ url: `/data/anim_sac_${n}.vtp`, id: "sac" });
const cuerpo: KeyedLayer = { url: "/data/anim_body.vtp", id: "clip-body" };

describe("cuándo se reconstruye la escena", () => {
  it("un fotograma del saco NO la reconstruye", () => {
    // El fallo exacto: cuatro fotogramas, cuatro reconstrucciones.
    const antes = sceneKey([arbol, saco(1), cuerpo]);
    for (const n of [2, 3, 4]) {
      expect(sceneKey([arbol, saco(n), cuerpo])).toBe(antes);
    }
  });

  it("pero sí se entera de que hay otra geometría que cargar", () => {
    const a = geometryKey([arbol, saco(1), cuerpo]);
    const b = geometryKey([arbol, saco(2), cuerpo]);
    expect(b).not.toBe(a);
    // El árbol no tiene nombre: no entra en el cambio en sitio.
    expect(a).not.toContain("vessel_tree");
  });

  it("una capa que entra o sale sí la reconstruye", () => {
    const con = sceneKey([arbol, saco(1), cuerpo]);
    expect(sceneKey([arbol, saco(1)])).not.toBe(con);
    expect(sceneKey([arbol, cuerpo, saco(1)])).not.toBe(con);
  });

  it("una capa SIN nombre que cambia de fichero sí la reconstruye", () => {
    // Una malla distinta del árbol es otra escena: ahí recargar es lo correcto.
    const a = sceneKey([{ url: "/data/preview_mesh.vtp" }]);
    const b = sceneKey([{ url: "/data/vessel_tree.vtp" }]);
    expect(a).not.toBe(b);
  });

  it("cambiar de capa enfocada la reconstruye", () => {
    // El resalte se aplica al construir el actor, no después.
    const a = sceneKey([arbol, saco(1)], "/data/anim_sac_1.vtp");
    const b = sceneKey([arbol, saco(1)], null);
    expect(a).not.toBe(b);
  });
});
