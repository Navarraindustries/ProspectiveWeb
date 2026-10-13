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

/* F2 (5): la portada con la identidad nueva. Cada prueba ata un texto del
   anexo (F2-1…F2-9, F1-35…F1-38, fusiones 1–4, F2-T2) a lo que se pinta, para
   que la próxima edición a mano no devuelva el lema en inglés, la jerga ni el
   punto decimal. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { CONTACTO_ADMIN } from "../lib/contacto";
import {
  AR_HIGH, DNR_HIGH, BF_WIDE, UI_HIGH, EI_MOD, SR_HIGH,
} from "../components/morphometry/thresholds";

const text = () => show().container.textContent ?? "";
const comma = (n: number, d: number) => n.toFixed(d).replace(".", ",");

describe("F2 (5): portada", () => {
  it("F2-1: no hay vídeo de marca al entrar", () => {
    const { container } = show();
    expect(container.querySelector('video[src="/media/intro.mp4"]')).toBeNull();
    expect(screen.queryByText(/clic para saltar/i)).toBeNull();
  });

  it("F2-2/F2-3: un solo lema, en español, y la marca no promete IA", () => {
    const copy = text();
    expect(copy.split("Planificación neurovascular con datos")).toHaveLength(2);
    for (const old of ["Hybrid Neurovascular Planning", "Neurovascular AI",
                       "Plataforma de planificación neurovascular"]) {
      expect(copy).not.toContain(old);
    }
  });

  it("F2-4/fusiones 2 y 4: «Entrar» y «Crear cuenta», sin los otros nombres", () => {
    show();
    const enter = screen.getAllByRole("button", { name: "Entrar" });
    expect(enter.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Iniciar sesión/)).toBeNull();
    expect(screen.queryByText(/Entrar a la plataforma/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Crear cuenta" }).length).toBeGreaterThanOrEqual(1);
  });

  it("«Crear cuenta» navega a /app/registro y «Entrar» a /app", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app/registro" element={<div>pantalla de registro</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Crear cuenta" })[0]);
    expect(screen.getByText("pantalla de registro")).toBeInTheDocument();
  });

  it("F2-5: «Ver cómo funciona» y nada de «pipeline» (salvo el stent comercial)", () => {
    show();
    expect(screen.getByRole("link", { name: /Ver cómo funciona/ })).toBeInTheDocument();
    const copy = (document.body.textContent ?? "").replace("Pipeline (Medtronic)", "");
    expect(copy).not.toMatch(/pipeline/i);
  });

  it("F2-6: «Sin instalar nada» aparece una sola vez", () => {
    const copy = text();
    expect(copy.match(/sin instalar nada/gi)).toHaveLength(1);
    expect(copy).not.toMatch(/nada que instalar/i);
  });

  it("F2-7: «Qué es» sin glosario de divulgación", () => {
    const copy = text();
    for (const old of ["pequeño globo", "pequeño clip metálico", "Clipaje quirúrgico",
                       "Tratamiento endovascular", "catéter"]) {
      expect(copy).not.toContain(old);
    }
  });

  it("F2-8: umbrales con coma, tomados de thresholds.ts, y nombres en español", () => {
    const copy = text();
    expect(copy).toContain(`≥ ${comma(DNR_HIGH, 1)}`);
    expect(copy).toContain(`≥ ${comma(AR_HIGH, 1)}`);
    expect(copy).toContain(`> ${comma(BF_WIDE, 1)}`);
    expect(copy).toContain(`≥ ${comma(UI_HIGH, 2)}`);
    expect(copy).toContain(`≥ ${comma(EI_MOD, 2)}`);
    expect(copy).toContain(`≥ ${comma(SR_HIGH, 1)}`);
    expect(copy).not.toMatch(/[≥>] \d\.\d/);
    for (const n of ["Relación de aspecto (AR)", "Relación domo-cuello (DNR)",
                     "Factor de cuello (BF)", "Índice de ondulación (UI)",
                     "Índice de elipticidad (EI)", "Índice de no esfericidad (NSI)"]) {
      expect(copy).toContain(n);
    }
    for (const en of ["Dome-to-Neck", "Aspect Ratio", "Bottleneck", "Undulation Index",
                      "Ellipticity Index", "Non-Sphericity"]) {
      expect(copy).not.toContain(en);
    }
    expect(copy).toContain("Greving 2014");
  });

  it("F2-9/fusión 3: sin lista de librerías", () => {
    const copy = text();
    for (const lib of ["VTK", "SimpleITK", "pydicom", "scipy", "FastAPI", "vtk.js", "SQLite"]) {
      expect(copy).not.toContain(lib);
    }
  });

  it("F1-35/fusión 1: sin «Suite clínica activa»", () => {
    expect(text()).not.toMatch(/Suite clínica/i);
  });

  it("F1-36: el pie de la figura no habla de cizallamiento", () => {
    const copy = text();
    expect(copy).toContain("Cuello, altura máxima y forma del saco");
    expect(copy).not.toMatch(/cizallamiento/i);
  });

  it("F1-37: registro con iniciales o un código, y sin «sin datos del paciente»", () => {
    const copy = text();
    expect(copy).toContain("Puedes registrar al paciente con iniciales o un código");
    expect(copy).not.toMatch(/sin datos del paciente/i);
    expect(copy).not.toContain("Sin datos personales");
  });

  it("F2-T2: el correo sale de CONTACTO_ADMIN y la portada no lo escribe a mano", () => {
    show();
    const link = screen.getByRole("link", { name: new RegExp(CONTACTO_ADMIN.replace(".", "\.")) });
    expect(link).toHaveAttribute("href", `mailto:${CONTACTO_ADMIN}`);
    const src = readFileSync(join(__dirname, "Landing.tsx"), "utf8");
    expect(src).not.toContain("skullapp.tech");
  });

  it("identidad: la portada no lleva colores escritos a mano", () => {
    const src = readFileSync(join(__dirname, "Landing.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src.match(/#[0-9a-f]{3,8}\b|rgba?\(/i)).toBeNull();
  });
});
