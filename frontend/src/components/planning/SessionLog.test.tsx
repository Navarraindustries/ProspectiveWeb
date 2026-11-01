import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionLog } from "./SessionLog";

describe("SessionLog", () => {
  it("lee la duración con coma decimal", () => {
    render(<SessionLog entries={[{ at: new Date(2026, 9, 31, 9, 5, 7), paso: "Segmentación", texto: "Segmentación · 80000 vértices", duracionMs: 1530 }]} />);
    expect(screen.getByText(/1,5 s/)).toBeInTheDocument();
    expect(screen.getByText(/09:05:07/)).toBeInTheDocument();
  });
  it("sin entradas lo dice", () => {
    render(<SessionLog entries={[]} />);
    expect(screen.getByText("Aún no ha pasado nada en esta sesión")).toBeInTheDocument();
  });
});
