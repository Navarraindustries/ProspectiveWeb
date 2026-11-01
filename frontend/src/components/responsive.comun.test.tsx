/* Fase 12 · T2: componentes comunes por tramo de pantalla (R9, R10, R11, R22, R23, R24, R27, R30). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { simularPantalla } from "../test/pantalla";
import { STEPS } from "../pipeline/steps";
import { Badge } from "./Badge";
import { FileField } from "./FileField";
import { Input } from "./Input";
import { Collapsible } from "./PanelHead";
import { Tabs } from "./Tabs";
import { TablaTarjetas, type ColumnaTabla } from "./TablaTarjetas";
import { Icon } from "./Icon";

afterEach(() => vi.unstubAllGlobals());

const leer = (ruta: string) => readFileSync(join(__dirname, ruta), "utf8").replace(/\r\n/g, "\n");

it("R9 Tabs: 44 px de alto en táctil y barra a todo el ancho con pestañas que se reparten en móvil", () => {
  simularPantalla(768);
  const { unmount } = render(<Tabs tabs={["A", "B", "C"]} value="A" onChange={() => {}} />);
  expect(screen.getByRole("tab", { name: "A" }).style.minHeight).toBe("var(--control-md)");
  expect(screen.getByRole("tablist").style.width).toBe("fit-content");
  unmount();
  simularPantalla(360);
  render(<Tabs tabs={["A", "B", "C"]} value="A" onChange={() => {}} />);
  expect(screen.getByRole("tab", { name: "B" }).style.minHeight).toBe("var(--control-md)");
  expect(screen.getByRole("tab", { name: "B" }).style.flex).toContain("1");
  expect(screen.getByRole("tablist").style.width).toBe("100%");
});

it("R9 Tabs: sin mínimo táctil en ancho", () => {
  simularPantalla(1440);
  render(<Tabs tabs={["A", "B"]} value="A" onChange={() => {}} />);
  expect(screen.getByRole("tab", { name: "A" }).style.minHeight).toBe("");
});

it("R9 Cuentas pendientes: la barra y la recarga pueden partirse en filas", () => {
  const src = leer("../pages/PendingRequests.tsx");
  expect(src).toMatch(/flexWrap:\s*"wrap"[^>]*>\s*<Tabs/);
  expect(src).toMatch(/marginLeft:\s*"auto"/);
});

type F = { id: number; nombre: string };
const cols: ColumnaTabla<F>[] = [{ id: "n", titulo: "Nombre", celda: (f) => f.nombre, enTarjeta: "titulo" }];

it("R10 TablaTarjetas: el botón se estira sobre la tarjeta y el detalle queda por encima; un clic en el detalle no pliega", () => {
  simularPantalla(360);
  const alFila = vi.fn();
  render(
    <TablaTarjetas rotulo="T" filas={[{ id: 1, nombre: "Ana" }]} columnas={cols} clave={(f) => f.id} onFila={alFila}
      detalle={() => <span>Detalle largo</span>} />,
  );
  const css = leer("../styles/office.css");
  expect(css).toMatch(/\.tt-tarjeta\[data-pulsable\]\s*\{[^}]*position:\s*relative/);
  expect(css).toMatch(/\.tt-fila-boton::after\s*\{[^}]*position:\s*absolute;\s*inset:\s*0/);
  expect(css).toMatch(/\.tt-tarjeta-detalle[^{]*\{[^}]*position:\s*relative;\s*z-index:\s*1/);
  fireEvent.click(screen.getByText("Detalle largo"));
  expect(alFila).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Ana" }));
  expect(alFila).toHaveBeenCalledTimes(1);
});

it("R11 Badge: 12 px en ancho y 13 px en táctil", () => {
  simularPantalla(1440);
  const { unmount } = render(<Badge>Alto</Badge>);
  expect(screen.getByText("Alto").style.fontSize).toBe("12px");
  unmount();
  simularPantalla(768);
  render(<Badge>Alto</Badge>);
  expect(screen.getByText("Alto").style.fontSize).toBe("13px");
});

it("R22 Input: tocar el contorno o el icono enfoca el campo", () => {
  render(<Input label="Buscar" icon={<span data-testid="lupa">o</span>} />);
  const campo = screen.getByLabelText("Buscar");
  expect(document.activeElement).not.toBe(campo);
  fireEvent.mouseDown(screen.getByTestId("lupa"));
  expect(document.activeElement).toBe(campo);
  act(() => (campo as HTMLInputElement).blur());
  fireEvent.mouseDown(campo.parentElement as HTMLElement);
  expect(document.activeElement).toBe(campo);
});

it("R23 FileField y plegable: 44 px en táctil", () => {
  simularPantalla(430);
  render(
    <>
      <FileField label="Foto" accept="image/*" file={null} onPick={() => {}} />
      <Collapsible title="Más datos (opcional)" storageKey="t2-r23">x</Collapsible>
    </>,
  );
  expect(screen.getByRole("button", { name: /Seleccionar archivo/ }).style.minHeight).toBe("var(--control-md)");
  expect(screen.getByRole("button", { name: /Más datos/ }).style.minHeight).toBe("var(--control-md)");
});

it("R24 hojas: ritmo vertical uniforme y ayuda del rol bajo «Rol»", () => {
  expect(leer("../styles/office.css")).toMatch(/\.hoja-dos-columnas\s*\{[^}]*gap:\s*14px 24px/);
  const src = leer("../pages/UsersAdmin.tsx");
  expect(src).not.toMatch(/rowGap:\s*12/);
  // En Editar usuario la ayuda va en el mismo bloque que «Rol», antes de «Especialidad».
  const edit = src.slice(src.indexOf("function EditUserSheet"), src.indexOf("function NewUserSheet"));
  expect(edit.indexOf('label="Rol"')).toBeLessThan(edit.indexOf("<RolePermite"));
  expect(edit.indexOf("<RolePermite")).toBeLessThan(edit.indexOf('label="Especialidad"'));
});

it("R27 --content-max sube a 1600 px a partir de 1920 con un token", () => {
  expect(leer("../styles/tokens/spacing.css")).toMatch(/--content-max-grande:\s*1600px/);
  expect(leer("../styles/tokens/breakpoints.css")).toMatch(/@media\s*\(\s*min-width:\s*1920px\s*\)\s*\{\s*:root\s*\{\s*--content-max:\s*var\(--content-max-grande\)/);
});

it("R30 STEP_PATIENT ya no existe: el paso de carga usa UPLOAD", () => {
  expect(STEPS[0].icon).toBe("UPLOAD");
  expect(leer("./Icon.tsx")).not.toContain("STEP_PATIENT");
  const { container } = render(<Icon name={STEPS[0].icon} size={20} />);
  expect(container.querySelector("path")?.getAttribute("d")).toMatch(/M8 11V2\.5/);
});
