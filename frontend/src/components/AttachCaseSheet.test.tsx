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
  patient: { id: 7, full_name: "Perez, Ana", hospital_id: "HC-9", dob: "", sex: "", institution: "", study_count: 1, created_at: "" },
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
