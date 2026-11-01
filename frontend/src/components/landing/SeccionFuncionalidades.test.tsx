import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Funcionalidades } from "./SeccionFuncionalidades";

const TITULOS = [
  "Segmentación 3D automática",
  "Morfometría del saco y del cuello",
  "Motor de decisión: PHASES, JSDB y geometría",
  "Detección por calibre, cociente y curvatura",
  "Prueba de clips, coils y stents",
  "Informe clínico",
  "Clip a medida para fabricar",
  "Sesiones guardadas",
  "Pacientes, casos y estudios",
];

describe("Funcionalidades", () => {
  it("región con nueve tarjetas de cristal en el orden de lectura", () => {
    const { container } = render(<Funcionalidades />);
    expect(container.querySelector("section#funcionalidades")).toHaveAttribute("aria-label", "Funcionalidades");
    const lis = [...container.querySelectorAll("ul.bento > li[data-glass]")];
    expect(lis.map((li) => li.getAttribute("data-area"))).toEqual(
      ["seg", "morfo", "motor", "detec", "prueba", "informe", "clip", "sesiones", "pacientes"],
    );
    for (const t of TITULOS) expect(screen.getByText(t)).toBeInTheDocument();
  });

  it("las tres grandes llevan imagen y las seis pequeñas un icono", () => {
    const { container } = render(<Funcionalidades />);
    const por = (a: string) => container.querySelector<HTMLElement>(`li[data-area="${a}"]`)!;
    const esperadas: [string, string, string][] = [
      ["seg", "/media/landing/secciones/case3-frontal.webp", "Árbol vascular completo de Case 3 visto de frente"],
      ["detec", "/media/landing/secciones/case3-saco.webp", "Primer plano de la lesión del tronco basilar de Case 3, marcada en rojo"],
      ["clip", "/media/landing/clips/navarro-t4-fenestrado.webp", "Clip NAVARRO™ T4 fenestrado"],
    ];
    for (const [a, src, alt] of esperadas) {
      const img = por(a).querySelector("img")!;
      expect(img).toHaveAttribute("src", src);
      expect(img).toHaveAttribute("alt", alt);
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("decoding", "async");
      expect(por(a)).toHaveClass("bento__tarjeta--grande");
    }
    expect(por("detec").querySelector(".halo-lesion")).not.toBeNull();
    for (const a of ["morfo", "motor", "prueba", "informe", "sesiones", "pacientes"]) {
      expect(por(a).querySelector("svg")).not.toBeNull();
      expect(por(a).querySelector("img")).toBeNull();
      expect(por(a)).toHaveClass("bento__tarjeta--pequena");
    }
  });

  it("conserva la nota final", () => {
    render(<Funcionalidades />);
    expect(screen.getByText(/La herramienta propone; el cirujano decide\./)).toBeInTheDocument();
  });
});
