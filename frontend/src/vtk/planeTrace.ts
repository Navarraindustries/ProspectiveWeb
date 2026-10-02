/* La traza del plano de acumulación del MIP en pantalla: las cuatro esquinas
   del volumen en ese plano, proyectadas con la cámara del MIP. Lo puro va
   aquí; la proyección la hace vtk (renderer.worldToNormalizedDisplay). */
export const EDGE_ON_DEG = 5;

export function planeCorners(bounds: number[], axis: 0 | 1 | 2, posMm: number): [number, number, number][] {
  const lo = [bounds[0], bounds[2], bounds[4]], hi = [bounds[1], bounds[3], bounds[5]];
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const mk = (a: number, b: number): [number, number, number] => {
    const p: [number, number, number] = [0, 0, 0];
    p[axis] = posMm; p[u] = a; p[v] = b;
    return p;
  };
  return [mk(lo[u], lo[v]), mk(hi[u], lo[v]), mk(hi[u], hi[v]), mk(lo[u], hi[v])];
}

/** De canto el rectángulo degenera en una línea que no informa: se oculta
 *  cuando la dirección de la cámara y el plano forman menos de EDGE_ON_DEG. */
export function traceVisible(cameraDirection: [number, number, number], axis: 0 | 1 | 2): boolean {
  const n: [number, number, number] = [0, 0, 0]; n[axis] = 1;
  return traceVisibleForNormal(cameraDirection, n);
}

/** La misma regla para un plano de normal cualquiera (el plano libre):
 *  |cos| entre la dirección y la normal es el seno del ángulo cámara–plano. */
export function traceVisibleForNormal(cameraDirection: [number, number, number], normal: [number, number, number]): boolean {
  const ld = Math.hypot(...cameraDirection) || 1, ln = Math.hypot(...normal) || 1;
  const cos = Math.abs(cameraDirection[0] * normal[0] + cameraDirection[1] * normal[1] + cameraDirection[2] * normal[2]) / (ld * ln);
  return cos > Math.sin((EDGE_ON_DEG * Math.PI) / 180);
}

/** vtk da el display normalizado con y hacia arriba; SVG, píxeles con y hacia abajo. */
export function toPixels(ndc: [number, number], widthPx: number, heightPx: number) {
  return { x: ndc[0] * widthPx, y: (1 - ndc[1]) * heightPx };
}

export function tracePolygon(points: { x: number; y: number }[]): string {
  return points.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(" ");
}
