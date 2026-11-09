import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AvatarCreator } from "./AvatarCreator";
import { configPorDefecto, type AvatarConfig } from "./config";

const base: AvatarConfig = { ...configPorDefecto(1), ojos: "nada", mascarilla: false };

describe("AvatarCreator", () => {
  it("elegir «Lupas quirúrgicas» llama onChange con ojos lupas", () => {
    const onChange = vi.fn();
    render(<AvatarCreator value={base} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Lupas quirúrgicas" }));
    expect(onChange).toHaveBeenCalledWith({ ...base, ojos: "lupas" });
  });

  it("marca con aria-pressed la opción elegida", () => {
    render(<AvatarCreator value={base} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Sin gafas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gafas" })).toHaveAttribute("aria-pressed", "false");
  });

  it("«Deshacer» devuelve el valor anterior", () => {
    const Wrap = () => {
      const [v, setV] = useState(base);
      return <><AvatarCreator value={v} onChange={setV} /><output data-testid="o">{v.ojos}</output></>;
    };
    render(<Wrap />);
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Lupas quirúrgicas" }));
    expect(screen.getByTestId("o").textContent).toBe("lupas");
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByTestId("o").textContent).toBe("nada");
  });

  it("«Aleatorio» emite una configuración válida", () => {
    const onChange = vi.fn();
    render(<AvatarCreator value={base} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Aleatorio" }));
    expect(onChange.mock.calls[0][0].v).toBe(1);
  });

  it("completo muestra Mascarilla y Fondo", () => {
    render(<AvatarCreator value={base} onChange={() => {}} />);
    expect(screen.getByText("Mascarilla")).toBeInTheDocument();
    expect(screen.getByText("Fondo")).toBeInTheDocument();
  });

  it("compacto oculta Mascarilla y Fondo hasta «Más piezas»", () => {
    render(<AvatarCreator value={base} onChange={() => {}} compacto />);
    expect(screen.queryByText("Mascarilla")).toBeNull();
    expect(screen.queryByText("Fondo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Más piezas" }));
    expect(screen.getByText("Mascarilla")).toBeInTheDocument();
    expect(screen.getByText("Fondo")).toBeInTheDocument();
  });
});
