import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Proximamente } from "./SeccionProximamente";

describe("Proximamente", () => {
  it("tres tarjetas de cristal con icono, título, texto e insignia", () => {
    const { container } = render(<Proximamente />);
    expect(container.querySelector("section#proximamente")).toHaveAttribute("aria-label", "Próximamente");
    const lis = [...container.querySelectorAll("ul.proximo > li[data-glass]")];
    expect(lis).toHaveLength(3);
    const esperado: [string, string][] = [
      ["SkullCloud", "Almacenamiento y colaboración de casos en la nube entre centros."],
      ["AR / VR", "Exploración inmersiva de la anatomía vascular y el plan quirúrgico."],
      ["Analítica", "Estadísticas agregadas de casos, dispositivos y resultados."],
    ];
    lis.forEach((li, i) => {
      expect(li.querySelector("h3")).toHaveTextContent(esperado[i][0]);
      expect(li.textContent).toContain(esperado[i][1]);
      expect(li.querySelector("svg")).not.toBeNull();
      expect(li.querySelector(".proximo__insignia")).toHaveTextContent("Próximamente");
    });
  });
});
