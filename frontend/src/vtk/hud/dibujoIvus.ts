/* Pintado del IVUS virtual en canvas: el corte transversal circular y la vista
   longitudinal. Los colores salen de los tokens del HUD (nada de literales, ver
   UNI-83) y la geometría de ../ivusVirtual. */
import type { IvusResult } from "../../api/types";
import { anillosMm, bordesEnL, cuerda, mmAPx, vistaL } from "../ivusVirtual";

export interface ColoresIvus { texto: string; tenue: string; ambar: string; rojo: string; plano: string; fuente: string }

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

export function pintarCorte(cv: HTMLCanvasElement, d: IvusResult, pila: Uint8Array, i: number, anguloL: number, col: ColoresIvus): void {
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
  // Recta de la vista longitudinal.
  const a = (anguloL * Math.PI) / 180;
  ctx.strokeStyle = col.plano; ctx.setLineDash([5, 4]);
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
  // Diámetros mínimo y máximo por el centroide.
  for (const [ang, color] of [[s.angle_max_deg, col.texto], [s.angle_min_deg, col.ambar]] as const) {
    const c = cuerda(s, ang); if (!c) continue;
    const [p0, p1] = c.map(([u, v]) => aPx(u, v));
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    for (const [x, y] of [p0, p1]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); }
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
export const columnaDe = (i: number, n: number, w: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
export const seccionDe = (x: number, n: number, w: number) => Math.min(n - 1, Math.max(0, Math.round((x / w) * (n - 1))));

export function pintarL(cv: HTMLCanvasElement, d: IvusResult, pila: Uint8Array, i: number, anguloL: number, col: ColoresIvus): void {
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
  // Dónde va el recorrido.
  vertical(i, col.texto, []);
}
