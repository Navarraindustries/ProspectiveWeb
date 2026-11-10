import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userUrl = vi.fn();
const myUrl = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    userProfilePhotoObjectUrl: (id: number, rev?: number | null) => userUrl(id, rev),
    myProfilePhotoObjectUrl: (rev?: number | null) => myUrl(rev),
  },
}));

import { UserAvatar } from "./UserAvatar";

beforeEach(() => {
  userUrl.mockReset();
  myUrl.mockReset();
});

describe("UserAvatar", () => {
  it("sin config dibuja el avatar por defecto del id", () => {
    const { container } = render(<UserAvatar user={{ id: 7, full_name: "Ana Ruiz" }} size={28} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Ana Ruiz" })).toBeTruthy();
  });

  it("modo foto con foto: <img> con la URL del mock", async () => {
    userUrl.mockResolvedValue("blob:foto-1");
    const { container } = render(<UserAvatar user={{ id: 7, full_name: "Ana Ruiz", avatar_mode: "foto", has_profile_photo: true }} size={28} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:foto-1");
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("Ana Ruiz");
    expect(userUrl).toHaveBeenCalledWith(7, null);
  });

  it("self usa la foto propia", async () => {
    myUrl.mockResolvedValue("blob:mia");
    const { container } = render(<UserAvatar self user={{ id: 7, full_name: "Ana Ruiz", avatar_mode: "foto", has_profile_photo: true }} size={28} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:mia");
    expect(userUrl).not.toHaveBeenCalled();
  });

  it("modo foto y la carga falla: avatar", async () => {
    userUrl.mockRejectedValue(new Error("404"));
    const { container } = render(<UserAvatar user={{ id: 7, full_name: "Ana Ruiz", avatar_mode: "foto", has_profile_photo: true }} size={28} />);
    await waitFor(() => expect(userUrl).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(container.querySelector("img")).toBeNull();
  });

  it("modo avatar con foto de perfil: no pide la foto", () => {
    const { container } = render(<UserAvatar user={{ id: 7, full_name: "Ana Ruiz", avatar_mode: "avatar", has_profile_photo: true }} size={28} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(userUrl).not.toHaveBeenCalled();
  });
});

describe("UserAvatar: foto sustituida", () => {
  it("al cambiar profile_photo_rev vuelve a pedir la foto (con la revisión) y la muestra", async () => {
    myUrl.mockResolvedValueOnce("blob:vieja").mockResolvedValueOnce("blob:nueva");
    const u = { id: 7, full_name: "Ana Ruiz", avatar_mode: "foto" as const, has_profile_photo: true };
    const { container, rerender } = render(<UserAvatar self user={{ ...u, profile_photo_rev: 100 }} size={28} />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:vieja"));
    expect(myUrl).toHaveBeenLastCalledWith(100);
    rerender(<UserAvatar self user={{ ...u, profile_photo_rev: 200 }} size={28} />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:nueva"));
    expect(myUrl).toHaveBeenCalledTimes(2);
    expect(myUrl).toHaveBeenLastCalledWith(200);
  });

  it("la misma revisión no vuelve a pedirla", async () => {
    userUrl.mockResolvedValue("blob:x");
    const u = { id: 9, full_name: "B", avatar_mode: "foto" as const, has_profile_photo: true, profile_photo_rev: 5 };
    const { container, rerender } = render(<UserAvatar user={u} size={28} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    rerender(<UserAvatar user={{ ...u }} size={28} />);
    expect(userUrl).toHaveBeenCalledTimes(1);
    expect(userUrl).toHaveBeenCalledWith(9, 5);
  });
});
