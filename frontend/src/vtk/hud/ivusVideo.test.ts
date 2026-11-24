/* UNI-176: el panel del IVUS virtual entero en el vídeo de VINI 3D. */

import { describe, expect, it } from "vitest";
import type { FdSizingResult, IvusResult } from "../../api/types";
import { opcionesQueEncajan } from "../ivusVirtual";
import { partir, pintarPanel, textosDelPanel, type CtxPanel } from "./ivusVideo";

const circulo = (r: number) => Array.from({ length: 72 }, (_, k) => [r * Math.cos((2 * Math.PI * k) / 72), r * Math.sin((2 * Math.PI * k) / 72)]);

function datos(): IvusResult {
  const sections = Array.from({ length: 5 }, (_, i) => ({
    arc_mm: i * 0.5, valid: true, in_lesion: i === 2, in_branch: false,
    area_mm2: 7.07, perimeter_mm: 9.4, d_min_mm: 2.9, d_max_mm: 3.1, d_eq_mm: 3,
    d_perimeter_mm: 3.0, d_inscribed_mm: 2.8, circularity: 0.97,
    eccentricity: 0.05, angle_min_deg: 10, angle_max_deg: 100, centroid: [0, 0], contour: circulo(1.5),
  }));
  return {
    n_sections: 5, size_px: 4, fov_mm: 10, stack_url: "/u8", window: [0, 400], sections,
    summary: { mla_mm2: 6.1, mla_index: 2, mla_arc_mm: 1, d_min_mm: 3, d_max_mm: 3, eccentricity: 0,
               ref_prox_mm2: 7.07, ref_prox_arc_mm: 0, ref_dist_mm2: 6.9, ref_dist_arc_mm: 2, ref_mm2: 7, area_stenosis_pct: 13 },
    note: "",
    stent: { from_arc_mm: 0.5, to_arc_mm: 1.5, noise_mm: 0.3, gap_length_mm: 0.5, max_gap_mm: 0.62, compressed_length_mm: 1,
             neck_length_mm: 0.4, proximal_gap_mm: 0.62, distal_gap_mm: 0 },
    branches: [{ arc_mm: 1.0, calibre_mm: 1.4, parent_mm: 3, angle_deg: 90, distance_mm: 1.5 }],
    branch_floor_mm: 0.8,
  };
}

const plan = (): FdSizingResult => ({
  neck_arc_mm: [0.8, 1.2], neck_from_rim: true, total_arc_mm: 2,
  proximal: { arc_from_mm: 0, arc_to_mm: 0.8, diameter_mm: 3.9, min_mm: 3.7, max_mm: 4.1, n_sections: 2, truncated: false },
  distal: { arc_from_mm: 1.2, arc_to_mm: 2, diameter_mm: 3.4, min_mm: 3.2, max_mm: 3.6, n_sections: 2, truncated: false },
  mismatch_mm: 0.5, target_diameter_mm: 4, required_length_mm: 14, multiple_devices: false,
  options: [
    { device_id: "b", name: "Pipeline", manufacturer: "M", diameter_mm: 4.25, length_mm: 16, fits: true, reason: "", neck_note: "",
      narrow_end_note: "", deploy_arc_mm: [0, 2], elongated_length_mm: 21.2, deployed_length_mm: 18 } as never,
  ],
  warnings: [], notes: [], sources: [],
});

