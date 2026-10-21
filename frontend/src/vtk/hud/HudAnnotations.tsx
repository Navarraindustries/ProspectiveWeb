import type { Shape } from "../annotationOverlay";

/** Capa SVG de las anotaciones de un corte. Ocupa la celda entera con origen en
 *  su esquina y solo lleva hijos planos con px absolutos y colores en atributos,
 *  sin grupos ni transformaciones: la captura del visor lee el DOM tal cual. */
export function HudAnnotations({ shapes }: { shapes: Shape[] }) {
  if (shapes.length === 0) return null;
  return (
    <svg className="hud-anot" aria-hidden="true">
      {shapes.map((s, i) => {
        if (s.kind === "line") {
          return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={s.width}
            strokeDasharray={s.dashed ? "4 3" : undefined} strokeLinecap="round" />;
        }
        if (s.kind === "polygon") {
          if (s.closed) {
            return <polygon key={i} points={s.points.map((p) => `${p.x},${p.y}`).join(" ")} stroke={s.color} strokeWidth={1.5} fill={s.fill} />;
          }
          // Abierto (el borrador): tramos sueltos, que no se cierran solos como
          // haría un <polygon>.
          return s.points.slice(1).map((p, k) => (
            <line key={`${i}-${k}`} x1={s.points[k].x} y1={s.points[k].y} x2={p.x} y2={p.y}
              stroke={s.color} strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" />
          ));
        }
        if (s.kind === "circle") return <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.color} />;
        return <text key={i} x={s.x} y={s.y} fill={s.color}>{s.text}</text>;
      })}
    </svg>
  );
}
