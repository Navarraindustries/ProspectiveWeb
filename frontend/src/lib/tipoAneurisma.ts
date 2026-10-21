/* «Tipo de aneurisma» guardado en UNA columna (tipo_aneurisma) pero editado en dos
   campos: morfología y tamaño (F2-39). Sin migración: el valor se guarda como
   «{Morfología} · {Tamaño}» y los valores antiguos de una sola palabra se reparten
   al cargar en el campo al que pertenecen. */

export const MORFOLOGIAS = ["Sacular", "Fusiforme", "Disecante", "Blíster", "Otro"] as const;
export const TAMANOS = ["Pequeño (< 10 mm)", "Grande (10–25 mm)", "Gigante (> 25 mm)"] as const;

const SEP = " · ";

// El menú antiguo escribía «Grande (10-25 mm)» con guion corto; se reconoce igual.
const norm = (s: string) => s.replace(/–/g, "-").trim();
const tamanoDe = (s: string) => TAMANOS.find((t) => norm(t) === norm(s));

export function joinTipo(morfologia: string, tamano: string): string {
  return [morfologia.trim(), tamano.trim()].filter(Boolean).join(SEP);
}

export function splitTipo(valor: string | null | undefined): { morfologia: string; tamano: string } {
  const partes = (valor ?? "").split(SEP).map((p) => p.trim()).filter(Boolean);
  let morfologia = "";
  let tamano = "";
  for (const p of partes) {
    const t = tamanoDe(p);
    if (t) tamano = t;
    else morfologia = p;
  }
  return { morfologia, tamano };
}
