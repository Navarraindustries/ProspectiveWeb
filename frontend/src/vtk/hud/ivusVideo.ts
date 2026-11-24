/* UNI-176: el panel del IVUS virtual entero en el vídeo de VINI 3D.

   El vídeo pinta su propia imagen del visor (no graba la pantalla, que lleva
   el nombre del paciente), y de este panel solo copiaba el corte, la vista
   longitudinal y una línea con la posición y el área. Aquí está lo demás, en
   el mismo orden que en la app: las cifras del corte, el gráfico de secciones,
   el MLA con sus referencias, el bloque del stent desplegado (o el plan del
   flow diverter), las ramas bajo el dispositivo y las notas.

   Los textos salen de `textosDelPanel`, que no toca el lienzo: se prueban
   solos, y `HudIvus` usa los mismos para el bloque del stent. */

import type { FdSizingResult, IvusBranch, IvusCompareResult, IvusResult } from "../../api/types";
import { cifra } from "../../lib/numero";
import type { PaneRect } from "../composeCapture";
import {
  cambioArea, diferenciaDispositivo, estadoDeSeccion, METRICAS_GRAFICO, opcionesQueEncajan, ramasBajo, ramasCerca, zonaDelPlan,
  type MetricaGrafico,
} from "../ivusVirtual";
import { FONDO_GRABACION, type ColoresIvus } from "./dibujoIvus";

export type Tono = "titulo" | "texto" | "aviso" | "pie";
export interface Linea { texto: string; tono: Tono }
/** Una fila de la tabla de medidas: rótulo a la izquierda, valor a la derecha. */
export interface Medida { rotulo: string; valor: string }

export interface TextosPanel {
  /** «12,4 mm · EN LA LESIÓN · Nace una rama Ø 1,4 mm». */
  posicion: Linea[];
  medidas: Medida[];
  /** Sin medidas en esta sección (la malla no rodea la línea). */
  sinMedidas: string | null;
  /** Qué pinta el gráfico de secciones. */
  grafico: string;
  resumen: Linea[];
  dispositivo: Linea[];
  pie: Linea[];
}

type Opcion = ReturnType<typeof opcionesQueEncajan>[number];

export const mm2 = (v: number | null | undefined) => (v == null ? "—" : `${cifra(v, 2)} mm²`);
export const mm1 = (v: number | null | undefined) => (v == null ? "—" : cifra(v, 1));
export const mm2d = (v: number | null | undefined) => (v == null ? "—" : cifra(v, 2));
const conSigno = (v: number) => `${v < 0 ? "−" : "+"}${cifra(Math.abs(v), 1)}`;
const l = (texto: string, tono: Tono = "texto"): Linea => ({ texto, tono });

/** Dónde queda el stent en la sección del recorrido, en una frase. */
export function textoStentAqui(s: IvusResult["sections"][number], st: NonNullable<IvusResult["stent"]>): string {
  if (!s.stent) return `Aquí no hay stent: va de ${mm1(st.from_arc_mm)} a ${mm1(st.to_arc_mm)} mm.`;
  switch (estadoDeSeccion(s, st.noise_mm)) {
    case "separado": return `Aquí: separado ${mm2d(s.stent.max_gap_mm)} mm de la pared.`;
    case "comprimido": return `Aquí: comprimido ${mm2d(s.stent.max_compression_mm)} mm (el nominal es mayor que el vaso).`;
    case "cuello": return s.in_lesion ? "Aquí: dentro de la lesión (no hay pared)." : "Aquí: frente al cuello (no hay pared).";
    default: return "Aquí: en contacto con la pared.";
  }
}

/** Las ramas visibles bajo el dispositivo, en una frase (en la app son enlaces). */
export function textoRamas(ramas: IvusBranch[], sueloMm?: number | null): Linea {
  const perforantes = sueloMm ? `Las perforantes (menos de ${mm1(sueloMm)} mm) no se ven en la imagen.` : "";
  if (!ramas.length) return l(`Ninguna rama visible bajo el dispositivo. ${perforantes}`.trim(), "pie");
  const n = ramas.length;
  const lista = ramas.map((r) => `${mm1(r.arc_mm)} mm (Ø ${mm1(r.calibre_mm)})`).join(", ");
  return l(`${n} rama${n > 1 ? "s" : ""} visible${n > 1 ? "s" : ""} bajo el dispositivo: ${lista}.${perforantes ? ` ${perforantes}` : ""}`, "aviso");
}

