/* Borrar una anotación, con confirmación (F1-6, F1-7).

   Supr en la fila, «Borrar (Supr)» y Supr sobre el visor la quitaban al
   momento, sin aviso ni deshacer: una regla medida a mano se perdía por un
   roce de tecla, y el guardado automático la borraba también del servidor.
   Las tres rutas pasan por aquí para que pregunten lo mismo.

   Retroceso no pasa por aquí: solo quita el último punto del trazo en curso,
   que se rehace con un clic. */

import { useCallback, useState } from "react";
import { usePlanning } from "../../store/planning";
import { ConfirmDialog, isConfirmDialogOpen } from "../ConfirmDialog";

export function useAnnotationDelete() {
  const { annotations, setAnnotations, selectedAnnotation, setSelectedAnnotation } = usePlanning();
  const [pending, setPending] = useState<string | null>(null);

  // Con una pregunta ya abierta (la del panel o la del visor, que tienen cada
  // uno la suya) no se abre otra encima: un Supr repetido apilaba dos diálogos
  // iguales y un solo Escape los cerraba a la vez.
  const askDelete = useCallback((id: string) => {
    if (isConfirmDialogOpen()) return;
    setPending(id);
  }, []);
  const cancel = useCallback(() => setPending(null), []);
  const confirm = useCallback(() => {
    const gone = pending;
    setPending(null);
    if (!gone) return;
    setAnnotations((list) => list.filter((a) => a.id !== gone));
    if (selectedAnnotation === gone) setSelectedAnnotation(null);
  }, [pending, selectedAnnotation, setAnnotations, setSelectedAnnotation]);

  const target = pending ? annotations.find((a) => a.id === pending) : undefined;

  const deleteDialog = (
    <ConfirmDialog
      open={!!target}
      title="¿Borrar la anotación?"
      confirmLabel="Borrar anotación"
      destructive
      onCancel={cancel}
      onConfirm={confirm}
    >
      «{target?.label ?? ""}» desaparece de los cortes, del 3D y del informe, y no se puede recuperar.
    </ConfirmDialog>
  );

  return { askDelete, deleteDialog };
}
