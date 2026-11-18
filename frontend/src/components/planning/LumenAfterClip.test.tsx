/* P1 (18-11): la luz que queda en la arteria madre y en las ramas con el clip cerrado. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OcclusionOut } from "../../api/types";
import { LumenAfterClip } from "./DevicesPanel";

const base: OcclusionOut = {
  outcome: "completa", sac_volume_mm3: 100, excluded_mm3: 100, remnant_mm3: 0, remnant_fraction_pct: 0,
  remnant_width_mm: 0, summary: "", cautions: [], remnant_mesh_url: null, clip_name: "Clip", jaw_aperture_mm: 5,
};
const seccion = (arc_mm: number, free_pct: number) => ({ arc_mm, area_mm2: 7, free_mm2: (7 * free_pct) / 100, free_pct });

describe("LumenAfterClip", () => {
  it("dice cuánto queda en la sección más afectada, dibuja el perfil y lista las ramas", () => {
    render(<LumenAfterClip data={{
      ...base, parent_measured: true, lumen_summary: "Arteria madre: …", parent_raise_mm: 1.8,
      parent_sections: [seccion(10, 100), seccion(12, 82), seccion(14, 100)], parent_worst: seccion(12, 82),
      branch_lumen: [{ index: 1, position_mm: { x: 0, y: 0, z: 0 }, calibre_mm: 1.4, distance_mm: 2.1, free_pct: 40 }],
    }} />);
    expect(screen.getByText(/queda el 82 % en la sección más afectada \(a 12,0 mm/)).toBeInTheDocument();
    expect(screen.getByText(/Subiendo el clip 1,8 mm hacia el domo queda libre/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Luz libre de la arteria madre/ })).toBeInTheDocument();
    expect(screen.getByText(/Rama Ø 1,4 mm a 2,1 mm del clip: conserva el 40 %/)).toBeInTheDocument();
    expect(screen.getByText(/Apertura supuesta de la mordaza: 5,0 mm/)).toBeInTheDocument();
  });

  it("si la madre queda intacta lo dice; sin línea central, dice cómo medirla", () => {
    const { unmount } = render(<LumenAfterClip data={{
      ...base, parent_measured: true, lumen_summary: "x", parent_sections: [seccion(1, 100), seccion(2, 100)],
      parent_worst: seccion(1, 100), branch_lumen: [],
    }} />);
    expect(screen.getByText("Arteria madre: el clip no invade su luz.")).toBeInTheDocument();
    unmount();
    render(<LumenAfterClip data={{
      ...base, parent_measured: false,
      lumen_summary: "Arteria madre: sin medir; extrae la línea central por la arteria madre (con destino más allá del aneurisma) para medirla. Otra frase.",
    }} />);
    expect(screen.getByText(/extrae la línea central por la arteria madre/)).toBeInTheDocument();
  });

  it("sin nada medido no pinta nada (respuestas de antes de la P1)", () => {
    const { container } = render(<LumenAfterClip data={base} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LumenAfterClip · ramas", () => {
  const rama = (index: number, free_pct: number) => ({ index, position_mm: { x: 0, y: 0, z: 0 }, calibre_mm: 1, distance_mm: 3, free_pct });
  it("lista solo las ramas que el clip alcanza y resume las libres", () => {
    render(<LumenAfterClip data={{ ...base, lumen_summary: "x", branch_lumen: [rama(1, 60), rama(2, 100), rama(3, 100)] }} />);
    expect(screen.getAllByText(/^Rama Ø/)).toHaveLength(1);
    expect(screen.getByText("Otras 2 ramas visibles cercanas quedan libres.")).toBeInTheDocument();
  });
  it("si ninguna queda dentro, lo dice con el número", () => {
    render(<LumenAfterClip data={{ ...base, lumen_summary: "x", branch_lumen: [rama(1, 100), rama(2, 100)] }} />);
    expect(screen.queryByText(/^Rama Ø/)).toBeNull();
    expect(screen.getByText("Ninguna de las 2 ramas visibles cercanas queda dentro de la mordaza.")).toBeInTheDocument();
  });
});
