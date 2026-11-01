/* TablaTarjetas: tabla de cristal en ≥ 641 px y lista de tarjetas en ≤ 640 px,
   con filas pulsables (un <button> real en la celda que identifica la fila, y
   clic de ratón en toda ella) y un detalle desplegable. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { simularPantalla } from "../test/pantalla";
import { TablaTarjetas, type ColumnaTabla } from "./TablaTarjetas";

afterEach(() => vi.unstubAllGlobals());

type F = { id: number; nombre: string; rol: string };
const cols: ColumnaTabla<F>[] = [
  { id: "n", titulo: "Usuario", celda: (f) => f.nombre, enTarjeta: "titulo" },
  { id: "r", titulo: "Rol", celda: (f) => f.rol },
  { id: "x", titulo: "Interno", celda: () => "id-x", enTarjeta: "oculta" },
  { id: "a", titulo: "Acciones", celda: (f) => <button type="button">Editar {f.nombre}</button>, enTarjeta: "pie", sinPartir: true },
];
const filas: F[] = [{ id: 1, nombre: "Ana Prueba", rol: "Médico" }, { id: 2, nombre: "Luis Prueba", rol: "Observador" }];

/** Elementos alcanzables con Tab dentro de `raiz`, en orden de documento. */
const tabulables = (raiz: Element) =>
  [...raiz.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")]
    .filter((e) => !e.hasAttribute("disabled") && e.tabIndex >= 0);

it("≥ 641: tabla de cristal con cabeceras y sin scroll horizontal", () => {
  simularPantalla(1280);
  const { container } = render(<TablaTarjetas rotulo="Usuarios" filas={filas} columnas={cols} clave={(f) => f.id} />);
  expect(container.firstElementChild).toHaveAttribute("data-vista", "tabla");
  expect(container.firstElementChild).toHaveAttribute("data-glass");
  expect(screen.getByRole("table", { name: "Usuarios" })).toBeInTheDocument();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Usuario", "Rol", "Interno", "Acciones"]);
  expect(screen.getAllByRole("columnheader").every((h) => h.getAttribute("scope") === "col")).toBe(true);
  // La celda que identifica la fila es su cabecera de fila.
  expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Ana Prueba", "Luis Prueba"]);
  expect(container.innerHTML).not.toMatch(/overflow-x/);
});

it("641 px ya es tabla", () => {
  simularPantalla(641);
  const { container } = render(<TablaTarjetas rotulo="Usuarios" filas={filas} columnas={cols} clave={(f) => f.id} />);
  expect(container.firstElementChild).toHaveAttribute("data-vista", "tabla");
});

it("≤ 640: tarjetas con título, datos rotulados, pie y sin la columna oculta", () => {
  simularPantalla(390);
  const { container } = render(<TablaTarjetas rotulo="Usuarios" filas={filas} columnas={cols} clave={(f) => f.id} />);
  expect(container.firstElementChild).toHaveAttribute("data-vista", "tarjetas");
  expect(screen.queryByRole("table")).toBeNull();
  const items = within(screen.getByRole("list", { name: "Usuarios" })).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0].querySelector(".tt-tarjeta-titulo")!.textContent).toBe("Ana Prueba");
  expect(within(items[0]).getByText("Rol")).toBeInTheDocument(); // <dt>
  expect(within(items[0]).getByText("Rol").tagName).toBe("DT");
  expect(within(items[0]).getByText("Médico").tagName).toBe("DD");
  expect(within(items[0]).queryByText("id-x")).toBeNull();
  expect(within(items[0]).queryByText("Usuario")).toBeNull(); // el título no se rotula
  expect(items[0].querySelector(".tt-tarjeta-pie button")).not.toBeNull();
  expect(items[0]).toHaveAttribute("data-glass");
});

