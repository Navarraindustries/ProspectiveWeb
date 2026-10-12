/* Un umbral por índice y una localización traducida a cada escala (familias J, N, O).

   Antes la insignia del AR cortaba en 1,2, la etiqueta de riesgo en 1,3 y
   Decisión en 1,3 y 2,0; el BF decía «Cuello ancho» justo cuando el cuello es
   estrecho; y la localización se pedía cuatro veces con cuatro listas. */

import { describe, expect, it } from "vitest";
import {
  AR_HIGH, AR_MOD, BF_WIDE, DNR_HIGH, THRESHOLD_TIP, isSiteKnown, labelFor, siteFor,
} from "./thresholds";

describe("un umbral por índice", () => {
  it("publica los cortes acordados", () => {
    expect([AR_HIGH, AR_MOD, DNR_HIGH, BF_WIDE]).toEqual([1.6, 1.2, 2.0, 1.5]);
  });

  it("BF alto es cuello estrecho, no ancho (F1-162)", () => {
    expect(labelFor("bf", 1.65)).toBe("Cuello estrecho");
    expect(labelFor("bf", 5)).toBe("Cuello estrecho");
    expect(labelFor("bf", 1.5)).toBe("Cuello ancho");
    expect(labelFor("bf", 1.2)).toBe("Cuello ancho");
  });

  it("AR 1,3 es «Mod» con el corte de 1,2 (F1-161)", () => {
    expect(labelFor("ar", 1.3)).toBe("Mod");
    expect(labelFor("ar", 1.1)).toBe("OK");
    expect(labelFor("ar", 1.6)).toBe("Alto");
  });

  it("DNR corta donde corta el riesgo: 1,6 y 2,0 (F1-160)", () => {
    expect(labelFor("dnr", 1.55)).toBe("OK");
    expect(labelFor("dnr", 1.6)).toBe("Mod");
    expect(labelFor("dnr", 2.0)).toBe("Alto");
  });

  it("cada tooltip lleva su umbral y su fuente", () => {
    expect(THRESHOLD_TIP.dnr).toContain("1,6");
    expect(THRESHOLD_TIP.dnr).toContain("2,0");
    expect(THRESHOLD_TIP.ar).toContain("1,2");
    expect(THRESHOLD_TIP.ar).toContain("Ujiie");
    expect(THRESHOLD_TIP.bf).toContain("1,5");
    expect(THRESHOLD_TIP.ui).toContain("0,25");
  });
});

describe("la localización elegida una vez, en el idioma de cada escala", () => {
  it("basilar es posterior en PHASES", () => {
    expect(siteFor("phases", "basilar")).toBe("aca_pcom_posterior");
    expect(siteFor("phases", "Basilar (punta, tronco o AICA)")).toBe("aca_pcom_posterior");
  });

  it("ACM y ACI van a su categoría", () => {
    expect(siteFor("phases", "ACM — Arteria Cerebral Media")).toBe("mca");
    expect(siteFor("phases", "ACI proximal (segm. cavernoso / clinoideo)")).toBe("ica");
    expect(siteFor("elapss", "ACoP — Arteria Comunicante Posterior")).toBe("pcom_posterior");
    expect(siteFor("elapss", "ACA / ACoA — Arteria Comunicante Anterior")).toBe("ica_aca_acom");
    expect(siteFor("uiats", "ACA / ACoA — Arteria Comunicante Anterior")).toBe("acom_pcom");
    expect(siteFor("uiats", "PICA / Vertebral")).toBe("vertebrobasilar");
  });

  it("la punta basilar suma la bifurcación en UIATS", () => {
    expect(siteFor("uiats", "Punta basilar")).toBe("basilar_bifurcation");
    expect(siteFor("uiats", "Tronco basilar")).toBe("vertebrobasilar");
  });

  it("«Desconocida» da el valor neutro y no cuenta como elegida", () => {
    const d = "Desconocida / No especificada";
    expect(siteFor("phases", d)).toBe("ica");
    expect(siteFor("phases", null)).toBe("ica");
    expect(isSiteKnown("phases", d)).toBe(false);
    expect(isSiteKnown("uiats", null)).toBe(false);
    expect(isSiteKnown("phases", "basilar")).toBe(true);
  });

  it("«Otra localización» vale para UIATS pero no tiene categoría en PHASES", () => {
    expect(isSiteKnown("uiats", "Otra localización")).toBe(true);
    expect(isSiteKnown("phases", "Otra localización")).toBe(false);
  });
});
