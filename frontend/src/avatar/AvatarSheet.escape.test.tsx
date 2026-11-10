/* Esc dentro de «Desde mi foto» (el de verdad, sin simular) cierra solo ese
   panel; con el panel cerrado, Esc cierra la hoja «Tu avatar». */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configPorDefecto } from "./config";

let user: Record<string, unknown>;
vi.mock("../store/auth", () => ({ useAuth: () => ({ user, refreshUser: vi.fn() }) }));
vi.mock("../api/client", () => ({
  api: { saveAvatar: vi.fn(), deleteProfilePhoto: vi.fn(), myProfilePhotoObjectUrl: vi.fn(), uploadProfilePhoto: vi.fn(), copyRegistroPhoto: vi.fn() },
}));

import { AvatarSheet } from "./AvatarSheet";

beforeEach(() => {
  user = { id: 7, full_name: "Ana", avatar_config: configPorDefecto(7), avatar_mode: "avatar", has_profile_photo: false };
});

describe("AvatarSheet y Esc", () => {
  it("Esc con «Desde mi foto» abierto cierra el panel, no la hoja; el siguiente Esc sí cierra la hoja", () => {
    const onClose = vi.fn();
    render(<AvatarSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Desde mi foto" }));
    expect(screen.getByText("Elige una foto")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByText("Elige una foto")).toBeNull();
    expect(screen.getByRole("button", { name: "Desde mi foto" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
