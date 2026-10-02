/* Los clips colocados, vistos como lo que se manda al servidor. Puro: el store
   guarda posición y ángulos, y la normal se deriva SIEMPRE del eje del cuello.
   Guardarla aparte dejaría dos verdades que podrían separarse al cambiar la
   morfometría. */
import type { ClipPlacement, MorphometryResult } from "../../api/types";
import type { PlacedClip } from "../../store/planning";
import type { Vec3 } from "../../vtk/geometry";
import { neckFrameNormal } from "../../vtk/clipPose";

/** El eje principal del cuello, o null si la morfometría no lo trae. */
export function neckAxis(m: MorphometryResult | null): Vec3 | null {
  const ax = m?.principal_axis;
  return ax && ax.length === 3 ? [ax[0], ax[1], ax[2]] : null;
}

/** Where to place a clip/stent: the neck centre the backend measured, with the
    principal axis as the neck-plane normal.

    The backend already knows this point exactly (it is the same one the
    perforator analysis uses). Approximating it here as centroid − axis·(dome/2)
    landed on the parent vessel instead — 0 % neck coverage — and collapsed onto
    the centroid, inside the dome, whenever the dome height was not measured.
    The approximation survives only as a fallback for older sessions whose
    morphometry predates `neck_origin`.

    Es la pose de partida de un clip recién añadido. El ensayo NO la usa si hay
    clips en la lista: anima hasta la pose del clip activo (ver `activeClip`),
    que el cirujano puede haber movido, girado e inclinado a mano. */
export function neckPlacement(m: MorphometryResult | null): { position: Vec3; normal: Vec3 } {
  const ax = neckAxis(m);
  const normal: Vec3 = ax ?? [0, 0, 1];

  const o = m?.neck_origin;
  if (o) return { position: [o.x, o.y, o.z], normal };

  const c = m?.centroid;
  const dh = m?.dome_height_mm ?? 0;
  if (c && ax) {
    return { position: [c.x - (ax[0] * dh) / 2, c.y - (ax[1] * dh) / 2, c.z - (ax[2] * dh) / 2], normal };
  }
  return { position: [0, 0, 0], normal };
}

const snap = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);

/** La normal del clip: su inclinación en el marco del cuello. El ruido de las
 *  rotaciones (6e-17, −0) se lleva a cero: sin inclinar, lo que se manda es el
 *  eje tal cual, la misma petición que antes de que hubiera ángulos. */
export function clipNormal(m: MorphometryResult | null, c: PlacedClip): Vec3 {
  const n = neckFrameNormal(neckAxis(m), c.azimuthDeg, c.elevationDeg);
  return [snap(n[0]), snap(n[1]), snap(n[2])];
}

/** El clip que manejan las asas del 3D y que ensaya «Ensayar»: el elegido en
 *  la lista o, si no hay ninguno elegido (o ya no está), el último colocado. */
export function activeClip(placed: PlacedClip[], selectedKey: number | null): PlacedClip | null {
  return placed.find((c) => c.key === selectedKey) ?? placed.at(-1) ?? null;
}

/** Lo que espera /clips/plan y /clips/field. */
export function toPlacement(m: MorphometryResult | null, c: PlacedClip): ClipPlacement {
  const [x, y, z] = c.position;
  return { clip_id: c.clip_id, position: { x, y, z }, normal: [...clipNormal(m, c)], rotation_deg: c.rotation_deg };
}

/** Poses como texto: teclear «2» → «2.» → «2.0» crea listas nuevas con los
 *  mismos números y no merece otra ida y vuelta. Los ángulos cuentan: inclinar
 *  el clip cambia la pose aunque no se mueva. */
export function poseKey(clips: PlacedClip[]): string {
  return clips
    .map((c) => [c.clip_id, ...c.position.map((v) => v.toFixed(3)), c.rotation_deg, c.azimuthDeg.toFixed(1), c.elevationDeg.toFixed(1)].join(":"))
    .join("|");
}

/** ¿La lista ya no es la que se coció en las mallas vigentes? Sin plan no hay
 *  nada que esté desfasado. */
export function isStale(placed: PlacedClip[], planned: PlacedClip[] | null): boolean {
  return planned !== null && poseKey(placed) !== poseKey(planned);
}