export interface EstadoPanel {
  datos: IvusResult;
  i: number;
  comp?: IvusCompareResult | null;
  /** Sin stent desplegado: el plan del flow diverter y la opción elegida. */
  fd?: FdSizingResult | null;
  opcion?: Opcion | null;
  /** Lo que dice el panel mientras no hay plan («Dimensionando…» o el motivo). */
  notaPlan?: string | null;
  metrica: MetricaGrafico;
}

/** Lo que el panel dice en la sección `i`, en texto. */
export function textosDelPanel({ datos, i, comp = null, fd = null, opcion = null, notaPlan = null, metrica }: EstadoPanel): TextosPanel {
  const s = datos.sections[i];
  const posicion: Linea[] = [l(`${mm1(s.arc_mm)} mm`)];
  if (s.in_lesion) posicion.push(l("EN LA LESIÓN", "aviso"));
  else if (s.in_branch) posicion.push(l("RAMA"));
  for (const r of ramasCerca(datos.branches, s.arc_mm)) posicion.push(l(`Nace una rama Ø ${mm1(r.calibre_mm)} mm`, "aviso"));

  const medidas: Medida[] = s.valid ? [
    { rotulo: "Área", valor: mm2(s.area_mm2) },
    { rotulo: "Ø mín · máx", valor: `${mm1(s.d_min_mm)} · ${mm1(s.d_max_mm)} mm` },
    { rotulo: "Excentricidad", valor: s.eccentricity == null ? "—" : cifra(s.eccentricity, 2) },
    { rotulo: "Ø perím. · inscrito", valor: `${mm1(s.d_perimeter_mm)} · ${mm1(s.d_inscribed_mm)} mm` },
    { rotulo: "Circularidad", valor: s.circularity == null ? "—" : cifra(s.circularity, 2) },
  ] : [];
  if (s.valid && comp) {
    const ant = comp.sections[i];
    const d = ant?.valid ? cambioArea(s, ant) : null;
    medidas.push({ rotulo: "Antes", valor: !ant?.valid ? "sin sección"
      : `${mm2(ant.area_mm2)}${d == null ? "" : ` (${d >= 0 ? "+" : "−"}${cifra(Math.abs(d), 0)} %)`}` });
  }

  const rotulo = METRICAS_GRAFICO.find((m) => m.id === metrica)?.rotulo ?? "";
  const grafico = metrica === "diametros" ? `${rotulo}: máx · perímetro · inscrito`
    : metrica === "circularidad" ? `${rotulo}: 1 = círculo`
    : `${rotulo} (mm²)${comp ? " · discontinuo: antes" : ""}`;

  const sm = datos.summary;
  const resumen: Linea[] = sm ? [
    l(`MLA ${mm2(sm.mla_mm2)} a ${mm1(sm.mla_arc_mm)} mm`, "titulo"),
    l(`Ref. prox ${mm2(sm.ref_prox_mm2)} · dist ${mm2(sm.ref_dist_mm2)}`),
    l(sm.area_stenosis_pct == null ? "Estenosis de área: sin referencia" : `Estenosis de área ${cifra(sm.area_stenosis_pct, 0)} %`),
    ...(comp?.summary ? [l(`Antes: MLA ${mm2(comp.summary.mla_mm2)} a ${mm1(comp.summary.mla_arc_mm)} mm`)] : []),
  ] : [l(datos.note || "Sin resumen.", "pie")];

  const dispositivo: Linea[] = [];
  const st = datos.stent;
  if (st) {
    dispositivo.push(l("STENT DESPLEGADO", "titulo"), l(textoStentAqui(s, st)),
      l(`Separado en ${mm1(st.gap_length_mm)} mm (máx. en un corte ${mm2d(st.max_gap_mm)} mm) · comprimido en ${mm1(st.compressed_length_mm)} mm`),
      l(`Anclajes: prox. ${mm2d(st.proximal_gap_mm)} · dist. ${mm2d(st.distal_gap_mm)} mm de separación`));
    if (st.neck_length_mm > 0) dispositivo.push(l(`Sin pared (cuello o saco): ${mm1(st.neck_length_mm)} mm; no es mala aposición`));
    dispositivo.push(textoRamas(ramasBajo(datos.branches, st.from_arc_mm, st.to_arc_mm), datos.branch_floor_mm),
      l(`Rojo: separado · azul: comprimido. Por debajo de ${mm2d(st.noise_mm)} mm (un vóxel) no se distingue.`, "pie"));
  } else if (fd) {
    dispositivo.push(l("PLAN DE FLOW DIVERTER", "titulo"));
    dispositivo.push(opcion ? l(`${opcion.name} ${cifra(opcion.diameter_mm, 2)} × ${cifra(opcion.length_mm, 0)} mm`)
      : l("Ninguna medida del catálogo encaja.", "aviso"));
    dispositivo.push(l(`Anclajes Ø ${fd.proximal.diameter_mm > 0 ? mm2d(fd.proximal.diameter_mm) : "—"} · `
      + `${fd.distal.diameter_mm > 0 ? mm2d(fd.distal.diameter_mm) : "—"} mm · cuello ${mm1(Math.abs(fd.neck_arc_mm[1] - fd.neck_arc_mm[0]))} mm`));
    const zona = zonaDelPlan(s.arc_mm, fd, opcion);
    const vaso = s.valid ? s.d_eq_mm : null;
    if (opcion && zona) {
      const dif = diferenciaDispositivo(opcion.diameter_mm, vaso);
      dispositivo.push(l(`Aquí (${zona}): Ø ${mm2d(opcion.diameter_mm)} frente a vaso ${mm2d(vaso)} mm${dif == null ? "" : ` (${conSigno(dif)})`}`));
    }
    if (opcion) {
      dispositivo.push(l(opcion.deployed_length_mm != null
        ? `Etiquetada ${cifra(opcion.length_mm, 0)} mm; en este vaso se despliega a ~${cifra(opcion.deployed_length_mm, 0)} mm`
        : `Longitud etiquetada ${cifra(opcion.length_mm, 0)} mm; desplegado puede llegar a ~${cifra(opcion.elongated_length_mm, 0)} mm`));
      if (opcion.neck_coverage_pct != null) {
        dispositivo.push(l(`En el cuello: cobertura ~${cifra(opcion.neck_coverage_pct, 0)} %`
          + (opcion.neck_pore_density != null ? ` · ${cifra(opcion.neck_pore_density, 0)} poros/mm²` : "")));
      }
    }
    if (fd.multiple_devices) dispositivo.push(l("Los anclajes difieren mucho: valorar más de un dispositivo.", "aviso"));
    if (opcion) dispositivo.push(textoRamas(ramasBajo(datos.branches, opcion.deploy_arc_mm[0], opcion.deploy_arc_mm[1]), datos.branch_floor_mm));
    dispositivo.push(l("Ámbar: cuello · franja inferior: despliegue.", "pie"));
  } else if (notaPlan) {
    dispositivo.push(l(notaPlan, "pie"));
  }

  return {
    posicion, medidas, grafico, resumen, dispositivo,
    sinMedidas: s.valid ? null : "Aquí la malla no rodea la línea central: sin medidas.",
    pie: [l("Calculado sobre la imagen: muestra la luz, no la pared.", "pie")],
  };
}

