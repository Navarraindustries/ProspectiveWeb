/* Recorrido del panel de pacientes sobre la página REAL de Pacientes: navega
   allí, espera a que la lista cargue, se salta lo que no está (avisos, «Hoy»),
   adapta el texto al rol y a las pestañas, y termina como «saltado» si la
   persona sale de Pacientes a medias, sin dejar el velo puesto. */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientSummary } from "../api/types";

const listPatients = vi.fn();
const listClipOrders = vi.fn();
const captureObjectUrl = vi.fn();
const studyThumbnailObjectUrl = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    listPatients: () => listPatients(),
    listClipOrders: (o: unknown) => listClipOrders(o),
    patientsActivity: () => Promise.resolve([]),
    listPending: () => Promise.resolve([]),
    listUsers: () => Promise.resolve([]),
    captureObjectUrl: (id: number) => captureObjectUrl(id),
    studyThumbnailObjectUrl: (id: number) => studyThumbnailObjectUrl(id),
  },
}));
vi.mock("../components/shell/AppShell", async () => ({ AppShell: (await import("../test/shellMock")).ShellMock }));
vi.mock("../pages/NuevoCaso", () => ({ CasePatientPicker: () => null, NuevoEstudioSheet: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
let movil = false;
vi.mock("../hooks/useEstrecho", async (orig) => ({
  ...(await orig<typeof import("../hooks/useEstrecho")>()),
  useMovil: () => movil,
}));
const user = { id: 1, role: "medico" as string, full_name: "Ana Pérez" };
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

let momento: string | null = "pacientes";
const terminar = vi.fn(async () => { momento = null; });
const ir = vi.fn((m: string) => { momento = m; });
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ activo: momento !== null, momento, ir, terminar, estado: { estado: "pendiente", pistas_vistas: [], pistas_activas: true, tarjeta_cerrada: false } }),
}));

import { Patients } from "../pages/Patients";
import { LINEA_ADMIN, LINEA_PESTANAS, RecorridoPacientes } from "./RecorridoPacientes";
import { LIMITES, PARADAS_PACIENTES, PARADAS_PACIENTES_MOVIL } from "./copy";

const onFin = vi.fn();
const noop = () => {};

/** jsdom no tiene maquetación: todo lo marcado con data-tour «se ve». */
const RECT = { x: 40, y: 40, left: 40, top: 40, width: 120, height: 40, right: 160, bottom: 80, toJSON() {} } as DOMRect;
const CERO = { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON() {} } as DOMRect;

function Pagina() {
  const { pathname } = useLocation();
  return pathname === "/app/pacientes" ? <Patients onResume={noop} onPlanCase={noop} onStartWithoutPatient={noop} /> : <p>otra pantalla</p>;
}
function IrAEstudios() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/app/estudios")}>ir a estudios</button>;
}
const arbol = () => (
  <MemoryRouter initialEntries={["/app/estudios"]}>
    <Pagina />
    <IrAEstudios />
    <RecorridoPacientes onFin={onFin} />
  </MemoryRouter>
);
const montar = () => render(arbol());

const fila = (o: Partial<PatientSummary> & { id: number; full_name: string }): PatientSummary => ({
  hospital_id: `HC-${o.id}`, sex: "F", dob: "", institution: "", study_count: 0,
  created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
  last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "", last_risk_label: null,
  last_capture_id: null, last_imaging_study_id: null,
  ...o,
});

const burbuja = () => screen.getByRole("dialog");
const siguiente = () => fireEvent.click(within(burbuja()).getByRole("button", { name: /Siguiente|Terminar/ }));
/** Avanza hasta la parada con ese título. */
function hasta(titulo: string) {
  for (let i = 0; i < 9 && burbuja().getAttribute("aria-label") !== titulo; i++) siguiente();
  expect(burbuja()).toHaveAttribute("aria-label", titulo);
}

