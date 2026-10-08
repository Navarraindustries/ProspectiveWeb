/* Las anotaciones que una celda está enseñando AHORA, leídas de su DOM.

   Mismo motivo que `readHud`: quien las dibuja ya sabe dónde van (el corte por
   `shapesForSlice`, el 3D proyectando con su cámara), y derivarlas otra vez
   para la captura sería una segunda fuente. Se leen los <svg class="hud-anot">,
   que por contrato (`HudAnnotations`) solo llevan hijos planos con px absolutos
   y colores en atributos, sin grupos ni transformaciones.

   Solo `hud-anot`: las otras capas en svg (`hud-decor`, la traza del MIP…) son
   del visor, no del caso, y ya salen —o no— por su cuenta. */

import type { Shape } from "./annotationOverlay";

const num = (el: Element, attr: string, fallback = 0) => {
  const v = parseFloat(el.getAttribute(attr) ?? "");
  return Number.isFinite(v) ? v : fallback;
};

/** Dónde empieza el svg dentro de la celda. Con maquetación, la diferencia de
 *  rectángulos; sin ella (jsdom, o una celda aún sin medir) los dos salen en
 *  cero y se recurre al `left/top` del estilo en línea. */
function offsetOf(svg: SVGElement, cell: HTMLElement): { dx: number; dy: number } {
  const s = svg.getBoundingClientRect(), c = cell.getBoundingClientRect();
  const medido = s.width > 0 || s.height > 0 || c.width > 0 || c.height > 0;
  if (medido) return { dx: s.left - c.left, dy: s.top - c.top };
  return { dx: parseFloat(svg.style.left) || 0, dy: parseFloat(svg.style.top) || 0 };
}

/** Las formas de todas las capas `hud-anot` de la celda, en px de la celda. */
export function readPaneShapes(cell: HTMLElement | null | undefined): Shape[] {
  if (!cell) return [];
  const out: Shape[] = [];
  for (const svg of Array.from(cell.querySelectorAll<SVGElement>("svg.hud-anot"))) {
    const { dx, dy } = offsetOf(svg, cell);
    for (const el of Array.from(svg.children)) {
      // El 3D esconde así los rótulos detrás de la cámara: no se ven, no salen.
      if (el.getAttribute("display") === "none") continue;
      const tag = el.tagName.toLowerCase();
      if (tag === "line") {
        out.push({
          kind: "line", x1: num(el, "x1") + dx, y1: num(el, "y1") + dy, x2: num(el, "x2") + dx, y2: num(el, "y2") + dy,
          color: el.getAttribute("stroke") ?? "#fff", width: num(el, "stroke-width", 1.5),
          dashed: !!el.getAttribute("stroke-dasharray"),
        });
      } else if (tag === "polygon") {
        const nums = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
        const points: { x: number; y: number }[] = [];
        for (let k = 0; k + 1 < nums.length; k += 2) points.push({ x: nums[k] + dx, y: nums[k + 1] + dy });
        out.push({ kind: "polygon", points, color: el.getAttribute("stroke") ?? "#fff", fill: el.getAttribute("fill") ?? "none", closed: true });
      } else if (tag === "circle") {
        out.push({ kind: "circle", x: num(el, "cx") + dx, y: num(el, "cy") + dy, r: num(el, "r"), color: el.getAttribute("fill") ?? el.getAttribute("stroke") ?? "#fff" });
      } else if (tag === "text") {
        const text = el.textContent ?? "";
        if (text) out.push({ kind: "text", x: num(el, "x") + dx, y: num(el, "y") + dy, text, color: el.getAttribute("fill") ?? "#fff" });
      }
    }
  }
  return out;
}
