import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "../api/types";

const saveOnboarding = vi.fn();
const refreshUser = vi.fn();
let onboarding: OnboardingState;

vi.mock("../api/client", () => ({ api: { saveOnboarding: (s: OnboardingState) => saveOnboarding(s) } }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { id: 1, onboarding }, refreshUser }) }));
vi.mock("./FlujoOnboarding", () => ({ FlujoOnboarding: () => null }));

import { OnboardingProvider } from "./OnboardingProvider";
import { TarjetasPacientes } from "./TarjetasPacientes";

const base = (estado: OnboardingState["estado"], extra: Partial<OnboardingState> = {}): OnboardingState => ({
  estado, fecha: null, pistas_vistas: [], pistas_activas: true, tarjeta_cerrada: false, ...extra,
});
const montar = () => render(<MemoryRouter><OnboardingProvider><TarjetasPacientes /></OnboardingProvider></MemoryRouter>);

beforeEach(() => {
  saveOnboarding.mockReset().mockResolvedValue({});
  refreshUser.mockReset().mockResolvedValue(undefined);
});

describe("TarjetasPacientes", () => {
  it("invitado ve la invitación; «Ahora no» la quita y guarda «saltado»", async () => {
    onboarding = base("invitado");
    montar();
    expect(screen.getByText("Hay un recorrido nuevo de 4 minutos")).toBeInTheDocument();
    expect(screen.queryByText("Primeros pasos sugeridos")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ahora no" })); });
    await waitFor(() => expect(saveOnboarding).toHaveBeenCalled());
    expect((saveOnboarding.mock.calls[0][0] as OnboardingState).estado).toBe("saltado");
    expect(screen.queryByText("Hay un recorrido nuevo de 4 minutos")).toBeNull();
    // Tampoco aparece en su lugar «Primeros pasos sugeridos»: es para quien hizo el recorrido.
    expect(screen.queryByText("Primeros pasos sugeridos")).toBeNull();
    expect((saveOnboarding.mock.calls[0][0] as OnboardingState).tarjeta_cerrada).toBe(true);
  });

  it("«Verlo» arranca el recorrido y las tarjetas se apartan", async () => {
    onboarding = base("invitado");
    montar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verlo" })); });
    expect(screen.queryByText("Hay un recorrido nuevo de 4 minutos")).toBeNull();
    expect(screen.queryByText("Primeros pasos sugeridos")).toBeNull();
  });

  it("completado ve «Primeros pasos sugeridos», plegable, sin contadores", () => {
    onboarding = base("completado");
    montar();
    expect(screen.getByText("Primeros pasos sugeridos")).toBeInTheDocument();
    expect(screen.getByText("Crear tu primer paciente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Plegar" }));
    expect(screen.queryByText("Crear tu primer paciente")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desplegar" }));
    expect(screen.getByText("Crear tu primer paciente")).toBeInTheDocument();
  });

  it("pendiente no muestra nada y la tarjeta cerrada de antes tampoco", () => {
    onboarding = base("saltado", { tarjeta_cerrada: true });
    const { container } = montar();
    expect(container.textContent).toBe("");
  });

  it("al cerrarla desaparece y no vuelve tras refrescar el usuario", async () => {
    onboarding = base("saltado");
    const { rerender } = montar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Cerrar «Primeros pasos/ })); });
    expect(screen.queryByText("Primeros pasos sugeridos")).toBeNull();
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    onboarding = base("saltado", { tarjeta_cerrada: true });
    await act(async () => { rerender(<MemoryRouter><OnboardingProvider><TarjetasPacientes /></OnboardingProvider></MemoryRouter>); });
    expect(screen.queryByText("Primeros pasos sugeridos")).toBeNull();
  });
});
