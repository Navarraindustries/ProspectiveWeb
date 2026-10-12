/* Un umbral por índice y la localización en el idioma de cada escala.

   F1-160 / F1-161 / F1-163: cada sitio cortaba donde quería. La insignia del AR
   en 1,2, la etiqueta de riesgo en 1,3 y Decisión en 1,3 y 2,0; el DNR en 1,5 y
   1,6; la ondulación en 0,15, 0,10/0,25 y 0,20. Un AR de 1,25 salía «Mod» en la
   tabla y no contaba para el riesgo de al lado. Los cortes son los de
   backend/services/index_thresholds.py; test_index_thresholds.py compara los
   dos archivos.

   F1-162 / F1-179: la insignia del BF decía «Cuello ancho» con un BF alto, que
   es un domo mucho más ancho que su cuello: un cuello relativamente estrecho.

   F1-165 (fusión nº 21): la localización se pedía en PHASES, ELAPSS, UIATS y
   Decisión con cuatro listas y cuatro valores por defecto; dejar una sin tocar
   cambiaba la cifra. Se elige una vez en Morfometría (la lista clínica,
   ANEURYSM_LOCATIONS) y `siteFor` la traduce a cada escala. */

import type { ElapssLocation, PhasesSite, UiatsRequest } from "../../api/types";
import { LEGACY_BASILAR, LEGACY_BASILAR_LABEL } from "../../api/types";

export const AR_HIGH = 1.6;
export const AR_MOD = 1.2;
export const DNR_HIGH = 2.0;
export const DNR_MOD = 1.6;
/** BF > 1,5 = cuello relativamente estrecho; ≤ 1,5 = cuello relativamente ancho. */
export const BF_WIDE = 1.5;
export const UI_HIGH = 0.25;
export const UI_MOD = 0.10;
export const EI_MOD = 0.35;
export const SR_HIGH = 3.0;
export const SR_MOD = 2.0;

export type IndexKey = "ar" | "dnr" | "bf" | "ui" | "ei" | "sr";
type Variant = "success" | "warning" | "destructive" | "outline";

/** La etiqueta de la insignia. «» cuando el índice no lleva insignia en ese tramo. */
export function labelFor(index: IndexKey, value: number): string {
  switch (index) {
    case "ar": return value >= AR_HIGH ? "Alto" : value >= AR_MOD ? "Mod" : "OK";
    case "dnr": return value >= DNR_HIGH ? "Alto" : value >= DNR_MOD ? "Mod" : "OK";
    case "bf": return value > BF_WIDE ? "Cuello estrecho" : "Cuello ancho";
    case "ui": return value >= UI_HIGH ? "Irregular" : value >= UI_MOD ? "Mod" : "Bajo";
    case "ei": return value >= EI_MOD ? "Alto" : "Bajo";
    case "sr": return value >= SR_HIGH ? "Alto" : value >= SR_MOD ? "Mod" : "";
  }
}

const VARIANT: Record<string, Variant> = {
  Alto: "destructive", Mod: "warning", Irregular: "warning", OK: "success", Bajo: "success",
  // El BF describe el cuello, no puntúa riesgo: el ancho es el que complica el coiling.
  "Cuello estrecho": "outline", "Cuello ancho": "warning",
};

/** [etiqueta, variante] para `Metric`, o undefined si el tramo no lleva insignia. */
export function badgeFor(index: IndexKey, value: number): [string, Variant] | undefined {
  const label = labelFor(index, value);
  return label ? [label, VARIANT[label] ?? "outline"] : undefined;
}

/** Definición, cortes y fuente de cada índice: el tooltip de su fila. */
export const THRESHOLD_TIP: Record<IndexKey, string> = {
  dnr: "DNR: Ø máximo ÷ cuello. Mod desde 1,6 y Alto desde 2,0, los mismos cortes que la " +
    "etiqueta de riesgo y Decisión. 2,0 es la mitad «DNR < 2» de la definición de cuello " +
    "ancho (Brinjikji, AJNR 2009); 1,6, el gradiente de adyuvante del mismo trabajo.",
  ar: "AR: altura del domo ÷ cuello. Mod desde 1,2 y Alto desde 1,6, los mismos cortes que la " +
    "etiqueta de riesgo y Decisión. 1,6 es el corte de Ujiie 2001; 1,2, el extremo bajo de " +
    "uso corriente, sin cohorte propia.",
  bf: "BF: Ø máximo del domo ÷ cuello (Hoh 2007). Por encima de 1,5 el domo es bastante más " +
    "ancho que el cuello: cuello relativamente estrecho. Hasta 1,5, cuello relativamente " +
    "ancho. El corte de 1,5 es de la aplicación.",
  ui: "UI · Ondulación: 1 − volumen ÷ volumen de la envolvente convexa (Raghavan 2005). Mod " +
    "desde 0,10 e Irregular desde 0,25, los mismos cortes que la etiqueta de riesgo y " +
    "Decisión; los cortes son de la aplicación.",
  ei: "EI · Elipticidad (Raghavan 2005). Alto desde 0,35, el mismo corte que la etiqueta de riesgo.",
  sr: "SR · Size Ratio: Ø máximo ÷ arteria madre (Dhar 2008). Mod desde 2,0 y Alto desde 3,0, " +
    "los mismos cortes que la etiqueta de riesgo; cortes de uso corriente.",
};

