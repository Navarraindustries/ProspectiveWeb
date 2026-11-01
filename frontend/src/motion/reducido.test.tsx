/* Movimiento reducido (§4.7): solo opacidad. Las superficies que antes saltaban
   con duración 0 ahora se funden, y ninguna aplica transformaciones de escala. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STEPS } from "../pipeline/steps";

const reducida = vi.hoisted(() => ({ valor: true }));
vi.mock("./index", async (orig) => ({
  ...(await orig<typeof import("./index")>()),
  useReducedMotion: () => reducida.valor,
}));

vi.mock("../api/client", () => ({ api: { listPatients: () => Promise.resolve([]) } }));
vi.mock("../store/auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "medico", institution: "" } }),
}));

import { CommandPalette } from "../components/CommandPalette";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Entorno } from "../components/Entorno";
import { Sheet } from "../components/Sheet";
import { StepDock } from "../components/stepper/StepDock";
import { ThemeProvider } from "../store/theme";

const sinEscala = (el: HTMLElement) => {
  expect(el.style.transform).not.toMatch(/scale|translate/);
  expect(el.style.opacity).toBe("0"); // arranca invisible y se funde
};

beforeEach(() => { reducida.valor = true; });
afterEach(() => vi.restoreAllMocks());

describe("movimiento reducido", () => {
  it("Sheet: panel y velo se funden, sin deslizar", () => {
    render(<Sheet open onClose={() => {}} title="Ficha"><p>x</p></Sheet>);
    const panel = screen.getByRole("dialog");
    sinEscala(panel);
    sinEscala(panel.previousElementSibling as HTMLElement);
  });

  it("Sheet: sin movimiento reducido sigue deslizando desde el borde", () => {
    reducida.valor = false;
    render(<Sheet open onClose={() => {}} title="Ficha"><p>x</p></Sheet>);
    expect(screen.getByRole("dialog").style.transform).toMatch(/translateX\(100%\)/);
  });

  it("ConfirmDialog: panel y velo se funden, sin escala", () => {
    render(<ConfirmDialog open title="Salir" confirmLabel="Salir" onCancel={() => {}} onConfirm={() => {}}>¿Salir?</ConfirmDialog>);
    const panel = screen.getByRole("alertdialog");
    sinEscala(panel);
    sinEscala(panel.parentElement as HTMLElement);
  });

  it("ConfirmDialog: sin movimiento reducido el panel entra escalado", () => {
    reducida.valor = false;
    render(<ConfirmDialog open title="Salir" confirmLabel="Salir" onCancel={() => {}} onConfirm={() => {}}>¿Salir?</ConfirmDialog>);
    expect(screen.getByRole("alertdialog").style.transform).toMatch(/scale/);
  });

  it("CommandPalette: se funde sin escala", async () => {
    render(<><input aria-label="Campo previo" /><CommandPalette onOpenPatient={() => {}} onResume={() => {}} /></>);
    fireEvent.keyDown(screen.getByLabelText("Campo previo"), { key: "k", ctrlKey: true });
    // Se está fundiendo (la opacidad va por el camino); lo que importa es que no hay transformación.
    const d = await screen.findByRole("dialog", { name: "Paleta de mandos" });
    expect(d.style.transform).not.toMatch(/scale|translate/);
  });

  it("CommandPalette: sin movimiento reducido entra escalada", async () => {
    reducida.valor = false;
    render(<><input aria-label="Campo previo" /><CommandPalette onOpenPatient={() => {}} onResume={() => {}} /></>);
    fireEvent.keyDown(screen.getByLabelText("Campo previo"), { key: "k", ctrlKey: true });
    // Control de la prueba anterior: con «glide» el panel arranca con escala (0,96) y desplazamiento.
    const d = await screen.findByRole("dialog", { name: "Paleta de mandos" });
    expect(d.style.transform).toMatch(/scale/);
  });

  it("StepDock: el puntero no escala ningún paso", () => {
    render(<StepDock steps={STEPS} activeIndex={0} missingFor={() => null} onGo={() => {}} />);
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Flujo de planificación" }), { clientX: 10 });
    for (const b of screen.getAllByRole("button", { name: /Paso \d/ })) {
      expect(b).toHaveAttribute("data-escala", "1");
      expect(b.style.transform).not.toMatch(/scale/);
    }
  });
});

describe("transparencia reducida en vivo", () => {
  it("Entorno quita y devuelve la imagen cuando cambia la preferencia, sin remontar", () => {
    let activa = false;
    const oyentes = new Set<() => void>();
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({
      get matches() { return q.includes("reduced-transparency") ? activa : false; },
      media: q,
      addEventListener: (_: string, f: () => void) => oyentes.add(f),
      removeEventListener: (_: string, f: () => void) => oyentes.delete(f),
    }) as unknown as MediaQueryList);
    localStorage.setItem("prospective.theme", "dark");

    const { container } = render(<ThemeProvider><Entorno><p>x</p></Entorno></ThemeProvider>);
    expect(container.querySelector("img")).not.toBeNull();

    activa = true;
    act(() => oyentes.forEach((f) => f()));
    expect(container.querySelector("img")).toBeNull();

    activa = false;
    act(() => oyentes.forEach((f) => f()));
    expect(container.querySelector("img")).not.toBeNull();
  });
});
