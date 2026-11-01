/* Colocación de la cinta de rumbo en la escena 3D: a la derecha de las
   lecturas de las esquinas superiores, o ninguna si no cabe (A64). */
export const READOUT_CHAR_PX = 6.72; // 10,5 px × (0,6 + 0,04 de tracking)
export const READOUT_INSET_PX = 14;
export const HEADING_GAP_PX = 16;
export const HEADING_MIN_PX = 200; // HEADING_READOUT_PX (110) + 90 de banda
export const HEADING_ROW_TOP_PX = 24;

export interface HeadingPlacement { top: number; left: number; right: number }

const longest = (lines: string[]) => lines.reduce((m, s) => Math.max(m, [...s].length), 0);
const edge = (lines: string[]) => READOUT_INSET_PX + longest(lines) * READOUT_CHAR_PX + HEADING_GAP_PX;

export function headingPlacement(cellWidth: number, tl: string[], tr: string[]): HeadingPlacement | null {
  const left = Math.max(0.2 * cellWidth, edge(tl));
  const right = Math.max(0.2 * cellWidth, edge(tr));
  if (cellWidth - left - right < HEADING_MIN_PX) return null;
  return { top: HEADING_ROW_TOP_PX, left, right };
}