/* ── La localización en cada escala ─────────────────────────────────────

   | Lista clínica (Morfometría)               | PHASES             | ELAPSS         | UIATS               |
   |-------------------------------------------|--------------------|----------------|---------------------|
   | Desconocida / No especificada             | — (ica, bloquea)   | — (bloquea)    | — (other, bloquea)  |
   | ACM — Arteria Cerebral Media              | mca                | mca            | other               |
   | ACA / ACoA — Arteria Comunicante Anterior | aca_pcom_posterior | ica_aca_acom   | acom_pcom           |
   | ACI proximal (segm. cavernoso / clinoideo)| ica                | ica_aca_acom   | other               |
   | ACI distal (PCOM / oftálmica)             | ica                | ica_aca_acom   | other               |
   | ACoP — Arteria Comunicante Posterior      | aca_pcom_posterior | pcom_posterior | acom_pcom           |
   | Punta basilar                             | aca_pcom_posterior | pcom_posterior | basilar_bifurcation |
   | Tronco basilar                            | aca_pcom_posterior | pcom_posterior | vertebrobasilar     |
   | AICA                                      | aca_pcom_posterior | pcom_posterior | vertebrobasilar     |
   | Basilar (punta, tronco o AICA)            | aca_pcom_posterior | pcom_posterior | vertebrobasilar     |
   | PICA / Vertebral                          | aca_pcom_posterior | pcom_posterior | vertebrobasilar     |
   | Otra localización                         | — (bloquea)        | — (bloquea)    | other               |

   «ACI distal» va como ACI: el aneurisma de comunicante posterior tiene su
   propia fila, y quien lo marque como ACI distal se queda sin los +4 de PHASES.
   F1-174: la lista ya separa punta, tronco y AICA. La fila antigua «Basilar
   (punta, tronco o AICA)» sigue porque hay sesiones guardadas que la llevan:
   UIATS le da +4 (vertebrobasilar) y no +5 (bifurcación), que es lo que daba.
   Se clasifica por palabras y no por igualdad. */

/** Cómo se enseña una localización. Solo cambia la basilar antigua (F1-174):
 *  su texto «punta, tronco o AICA» se leía como una localización precisa, y
 *  no lo es — la tarjeta de perforantes y el UIATS dependen de cuál sea. */
export function siteLabel(site: string): string {
  return site === LEGACY_BASILAR ? LEGACY_BASILAR_LABEL : site;
}

type Region =
  | "unknown" | "other" | "mca" | "aca_acom" | "ica" | "pcom"
  | "basilar" | "basilar_tip" | "basilar_trunk" | "vertebral";

function region(location: string | null | undefined): Region {
  const s = (location ?? "").trim().toLowerCase();
  if (!s || s.startsWith("desconocida")) return "unknown";
  if (s.startsWith("otra")) return "other";
  if (s.startsWith("acm") || s.includes("cerebral media")) return "mca";
  if (s.startsWith("acop") || s.includes("comunicante posterior")) return "pcom";
  if (s.startsWith("aca") || s.includes("acoa") || s.includes("comunicante anterior")) return "aca_acom";
  if (s.startsWith("aci") || s.includes("carótida")) return "ica";
  if (s.includes("basilar")) {
    const punta = s.includes("punta");
    const tronco = s.includes("tronco") || s.includes("aica");
    if (punta && !tronco) return "basilar_tip";
    if (tronco && !punta) return "basilar_trunk";
    return "basilar";
  }
  if (s.includes("aica")) return "basilar_trunk";
  if (s.includes("pica") || s.includes("vertebral")) return "vertebral";
  return "unknown";
}

type UiatsLocation = UiatsRequest["location"];
interface ScaleSite { phases: PhasesSite; elapss: ElapssLocation; uiats: UiatsLocation }
type Scale = keyof ScaleSite;

/** Lo que vale cada región en cada escala; null = esa escala no tiene categoría. */
const MAP: Record<Region, { [K in Scale]: ScaleSite[K] | null }> = {
  unknown: { phases: null, elapss: null, uiats: null },
  other: { phases: null, elapss: null, uiats: "other" },
  mca: { phases: "mca", elapss: "mca", uiats: "other" },
  aca_acom: { phases: "aca_pcom_posterior", elapss: "ica_aca_acom", uiats: "acom_pcom" },
  ica: { phases: "ica", elapss: "ica_aca_acom", uiats: "other" },
  pcom: { phases: "aca_pcom_posterior", elapss: "pcom_posterior", uiats: "acom_pcom" },
  basilar: { phases: "aca_pcom_posterior", elapss: "pcom_posterior", uiats: "vertebrobasilar" },
  basilar_tip: { phases: "aca_pcom_posterior", elapss: "pcom_posterior", uiats: "basilar_bifurcation" },
  basilar_trunk: { phases: "aca_pcom_posterior", elapss: "pcom_posterior", uiats: "vertebrobasilar" },
  vertebral: { phases: "aca_pcom_posterior", elapss: "pcom_posterior", uiats: "vertebrobasilar" },
};

/** El valor neutro de cada escala (0 puntos), para cuando no hay localización. */
const NEUTRAL: ScaleSite = { phases: "ica", elapss: "ica_aca_acom", uiats: "other" };

/** La localización clínica traducida a la escala; sin categoría, su valor neutro. */
export function siteFor<K extends Scale>(scale: K, location: string | null | undefined): ScaleSite[K] {
  return (MAP[region(location)][scale] ?? NEUTRAL[scale]) as ScaleSite[K];
}

/** Si la escala tiene categoría para esa localización. Sin ella no se calcula. */
export function isSiteKnown(scale: Scale, location: string | null | undefined): boolean {
  return MAP[region(location)][scale] != null;
}

/** El aviso de las calculadoras sin localización. */
export const PICK_SITE = "Elige la localización en Morfometría";