/** Lo que `pintarPanel` necesita del lienzo: lo de Ctx2D más medir texto. */
export interface CtxPanel {
  fillStyle: string; font: string; textAlign: "left" | "right" | "center";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic";
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
  measureText(t: string): { width: number };
  save(): void; restore(): void;
}

/** Parte un texto en líneas que caben en `ancho` px. */
export function partir(ctx: Pick<CtxPanel, "measureText">, texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && ctx.measureText(prueba).width > ancho) { out.push(actual); actual = p; }
    else actual = prueba;
  }
  if (actual) out.push(actual);
  return out.length ? out : [""];
}

export interface Lienzos { corte: unknown; largo: unknown; grafico: unknown; anchoLargo: number; altoLargo: number }

const M = 10;            // margen
const SEP = 6;           // entre bloques

/** Pinta el panel en `rect`: título, corte, cifras, longitudinal, gráfico,
 *  resumen, dispositivo y notas. Si el texto no cabe con 11 px, baja la letra
 *  hasta 8 px antes de achicar las imágenes por debajo de lo legible. */
export function pintarPanel(ctx: CtxPanel, rect: PaneRect, lienzos: Lienzos, t: TextosPanel, col: ColoresIvus): void {
  const ancho = rect.w - 2 * M;
  const bloquesTexto = (f: number) => {
    ctx.font = `${f}px ${col.fuente}`;
    const lineas = (ls: Linea[]) => ls.flatMap((x) => partir(ctx, x.texto, ancho).map((txt) => ({ txt, tono: x.tono })));
    return {
      posicion: partir(ctx, t.posicion.map((x) => x.texto).join(" · "), ancho),
      medidas: t.medidas.length + (t.sinMedidas ? partir(ctx, t.sinMedidas, ancho).length : 0),
      resumen: lineas(t.resumen), dispositivo: lineas(t.dispositivo), pie: lineas(t.pie),
    };
  };
  // Alto que no es imagen, con la letra f.
  const altoTexto = (f: number) => {
    const b = bloquesTexto(f);
    const lh = Math.round(f * 1.4);
    const n = 1 /* título */ + b.posicion.length + b.medidas + 1 /* rótulo del gráfico */
      + b.resumen.length + b.dispositivo.length + b.pie.length;
    return n * lh + 7 * SEP + 2 * M;
  };
  let f = 11;
  // Las imágenes necesitan ~45 % del alto para leerse.
  while (f > 8 && rect.h - altoTexto(f) < rect.h * 0.45) f--;
  const lh = Math.round(f * 1.4);
  const b = bloquesTexto(f);
  const libre = Math.max(60, rect.h - altoTexto(f));
  const lado = Math.min(ancho, libre * 0.55);
  const altoL = Math.min(libre * 0.2, ancho * (lienzos.altoLargo / Math.max(1, lienzos.anchoLargo)) || libre * 0.2);
  const altoG = Math.max(20, libre - lado - altoL);

  ctx.save();
  ctx.fillStyle = FONDO_GRABACION;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `${f}px ${col.fuente}`;
  const x = rect.x + M;
  let y = rect.y + M;
  const color = (tono: Tono) => (tono === "aviso" ? col.ambar : tono === "pie" ? col.tenue : col.texto);
  const escribir = (txt: string, tono: Tono) => { ctx.fillStyle = color(tono); ctx.fillText(txt, x, y); y += lh; };

  escribir("IVUS VIRTUAL", "titulo");
  ctx.drawImage(lienzos.corte, rect.x + (rect.w - lado) / 2, y, lado, lado);
  y += lado + SEP;
  const aviso = t.posicion.some((p) => p.tono === "aviso");
  for (const txt of b.posicion) escribir(txt, aviso ? "aviso" : "texto");
  y += SEP;
  for (const m of t.medidas) {
    ctx.fillStyle = col.tenue; ctx.textAlign = "left"; ctx.fillText(m.rotulo, x, y);
    ctx.fillStyle = col.texto; ctx.textAlign = "right"; ctx.fillText(m.valor, rect.x + rect.w - M, y);
    ctx.textAlign = "left";
    y += lh;
  }
  if (t.sinMedidas) for (const txt of partir(ctx, t.sinMedidas, ancho)) escribir(txt, "pie");
  y += SEP;
  ctx.drawImage(lienzos.largo, x, y, ancho, altoL);
  y += altoL + SEP;
  escribir(t.grafico, "pie");
  ctx.drawImage(lienzos.grafico, x, y, ancho, altoG);
  y += altoG + SEP;
  for (const r of b.resumen) escribir(r.txt, r.tono);
  if (b.dispositivo.length) { y += SEP; for (const r of b.dispositivo) escribir(r.txt, r.tono); }
  y += SEP;
  for (const r of b.pie) escribir(r.txt, r.tono);
  ctx.restore();
}
