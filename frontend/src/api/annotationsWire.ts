/* Conversión entre el cable y el almacén de las anotaciones. La API manda los
   puntos como Position3D ({x, y, z}), como en el resto de endpoints; el visor
   trabaja con tuplas (Vec3), que es lo que usan la geometría y VTK. */
import type { AnnotationWire } from "./types";
import type { Annotation } from "../vtk/annotations";

export function fromWire(w: AnnotationWire): Annotation {
  return { ...w, points: w.points.map((p) => [p.x, p.y, p.z]) };
}

export function toWire(a: Annotation): AnnotationWire {
  return { ...a, points: a.points.map(([x, y, z]) => ({ x, y, z })) };
}