beforeEach(() => {
  vi.clearAllMocks();
  momento = "pacientes";
  movil = false;
  user.role = "medico";
  listPatients.mockResolvedValue([]);
  listClipOrders.mockResolvedValue([]);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-tour") ? RECT : CERO;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("RecorridoPacientes", () => {
  it("navega a Pacientes y arranca cuando la lista ha cargado", async () => {
    montar();
    expect(await screen.findByText("Parada 1 de 8: Tus secciones")).toBeInTheDocument();
    expect(screen.queryByText("otra pantalla")).toBeNull();
  });

  it("con la lista vacía pinta la tarjeta de ejemplo (sin pedir nada) y la quita al terminar", async () => {
    const { rerender } = montar();
    await screen.findByText("Parada 1 de 8: Tus secciones");
    const ejemplo = document.querySelector('[data-tour="tarjeta-ejemplo"]');
    expect(ejemplo).not.toBeNull();
    expect(ejemplo).toHaveTextContent("Ejemplo");
    expect(document.querySelector('[data-tour="tarjetas"]')).toContainElement(ejemplo as HTMLElement);
    hasta("La tarjeta del paciente");
    expect(document.querySelector('[data-foco="hueco"]')).not.toBeNull();
    hasta("Atajos y tu menú");
    siguiente();
    expect(onFin).toHaveBeenCalledTimes(1);
    expect(terminar).not.toHaveBeenCalled();
    momento = "listo";
    rerender(arbol());
    expect(document.querySelector('[data-tour="tarjeta-ejemplo"]')).toBeNull();
    expect(document.querySelector("[data-foco]")).toBeNull();
    expect(screen.getByText(/Crea el primero para comenzar/)).toBeInTheDocument();
    expect(listPatients).toHaveBeenCalledTimes(1);
    expect(captureObjectUrl).not.toHaveBeenCalled();
    expect(studyThumbnailObjectUrl).not.toHaveBeenCalled();
  });

  it("fuera del recorrido, la lista vacía no lleva tarjeta de ejemplo", async () => {
    momento = null;
    render(<MemoryRouter initialEntries={["/app/pacientes"]}><Pagina /></MemoryRouter>);
    expect(await screen.findByText(/Crea el primero para comenzar/)).toBeInTheDocument();
    expect(document.querySelector('[data-tour="tarjeta-ejemplo"]')).toBeNull();
  });

  it("con pacientes, la tarjeta es la primera de verdad y no hay ejemplo", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno, A" }), fila({ id: 2, full_name: "Dos, B" })]);
    montar();
    await screen.findByText(/^Parada 1 de/);
    expect(document.querySelector('[data-tour="tarjeta-ejemplo"]')).toBeNull();
    expect(document.querySelectorAll('[data-tour="tarjeta-0"]')).toHaveLength(1);
  });

  it("sin avisos la parada se salta (8 en el contador); con avisos son 9", async () => {
    const primero = montar();
    await screen.findByText("Parada 1 de 8: Tus secciones");
    primero.unmount();
    listClipOrders.mockResolvedValue([{ id: 5, part_no: "NV-01", status: "firmado", updated_at: 0 }]);
    montar();
    expect(await screen.findByText("Parada 1 de 9: Tus secciones")).toBeInTheDocument();
    hasta("Avisos clínicos");
  });

  it("un médico no oye hablar de Administración; un administrador sí", async () => {
    const medico = montar();
    await screen.findByText(/^Parada 1 de/);
    expect(burbuja()).not.toHaveTextContent("Administración");
    medico.unmount();
    user.role = "admin";
    montar();
    await screen.findByText(/^Parada 1 de/);
    expect(burbuja()).toHaveTextContent("Administración");
  });

  it("las frases añadidas caben en el tope de «Cómo»", () => {
    expect((PARADAS_PACIENTES.secciones.como + LINEA_ADMIN).length).toBeLessThanOrEqual(LIMITES.como);
    expect((PARADAS_PACIENTES.buscar.como + LINEA_PESTANAS).length).toBeLessThanOrEqual(LIMITES.como);
  });

  it("las pestañas solo se mencionan si se ven", async () => {
    const sin = montar();
    await screen.findByText(/^Parada 1 de/);
    hasta("Encuentra a cualquiera");
    expect(burbuja()).not.toHaveTextContent(/pestañas/i);
    sin.unmount();
    listPatients.mockResolvedValue([fila({ id: 3, full_name: "Tres, C", is_shared_with_me: true, owner_id: 9 })]);
    montar();
    await screen.findByText(/^Parada 1 de/);
    hasta("Encuentra a cualquiera");
    expect(burbuja()).toHaveTextContent(/pestañas/i);
  });

  it("la ficha lleva el mini esquema Paciente › … › Vista previa", async () => {
    montar();
    await screen.findByText(/^Parada 1 de/);
    hasta("La ficha del paciente");
    const esquema = within(burbuja()).getByRole("list", { name: /ficha/i });
    expect(within(esquema).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual(["Paciente", "Casos", "Estudios de imagen", "Sesiones guardadas", "Vista previa"]);
  });

  it("salir de Pacientes a medias termina como «saltado» y quita el velo", async () => {
    montar();
    await screen.findByText(/^Parada 1 de/);
    siguiente();
    expect(document.querySelector("[data-foco]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ir a estudios" }));
    await waitFor(() => expect(terminar).toHaveBeenCalledTimes(1));
    expect(terminar).toHaveBeenCalledWith("saltado");
    expect(document.querySelector("[data-foco]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onFin).not.toHaveBeenCalled();
  });

  it("tocar lo resaltado (la tarjeta real) no abre la ficha ni corta el recorrido", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno, A" })]);
    montar();
    await screen.findByText(/^Parada 1 de/);
    hasta("La ficha del paciente");
    const hueco = document.querySelector<HTMLElement>("[data-foco-hueco]")!;
    expect(hueco.style.pointerEvents).toBe("auto");
    fireEvent.pointerDown(hueco);
    fireEvent.mouseDown(hueco);
    fireEvent.click(hueco);
    expect(burbuja()).toHaveAttribute("aria-label", "La ficha del paciente");
    expect(screen.queryByText("otra pantalla")).toBeNull();
    expect(terminar).not.toHaveBeenCalled();
    expect(onFin).not.toHaveBeenCalled();
    siguiente();
    expect(burbuja()).not.toHaveAttribute("aria-label", "La ficha del paciente");
  });

  it("la parada de la ficha no pide tocar nada durante el recorrido", () => {
    expect(PARADAS_PACIENTES.ficha.como).not.toMatch(/^Toca/);
    expect(PARADAS_PACIENTES.ficha.como).toMatch(/Al acabar el recorrido/);
  });

  it("«Saltar recorrido» salta todo el onboarding una sola vez", async () => {
    montar();
    await screen.findByText(/^Parada 1 de/);
    fireEvent.click(within(burbuja()).getByRole("button", { name: "Saltar recorrido" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(terminar).toHaveBeenCalledTimes(1);
    expect(terminar).toHaveBeenCalledWith("saltado");
    expect(document.querySelector("[data-foco]")).toBeNull();
  });

  describe("en el móvil", () => {
    /** Lo que pinta la barra superior en el móvil: «+», «⋯» y el avatar, en fila. */
    const X: Record<string, number> = { "acciones-crear": 200, "acciones-mas": 250, usuario: 300 };
    function BarraMovil() {
      return <>{Object.keys(X).map((t) => <span key={t} data-tour={t}>{t}</span>)}</>;
    }
    const hueco = () => document.querySelector<HTMLElement>("[data-foco-hueco]")!;

    beforeEach(() => {
      movil = true;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const t = this.getAttribute("data-tour");
        if (t && t in X) return { ...RECT, x: X[t], left: X[t], width: 44, right: X[t] + 44 } as DOMRect;
        return t ? RECT : CERO;
      });
    });

    it("«crear» resalta juntos el «+» y el «⋯», y lo cuenta con el «+»", async () => {
      render(<>{arbol()}<BarraMovil /></>);
      await screen.findByText(/^Parada 1 de/);
      expect(burbuja()).toHaveTextContent("Abre «☰»");
      expect(burbuja()).not.toHaveTextContent("Alt+B");
      hasta("Todo empieza con un paciente");
      expect(burbuja()).toHaveTextContent("«+» (Nuevo paciente)");
      // Del «+» (200) al final del «⋯» (294), con el margen del foco (6 px).
      expect(hueco().style.left).toBe("194px");
      expect(hueco().style.width).toBe(`${294 - 200 + 12}px`);
    });

    it("«atajos» no habla de Ctrl+K: resalta el «⋯» y el avatar", async () => {
      render(<>{arbol()}<BarraMovil /></>);
      await screen.findByText(/^Parada 1 de/);
      hasta("Atajos y tu menú");
      expect(burbuja()).toHaveTextContent(PARADAS_PACIENTES_MOVIL.atajos!.como);
      expect(burbuja()).not.toHaveTextContent(/Ctrl\+K|⌘K/);
      expect(hueco().style.left).toBe("244px");
      expect(hueco().style.width).toBe(`${344 - 250 + 12}px`);
    });

    it("sin el «⋯» (escritorio) siguen los textos de siempre", async () => {
      movil = false;
      montar();
      await screen.findByText(/^Parada 1 de/);
      hasta("Atajos y tu menú");
      expect(burbuja()).toHaveTextContent("Ctrl+K");
    });

    it("las variantes del móvil caben en sus topes (con la línea de admin)", () => {
      for (const e of Object.values(PARADAS_PACIENTES_MOVIL)) expect(e!.como.length).toBeLessThanOrEqual(LIMITES.como);
      expect((PARADAS_PACIENTES_MOVIL.secciones!.como + LINEA_ADMIN).length).toBeLessThanOrEqual(LIMITES.como);
    });
  });
});
