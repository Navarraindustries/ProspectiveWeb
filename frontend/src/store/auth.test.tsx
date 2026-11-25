/* FE-6: cerrar sesión avisa a quien guarda datos del paciente en memoria
   (el store de planificación, los borradores del informe, el IVUS). */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({
  api: { me: vi.fn().mockResolvedValue({ id: 1, username: "a" }), logout: vi.fn().mockResolvedValue(undefined) },
  hasSession: () => true,
  markSession: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));
vi.mock("../vtk/volume/volumeCache", () => ({ clearVolumeCache: vi.fn().mockResolvedValue(undefined) }));

import { AuthProvider, alCerrarSesion, useAuth } from "./auth";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("al cerrar sesión", () => {
  it("avisa a quien se apuntó, y deja de avisar a quien se borró", async () => {
    const limpia = vi.fn();
    const otra = vi.fn();
    const quitar = alCerrarSesion(limpia);
    const quitarOtra = alCerrarSesion(otra);
    quitarOtra();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.logout());
    expect(limpia).toHaveBeenCalledTimes(1);
    expect(otra).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    quitar();
  });

  it("una limpieza que falla no impide salir", async () => {
    const quitar = alCerrarSesion(() => { throw new Error("roto"); });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    quitar();
  });
});
