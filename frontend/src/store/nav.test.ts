/* Every screen has a URL now. Before this the active screen lived in a
   `useState`, so Back walked out of the application, a refresh always landed on
   the patient list, and there was no link to send a colleague. */

import { describe, expect, it } from "vitest";
import { SCREEN_PATH, patientIdFromPath, patientPath, screenFromPath } from "./nav";
import type { Screen } from "./nav";

// La ficha ("patient") comparte el tramo /app/pacientes con la lista: su URL
// real lleva el id (patientPath), así que no entra en las pruebas de unicidad.
const SCREENS = (Object.keys(SCREEN_PATH) as Screen[]).filter((s) => s !== "patient");

describe("screen ↔ URL", () => {
  it("round-trips every screen through its path", () => {
    for (const s of SCREENS) {
      expect(screenFromPath(SCREEN_PATH[s])).toBe(s);
    }
  });

  it("gives every screen a distinct path", () => {
    expect(new Set(Object.values(SCREEN_PATH)).size).toBe(SCREENS.length);
  });

  it("keeps every path under /app so the landing route stays free", () => {
    for (const path of Object.values(SCREEN_PATH)) {
      expect(path.startsWith("/app/")).toBe(true);
    }
  });

  it("la ficha tiene URL propia: /app/pacientes/:id", () => {
    expect(patientPath(42)).toBe("/app/pacientes/42");
    expect(screenFromPath("/app/pacientes/42")).toBe("patient");
    expect(screenFromPath("/app/pacientes/42/")).toBe("patient");
    expect(patientIdFromPath("/app/pacientes/42")).toBe(42);
    expect(patientIdFromPath("/app/pacientes/42/")).toBe(42);
  });

  it("un id que no es entero positivo no abre ficha: cae en la lista", () => {
    for (const mala of ["abc", "0", "-3", "4.5", "42x"]) {
      expect(screenFromPath(`/app/pacientes/${mala}`)).toBe("patients");
      expect(patientIdFromPath(`/app/pacientes/${mala}`)).toBeNull();
    }
    expect(patientIdFromPath("/app/pacientes")).toBeNull();
    expect(patientIdFromPath("/app/estudios/42")).toBeNull();
  });

  it("treats bare /app as the patient list", () => {
    // The landing page links to /app; it must not dead-end.
    expect(screenFromPath("/app")).toBe("patients");
  });

  it("ignores a trailing slash", () => {
    expect(screenFromPath("/app/pacientes/")).toBe("patients");
    expect(screenFromPath("/app/")).toBe("patients");
  });

  it("reconoce la ruta antigua /app/solicitudes como «Cuentas pendientes» (F2)", () => {
    // Marcadores y enlaces enviados antes del cambio de nombre siguen llegando.
    expect(screenFromPath("/app/solicitudes")).toBe("pending");
    expect(SCREEN_PATH.pending).toBe("/app/cuentas-pendientes");
  });

  it("falls back to the patient list for an unknown path", () => {
    // A stale bookmark should land somewhere usable, not on a blank screen.
    expect(screenFromPath("/app/no-existe")).toBe("patients");
  });
});
