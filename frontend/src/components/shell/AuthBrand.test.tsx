/* El panel de marca de «Entrar» y «Crear cuenta» vuelve a llevar el vídeo de la
   casa (pedido del dueño tras F2), con el texto fijo en blanco sobre él. */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthBrand, VIDEO_MARCA } from "./AuthBrand";

const montar = () => render(<MemoryRouter><AuthBrand flex="1 1 62%" /></MemoryRouter>);

describe("AuthBrand", () => {
  it("reproduce intro.mp4 en bucle, silenciado y con autoplay", () => {
    const { container } = montar();
    const video = container.querySelector<HTMLVideoElement>(`video[src="${VIDEO_MARCA}"]`);
    expect(video).not.toBeNull();
    expect(video!.muted || video!.hasAttribute("muted") || video!.defaultMuted).toBe(true);
    expect(video!.loop).toBe(true);
    expect(video!.autoplay).toBe(true);
    expect(video!.getAttribute("playsinline")).not.toBeNull();
  });

  it("lleva el logotipo y el lema único, sin librerías, en blanco sobre el vídeo", () => {
    const { container } = montar();
    expect(screen.getByText("PROSPECTIVE")).toBeInTheDocument();
    const lema = screen.getByText("Planificación neurovascular con datos");
    expect(lema.style.color).toBe("var(--on-media)");
    expect(container.textContent).not.toMatch(/VTK|SimpleITK|SKULLAPP/);
    expect(container.querySelector(".login-media")).not.toBeNull();
  });
});
