/* «¿Descartar los cambios?» — la misma pregunta en todos los formularios
   (F1-60, F1-71, F1-81).

   La ficha del paciente y el formulario del caso se cerraban con «Cancelar»,
   el ✕, Escape o un clic fuera, y lo escrito se perdía sin aviso. Quien llama
   decide si hay cambios; sin cambios cierra sin preguntar. */

import { ConfirmDialog } from "./ConfirmDialog";

export function DiscardChanges({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="¿Descartar los cambios?"
      cancelLabel="Seguir editando"
      confirmLabel="Descartar cambios"
      destructive
      onCancel={onKeep}
      onConfirm={onDiscard}
    >
      Lo que has escrito no se ha guardado. Si cierras ahora, se pierde.
    </ConfirmDialog>
  );
}
