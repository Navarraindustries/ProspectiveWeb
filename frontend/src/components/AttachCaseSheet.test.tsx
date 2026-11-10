/* «Adjuntar a un caso»: lo que propone, lo que evita y lo que manda. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionIdentity } from "../api/types";

vi.mock("../api/client", () => ({
  api: {
    sessionIdentity: vi.fn(),
    listPatients: vi.fn(),
    patientStudies: vi.fn(),
    attachSession: vi.fn(),
  },
}));

import { api } from "../api/client";
import { AttachCaseSheet } from "./AttachCaseSheet";

const identidad = (over: Partial<SessionIdentity> = {}): SessionIdentity => ({
  suggestion: { surname: "Perez", given_name: "Ana", hospital_id: "HC-9", dob: "1970-01-31", sex: "F" },
  study_date: "2026-09-15", modality: "CT", matches: [], attached: false, ...over,
});

const resultado = {
  patient: { id: 7, full_name: "Perez, Ana", hospital_id: "HC-9", dob: "", sex: "", institution: "", study_count: 1, created_at: "",
             owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
             last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "",
             last_risk_label: null, last_capture_id: null, last_imaging_study_id: null, },
  case_id: 3, case_label: "Aneurisma basilar", imaging_study_id: 11, relinked_confirmations: 1,
};

beforeEach(() => {
  vi.mocked(api.listPatients).mockResolvedValue([]);
  vi.mocked(api.patientStudies).mockResolvedValue([]);
  vi.mocked(api.attachSession).mockReset().mockResolvedValue(resultado);
});

describe("adjuntar a un caso", () => {
  it("la cabecera DICOM solo propone: hay que pulsar para rellenar", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    render(<AttachCaseSheet open onClose={() => {}} sessionId="s1" onAttached={() => {}} />);
    const apellidos = screen.getByLabelText("Apellidos") as HTMLInputElement;
    expect(apellidos.value).toBe("");
    fireEvent.click(await screen.findByText(/Rellenar con la cabecera DICOM/));
    expect(apellidos.value).toBe("Perez");
    expect((screen.getByLabelText("Nº de historia / cédula") as HTMLInputElement).value).toBe("HC-9");
  });

  it("si el nº de historia ya existe, elige ese paciente y avisa del duplicado", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad({
      matches: [{ id: 4, full_name: "Pérez, Ana", hospital_id: "HC-9", dob: "", reason: "hospital_id" }],
    }));
    render(<AttachCaseSheet open onClose={() => {}} sessionId="s1" onAttached={() => {}} />);
    expect(await screen.findByText(/Crear otro lo duplicaría/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo / diagnóstico"), { target: { value: "Control" } });
    fireEvent.click(screen.getByText("Adjuntar y archivar el estudio"));
    await waitFor(() => expect(api.attachSession).toHaveBeenCalledWith("s1", {
      patient_id: 4, new_case: { dx_principal: "Control", study_date: "2026-09-15" },
    }));
  });

  it("paciente y caso nuevos en una sola operación", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    const onAttached = vi.fn();
    render(<AttachCaseSheet open onClose={() => {}} sessionId="s1" onAttached={onAttached} />);
    const boton = () => screen.getByText("Adjuntar y archivar el estudio").closest("button")!;
    expect(boton()).toBeDisabled();             // falta nombre y motivo
    fireEvent.click(await screen.findByText(/Rellenar con la cabecera DICOM/));
    fireEvent.change(screen.getByLabelText("Motivo / diagnóstico"), { target: { value: "Aneurisma basilar" } });
    expect(boton()).toBeEnabled();
    fireEvent.click(boton());
    await waitFor(() => expect(onAttached).toHaveBeenCalledWith(resultado));
    expect(api.attachSession).toHaveBeenCalledWith("s1", {
      new_patient: identidad().suggestion,
      new_case: { dx_principal: "Aneurisma basilar", study_date: "2026-09-15" },
    });
  });

  it("enseña el error del servidor", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    vi.mocked(api.attachSession).mockRejectedValue(new Error("Ya existe un paciente con la historia clínica"));
    render(<AttachCaseSheet open onClose={() => {}} sessionId="s1" onAttached={() => {}} />);
    fireEvent.click(await screen.findByText(/Rellenar con la cabecera DICOM/));
    fireEvent.change(screen.getByLabelText("Motivo / diagnóstico"), { target: { value: "X" } });
    fireEvent.click(screen.getByText("Adjuntar y archivar el estudio"));
    expect(await screen.findByText(/Ya existe un paciente/)).toBeInTheDocument();
  });
});

describe("cerrar con algo escrito", () => {
  it("«Cancelar» pregunta antes; «Seguir editando» conserva lo escrito y no cierra", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    const onClose = vi.fn();
    render(<AttachCaseSheet open onClose={onClose} sessionId="s1" onAttached={() => {}} />);
    await screen.findByText(/Rellenar con la cabecera DICOM/);
    fireEvent.change(screen.getByLabelText("Motivo / diagnóstico"), { target: { value: "Aneurisma basilar" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Motivo / diagnóstico") as HTMLInputElement).value).toBe("Aneurisma basilar");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sin nada escrito cierra sin preguntar", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    const onClose = vi.fn();
    render(<AttachCaseSheet open onClose={onClose} sessionId="s1" onAttached={() => {}} />);
    await screen.findByText(/Rellenar con la cabecera DICOM/);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("lo que no carga y lo que falta", () => {
  it("si falla la lista de pacientes lo dice y «Reintentar» la vuelve a pedir", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    vi.mocked(api.listPatients).mockReset().mockRejectedValueOnce(new Error("caído")).mockResolvedValue([]);
    render(<AttachCaseSheet open onClose={() => {}} sessionId="s1" onAttached={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la lista de pacientes");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(api.listPatients).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("«Adjuntar» apagado dice qué falta, y deja de decirlo al completarlo", async () => {
    vi.mocked(api.sessionIdentity).mockResolvedValue(identidad());
    render(<AttachCaseSheet open onClose={() => {}} sessionId="s1" onAttached={() => {}} />);
    expect(screen.getByText(
      "Para adjuntar: elige un paciente o escribe sus apellidos o nombres; elige un caso o escribe el motivo del caso nuevo",
    )).toBeInTheDocument();
    fireEvent.click(await screen.findByText(/Rellenar con la cabecera DICOM/));
    expect(screen.getByText("Para adjuntar: elige un caso o escribe el motivo del caso nuevo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo / diagnóstico"), { target: { value: "X" } });
    expect(screen.queryByText(/^Para adjuntar:/)).toBeNull();
  });
});
