/* El paso guardado es un número, y el número tiene que seguir queriendo decir
   lo mismo cuando la lista de pasos cambia.

   Esto viene de un fallo real: al insertar «Fabricación» entre Dispositivos e
   Informe el pipeline pasó a ocho pasos, el backend migró las sesiones
   guardadas del 6 al 7 a propósito —hay una migración con nombre para eso— y el
   punto de reanudación del frontend seguía recortando a 6. Deshacía la
   migración desde el otro lado: una sesión guardada en «Informe» reanudaba en
   «Fabricación», un paso que ese usuario nunca había abierto. */
import { describe, expect, it } from "vitest";
import { STEPS, STEP_LABELS, clampStep, stepIndex } from "./steps";

describe("el paso al que se reanuda", () => {
  it("deja llegar al último paso que existe", () => {
    expect(clampStep(STEPS.length - 1)).toBe(STEPS.length - 1);
  });

  it("no recorta «Informe» a «Fabricación»", () => {
    // La forma concreta que tomó el fallo, escrita por nombre y no por índice:
    // así sigue diciendo algo aunque mañana se inserte otro paso.
    const informe = stepIndex("report");
    expect(informe).toBeGreaterThan(stepIndex("manufacture"));
    expect(STEP_LABELS[clampStep(informe)]).toBe("Informe");
  });

  it("trae al rango un paso de una versión con más pasos", () => {
    // Una sesión guardada por una versión posterior no puede mandar al usuario
    // fuera de la lista; se queda en el último paso conocido.
    expect(clampStep(STEPS.length + 3)).toBe(STEPS.length - 1);
  });

  it("no deja pasos negativos ni basura", () => {
    expect(clampStep(-1)).toBe(0);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep(3.7)).toBe(3);
  });

  it("«Fabricación» es opcional y va antes del informe", () => {
    const fab = STEPS[stepIndex("manufacture")];
    expect(fab.optional).toBe(true);
    expect(stepIndex("manufacture")).toBe(stepIndex("devices") + 1);
  });
});
