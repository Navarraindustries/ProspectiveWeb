/* Dimensionado de WEB: lo que enseña. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WebSizingResult } from "../../api/types";

vi.mock("../../api/client", () => ({ api: { webSizing: vi.fn() } }));

import { api } from "../../api/client";
import { WebSizing } from "./WebSizing";

const base: WebSizingResult = {
  dims: { width_mm: 6, width_max_mm: 6.4, width_min_mm: 5.6, height_mm: 6, source: "sac" },
  neck_mm: 4.5, dnr: 1.33, volume_mm3: 113, within_indication: true, fill_ratio: 1,
  options: [
    { shape: "SL", width_mm: 7, height_mm: 5, added_mm: 1, target_height_mm: 5, dav: 1.7, label: "WEB SL 7×5" },
    { shape: "SL", width_mm: 8, height_mm: 4, added_mm: 2, target_height_mm: 4, dav: 1.78, label: "WEB SL 8×4" },
  ],
  warnings: [], notes: ["nota"], sources: ["fuente"],
};

describe("dimensionado de WEB", () => {
  it("enseña las medidas del saco y las opciones del catálogo", async () => {
    vi.mocked(api.webSizing).mockResolvedValue(base);
    render(<WebSizing sessionId="s1" />);
    fireEvent.click(screen.getByText("Dimensionar"));
    expect(await screen.findByText("WEB SL 7×5")).toBeInTheDocument();
    expect(screen.getByText("WEB SL 8×4")).toBeInTheDocument();
    expect(screen.getByText("Dentro de la indicación aprobada")).toBeInTheDocument();
    expect(screen.getByText("DAV 1.70")).toBeInTheDocument();
  });

  it("dice cuándo está fuera de la indicación y por qué, sin DAV", async () => {
    vi.mocked(api.webSizing).mockResolvedValue({
      ...base, within_indication: false, fill_ratio: 0.37,
      options: [{ ...base.options[0]!, dav: null }],
      warnings: ["El saco aislado no es un domo lleno"],
    });
    render(<WebSizing sessionId="s1" />);
    fireEvent.click(screen.getByText("Dimensionar"));
    expect(await screen.findByText("Fuera de la indicación aprobada")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("no es un domo lleno");
    expect(screen.queryByText(/^DAV/)).toBeNull();
  });
});
