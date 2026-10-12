/* El diálogo de confirmación con el teclado (F1-58, F1-60).

   Intro confirmaba también los borrados: un Intro de más, pensado para el
   campo de debajo, borraba un paciente con sus sesiones. Y Escape cerraba a la
   vez el diálogo y la ficha que había debajo, porque los dos escuchaban la
   misma tecla en `document`. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { Sheet } from "./Sheet";

describe("ConfirmDialog con el teclado", () => {
  it("Intro no confirma un borrado", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Eliminar paciente" destructive confirmLabel="Eliminar"
                     onCancel={() => {}} onConfirm={onConfirm}>
        cuerpo
      </ConfirmDialog>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Intro sigue confirmando lo que no destruye nada", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="¿Seguro?" confirmLabel="Sí" onCancel={() => {}} onConfirm={onConfirm}>
        cuerpo
      </ConfirmDialog>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Escape cierra el diálogo y no la ficha que hay debajo", () => {
    const onCloseSheet = vi.fn();
    const onCancel = vi.fn();
    render(
      <Sheet open onClose={onCloseSheet} title="Editar paciente">
        <ConfirmDialog open title="¿Descartar los cambios?" destructive confirmLabel="Descartar"
                       onCancel={onCancel} onConfirm={() => {}}>
          cuerpo
        </ConfirmDialog>
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCloseSheet).not.toHaveBeenCalled();
  });
});

describe("Sheet apilada", () => {
  it("Escape cierra solo la ficha de encima", () => {
    const debajo = vi.fn();
    const encima = vi.fn();
    render(
      <>
        <Sheet open onClose={debajo} title="Editar paciente"><p>ficha</p></Sheet>
        <Sheet open onClose={encima} title="Nuevo caso / estudio"><p>caso</p></Sheet>
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(encima).toHaveBeenCalledTimes(1);
    expect(debajo).not.toHaveBeenCalled();
  });
});
