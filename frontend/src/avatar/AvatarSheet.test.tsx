import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configPorDefecto } from "./config";

const refreshUser = vi.fn();
let user: Record<string, unknown>;
vi.mock("../store/auth", () => ({ useAuth: () => ({ user, refreshUser }) }));
vi.mock("../api/client", () => ({
  api: {
    saveAvatar: vi.fn().mockResolvedValue({}),
    deleteProfilePhoto: vi.fn().mockResolvedValue({}),
    myProfilePhotoObjectUrl: vi.fn().mockResolvedValue("blob:x"),
    uploadProfilePhoto: vi.fn().mockResolvedValue({}),
    copyRegistroPhoto: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("./DesdeMiFoto", () => ({
  DesdeMiFoto: ({ base, onListo }: { base: unknown; onListo: (r: unknown) => void }) => (
    <div>
      <button onClick={() => onListo({ config: { ...(base as object), piel: 4 }, mostrar: "avatar", foto: null })}>fake-avatar</button>
      <button onClick={() => onListo({ config: base, mostrar: "foto", foto: new Blob(["j"]) })}>fake-foto</button>
      <button onClick={() => onListo({ config: base, mostrar: "foto", foto: null, usarRegistro: true })}>fake-registro</button>
    </div>
  ),
}));

import { api } from "../api/client";
import { AvatarSheet } from "./AvatarSheet";

const cfg = configPorDefecto(7);

beforeEach(() => {
  vi.clearAllMocks();
  refreshUser.mockResolvedValue(undefined);
  user = { id: 7, full_name: "Ana", avatar_config: cfg, avatar_mode: "avatar", has_profile_photo: false };
});

describe("AvatarSheet", () => {
  it("«Guardar» llama api.saveAvatar(config, 'avatar') y refreshUser", async () => {
    const onClose = vi.fn();
    render(<AvatarSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalledWith(cfg, "avatar"));
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("sin foto de perfil, «Mi foto» está deshabilitado y no hay «Quitar mi foto»", () => {
    render(<AvatarSheet open onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Mi foto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Quitar mi foto" })).toBeNull();
  });

  it("con foto, «Quitar mi foto» llama api.deleteProfilePhoto", async () => {
    user = { ...user, has_profile_photo: true, avatar_mode: "foto" };
    render(<AvatarSheet open onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Mi foto" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar mi foto" }));
    await waitFor(() => expect(api.deleteProfilePhoto).toHaveBeenCalled());
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("elegir «Mi foto» y guardar envía modo foto", async () => {
    user = { ...user, has_profile_photo: true, avatar_mode: "avatar" };
    render(<AvatarSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Mi foto" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalledWith(cfg, "foto"));
  });

  it("si guardar falla, muestra el error, no cierra y conserva el borrador", async () => {
    vi.mocked(api.saveAvatar).mockRejectedValueOnce(new Error("Sin conexión"));
    const onClose = vi.fn();
    render(<AvatarSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Lupas quirúrgicas" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Lupas quirúrgicas" })).toHaveAttribute("aria-pressed", "true");
  });

  it("tras «Quitar mi foto» el borrador queda en modo avatar y guarda 'avatar'", async () => {
    user = { ...user, has_profile_photo: true, avatar_mode: "foto" };
    render(<AvatarSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar mi foto" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mi avatar" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalledWith(cfg, "avatar"));
  });

  it("«Desde mi foto» con «Mi avatar»: aplica la config y no sube nada", async () => {
    render(<AvatarSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desde mi foto" }));
    fireEvent.click(screen.getByRole("button", { name: "fake-avatar" }));
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
    expect(api.copyRegistroPhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalledWith({ ...cfg, piel: 4 }, "avatar"));
  });

  it("«Desde mi foto» con «Mi foto»: sube el recorte y refresca", async () => {
    render(<AvatarSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desde mi foto" }));
    fireEvent.click(screen.getByRole("button", { name: "fake-foto" }));
    await waitFor(() => expect(api.uploadProfilePhoto).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("«Desde mi foto» con la foto del registro: la copia en vez de subir", async () => {
    render(<AvatarSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desde mi foto" }));
    fireEvent.click(screen.getByRole("button", { name: "fake-registro" }));
    await waitFor(() => expect(api.copyRegistroPhoto).toHaveBeenCalled());
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
  });
});
