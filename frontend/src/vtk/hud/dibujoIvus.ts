/* Pintado del IVUS virtual en canvas: el corte transversal circular y la vista
   longitudinal. Los colores salen de los tokens del HUD (nada de literales, ver
   UNI-83) y la geometría de ../ivusVirtual. */
import type { FdOption, FdSizingResult, IvusCompareResult, IvusResult } from "../../api/types";
import {
  anillosMm, bordesEnL, cuerda, estadoAposicion, estadoDeSeccion, mmAPx, ramasCerca, vistaL, type EstadoAposicion,
  type Grafico, type MarcaEnLinea,
} from "../ivusVirtual";
import { cifra } from "../../lib/numero";

export interface ColoresIvus { texto: string; tenue: string; ambar: string; rojo: string; plano: string; fuente: string }

/** Lo del dispositivo que se pinta encima: el plan del flow diverter (sin
 *  stent desplegado) y la opción elegida del catálogo. */
export interface CapaDispositivo { fd: FdSizingResult | null; opcion: FdOption | null }

/** Lo demás que se pinta encima (18-11): las ramas visibles, el estudio
 *  anterior superpuesto (discontinuo) y los marcadores sobre la línea. */
export interface CapaExtra { previo: IvusCompareResult | null; marcas: MarcaEnLinea[] }
const SIN_EXTRA: CapaExtra = { previo: null, marcas: [] };

/** Color de cada estado de aposición, el mismo criterio que el mapa 3D
 *  (rojo separado de la pared, azul comprimido). */
export function colorAposicion(e: EstadoAposicion, col: ColoresIvus): string {
  return e === "separado" ? col.rojo : e === "comprimido" ? col.texto : e === "cuello" ? col.tenue : col.plano;
}

export function coloresDe(el: Element): ColoresIvus {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim() || cs.color;
  return {
    texto: v("--hud-text"), tenue: v("--hud-text-dim"), ambar: v("--hud-amber"), rojo: v("--hud-red"),
    plano: v("--plane-libre"), fuente: cs.getPropertyValue("--font-mono").trim() || "monospace",
  };
}

/** Lienzo con el tamaño de su caja CSS × devicePixelRatio; devuelve el contexto
 *  ya escalado a píxeles CSS y el tamaño en esos píxeles. */
