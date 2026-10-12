/* Aviso «Tienes cambios sin guardar» al salir del espacio de trabajo.

   Solo ofrecía «Seguir aquí» o «Salir sin guardar»: para no perder la tarde
   había que cerrar el aviso, buscar «Guardar progreso» y volver a pulsar el
   enlace (F1-110). «Guardar y salir» usa el mismo guardado que ese botón (lo
   presta Workspace al store) y solo navega si salió bien; si falla, el aviso
   se queda abierto y lo dice dentro, porque detrás no se ve la barra. */

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ARCHIVAR_EN_CASO } from "../lib/textos";

const ERROR_GUARDAR = "No se pudo guardar el progreso. Vuelve a intentarlo o sal sin guardar.";

export function UnsavedExitDialog({ open, hasPatient, attached, onStay, onLeave, saveNow }: {
  open: boolean;
  /** Con paciente fijado el botón que ata la sesión se llama «Archivar en un caso». */
  hasPatient: boolean;
  /** La sesión ya tiene estudio archivado en un caso. */
  attached: boolean;
  onStay: () => void;
  onLeave: () => void;
  saveNow: () => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cada apertura es un intento nuevo. Un guardado que termina con el aviso
  // ya cerrado (el blocker se resolvió por otro lado) es de un aviso que ya
  // no existe: ni navega con el blocker viejo ni deja su error para la
  // próxima vez que se abra.
  const turno = useRef(0);
  useEffect(() => {
    turno.current += 1;
    setError(null);
    setSaving(false);
  }, [open]);
  const cerrar = (f: () => void) => () => { setError(null); f(); };
  const guardarYSalir = async () => {
    const mio = turno.current;
    setSaving(true);
    setError(null);
    let ok = false;
    try { ok = await saveNow(); } catch { ok = false; }
    if (mio !== turno.current) return;
    setSaving(false);
    if (ok) onLeave();
    else setError(ERROR_GUARDAR);
  };
  // El mismo nombre que el botón de la barra superior (F1-107).
  const botonCaso = hasPatient ? ARCHIVAR_EN_CASO : "Adjuntar a un caso";
  return (
    <ConfirmDialog
      open={open}
      title="Tienes cambios sin guardar"
      destructive
      busy={saving}
      cancelLabel="Seguir aquí"
      extraLabel={saving ? "Guardando…" : "Guardar y salir"}
      onExtra={() => void guardarYSalir()}
      confirmLabel="Salir sin guardar"
      // Mientras guarda, Escape y el clic fuera no cancelan: el guardado ya
      // está en marcha y al terminar saldría igual con el blocker de antes.
      onCancel={saving ? () => {} : cerrar(onStay)}
      onConfirm={cerrar(onLeave)}
    >
      Esta sesión tiene resultados que no se han guardado. Si sales ahora se
      perderán: usa <b style={{ color: "var(--foreground)" }}>Guardar progreso</b> en
      la barra superior para poder reanudarla después.
      {!attached && (hasPatient ? (
        <> Además no está archivada en ningún caso: con <b style={{ color: "var(--foreground)" }}>{botonCaso}</b> su
        DICOM queda en un caso de este paciente.</>
      ) : (
        <> Además no está adjunta a ningún caso: con <b style={{ color: "var(--foreground)" }}>{botonCaso}</b> queda
        ligada a un paciente y su DICOM archivado.</>
      ))}
      {error && <div role="alert" style={{ marginTop: 10, color: "var(--destructive)", fontWeight: 600 }}>{error}</div>}
    </ConfirmDialog>
  );
}
