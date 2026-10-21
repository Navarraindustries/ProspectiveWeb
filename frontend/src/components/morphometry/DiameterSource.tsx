/* Qué Ø toma la escala, dicho bajo «Tamaño (mm)» (F1-14, F1-15, F1-157). */

import { crossedCut, mm } from "./diameterCut";

const NOTE = { fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: -4 } as const;
export const CUT_WARN = {
  fontSize: 11, lineHeight: 1.5, color: "var(--warning)", background: "var(--warning-bg)",
  borderRadius: "var(--radius-md)", padding: "6px 10px",
} as const;

export function DiameterSource({
  maxMm, sizeMm, bodyMm, provisional, cuts, score, showTramo = true,
}: {
  maxMm: number;
  /** Lo que hay escrito en el campo: si no es el Ø medido, se dice. */
  sizeMm?: number;
  bodyMm?: number | null;
  provisional?: boolean;
  cuts: readonly number[];
  score: string;
  /** PHASES lo dice con puntos en su propio aviso. */
  showTramo?: boolean;
}) {
  if (!(maxMm > 0)) return null;
  const body = bodyMm != null && bodyMm > 0 ? bodyMm : null;
  const tramo = showTramo && body != null ? crossedCut(maxMm, body, cuts) : null;
  const aMano = sizeMm != null && Math.abs(sizeMm - Math.round(maxMm * 10) / 10) > 0.05;
  return (
    <>
      <div style={NOTE}>
        {aMano ? `Tamaño escrito a mano (${sizeMm! > 0 ? `${mm(sizeMm!)} mm` : "vacío"}); el Ø máximo medido es ${mm(maxMm)} mm`
               : `Se toma el Ø máximo medido ${mm(maxMm)} mm`}
        {body != null && ` · Ø del cuerpo ${mm(body)} mm`}
        {provisional && " · provisional: el saco aislado incluye vaso padre"}
      </div>
      {tramo != null && body != null && (
        <div style={CUT_WARN}>
          Con el Ø del cuerpo ({mm(body)} mm) en vez del máximo ({mm(maxMm)} mm) {score} cambia de
          tramo: cruza el corte de {tramo} mm.
        </div>
      )}
    </>
  );
}