function preparar(cv: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function grisALienzo(gris: Uint8Array, ancho: number, alto: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ancho; c.height = alto;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(ancho, alto);
  for (let i = 0; i < gris.length; i++) {
    const g = gris[i]; img.data[4 * i] = g; img.data[4 * i + 1] = g; img.data[4 * i + 2] = g; img.data[4 * i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function pintarCorte(cv: HTMLCanvasElement, d: IvusResult, pila: Uint8Array, i: number, anguloL: number, col: ColoresIvus,
  disp: CapaDispositivo = { fd: null, opcion: null }, extra: CapaExtra = SIN_EXTRA): void {
  const p = preparar(cv); if (!p) return;
  const { ctx, w } = p;
  const S = d.size_px, lado = w, r = lado / 2, s = d.sections[i];
  const aPx = (u: number, v: number) => mmAPx(u, v, d.fov_mm, lado);
  const mmPx = lado / d.fov_mm;
  ctx.save();
  ctx.beginPath(); ctx.arc(r, r, r - 0.5, 0, 2 * Math.PI); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(grisALienzo(pila.subarray(i * S * S, (i + 1) * S * S), S, S), 0, 0, lado, lado);
  // Anillos de escala.
  ctx.strokeStyle = col.tenue; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
  for (const mm of anillosMm(d.fov_mm)) { ctx.beginPath(); ctx.arc(r, r, mm * mmPx, 0, 2 * Math.PI); ctx.stroke(); }
  // Recta de la vista longitudinal (una guía: tenue, para que el dispositivo se lea encima).
  const a = (anguloL * Math.PI) / 180;
  ctx.strokeStyle = col.tenue; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(r + r * Math.cos(a), r + r * Math.sin(a)); ctx.lineTo(r - r * Math.cos(a), r - r * Math.sin(a)); ctx.stroke();
  ctx.setLineDash([]);
  // Contorno de la luz.
  if (s.contour && s.contour.length > 2) {
    ctx.strokeStyle = s.valid ? col.texto : col.rojo; ctx.lineWidth = 1.5;
    if (!s.valid) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    s.contour.forEach(([u, v], k) => { const [x, y] = aPx(u, v); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }
  // El estudio anterior en esta misma sección, discontinuo.
  const prev = extra.previo?.sections[i];
  if (prev && prev.contour.length > 2) {
    ctx.strokeStyle = col.tenue; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    prev.contour.forEach(([u, v], k) => { const [x, y] = aPx(u, v); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }
  // Las ramas visibles que nacen aquí: un punto rojo en su dirección, sobre la pared.
  for (const rama of ramasCerca(d.branches, s.arc_mm)) {
    const a = (rama.angle_deg * Math.PI) / 180;
    const [x, y] = aPx(Math.cos(a) * rama.distance_mm, Math.sin(a) * rama.distance_mm);
    ctx.fillStyle = col.rojo; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
  }
  // Diámetros mínimo y máximo por el centroide.
  for (const [ang, color] of [[s.angle_max_deg, col.texto], [s.angle_min_deg, col.ambar]] as const) {
    const c = cuerda(s, ang); if (!c) continue;
    const [p0, p1] = c.map(([u, v]) => aPx(u, v));
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    for (const [x, y] of [p0, p1]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); }
  }
  // El mayor círculo que cabe en la luz (Ø inscrito), punteado en ámbar como el Ø mínimo.
  if (s.valid && s.d_inscribed_mm && s.inscribed_center) {
    const [cx, cy] = aPx(s.inscribed_center[0], s.inscribed_center[1]);
    ctx.strokeStyle = col.ambar; ctx.lineWidth = 1; ctx.setLineDash([1.5, 2.5]);
    ctx.beginPath(); ctx.arc(cx, cy, (s.d_inscribed_mm / 2) * mmPx, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
  }
  // El stent desplegado, tramo a tramo con el color de su aposición; si no lo
  // hay y la sección cae en el despliegue del plan, el círculo nominal de la
  // opción elegida sobre el centroide de la luz.
  const ruido = d.stent?.noise_mm ?? 0;
  if (s.stent && s.stent.contour.length > 2) {
    const q = s.stent.contour, ap = s.stent.apposition_mm;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < q.length; k++) {
      const e = s.in_lesion ? "cuello" : estadoAposicion(ap[k], ruido);
      const [x0, y0] = aPx(q[k][0], q[k][1]), [x1, y1] = aPx(q[(k + 1) % q.length][0], q[(k + 1) % q.length][1]);
      ctx.strokeStyle = colorAposicion(e, col);
      ctx.setLineDash(e === "cuello" ? [2, 3] : []);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.setLineDash([]);
  } else if (disp.fd && disp.opcion) {
    const [p0, p1] = disp.opcion.deploy_arc_mm;
    if (s.arc_mm >= Math.min(p0, p1) && s.arc_mm <= Math.max(p0, p1)) {
      const [cx, cy] = aPx(s.centroid?.[0] ?? 0, s.centroid?.[1] ?? 0);
      ctx.strokeStyle = col.plano; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, (disp.opcion.diameter_mm / 2) * mmPx, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // La línea central (el «catéter»).
  ctx.strokeStyle = col.tenue; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(r - 4, r); ctx.lineTo(r + 4, r); ctx.moveTo(r, r - 4); ctx.lineTo(r, r + 4); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = col.tenue; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(r, r, r - 0.5, 0, 2 * Math.PI); ctx.stroke();
  // Escala: el anillo más externo, rotulado.
  const anillos = anillosMm(d.fov_mm), ext = anillos[anillos.length - 1];
  if (ext) {
    ctx.fillStyle = col.tenue; ctx.font = `9px ${col.fuente}`;
    ctx.fillText(`${ext} mm`, r + ext * mmPx * 0.72 + 2, r - ext * mmPx * 0.72 - 2);
  }
}

/** Columna de la vista longitudinal para la sección i, y al revés. */
/** Fondo del recuadro del IVUS en el vídeo grabado: el canvas no lee los tokens CSS. */
export const FONDO_GRABACION = "rgba(6, 10, 14, 0.92)";
export const columnaDe = (i: number, n: number, w: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
export const seccionDe = (x: number, n: number, w: number) => Math.min(n - 1, Math.max(0, Math.round((x / w) * (n - 1))));

export function pintarL(cv: HTMLCanvasElement, d: IvusResult, pila: Uint8Array, i: number, anguloL: number, col: ColoresIvus,
  disp: CapaDispositivo = { fd: null, opcion: null }, extra: CapaExtra = SIN_EXTRA): void {
  const p = preparar(cv); if (!p) return;
  const { ctx, w, h } = p;
  const n = d.n_sections, S = d.size_px;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(grisALienzo(vistaL(pila, n, S, anguloL), n, S), 0, 0, w, h);
  const yDe = (mm: number) => h / 2 - (mm / d.fov_mm) * h;      // fila 0 = lado θ
  const anchoCol = Math.max(1, w / Math.max(1, n - 1));
  // Lesión y ramas, sombreadas.
  d.sections.forEach((s, k) => {
    if (!s.in_lesion && !s.in_branch) return;
    ctx.globalAlpha = s.in_lesion ? 0.28 : 0.18;
    ctx.fillStyle = s.in_lesion ? col.rojo : col.tenue;
    ctx.fillRect(columnaDe(k, n, w) - anchoCol / 2, 0, anchoCol, h);
  });
  ctx.globalAlpha = 1;
  // Bordes de la luz a cada lado de la recta.
  for (const lado of [0, 1] as const) {
    ctx.strokeStyle = col.texto; ctx.lineWidth = 1; ctx.beginPath();
    let abierto = false;
    d.sections.forEach((s, k) => {
      const b = s.valid ? bordesEnL(s.contour, anguloL) : null;
      if (!b) { abierto = false; return; }
      const x = columnaDe(k, n, w), y = yDe(lado === 0 ? b[0] : -b[1]);
      if (abierto) ctx.lineTo(x, y); else { ctx.moveTo(x, y); abierto = true; }
    });
    ctx.stroke();
  }
  // El estudio anterior: sus bordes, discontinuos, en las mismas secciones.
  if (extra.previo) {
    for (const lado of [0, 1] as const) {
      ctx.strokeStyle = col.tenue; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath();
      let abierto = false;
      extra.previo.sections.forEach((s, k) => {
        const b = s.valid ? bordesEnL(s.contour, anguloL) : null;
        if (!b || k >= n) { abierto = false; return; }
        const x = columnaDe(k, n, w), y = yDe(lado === 0 ? b[0] : -b[1]);
        if (abierto) ctx.lineTo(x, y); else { ctx.moveTo(x, y); abierto = true; }
      });
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // El stent desplegado: sus bordes sobre la recta y, abajo, una franja con
  // la aposición de cada sección.
  if (d.stent) {
    const ruido = d.stent.noise_mm;
    for (const lado of [0, 1] as const) {
      ctx.strokeStyle = col.plano; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.beginPath();
      let abierto = false;
      d.sections.forEach((s, k) => {
        const b = s.stent ? bordesEnL(s.stent.contour, anguloL) : null;
        if (!b) { abierto = false; return; }
        const x = columnaDe(k, n, w), y = yDe(lado === 0 ? b[0] : -b[1]);
        if (abierto) ctx.lineTo(x, y); else { ctx.moveTo(x, y); abierto = true; }
      });
      ctx.stroke(); ctx.setLineDash([]);
    }
    d.sections.forEach((s, k) => {
      if (!s.stent) return;
      ctx.fillStyle = colorAposicion(estadoDeSeccion(s, ruido) ?? "contacto", col);
      ctx.fillRect(columnaDe(k, n, w) - anchoCol / 2, h - 4, anchoCol + 0.5, 4);
    });
  } else if (disp.fd) {
    // Sin stent, el plan: arriba el cuello (ámbar) y los anclajes (tenues);
    // debajo, el despliegue de la opción elegida.
    const xDe = (mm: number) => {
      let k = 0;
      while (k < n - 1 && d.sections[k + 1].arc_mm <= mm) k++;
      return columnaDe(k, n, w);
    };
    const franja = (a: number, b: number, color: string, y: number, alto: number) => {
      const x0 = xDe(Math.min(a, b)), x1 = xDe(Math.max(a, b));
      ctx.fillStyle = color; ctx.fillRect(x0, y, Math.max(1, x1 - x0), alto);
    };
    const { fd, opcion } = disp;
    franja(fd.proximal.arc_from_mm, fd.proximal.arc_to_mm, col.tenue, 0, 3);
    franja(fd.distal.arc_from_mm, fd.distal.arc_to_mm, col.tenue, 0, 3);
    franja(fd.neck_arc_mm[0], fd.neck_arc_mm[1], col.ambar, 0, 4);
    if (opcion) franja(opcion.deploy_arc_mm[0], opcion.deploy_arc_mm[1], col.plano, h - 4, 4);
  }
  // Área mínima y referencias.
  const sm = d.summary;
  const vertical = (k: number, color: string, raya: number[]) => {
    const x = columnaDe(k, n, w);
    ctx.strokeStyle = color; ctx.setLineDash(raya); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.setLineDash([]);
  };
  const indiceDe = (mm: number | null | undefined) => mm == null ? -1 : d.sections.findIndex((s) => Math.abs(s.arc_mm - mm) < 1e-6);
  if (sm) {
    for (const ref of [sm.ref_prox_arc_mm, sm.ref_dist_arc_mm]) { const k = indiceDe(ref); if (k >= 0) vertical(k, col.tenue, [2, 3]); }
    vertical(sm.mla_index, col.ambar, [4, 2]);
  }
  // Columna de una posición de la línea (mm).
  const xDeArco = (mm: number) => {
    let k = 0;
    while (k < n - 1 && d.sections[k + 1].arc_mm <= mm) k++;
    return columnaDe(k, n, w);
  };
  // Ramas visibles: un triángulo rojo arriba, apuntando al vaso.
  ctx.fillStyle = col.rojo;
  for (const rama of d.branches ?? []) {
    const x = xDeArco(rama.arc_mm);
    ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 7); ctx.closePath(); ctx.fill();
  }
  // Marcadores sobre la línea: una banderita con su etiqueta.
  ctx.font = `9px ${col.fuente}`;
  for (const m of extra.marcas) {
    const x = xDeArco(m.arc_mm);
    ctx.strokeStyle = col.plano; ctx.fillStyle = col.plano; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x, h - 14); ctx.stroke();
    ctx.fillRect(x, h - 14, 5, 4);
    ctx.fillText(m.etiqueta, x + 3, h - 16);
  }
  // Dónde va el recorrido.
  vertical(i, col.texto, []);
}

/** Gráfico de secciones (P4): la medida elegida a lo largo de la línea, con
 *  las mismas columnas que la vista longitudinal para que queden alineadas.
 *  Lesión y ramas sombreadas, MLA y referencias como en la vista L, y la
 *  posición del recorrido. */
export function pintarGrafico(cv: HTMLCanvasElement, d: IvusResult, i: number, g: Grafico, col: ColoresIvus): void {
  const p = preparar(cv); if (!p) return;
  const { ctx, w, h } = p;
  const n = d.n_sections, arriba = 4, abajo = 3;
  // Recortado a la escala: las secciones de rama pueden pasarse (graficoDe no las cuenta).
  const yDe = (v: number) => arriba + (1 - Math.min(1, Math.max(0, (v - g.min) / Math.max(1e-9, g.max - g.min)))) * (h - arriba - abajo);
  const anchoCol = Math.max(1, w / Math.max(1, n - 1));
  d.sections.forEach((s, k) => {
    if (!s.in_lesion && !s.in_branch) return;
    ctx.globalAlpha = s.in_lesion ? 0.28 : 0.18;
    ctx.fillStyle = s.in_lesion ? col.rojo : col.tenue;
    ctx.fillRect(columnaDe(k, n, w) - anchoCol / 2, 0, anchoCol, h);
  });
  ctx.globalAlpha = 1;
  // Rejilla: el máximo de la escala y la mitad, rotulados.
  ctx.font = `9px ${col.fuente}`; ctx.lineWidth = 1;
  for (const v of [g.max, (g.max + g.min) / 2]) {
    const y = yDe(v);
    ctx.strokeStyle = col.tenue; ctx.globalAlpha = 0.5; ctx.setLineDash([1, 3]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.fillStyle = col.tenue;
    ctx.fillText(g.unidad ? `${cifra(v, v < 10 ? 1 : 0)}` : cifra(v, 2), 2, y + 9);
  }
  const tono = { texto: col.texto, tenue: col.tenue, ambar: col.ambar };
  for (const serie of g.series) {
    ctx.strokeStyle = tono[serie.tono]; ctx.lineWidth = serie.tono === "texto" ? 1.5 : 1;
    ctx.setLineDash(serie.raya ? [4, 3] : []);
    ctx.beginPath();
    let abierto = false;
    serie.valores.forEach((v, k) => {
      if (v == null) { abierto = false; return; }
      const x = columnaDe(k, n, w), y = yDe(v);
      if (abierto) ctx.lineTo(x, y); else { ctx.moveTo(x, y); abierto = true; }
    });
    ctx.stroke(); ctx.setLineDash([]);
  }
  const vertical = (k: number, color: string, raya: number[]) => {
    const x = columnaDe(k, n, w);
    ctx.strokeStyle = color; ctx.setLineDash(raya); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.setLineDash([]);
  };
  const sm = d.summary;
  if (sm) {
    for (const ref of [sm.ref_prox_arc_mm, sm.ref_dist_arc_mm]) {
      const k = ref == null ? -1 : d.sections.findIndex((s) => Math.abs(s.arc_mm - ref) < 1e-6);
      if (k >= 0) vertical(k, col.tenue, [2, 3]);
    }
    vertical(sm.mla_index, col.ambar, [4, 2]);
  }
  vertical(i, col.texto, []);
  // El valor de cada curva donde va el recorrido, sobre su línea.
  for (const serie of g.series) {
    const v = serie.valores[i];
    if (v == null) continue;
    ctx.fillStyle = tono[serie.tono];
    ctx.beginPath(); ctx.arc(columnaDe(i, n, w), yDe(v), 2.5, 0, 2 * Math.PI); ctx.fill();
  }
}
