/* Modalidades cuyos vóxeles son unidades Hounsfield (refleja el backend).
   Fuera de ellas el número de la ventana no tiene unidad: en XA/3DRA es la
   intensidad cruda del detector y escribir «HU» sería mentir. */
export const HU_MODALITIES = ["CT", "CTA", "CTPA"];

export function isHuModality(m: string | null | undefined): boolean {
  return HU_MODALITIES.includes((m ?? "").trim().toUpperCase());
}

/** Sufijo de unidad para lecturas de ventana/nivel: « HU» en TC, nada fuera. */
export function unitFor(m: string | null | undefined): " HU" | "" {
  return isHuModality(m) ? " HU" : "";
}
