/* La columna Sesiones guardadas: las de un estudio de imagen (o las del caso
   sin estudio archivado), con renombrar en línea y borrar. Viene de la ficha
   antigua (PatientSheet.test: «sesiones guardadas», «derechos sobre los
   guardados», «restos de F2-30») y de Patients.test («las sesiones guardadas
   (F1-243)»: hora local). */

import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const renameSavedSession = vi.fn();
const deleteSavedSession = vi.fn();

vi.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  }
  return {
    ApiError,
    api: {
      renameSavedSession: (sid: string, label: string) => renameSavedSession(sid, label),
      deleteSavedSession: (sid: string) => deleteSavedSession(sid),
    },
  };
});

import { ApiError } from "../../api/client";
import { ColumnaSesiones } from "./ColumnaSesiones";
import { fechaHora } from "../../lib/fecha";
import type { PatientSessionInfo } from "../../api/types";

const guardada = (o: Partial<PatientSessionInfo> & { session_id: string }): PatientSessionInfo => ({
  label: "", current_step: 2, max_diameter_mm: null, rupture_risk_label: null,
  created_at: "2026-10-11T05:00:00", updated_at: "2026-10-11T05:05:09", size_bytes: 349927 * 1024, case_id: 9, imaging_study_id: 7, ...o,
});

const onSeleccionar = vi.fn();
const onBorrada = vi.fn();
const onReintentar = vi.fn();

/** La columna con la lista viva: renombrar la cambia, como hace la página. */
function Arnes({ inicial, puedeGestionar = true, error = null }: { inicial: PatientSessionInfo[]; puedeGestionar?: boolean; error?: string | null }) {
  const [sesiones, setSesiones] = useState(inicial);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <ColumnaSesiones
      sesiones={sesiones} error={error} onReintentar={onReintentar} nombrePaciente="Segura, Juan"
      vacio="Este estudio aún no tiene sesiones guardadas."
      seleccionada={sel} onSeleccionar={(sid) => { onSeleccionar(sid); setSel(sid); }}
      puedeGestionar={puedeGestionar}
      onRenombrada={(sid, label) => setSesiones((ss) => ss.map((s) => (s.session_id === sid ? { ...s, label } : s)))}
      onBorrada={(sid) => { onBorrada(sid); setSesiones((ss) => ss.filter((s) => s.session_id !== sid)); }}
    />
  );
}

beforeEach(() => {
  for (const f of [renameSavedSession, deleteSavedSession, onSeleccionar, onBorrada, onReintentar]) f.mockReset();
});

describe("sesiones guardadas (F2-30, F2-73, F2-74)", () => {
  it("cada fila dice paso, fecha y hora local, y tamaño", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} />);
    expect(screen.getByText("Antes de medir")).toBeTruthy();
    expect(screen.getByText(`Paso 3 · Detección · ${fechaHora("2026-10-11T05:05:09")} · 342 MB`)).toBeTruthy();
  });

  // Patients.test › las sesiones guardadas (F1-243).
  it("la hora de la sesión sale en hora local, no la del servidor sin convertir", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1" })]} />);
    // 05:05 UTC son las 00:05 en UTC−5; la expectativa con zona fija está en fecha.test.ts.
    expect(screen.getByText((t) => t.includes(fechaHora("2026-10-11T05:05:09")))).toBeTruthy();
  });

  it("con diámetro medido, la línea lo añade", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Medida", max_diameter_mm: 7.42 })]} />);
    expect(screen.getByText(/· Ø 7,4 mm$/)).toBeTruthy();
  });

  it("la etiqueta no repite el nombre del paciente", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Segura, Juan · Detección" })]} />);
    expect(screen.getByText("Detección", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Segura, Juan · Detección")).toBeNull();
  });

  it("si el nombre ya es el paso, la línea no lo repite", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Segura, Juan · Detección" })]} />);
    expect(screen.getByText(`Paso 3 · ${fechaHora("2026-10-11T05:05:09")} · 342 MB`)).toBeTruthy();
  });

  it("elegir una sesión la marca y lo comunica (abre la vista previa)", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} />);
    const fila = screen.getByRole("button", { name: /^Antes de medir/ });
    expect(fila.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(fila);
    expect(onSeleccionar).toHaveBeenCalledWith("s1");
    expect(fila.getAttribute("aria-pressed")).toBe("true");
  });

  it("sin sesiones dice el vacío que le pasan", () => {
    render(<Arnes inicial={[]} />);
    expect(screen.getByText("Este estudio aún no tiene sesiones guardadas.")).toBeTruthy();
  });

  it("si no cargaron, lo dice y «Reintentar» las vuelve a pedir", () => {
    render(<Arnes inicial={[]} error="caído" />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentar).toHaveBeenCalled();
    expect(screen.queryByText("Este estudio aún no tiene sesiones guardadas.")).toBeNull();
  });
});

