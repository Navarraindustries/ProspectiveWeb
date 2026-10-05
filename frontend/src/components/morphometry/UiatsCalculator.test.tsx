/* UIATS: qué rellena solo, qué solo sugiere y qué manda. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MorphometryResult } from "../../api/types";

vi.mock("../../api/client", () => ({
  api: {
    uiats: vi.fn().mockResolvedValue({
      repair: 19, conservative: 7, difference: 12, recommendation: "repair",
      repair_items: [{ label: "Fumador actual", points: 3 }],
      conservative_items: [{ label: "Riesgo de la intervención (constante)", points: 5 }],
      notes: ["Consenso de 69 especialistas"], sources: [],
    }),
  },
}));

import { api } from "../../api/client";
import { UiatsCalculator } from "./UiatsCalculator";

const m = { max_diameter_mm: 8.0, neck_mm: 4.8, sr: 2.0, ar: 1.8, ui: 0.1 } as unknown as MorphometryResult;

describe("UIATS", () => {
  it("rellena edad y diámetro, y manda lo marcado", async () => {
    const hace45 = new Date(); hace45.setFullYear(hace45.getFullYear() - 45); hace45.setDate(hace45.getDate() - 2);
    render(<UiatsCalculator m={m} sessionId="s1" dob={hace45.toISOString().slice(0, 10)} />);
    expect((screen.getByLabelText("Edad (años)") as HTMLInputElement).value).toBe("45");
    expect((screen.getByLabelText("Diámetro máximo (mm)") as HTMLInputElement).value).toBe("8.0");
    fireEvent.click(screen.getByText("Fumador actual"));
    fireEvent.click(screen.getByText("Calcular UIATS"));
    await waitFor(() => expect(api.uiats).toHaveBeenCalledWith(expect.objectContaining({
      session_id: "s1", age_years: 45, diameter_mm: 8, risk_factors: ["smoking"], complexity: "low",
      life_expectancy: null,
    })));
    expect(await screen.findByText("A favor de tratar")).toBeInTheDocument();
  });

  it("las pistas de la morfometría se enseñan pero no se marcan", () => {
    // AR 1,8 > 1,6, y el cuello (4,8) es más ancho que la arteria madre (8 / 2 = 4).
    render(<UiatsCalculator m={m} sessionId="s1" />);
    expect(screen.getByText(/La morfometría da SR 2.00 y AR 1.80/)).toBeInTheDocument();
    expect(screen.getByText(/sugiere complejidad alta/)).toBeInTheDocument();
    expect((screen.getByLabelText(/SR > 3 o AR > 1,6/) as HTMLInputElement).checked).toBe(false);
  });
});
