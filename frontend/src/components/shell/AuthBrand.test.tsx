/* El fondo de marca de «Entrar» y «Crear cuenta» (UNI-133): el vídeo de la casa
   a pantalla completa, fijo, con una atenuación que garantiza el contraste de
   la ventana que va encima; y la columna de marca (logotipo, lema, frase y
   pasos) que cada página pone a la izquierda de su ventana. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { reducido } = vi.hoisted(() => ({ reducido: { valor: false } }));
vi.mock("../../motion", () => ({ useReducedMotion: () => reducido.valor }));

import { ratio } from "../../styles/contraste";
import { AuthBrand, ColumnaMarca, PASOS_MARCA, REJILLA_MARCA, VIDEO_MARCA } from "./AuthBrand";
import { STEP_LABELS } from "../../pipeline/steps";

afterEach(() => { reducido.valor = false; });

describe("AuthBrand", () => {
  it("reproduce intro.mp4 en bucle, silenciado y con autoplay", () => {
    const { container } = render(<AuthBrand />);
    const video = container.querySelector<HTMLVideoElement>(`video[src="${VIDEO_MARCA}"]`);
    expect(video).not.toBeNull();
    expect(video!.muted || video!.hasAttribute("muted") || video!.defaultMuted).toBe(true);
    expect(video!.loop).toBe(true);
    expect(video!.autoplay).toBe(true);
    expect(video!.getAttribute("playsinline")).not.toBeNull();
    expect(video!.style.objectFit).toBe("cover");
  });

  it("con movimiento reducido se queda en un fotograma fijo, sin bucle", () => {
    reducido.valor = true;
    const { container } = render(<AuthBrand />);
    const video = container.querySelector<HTMLVideoElement>("video")!;
    expect(video.autoplay).toBe(false);
    expect(video.loop).toBe(false);
    expect(video.getAttribute("preload")).toBe("auto");
  });

  it("cubre toda la pantalla, fijo y por debajo de la ventana, sin capturar el ratón", () => {
    const { container } = render(<AuthBrand />);
    const capa = container.querySelector<HTMLElement>(".login-media")!;
    expect(capa.style.position).toBe("fixed");
    expect(capa.style.inset).toMatch(/^0(px)?$/);
    expect(capa.style.zIndex).toBe("0");
    expect(capa.style.pointerEvents).toBe("none");
  });

  it("va con los tokens del tema oscuro en los dos temas: el vídeo siempre es oscuro", () => {
    const { container } = render(<AuthBrand />);
    expect(container.querySelector(".login-media")).toHaveAttribute("data-theme", "dark");
  });

  it("la capa del vídeo no lleva texto: el lema va en la columna de marca", () => {
    const { container } = render(<AuthBrand />);
    expect(container.textContent).toBe("");
    const capas = [...container.querySelectorAll<HTMLElement>(".login-media > div")].map((d) => d.style.background);
    expect(capas.some((b) => b.includes("var(--media-columna)"))).toBe(true);
  });
});

describe("ColumnaMarca", () => {
  it("lleva logotipo, lema, frase y los pasos reales, en blanco y gris sobre el vídeo, sin librerías", () => {
    const { container } = render(<ColumnaMarca />);
    const lema = screen.getByText("Planificación neurovascular con datos");
    expect(lema.style.color).toBe("var(--on-media)");
    expect(screen.getByText("Del DICOM al clip, en un solo espacio de trabajo.").style.color).toBe("var(--on-media-muted)");
    expect(screen.getByText("por SkullApp")).toBeInTheDocument();
    const pasos = screen.getByText(PASOS_MARCA);
    expect(pasos.textContent).toBe(STEP_LABELS.map((p) => p.toUpperCase()).join(" · "));
    expect(pasos.style.fontFamily).toBe("var(--font-mono)");
    expect(container.textContent).not.toMatch(/VTK|SimpleITK|SKULLAPP/);
  });

  it("va con los tokens del tema oscuro en los dos temas, como todo lo que va sobre el vídeo", () => {
    render(<ColumnaMarca />);
    expect(screen.getByRole("region", { name: "Prospective" })).toHaveAttribute("data-theme", "dark");
  });

  it("con alLogo el logotipo es un botón a la página principal; sin él, no", () => {
    const alLogo = vi.fn();
    const { unmount } = render(<ColumnaMarca alLogo={alLogo} />);
    fireEvent.click(screen.getByRole("button", { name: /Prospective/ }));
    expect(alLogo).toHaveBeenCalledTimes(1);
    unmount();
    render(<ColumnaMarca />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pegada se queda fija arriba mientras desplaza un formulario largo", () => {
    render(<ColumnaMarca pegada />);
    const col = screen.getByRole("region", { name: "Prospective" });
    expect(col.style.position).toBe("sticky");
    expect(col.style.top).toBe("120px");
  });

  it("la rejilla junta columna y ventana (440 px) en un ancho máximo", () => {
    expect(REJILLA_MARCA.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 440px)");
    expect(REJILLA_MARCA.maxWidth).toBe(1200);
  });
});

describe("AuthBrand · contraste", () => {

  it("la atenuación deja el texto de la ventana con contraste AA aunque el fotograma sea blanco", () => {
    // Peor caso: fotograma blanco puro, sin el viñeteado (que solo oscurece),
    // bajo la atenuación y el cristal del tema oscuro.
    const css = readFileSync(join(__dirname, "../../styles/tokens/colors.css"), "utf8");
    const oscuro = css.slice(0, css.search(/^\[data-theme="light"\] \{/m));
    const cristal = /--glass:\s*linear-gradient\(rgba\(5, 6, 8, ([\d.]+)\)[^)]*\)\),\s*rgba\(255, 255, 255, ([\d.]+)\)/.exec(oscuro)!;
    const [velo, brillo] = [Number(cristal[1]), Number(cristal[2])];
    const ATENUACION_ALFA = Number(/--media-atenuacion:\s*rgba\(5, 9, 15, ([\d.]+)\)/.exec(oscuro)![1]);
    const { container } = render(<AuthBrand />);
    const capas = [...container.querySelectorAll<HTMLElement>(".login-media > div")].map((d) => d.style.background);
    expect(capas.some((b) => b.includes("var(--media-atenuacion)"))).toBe(true);
    const mezcla = (fondo: number, color: number, alfa: number) => fondo * (1 - alfa) + color * alfa;
    const canal = (c: number) => {
      let v = mezcla(255, c, ATENUACION_ALFA);   // atenuación rgba(5, 9, 15)
      v = mezcla(v, 255, brillo);                  // capa blanca del cristal
      return mezcla(v, 6, velo);                   // velo oscuro del cristal
    };
    const hex = "#" + [5, 9, 15].map((c) => Math.round(canal(c)).toString(16).padStart(2, "0")).join("");
    expect(ratio("#FFFFFF", hex)).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#B8C0CC", hex)).toBeGreaterThanOrEqual(4.5);   // --muted-foreground oscuro
  });
});