describe("renombrar en línea", () => {
  it("se renombra en línea: lápiz, escribir, Intro", async () => {
    renameSavedSession.mockResolvedValue({ session_id: "s1", label: "Con el clip elegido" });
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Renombrar «Antes de medir»" }));
    const campo = screen.getByLabelText("Nombre de la sesión guardada");
    fireEvent.change(campo, { target: { value: "  Con el clip elegido " } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(renameSavedSession).toHaveBeenCalledWith("s1", "Con el clip elegido"));
    expect(await screen.findByText("Con el clip elegido")).toBeTruthy();
    expect(renameSavedSession).toHaveBeenCalledTimes(1);
  });

  it("Escape cancela el nombre sin cerrar nada", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} />);
    const escucha = vi.fn();
    document.addEventListener("keydown", escucha);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Renombrar «Antes de medir»" }));
      const campo = screen.getByLabelText("Nombre de la sesión guardada");
      fireEvent.change(campo, { target: { value: "otro" } });
      fireEvent.keyDown(campo, { key: "Escape" });
      expect(screen.getByText("Antes de medir")).toBeTruthy();
      expect(renameSavedSession).not.toHaveBeenCalled();
      // Ni la hoja ni nada que escuche Esc en el documento se entera.
      expect(escucha).not.toHaveBeenCalled();
      expect(onSeleccionar).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", escucha);
    }
  });

  it("si el servidor rechaza el nombre, el motivo sale bajo la fila", async () => {
    renameSavedSession.mockRejectedValue(new ApiError(403, "Solo quien creó al paciente puede renombrar."));
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Renombrar «Antes de medir»" }));
    const campo = screen.getByLabelText("Nombre de la sesión guardada");
    fireEvent.change(campo, { target: { value: "Nuevo" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    const aviso = await screen.findByText("Solo quien creó al paciente puede renombrar.");
    expect(screen.getByText("Antes de medir").closest("[data-guardada]")?.contains(aviso)).toBe(true);
  });
});

describe("borrar una sesión guardada", () => {
  it("«Borrar» confirma con el nombre y borra", async () => {
    deleteSavedSession.mockResolvedValue(undefined);
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" }), guardada({ session_id: "s2", label: "Otra" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar «Antes de medir»" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Borrar la sesión guardada" });
    expect(dialogo.textContent).toContain("Antes de medir");
    expect(dialogo.textContent).toContain("Se borra la copia guardada y no se puede deshacer. Si la acabas de reanudar, no se podrá borrar hasta que esa sesión abierta caduque sola.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(deleteSavedSession).toHaveBeenCalledWith("s1"));
    expect(onBorrada).toHaveBeenCalledWith("s1");
    await waitFor(() => expect(screen.queryByText("Antes de medir")).toBeNull());
    expect(screen.getByText("Otra")).toBeTruthy();
  });

  it("el 409 del servidor sale literal bajo la fila", async () => {
    const detalle = "Esta sesión guardada es el origen de una sesión abierta: ciérrala antes de borrarla.";
    deleteSavedSession.mockRejectedValue(new ApiError(409, detalle));
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar «Antes de medir»" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Borrar" }));
    const aviso = await screen.findByText(detalle);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Antes de medir").closest("[data-guardada]")?.contains(aviso)).toBe(true);
    expect(onBorrada).not.toHaveBeenCalled();
  });
});

describe("derechos sobre los guardados (spec §6.2)", () => {
  it("una cuenta compartida elige la sesión, pero no ve el lápiz ni «Borrar»", () => {
    render(<Arnes inicial={[guardada({ session_id: "s1", label: "Antes de medir" })]} puedeGestionar={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Antes de medir/ }));
    expect(onSeleccionar).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("button", { name: /Renombrar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Borrar/ })).toBeNull();
  });
});
