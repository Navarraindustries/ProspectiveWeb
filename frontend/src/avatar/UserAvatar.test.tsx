import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userUrl = vi.fn();
const myUrl = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    userProfilePhotoObjectUrl: (id: number) => userUrl(id),
    myProfilePhotoObjectUrl: () => myUrl(),
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
    expect(userUrl).toHaveBeenCalledWith(7);
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
