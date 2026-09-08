/* La portada es lo único que un desconocido lee antes de decidir si esto sirve,
   y era lo último que se actualizaba.

   Anunciaba «42 modelos» de Aesculap, Sugita y Codman meses después de que esos
   clips dejaran de ofrecerse —la aplicación no sirve ninguno y este centro no
   puede conseguirlos— y prometía un flujo de «siete pasos» justo encima de las
   ocho fichas que ella misma dibuja desde `STEPS`.

   Las dos son del mismo tipo: una afirmación escrita a mano al lado del dato que
   la desmiente. Estas pruebas la atan al dato. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Landing } from "./Landing";
import { STEPS } from "../pipeline/steps";

const show = () => render(<MemoryRouter><Landing /></MemoryRouter>);

describe("lo que la portada promete", () => {
  it("cuenta los pasos que hay, no los que había", () => {
    show();
    const WORDS = ["cero", "uno", "dos", "tres", "cuatro", "cinco",
                   "seis", "siete", "ocho", "nueve", "diez"];
    expect(screen.getByText(new RegExp(`en ${WORDS[STEPS.length]} pasos`, "i")))
      .toBeInTheDocument();
  });

  it("enseña todos los pasos, «Fabricación» incluida", () => {
    show();
    for (const s of STEPS) {
      expect(screen.getAllByText(s.label).length).toBeGreaterThan(0);
    }
  });

  it("no anuncia clips de marcas que ya no se ofrecen", () => {
    const { container } = show();
    const copy = container.textContent ?? "";
    for (const maker of ["Sugita", "Aesculap", "Yasargil", "Codman", "Mizuho"]) {
      expect(copy).not.toContain(maker);
    }
  });

  it("nombra la familia que sí se ofrece, y sus cuatro series", () => {
    show();
    expect(screen.getByText(/NAVARRO/)).toBeInTheDocument();
    for (const serie of [/T1 recta/, /T2 curva/, /T3 angulada/, /T4 fenestrada/]) {
      expect(screen.getByText(serie)).toBeInTheDocument();
    }
  });

  it("no se calla el paso de fabricación entre lo que ofrece", () => {
    // Es un paso entero del flujo, con pedido, taller y expediente: omitirlo es
    // la otra mitad del mismo desfase.
    const { container } = show();
    expect(container.textContent ?? "").toMatch(/taller/i);
  });
});