describe("los textos del panel para el vídeo", () => {
  it("con stent: la sección, las cifras, el MLA, la aposición, las ramas y las notas", () => {
    const t = textosDelPanel({ datos: datos(), i: 2, metrica: "area" });
    expect(t.posicion.map((l) => l.texto)).toEqual(["1,0 mm", "EN LA LESIÓN", "Nace una rama Ø 1,4 mm"]);
    expect(t.medidas.map((m) => `${m.rotulo}=${m.valor}`)).toEqual([
      "Área=7,07 mm²", "Ø mín · máx=2,9 · 3,1 mm", "Excentricidad=0,05", "Ø perím. · inscrito=3,0 · 2,8 mm", "Circularidad=0,97",
    ]);
    expect(t.grafico).toMatch(/mm²/);
    expect(t.resumen.map((l) => l.texto)).toEqual([
      "MLA 6,10 mm² a 1,0 mm", "Ref. prox 7,07 mm² · dist 6,90 mm²", "Estenosis de área 13 %",
    ]);
    const disp = t.dispositivo.map((l) => l.texto).join("\n");
    expect(disp).toContain("STENT DESPLEGADO");
    expect(disp).toContain("Aquí no hay stent");          // la sección 2 no tiene stent propio
    expect(disp).toContain("máx. en un corte 0,62 mm");
    expect(disp).toContain("Anclajes: prox. 0,62 · dist. 0,00 mm de separación");
    expect(disp).toContain("Sin pared (cuello o saco): 0,4 mm");
    expect(disp).toContain("1 rama visible bajo el dispositivo: 1,0 mm (Ø 1,4)");
    expect(disp).toContain("Rojo: separado · azul: comprimido");
    expect(t.pie[0].texto).toBe("Calculado sobre la imagen: muestra la luz, no la pared.");
  });

  it("sin stent: el plan del flow diverter con la opción elegida", () => {
    const d = { ...datos(), stent: null } as IvusResult;
    const fd = plan();
    const t = textosDelPanel({ datos: d, i: 0, metrica: "diametros", fd, opcion: opcionesQueEncajan(fd)[0] });
    const disp = t.dispositivo.map((l) => l.texto);
    expect(disp[0]).toBe("PLAN DE FLOW DIVERTER");
    expect(disp).toContain("Pipeline 4,25 × 16 mm");
    expect(disp.join("\n")).toContain("Anclajes Ø 3,90 · 3,40 mm · cuello 0,4 mm");
    expect(disp.join("\n")).toContain("en este vaso se despliega a ~18 mm");
    expect(t.grafico).toMatch(/máx · perímetro · inscrito/);
  });

  it("una sección sin malla lo dice en vez de cifras", () => {
    const d = datos();
    d.sections[0] = { ...d.sections[0], valid: false };
    const t = textosDelPanel({ datos: d, i: 0, metrica: "area" });
    expect(t.medidas).toEqual([]);
    expect(t.sinMedidas).toMatch(/sin medidas/);
  });
});

/** Un lienzo de mentira: cada carácter mide 6 px y se apunta lo que se escribe. */
function lienzo() {
  const textos: string[] = [];
  const imagenes: { w: number; h: number; y: number }[] = [];
  const ctx: CtxPanel = {
    fillStyle: "", font: "", textAlign: "left", textBaseline: "top",
    fillRect: () => undefined,
    fillText: (t) => { textos.push(t); },
    drawImage: (_i, _x, y, w, h) => { imagenes.push({ w, h, y }); },
    measureText: (t) => ({ width: t.length * 6 }),
    save: () => undefined, restore: () => undefined,
  };
  return { ctx, textos, imagenes };
}

const colores = { texto: "#fff", tenue: "#888", ambar: "#fa0", rojo: "#f00", plano: "#0f0", fuente: "mono" };

describe("pintar el panel en la columna del vídeo", () => {
  it("lleva las tres imágenes y todos los bloques, y no se sale del alto", () => {
    const { ctx, textos, imagenes } = lienzo();
    const rect = { x: 900, y: 0, w: 400, h: 800 };
    pintarPanel(ctx, rect, { corte: {}, largo: {}, grafico: {}, anchoLargo: 300, altoLargo: 80 },
      textosDelPanel({ datos: datos(), i: 2, metrica: "area" }), colores);
    expect(imagenes).toHaveLength(3);
    const todo = textos.join("\n");
    for (const esperado of ["IVUS VIRTUAL", "Área", "7,07 mm²", "Circularidad", "MLA 6,10 mm²", "STENT DESPLEGADO",
                            "rama visible", "muestra la luz, no la pared"]) {
      expect(todo).toContain(esperado);
    }
    const ultima = imagenes.at(-1)!;
    expect(ultima.y + ultima.h).toBeLessThan(rect.h);
  });

  it("en una columna baja achica la letra antes que las imágenes", () => {
    const { ctx, imagenes } = lienzo();
    const fuentes: string[] = [];
    const ctxFuente = new Proxy(ctx, { set: (o, k, v) => { if (k === "font") fuentes.push(v as string); (o as never)[k] = v as never; return true; } });
    pintarPanel(ctxFuente, { x: 0, y: 0, w: 340, h: 520 }, { corte: {}, largo: {}, grafico: {}, anchoLargo: 300, altoLargo: 80 },
      textosDelPanel({ datos: datos(), i: 2, metrica: "area" }), colores);
    expect(fuentes.at(-1)).not.toBe("11px mono");
    expect(imagenes[0].w).toBeGreaterThan(80);              // el corte sigue siendo legible
  });

  it("parte las frases largas por palabras", () => {
    const { ctx } = lienzo();
    expect(partir(ctx, "uno dos tres cuatro", 6 * 8)).toEqual(["uno dos", "tres", "cuatro"]);
  });
});
