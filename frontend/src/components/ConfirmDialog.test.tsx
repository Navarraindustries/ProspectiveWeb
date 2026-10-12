/* El diálogo de confirmación con el teclado (F1-58, F1-60).

   Intro confirmaba también los borrados: un Intro de más, pensado para el
   campo de debajo, borraba un paciente con sus sesiones. Y Escape cerraba a la
   vez el diálogo y la ficha que había debajo, porque los dos escuchaban la
   misma tecla en `document`. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, isConfirmDialogOpen } from "./ConfirmDialog";
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

  /* Intro sobre un botón con foco pulsa ese botón. Antes Intro confirmaba
     siempre: con el foco en «Cancelar» firmaba el pedido o daba «sin
     aneurisma», y sobre el botón de borrar no hacía nada. */
  for (const destructive of [false, true]) {
    it(`Intro con el foco en «Cancelar» cancela (${destructive ? "borrado" : "no destructivo"})`, () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      render(
        <ConfirmDialog open title="¿Firmar el pedido?" destructive={destructive} confirmLabel="Firmar"
                       onCancel={onCancel} onConfirm={onConfirm}>
          cuerpo
        </ConfirmDialog>,
      );
      const cancelar = screen.getByRole("button", { name: "Cancelar" });
      cancelar.focus();
      fireEvent.keyDown(cancelar, { key: "Enter" });
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  }

  it("Intro con el foco en el botón de borrar confirma el borrado", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Eliminar paciente" destructive confirmLabel="Eliminar"
                     onCancel={onCancel} onConfirm={onConfirm}>
        cuerpo
      </ConfirmDialog>,
    );
    const eliminar = screen.getByRole("button", { name: "Eliminar" });
    eliminar.focus();
    fireEvent.keyDown(eliminar, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Intro en el diálogo, fuera de los botones: el borrado no confirma, lo demás sí", () => {
    const borrar = vi.fn();
    const { unmount } = render(
      <ConfirmDialog open title="Eliminar paciente" destructive confirmLabel="Eliminar"
                     onCancel={() => {}} onConfirm={borrar}>
        cuerpo
      </ConfirmDialog>,
    );
    const panel = screen.getByRole("alertdialog");
    expect(panel).toHaveFocus();
    fireEvent.keyDown(panel, { key: "Enter" });
    expect(borrar).not.toHaveBeenCalled();
    unmount();

    const aceptar = vi.fn();
    render(
      <ConfirmDialog open title="¿Seguro?" confirmLabel="Sí" onCancel={() => {}} onConfirm={aceptar}>
        cuerpo
      </ConfirmDialog>,
    );
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Enter" });
    expect(aceptar).toHaveBeenCalledTimes(1);
  });

  it("isConfirmDialogOpen sigue al diálogo abierto", () => {
    const { rerender, unmount } = render(
      <ConfirmDialog open={false} title="t" confirmLabel="Sí" onCancel={() => {}} onConfirm={() => {}}>c</ConfirmDialog>,
    );
    expect(isConfirmDialogOpen()).toBe(false);
    rerender(<ConfirmDialog open title="t" confirmLabel="Sí" onCancel={() => {}} onConfirm={() => {}}>c</ConfirmDialog>);
    expect(isConfirmDialogOpen()).toBe(true);
    unmount();
    expect(isConfirmDialogOpen()).toBe(false);
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

/* F1-110: el aviso de salida solo ofrecía quedarse o perder el trabajo; la
   tercera acción («Guardar y salir») va entre las dos y nunca la dispara un
   Intro suelto. */
describe("ConfirmDialog con tercera acción", () => {
  const montar = (over: { onExtra?: () => void; onConfirm?: () => void; onCancel?: () => void; destructive?: boolean } = {}) => render(
    <ConfirmDialog open title="Tienes cambios sin guardar" destructive={over.destructive ?? true}
                   cancelLabel="Seguir aquí" confirmLabel="Salir sin guardar"
                   extraLabel="Guardar y salir" onExtra={over.onExtra ?? (() => {})}
                   onCancel={over.onCancel ?? (() => {})} onConfirm={over.onConfirm ?? (() => {})}>
      cuerpo
    </ConfirmDialog>,
  );

  it("pinta tres botones, con la tercera acción entre cancelar y confirmar", () => {
    montar();
    const nombres = screen.getAllByRole("button").map((b) => b.textContent);
    expect(nombres).toEqual(["Seguir aquí", "Guardar y salir", "Salir sin guardar"]);
  });

  it("el clic en la tercera llama a onExtra y a nadie más", () => {
    const onExtra = vi.fn(), onConfirm = vi.fn(), onCancel = vi.fn();
    montar({ onExtra, onConfirm, onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" }));
    expect(onExtra).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Intro suelto no dispara la tercera; con el foco en ella, sí", () => {
    const onExtra = vi.fn(), onConfirm = vi.fn();
    montar({ onExtra, onConfirm, destructive: false });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onExtra).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const extra = screen.getByRole("button", { name: "Guardar y salir" });
    extra.focus();
    fireEvent.keyDown(extra, { key: "Enter" });
    expect(onExtra).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("sin extraLabel siguen siendo dos botones", () => {
    render(<ConfirmDialog open title="t" confirmLabel="Sí" onCancel={() => {}} onConfirm={() => {}}>c</ConfirmDialog>);
    expect(screen.getAllByRole("button")).toHaveLength(2);
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