it("fila pulsable: el control es un botón en la cabecera de fila; el clic en la fila la abre y un botón de dentro no", () => {
  simularPantalla(1280);
  const onFila = vi.fn();
  render(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} onFila={onFila} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar Ana Prueba" }));
  expect(onFila).not.toHaveBeenCalled();

  const fila = screen.getByText("Luis Prueba").closest("tr")!;
  expect(fila).not.toHaveAttribute("tabindex");
  expect(fila).not.toHaveAttribute("role");
  expect(fila).toHaveAttribute("data-pulsable");

  // Botón nativo (Intro y Espacio lo activan) en la cabecera de fila, primero en el orden de Tab.
  const boton = within(fila).getByRole("button", { name: "Luis Prueba" });
  expect(boton.tagName).toBe("BUTTON");
  expect(boton).toHaveAttribute("type", "button");
  expect(boton.closest("th")).toHaveAttribute("scope", "row");
  expect(tabulables(fila)[0]).toBe(boton);
  boton.focus();
  expect(boton).toHaveFocus();
  fireEvent.click(boton); // lo que dispara el navegador al pulsar Intro o Espacio sobre él
  expect(onFila).toHaveBeenCalledTimes(1);
  expect(onFila).toHaveBeenCalledWith(filas[1]);
  // Sin detalle, el botón no se anuncia como plegable.
  expect(boton).not.toHaveAttribute("aria-expanded");

  // Clic de ratón en otra celda de la fila.
  fireEvent.click(screen.getByText("Médico"));
  expect(onFila).toHaveBeenLastCalledWith(filas[0]);
  expect(onFila).toHaveBeenCalledTimes(2);
  // El teclado sobre la fila no hace nada: va por el botón.
  fireEvent.keyDown(fila, { key: "Enter" });
  expect(onFila).toHaveBeenCalledTimes(2);

  // Chevron final, fuera del árbol accesible.
  const ultima = fila.lastElementChild!;
  expect(ultima).toHaveAttribute("aria-hidden", "true");
  expect(ultima.querySelector("svg")).not.toBeNull();
});

it("sin onFila las filas no son pulsables", () => {
  simularPantalla(1280);
  render(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} />);
  const fila = screen.getByText("Luis Prueba").closest("tr")!;
  expect(fila).not.toHaveAttribute("tabindex");
  expect(fila).not.toHaveAttribute("data-pulsable");
  expect(within(fila).queryByRole("button", { name: "Luis Prueba" })).toBeNull();
  expect(fila.children).toHaveLength(4);
});

it("tarjeta pulsable: el título es el botón; el clic en la tarjeta la abre y el botón del pie no", () => {
  simularPantalla(390);
  const onFila = vi.fn();
  render(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} onFila={onFila} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar Ana Prueba" }));
  expect(onFila).not.toHaveBeenCalled();
  const tarjeta = screen.getByText("Ana Prueba").closest("li")!;
  expect(tarjeta).not.toHaveAttribute("tabindex");
  expect(tarjeta).toHaveAttribute("data-pulsable");
  const boton = within(tarjeta).getByRole("button", { name: "Ana Prueba" });
  expect(boton.closest(".tt-tarjeta-titulo")).not.toBeNull();
  expect(tabulables(tarjeta)[0]).toBe(boton);
  fireEvent.click(boton);
  expect(onFila).toHaveBeenCalledWith(filas[0]);
  expect(onFila).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getAllByText("Médico")[0]);
  expect(onFila).toHaveBeenCalledTimes(2);
});

it("tarjeta pulsable sin columna de título: la que identifica la fila hace de título", () => {
  simularPantalla(390);
  const sinTitulo = cols.map((c) => (c.id === "n" ? { ...c, enTarjeta: undefined } : c));
  render(<TablaTarjetas rotulo="U" filas={filas} columnas={sinTitulo} clave={(f) => f.id} onFila={() => {}} />);
  const tarjeta = screen.getByText("Ana Prueba").closest("li")!;
  expect(within(tarjeta).getByRole("button", { name: "Ana Prueba" }).closest(".tt-tarjeta-titulo")).not.toBeNull();
  expect(within(tarjeta).queryByText("Usuario")).toBeNull();
});

it("un texto larguísimo corta por palabra y no ensancha la celda", () => {
  simularPantalla(1280);
  render(<TablaTarjetas rotulo="U" filas={[{ id: 3, nombre: "x".repeat(80), rol: "Médico" }]} columnas={cols} clave={(f) => f.id} />);
  expect(screen.getByText("x".repeat(80)).closest("td, th")).toHaveStyle({ overflowWrap: "anywhere" });
  expect(screen.getAllByRole("cell").find((c) => c.textContent?.startsWith("Editar"))).toHaveStyle({ whiteSpace: "nowrap" });
});

