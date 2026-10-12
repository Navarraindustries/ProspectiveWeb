/* La localización que una calculadora hereda de Morfometría, de solo lectura.

   F1-165: cada calculadora tenía su propio «Localización» con su valor por
   defecto, y una sin tocar cambiaba la cifra sin que nadie lo viera. Ahora se
   enseña la elegida y cómo cambiarla; sin ella, se dice y no se calcula. */

import { PICK_SITE, siteLabel } from "./thresholds";

/** Lleva al selector único de Morfometría (está encima de las pestañas). */
export function focusSiteSelector() {
  const el = document.querySelector<HTMLSelectElement>("select[data-localizacion]");
  el?.scrollIntoView?.({ block: "center" });
  el?.focus();
}

export function InheritedSite({
  site, known, onChange = focusSiteSelector,
}: {
  /** La localización clínica elegida (ANEURYSM_LOCATIONS), o null. */
  site: string | null | undefined;
  /** Si la escala tiene categoría para ella: sin ella no se calcula. */
  known: boolean;
  onChange?: () => void;
}) {
  const link = (
    <button
      type="button"
      onClick={onChange}
      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer",
               fontSize: 12, fontWeight: 600, color: "var(--brand-deep)" }}
    >
      Cambiar en Morfometría
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ color: "var(--muted-foreground)" }}>
        Localización: <b style={{ color: "var(--foreground)" }}>{site ? siteLabel(site) : "Desconocida / No especificada"}</b>
        {" · "}{link}
      </div>
      {!known && <div style={{ color: "var(--warning)" }}>{PICK_SITE}</div>}
    </div>
  );
}
