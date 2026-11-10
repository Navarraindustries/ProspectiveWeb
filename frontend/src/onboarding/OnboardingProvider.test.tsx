import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "../api/types";

const saveOnboarding = vi.fn();
const refreshUser = vi.fn();
let onboarding: OnboardingState | undefined;

vi.mock("../api/client", () => ({ api: { saveOnboarding: (s: OnboardingState) => saveOnboarding(s) } }));
vi.mock("../store/auth", () => ({
  useAuth: () => ({ user: { id: 1, onboarding }, refreshUser }),
}));

vi.mock("./FlujoOnboarding", () => ({ FlujoOnboarding: () => null }));

import { OnboardingProvider, useOnboarding } from "./OnboardingProvider";

let ctx: ReturnType<typeof useOnboarding>;
function Probe() {
  ctx = useOnboarding();
  return <p data-testid="m">{ctx.momento ?? "-"}</p>;
}
const montar = (strict = false) => {
  const el = <OnboardingProvider><Probe /></OnboardingProvider>;
  return render(strict ? <StrictMode>{el}</StrictMode> : el);
};
const base = (estado: OnboardingState["estado"], extra: Partial<OnboardingState> = {}): OnboardingState => ({
  estado, fecha: null, pistas_vistas: [], pistas_activas: true, tarjeta_cerrada: false, ...extra,
});

beforeEach(() => {
  saveOnboarding.mockReset().mockResolvedValue({});
  refreshUser.mockReset().mockResolvedValue(undefined);
  onboarding = base("pendiente");
});

describe("OnboardingProvider", () => {
  it("pendiente: arranca en «hola» y guarda «saltado» con fecha, una sola vez en StrictMode", async () => {
    montar(true);
    expect(screen.getByTestId("m").textContent).toBe("hola");
    expect(ctx.activo).toBe(true);
    await waitFor(() => expect(saveOnboarding).toHaveBeenCalledTimes(1));
    const s = saveOnboarding.mock.calls[0][0] as OnboardingState;
    expect(s.estado).toBe("saltado");
    expect(typeof s.fecha).toBe("string");
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("sin onboarding en /me (servidor viejo o vuelta atrás) queda inerte: no arranca, no guarda, sin tarjeta ni pistas", async () => {
    onboarding = undefined;
    montar();
    expect(screen.getByTestId("m").textContent).toBe("-");
    expect(ctx.activo).toBe(false);
    expect(ctx.estado.estado).not.toBe("pendiente");
    expect(ctx.estado.estado).not.toBe("invitado");
    expect(ctx.estado.tarjeta_cerrada).toBe(true);
    expect(ctx.estado.pistas_activas).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(saveOnboarding).not.toHaveBeenCalled();
  });

  it.each(["invitado", "completado", "saltado"] as const)("%s: no arranca ni guarda", async (e) => {
    onboarding = base(e);
    montar();
    expect(screen.getByTestId("m").textContent).toBe("-");
    expect(ctx.activo).toBe(false);
    expect(saveOnboarding).not.toHaveBeenCalled();
  });

  it("terminar('completado') guarda completado y cierra el flujo", async () => {
    montar();
    await waitFor(() => expect(saveOnboarding).toHaveBeenCalledTimes(1));
    await act(async () => { await ctx.terminar("completado"); });
    expect((saveOnboarding.mock.calls.at(-1)![0] as OnboardingState).estado).toBe("completado");
    expect(screen.getByTestId("m").textContent).toBe("-");
  });

  it("marcarPista(3) añade 3 sin duplicar, y las llamadas rápidas no pierden cambios", async () => {
    onboarding = base("completado");
    montar();
    await act(async () => { await ctx.marcarPista(3); await ctx.marcarPista(3); });
    expect(saveOnboarding.mock.calls.at(-1)![0].pistas_vistas).toEqual([3]);
    await act(async () => { await Promise.all([ctx.marcarPista(1), ctx.marcarPista(2)]); });
    expect(saveOnboarding.mock.calls.at(-1)![0].pistas_vistas).toEqual([1, 2, 3]);
  });

  it("reiniciarPistas, setPistasActivas, cerrarTarjeta y descartarInvitacion", async () => {
    onboarding = base("invitado", { pistas_vistas: [1, 2] });
    montar();
    await act(async () => { await ctx.reiniciarPistas(); });
    expect(saveOnboarding.mock.calls.at(-1)![0].pistas_vistas).toEqual([]);
    await act(async () => { await ctx.setPistasActivas(false); });
    expect(saveOnboarding.mock.calls.at(-1)![0].pistas_activas).toBe(false);
    await act(async () => { await ctx.cerrarTarjeta(); });
    expect(saveOnboarding.mock.calls.at(-1)![0].tarjeta_cerrada).toBe(true);
    await act(async () => { await ctx.descartarInvitacion(); });
    expect(saveOnboarding.mock.calls.at(-1)![0].estado).toBe("saltado");
  });

  it("reiniciarPistas vuelve a encender las pistas apagadas", async () => {
    onboarding = base("completado", { pistas_vistas: [1, 4], pistas_activas: false });
    montar();
    await act(async () => { await ctx.reiniciarPistas(); });
    const s = saveOnboarding.mock.calls.at(-1)![0] as OnboardingState;
    expect(s.pistas_vistas).toEqual([]);
    expect(s.pistas_activas).toBe(true);
    expect(ctx.estado.pistas_activas).toBe(true);
  });

  it("descartarInvitacion («Ahora no») cierra también «Primeros pasos sugeridos»", async () => {
    onboarding = base("invitado");
    montar();
    await act(async () => { await ctx.descartarInvitacion(); });
    const s = saveOnboarding.mock.calls.at(-1)![0] as OnboardingState;
    expect(s.estado).toBe("saltado");
    expect(s.tarjeta_cerrada).toBe(true);
  });

  it("empezar() manual abre «hola» y ir() cambia de momento", async () => {
    onboarding = base("completado");
    montar();
    act(() => ctx.empezar());
    expect(screen.getByTestId("m").textContent).toBe("hola");
    act(() => ctx.ir("avatar"));
    expect(screen.getByTestId("m").textContent).toBe("avatar");
  });

  it("fuera del proveedor devuelve un valor inerte", async () => {
    render(<Probe />);
    expect(ctx.activo).toBe(false);
    await act(async () => { await ctx.marcarPista(1); });
    expect(saveOnboarding).not.toHaveBeenCalled();
  });
});