it("seleccionada, detalle y vacío", () => {
  simularPantalla(1280);
  const onFila = vi.fn();
  const { container, rerender } = render(
    <TablaTarjetas
      rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} onFila={onFila}
      seleccionada={(f) => f.id === 2}
      detalle={(f) => (f.id === 1 ? <p>Hash</p> : null)}
    />,
  );
  expect(screen.getByText("Luis Prueba").closest("tr")).toHaveAttribute("data-seleccionada", "true");
  expect(screen.getByText("Ana Prueba").closest("tr")).not.toHaveAttribute("data-seleccionada");
  const det = container.querySelector("tr.fila-detalle")!;
  expect(det).not.toBeNull();
  expect(container.querySelectorAll("tr.fila-detalle")).toHaveLength(1);
  expect(det.querySelector("td")!.colSpan).toBe(5);
  expect(within(det as HTMLElement).getByText("Hash")).toBeInTheDocument();
  expect(det).not.toHaveAttribute("data-pulsable");
  // El botón de la fila lo anuncia; la fila no.
  const ana = screen.getByRole("button", { name: "Ana Prueba" });
  expect(ana).toHaveAttribute("aria-expanded", "true");
  expect(ana.getAttribute("aria-controls")).toBe(det.id);
  expect(ana.closest("tr")).not.toHaveAttribute("aria-expanded");
  const luis = screen.getByRole("button", { name: "Luis Prueba" });
  expect(luis).toHaveAttribute("aria-expanded", "false");
  expect(luis).not.toHaveAttribute("aria-controls");
  // Sin onFila no suma la columna del chevron.
  rerender(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} detalle={(f) => (f.id === 1 ? <p>Hash</p> : null)} />);
  expect(container.querySelector<HTMLTableCellElement>("tr.fila-detalle td")!.colSpan).toBe(4);
  // Vacío: sustituye al cuerpo y no hay tabla.
  rerender(<TablaTarjetas rotulo="U" filas={[]} columnas={cols} clave={(f) => f.id} vacio={<p>Nada</p>} />);
  expect(screen.getByText("Nada")).toBeInTheDocument();
  expect(container.querySelector("table")).toBeNull();
});

it("tarjetas: detalle dentro de la tarjeta, anunciado por el botón del título, y seleccionada marcada", () => {
  simularPantalla(390);
  render(
    <TablaTarjetas
      rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} onFila={() => {}}
      seleccionada={(f) => f.id === 2}
      detalle={(f) => (f.id === 1 ? <p>Hash</p> : null)}
    />,
  );
  const [ana, luis] = within(screen.getByRole("list", { name: "U" })).getAllByRole("listitem");
  const hash = within(ana).getByText("Hash");
  const boton = within(ana).getByRole("button", { name: "Ana Prueba" });
  expect(boton).toHaveAttribute("aria-expanded", "true");
  expect(document.getElementById(boton.getAttribute("aria-controls")!)).toContainElement(hash);
  expect(ana).not.toHaveAttribute("aria-expanded");
  expect(luis).toHaveAttribute("data-seleccionada", "true");
  expect(within(luis).queryByText("Hash")).toBeNull();
  expect(within(luis).getByRole("button", { name: "Luis Prueba" })).toHaveAttribute("aria-expanded", "false");
});

it("cambia de tabla a tarjetas en vivo", () => {
  const ctl = simularPantalla(1280);
  const { container } = render(<TablaTarjetas rotulo="U" filas={filas} columnas={cols} clave={(f) => f.id} />);
  act(() => ctl.cambiar({ ancho: 390 }));
  expect(container.firstElementChild).toHaveAttribute("data-vista", "tarjetas");
});

it("CSS: hoja a dos columnas hasta 640, fila pulsable con hover de cristal y tarjeta con hover de ratón", () => {
  const css = readFileSync(join(__dirname, "../styles/office.css"), "utf8").replace(/\r\n/g, "\n");
  expect(css).toMatch(/@media\s*\(\s*max-width:\s*640px\s*\)\s*\{\s*\.hoja-dos-columnas\s*\{\s*grid-template-columns:\s*1fr;/);
  expect(css).not.toMatch(/760px/);
  expect(css).toMatch(/\.tabla-oficina tbody tr\[data-pulsable\]:hover[^{]*\{[^}]*var\(--glass-hover\)/);
  expect(css).toMatch(/@media\s*\(\s*hover:\s*hover\s*\)\s*\{\s*\.tt-tarjeta\[data-pulsable\]:hover\s*\{[^}]*var\(--primary\)/);
  expect(css).toMatch(/\.tt-fila-boton\s*\{[^}]*background:\s*none/);
});
